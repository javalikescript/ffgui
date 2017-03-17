define('spyl/ffgui/FFmpeg', [
  'jls/lang/Class',
  'jls/lang/Exception',
  'jls/lang/System',
  'jls/lang/Logger',
  'jls/lang/Thread',
  'jls/lang/ProcessBuilder',
  'jls/lang/ByteBuffer',
  'jls/lang/CharBuffer',
  'jls/lang/Promise',
  'jls/io/File',
  'jls/io/FileInputStream',
  'jls/io/InputStreamReader',
  'jls/io/FileOutputStream',
  'jls/io/OutputStreamWriter',
  'jls/io/BufferedReader',
  'jls/io/BufferChannel',
  'jls/io/Pipe',
  'jls/util/Formatter',
  'spyl/ffgui/ProcessPool'
], function (
  Class,
  Exception,
  System,
  Logger,
  Thread,
  ProcessBuilder,
  ByteBuffer,
  CharBuffer,
  Promise,
  File,
  FileInputStream,
  InputStreamReader,
  FileOutputStream,
  OutputStreamWriter,
  BufferedReader,
  BufferChannel,
  Pipe,
  Formatter,
  ProcessPool
) {

    var FFmpeg;
    /*
    See http://www.transcoding.org/transcode?Aspect_Ratio
    There are two types of aspect ratios involved in video editing.
    One is display aspect ratio or DAR; this is the ratio most commonly referred to by the term "aspect ratio",
    and is the ratio of the video frame's physical (displayed) width to its height,
    regardless of the number of pixels used to represent the video image.
    Typical DAR values are 4:3 for standard-definition video or 16:9 for widescreen television.
    
    The other type of aspect ratio is pixel aspect ratio, or PAR (also known as "sample aspect ratio" or SAR).
    This is the ratio of the width to the height of a single pixel in the video image;
    a PAR of 1:1 means that each pixel is a perfect square,
    while a PAR of 2:1 would mean that each pixel is a rectangle twice as wide as it is tall.
    PAR can be used to refer either to the pixels in a video file, or to the pixels on a physical display device such as a television.
    
    These two aspect ratios are related to each other and the number of pixels in the video frame (or display device) as follows:
    
        DAR   width
        --- = ------
        PAR   height
     */
    /*
    A few multimedia containers (MPEG-1, MPEG-2 PS, DV) allow to join video files by merely concatenating them. 
    
    Hence you may concatenate your multimedia files by first transcoding them to these privileged formats, then using the humble cat command (or the equally humble copy under Windows), and finally transcoding back to your format of choice. 
    
    ffmpeg -i input1.avi -sameq intermediate1.mpg
    ffmpeg -i input2.avi -sameq intermediate2.mpg
    cat intermediate1.mpg intermediate2.mpg > intermediate_all.mpg
    ffmpeg -i intermediate_all.mpg -sameq output.avi
    
    Notice that you should either use -sameq or set a reasonably high bitrate for your intermediate and output files, if you want to preserve video quality. 
     */
    /*
    Similarly, the yuv4mpegpipe format, and the raw video, raw audio codecs also allow concatenation, and the transcoding step is almost lossless. When using multiple yuv4mpegpipe(s), the first line needs to be discarded from all but the first stream. This can be accomplished by piping through tail as seen below. Note that when piping through tail you must use command grouping, { ;}, to background properly.
    For example, let's say we want to join two FLV files into an output.flv file:
    
    mkfifo temp1.a
    mkfifo temp1.v
    mkfifo temp2.a
    mkfifo temp2.v
    mkfifo all.a
    mkfifo all.v
    ffmpeg -i input1.flv -vn -f u16le -acodec pcm_s16le -ac 2 -ar 44100 - > temp1.a < /dev/null &
    ffmpeg -i input2.flv -vn -f u16le -acodec pcm_s16le -ac 2 -ar 44100 - > temp2.a < /dev/null &
    ffmpeg -i input1.flv -an -f yuv4mpegpipe - > temp1.v < /dev/null &
    { ffmpeg -i input2.flv -an -f yuv4mpegpipe - < /dev/null | tail -n +2 > temp2.v ; } &
    cat temp1.a temp2.a > all.a &
    cat temp1.v temp2.v > all.v &
    ffmpeg -f u16le -acodec pcm_s16le -ac 2 -ar 44100 -i all.a \
           -f yuv4mpegpipe -i all.v \
           -sameq -y output.flv
    rm temp[12].[av] all.[av]
     */

    FFmpeg = Class.create({
        initialize : function(home) {
            this._home = home;
            this._ffmpeg = FFmpeg.getFileName(this._home, 'ffmpeg.exe');
            this._ffprobe = FFmpeg.getFileName(this._home, 'ffprobe.exe');
            this._ffplay = FFmpeg.getFileName(this._home, 'ffplay.exe');
            this._pool = new ProcessPool(2);
        },
        shutdown : function() {
            this._pool.shutdown();
        },
        getHome : function() {
            return this._home;
        },
        extractCodecs : function() {
            var pargs = [this._ffmpeg, '-codecs'];
            var pb = new ProcessBuilder(pargs);
            var pipe = new Pipe();
            pb.setStdioRedirect(pipe.source(), ProcessBuilder.StandardOutput);
            var process = pb.start();
            process.registerExitCallback(function() {
                //Logger.getInstance().warn('onExit');
                var buffer = ByteBuffer.fromString(BufferedReader.separator + BufferedReader.separator);
                pipe.source().write(buffer);
            });
            var input = new InputStreamReader(pipe.sink(), FFmpeg.charset);
            var reader = new BufferedReader(input);
            var codecs = {
                    audio: {
                        decoder: {},
                        encoder: {}
                    },
                    video: {
                        decoder: {},
                        encoder: {}
                    }
            };
            /*
            Codecs:
             D..... = Decoding supported
             .E.... = Encoding supported
             ..V... = Video codec
             ..A... = Audio codec
             ..S... = Subtitle codec
             ...I.. = Intra frame-only codec
             ....L. = Lossy compression
             .....S = Lossless compression
             -------
             */
            var lineNumber = 0;
            for (;;) {
                var line = reader.readLine();
                lineNumber++;
                //Logger.getInstance().warn('line: ' + lineNumber + ' ' + line);
                if ((line == null) || (line.length == 0)) {
                    break;
                }
                if (lineNumber <= 10) {
                    continue;
                }
                var codecParts = line.match(/ ([D\.][E\.][VASD\.][I\.][L\.][S\.]) ([^ ]+) +(.*)/);
                if ((codecParts == null) || (codecParts.length != 4)) {
                    throw new Exception('Invalid line "' + line + '"');
                }
                var cap = codecParts[1];
                var type;
                if (cap.charAt(2) == 'A') {
                    type = 'audio';
                } else if (cap.charAt(2) == 'V') {
                    type = 'video';
                } else {
                    continue; // skip
                }
                var name = codecParts[2];
                var description = codecParts[3];
                if (cap.charAt(0) == 'D') {
                    codecs[type].decoder[name] = description;
                }
                if (cap.charAt(1) == 'E') {
                    codecs[type].encoder[name] = description;
                }
            }
            return codecs;
        },
        extractFormats : function() {
            var pargs = [this._ffmpeg, '-formats'];
            var pb = new ProcessBuilder(pargs);
            var pipe = new Pipe();
            pb.setStdioRedirect(pipe.source(), ProcessBuilder.StandardOutput);
            var process = pb.start();
            process.registerExitCallback(function() {
                //Logger.getInstance().warn('onExit');
                var buffer = ByteBuffer.fromString(BufferedReader.separator + BufferedReader.separator);
                pipe.source().write(buffer);
            });
            var input = new InputStreamReader(pipe.sink(), FFmpeg.charset);
            var reader = new BufferedReader(input);
            var formats = {
                    decoder: {},
                    encoder: {}
            };
            /*
    		File formats:
    		 D. = Demuxing supported
    		 .E = Muxing supported
    		 --
             */
            var lineNumber = 0;
            for (;;) {
                var line = reader.readLine();
                lineNumber++;
                //Logger.getInstance().warn('line: ' + lineNumber + ' ' + line);
                if ((line == null) || (line.length == 0)) {
                    break;
                }
                if (lineNumber <= 4) {
                    continue;
                }
                var formatParts = line.match(/ ([D ][E ]) ([^ ]+) +(.*)/);
                if ((formatParts == null) || (formatParts.length != 4)) {
                    throw new Exception('Invalid line "' + line + '"');
                }
                var cap = formatParts[1];
                var name = formatParts[2];
                var description = formatParts[3];
                if (cap.charAt(0) == 'D') {
                    formats.decoder[name] = description;
                }
                if (cap.charAt(1) == 'E') {
                    formats.encoder[name] = description;
                }
            }
            return formats;
        },
        probe : function(filename) {
            // -pretty -show_format -show_streams
            var pargs = [this._ffprobe, '-show_format', '-show_streams', filename];
            var pb = new ProcessBuilder(pargs);
            var pipe = new Pipe();
            pb.setStdioRedirect(pipe.source(), ProcessBuilder.StandardOutput);
            var process = pb.start();
            process.registerExitCallback(function() {
                //Logger.getInstance().warn('onExit');
                var buffer = ByteBuffer.fromString(BufferedReader.separator + BufferedReader.separator);
                pipe.source().write(buffer);
            });
            var input = new InputStreamReader(pipe.sink(), FFmpeg.charset);
            var reader = new BufferedReader(input);
            var pr = {
                    streams: []
            };
            var scope = null;
            for (;;) {
                var line = reader.readLine();
                //Logger.getInstance().debug('-->' + line + '<--');
                if (line.indexOf('[') == 0) {
                    var block = line.match(/\[(\/?)(.*)\]/);
                    if ((block == null) || (block.length != 3)) {
                        throw new Exception('Invalid line "' + line + '"');
                    }
                    //Logger.getInstance().debug('block: [' + block.join(', ') + ']');
                    if (block[2] == 'STREAM') {
                        if (block[1] == '/') {
                            scope = null;
                        } else {
                            pr.streams.push({});
                            scope = pr.streams[pr.streams.length - 1];
                        }
                    } else if (block[2] == 'FORMAT') {
                        if (block[1] == '/') {
                            break;
                        }
                        scope = pr;
                    } else {
                        throw new Exception('Invalid section name "' + block[2] + '"');
                    }
                } else {
                    var keyValue = line.match(/([a-zA-Z0-9\-_]+)=(.*)/);
                    if ((keyValue == null) || (keyValue.length != 3)) {
                        throw new Exception('Invalid line "' + line + '"');
                        break;
                    }
                    //Logger.getInstance().debug('keyValue: [' + keyValue.join(', ') + ']');
                    scope[keyValue[1]] = keyValue[2];
                }
            }
            pr.streamByCodecType = {};
            for (var i = 0; i < pr.streams.length; i++) {
                var stream = pr.streams[i];
                if (! ('codec_type' in stream)) {
                    continue;
                }
                var codecType = stream['codec_type'];
                if (! (codecType in pr.streamByCodecType)) {
                    pr.streamByCodecType[codecType] = [];
                }
                pr.streamByCodecType[codecType].push(stream);
            }
            return pr;
        },
        play : function(filename, options) {
            var args = [this._ffplay];
            if (options) {
                args = args.concat(options);
            }
            args.push(filename);
            Logger.getInstance().info('play(): ' + args.join(' '));
            var pb = new ProcessBuilder(args);
            var process = pb.start();
            process.detach();
        },
        playWithInfo : function(filename) {
            var fontFilename = 'SourceSansPro-Regular.ttf';
            var fontSize = 48;
            // frame %{n}
            var text = '%{pts}s';
            // setpts=PTS-STARTPTS, drawtext...
            this.play(filename, ['-vf', 'drawtext=fontfile=' + fontFilename +
                                 ': fontcolor=white: boxcolor=black@0.5: x=5: y=5: fontsize=' +
                                 fontSize + ': box=1: expansion=normal: text=' + text]);
        },
        execute : function(args, callback, context) {
            Logger.getInstance().info('execute(): ' + args.join(' '));
            this._pool.execute([this._ffmpeg].concat(args || []), callback, context);
        },
        computeArguments : function(destFilename, destOptions, srcFilename, srcOptions, globalOptions) {
            var args = [this._ffmpeg, '-hide_banner'];
            if (globalOptions) {
                Array.prototype.push.apply(args, globalOptions);
            }
            if (srcOptions) {
                Array.prototype.push.apply(args, srcOptions);
            }
            if (srcFilename) {
                args.push('-i', srcFilename);
            }
            if (destOptions) {
                Array.prototype.push.apply(args, destOptions);
            }
            if (destFilename) {
                args.push('-y', destFilename);
            }
            return args;
        }
    });

    var parseIntOr0 = function(s) {
        var i = parseInt(s, 10);
        if (isNaN(i)) {
            return 0;
        }
        return i;
    }

    Object.extend(FFmpeg, {
        charset : 'ASCII', // Should be Cp850 or UTF-8 ?
        computeAspectRatio : function(width, height) {
            if (typeof width == 'string') {
                width = parseInt(width, 10);
            }
            if (typeof height == 'string') {
                height = parseInt(height, 10);
            }
            return width / height;
        },
        parseAspectRatio : function(value) {
            var ar;
            if (value.indexOf(':') > 0) {
                var operands = value.split(':');
                if (operands.length != 2) {
                    return Number.NaN;
                }
                ar = parseInt(operands[0], 10) / parseInt(operands[1], 10);
            } else {
                ar = parseFloat(value);
            }
            return ar;
        },
        formatTime : function(value, showMs) {
            var v, h, m, s, ms;
            if (typeof value === 'string') {
                v = parseInt(value, 10);
            } else if (typeof value === 'number') {
                v = Math.floor(value);
            } else {
                v = 0;
            }
            ms = v % 1000;
            v = Math.floor(v / 1000);
            h = Math.floor(v / 3600);
            m = Math.floor((v % 3600) / 60);
            s = v % 60;
            var format = (showMs || (ms > 0)) ? '%02d:%02d:%02d.%03d' : '%02d:%02d:%02d';
            return Formatter.format(format, h, m, s, ms);
        },
        parseTime : function(value) {
            var parts, ms = 0;
            if ((typeof value != 'string') || (value.match(/[^:\.[0-9]]/))) {
                return ms;
            }
            parts = value.split('.');
            if (parts.length == 2) {
                value = parts[0];
                ms += parseIntOr0((parts[1] + '000').substr(0, 3), 10);
            }
            var parts = value.split(':');
            parts.reverse();
            if (parts.length > 0) {
                ms += parseIntOr0(parts[0], 10) * 1000;
            }
            if (parts.length > 1) {
                ms += parseIntOr0(parts[1], 10) * 60000;
            }
            if (parts.length > 2) {
                ms += parseIntOr0(parts[2], 10) * 3600000;
            }
            return ms;
        },
        getAspectRatio : function(value, width, height) {
            var ar = FFmpeg.parseAspectRatio(value);
            if (ar == 0) {
                ar = FFmpeg.computeAspectRatio(width, height);
            }
            return ar;
        },
        getFileName : function(dir, filename) {
            var file = new File(dir, filename);
            if (! file.isFile()) {
                throw new Exception('Cannot found "' + file.getPath() + '"');
            }
            return file.getPath();
        }
    });

    return FFmpeg;
});
