define('spyl/ffgui/ArgumentTab', [
  'jls/lang/Class',
  'jls/lang/Exception',
  'jls/lang/Logger',
  'jls/gui/Panel',
  'jls/gui/Label',
  'jls/gui/Button',
  'jls/gui/Edit',
  'jls/gui/CheckBox',
  'jls/gui/ComboBox',
  'spyl/ffgui/Config'
], function (
  Class,
  Exception,
  Logger,
  Panel,
  Label,
  Button,
  Edit,
  CheckBox,
  ComboBox,
  Config
) {

    var ArgumentTab;
    ArgumentTab = Class.create({
        initialize : function(config, parent) {
            this._parent = parent;
            this._config = config;
            this._panel = null;
            this._arguments = {};
            this._optionName = null;
            this._optionValue = null;
            this._optionPanel = null;
            this._optionElement = null;
            this._optionArguments = {};
            this.createPane();
        },
        createPane : function() {
            var title = 'Arguments';
            if (('title' in this._config) && (typeof this._config.title == 'string')) {
                title = this._config.title;
            }
            this._panel = new Panel({attributes: {title: title}, style: {hGap: Config.DEFAULT_GAP, vGap: Config.DEFAULT_GAP}}, this._parent);
            ArgumentTab.addArguments(this._config.arguments, this._panel, this._arguments);
            if (('optionArgument' in this._config) && ('options' in this._config)) {
                var optionArgument = this._config.optionArgument;
                if ((typeof optionArgument == 'string') && (optionArgument in this._arguments)) {
                    this._optionName = optionArgument;
                    this.createOptionPane(this._arguments[optionArgument]);
                }
            }
        },
        createOptionPane : function(element) {
            this._optionPanel = new Panel({style: {hGap: Config.DEFAULT_GAP, vGap: Config.DEFAULT_GAP, width: '1w', height: Config.DEFAULT_HEIGHT, clear: 'right'}}, this._panel);
            this._optionElement = element;
            this._optionElement.observe('change', this.onOptionChange.bind(this));
        },
        onOptionChange : function(event) {
            this._optionPanel.removeChildren();
            this._optionArguments = {};
            var value = this._optionElement.getAttribute('text');
            if (value in this._config.options) {
                this._optionValue = value;
                var args = this._config.options[value].arguments;
                var height = (parseInt(Config.DEFAULT_HEIGHT) + Config.DEFAULT_GAP) * args.length + Config.DEFAULT_GAP;
                Logger.getInstance().debug('ArgumentTab.onOptionChange() height: ' + height);
                this._optionPanel.getStyle().setProperty('height', height + 'px');
                this._optionPanel.getParent().update(); // if size changed
                ArgumentTab.addArguments(args, this._optionPanel, this._optionArguments);
            } else {
                this._optionValue = null;
            }
        },
        appendOptions : function(options) {
            if (typeof options == 'undefined') {
                options = [];
            }
            ArgumentTab.appendOptions(this._config.arguments, this._arguments, options);
            if (this._optionValue != null) {
                ArgumentTab.appendOptions(this._config.options[this._optionValue].arguments, this._optionArguments, options);
            }
            return options;
        },
        load : function(obj) {
            ArgumentTab.loadArguments(this._config.arguments, this._arguments, obj);
            if ((this._optionName != null) && (this._optionName in obj)) {
                this.onOptionChange();
            }
            if (this._optionValue != null) {
                ArgumentTab.loadArguments(this._config.options[this._optionValue].arguments, this._optionArguments, obj);
            }
        },
        save : function() {
            var obj = ArgumentTab.saveArguments(this._config.arguments, this._arguments);
            if (this._optionValue != null) {
                ArgumentTab.saveArguments(this._config.options[this._optionValue].arguments, this._optionArguments, obj);
            }
            return obj;
        },
        reset : function() {
            ArgumentTab.resetArguments(this._config.arguments, this._arguments);
            if (this._optionValue != null) {
                ArgumentTab.resetArguments(this._config.options[this._optionValue].arguments, this._optionArguments);
            }
        }
    });

    Object.extend(ArgumentTab,
            {
        loadArguments : function(args, map, obj) {
            for (var i = 0; i < args.length; i++) {
                var arg = args[i];
                var name = arg.name;
                if (! (name in obj)) {
                    continue;
                }
                var value = obj[name];
                var elem = map[name];
                if (arg.noValue) {
                    elem.setSelected(value);
                } else {
                    elem.setAttribute('text', value);
                }
            }
            return obj;
        },
        saveArguments : function(args, map, obj) {
            if (typeof obj == 'undefined') {
                obj = {};
            }
            for (var i = 0; i < args.length; i++) {
                var arg = args[i];
                var elem = map[arg.name];
                var value;
                if (arg.noValue) {
                    value = elem.getSelected();
                } else {
                    value = elem.getAttribute('text');
                    if (value.length == 0) {
                        continue;
                    }
                }
                obj[arg.name] = value;
            }
            return obj;
        },
        appendOptions : function(args, map, options) {
            if (typeof options == 'undefined') {
                options = [];
            }
            for (var i = 0; i < args.length; i++) {
                var arg = args[i];
                var elem = map[arg.name];
                var value;
                if (arg.noValue) {
                    if (elem.getSelected()) {
                        options.push(arg.name);
                    }
                } else {
                    value = elem.getAttribute('text');
                    if (value.length > 0) {
                        options.push(arg.name);
                        options.push(value);
                    }
                }
            }
            return options;
        },
        resetArguments : function(args, map) {
            for (var i = 0; i < args.length; i++) {
                var arg = args[i];
                if (! (arg.name in map)) {
                    continue;
                }
                var elem = map[arg.name];
                if (arg.noValue) {
                    // TODO selected: true
                    elem.setSelected(false);
                } else {
                    if ('value' in arg) {
                        elem.setAttribute('text', arg.value);
                    } else {
                        elem.setAttribute('text', '');
                    }
                }
            }
        },
        addArguments : function(args, parent, map) {
            for (var i = 0; i < args.length; i++) {
                var arg = args[i];
                var elem;
                var label = arg.label + ' (' + arg.name + ')';
                if (arg.noValue) {
                    // TODO selected: true
                    elem = new CheckBox({attributes: {text: label}, style: {width: '1w', height: Config.DEFAULT_HEIGHT, clear: 'right'}}, parent);
                } else if ('map' in arg) {
                    new Label({attributes: {text: label}, style: {width: Config.DEFAULT_LABEL_WIDTH, height: Config.DEFAULT_HEIGHT}}, parent);
                    elem = new ComboBox({style: {width: '1w', height: Config.DEFAULT_HEIGHT, border: 1, clear: 'right'}}, parent);
                    elem.addChildren(Object.keys(arg.map));
                } else if ('values' in arg) {
                    new Label({attributes: {text: label}, style: {width: Config.DEFAULT_LABEL_WIDTH, height: Config.DEFAULT_HEIGHT}}, parent);
                    elem = new ComboBox({style: {width: '1w', height: Config.DEFAULT_HEIGHT, border: 1, clear: 'right'}}, parent);
                    elem.addChildren(arg.values);
                } else {
                    new Label({attributes: {text: label}, style: {width: Config.DEFAULT_LABEL_WIDTH, height: Config.DEFAULT_HEIGHT}}, parent);
                    elem = new Edit({attributes: {text: ''}, style: {width: '1w', height: Config.DEFAULT_HEIGHT, clear: 'right'}}, parent);
                }
                if ('value' in arg) {
                    elem.setAttribute('text', arg.value);
                }
                map[arg.name] = elem;
            }
        }
            });

    return ArgumentTab;
});
