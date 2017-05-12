define('spyl/ffgui/DestinationTab', [
  'jls/lang/Class',
  'jls/lang/Exception',
  'jls/lang/System',
  'jls/lang/Logger',
  'jls/io/File',
  'jls/gui/Panel',
  'jls/gui/Label',
  'jls/gui/Button',
  'jls/gui/Edit',
  'jls/gui/CheckBox',
  'jls/gui/ComboBox',
  'jls/gui/CommonDialog',
  'spyl/ffgui/Config'
], function (
  Class,
  Exception,
  System,
  Logger,
  File,
  Panel,
  Label,
  Button,
  Edit,
  CheckBox,
  ComboBox,
  CommonDialog,
  Config
) {

    var DestinationTab = Class.create({
        initialize : function(ffgui, parent) {
            this._ffgui = ffgui;
            this._parent = parent;
            this._panel = null;
            this.createPane();
        },
        createPane : function() {
            this._panel = new Panel({attributes: {title: 'Destination', layout: 'jls/gui/BorderLayout'}, style: {splitSize: 5}}, this._parent);
            var topPanel = new Panel({style: {height: (parseInt(Config.DEFAULT_HEIGHT_LARGE, 10) + Config.GAP_SIZE * 2), region: 'top', hGap: Config.GAP_SIZE, vGap: Config.GAP_SIZE}}, this._panel);
            var centerPanel = new Panel({style: {region: 'center', hGap: Config.GAP_SIZE, vGap: Config.GAP_SIZE}}, this._panel);
            var bottomPanel = new Panel({style: {height: (parseInt(Config.DEFAULT_HEIGHT_LARGE, 10) + Config.GAP_SIZE * 2), region: 'bottom', hGap: Config.GAP_SIZE, vGap: Config.GAP_SIZE}}, this._panel);

            var openProjectButton = new Button({attributes: {text: 'Open Project...'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT_LARGE}}, topPanel);
            var saveProjectButton = new Button({attributes: {text: 'Save Project'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT_LARGE}}, topPanel);
            var saveAsProjectButton = new Button({attributes: {text: 'Save Project...'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT_LARGE, clear: 'right'}}, topPanel);

            new Label({attributes: {text: 'Encoding Template'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT, clear: 'right'}}, centerPanel);
            this._configCB = new ComboBox({style: {width: '2w', height: Config.DEFAULT_HEIGHT, border: 1}}, centerPanel);
            var loadConfig = new Button({attributes: {text: 'Load'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT}}, centerPanel);
            var saveConfig = new Button({attributes: {text: 'Save'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT}}, centerPanel);
            var deleteConfig = new Button({attributes: {text: 'Delete'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT}}, centerPanel);
            var clearConfig = new Button({attributes: {text: 'Clear'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT, clear: 'right'}}, centerPanel);

            new Label({attributes: {text: 'Additional options'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT, clear: 'right'}}, centerPanel);
            this._optionsEdit = new Edit({attributes: {text: ''}, style: {width: '1w', height: Config.DEFAULT_HEIGHT, border: 1, clear: 'right'}}, centerPanel);

            this._exitAfterCB = new CheckBox({attributes: {text: 'Exit after transcoding'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT, clear: 'right'}}, centerPanel);

            new Label({attributes: {text: 'Destination File'}, style: {width: Config.DEFAULT_LABEL_WIDTH, height: Config.DEFAULT_HEIGHT, clear: 'right'}}, centerPanel);
            this._fileEdit = new Edit({attributes: {text: ''}, style: {width: '1w', height: Config.DEFAULT_HEIGHT, border: 1}}, centerPanel);
            var fileButton = new Button({attributes: {text: '...'}, style: {width: Config.DEFAULT_WIDTH, height: Config.DEFAULT_HEIGHT}}, centerPanel);
            var playButton = new Button({attributes: {text: '>'}, style: {width: Config.DEFAULT_WIDTH, height: Config.DEFAULT_HEIGHT, clear: 'right'}}, centerPanel);

            this._startButton = new Button({attributes: {text: 'Start'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT_LARGE}}, bottomPanel);
            this._stopButton = new Button({attributes: {text: 'Stop'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT_LARGE}}, bottomPanel);
            var exitButton = new Button({attributes: {text: 'Exit'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT_LARGE, clear: 'right'}}, bottomPanel);

            this._configCB.addChildren(Object.keys(this._ffgui.getConfig().encodingConfig));
            this.onStopped();

            loadConfig.observe('click', this.onLoadConfig.bind(this));
            saveConfig.observe('click', this.onSaveConfig.bind(this));
            deleteConfig.observe('click', this.onDeleteConfig.bind(this));
            clearConfig.observe('click', this.onClearConfig.bind(this));
            fileButton.observe('click', this.onFile.bind(this));
            playButton.observe('click', this.onPlay.bind(this));
            openProjectButton.observe('click', this._ffgui.onOpenProject.bind(this._ffgui));
            saveProjectButton.observe('click', this._ffgui.onSaveProject.bind(this._ffgui));
            saveAsProjectButton.observe('click', this._ffgui.onSaveProjectAs.bind(this._ffgui));
            this._startButton.observe('click', this._ffgui.startTranscoding.bind(this._ffgui));
            this._stopButton.observe('click', this._ffgui.stopTranscoding.bind(this._ffgui));
            exitButton.observe('click', this._ffgui.onExit.bind(this._ffgui));
        },
        onStarted : function() {
            this._startButton.setEnabled(false);
            this._stopButton.setEnabled(true);
        },
        onStopped : function() {
            this._startButton.setEnabled(true);
            this._stopButton.setEnabled(false);
            if (this._exitAfterCB.getSelected()) {
                this._ffgui.onExit();
            }
        },
        onPlay : function(event) {
            var filename = this._fileEdit.getAttribute('text');
            if ((filename.length > 0) && new File(filename).exists()) {
                this._ffgui.getFFmpeg().play(filename);
            }
        },
        onFile : function(event) {
            var filename = CommonDialog.getSaveFileName(this._panel, true);
            if (! filename) {
                return;
            }
            /*if (new File(filename).exists()) {
            System.out.println('The file "' + filename + '" already exists');
            return;
        }*/
            this._fileEdit.setAttribute('text', filename);
        },
        loadConfig : function(name) {
            var encodingConfig = this._ffgui.getConfig().encodingConfig;
            if (! (name in encodingConfig)) {
                return;
            }
            Logger.getInstance().info('Load encoding configuration "' + name + '"');
            this._ffgui.loadTabs(encodingConfig[name]);
        },
        onLoadConfig : function(event) {
            var name = this._configCB.getAttribute('text');
            Logger.getInstance().debug('onLoadConfig(' + name + ')');
            this.loadConfig(name);
        },
        onClearConfig : function(event) {
            this._ffgui.resetTabs();
        },
        onDeleteConfig : function(event) {
            var name = this._configCB.getAttribute('text');
            var encodingConfig = this._ffgui.getConfig().encodingConfig;
            if (name && (name in encodingConfig)) {
                delete encodingConfig[name];
                this._ffgui._config.markAsChanged();
            }
            Logger.getInstance().info('Encoding configuration "' + name + '" removed');
        },
        onSaveConfig : function(event) {
            var name = this._configCB.getAttribute('text');
            this._ffgui.getConfig().encodingConfig[name] = this._ffgui.saveTabs();
            this._ffgui._config.markAsChanged();
            Logger.getInstance().info('Encoding configuration "' + name + '" updated');
        },
        reset : function() {
            this._configCB.setAttribute('text', '');
            this._optionsEdit.setAttribute('text', '');
            this._exitAfterCB.setSelected(false);
            this._fileEdit.setAttribute('text', '');
        },
        load : function(obj) {
            this._configCB.setAttribute('text', obj.config);
            this._optionsEdit.setAttribute('text', obj.options);
            this._exitAfterCB.setSelected(obj.exitAfter);
            this._fileEdit.setAttribute('text', obj.filename);
        },
        save : function() {
            return {
                config: this._configCB.getAttribute('text'),
                options: this._optionsEdit.getAttribute('text'),
                exitAfter: this._exitAfterCB.getSelected(),
                filename: this._fileEdit.getAttribute('text')
            };
        }
    });

    /*Object.extend(DestinationTab,
{
});*/

    return DestinationTab;
});
