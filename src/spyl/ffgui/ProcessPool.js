define('spyl/ffgui/ProcessPool', [
  'jls/lang/Class',
  'jls/lang/Exception',
  'jls/lang/System',
  'jls/lang/Logger',
  'jls/lang/Thread',
  'jls/lang/Monitor',
  'jls/lang/Lock',
  'jls/lang/ProcessBuilder'
], function (
  Class,
  Exception,
  System,
  Logger,
  Thread,
  Monitor,
  Lock,
  ProcessBuilder
) {

    var ProcessThread = Class.create(Thread, {
        initialize : function($super, pool, daemon, shared) {
            this._pool = pool;
            this._monitor = new Monitor();
            this._running = true;
            this._processObj = null;
            this._process = null;
            $super(daemon, shared);
            this.start(this);
            Logger.getInstance().debug('ProcessThread initialized');
        },
        terminate : function() {
            this._running = false;
            this._monitor.notify();
            this.join();
            this.close();
            Logger.getInstance().debug('ProcessThread terminated');
        },
        isBusy : function() {
            return this._processObj != null;
        },
        startProcess : function(processObj) {
            if (this._processObj != null) {
                throw 'thread is busy';
            }
            this._processObj = processObj;
            Logger.getInstance().debug('ProcessThread notifying...');
            this._monitor.notify();
        },
        run : function() {
            Logger.getInstance().debug('ProcessThread is running');
            while (this._running) {
                var processObj = this._processObj;
                if (processObj != null) {
                    Logger.getInstance().debug('ProcessThread starting ' + processObj.args.join(' '));
                    var pb = new ProcessBuilder(processObj.args);
                    this._process = pb.start();
                    Logger.getInstance().debug('ProcessThread waiting for process...');
                    var exitValue = this._process.waitFor();
                    Logger.getInstance().debug('ProcessThread exitValue: ' + exitValue);
                    this._process = null;
                    this._processObj = null;
                    this._pool._onExecuted(this, processObj, exitValue);
                } else {
                    Logger.getInstance().debug('ProcessThread is waiting');
                    this._monitor.wait();
                }
            }
            Logger.getInstance().debug('ProcessThread is terminated');
        }
    });

    var ProcessPool = Class.create({
        initialize : function(size) {
            this._size = size || 1;
            this._threads = [];
            this._executeQueue = [];
        },
        setSize : function(size) {
            this._size = size;
        },
        shutdown : function() {
            Logger.getInstance().debug('ProcessPool.shutdown()');
            while (this._threads.length > 0) {
                var thread = this._threads.pop();
                thread.terminate();
            }
        },
        _getNextAvailableThread : function() {
            for (var i = 0; i < this._threads.length; i++) {
                var thread = this._threads[i];
                if (! thread.isBusy()) {
                    return thread;
                }
            }
            if (this._threads.length < this._size) {
                var thread = new ProcessThread(this);
                this._threads.push(thread);
                return thread;
            }
            return null;
        },
        execute : function(args, callback, context) {
            this._executeQueue.push({
                args: args,
                callback: callback || null,
                context: context || this
            });
            this._wakeup();
        },
        _onExecuted : function(thread, processObj, exitValue) {
            Logger.getInstance().debug('ProcessPool._onExecuted()');
            this._wakeup();
            if (typeof processObj.callback == 'function') {
                var context = typeof processObj.context != 'undefined' ? processObj.context : this;
                Logger.getInstance().debug('ProcessPool._onExecuted() callback...');
                processObj.callback.call(context, exitValue);
                Logger.getInstance().debug('ProcessPool._onExecuted() ...callback');
            }
        },
        _wakeup : function() {
            Logger.getInstance().debug('ProcessPool._wakeup() [' + this._executeQueue.length + ']');
            if (this._executeQueue.length == 0) {
                return;
            }
            var thread = this._getNextAvailableThread();
            if (thread == null) {
                Logger.getInstance().debug('No available thread');
                return;
            }
            var processObj = this._executeQueue.shift();
            thread.startProcess(processObj);
        }
    });

    return ProcessPool;
});
