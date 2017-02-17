define('spyl/ffgui/FFguiEasy', [
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
  'spyl/ffgui/FFmpeg'
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
  FFmpeg
) {

    var FFguiEasy = Class.create({
        initialize : function() {
        }
    });

    Object.extend(FFguiEasy, {
        main : function(args) {
            System.out.println('Cancelled by user');
        }
    });


    return FFguiEasy;
});
