define('spyl/ffgui/FFguiEasy', [
  'jls/lang/Class',
  'jls/lang/Exception',
  'jls/lang/System',
  'jls/lang/Logger',
  'jls/lang/Promise',
  'jls/io/File',
  'jls/gui/Frame',
  'jls/gui/Tab',
  'jls/gui/Panel',
  'jls/gui/Label',
  'jls/gui/Edit',
  'jls/gui/Image',
  'jls/gui/Button',
  'jls/gui/ComboBox',
  'jls/gui/MenuItem',
  'jls/gui/CommonDialog',
  'jls/gui/GuiUtilities',
  'jls/gui/TemplateContainer',
  'jls/win32/Window',
  'jls/win32/Image',
  'spyl/ffgui/Config',
  'spyl/ffgui/Source',
  'spyl/ffgui/FFmpeg',
  'spyl/ffgui/FFgui',
  'spyl/ffgui/ArgumentTab'
], function (
  Class,
  Exception,
  System,
  Logger,
  Promise,
  File,
  Frame,
  Tab,
  Panel,
  Label,
  Edit,
  Image,
  Button,
  ComboBox,
  MenuItem,
  CommonDialog,
  GuiUtilities,
  TemplateContainer,
  w32Window,
  w32Image,
  Config,
  Source,
  FFmpeg,
  FFgui,
  ArgumentTab
) {

    var SourceStore = Class.create({
        initialize : function(ffmpeg, config) {
            this._ffmpeg = ffmpeg;
            this._config = config;
            this._sources = {};
        },
        addSource : function(filename, id) {
            return this.addSourceFile(new File(filename), id);
        },
        addSourceFile : function(file, id) {
            if (! file.exists()) {
                return null;
            }
            if (typeof id == 'undefined') {
                id = Config.getSourceId(file);
            }
            if (id in this._sources) {
                return this._sources[id];
            }
            var source = new Source(this._ffmpeg, this._config, id, file);
            this._sources[id] = source;
            source.prepare();
            //source.createPreview();
            return source;
        },
        removeSource : function(id) {
            delete this._sources[id];
        }
    });
    
    var Part = Class.create({
        initialize : function(source, from, to) {
            this._source = source || null;
            this._from = from || 0;
            this._to = to || 0;
        },
        getSource : function() {
            return this._source;
        },
        setSource : function(value) {
            this._source = value
            return this;
        },
        getFrom : function() {
            return this._from;
        },
        setFrom : function(value) {
            this._from = value
            return this;
        },
        getTo : function() {
            return this._to;
        },
        setTo : function(value) {
            this._to = value
            return this;
        },
        getDuration : function() {
            return this._to - this._from;
        },
        newPart : function(from, to) {
            var f = this._from + from;
            var t = (typeof to === 'number') ? this._from + to : this._to;
            Logger.getInstance().info('Part.newPart(' + FFmpeg.formatTime(from) + ', ' + FFmpeg.formatTime(to) + ') => ' +
                    FFmpeg.formatTime(f) + ' - ' + FFmpeg.formatTime(t));
            return new Part(this._source, f, t);
        },
        save : function() {
            return {
                sourceId: this.getSource().getId(),
                from: this.getFrom(),
                to: this.getTo()
            };
        }
    });
    
    var PreviewPart = Class.create({
        initialize : function(part, offset) {
            this._part = part || null;
            this._offset = offset || 0;
        },
        getPart : function() {
            return this._part;
        },
        getOffset : function() {
            return this._offset;
        },
        getSource : function() {
            return this.getPart().getSource();
        },
        getDuration : function() {
            return this.getPart().getDuration();
        },
        adaptTime : function(time) {
            return time - this._offset + this.getPart().getFrom();
        },
        extractFrame : function(at) {
            return this.getSource().extractFrame(this.adaptTime(at));
        }
    });
    
    var PartStore = Class.create({
        initialize : function() {
            this._parts = [];
        },
        getParts : function() {
            return this._parts;
        },
        setParts : function(parts) {
            this._parts = parts;
            return this;
        },
        getPreviewParts : function() {
            var previews = [];
            var time = 0;
            for (var i = 0; i < this._parts.length; i++) {
                var part = this._parts[i];
                previews.push(new PreviewPart(part, time));
                time += part.getDuration();
            }
            return previews;
        },
        addPart : function(part) {
            this._parts.push(part)
            return this;
        },
        getDuration : function() {
            var duration = 0;
            for (var i = 0; i < this._parts.length; i++) {
                var part = this._parts[i];
                duration += part.getDuration();
            }
            return duration;
        },
        getPreviewPart : function(at) {
            var time = 0;
            for (var i = 0; i < this._parts.length; i++) {
                var part = this._parts[i];
                var endTime = time + part.getDuration();
                if ((at >= time) && (at < endTime)) {
                    return new PreviewPart(part, time);
                }
                time = endTime;
            }
            Logger.getInstance().debug('PartStore.getPreviewPart(' + at + ') => null');
            return null;
        },
        extractFrame : function(at) {
            var previewPart = this.getPreviewPart(at);
            if (previewPart === null) {
                return Promise.reject();
            }
            return previewPart.extractFrame(at);
        },
        cut : function(at) {
            Logger.getInstance().info('PartStore.cut(' + FFmpeg.formatTime(at) + ')');
            var parts = [];
            var time = 0;
            for (var i = 0; i < this._parts.length; i++) {
                var part = this._parts[i];
                var endTime = time + part.getDuration();
                if ((at > time) && (at < endTime)) {
                    parts.push(part.newPart(0, at - time));
                    parts.push(part.newPart(at - time));
                } else {
                    parts.push(part);
                }
                time = endTime;
            }
            this.setParts(parts);
        },
        keepRange : function(from, to) {
            Logger.getInstance().info('PartStore.keepRange(' + FFmpeg.formatTime(from) + ', ' + FFmpeg.formatTime(to) + ')');
            var parts = [];
            var time = 0;
            for (var i = 0; i < this._parts.length; i++) {
                var part = this._parts[i];
                var endTime = time + part.getDuration();
                if (time >= from) {
                    if (endTime < to) {
                        parts.push(part);
                    } else {
                        parts.push(part.newPart(0, to - time));
                    }
                } else if (endTime > from) {
                    if (endTime < to) {
                        parts.push(part.newPart(from - time));
                    } else {
                        parts.push(part.newPart(from - time, to - time));
                    }
                }
                time = endTime;
            }
            this.setParts(parts);
        },
        removeRange : function(from, to) {
            Logger.getInstance().info('PartStore.removeRange(' + FFmpeg.formatTime(from) + ', ' + FFmpeg.formatTime(to) + ')');
            var parts = [];
            var time = 0;
            for (var i = 0; i < this._parts.length; i++) {
                var part = this._parts[i];
                var endTime = time + part.getDuration();
                if ((from > endTime) || (to < time)) {
                    parts.push(part);
                } else {
                    if ((from >= time) && (from < endTime)) {
                        parts.push(part.newPart(0, from - time));
                    }
                    if ((to >= time) && (to < endTime)) {
                        parts.push(part.newPart(to - time));
                    }
                }
                time = endTime;
            }
            this.setParts(parts);
        }
    });
    
    var PartPanel = Class.create(Panel, {
        initialize : function($super, parameters, parent) {
            $super(parameters, parent);
            this._image = new Image({attributes: {width: Config.PART_SIZE}}, this);
            this._infoLabel = new Label({style: {width: '1w', height: Config.LABEL_HEIGHT}}, this);
            /*var removeBtn = new Button({
                attributes: {text: 'x'},
                style: {width: Config.LABEL_HEIGHT, height: Config.LABEL_HEIGHT, clear: 'right'}
            }, this);*/
            this._previewPart = null;
        },
        updatePreviewPart : function() {
            var previewPart = this.getPreviewPart();
            if (previewPart == null) {
                return;
            }
            var self = this;
            previewPart.getSource().extractFrame(0).done(function(file) {
                self._image.setAttribute('image', file.getPath());
            });
            this._infoLabel.setAttribute('text', 'At ' + FFmpeg.formatTime(previewPart.getOffset()) + ', Duration ' + FFmpeg.formatTime(previewPart.getDuration()));
        },
        setPreviewPart : function(previewPart) {
            this._previewPart = previewPart;
            this.updatePreviewPart();
        },
        getPreviewPart : function() {
            return this._previewPart;
        },
        save : function() {
            return this._previewPart.getPart().save();
        }
    });

    var PartsPanel = Class.create(Panel, {
        initialize : function($super, partStore, parameters, parent) {
            this._partStore = partStore;
            $super(parameters, parent);
        },
        addPreviewPart : function(part) {
            var partPanel = new PartPanel({style: {
                hGap: Config.GAP_SIZE, vGap: Config.GAP_SIZE, width: '1w', height: Config.PART_SIZE,
                verticalAlign: 'middle', verticalPosition: 'middle', border: 1, clear: 'right'
            }}, this);
            partPanel.setPreviewPart(part);
            var self = this;
            partPanel.observe('click', function(event) {
                self.onSelectPart(event.target);
            });
        },
        onSelectPart : function(partPanel) {
            // will be overridden
        },
        updateParts : function() {
            this.removeChildren();
            var previews = this._partStore.getPreviewParts();
            for (var i = 0; i < previews.length; i++) {
                var preview = previews[i];
                this.addPreviewPart(preview);
            }
        }
    });
    
    var PreviewPanel = Class.create(Panel, {
        initialize : function($super, partStore, parameters, parent) {
            this._mark = 0;
            this._partStore = partStore;
            $super(TemplateContainer.mergeParameters({
                style: {hGap: Config.GAP_SIZE, vGap: Config.GAP_SIZE, textAlign: 'center', verticalAlign: 'middle'}
            }, parameters), parent);

            this._image = new Image({style: {border: true, clear: 'right'}}, this);
            
            var fontWidth = Frame.getRootStyle().getPropertyValue('fontWidth');

            this._timeEdit = new Edit({attributes: {text: ''}, style: {width: fontWidth * 12, height: Config.EDIT_HEIGHT, border: 1}}, this);
            this._endTimeLabel = new Label({style: {width: fontWidth * 12, height: Config.LABEL_HEIGHT, clear: 'right'}}, this);
            var previous1mBtn = new Button({attributes: {text: '<<'}, style: {width: fontWidth * 4, height: Config.BUTTON_HEIGHT}}, this);
            var previous1sBtn = new Button({attributes: {text: '<'}, style: {width: fontWidth * 3, height: Config.BUTTON_HEIGHT}}, this);
            var next1sBtn = new Button({attributes: {text: '>'}, style: {width: fontWidth * 3, height: Config.BUTTON_HEIGHT}}, this);
            var next1mBtn = new Button({attributes: {text: '>>'}, style: {width: fontWidth * 4, height: Config.BUTTON_HEIGHT, clear: 'right'}}, this);

            this._timeEdit.observe('change', this.onTimeChange.bind(this));
            previous1mBtn.observe('click', this.moveTime.bind(this, -60000));
            previous1sBtn.observe('click', this.moveTime.bind(this, -3000));
            next1sBtn.observe('click', this.moveTime.bind(this, 3000));
            next1mBtn.observe('click', this.moveTime.bind(this, 60000));

            new Label({attributes: {text: 'Edition:'}, style: {width: '1w', height: Config.LABEL_HEIGHT, clear: 'right'}}, this);
            var cutButton = new Button({attributes: {text: 'Cut'}, style: {width: '1w', height: Config.BUTTON_HEIGHT, clear: 'right'}}, this);
            var markBtn = new Button({attributes: {text: 'Set mark'}, style: {width: '1w', height: Config.BUTTON_HEIGHT}}, this);
            this._markLabel = new Label({style: {width: '1w', height: Config.LABEL_HEIGHT, clear: 'right'}}, this);
            var removeSelectionButton = new Button({attributes: {text: 'Remove from mark'}, style: {width: '1w', height: Config.BUTTON_HEIGHT}}, this);
            var keepSelectionButton = new Button({attributes: {text: 'Keep from mark'}, style: {width: '1w', height: Config.BUTTON_HEIGHT, clear: 'right'}}, this);

            markBtn.observe('click', this.mark.bind(this));
            cutButton.observe('click', this.onCut.bind(this));
            removeSelectionButton.observe('click', this.onRemoveSelection.bind(this));
            keepSelectionButton.observe('click', this.onKeepSelection.bind(this));
        },
        onCut : function(event) {
            this._partStore.cut(this.getTime());
            this.getParent().updateParts();
        },
        onRemoveSelection : function(event) {
            var range = this.getRange();
            if (range.from === range.to) {
                return;
            }
            this._partStore.removeRange(range.from, range.to);
            this.getParent().updateParts();
        },
        onKeepSelection : function(event) {
            var range = this.getRange();
            if (range.from === range.to) {
                return;
            }
            this._partStore.keepRange(range.from, range.to);
            this.getParent().updateParts();
        },
        updateParts : function() {
            var duration = this._partStore.getDuration();
            var time = this.getTime();
            this.setMark(0);
            this._endTimeLabel.setAttribute('text', FFmpeg.formatTime(duration));
            if (time > duration) {
                time = duration;
            }
            this.updateImageAt(time);
        },
        onTimeChange : function(event) {
            Logger.getInstance().debug('PreviewPanel.onTimeChange()');
            var t = this.getTime();
            if (t != null) {
                this.setTime(t);
            }
        },
        updateImageAt : function(t) {
            var self = this;
            this._partStore.extractFrame(t).done(function(file) {
                self._image.setAttribute('image', file.getPath());
            });
        },
        getMark : function() {
            return this._mark;
        },
        setMark : function(time) {
            Logger.getInstance().debug('PreviewPanel.setMark(' + FFmpeg.formatTime(time) + ')');
            this._mark = time;
            this._markLabel.setAttribute('text', FFmpeg.formatTime(this._mark));
        },
        mark : function() {
            this.setMark(this.getTime());
        },
        getTime : function() {
            var time = this._timeEdit.getAttribute('text');
            if (time.length == 0) {
                return null;
            }
            return FFmpeg.parseTime(time);
        },
        getRange : function() {
            var time = this.getTime();
            if (time > this._mark) {
                return {
                    from: this._mark,
                    to: time
                };
            }
            return {
                from: time,
                to: this._mark
            };
        },
        setTime : function(t) {
            this._timeEdit.setAttribute('text', FFmpeg.formatTime(t));
            this.updateImageAt(t);
        },
        moveTime : function(delta) {
            var t = this.getTime();
            if (t == null) {
                t = 0;
            }
            t += delta;
            this.setTime(t);
        }
    });
    
    var FFmpegConfigFrame = Class.create(Frame, {
        initialize : function($super, config, configTabs) {
            this._config = config;
            this._tabs = {};
            $super({
                attributes: {title: 'FFmpeg Parameters', hideOnClose: true, layout: 'jls/gui/CardLayout', icon: FFguiEasy.ICON},
                style: {visibility: 'hidden', hGap: Config.GAP_SIZE, vGap: Config.GAP_SIZE, width: 640, height: 480}
            });
            this._tab = new Tab({attributes: {selectOnAdd: false}}, this);
            this._template = new Panel({attributes: {title: 'Template'}, style: {hGap: Config.GAP_SIZE, vGap: Config.GAP_SIZE}}, this._tab);
            new Label({attributes: {text: 'Encoding Template'}, style: {width: '1w', height: Config.LABEL_HEIGHT, clear: 'right'}}, this._template);
            this._configCB = new ComboBox({style: {width: '2w', height: Config.COMBO_HEIGHT, border: 1}}, this._template);
            var loadConfig = new Button({attributes: {text: 'Load'}, style: {width: '1w', height: Config.BUTTON_HEIGHT}}, this._template);
            var saveConfig = new Button({attributes: {text: 'Save'}, style: {width: '1w', height: Config.BUTTON_HEIGHT}}, this._template);
            var deleteConfig = new Button({attributes: {text: 'Delete'}, style: {width: '1w', height: Config.BUTTON_HEIGHT}}, this._template);
            var clearConfig = new Button({attributes: {text: 'Clear'}, style: {width: '1w', height: Config.BUTTON_HEIGHT, clear: 'right'}}, this._template);
            new Label({attributes: {text: 'Additional options'}, style: {width: '1w', height: Config.LABEL_HEIGHT, clear: 'right'}}, this._template);
            this._optionsEdit = new Edit({attributes: {text: ''}, style: {width: '1w', height: Config.EDIT_HEIGHT, border: 1, clear: 'right'}}, this._template);
            for (var key in configTabs) {
                this._tabs[key] = new ArgumentTab(configTabs[key], this._tab);
            }
            this._configCB.addChildren(Object.keys(this._config.get().encodingConfig));

            loadConfig.observe('click', this.onLoadConfig.bind(this));
            saveConfig.observe('click', this.onSaveConfig.bind(this));
            deleteConfig.observe('click', this.onDeleteConfig.bind(this));
            clearConfig.observe('click', this.onClearConfig.bind(this));
        },
        loadConfig : function(name) {
            var encodingConfig = this._config.get().encodingConfig;
            if (! (name in encodingConfig)) {
                return;
            }
            Logger.getInstance().info('Load encoding configuration "' + name + '"');
            this.loadTabs(encodingConfig[name]);
        },
        onLoadConfig : function(event) {
            var name = this._configCB.getAttribute('text');
            Logger.getInstance().debug('onLoadConfig(' + name + ')');
            this.loadConfig(name);
        },
        onClearConfig : function(event) {
            this.resetTabs();
        },
        onDeleteConfig : function(event) {
            var name = this._configCB.getAttribute('text');
            var encodingConfig = this._config.get().encodingConfig;
            if (name && (name in encodingConfig)) {
                delete encodingConfig[name];
                this._config.markAsChanged();
            }
            Logger.getInstance().info('Encoding configuration "' + name + '" removed');
        },
        onSaveConfig : function(event) {
            var name = this._configCB.getAttribute('text');
            this._config.get().encodingConfig[name] = this.saveTabs();
            this._config.markAsChanged();
            Logger.getInstance().info('Encoding configuration "' + name + '" updated');
        },
        loadTabs : function(tabs) {
            if (tabs) {
                for (var key in tabs) {
                    if (key in this._tabs) {
                        this._tabs[key].load(tabs[key]);
                    }
                }
            }
        },
        saveTabs : function() {
            var tabs = {};
            for (var key in this._tabs) {
                var tab = this._tabs[key];
                tabs[key] = tab.save();
            }
            return tabs;
        },
        resetTabs : function() {
            for (var key in this._tabs) {
                var tab = this._tabs[key];
                if ('reset' in tab) {
                    tab.reset();
                }
            }
        },
        getTabsOptions : function() {
            var options = [];
            for (var key in this._tabs) {
                this._tabs[key].appendOptions(options);
            }
            return options;
        }
    });
    
    var FFguiEasyFrame = Class.create(Frame, {
        initialize : function($super, config, configTabs, ffmpeg) {
            this._config = config;
            this._ffmpeg = ffmpeg;
            this._sourceStore = new SourceStore(this._ffmpeg, this._config);
            this._partStore = new PartStore();
            $super({
                attributes: {title: 'FFgui', layout: 'jls/gui/BorderLayout', icon: FFguiEasy.ICON},
                style: {visibility: 'hidden', splitSize: 5, width: 800, height: 600}
            });
            this.postInit();
            var self = this;
            GuiUtilities.invokeLater(function() {
                self.getStyle().setProperty('visibility', 'visible');
            });
            this._fmpegConfigFrame = new FFmpegConfigFrame(this._config, configTabs);
        },
        postInit : function() {
            this.observe('unload', this.onUnload.bind(this));
            var topButtonHeight = '2em';
            var fontWidth = Frame.getRootStyle().getPropertyValue('fontWidth');
            var topButtonWidth = fontWidth * 12;
            this._topPanel = new Panel({
                style: {hGap: Config.GAP_SIZE, vGap: Config.GAP_SIZE, border: 1, region: 'top', height: 'calc(' + topButtonHeight + '+' + (Config.GAP_SIZE*2+2) + ')'}
            }, this);
            this._partsPanel = new PartsPanel(this._partStore, {
                style: {hGap: Config.GAP_SIZE, vGap: Config.GAP_SIZE, border: 1, region: 'center', overflowY: 'scroll'}
            }, this);
            this._previewPanel = new PreviewPanel(this._partStore, {
                style: {border: 1, region: 'left', width: 320, splitter: 'true'}
            }, this);
            
            var self = this;
            this._partsPanel.onSelectPart = function(partPanel) {
                self.onSelectPart(partPanel);
            };

            var menuButton = new Button({attributes: {text: 'Menu'}, style: {width: topButtonWidth, height: topButtonHeight}}, this._topPanel);
            var ffmpegConfigButton = new Button({attributes: {text: 'Parameters'}, style: {width: topButtonWidth, height: topButtonHeight}}, this._topPanel);
            var runButton = new Button({attributes: {text: 'Run'}, style: {width: topButtonWidth, height: topButtonHeight}}, this._topPanel);
            var addButton = new Button({attributes: {text: 'Add'}, style: {width: topButtonWidth, height: topButtonHeight}}, this._topPanel);
            //Logger.getInstance().info('font size: ' + Frame.getRootStyle().getPropertyValue('fontSize') + ', top panel height: ' + this._topPanel.getH() + ', button height: ' + menuButton.getH());

            addButton.observe('click', this.onAddSources.bind(this));

            var menuVisible = false;
            menuButton.observe('click', function() {
                menuVisible = !menuVisible;
                self.setMenu(menuVisible ? self._menu : null);
            });
            ffmpegConfigButton.observe('click', function() {
                self._fmpegConfigFrame.getStyle().setProperty('visibility', 'visible');
            });

            //addSourceButton.observe('click', this._ffgui.onAddSources.bind(this._ffgui));

            this._menu = MenuItem.createMenu();
            this._fileMenu = new MenuItem({label: 'File', popup: true}, this._menu);
        },
        onSelectPart : function(partPanel) {
            Logger.getInstance().debug('onSelectPart()');
            partPanel.getStyle().setProperty('border', 0);
            this._previewPanel.setTime(partPanel.getPreviewPart().getOffset());
        },
        updateParts : function() {
            // TODO Refresh panels
            this._partsPanel.updateParts();
            this._previewPanel.updateParts();
        },
        addSourceFile : function(file) {
            var source = this._sourceStore.addSourceFile(file);
            var from = 0;
            var to = Math.floor(source.getDuration() / 1000) * 1000;
            this._partStore.addPart(new Part(source, from, to));
            this.updateParts();
        },
        addSource : function(filename, id) {
            this.addSourceFile(new File(filename), id);
        },
        onAddSources : function(event) {
            var filenames = CommonDialog.getOpenFileName(this._panel,
                    CommonDialog.OFN_LONGNAMES | CommonDialog.OFN_NOCHANGEDIR | CommonDialog.OFN_EXPLORER | CommonDialog.OFN_ALLOWMULTISELECT);
            if (! filenames || (filenames.length == 0)) {
                return;
            }
            var dir = new File(filenames[0]);
            if (filenames.length == 1) {
                this.addSourceFile(dir);
            }
            if (! dir.exists()) {
                return;
            }
            for (var i = 1; i < filenames.length; i++) {
                this.addSourceFile(new File(dir, filenames[i]));
            }
        },
        onUnload : function(event) {
            Logger.getInstance().debug('onUnload()');
            this._config.save();
            //this._consoleTab.shutdown();
            this._ffmpeg.shutdown();
            this._fmpegConfigFrame.onDestroy();
        },
        onExit : function(event) {
            Logger.getInstance().debug('onExit()');
            this.onDestroy();
        }
    });
    
    var FFguiEasy = Class.create({});

    Object.extend(FFguiEasy, {
        ICON: w32Image.fromResourceIdentifier(1, w32Image.CONSTANT.IMAGE.ICON),
        main : function(args) {
            System.out.println('Initializing UI...');
            // Show splash will loading?
            var configFilename = System.getProperty('spyl.ffgui.configFilename', 'ffgui.json');
            var tabsFilename = System.getProperty('spyl.ffgui.tabsFilename', 'ffgui.tabs.json');
            var config, ui, configTabs; 
            var ffmpeg = null;
            try {
                config = new Config(configFilename);
                config.load({
                    seekDelayMs : -1,
                    ffHome : 'dep/ffmpeg/bin',
                    encodingConfig : {}
                });
                try {
                    ffmpeg = new FFmpeg(config.get().ffHome);
                } catch (e) {
                    ffmpeg = FFgui.askFFmpeg();
                    if (ffmpeg == null) {
                        return;
                    }
                    config.get().ffHome = ffmpeg.getHome();
                    config.markAsChanged();
                }
                var tabsFile = new File(tabsFilename);
                configTabs = Config.loadJSON(tabsFile);
            } catch (e) {
                CommonDialog.messageBox('Cannot initialize due to ' + e);
                throw e;
            }
            GuiUtilities.invokeLater(function() {
                ui = new FFguiEasyFrame(config, configTabs, ffmpeg);
                var args = System.getArguments();
                var i = 0, start = false;
                while ((i < args.length) && (args[i].indexOf('-') == 0)) {
                    switch (args[i]) {
                    case '--clean':
                        config.cleanTempDir();
                        break;
                    case '-p':
                    case '--project':
                        //ui.openProject(args[++i]);
                        break;
                    case '-c':
                    case '--configuration':
                        //ui._destinationTab.loadConfig(args[++i]);
                        break;
                    case '-d':
                    case '--destination':
                        //ui._destinationTab._fileEdit.setAttribute('text', args[++i]);
                        break;
                    case '-e':
                    case '--exitAfter':
                        //ui._destinationTab._exitAfterCB.setSelected(true);
                        break;
                    case '--start':
                        start = true;
                        break;
                    }
                    i++;
                }
                while (i < args.length) {
                    //System.out.println('Adding source: ' + args[i]);
                    ui.addSource(args[i++]);
                }
                if (start) {
                    //ui.startTranscoding();
                }
            });
        }
    });

    return FFguiEasy;
});
