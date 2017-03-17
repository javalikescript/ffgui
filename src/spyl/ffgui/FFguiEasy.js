define('spyl/ffgui/FFguiEasy', [
  'jls/lang/Class',
  'jls/lang/Exception',
  'jls/lang/System',
  'jls/lang/Logger',
  'jls/lang/Promise',
  'jls/io/File',
  'jls/gui/Frame',
  'jls/gui/Panel',
  'jls/gui/Label',
  'jls/gui/Edit',
  'jls/gui/Image',
  'jls/gui/Button',
  'jls/gui/ComboBox',
  'jls/gui/MenuItem',
  'jls/gui/CommonDialog',
  'jls/gui/GuiUtilities',
  'jls/win32/Window',
  'jls/win32/Image',
  'spyl/ffgui/Config',
  'spyl/ffgui/Source',
  'spyl/ffgui/FFmpeg',
  'spyl/ffgui/FFgui'
], function (
  Class,
  Exception,
  System,
  Logger,
  Promise,
  File,
  Frame,
  Panel,
  Label,
  Edit,
  Image,
  Button,
  ComboBox,
  MenuItem,
  CommonDialog,
  GuiUtilities,
  w32Window,
  w32Image,
  Config,
  Source,
  FFmpeg,
  FFgui
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
        clone : function() {
            return new Part(this._source, this._from, this._to);
        },
        cut : function(at, end) {
            var t = this._from + at;
            if (at > this.getDuration()) {
                return null;
            }
            if (end) {
                return new Part(this._source, t, this._to);
            }
            return new Part(this._source, this._from, t);
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
        crop : function(from, to) {
        },
        cut : function(from, to) {
            var parts = [];
            var time = 0;
            for (var i = 0; i < this._parts.length; i++) {
                var part = this._parts[i];
                var endTime = time + part.getDuration();
                if (from > endTime) {
                    parts.push(part);
                } else if (to < time) {
                    parts.push(part);
                } else {
                    if ((from >= time) && (from < endTime)) {
                        parts.push(part.cut(from - time, false));
                    }
                    if ((to >= time) && (to < endTime)) {
                        parts.push(part.cut(to - time, true));
                    }
                }
                time = endTime;
            }
            this._parts = parts;
        }
    });
    
    var PartPanel = Class.create(Panel, {
        initialize : function($super, parameters, parent) {
            $super(parameters, parent);
            this._image = new Image({attributes: {width: Config.PART_SIZE}}, this);
            this._infoLabel = new Label({style: {width: '1w', height: Config.DEFAULT_HEIGHT}}, this);
            /*var removeBtn = new Button({
                attributes: {text: 'x'},
                style: {width: Config.DEFAULT_HEIGHT, height: Config.DEFAULT_HEIGHT, clear: 'right'}
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
                hGap: Config.DEFAULT_GAP, vGap: Config.DEFAULT_GAP, width: '1w', height: Config.PART_SIZE,
                verticalAlign: 'middle', verticalPosition: 'middle', border: 1, clear: 'right'
            }}, this);
            partPanel.setPreviewPart(part);
            var self = this;
            partPanel.observe('click', function(event) {
                self.onSelectPart(event.target);
            });
        },
        onSelectPart : function(partPanel) {
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
            this._partStore = partStore;
            $super(parameters, parent);
            this._mark = 0;
            this._image = new Image({style: {border: true, clear: 'right'}}, this);
            this._timeEdit = new Edit({attributes: {text: ''}, style: {width: '1w', height: Config.DEFAULT_HEIGHT, border: 1, clear: 'right'}}, this);
            var previous1sBtn = new Button({attributes: {text: '<'}, style: {width: Config.DEFAULT_WIDTH, height: Config.DEFAULT_HEIGHT}}, this);
            var next1sBtn = new Button({attributes: {text: '>'}, style: {width: Config.DEFAULT_WIDTH, height: Config.DEFAULT_HEIGHT, clear: 'right'}}, this);
            var markBtn = new Button({attributes: {text: 'Mark'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT}}, this);
            this._markLabel = new Label({style: {width: '1w', height: Config.DEFAULT_HEIGHT, clear: 'right'}}, this);
            this._timeEdit.observe('change', this.onTimeChange.bind(this));
            previous1sBtn.observe('click', this.moveTime.bind(this, -3000));
            next1sBtn.observe('click', this.moveTime.bind(this, 3000));
            var self = this;
            markBtn.observe('click', function() {
                self._mark = self.getTime();
                self._markLabel.setAttribute('text', FFmpeg.formatTime(self._mark));
            });
        },
        updateParts : function() {
            this.updateImageAt(this.getTime());
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
            this._mark;
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
    
    var FFguiEasy = Class.create({
        initialize : function(configFilename) {
            this._config = new Config(configFilename);
            this._config.load({
                seekDelayMs : -1,
                ffHome : 'dep/ffmpeg/bin',
                encodingConfig : {}
            });
            this._sourceStore = null;
            this._partStore = null;
        },
        getConfig : function() {
            return this._config.get();
        },
        setFFmpeg : function(ffmpeg) {
            var config = this.getConfig();
            if (config.ffHome != ffmpeg.getHome()) {
                config.ffHome = ffmpeg.getHome();
                this._config.markAsChanged();
            }
            if (false && ! ('ffConfig' in config)) {
                //config.ffConfig = FFgui.extractEncoders(ffmpeg);
                this._config.markAsChanged();
            }
            this._ffmpeg = ffmpeg;
        },
        getFFmpeg : function() {
            return this._ffmpeg;
        },
        createFrame : function() {
            this._sourceStore = new SourceStore(this.getFFmpeg(), this._config);
            this._partStore = new PartStore();
            
            this._icon = w32Image.fromResourceIdentifier(1, w32Image.CONSTANT.IMAGE.ICON);
            this._frame = new Frame({
                attributes: {title: 'FFgui', layout: 'jls/gui/BorderLayout', icon: this._icon},
                style: {visibility: 'hidden', splitSize: 5, width: 800, height: 600}
            });
            this._frame.observe('unload', this.onUnload.bind(this));
            this._topPanel = new Panel({
                style: {hGap: Config.DEFAULT_GAP, vGap: Config.DEFAULT_GAP, border: 1, region: 'top', height: Config.DEFAULT_TOP_HEIGHT + Config.DEFAULT_GAP * 2}
            }, this._frame);
            this._partsPanel = new PartsPanel(this._partStore, {
                style: {hGap: Config.DEFAULT_GAP, vGap: Config.DEFAULT_GAP, border: 1, region: 'center', overflowY: 'scroll'}
            }, this._frame);
            this._previewPanel = new PreviewPanel(this._partStore, {
                style: {hGap: Config.DEFAULT_GAP, vGap: Config.DEFAULT_GAP, border: 1, region: 'left', width: 320, splitter: 'true'}
            }, this._frame);
            
            var self = this;
            this._partsPanel.onSelectPart = function(partPanel) {
                self.onSelectPart(partPanel);
            };

            var menuButton = new Button({attributes: {text: 'Menu'}, style: {width: '64px', height: Config.DEFAULT_TOP_HEIGHT}}, this._topPanel);
            var runButton = new Button({attributes: {text: 'Run'}, style: {width: '64px', height: Config.DEFAULT_TOP_HEIGHT}}, this._topPanel);
            var addButton = new Button({attributes: {text: 'Add'}, style: {width: '64px', height: Config.DEFAULT_TOP_HEIGHT}}, this._topPanel);
            var cutButton = new Button({attributes: {text: 'Cut'}, style: {width: '64px', height: Config.DEFAULT_TOP_HEIGHT}}, this._topPanel);

            addButton.observe('click', this.onAddSources.bind(this));
            cutButton.observe('click', this.onCut.bind(this));

            var menuVisible = false;
            menuButton.observe('click', (function() {
                menuVisible = !menuVisible;
                this._frame.setMenu(menuVisible ? this._menu : null);
            }).bind(this));

            //addSourceButton.observe('click', this._ffgui.onAddSources.bind(this._ffgui));

            this._menu = MenuItem.createMenu();
            this._fileMenu = new MenuItem({label: 'File', popup: true}, this._menu);
            this._frame.getStyle().setProperty('visibility', 'visible');
            return this._frame;
        },
        onSelectPart : function(partPanel) {
            Logger.getInstance().warn('onSelectPart()');
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
        onCut : function(event) {
            var range = this._previewPanel.getRange();
            Logger.getInstance().info('onCut(' + FFmpeg.formatTime(range.from) +
                    ' - ' + FFmpeg.formatTime(range.to) + ')');
            this._partStore.cut(range.from, range.to);
            this.updateParts();
        },
        onAdd : function() {
        },
        onUnload : function(event) {
            Logger.getInstance().debug('onUnload()');
            this._config.save();
            //this._consoleTab.shutdown();
            this.getFFmpeg().shutdown();
        },
        onExit : function(event) {
            Logger.getInstance().debug('onExit()');
            if (this._frame == null) {
                return;
            }
            this._frame.onDestroy();
            this._frame = null;
        }
    });

    Object.extend(FFguiEasy, {
        main : function(args) {
            System.out.println('Initializing UI...');
            var configFilename = System.getProperty('spyl.ffgui.configFilename', 'ffgui.json');
            try {
                ui = new FFguiEasy(configFilename);
            } catch (e) {
                CommonDialog.messageBox('Cannot initialize due to ' + e);
                throw e;
            }
            FFgui.initFFmpeg(ui);
            GuiUtilities.invokeLater(function() {
                ui.createFrame();
            });
        }
    });

    return FFguiEasy;
});
