define('spyl/ffgui/Source', [
  'jls/lang/Class',
  'jls/lang/Exception',
  'jls/lang/Logger',
  'jls/io/File',
  'spyl/ffgui/Config',
  'spyl/ffgui/FFmpeg'
], function (
  Class,
  Exception,
  Logger,
  File,
  Config,
  FFmpeg
) {

    var Source = Class.create({
        initialize : function(ffgui, id, file) {
            this._ffgui = ffgui;
            this._id = id;
            this._file = file;
            this._previewFilename = null;
            this._tmpFile = this._ffgui._config.createTempFile(this._id);
            this._pr = null;
            this._dar = 0;
            this._duration = 0;
            this._startTime = 0;
            this._width = 0;
            this._height = 0;
        },
        prepare : function() {
            if (! this._tmpFile.isDirectory()) {
                if (! this._tmpFile.mkdir()) {
                    throw 'cannot create source directory "' + this._tmpFile.getPath() + '"';
                }
            }
            this._pr = this._ffgui.getFFmpeg().probe(this._file.getPath());
            this._duration = Math.floor(parseFloat(this._pr.duration) * 1000);
            if ('start_time' in this._pr) {
                this._startTime = Math.floor(parseFloat(this._pr.start_time) * 1000);
            }
            if (! ('video' in this._pr.streamByCodecType)) {
                throw 'No video stream';
            }
            if (this._pr.streamByCodecType.video.length != 1) {
                throw 'Too much video stream';
            }
            var videoStream = this._pr.streamByCodecType.video[0];
            this._width = parseInt(videoStream.width, 10);
            this._height = parseInt(videoStream.height, 10);
            this._dar = FFmpeg.getAspectRatio(videoStream.display_aspect_ratio, videoStream.width, videoStream.height);

            this._previewHeight = Config.MINIATURE_SIZE;
            this._previewWidth = Math.floor(this._previewHeight * this._dar);
            this._previewFile = this.getFrameFile(1000);
        },
        createPreview : function() {
            if (! this._previewFile.exists()) {
                this.extractFrame(1000, this.onPreview, this);
            } else {
                this.onPreview(0);
            }
        },
        getDuration : function() {
            return this._duration;
        },
        getStartTime : function() {
            return this._startTime;
        },
        getDar : function() {
            return this._dar;
        },
        getWidth : function() {
            return this._width;
        },
        getHeight : function() {
            return this._height;
        },
        getFrameFile : function(at) {
            return new File(this._tmpFile, 'preview' + Math.floor(at / 100) + '.bmp');
        },
        extractFrame : function(at, callbackFn, context) {
            if (typeof context == 'undefined') {
                context = this;
            }
            var file = this.getFrameFile(at);
            if (file.exists() && (file.length() > 0)) {
                callbackFn.call(context);
                return;
            }
            this._ffgui.getFFmpeg().execute(['-ss', FFmpeg.formatTime(at),
                                             '-i', this._file.getPath(),
                                             //'-ss', '0',
                                             '-f', 'rawvideo', '-vcodec', 'bmp', '-vframes', '1', '-an',
                                             '-s', this._previewWidth + 'x' + this._previewHeight,
                                             '-y', file.getPath()], function(exitCode) {
                if ((exitCode == 0) && (file.length() > 0)) {
                    callbackFn.call(context);
                } else {
                    file.remove();
                }
            });
        },
        getId : function() {
            return this._id;
        },
        getFile : function() {
            return this._file;
        },
        getPreviewFile : function() {
            return this._previewFile;
        },
        getProbeResult : function() {
            return this._pr;
        },
        onPreview : function(event) {
            Logger.getInstance().debug('onPreview() ' + this._id);
            this._ffgui.updateSource(this._id, 'preview');
        }
    });

    return Source;
});
