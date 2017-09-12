define('spyl/ffgui/FFgui', [
  'jls/lang/Class',
  'jls/lang/Exception',
  'jls/lang/System',
  'jls/lang/Logger',
  'jls/io/File',
  'jls/io/FileOutputStream',
  'jls/io/OutputStreamWriter',
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
  'jls/util/XmlElement',
  'jls/win32/Window',
  'jls/win32/Image',
  'jls/win32/SysLink',
  'spyl/ffgui/Config',
  'spyl/ffgui/DestinationTab',
  'spyl/ffgui/EditTab',
  'spyl/ffgui/SourcesTab',
  'spyl/ffgui/ArgumentTab',
  'spyl/ffgui/ConsoleTab',
  'spyl/ffgui/FFmpeg',
  'spyl/ffgui/Source'
], function (
  Class,
  Exception,
  System,
  Logger,
  File,
  FileOutputStream,
  OutputStreamWriter,
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
  XmlElement,
  w32Window,
  w32Image,
  w32SysLink,
  Config,
  DestinationTab,
  EditTab,
  SourcesTab,
  ArgumentTab,
  ConsoleTab,
  FFmpeg,
  Source
) {

    var FFgui = Class.create({
        initialize : function(tabsFilename, configFilename) {
            this._ffmpeg = null;
            this._projectFilename = null;
            var tabsFile = new File(tabsFilename);
            this._configTabs = Config.loadJSON(tabsFile);
            this._config = new Config(configFilename);
            this._config.load({
                seekDelayMs : -1,
                ffHome : 'dep/ffmpeg/bin',
                encodingConfig : {}
            });
            this._sources = {};
            try {
                this.setFFmpeg(new FFmpeg(this.getConfig().ffHome));
            } catch (e) {}
        },
        getConfig : function() {
            return this._config.get();
        },
        /*
         * Seek delay in milli seconds
         * When positive, it is used for combined seeking.
         * Default value -1 means input seeking and as of FFmpeg 2.1 is a now also "frame-accurate".
         * Value -2 means output seeking which is very slow.
         * See https://trac.ffmpeg.org/wiki/Seeking
         */
        getSeekDelayMs : function() {
            var config = this.getConfig();
            if ('seekDelayMs' in config) {
                return config.seekDelayMs;
            }
            return -1;
        },
        setFFmpeg : function(ffmpeg) {
            var config = this.getConfig();
            if (config.ffHome != ffmpeg.getHome()) {
                config.ffHome = ffmpeg.getHome();
                this._config.markAsChanged();
            }
            if (false && ! ('ffConfig' in config)) {
                config.ffConfig = FFgui.extractEncoders(ffmpeg);
                this._config.markAsChanged();
            }
            this._ffmpeg = ffmpeg;
        },
        getFFmpeg : function() {
            return this._ffmpeg;
        },
        getTab : function() {
            return this._tab;
        },
        getFrame : function() {
            return this._frame;
        },
        createFrame : function() {
            this._icon = w32Image.fromResourceIdentifier(1, w32Image.CONSTANT.IMAGE.ICON);
            this._frame = new Frame({attributes: {title: 'FFgui', layout: 'jls/gui/CardLayout', icon: this._icon},
                style: {visibility: 'hidden', splitSize: 5, width: 800, height: 600}});
            this._menu = MenuItem.createMenu();
            this._fileMenu = new MenuItem({label: 'File', popup: true}, this._menu);
            new MenuItem({label: 'Add sources...', event: 'addSources'}, this._fileMenu);
            MenuItem.createMenuSeparator(this._fileMenu);
            new MenuItem({label: 'Open project...', event: 'openProject'}, this._fileMenu);
            new MenuItem({label: 'Save', event: 'saveProject'}, this._fileMenu);
            new MenuItem({label: 'Save project...', event: 'saveProjectAs'}, this._fileMenu);
            MenuItem.createMenuSeparator(this._fileMenu);
            new MenuItem({label: 'Import...', event: 'import'}, this._fileMenu);
            new MenuItem({label: 'Export as concat...', event: 'exportAsConcat'}, this._fileMenu);
            MenuItem.createMenuSeparator(this._fileMenu);
            new MenuItem({label: 'Exit', event: 'exit'}, this._fileMenu);
            this._aboutMenu = new MenuItem({label: '?', popup: true}, this._menu);
            new MenuItem({label: 'FFplay help', event: 'helpFFplay'}, this._aboutMenu);
            new MenuItem({label: 'FFmpeg help', event: 'helpFFmpeg'}, this._aboutMenu);
            new MenuItem({label: 'FFmpeg codecs', event: 'helpFFmpegCodecs'}, this._aboutMenu);
            new MenuItem({label: 'FFmpeg formats', event: 'helpFFmpegFormats'}, this._aboutMenu);
            new MenuItem({label: 'About', event: 'about'}, this._aboutMenu);
            this._frame.setMenu(this._menu);

            this._tab = new Tab({attributes: {selectOnAdd: false}}, this._frame);

            this._menu.observe('addSources', this.onAddSources.bind(this));
            this._menu.observe('openProject', this.onOpenProject.bind(this));
            this._menu.observe('saveProject', this.onSaveProject.bind(this));
            this._menu.observe('saveProjectAs', this.onSaveProjectAs.bind(this));
            this._menu.observe('import', this.onImport.bind(this));
            this._menu.observe('exportAsConcat', this.onExportAsConcat.bind(this));
            this._menu.observe('exit', this.onExit.bind(this));
            this._menu.observe('helpFFplay', this.onHelpFFplay.bind(this));
            this._menu.observe('helpFFmpeg', this.onHelpFFmpeg.bind(this));
            this._menu.observe('helpFFmpegCodecs', this.onHelpFFmpegCodecs.bind(this));
            this._menu.observe('helpFFmpegFormats', this.onHelpFFmpegFormats.bind(this));
            this._menu.observe('about', this.onAbout.bind(this));
            this._frame.observe('unload', this.onUnload.bind(this));

            this._destinationTab = new DestinationTab(this, this._tab);
            this._editTab = new EditTab(this, this._tab);
            this._sourcesTab = new SourcesTab(this, this._tab);
            this._consoleTab = new ConsoleTab(this._tab);

            this._tabs = {};
            for (var key in this._configTabs) {
                this._tabs[key] = new ArgumentTab(this._configTabs[key], this._tab);
            }
            this._frame.getStyle().setProperty('visibility', 'visible');
            return this._frame;
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
        },
        reset : function() {
            this.removeAllSources();
            this.resetTabs();
            this._destinationTab.reset();
            this._editTab.reset();
        },
        onOpenProject : function(event) {
            var filename = CommonDialog.getOpenFileName(this._panel);
            if (filename) {
                this.openProject(filename);
                this._projectFilename = filename;
            }
        },
        removeAllSources : function() {
            var sourceIds = [];
            for (var id in this._sources) {
                sourceIds.push(id);
            }
            for (var i = 0; i < sourceIds.length; i++) {
                this.removeSource(sourceIds[i]);
            }
        },
        openProjectObject : function(project) {
            this.reset();
            this.loadTabs(project.tabs);
            this._destinationTab.load(project.destination);
            for (var id in project.sources) {
                this.addSource(project.sources[id], id);
            }
            this._editTab.load(project.parts);
        },
        openProject : function(filename) {
            var file = new File(filename);
            var project = Config.loadJSON(file);
            this.openProjectObject(project);
        },
        onSaveProject : function(event) {
            if (this._projectFilename != null) {
                this.saveProject(this._projectFilename);
            } else {
                this.onSaveProjectAs(event);
            }
        },
        onSaveProjectAs : function(event) {
            var filename = CommonDialog.getSaveFileName(this._panel);
            if (! (filename && FFgui.canOverwriteFile(filename))) {
                return;
            }
            this.saveProject(filename);
            this._projectFilename = filename;
        },
        saveProject : function(filename) {
            var file = new File(filename);
            var sources = {};
            for (var id in this._sources) {
                sources[id] = this._sources[id].getFile().getPath();
            }
            var project = {
                    tabs: this.saveTabs(),
                    sources: sources,
                    parts: this._editTab.save(),
                    destination: this._destinationTab.save()
            };
            Config.saveJSON(file, project);
        },
        onImport : function(event) {
            var filename = CommonDialog.getOpenFileName(this._panel);
            if (! filename) {
                return;
            }
            if (filename.endsWith('.wlmp')) {
                this.importWLMP(filename);
            } else {
                CommonDialog.messageBox('The file cannot be imported, the format is unknown');
            }
        },
        onExportAsConcat : function(event) {
            var filename = CommonDialog.getSaveFileName(this._panel);
            if (! (filename && FFgui.canOverwriteFile(filename))) {
                return;
            }
            this.exportAsConcat(filename);
        },
        exportAsConcat : function(filename) {
            var file = new File(filename);
            var output = new OutputStreamWriter(new FileOutputStream(file), 'UTF-8');
            var parts = this._editTab.save();
            for (var i = 0; i < parts.length; i++) {
                var part = parts[i];
                var source = this._sources[part.sourceId];
                var startTime = source.getStartTime();
                var path = source.getFile().getPath();
                /*
            file 'C:\file_%04d.tif'
            duration 00:00:04.080
            inpoint 00:00:02.000
            outpoint 00:00:03.000
                 */
                output.writeLine('file \'' + path.replace(/\\/g, '/') + '\'');
                if (part.from != null) {
                    output.writeLine('inpoint ' + FFmpeg.formatTime(part.from + startTime, true));
                }
                if (part.to != null) {
                    output.writeLine('outpoint ' + FFmpeg.formatTime(part.to + startTime, true));
                }
            }
            output.close();
        },
        importWLMP : function(filename) {
            var file = new File(filename);
            var content = Config.loadAsString(file);
            var e4x = new XML(XmlElement.removeXmlDeclaration(content));
            var xmlProject = XmlElement.createFromE4X(e4x);
            var idMap = {};
            var sources = {};
            var parts = [];
            var mediaItems = xmlProject.getChildByName('MediaItems').getChildrenByName('MediaItem');
            for (var i = 0; i < mediaItems.length; i++) {
                var mediaItem = mediaItems[i];
                var filePath = mediaItem.getAttribute('filePath').toString();
                var mediaItemID = mediaItem.getAttribute('id').toString();
                Logger.getInstance().debug('mediaItem filePath: ' + filePath);
                var file = new File(filePath);
                if (! file.exists()) {
                    continue;
                }
                var id = this._config.getSourceId(file);
                sources[id] = filePath;
                idMap[mediaItemID] = id;
            }
            var videoClips = xmlProject.getChildByName('Extents').getChildrenByName('VideoClip');
            for (var i = 0; i < videoClips.length; i++) {
                var videoClip = videoClips[i];
                var mediaItemID = videoClip.getAttribute('mediaItemID').toString();
                var inTime = Math.floor(parseFloat(videoClip.getAttribute('inTime').toString()) * 1000);
                var outTime =  Math.floor(parseFloat(videoClip.getAttribute('outTime').toString()) * 1000);
                Logger.getInstance().debug('videoClip mediaItemID: ' + mediaItemID);
                parts.push({
                    sourceId: idMap[mediaItemID],
                    from: inTime,
                    to: outTime
                });
            }
            var project = {
                    tabs: {},
                    sources: sources,
                    parts: parts,
                    destination: {
                        config: '',
                        options: '',
                        filename: ''
                    }
            };
            this.openProjectObject(project);
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
        addSource : function(filename, id) {
            this.addSourceFile(new File(filename), id);
        },
        addSourceFile : function(file, id) {
            if (! file.exists()) {
                return;
            }
            if (typeof id == 'undefined') {
                id = this._config.getSourceId(file);
            }
            if (id in this._sources) {
                return;
            }
            var source = new Source(this.getFFmpeg(), this._config, id, file);
            this._sources[id] = source;
            source.prepare();
            this._editTab.addSource(id, source);
            this._sourcesTab.addSource(id, source);
            var self = this;
            source.createPreview().then(function() {
                self.updateSource(id, 'preview');
            });
        },
        updateSource : function(id, name) {
            this._editTab.updateSource(id, name);
            this._sourcesTab.updateSource(id, name);
        },
        removeSource : function(id) {
            this.updateSource(id, 'remove');
            delete this._sources[id];
        },
        startTranscoding : function() {
            var filename = this._destinationTab._fileEdit.getAttribute('text');
            if (! FFgui.canOverwriteFile(filename)) {
                return;
            }
            Logger.getInstance().info('starting...');
            var tabsOptions = this.getTabsOptions();
            var addOptionsText = this._destinationTab._optionsEdit.getAttribute('text');
            if (addOptionsText) {
                Array.prototype.push.apply(tabsOptions, addOptionsText.split(/\s+/));
            }
            var commands = FFgui.createCommands(this._config, this.getFFmpeg(), filename,
                    this._editTab.computeParts(), tabsOptions, this.getSeekDelayMs());
            if (commands.length > 0) {
                this._destinationTab.onStarted();
                this._consoleTab.run(commands, this.transcodingEnded, this);
            }
        },
        stopTranscoding : function() {
            Logger.getInstance().debug('stopping...');
            this._consoleTab.stop();
        },
        transcodingEnded : function(success) {
            this._destinationTab.onStopped();
            Logger.getInstance().info('stopped');
            if (! success) {
                this._tab.setSelectedIndex(3);
            }
        },
        onAbout : function(event) {
            var aboutFrame = new Frame({attributes: {title: 'About FFgui', icon: this._icon}}, this._frame);
            aboutFrame._window.center(320, 200);
            var vendorUrl = System.getProperty('jls.vendor.url');
            var sysLink = new w32SysLink('  FFgui\n\n' +
                    'Based on <A HREF="' + vendorUrl + '">jls</A>, v.' + System.getProperty('jls.version') + '\n' +
                    'Javascript engine: ' + System.getProperty('javascript.engine') + ', v.' + System.getProperty('javascript.version') + '\n' +
                    'View the <A HREF="' + vendorUrl + 'license.txt">license</A>\n' +
                    '\n' +
                    'Visit the <A HREF="' + vendorUrl + 'project/ffgui/">project home page</A>\n' +
                    'Visit <A HREF="' + FFgui.FFMPEG_URL + '">FFmpeg web site</A>',
                    w32Window.CONSTANT.WS.CHILD | w32Window.CONSTANT.WS.VISIBLE,
                    0, 0, 0, 0, aboutFrame._window);
            sysLink.maximize(5);
        },
        onHelpFFmpeg : function(event) {
            this._tab.setSelectedIndex(3);
            this._consoleTab.run([{
                name: 'FFmpeg help',
                line: [this.getFFmpeg()._ffmpeg, '-h'],
                showStandardError: false
            }]);
        },
        onHelpFFmpegCodecs : function(event) {
            this._tab.setSelectedIndex(3);
            this._consoleTab.run([{
                name: 'FFmpeg codecs',
                line: [this.getFFmpeg()._ffmpeg, '-codecs'],
                showStandardError: false
            }]);
        },
        onHelpFFmpegFormats : function(event) {
            this._tab.setSelectedIndex(3);
            this._consoleTab.run([{
                name: 'FFmpeg formats',
                line: [this.getFFmpeg()._ffmpeg, '-formats'],
                showStandardError: false
            }]);
        },
        onHelpFFplay : function(event) {
            var frame = new Frame({attributes: {title: 'Help FFplay'}, style: {splitSize: 5, width: 480, height: 360}});
            var about = 'FFplay display the timestamp of the current frame on the top left corner.' +
            ' This value may not start at 0.' +
            ' You could copy paste this value directly in the edit tab.\n\n' +
            'While playing, the following keys are available:\n' +
            '  escape:\n\tQuit\n' +
            '  f:\n\ttoggle full screen\n' +
            '  p, space:\n\tpause\n' +
            '  s:\n\tactivate frame-step mode\n' +
            '  left/right:\n\tseek backward/forward 10 seconds\n' +
            '  down/up:\n\tseek backward/forward 1 minute\n' +
            '  page down/page up:\n\tseek backward/forward 10 minutes\n' +
            '  mouse click:\n\tseek to percentage in file corresponding to fraction of width\n';
            new Label({attributes: {text: about}, style: {width: '100%', height: '100%'}}, frame);
        },
        onUnload : function(event) {
            Logger.getInstance().debug('onUnload()');
            this._config.save();
            this._consoleTab.shutdown();
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

    Object.extend(FFgui, {
        extractEncoders : function(ffmpeg) {
            System.err.println('Loading ffmpeg formats...');
            var formats = ffmpeg.extractFormats();
            System.err.println('Loading ffmpeg codecs...');
            var codecs = ffmpeg.extractCodecs();
            var encoder = {
                    audio: codecs.audio.encoder,
                    video: codecs.video.encoder,
                    format: formats.encoder
            };
            /*for (var type in encoder) {
            System.out.println('Encoder ' + type + ':');
            for (var name in encoder[type]) {
                System.out.println(' ' + name + ': ' + Object.toJSON(encoder[type][name]));
            }
        }*/
            return encoder;
        },
        canOverwriteFile : function(filename) {
            var file = new File(filename);
            return (! file.exists()) || (CommonDialog.messageBox('The file exists\n"' + filename +
                    '"\nDo you want to overwrite it?', 'FFgui',
                    CommonDialog.CONSTANT.MB.OKCANCEL) == CommonDialog.CONSTANT.IDOK);
        },
        askFFmpeg : function() {
            var result = CommonDialog.messageBox('Does ffmpeg is already installed?', 'FFgui',
                    CommonDialog.CONSTANT.MB.YESNOCANCEL);
            switch (result) {
            case CommonDialog.CONSTANT.IDYES:
                break;
            case CommonDialog.CONSTANT.IDNO:
                if (CommonDialog.messageBox('Do you want to visit ' + FFgui.FFMPEG_URL + '?', 'FFgui',
                        CommonDialog.CONSTANT.MB.OKCANCEL) == CommonDialog.CONSTANT.IDOK) {
                    w32Window.shellExecute(FFgui.FFMPEG_URL);
                } else {
                    System.out.println('Cancelled by user');
                }
                return null;
            default:
                System.out.println('Cancelled by user');
                return null;
            }
            var filename = CommonDialog.getOpenFileName();
            if (! filename) {
                System.out.println('Cancelled by user');
                return null;
            }
            var file = new File(filename);
            if (! (file.isFile() && (file.getName() == 'ffmpeg.exe'))) {
                var message = 'Invalid FFmpeg application: "' + filename + '"';
                CommonDialog.messageBox(message);
                throw message;
            }
            try {
                return new FFmpeg(file.getParent());
            } catch (e) {
                CommonDialog.messageBox('Cannot create ffmpeg due to ' + e);
                throw e;
            }
        },
        initFFmpeg : function(ui) {
            try {
                ui.setFFmpeg(new FFmpeg(ui.getConfig().ffHome));
            } catch (e) {}
            if (ui.getFFmpeg() == null) {
                ui.setFFmpeg(FFgui.askFFmpeg());
            }
        },
        createCommand : function(ffmpeg, part, filename, tabsOptions, seekDelayMs) {
            var destOptions = [];
            var srcOptions = [];
            /*
             * '-ss position (input/output)'
             * When used as an input option (before -i), seeks in this input file to position.
             * When used as an output option (before an output filename), decodes but discards input until the timestamps reach position.
             * This is slower, but more accurate. position may be either in seconds or in hh:mm:ss[.xxx] form.
             */
            if (part.from != null) {
                var delay = seekDelayMs || 0;
                if ((delay >= 0) && (delay < part.from)) {
                    srcOptions.push('-ss', FFmpeg.formatTime(part.from - delay));
                    destOptions.push('-ss', Math.floor(delay / 1000).toString());
                } else if (delay === -1) {
                    srcOptions.push('-ss', FFmpeg.formatTime(part.from));
                } else {
                    destOptions.push('-ss', FFmpeg.formatTime(part.from));
                }
            }
            /*
             * '-to position (output)'
             * Stop writing the output at position. position may be a number in seconds, or in hh:mm:ss[.xxx] form.
             * -to and -t are mutually exclusive and -t has priority.
             */
            /*
             * '-vframes number (output)'
             * Set the number of video frames to record. This is an alias for -frames:v. 
             */
            if (part.to != null) {
                if (part.from != null) {
                    destOptions.push('-t', FFmpeg.formatTime(part.to - part.from));
                    //destOptions.push('-to', FFmpeg.formatTime(part.to));
                } else {
                    destOptions.push('-t', FFmpeg.formatTime(part.to));
                }
            }
            destOptions = destOptions.concat(tabsOptions);
            return ffmpeg.computeArguments(filename, destOptions, part.source.getFile().getPath(), srcOptions);
        },
        createCommands : function(config, ffmpeg, filename, parts, tabsOptions, seekDelayMs) {
            var commands = [];
            if (parts.length == 1) {
                commands.push({
                    line: FFgui.createCommand(ffmpeg, parts[0], filename, tabsOptions, seekDelayMs),
                    name: 'Processing "' + filename + '"',
                    showStandardError: true
                });
            } else if (parts.length > 1) {
                var concatScript = '# ffgui';
                for (var i = 0; i < parts.length; i++) {
                    var partName = 'part_' + i + '.tmp';
                    var outFilename = config.createTempFilename(partName);
                    commands.push({
                        line: FFgui.createCommand(ffmpeg, parts[i], outFilename, tabsOptions, seekDelayMs),
                        name: 'Processing part ' + (i+1) + '/' + parts.length,
                        showStandardError: true
                    });
                    var concatPartname = outFilename.replace(/\\/g, '/');
                    //var concatPartname = partName; // to be safe
                    concatScript += '\nfile ' + concatPartname;
                }
                var concatFilename = config.createTempFilename('concat.txt');
                var concatFile = new File(concatFilename);
                var output = new OutputStreamWriter(new FileOutputStream(concatFile), 'UTF-8');
                output.write(concatScript);
                output.close();
                commands.push({
                    line: ffmpeg.computeArguments(filename, ['-c', 'copy'], concatFilename, ['-f', 'concat', '-safe', '0']),
                    name: 'Concat "' + filename + '"',
                    showStandardError: true
                });
            }
            return commands;
        },
        main : function(args) {
            var tabsFilename = System.getProperty('spyl.ffgui.tabsFilename', 'ffgui.tabs.json');
            var configFilename = System.getProperty('spyl.ffgui.configFilename', 'ffgui.json');
            var ui;
            try {
                ui = new FFgui(tabsFilename, configFilename);
            } catch (e) {
                CommonDialog.messageBox('Cannot load config due to ' + e);
                throw e;
            }
            FFgui.initFFmpeg(ui);
            GuiUtilities.invokeLater(function() {
                ui.createFrame();
                var args = System.getArguments();
                var i = 0, start = false;
                while ((i < args.length) && (args[i].indexOf('-') == 0)) {
                    switch (args[i]) {
                    case '--clean':
                        ui._config.cleanTempDir();
                        break;
                    case '-p':
                    case '--project':
                        ui.openProject(args[++i]);
                        break;
                    case '-c':
                    case '--configuration':
                        ui._destinationTab.loadConfig(args[++i]);
                        break;
                    case '-d':
                    case '--destination':
                        ui._destinationTab._fileEdit.setAttribute('text', args[++i]);
                        break;
                    case '-e':
                    case '--exitAfter':
                        ui._destinationTab._exitAfterCB.setSelected(true);
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
                    ui.startTranscoding();
                }
            });
        },
        FFMPEG_URL: 'http://ffmpeg.org/',
        FFGUI_CODE_URL: 'https://github.com/javalikescript/ffgui',
        FFGUI_HOME_URL: 'https://javalikescript.github.io/ffgui'
    });

    return FFgui;
});
