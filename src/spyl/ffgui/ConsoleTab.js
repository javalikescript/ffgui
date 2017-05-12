define('spyl/ffgui/ConsoleTab', [
  'jls/lang/Class',
  'jls/lang/Exception',
  'jls/lang/Logger',
  'jls/lang/System',
  'jls/lang/Thread',
  'jls/lang/ProcessBuilder',
  'jls/lang/ByteBuffer',
  'jls/lang/CharBuffer',
  'jls/io/File',
  'jls/io/InputStreamReader',
  'jls/io/Pipe',
  'jls/gui/Panel',
  'jls/gui/Label',
  'jls/gui/Button',
  'jls/gui/Edit',
  'jls/gui/TextArea',
  'spyl/ffgui/Config'
], function (
  Class,
  Exception,
  Logger,
  System,
  Thread,
  ProcessBuilder,
  ByteBuffer,
  CharBuffer,
  File,
  InputStreamReader,
  Pipe,
  Panel,
  Label,
  Button,
  Edit,
  TextArea,
  Config
) {

    var ConsoleTab = Class.create({
        initialize : function(parent) {
            this._parent = parent;
            this.createPane();
            this._pipe = new Pipe();
            this._process = null;
            this._commands = null;
            this._callback = null;
            this._context = null;
            this._stdoutThread = null;
        },
        createPane : function() {
            this._panel = new Panel({attributes: {title: 'Console', layout: 'jls/gui/BorderLayout'}, style: {splitSize: 5}}, this._parent);
            this._topPanel = new Panel({style: {height: (parseInt(Config.DEFAULT_HEIGHT, 10) + Config.GAP_SIZE * 2), region: 'top', textAlign: 'left', verticalAlign: 'middle', verticalPosition: 'middle', hGap: Config.GAP_SIZE, vGap: Config.GAP_SIZE}}, this._panel);
            //this._label = new Edit({attributes: {text: '', readonly: true}, style: {width: '1w', height: Config.DEFAULT_HEIGHT, border: 1}}, this._topPanel);
            this._label = new Label({attributes: {text: ''}, style: {width: '1w', height: Config.DEFAULT_HEIGHT}}, this._topPanel);
            this._consoleTA = new TextArea({attributes: {readonly: true}, style: {fontFamily: 'Courier New', fontSize: 14, border: 1, overflow: 'scroll', region: 'center'}}, this._panel);
        },
        startConsoleThread : function() {
            if (this._stdoutThread != null) {
                return;
            }
            var input = new InputStreamReader(this._pipe.sink());
            var consoleTA = this._consoleTA;
            this._stdoutThread = new Thread();
            this._stdoutThread.ended = false;
            this._stdoutThread.run = function() {
                var buffer = CharBuffer.allocate(ConsoleTab.BUFFER_SIZE);
                var needLastLineDeletion = false;
                for (;;) {
                    buffer.clear();
                    input.readCharBuffer(buffer);
                    if (this.ended) {
                        break;
                    }
                    var s = buffer.flip().getString();
                    var lines = s.split('\r');
                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i];
                        if (needLastLineDeletion) {
                            consoleTA.replaceLastLine('');
                            needLastLineDeletion = false;
                        }
                        //var len = line.length;
                        if (line.charAt(0) == '\n') {
                            consoleTA.appendText('\r' + line);
                        } else {
                            if (i == 0) {
                                consoleTA.appendText(line);
                            } else {
                                if (line.length == 0) {
                                    needLastLineDeletion = true;
                                } else {
                                    consoleTA.replaceLastLine(line);
                                }
                            }
                        }
                    }
                }
                Logger.getInstance().debug('ConsoleTab._stdoutThread.run ended');
            };
            this._stdoutThread.start(this._stdoutThread);
        },
        stopConsoleThread : function() {
            if (this._stdoutThread == null) {
                return;
            }
            Logger.getInstance().debug('ConsoleTab.stopConsoleThread()');
            this._stdoutThread.ended = true;
            var buffer = ByteBuffer.allocate(ConsoleTab.BUFFER_SIZE + 20);
            while (buffer.position() < ConsoleTab.BUFFER_SIZE) {
                buffer.putString('          ');
            }
            buffer.flip();
            this._pipe.source().write(buffer);
            this._stdoutThread.join();
            this._stdoutThread = null;
        },
        shutdown : function() {
            Logger.getInstance().debug('ConsoleTab.shutdown()');
            this.stopConsoleThread();
        },
        run : function(commands, callback, context) {
            if (this._commands != null) {
                throw 'already running';
            }
            this._callback = callback || null;
            this._context = context || this;
            this._consoleTA.setAttribute('text', '');
            this._commands = commands;
            this.onCommandTerminated(0);
        },
        onRunTerminated : function(success) {
            this._commands = null;
            var callback = this._callback;
            var context = this._context;
            this._callback = null;
            this._context = null;
            this._label.setAttribute('text', success ? 'Completed' : 'Failed');
            if (callback) {
                callback.call(context, success);
            }
        },
        stop : function() {
            this.onRunTerminated(false);
            if (this._process == null) {
                return;
            }
            this._process.destroy();
            this._process = null;
        },
        onCommandTerminated : function(exitCode) {
            if (exitCode != 0) {
                this.onRunTerminated(false);
                return;
            }
            if (this._commands.length == 0) {
                this.onRunTerminated(true);
                return;
            }
            var command = this._commands.shift();
            if ('name' in command) {
                this._label.setAttribute('text', command.name);
            }
            if ('line' in command) {
                this.startCommand(command.line, command.showStandardError);
            }
        },
        startCommand : function(line, redirectError) {
            Logger.getInstance().info('start(' + line.join(' ') + ')');
            var pb = new ProcessBuilder(line);
            this.startConsoleThread();
            if (typeof redirectError == 'boolean') {
                pb.setStdioRedirect(this._pipe.source(), redirectError ? ProcessBuilder.StandardError : ProcessBuilder.StandardOutput);
            }
            this._process = pb.start();
            this._process.registerExitCallback(this.onCommandTerminated.bind(this));
        }
    });

    Object.extend(ConsoleTab,
            {
        BUFFER_SIZE: 256
            });

    return ConsoleTab;
});
