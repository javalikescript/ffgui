define('spyl/files/Sort', [
  'jls/lang/Class',
  'jls/lang/Exception',
  'jls/lang/System',
  'jls/lang/Logger',
  'jls/lang/Promise',
  'jls/io/File',
  'jls/io/FileChannel'
], function (
  Class,
  Exception,
  System,
  Logger,
  Promise,
  File,
  FileChannel
) {

    var compareByName = function(a, b) {
        var an = a.getName();
        var bn = b.getName();
        return an === bn ? 0 : (an > bn ? 1 : -1);
    };

    var Sort = Class.create({});

    Object.extend(Sort, {
        main : function(args) {
            var argDir, argIndex, argRegExp;
            var args = System.getArguments();
            if (args.length < 1) {
                System.err.println('Missing argument');
                System.exit(22);
            }
            var dirname = args[0];
            var dir = new File(dirname);
            if (!dir.isDirectory()) {
                System.err.println('Invalid directory ' + dirname);
                System.exit(1);
            }
            var tmpdir = new File(dir.getParentFile(), 'tmp');
            if (tmpdir.exists()) {
                System.err.println('Temporary directory exists');
                System.exit(1);
            }
            var files = dir.listFiles();
            if (files === null) {
                System.err.println('Temporary directory exists');
                System.exit(1);
            }
            var filenames = [];
            for (var i = 0; i < files.length; i++) {
                var file = files[i];
                if (file.isFile()) {
                    filenames.push(file.getName());
                }
            }
            filenames.sort();
            //System.err.println('Rename ' + dir.getPath() + ' to ' + tmpdir.getPath());
            if (!dir.renameTo(tmpdir.getPath())) {
                System.err.println('Fail to rename ' + dir.getPath() + ' to ' + tmpdir.getPath());
                System.exit(1);
            }
            //System.err.println('Make directory ' + dir.getPath());
            dir.mkdir();
            for (var i = 0; i < filenames.length; i++) {
                var filename = filenames[i];
                var file = new File(dir, filename);
                var tmpfile = new File(tmpdir, filename);
                //System.err.println('Rename ' + tmpfile.getPath() + ' to ' + file.getPath());
                if (!tmpfile.renameTo(file.getPath())) {
                    System.err.println('Fail to rename ' + tmpfile.getPath() + ' to ' + file.getPath());
                    System.exit(1);
                }
            }
            //System.err.println('Remove directory ' + tmpdir.getPath());
            tmpdir.remove();
        }
    });

    return Sort;
});
