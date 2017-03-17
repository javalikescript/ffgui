define('spyl/ffgui/SourcesTab', [
  'jls/lang/Class',
  'jls/lang/Exception',
  'jls/lang/Logger',
  'jls/io/File',
  'jls/gui/Panel',
  'jls/gui/Label',
  'jls/gui/Button',
  'jls/gui/Edit',
  'jls/gui/CheckBox',
  'jls/gui/ComboBox',
  'spyl/ffgui/Config',
  'spyl/ffgui/FFmpeg'
], function (
  Class,
  Exception,
  Logger,
  File,
  Panel,
  Label,
  Button,
  Edit,
  CheckBox,
  ComboBox,
  Config,
  FFmpeg
) {

    var SourceInfo = Class.create(Panel, {
        initialize : function($super, parameters, parent) {
            $super(parameters, parent);

            new Label({attributes: {text: this._source.getFile().getName()}, style: {width: '1w', height: Config.DEFAULT_HEIGHT}}, this);
            var playBtn = new Button({attributes: {text: '>'}, style: {width: Config.DEFAULT_HEIGHT, height: Config.DEFAULT_HEIGHT}}, this);
            var infoBtn = new Button({attributes: {text: 'i'}, style: {width: Config.DEFAULT_HEIGHT, height: Config.DEFAULT_HEIGHT}}, this);
            var removeBtn = new Button({attributes: {text: 'x'}, style: {width: Config.DEFAULT_HEIGHT, height: Config.DEFAULT_HEIGHT, clear: 'right'}}, this);
            this._infoLabel = new Label({style: {width: '1w', height: Config.DEFAULT_HEIGHT, clear: 'right'}}, this);
            //this._infoPanel = new Panel({style: {hGap: Config.DEFAULT_GAP, vGap: Config.DEFAULT_GAP, width: '1w', height: '1w', clear: 'right'}}, this);

            playBtn.observe('click', this.onPlay.bind(this));
            infoBtn.observe('click', this.onInfo.bind(this));
            removeBtn.observe('click', this.onRemove.bind(this));

            this.updateProbeResult();
        },
        getSourceId : function() {
            return this._sourceId;
        },
        setSourceId : function(id) {
            this._sourceId = id;
        },
        setSource : function(source) {
            this._source = source;
        },
        setFfgui : function(ffgui) {
            this._ffgui = ffgui;
        },
        onPlay : function(event) {
            this._ffgui.getFFmpeg().playWithInfo(this._source.getFile().getPath());
        },
        onInfo : function(event) {
            Logger.getInstance().debug('onInfo() ' + this._sourceId);
            this._ffgui._tab.setSelectedIndex(3);
            this._ffgui._consoleTab.run([{
                name: 'FFprobe for ' + this._source.getFile().getName(),
                line: [this._ffgui.getFFmpeg()._ffprobe, '-pretty', '-show_format', '-show_streams', this._source.getFile().getPath()],
                showStandardError: false
            }]);
        },
        onRemove : function(event) {
            Logger.getInstance().debug('onRemove() ' + this._sourceId);
            this._ffgui.removeSource(this._sourceId);
        },
        updateProbeResult : function() {
            var pr = this._source.getProbeResult();
            this._duration = parseFloat(pr.duration);
            var info = Math.floor(this._duration) + 's';
            if (pr.format_name) {
                info += '. Format: "' + pr.format_name + '"';
            }
            if ('video' in pr.streamByCodecType) {
                var videoStream = pr.streamByCodecType.video[0];
                info += '. Video codec: "' + videoStream.codec_name + '"';
                info += ', ' + videoStream.width + 'x' + videoStream.height;
                info += ', ' + videoStream.display_aspect_ratio;
            }
            if ('audio' in pr.streamByCodecType) {
                var audioStream = pr.streamByCodecType.audio[0];
                info += '. Audio codec: "' + audioStream.codec_name + '"';
                info += ', ' + audioStream.sample_rate + 'Hz';
            }
            info += '.';
            this._infoLabel.setAttribute('text', info);
        },
        updateSource : function(name) {
            switch (name) {
            case 'remove':
                this.destroy();
                break;
            }
        }
    });

    var SourcesTab = Class.create({
        initialize : function(ffgui, parent) {
            this._ffgui = ffgui;
            this._parent = parent;
            var layoutPanel = new Panel({attributes: {title: 'Sources', layout: 'jls/gui/BorderLayout'}, style: {splitSize: 5}}, this._parent);
            var topPanel = new Panel({style: {height: (parseInt(Config.DEFAULT_HEIGHT_LARGE, 10) + Config.DEFAULT_GAP * 2), region: 'top', hGap: Config.DEFAULT_GAP, vGap: Config.DEFAULT_GAP}}, layoutPanel);
            this._panel = new Panel({style: {region: 'center', hGap: 1, vGap: 1}}, layoutPanel);
            var addSourceButton = new Button({attributes: {text: 'Add Sources...'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT_LARGE}}, topPanel);
            addSourceButton.observe('click', this._ffgui.onAddSources.bind(this._ffgui));
        },
        addSource : function(id, source) {
            new SourceInfo({attributes: {ffgui: this._ffgui, sourceId: id, source: source}, style: {hGap: Config.DEFAULT_GAP, vGap: Config.DEFAULT_GAP, width: '1w', height: SourcesTab.DEFAULT_HEIGHT, border: 1, clear: 'right'}}, this._panel);
        },
        getSource : function(id) {
            for (var i = 0; i < this._panel.getChildCount(); i++) {
                var child = this._panel.getChild(i);
                if (child.getSourceId() == id) {
                    return child;
                }
            }
            return null;
        },
        updateSource : function(id, name) {
            var source = this.getSource(id);
            if (source == null) {
                return;
            }
            source.updateSource(name);
        }
    });

    Object.extend(SourcesTab, {
        DEFAULT_HEIGHT: (Config.DEFAULT_GAP + (parseInt(Config.DEFAULT_HEIGHT, 10) + Config.DEFAULT_GAP) * 2) + 'px',
        SourceInfo: SourceInfo
    });

    return SourcesTab;
});
