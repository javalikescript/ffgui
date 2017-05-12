define('spyl/ffgui/EditTab', [
  'jls/lang/Class',
  'jls/lang/Exception',
  'jls/lang/Logger',
  'jls/io/File',
  'jls/gui/Panel',
  'jls/gui/Label',
  'jls/gui/Button',
  'jls/gui/Edit',
  'jls/gui/Image',
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
  Image,
  CheckBox,
  ComboBox,
  Config,
  FFmpeg
) {

    var SourceMiniature = Class.create(Panel, {
        initialize : function($super, parameters, parent) {
            this._source = null;
            $super(parameters, parent);
            this._image = new Image({attributes: {width: Config.MINIATURE_SIZE + 'px'}, style: {border: true, clear: 'right'}}, this);
        },
        getImage : function() {
            return this._image;
        },
        getSourceId : function() {
            return this._sourceId;
        },
        setSourceId : function(id) {
            this._sourceId = id;
        },
        getSource : function() {
            return this._source;
        },
        setSource : function(source) {
            this._source = source;
        },
        updateSource : function(name) {
            switch (name) {
            case 'preview':
                this._image.setAttribute('image', this._source.getPreviewFile().getPath());
                break;
            case 'remove':
                this.destroy();
                break;
            }
        }
    });

    var FrameSelect = Class.create(Panel, {
        initialize : function($super, parameters, parent) {
            this._source = null;
            $super(parameters, parent);
            this._image = new Image({attributes: {height: Config.MINIATURE_SIZE + 'px'}, style: {height: Config.MINIATURE_SIZE + 'px', border: true, clear: 'right'}}, this);
            var previous10mBtn = new Button({attributes: {text: '<10m'}, style: {width: Config.DEFAULT_WIDTH, height: Config.DEFAULT_HEIGHT}}, this);
            var previous1mBtn = new Button({attributes: {text: '<1m'}, style: {width: Config.DEFAULT_WIDTH, height: Config.DEFAULT_HEIGHT}}, this);
            var previous10sBtn = new Button({attributes: {text: '<10s'}, style: {width: Config.DEFAULT_WIDTH, height: Config.DEFAULT_HEIGHT}}, this);
            var previous1sBtn = new Button({attributes: {text: '<1s'}, style: {width: Config.DEFAULT_WIDTH, height: Config.DEFAULT_HEIGHT}}, this);
            this._timeEdit = new Edit({attributes: {text: ''}, style: {width: '1w', height: Config.DEFAULT_HEIGHT, border: 1}}, this);
            var next1sBtn = new Button({attributes: {text: '>1s'}, style: {width: Config.DEFAULT_WIDTH, height: Config.DEFAULT_HEIGHT}}, this);
            var next10sBtn = new Button({attributes: {text: '>10s'}, style: {width: Config.DEFAULT_WIDTH, height: Config.DEFAULT_HEIGHT}}, this);
            var next1mBtn = new Button({attributes: {text: '>1m'}, style: {width: Config.DEFAULT_WIDTH, height: Config.DEFAULT_HEIGHT}}, this);
            var next10mBtn = new Button({attributes: {text: '>10m'}, style: {width: Config.DEFAULT_WIDTH, height: Config.DEFAULT_HEIGHT}}, this);
            previous10mBtn.observe('click', this.moveTime.bind(this, -600000));
            previous1mBtn.observe('click', this.moveTime.bind(this, -60000));
            previous10sBtn.observe('click', this.moveTime.bind(this, -10000));
            previous1sBtn.observe('click', this.moveTime.bind(this, -1000));
            next1sBtn.observe('click', this.moveTime.bind(this, 1000));
            next10sBtn.observe('click', this.moveTime.bind(this, 10000));
            next1mBtn.observe('click', this.moveTime.bind(this, 60000));
            next10mBtn.observe('click', this.moveTime.bind(this, 600000));
            this._timeEdit.observe('change', this.onTimeChange.bind(this));
        },
        setSource : function(source) {
            this._source = source;
        },
        adaptTime : function(t) {
            Logger.getInstance().debug('FrameSelect.adaptTime(' + t + ')');
            if ((t >= this._source.getStartTime()) && (this._source.getStartTime() > this._source.getDuration())) {
                Logger.getInstance().debug('start time is ' + this._source.getStartTime());
                if ((t % 1000) == 0) {
                    t -= Math.floor(this._source.getStartTime() / 1000) * 1000;
                } else {
                    t -= this._source.getStartTime();
                }
            }
            if (t < 0) {
                return 0;
            }
            if (t > this._source.getDuration()) {
                return Math.floor(this._source.getDuration() / 1000) * 1000;
            }
            Logger.getInstance().debug('FrameSelect.adaptTime() => ' + t);
            return t;
        },
        onTimeChange : function(event) {
            Logger.getInstance().debug('FrameSelect.onTimeChange()');
            var t = this.getTime();
            if (t != null) {
                this.setTime(this.adaptTime(t));
                //this.updateImageAt(this.adaptTime(t));
            }
        },
        updateImageAt : function(t) {
            if (this._source == null) {
                return;
            }
            var source = this._source;
            var self = this;
            source.extractFrame(t).done(function(file) {
                self._image.setAttribute('image', file.getPath());
            });
        },
        getTime : function() {
            var time = this._timeEdit.getAttribute('text');
            if (time.length == 0) {
                return null;
            }
            return FFmpeg.parseTime(time);
        },
        setTime : function(t) {
            this._timeEdit.setAttribute('text', FFmpeg.formatTime(t));
            this.updateImageAt(t);
        },
        moveTime : function(delta) {
            if (this._source == null) {
                return;
            }
            var t = this.getTime();
            if (t == null) {
                t = 0;
            }
            t += delta;
            this.setTime(this.adaptTime(t));
        }
    });

    var Part = Class.create(Panel, {
        initialize : function($super, parameters, parent, editTab) {
            this._editTab = editTab;
            $super(parameters, parent);
            this._fromImage = new Image({attributes: {width: Config.MINIATURE_SIZE + 'px'}}, this);
            this._toImage = new Image({attributes: {width: Config.MINIATURE_SIZE + 'px'}}, this);
            this._source = null;
            this._from = null;
            this._to = null;
        },
        updatePart : function(source, from, to) {
            this._source = source;
            this._from = from;
            this._to = to;
            var self = this;
            if (from != null) {
                source.extractFrame(from).done(function(file) {
                    self._fromImage.setAttribute('image', file.getPath());
                });
            }
            if (to != null) {
                source.extractFrame(to).done(function(file) {
                    self._toImage.setAttribute('image', file.getPath());
                });
            }
        },
        getSource : function() {
            return this._source;
        },
        getFrom : function() {
            return this._from;
        },
        getTo : function() {
            return this._to;
        },
        save : function() {
            return {
                sourceId: this._source.getId(),
                from: this._from,
                to: this._to
            };
        }
    });

    var EditTab = Class.create({
        initialize : function(ffgui, parent) {
            this._ffgui = ffgui;
            this._parent = parent;
            this._selectedSource = null;
            this._selectedPart = null;

            this._panel = new Panel({attributes: {title: 'Edit', layout: 'jls/gui/BorderLayout'}, style: {splitSize: 5}}, this._parent);
            //, overflow: 'scroll'
            this._srcPanel = new Panel({style: {hGap: Config.GAP_SIZE, vGap: Config.GAP_SIZE, height: EditTab.DEFAULT_SIZE, verticalAlign: 'middle', region: 'top', splitter: 'true', overflowY: 'scroll'}}, this._panel);
            var addSourceBtn = new Button({attributes: {text: 'Add Sources'}, style: {width: Config.MINIATURE_SIZE + 'px', height: Math.floor(Config.MINIATURE_SIZE * 2 /3) + 'px'}}, this._srcPanel);

            this._editPanel = new Panel({attributes: {title: 'Edit', layout: 'jls/gui/BorderLayout'}, style: {splitSize: 5, region: 'center'}}, this._panel);
            var selPanel = new Panel({style: {hGap: Config.GAP_SIZE, vGap: 0, height: EditTab.SELECT_PANEL_HEIGHT, border: 1, region: 'top'}}, this._editPanel);
            this._fromFrame = new FrameSelect({style: {hGap: Config.GAP_SIZE, vGap: Config.GAP_SIZE, width: '1w', height: EditTab.SELECT_HEIGHT, textAlign: 'center'}}, selPanel);
            this._toFrame = new FrameSelect({style: {hGap: Config.GAP_SIZE, vGap: Config.GAP_SIZE, width: '1w', height: EditTab.SELECT_HEIGHT, textAlign: 'center', clear: 'right'}}, selPanel);
            this._addBtn = new Button({attributes: {text: 'Add'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT}}, selPanel);
            this._updateBtn = new Button({attributes: {text: 'Update'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT}}, selPanel);
            this._removeBtn = new Button({attributes: {text: 'Remove'}, style: {width: '1w', height: Config.DEFAULT_HEIGHT}}, selPanel);
            this._partPanel = new Panel({style: {hGap: Config.GAP_SIZE, vGap: Config.GAP_SIZE, region: 'center'}}, this._editPanel);

            addSourceBtn.observe('click', this._ffgui.onAddSources.bind(this._ffgui));
            this._addBtn.setEnabled(false);
            this._updateBtn.setEnabled(false);
            this._removeBtn.setEnabled(false);
            this._addBtn.observe('click', this.onAdd.bind(this));
            this._updateBtn.observe('click', this.onUpdate.bind(this));
            this._removeBtn.observe('click', this.onRemove.bind(this));
        },
        onAdd : function(event) {
            var source = this.getSelectedSource();
            if (source == null) {
                return;
            }
            this.addPart(source, this._fromFrame.getTime(), this._toFrame.getTime());
        },
        onUpdate : function(event) {
            if (this._selectedPart == null) {
                return;
            }
            this._selectedPart.updatePart(this._selectedPart.getSource(), this._fromFrame.getTime(), this._toFrame.getTime());
        },
        onRemove : function(event) {
            if (this._selectedPart == null) {
                return;
            }
            this._selectedPart.destroy();
            this._addBtn.setEnabled(true);
            this._updateBtn.setEnabled(false);
            this._removeBtn.setEnabled(false);
            this._selectedPart = null;
        },
        addPart : function(source, from, to) {
            this._selectedPart = new Part({style: {hGap: Config.GAP_SIZE, vGap: Config.GAP_SIZE, width: EditTab.PART_WIDTH, height: EditTab.DEFAULT_SIZE, verticalAlign: 'middle', verticalPosition: 'middle', border: 1}}, this._partPanel);
            this._selectedPart.updatePart(source, from, to);
            this._selectedPart.observe('click', this.onSelectPart.bind(this));
            this._addBtn.setEnabled(true);
            this._updateBtn.setEnabled(true);
            this._removeBtn.setEnabled(true);
        },
        getFfgui : function() {
            return this._ffgui;
        },
        onSelectPart : function(event) {
            this._selectedPart = event.target;
            this._addBtn.setEnabled(true);
            this._updateBtn.setEnabled(true);
            this._removeBtn.setEnabled(true);
            this.setSelectedSource(this._selectedPart.getSource(), this._selectedPart.getFrom(), this._selectedPart.getTo());
        },
        onSelectSource : function(event) {
            this.selectSource(event.target.getParent().getSource());
        },
        selectSource : function(source) {
            this._selectedPart = null;
            this._addBtn.setEnabled(true);
            this._updateBtn.setEnabled(false);
            this._removeBtn.setEnabled(false);
            this.setSelectedSource(source);
        },
        setSelectedSource : function(selectedSource, from, to) {
            this._selectedSource = selectedSource;
            this._fromFrame.setSource(selectedSource);
            this._toFrame.setSource(selectedSource);
            if (typeof from == 'undefined') {
                from = 0;
            }
            this._fromFrame.setTime(from);
            if (typeof to == 'undefined') {
                to = Math.floor(this._selectedSource.getDuration() / 1000) * 1000;
            }
            this._toFrame.setTime(to);
        },
        getSelectedSource : function() {
            return this._selectedSource;
        },
        addSource : function(id, source) {
            var srcMin = new SourceMiniature({attributes: {sourceId: id, source: source},
                style: {width: EditTab.DEFAULT_SIZE, height: EditTab.DEFAULT_SIZE, textAlign: 'center', verticalAlign: 'middle', verticalPosition: 'middle'}}, this._srcPanel, this);
            srcMin.getImage().observe('click', this.onSelectSource.bind(this));
            if (this._srcPanel.getChildCount() == 2) {
                this.selectSource(srcMin.getSource());
            }
        },
        getSourceMiniature : function(id) {
            for (var i = 1; i < this._srcPanel.getChildCount(); i++) {
                var child = this._srcPanel.getChild(i);
                if (child.getSourceId() == id) {
                    return child;
                }
            }
            return null;
        },
        updateSource : function(id, name) {
            var source = this.getSourceMiniature(id);
            if (source == null) {
                return;
            }
            source.updateSource(name);
            if (name == 'remove') {
                for (var i = this._partPanel.getChildCount() - 1; i >= 0; i--) {
                    var part = this._partPanel.getChild(i);
                    if (part.getSource().getId() == id) {
                        this._partPanel.removeChild(i);
                    }
                }
            }
        },
        load : function(parts) {
            this._partPanel.removeChildren();
            for (var i = 0; i < parts.length; i++) {
                var part = parts[i];
                var sourceMin = this.getSourceMiniature(part.sourceId);
                if (sourceMin == null) {
                    continue;
                }
                this.addPart(sourceMin.getSource(), part.from, part.to);
            }
        },
        save : function() {
            var parts = [];
            for (var i = 0; i < this._partPanel.getChildCount(); i++) {
                parts.push(this._partPanel.getChild(i).save());
            }
            return parts;
        },
        reset : function() {
        },
        computeParts : function() {
            var parts = [];
            if (this._partPanel.getChildCount() == 0) {
                for (var i = 1; i < this._srcPanel.getChildCount(); i++) {
                    var srcElem = this._srcPanel.getChild(i);
                    parts.push({
                        from: null,
                        to: null,
                        source: srcElem.getSource()
                    });
                }
            } else {
                for (var i = 0; i < this._partPanel.getChildCount(); i++) {
                    var partElem = this._partPanel.getChild(i);
                    parts.push({
                        from: partElem.getFrom(),
                        to: partElem.getTo(),
                        source: partElem.getSource()
                    });
                }
            }
            return parts;
        }
    });

    Object.extend(EditTab, {
        DEFAULT_SIZE: (Config.MINIATURE_SIZE + Config.GAP_SIZE * 2) + 'px',
        PART_WIDTH: (Config.MINIATURE_SIZE * 2 + Config.GAP_SIZE * 3) + 'px',
        SELECT_HEIGHT: (Config.MINIATURE_SIZE + parseInt(Config.DEFAULT_HEIGHT, 10) + Config.GAP_SIZE * 3) + 'px',
        SELECT_PANEL_HEIGHT: (Config.MINIATURE_SIZE + parseInt(Config.DEFAULT_HEIGHT, 10) * 2 + Config.GAP_SIZE * 4) + 'px',
        SourceMiniature: SourceMiniature,
        FrameSelect: FrameSelect,
        Part: Part
    });

    return EditTab;
});
