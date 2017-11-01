define('spyl/files/FileSet', [
  'jls/lang/Class',
  'jls/lang/Exception',
  'jls/lang/System',
  'jls/lang/Logger',
  'jls/lang/Promise',
  'jls/lang/ByteBuffer',
  'jls/lang/CharBuffer',
  'jls/util/Formatter',
  'jls/io/File',
  'jls/io/FileInputStream',
  'jls/io/FileOutputStream',
  'jls/io/InputStreamReader',
  'jls/io/OutputStreamWriter',
  'jls/io/FileChannel'
], function (
  Class,
  Exception,
  System,
  Logger,
  Promise,
  ByteBuffer,
  CharBuffer,
  Formatter,
  File,
  FileInputStream,
  FileOutputStream,
  InputStreamReader,
  OutputStreamWriter,
  FileChannel
) {
    
    var crcGenerate = function(polynomial) {
        var table = [];
        for (var i = 0; i < 256; i++) {
            var n = i;
            for (var j = 8; j > 0; j--) {
                if ((n & 1) == 1) {
                    n = (n >>> 1) ^ polynomial;
                } else {
                    n = n >>> 1;
                }
            }
            table.push(n);
        }
        return table;
    };
    var crcFinal = function(crc) {
        crc = ~crc;
        return crc < 0 ? 0xFFFFFFFF + crc + 1 : crc;
    };
    var crcCompute = function(polynomial, data) {
        var table = crcGenerate(polynomial);
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < data.length; i++) {
            crc = (crc >>> 8) ^ table[data[i] ^ (crc & 0x000000FF)];
        }
        return crcFinal(crc);
    };
    var crcLoad = function(file, buffer) {
        if (! file.exists()) {
            return 0;
        }
        buffer.clear();
        var data = [];
        var input = new FileInputStream(file);
        //var fc = new FileChannel(file);
        try {
            input.read(buffer);
            //buffer.remaining()
            buffer.flip();
            data = buffer.getByteArray();
        } finally {
            input.close();
        }
        return crcCompute(0x04C11DB7, data);
    };

    var forEachFile = function(dir, fileFn, dirFn, recurse) {
        var files = dir.listFiles();
        if (files !== null) {
            var i, file;
            if ((typeof recurse !== 'boolean') || recurse) {
                for (i = 0; i < files.length; i++) {
                    file = files[i];
                    if (file.isDirectory()) {
                        forEachFile(file, fileFn, dirFn, recurse);
                    }
                }
            }
            var dirCtx = (typeof dirFn === 'function') ? dirFn(dir) : undefined;
            if (dirCtx !== false) {
                for (i = 0; i < files.length; i++) {
                    file = files[i];
                    if (file.isFile()) {
                        fileFn(file, dirCtx);
                    }
                }
            }
        }
    };

    var loadAsString = function(file) {
        if (! file.exists()) {
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
    };
    
    var loadAsLines = function(file) {
        var content = loadAsString(file);
        return content.split(/\r?\n/);
    };
    
    var save = function(file, content) {
        var output = new OutputStreamWriter(new FileOutputStream(file), 'UTF-8');
        try {
            if (typeof content === 'string') {
                output.write(content);
            } else if ((typeof content === 'object') && ('length' in content)) {
                for (var i = 0; i < content.length; i++) {
                    output.write(content[i].toString() + '\n');
                }
            }
        } finally {
            output.close();
        }
    };

    var getFileExtension = function(name) {
        var lastDotIndex = name.lastIndexOf('.');
        return lastDotIndex >= 0 ? name.substring(lastDotIndex + 1) : '';
    };
    var getFileBasename = function(name) {
        var lastDotIndex = name.lastIndexOf('.');
        return lastDotIndex >= 0 ? name.substring(0, lastDotIndex) : name;
    };

    var strcasecmp = function(a, b) {
        var la = a.toLowerCase();
        var lb = b.toLowerCase();
        return la === lb ? 0 : (la > lb ? 1 : -1);
    };
    var strcaseequ = function(a, b) {
        return a.toLowerCase() === b.toLowerCase();
    };

    var CacheEntry = Class.create({
        initialize : function(file, dirId) {
            this._name = '';
            this._dirId = null;
            this._size = -1;
            this._date = 0;
            this._crc = 0;
            // computed and cached values
            this._extension = null;
            this._basename = null;
            if (typeof file !== 'undefined') {
                if (file instanceof File) {
                    this.initializeFromFile(file);
                } else if (typeof file === 'string') {
                    this.initializeFromString(file);
                } else if (file instanceof CacheEntry) {
                    this.initializeFromCacheEntry(file);
                } else if (typeof file === 'object') {
                    this.initializeFromObject(file);
                }
            }
            if (typeof dirId === 'number') {
                this._dirId = dirId;
            }
        },
        initializeFromFile : function(file) {
            this._name = file.getName();
            this._size = file.length();
            this._date = Math.floor(file.lastModified() / 1000);
        },
        initializeFromCacheEntry : function(entry) {
            this._dirId = entry._dirId;
            this._name = entry._name;
            this._size = entry._size;
            this._date = entry._date;
            this._crc = entry._crc;
        },
        initializeFromObject : function(obj) {
            this._name = obj.name;
            this._size = obj.size;
            this._date = obj.date;
        },
        initializeFromString : function(s) {
            var fields = s.split(',');
            if (fields.length > 4) {
                this._dirId = parseInt(fields.shift(), 10);
                this._size = parseInt(fields.shift(), 10);
                this._date = parseInt(fields.shift(), 10);
                this._crc = parseInt(fields.shift(), 16);
                this._name = fields.join(',');
            }
        },
        shift : function(delta) {
            this._dirId += delta;
        },
        getDirId : function() {
            return this._dirId;
        },
        setDirId : function(dirId) {
            this._dirId = dirId;
        },
        getName : function() {
            return this._name;
        },
        getSize : function() {
            return this._size;
        },
        getDate : function() {
            return new Date(this._date * 1000);
        },
        setCrc : function(crc) {
            this._crc = crc;
        },
        getExtension : function() {
            if (this._extension === null) {
                this._extension = getFileExtension(this._name).toUpperCase();
                switch (this._extension) {
                case 'JPEG':
                    this._extension = 'JPG';
                    break;
                }
            }
            return this._extension;
        },
        getBasename : function() {
            if (this._basename === null) {
                this._basename = getFileBasename(this._name);
            }
            return this._basename;
        },
        sameAsPercent : function(entry) {
            var percent = 0;
            // size and crc give exact identity, except for collisions
            if ((this._size === entry._size) && (this._crc === entry._crc)) {
                percent += 50;
            }
            // date gives an hint, date is the last modification date
            if (this._date === entry._date) {
                percent += 10;
            }
            // name gives same content, except for duplicates
            if (this._name === entry._name) {
                percent += 40;
            } else {
                // extension means same content type
                if (this.getExtension() === entry.getExtension()) {
                    var thisBasename = this.getBasename();
                    var entryBasename = entry.getBasename();
                    // base name gives same content, except for duplicates
                    if (thisBasename === entryBasename) {
                        percent += 40;
                    } else {
                        if (thisBasename.length > entryBasename.length) {
                            if (thisBasename.indexOf(entryBasename) >= 0) {
                                percent += 10;
                            }
                        } else if (thisBasename.length < entryBasename.length) {
                            if (entryBasename.indexOf(thisBasename) >= 0) {
                                percent += 10;
                            }
                        }
                    }
                }
            }
            return percent;
        },
        sameAs : function(entry, ceil) {
            if (typeof ceil !== 'number') {
                ceil = 50;
            }
            return this.sameAsPercent(entry) >= ceil;
        },
        toString : function() {
            return this._dirId + ',' + this._size + ',' + this._date + ',' + this._crc.toString(16) + ',' + this._name;
        }
    });

    var getEntryFile = function(entry, directories) {
        var dirname = directories[entry.getDirId()];
        return new File(dirname, entry.getName());
    };

    var getEntryDir = function(entry, directories) {
        return new File(directories[entry.getDirId()]);
    };

    var getOrCreateDirId = function(dirname, directories) {
        for (var i = 0; i < directories.length; i++) {
            if (dirname === directories[i]) {
                return i;
            }
        }
        directories.push(dirname);
        return directories.length - 1;
    };

    var CacheEntryChange = Class.create({
        initialize : function() {
        },
        newEntry : function(entry, directories) {
            return new CacheEntry(entry);
        },
        makeEntry : function(entry, directories) {
        },
        process : function(entry, directories, preview) {
            var newEntry = this.newEntry(entry, directories);
            if (!preview) {
                this.makeEntry(entry, newEntry, directories);
            }
            return newEntry;
        }
    });

    var mkdirs = function(file) {
        // mkdirs is not supported
        if (file.isDirectory()) {
            return true;
        }
        var parentFile = file.getParentFile();
        if (!((parentFile === null) || parentFile.isDirectory() || mkdirs(parentFile))) {
            return false;
        }
        return file.mkdir();
    };

    var CacheEntryChangeMove = Class.create(CacheEntryChange, {
        initialize : function($super, path, relative, format, mkdirs) {
            $super();
            this._path = path;
            this._relative = typeof relative === 'boolean' && relative;
            this._format = typeof format === 'boolean' && format;
            this._mkdirs = typeof mkdirs === 'boolean' && mkdirs;
        },
        newEntry : function(entry, directories) {
            var newEntry = new CacheEntry(entry);
            var dirname = directories[newEntry.getDirId()];
            var path = this._format ? Formatter.format(this._path, newEntry.getDate()) : this._path;
            var newDir = this._relative ? new File(dirname, path) : new File(path);
            var newDirname = newDir.getPath();
            if (dirname !== newDirname) {
                var dirId = getOrCreateDirId(newDirname, directories);
                newEntry.setDirId(dirId);
            }
            return newEntry;
        },
        makeEntry : function(entry, newEntry, directories) {
            var dirname = directories[entry.getDirId()];
            var file = new File(dirname, entry.getName());
            var newDirname = directories[newEntry.getDirId()];
            var newDir = new File(newDirname);
            if (!newDir.isDirectory()) {
                //mkdirs(newDir);
            }
            var newFile = new File(newDir, newEntry.getName());
            //file.renameTo(newFile.getPath());
        }
    });

    var CacheEntryChangeRemove = Class.create(CacheEntryChange, {
        newEntry : function(entry) {
            return null;
        },
        makeEntry : function(entry, newEntry, directories) {
            var dirname = directories[entry.getDirId()];
            var file = new File(dirname, entry.getName());
            //file.remove();
        }
    });

    var buffer = ByteBuffer.allocate(1024);
    
    var Cache = Class.create({
        initialize : function() {
            this._directories = [];
            this._files = [];
            this._id = 'files';
        },
        addAll: function(that) {
            var lastDirId = this._directories.length;
            this._directories = this._directories.concat(that._directories);
            for (var i = 0; i < that._files.length; i++) {
                var entry = that._files[i];
                entry.shift(lastDirId);
                this._files.push(entry);
            }
            return this;
        },
        copy: function() {
            var that = new Cache();
            that.setId(this.getId());
            that.addAll(this);
            return that;
        },
        getId: function() {
            return this._id;
        },
        setId: function(id) {
            this._id = id;
            return this;
        },
        getFileCount: function() {
            return this._files.length;
        },
        clear: function() {
            this._directories = [];
            this._files = [];
            return this;
        },
        cleanDirectories: function() {
            var idMap = [];
            for (var i = 0; i < this._directories.length; i++) {
                idMap.push(-1);
            }
            var directories = [];
            for (var i = 0; i < this._files.length; i++) {
                var entry = this._files[i];
                var id = entry.getDirId();
                var newId = idMap[id];
                if (newId === -1) {
                    newId = idMap[id] = directories.length;
                    directories.push(this._directories[id]);
                }
                entry.setDirId(newId);
            }
            this._directories = directories;
            return this;
        },
        load: function(repository) {
            var file = new File(repository, this._id + '_directories.txt');
            var lastDirId = this._directories.length;
            if (file.isFile()) {
                this._directories = this._directories.concat(loadAsLines(file));
            }
            file = new File(repository, this._id + '_files.txt');
            if (file.isFile()) {
                var lines = loadAsLines(file);
                for (var i = 0; i < lines.length; i++) {
                    var entry = new CacheEntry(lines[i]);
                    entry.shift(lastDirId);
                    this._files.push(entry);
                }
            }
            return this;
        },
        save: function(repository) {
            var file = new File(repository, this._id + '_directories.txt');
            save(file, this._directories);
            file = new File(repository, this._id + '_files.txt');
            save(file, this._files);
            return this;
        },
        add: function(dir) {
            var that = this;
            forEachFile(dir, function(file, dirIndex) {
                var entry = new CacheEntry(file, dirIndex);
                that._files.push(entry);
            }, function(file) {
                var index = that._directories.length;
                that._directories.push(file.getPath());
                return index;
            });
            return this;
        },
        getEntryFile: function(entry) {
            return getEntryFile(entry, this._directories);
        },
        computeCrc: function() {
            for (var i = 0; i < this._files.length; i++) {
                entry = this._files[i];
                var file = this.getEntryFile(entry);
                entry.setCrc(crcLoad(file, buffer));
            }
            return this;
        },
        applyChange : function(change, preview) {
            var directories = this._directories.concat([]);
            var entries = [];
            for (var i = 0; i < this._files.length; i++) {
                var entry = this._files[i];
                var newEntry = change.process(entry, directories, preview);
                if (newEntry !== null) {
                    entries.push(newEntry);
                }
            }
            this._directories = directories;
            this._files = entries;
            return this;
        },
        info: function(out) {
            if (typeof out === 'undefined') {
                out = System.out;
            }
            var size = 0;
            for (var i = 0; i < this._files.length; i++) {
                var entry = this._files[i];
                size += entry.getSize();
            }
            out.println(this._files.length + ' files, ' + size + ' bytes');
            return this;
        },
        listDir: function(out) {
            if (typeof out === 'undefined') {
                out = System.out;
            }
            var dirs = [];
            for (var i = 0; i < this._directories.length; i++) {
                dirs.push({count: 0, size: 0});
            }
            for (var i = 0; i < this._files.length; i++) {
                var entry = this._files[i];
                var dir = dirs[entry.getDirId()];
                dir.count++;
                dir.size += entry.getSize();
            }
            for (var i = 0; i < this._directories.length; i++) {
                var dir = dirs[i];
                out.println(this._directories[i] + ' [' + dir.count + ' files, ' + dir.size + ' bytes]');
            }
            return this;
        },
        list: function(out) {
            if (typeof out === 'undefined') {
                out = System.out;
            }
            for (var i = 0; i < this._files.length; i++) {
                var file = this.getEntryFile(this._files[i]);
                out.println(file.getPath());
            }
            return this;
        },
        print: function(out) {
            if (typeof out === 'undefined') {
                out = System.out;
            }
            for (var i = 0; i < this._files.length; i++) {
                var entry = this._files[i];
                out.println(entry.toString());
            }
            return this;
        },
        status: function() {
            return 'id ' + this.getId() + ' with ' + this.getFileCount() + ' file(s)';
        },
        filterDuplicates: function(negate, ceil) {
            var keep = !negate;
            var entries = [];
            for (var i = this._files.length - 1; i >= 0; i--) {
                var entry = this._files[i];
                for (var j = i - 1; j >= 0; j--) {
                    var pde = this._files[j];
                    if (pde.sameAs(entry, ceil) === keep) {
                        entries.push(entry);
                        break;
                    }
                }
            }
            this._files = entries;
            return this;
        },
        filterPath: function(re, negate) {
            var keep = !negate;
            var entries = [];
            for (var j = 0; j < this._directories.length; j++) {
                var directory = this._directories[j];
                if (re.test(directory) === keep) {
                    for (var i = 0; i < this._files.length; i++) {
                        var entry = this._files[i];
                        if (entry.getDirId() === j) {
                            entries.push(entry);
                        }
                    }
                }
            }
            this._files = entries;
            return this;
        },
        filterName: function(re, negate) {
            var keep = !negate;
            var entries = [];
            for (var i = 0; i < this._files.length; i++) {
                var entry = this._files[i];
                if (re.test(entry.getName()) === keep) {
                    entries.push(entry);
                }
            }
            this._files = entries;
            return this;
        },
        hasSame: function(anEntry, ceil) {
            for (var i = 0; i < this._files.length; i++) {
                var entry = this._files[i];
                if (entry.sameAs(anEntry, ceil)) {
                    return true;
                }
            }
            return false;
        },
        filterSame: function(that, negate, ceil) {
            var keepSame = !negate;
            var entries = [];
            for (var i = this._files.length - 1; i >= 0; i--) {
                var entry = this._files[i];
                if (that.hasSame(entry, ceil) === keepSame) {
                    entries.push(entry);
                }
            }
            this._files = entries;
            return this;
        },
        intersection: function(that, ceil) {
            var intersection = this.copy();
            intersection.filterSame(that, false, ceil);
            intersection.cleanDirectories();
            return intersection;
        },
        exclude: function(that, ceil) {
            var intersection = this.copy();
            intersection.filterSame(that, true, ceil);
            intersection.cleanDirectories();
            return intersection;
        }
    });

    var FileSet = Class.create({});

    Object.extend(FileSet, {
        main : function(args) {
            var cache = new Cache();
            var cacheStack = [cache];
            var repository = new File('.');
            var ceil = 50;
            var argDir, argRegExp;
            var args = System.getArguments();
            var argIndex = 0;
            while (argIndex < args.length) {
                var arg = args[argIndex++];
                var nextArg = '';
                if ((argIndex < args.length) && (args[argIndex].charAt(0) !== '-')) {
                    nextArg = args[argIndex++];
                }
                switch (arg) {
                case '--id':
                    if (nextArg) {
                        cache.setId(nextArg);
                    } else {
                        System.out.println('Id is ' + cache.getId());
                    }
                    break;
                case '--ceil':
                    if (nextArg) {
                        ceil = parseInt(nextArg, 10);
                    } else {
                        System.out.println('Ceil is ' + ceil);
                    }
                    break;
                case '-r':
                case '--repository':
                    if (nextArg) {
                        argDir = new File(nextArg);
                        if (argDir.isDirectory()) {
                            repository = argDir;
                        }
                    } else {
                        System.out.println('Repository is "' + repository + '"');
                    }
                    break;
                case '--clear':
                    cache.clear();
                    break;
                case '--pop':
                    if (cacheStack.length > 1) {
                        cacheStack.shift();
                        cache = cacheStack[0];
                    }
                    break;
                case '--new':
                case '--push':
                    cache = new Cache();
                    cacheStack.unshift(cache);
                    break;
                case '--copy':
                    cache = cache.copy();
                    cacheStack.unshift(cache);
                    break;
                case '--switch':
                    if (cacheStack.length > 1) {
                        cache = cacheStack[1];
                        cacheStack[1] = cacheStack[0];
                        cacheStack[0] = cache;
                    }
                    break;
                case '--clean':
                    cache.cleanDirectories();
                    break;
                case '--clear':
                    cache.clear();
                    break;
                case '--load':
                    cache = new Cache();
                    cache.setId(nextArg);
                    cache.load(repository);
                    cacheStack.unshift(cache);
                    break;
                case '--save':
                    if (nextArg) {
                        cache.setId(nextArg);
                    }
                    cache.save(repository);
                    break;
                case '--add':
                    argDir = new File(nextArg);
                    if (argDir.isDirectory()) {
                        System.out.println('adding ' + argDir.getPath());
                        cache.add(argDir);
                    } else {
                        System.out.println('cannot add ' + argDir.getPath());
                    }
                    break;
                case '--crc':
                    System.out.println('computing crc...');
                    cache.computeCrc();
                    break;
                case '--move':
                    argDir = new File(nextArg);
                    cache.applyChange(new CacheEntryChangeMove(argDir.getPath(), !argDir.isAbsolute(), nextArg.indexOf('%t') >= 0, true));
                    break;
                case '--moveDate':
                    argDir = new File(nextArg);
                    argDir = new File(argDir, '%tY/%<tY-%<tm-%<td');
                    cache.applyChange(new CacheEntryChangeMove(argDir.getPath(), !argDir.isAbsolute(), true, true));
                    break;
                case '--moveMonth':
                    argDir = new File(nextArg);
                    argDir = new File(argDir, '%tY/%<tY-%<tm');
                    cache.applyChange(new CacheEntryChangeMove(argDir.getPath(), !argDir.isAbsolute(), true, true));
                    break;
                case '--listDir':
                    cache.listDir();
                    break;
                case '--list':
                    cache.list();
                    break;
                case '--print':
                    cache.print();
                    break;
                case '--info':
                    cache.info();
                    break;
                case '--stack':
                    for (var i = cacheStack.length - 1; i >= 0; i--) {
                        System.out.println('' + i + ':' + cacheStack[i].status());
                    }
                    break;
                case '--exclude':
                    if (cacheStack.length > 1) {
                        cache = cacheStack.shift().exclude(cacheStack.shift(), ceil);
                        cacheStack.unshift(cache);
                    }
                    break;
                case '--intersection':
                    if (cacheStack.length > 1) {
                        cache = cacheStack.shift().intersection(cacheStack.shift(), ceil);
                        cacheStack.unshift(cache);
                    }
                    break;
                case '--keepDuplicates':
                    System.out.println('keeping duplicate...');
                    cache.filterDuplicates(false, ceil);
                    break;
                case '--filterDuplicates':
                    System.out.println('filtering...');
                    cache.filterDuplicates(true, ceil);
                    break;
                case '--filterPath':
                    var negate = false;
                    if (nextArg.charAt(0) === '!') {
                        negate = true;
                        nextArg = nextArg.substring(1);
                    }
                    argRegExp = new RegExp(nextArg);
                    System.out.println('filtering...');
                    cache.filterPath(argRegExp, negate);
                    break;
                case '--filterName':
                    var negate = false;
                    if (nextArg.charAt(0) === '!') {
                        negate = true;
                        nextArg = nextArg.substring(1);
                    }
                    argRegExp = new RegExp(nextArg);
                    System.out.println('filtering...');
                    cache.filterName(argRegExp, negate);
                    break;
                case '--filterJpeg':
                    var negate = nextArg === '!';
                    System.out.println('filtering...');
                    cache.filterName(/\.jpe?g$/i, negate);
                    break;
                case '--help':
                    System.err.println('Try:');
                    System.err.println('  --add [directory]');
                    System.exit(22);
                    break;
                default:
                    System.err.println('Invalid argument, ' + args[argIndex]);
                    System.exit(22);
                }
                System.out.println(cache.status());
            }
        }
    });

    return FileSet;
});
