var Combinatorics = require('js-combinatorics');

module.exports = function(config){

    var obj = {};
    var child = require('child'),
        config = config || {},
        sshBind = config.sshBind || false;

    //http://stackoverflow.com/questions/10530532/
    function textToArgs(s){
        var words = [];
        s.replace(/"([^"]*)"|'([^']*)'|(\S+)/g,function(g0,g1,g2,g3){ words.push(g1 || g2 || g3 || '')});
        return words
    }

    var sysExec = function(command, onData, onClose){

        onData = onData || function(){}
        onClose = onClose || function(){}

        if (sshBind != false)
        {
            var runCommand = sshBind.slice();
            runCommand.push(command)
        } else {
            var runCommand = textToArgs(command);
        }

        var errors = '';

        child({
            command: runCommand.slice(0,1)[0],
            args: runCommand.slice(1),
            cbStdout: function(data){ onData(''+data) },
            cbStderr: function(data){ errors+=data; onData(''+data) },
            cbClose: function(exitCode){ onClose(exitCode == 0 ? null:exitCode,  errors) }
        }).start()
    }


    obj.create = function(name, template, config, cbComplete, cbData){
        sysExec('lxc-create -n '+name+' -t '+template, cbComplete, cbData);
    }

    obj.destroy = function(name, cbComplete, cbData){
        sysExec('lxc-destroy -n '+ name, cbComplete, cbData);
    }

    obj.mount = function(name, cb){
        var output = '';
        sysExec('zfs mount lxc/' + name,
            function(data) {
                output += data;
            }, function(error) {
              cb(error, output);
            }
        );
    };

    function djb2(str) {
          var hash = 5381;
            for (i = 0; i < str.length; i++) {
                char = str.charCodeAt(i);
                hash = ((hash << 5) + hash) + char; /* hash * 33 + c */
            }
        return hash;
      }

    obj.rlim_cur = function(name, cb){
        var output = '';
                var cmd = 'lxc-cgroup -n ' + name + ' rlim.rlim_cur 192';
                console.log('cmd: ' + cmd);
        sysExec(cmd,
            function(data) {
                output += data;
            }, function(error) {
              cb(error, output);
            }
        );
    };

    obj.rlim_max = function(name, cb){
        var output = '';
                var cmd = 'echo "1000" > /sys/fs/cgroup/pids/lxc/' + name + '/pids.max';
                console.log('cmd: ' + cmd);
        sysExec(cmd,
            function(data) {
                output += data;
            }, function(error) {
              cb(error, output);
            }
        );
    };

    obj.mem = function(name, cb){
        var output = '';
                var cmd = 'lxc-cgroup -n ' + name + ' memory.limit_in_bytes 1024M';
                console.log('cmd: ' + cmd);
        sysExec(cmd,
            function(data) {
                output += data;
            }, function(error) {
              cb(error, output);
            }
        );
    };

    obj.memswap = function(name, cb){
        var output = '';
                var cmd = 'lxc-cgroup -n ' + name + ' memswap.limit_in_bytes 1536M';
                console.log('cmd: ' + cmd);
        sysExec(cmd,
            function(data) {
                output += data;
            }, function(error) {
              cb(error, output);
            }
        );
    };

    obj.cpuset = function(name, cb){
        var output = '';
                var available_cpus = ['2','3','4','5','6','7'];
                var cmb = Combinatorics.combination(available_cpus, 2); // give each container two different cpus out of six
                var cpus = cmb.next();
                for (var i = 0; i < 15; i++, cpus = cmb.next()) { // there are 15
                    if (djb2(name) % 15 === i) break;
                }
                var cmd = 'lxc-cgroup -n ' + name + ' cpuset.cpus "' + cpus.join(',') + '"';
                console.log('cmd: ' + cmd);
        sysExec(cmd,
            function(data) {
                output += data;
            }, function(error) {
              cb(error, output);
            }
        );
    };

        function multiplier(suffix) {
            if (suffix === 'KiB') return 1024;
            if (suffix === 'MiB') return 1024 * 1024;
            if (suffix === 'GiB') return 1024 * 1024 * 1024;
            if (suffix === 'TiB') return 1024 * 1024 * 1024 * 1024;
            if (suffix === 'PiB') return 1024 * 1024 * 1024 * 1024 * 1024;
            if (suffix === 'KB' || suffix === 'K') return 1000;
            if (suffix === 'MB' || suffix === 'M') return 1000 * 1000;
            if (suffix === 'GB' || suffix === 'G') return 1000 * 1000 * 1000;
            if (suffix === 'TB' || suffix === 'T') return 1000 * 1000 * 1000 * 1000;
            if (suffix === 'PB' || suffix === 'P') return 1000 * 1000 * 1000 * 1000 * 1000;
            return 1;
        }

        obj.info = function(name, cb){
        var output = '';
        sysExec('lxc-info -n '+name, 
                        function(data){
                                output+=data
                        }, function(error){
                                var lines = output.split('\n');
                                var ob = {};
                                for (var i in lines) {
                                        var line = lines[i];
                                        var words = line.match(/\S+/g);
                                        if (!words) continue;
                                        if (words[0] === 'Name:') {
                                                ob.name = words[1];
                                        }
                                        if (words[0] === 'State:') {
                                                ob.state = words[1];
                                        }
                                        if (words[0] === 'PID:') {
                                                ob.pid = parseInt(words[1]);
                                        }
                                        if (words[0] === 'IP:') {
                                                ob.ip = words[1];
                                        }
                                        if (words[0] === 'CPU') {
                                                ob.cpu = parseInt(words[2]);
                                        }
                                        if (words[0] === 'BlkIO') {
                                                ob.blkio = parseInt(words[2]) * multiplier(words[3]);
                                        }
                                        if (words[0] === 'Memory') {
                                                ob.mem = parseInt(words[2]) * multiplier(words[3]);
                                        }
                                        if (words[0] === 'KMem') {
                                                ob.kmem = parseInt(words[2]) * multiplier(words[3]);
                                        }
                                        if (words[0] === 'Link:') {
                                                ob.link = words[1];
                                        }
                                        if (words[0] === 'TX') {
                                                ob.tx = parseInt(words[2]) * multiplier(words[3]);
                                        }
                                        if (words[0] === 'RX') {
                                                ob.rx = parseInt(words[2]) * multiplier(words[3]);
                                        }
                                        if (words[0] === 'Total') {
                                                ob.rxtx = parseInt(words[2]) * multiplier(words[3]);
                                        }
                                }
                    cb(error, ob);
                        }
        );
        };

    obj.start = function(name, cb){
        var output = '';
        sysExec('lxc-start -n ' + name + ' -d',
            function(data) {
                output += data;
            }, function() {
              var error;
              if (output.indexOf('no configuration file') >= 0) {
                  error = new Error("Container does not exist");
              }
              cb(error, output);
            }
        );
    };

    obj.stop = function(name, cb){
        var output = '';
        sysExec('lxc-stop -n ' + name,
            function(data) {
              output += data;
            }, function(error) {
              cb(error, output);
            }
        );
    };

    obj.unmount = function(name, cb){
        var output = '';
        sysExec('zfs unmount lxc/' + name,
            function(data) {
                output += data;
            }, function(error) {
              cb(error, output);
            }
        );
    };

    obj.freeze = function(name, cbData, cbComplete){
        sysExec('lxc-freeze -n '+name, cdData, cbComplete);
    }

    obj.unfreeze = function(name, cbData, cbComplete){
        sysExec('lxc-unfreeze -n '+name, cdData, cbComplete);
    }

    /**
     * creates a container by copying an old one
     * @param oldName
     * @param newName
     * @param cbData
     * @param cbComplete
     */
    obj.copy = function(name, newName, snapshot, cbData, cbComplete){
        sysExec('lxc-copy ' + (snapshot ? '-s ' : '') + '--name ' +name + ' --newname '+newName, cbData, cbComplete);
    }

    /**
     * creates a new snapshot
     * @param name
     * @param cbComplete
     * @param cbData
     */
    obj.createSnapshot = function(name, cbData, cbComplete){
        sysExec('lxc-snapshot -n '+name, cbData, cbComplete);
    }

    /**
     * deletes a snapshot
     * @param name
     * @param snapshotName
     * @param cbComplete
     * @param cbData
     */
    obj.deleteSnapshot = function(name, snapshotName, cbData, cbComplete){
        sysExec('lxc-snapshot -n '+name+' -d '+snapshotName, cbData, cbComplete);
    }

    /**
     * restores a snapshot
     * @param name
     * @param snapshotName
     * @param newName [optional] name of restored lxc.
     * @param cbComplete
     * @param cbData
     */
    obj.restoreSnapshot  = function(name, snapshotName, newName, cbData, cbComplete){
        if(typeof newName === 'function'){
            cbData = cbComplete;
            cbComplete = newName;
            newName = name;
        }
        sysExec('lxc-snapshot -n '+name+' -r '+snapshotName+" -N "+newName, cbData, cbComplete);
    }

    /**
     * Lists all snapshots
     * @param name
     * @param cbComplete
     * @param cbData
     */
    obj.listSnapshots  = function(name, cbData, cbComplete){
        var output = '';
        sysExec('lxc-snapshot -L -n '+name, function(data){output+=data}, function(error){
            output = output.split("\n");

            var ret = [];
            output.forEach(function(line){
                line = line.split(" ");
                ret.push({
                   name: line[0],
                   dir: line[1],
                   date: line[2]+" "+line[3]
                });
            });

            return ret;
        });
    }

    /**
     * returns machine's ip
     * @param name
     * @param cbComplete
     */
    obj.getIP = function(name, cbComplete) {
        var output = '';
        sysExec('lxc-info -H -i -n '+name, function(data){output+=data}, function(error){
            cbComplete(error, output);
        });
    }

    /**
     * Wrapper for lxc-attach command
     * @param name
     * @param command
     * @param cbComplete
     */
    obj.attach = function(name, command, cbComplete) {
        var output = '';
        sysExec('lxc-attach -n '+name+' -- '+command, function(data){output+=data}, function(error){
            cbComplete(error, output);
        });
    }

    obj.list = function(cb){
        var output = '';
        sysExec('lxc-ls -f',
            function(data) {
                output += data;
            }, function(error){
                var containers = {};
                output = output.split("\n");
                for (i in output) {
                    var content = output[i].trim();

                    if (content.indexOf('RUNNING') >= 0 ||
                            content.indexOf('FROZEN') >= 0 ||
                            content.indexOf('STOPPED') >= 0) {
                        vals = content.split(/\s+/gi);
                        if (vals.length >= 2) {
                            containers[vals[0]] = {
                                "name": vals[0],
                                "state": vals[1],
                                "autostart": vals[2],
                                "groups": vals[3],
                                "ipv4": vals[4],
                                "ipv6": vals[5]
                            };
                        }
                    }
                }
                cb(error, containers);
            }
        );
    }

    return obj;
}
