var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');

function date_log(prefix, suffix) {
  var _stream = null;
  var _date = null;

	return function logger(ob) {
    var today = new Date().toISOString().substring(0, 10);
    if (today != _date) {
      if (_stream) {
        _stream.close();
      }
      _date = today;
      var abspath = prefix + '/' + today.substr(0,4) + '/' + today.substr(5,2) + '/' + today.substr(8,2) + '/' + suffix;
      var dirname = path.dirname(abspath) + '/';
      mkdirp(dirname, function(err) {
        if (err) {
          console.log("error creating " + dirname, err);
          process.exit(103);
        }
        _stream = fs.createWriteStream(abspath, {flags: 'a'});
        part2();
      });
    } else {
      part2();
    }

    function part2() {
      if (typeof ob === 'string') {
        _stream.write(ob + '\n');
      } else {
        _stream.write(JSON.stringify(ob) + '\n');
      }
    }
	}
}

module.exports = date_log;
