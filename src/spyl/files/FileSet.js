define('spyl/files/FileSet', [
  'jls/lang/Class',
  'jls/lang/Exception',
  'jls/lang/System',
  'jls/lang/Logger',
  'jls/lang/Promise',
  'jls/lang/ByteBuffer',
  'jls/lang/CharBuffer',
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
                        forEachFile(file, fileFn, dirFn);
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
            var separator = ',';
            var endDirIdIndex = s.indexOf(separator);
            var endSizeIndex = s.indexOf(separator, endDirIdIndex + 1);
            var endDateIndex = s.indexOf(separator, endSizeIndex + 1);
            var endCrcIndex = s.indexOf(separator, endDateIndex + 1);
            if ((endDirIdIndex > 0) && (endSizeIndex > endDirIdIndex) && (endDateIndex > endSizeIndex) && (endCrcIndex > endDateIndex)) {
                this._dirId = parseInt(s.substring(0, endDirIdIndex), 10);
                this._size = parseInt(s.substring(endDirIdIndex + 1, endSizeIndex), 10);
                this._date = parseInt(s.substring(endSizeIndex + 1, endDateIndex), 10);
                this._crc = parseInt(s.substring(endDateIndex + 1, endCrcIndex), 16);
                this._name = s.substring(endCrcIndex + 1);
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
        computeCrc: function() {
            for (var i = 0; i < this._files.length; i++) {
                var entry = this._files[i];
                var dirname = this._directories[entry.getDirId()];
                var file = new File(dirname, entry.getName());
                entry.setCrc(crcLoad(file, buffer));
            }
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
                var entry = this._files[i];
                var dirname = this._directories[entry.getDirId()];
                var file = new File(dirname, entry.getName());
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
        duplicates: function() {
            var duplicates = [];
            for (var i = this._files.length - 1; i >= 0; i--) {
                var entry = this._files[i];
                for (var j = i - 1; j >= 0; j--) {
                    var pde = this._files[j];
                    if (pde.sameAs(entry)) {
                        duplicates.push(entry);
                        break;
                    }
                }
            }
            return duplicates;
        },
        keepDuplicates: function() {
            this._files = this.duplicates();
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
        hasSame: function(anEntry) {
            for (var i = 0; i < this._files.length; i++) {
                var entry = this._files[i];
                if (entry.sameAs(anEntry)) {
                    return true;
                }
            }
            return false;
        },
        filterSame: function(that, negate) {
            var keepSame = !negate;
            var entries = [];
            for (var i = this._files.length - 1; i >= 0; i--) {
                var entry = this._files[i];
                if (that.hasSame(entry) === keepSame) {
                    entries.push(entry);
                }
            }
            this._files = entries;
            return this;
        },
        intersection: function(that) {
            var intersection = this.copy();
            intersection.filterSame(that, false);
            intersection.cleanDirectories();
            return intersection;
        },
        exclude: function(that) {
            var intersection = this.copy();
            intersection.filterSame(that, true);
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
                case '--repository':
                    argDir = new File(nextArg);
                    if (argDir.isDirectory()) {
                        repository = argDir;
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
                case '--keepDuplicates':
                    System.out.println('keeping duplicate...');
                    cache.keepDuplicates();
                    break;
                case '--exclude':
                    if (cacheStack.length > 1) {
                        cache = cacheStack.shift().exclude(cacheStack.shift());
                        cacheStack.unshift(cache);
                    }
                    break;
                case '--intersection':
                    if (cacheStack.length > 1) {
                        cache = cacheStack.shift().intersection(cacheStack.shift());
                        cacheStack.unshift(cache);
                    }
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
