define('spyl/ffgui/Config', [
  'jls/lang/Class',
  'jls/lang/Exception',
  'jls/lang/System',
  'jls/lang/Logger',
  'jls/lang/CharBuffer',
  'jls/io/File',
  'jls/io/FileInputStream',
  'jls/io/FileOutputStream',
  'jls/io/InputStreamReader',
  'jls/io/OutputStreamWriter',
  'jls/util/StringCodec',
  'jls/security/MessageDigest'
], function (
  Class,
  Exception,
  System,
  Logger,
  CharBuffer,
  File,
  FileInputStream,
  FileOutputStream,
  InputStreamReader,
  OutputStreamWriter,
  StringCodec,
  MessageDigest
) {

    var Config = Class.create({
        initialize : function(configFilename) {
            this._config = null;
            this._configFilename = configFilename;
            this._configChanged = false;
            var tmpdir = new File(System.getProperty('jls.io.tmpdir', '.'));
            //System.out.println('tmpdir is "' + tmpdir.getPath() + '"');
            this._tmpFile = new File(tmpdir, 'ffgui.tmp');
            if (! this._tmpFile.isDirectory()) {
                this._tmpFile.mkdir();
            }
        },
        load : function(defaultConfig) {
            this._configChanged = false;
            this._config = null;
            var configFile = new File(this._configFilename);
            if (! (configFile.isFile() && (configFile.length() > 0))) {
                // default configuration
                this._config = defaultConfig || {};
                this._configChanged = true;
                return;
            }
            this._config = Config.loadJSON(configFile);
            return this.get();
        },
        markAsChanged : function() {
            this._configChanged = true;
        },
        save : function(force) {
            if (! (this._configChanged || force)) {
                Logger.getInstance().debug('nothing to save');
                return;
            }
            var configFile = new File(this._configFilename);
            Config.saveJSON(configFile, this._config);
            this._configChanged = false;
            Logger.getInstance().debug('configuration saved');
        },
        getSourceId : function(file) {
            return Config.getSourceId(file);
        },
        get : function() {
            return this._config;
        },
        getTempFile : function() {
            return this._tmpFile;
        },
        cleanTempDir : function() {
            Config.cleanDir(this._tmpFile);
        },
        createTempFile : function(name) {
            return new File(this._tmpFile, name);
        },
        createTempFilename : function(name) {
            return this.createTempFile(name).getPath();
        }
    });

    Object.extend(Config, {
        loadAsString: function(file) {
            if ((! file.exists()) || (file.length() > 20480)) {
                return '';
            }
            var buffer = CharBuffer.allocate(file.length() + 1);
            var input = new InputStreamReader(new FileInputStream(file), 'UTF-8');
            try {
                input.readCharBuffer(buffer);
                return buffer.flip().getString();
            } finally {
                input.close();
            }
        },
        loadJSON: function(file) {
            var s = Config.loadAsString(file);
            if ((s.length == 0) || (s.indexOf('{') != 0)) {
                return null;
            }
            return eval('(' + s + ')');
        },
        saveJSON: function(file, object) {
            var s = Object.toJSON(object);
            var output = new OutputStreamWriter(new FileOutputStream(file), 'UTF-8');
            try {
                output.write(s);
            } finally {
                output.close();
            }
        },
        getSourceId : function(file) {
            var hash = Config.hashString(file.getPath());
            id = hash.toString(36) + '-' + Math.floor(file.lastModified() / 1000).toString(36) + '-' + file.length().toString(36);
            return id;
        },
        cleanDir: function(dir) {
            var files = dir.listFiles();
            for (var i = 0; i < files.length; i++) {
                var file = files[i];
                if (file.isDirectory()) {
                    Config.cleanDir(file);
                }
                //Logger.getInstance().debug('cleanDir() ' + file.getPath());
                file.remove();
            }
        },
        hashString: function(value) {
            var hash = 0;
            for (var i = 0; i < value.length; i++) {
                hash = ((hash << 5) - hash) + value.charCodeAt(i);
                hash |= 0; // Convert to 32bit integer
            }
            return Math.abs(hash);
        },
        sha1: function(value) {
            var md = MessageDigest.getInstance('SHA1');
            md.updateString(value, 'UTF-8');
            var buffer = md.digest();
            return StringCodec.hexEncode(buffer);
        },
        MINIATURE_SIZE: 144, // 144 108 96
        PART_SIZE: 48,
        DEFAULT_GAP: 3,
        DEFAULT_HEIGHT: '22px',
        DEFAULT_HEIGHT_LARGE: '44px',
        DEFAULT_WIDTH: '33px',
        DEFAULT_LABEL_WIDTH: '160px'
    });

    return Config;
});
