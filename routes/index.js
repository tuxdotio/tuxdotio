var express = require('express');
var router = express.Router();
var os = require('os');
var lxc = require('../lib/lxc')();
var Step = require('step');
var crypto = require('crypto'),
  algorithm = 'aes-256-cbc',
  password = 'c1393a0a41d73cc3';
const SECRET = 'c1393a0a41d73cc3';
var MAX_CONTAINERS = 30;
//var MAX_CONTAINERS = 1;
var MAX_LOAD = 16;
var POOL_SIZE = 4;
//var POOL_SIZE = 1;

var vpn_for_ipv4 = {
  '185.145.38.229': 'de92',
  '68.168.119.228': 'ca82',
  '185.143.230.235': 'de82'
};
/*
function _getDistance(a, b) {
  var fromLocation = maxmind.getLocation(a);
  if (!fromLocation) return Number.MAX_VALUE;
  var toLocation = maxmind.getLocation(b);
  if (!toLocation) return Number.MAX_VALUE;

  console.log('From:\t', fromLocation.countryName, fromLocation.city);
  console.log('To:\t', toLocation.countryName, toLocation.city);
  const dist = toLocation.distance(fromLocation);
  console.log('Dist:\t', dist);
  return dist;
}
*/

// pregenerate one container
//process.pregenerate_sid(encrypt(new_id(4) + '|' + server_name));
function spawnToPoolIfRequired() {
  var num_containers = Object.keys(process.ipv4_for_sid).length;
  var num_poised = Object.keys(process.poised).length;
  var num_pool = process.pregenerated_sids.length;
  var loadavg = os.loadavg();
  if (num_pool + num_poised >= POOL_SIZE) {
    process.log({no_spawn:{reason:'POOL_SIZE', num_pool: num_pool, num_poised: num_poised, POOL_SIZE: POOL_SIZE}});
    setTimeout(spawnToPoolIfRequired, 10000);
    return;
  }
  if (num_containers >= MAX_CONTAINERS) {
    process.log({no_spawn:{reason:'MAX_CONTAINERS', num_containers: num_containers, MAX_CONTAINERS: MAX_CONTAINERS}});
    setTimeout(spawnToPoolIfRequired, 10000);
    return;
  }
  if (loadavg[0] >= MAX_LOAD) {
    process.log({no_spawn:{reason:'MAX_LOAD', loadavg: loadavg, MAX_LOAD: MAX_LOAD}});
    setTimeout(spawnToPoolIfRequired, 10000);
    return;
  }
  var sid = (new_hmac_id(5, process.server.number));
  process.log({spawn:{sid: sid}});
  process.pregenerate_sid(sid);
  setTimeout(spawnToPoolIfRequired, 60000);
}
setTimeout(function () {
  spawnToPoolIfRequired();
}, 1000);

setInterval(function() {
  var stats = {
    num_containers: Object.keys(process.ipv4_for_sid).length,
    num_poised: Object.keys(process.poised).length,
    num_pool: process.pregenerated_sids.length,
    loadavg: os.loadavg()
  };
  process.log({stats: stats});

  var pool = {};
  var in_use = {};
  var other = {};
  var countdown = stats.num_containers;
  if (countdown < 1) return;
  for (var sid in process.ipv4_for_sid) {
    var container = {
      info: null,
      ipv4: process.ipv4_for_sid[sid],
      connections: []
    };
    if (process.pregenerated_sids.indexOf(sid) > -1) {
      pool[sid] = container;
    }
    for (var conn in process.conn_stats) {
      if (process.conn_stats[conn].sid === sid) {
        container.connections.push(process.conn_stats[conn]);
      }
    }
    if (container.connections.length > 0) {
      in_use[sid] = container;
    }
    if (!pool[sid] && !in_use[sid]) {
      other[sid] = container;
    }
    (function (s, cont) {
      lxc.info(s, function (err, info) {
        if (err) {
          throw err;
        }
        cont.info = info;
        if (--countdown === 0) {
          process.log({
            vm_states: {
              pool: pool,
              in_use: in_use,
              other: other
            }
          });
        }
      });
    })(sid, container);
  }
}, 10000);

/* GET home page. */
router.get('/', function(req, res, next) {
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  if (ip.split('.')[0] === '10' || process.server_for_ipv4[ip] || vpn_for_ipv4[ip]) {
    return res.send(403, '403 - recursive connections are forbidden');
  }
  // TODO: redirect to payment page, asking for money?
  //if (os.loadavg()[0] > 8.0 || os.loadavg()[1] > 8.0 || os.loadavg()[2] > 8.0 ) {
  //  res.send(503, 'Server too busy, try again later.  Load averages: ' + os.loadavg() + '.');
  //} else {
    //res.redirect('/session/' + new_id(8));
    var host = req.headers.host;
    console.log('ip', ip);
    var sid;

		var lookup = process.cityLookup.get(ip);
		var pos;
		var nearest = process.server;
		if (lookup && lookup.location && lookup.country) {
		  pos = { lat: lookup.location.latitude,
							lng: lookup.location.longitude,
							acc: lookup.location.accuracy_radius,
			  			iso: lookup.country.iso_code };
			if (pos.lng < -30.0) {
				nearest = process.servers[0]; // de0 -- ca0 is going away
			} else {
//        if (pos.lng < 0.0) {
          nearest = process.servers[0]; // de0
//        } else {
//          nearest = process.servers[2]; // de1
//        }
			}
		}
		process.log({root_request:{ip:ip, pos:pos, nearest: nearest, headers:req.headers}});

		// redirect to nearest server, if this is not it
		if (host == 'tux.io') { // only redirect tux.io
	  	if (process.server !== nearest) {
		    var url = 'https://' + nearest.name + '.tux.io';
		    process.log({root_redirect:{ip:ip, pos:pos, nearest: nearest, url: url, headers:req.headers}});
		    return res.redirect(url);
		  }
		}

    // if there are too many containers running on this server, deny access
    //var num_containers = Object.keys(process.ipv4_for_sid).length;
    //if (num_containers > MAX_CONTAINERS) {
    //  process.log({server_full:{ip:ip, num_containers:num_containers}});
    //  return res.send(503, '<html><body><p>Sorry, the server is too full.</p><p>Thanks for trying.  This is a small beta test running on limited hardware resources.</p><p><a href="mailto:waiting_list@tux.io">Email us</a> and we will tell you when we have added more resources.</p></body></html>');
    //}

    var other_servers = '';
    for (var i in process.servers) {
      var s = process.servers[i];
      if (s !== process.server) {
        other_servers += '<a href="https://' + s.name + '.tux.io">https://' + s.name + '.tux.io</a> ';
      }
    }

    if (os.loadavg()[0] > MAX_LOAD * 4) {
      process.log({server_busy:{ip:ip, loadavg:os.loadavg()}});
      //return res.send(503, '<html><body><p>Sorry, the server is too busy.</p><p>Thanks for trying.  This is a small beta test running on limited hardware resources.</p><p><a href="mailto:waiting_list@tux.io">Email us</a> and we will tell you when we have added more resources.</p><p>Otherwise, you may find space the other servers: ' + other_servers + '</p></body></html>');
      return res.send(503, '<html><body><p>Sorry, the server is too busy.</p><p>Thanks for trying.  This is a small beta test running on limited hardware resources.</p><p><a href="mailto:waiting_list@tux.io">Email us</a> and we will tell you when we have added more resources.</p></body></html>');
    }

  /*
    setTimeout(function () {
      if (process.pregenerated_sids.length < POOL_SIZE && num_containers < MAX_CONTAINERS) {
        //process.pregenerate_sid(encrypt(new_id(4) + '|' + server_name));
        process.pregenerate_sid((new_hmac_id(5, process.server.number)));
      }
    }, 12000);  // a replacement, or a first for the pool. if it is empty
    */

    if (process.pregenerated_sids.length > 0) {
      process.stats.pregenerated_sid_hits++;
      sid = process.pregenerated_sids.shift();
      process.poised[sid] = true;
      process.log({poised_sid:{sid:sid}});
      setTimeout(function() {
        if (process.poised[sid]) { // not used
          process.log({poised_sid_unused:{sid:sid}});
          process.pregenerated_sids.push(sid);
          delete process.poised[sid];
        }
      }, 10000);
      /*
      setTimeout(function () {
        if (process.pregenerated_sids.length < (POOL_SIZE - 1) && num_containers < (MAX_CONTAINERS - 1)) {
          //process.pregenerate_sid(encrypt(new_id(4) + '|' + server_name));
          process.pregenerate_sid((new_hmac_id(5, process.server.number)));
        }
      }, 60000);  // expand the pool, if not yet near POOL_SIZE - this is only done when the pool is not exhausted to help defend against a pool attack
      */
      return res.redirect('https://' + process.server.name + '.tux.io/vm/' + sid + '/desktop');
    } else {
      process.log({pool_empty:{ip:ip}});
      //return res.send(503, '<html><body><p>Sorry, the server is full.</p><p>Thanks for trying.  This is a small beta test running on limited hardware resources.</p><p><a href="mailto:waiting_list@tux.io">Email us</a> and we will tell you when we have added more resources.</p><p>Otherwise, you may find space on the other servers: ' + other_servers + '</p></body></html>');
      return res.send(503, '<html><body><p>Sorry, the server is full.</p><p>Thanks for trying.  This is a small beta test running on limited hardware resources.</p><p><a href="mailto:waiting_list@tux.io">Email us</a> and we will tell you when we have added more resources.</p></body></html>');
      //return res.send(503, '<html><body><p>Sorry, the server is busy, please hit refresh in 10-20 seconds, or tomorrow if still busy.</p><p>This is a small beta test running on limited hardware resources.</p></body></html>');
      //sid = new_hmac_id(5, process.server.number);
      //process.stats.pregenerated_sid_misses++;
      ////process.pregenerate_sid((new_hmac_id(5, process.server.number)));
    }
  //}
});

router.get('/robots.txt', function(req, res, next) {
  res.send(200, 'User-agent: *\r\nDisallow: /\r\n');
});

router.get('/message_to_wayback_machine.txt', function(req, res, next) {
  res.send(200, 'Please remove all pages scraped on https://web.archive.org/web/20140112083017/http://tux.io/ https://web.archive.org/web/20140225060143/http://tux.io/ and https://web.archive.org/web/20131212085422/http://tux.io/');
});

router.get('/75stats', function(req, res, next) {
  res.render('stats', {
    stats: JSON.stringify(process.stats, null, 2),
    conn_stats: JSON.stringify(process.conn_stats, null, 2),
    port_for_sid: JSON.stringify(process.port_for_sid, null, 2),
    conns_for_sid: JSON.stringify(process.conns_for_sid, null, 2),
    pregenerated_sids: JSON.stringify(process.pregenerated_sids, null, 2),
    ipv4_for_sid: JSON.stringify(process.ipv4_for_sid, null, 2),
    deathlist: JSON.stringify(process.deathlist, null, 2),
    stopped_callback_for_sid: JSON.stringify(process.stopped_callback_for_sid, null, 2)
  });
});

router.get('/75state', function(req, res, next) {
  var pool = {};
  var in_use = {};
  var other = {};
  var countdown = Object.keys(process.ipv4_for_sid).length;
  if (countdown < 1) return res.render('state',{pool:[],in_use:[],other:[]});
  for (var sid in process.ipv4_for_sid) {
    var container = {
      info: null,
      ipv4: process.ipv4_for_sid[sid],
      connections: []
    };
    if (process.pregenerated_sids.indexOf(sid) > -1) {
      pool[sid] = container;
    }
    for (var conn in process.conn_stats) {
      if (process.conn_stats[conn].sid === sid) {
        container.connections.push(process.conn_stats[conn]);
      }
    }
    if (container.connections.length > 0) {
      in_use[sid] = container;
    }
    if (!pool[sid] && !in_use[sid]) {
      other[sid] = container;
    }
    (function (s, cont) {
      lxc.info(s, function (err, info) {
        if (err) {
          throw err;
        }
        cont.info = info;
        if (--countdown === 0) {
          res.render('state', {
            pool: JSON.stringify(pool, null, 2),
            in_use: JSON.stringify(in_use, null, 2),
            other: JSON.stringify(other, null, 2)
          });
        }
      });
    })(sid, container);
  }
});

/*
router.get('/vnc', function(req, res, next) {
  res.render('vnc', {});
});

router.get('/vnc_auto', function(req, res, next) {
  res.render('vnc_auto', {});
});
*/

router.get('/vm/:sid/desktop', function(req, res, next) {
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  if (ip.split('.')[0] === '10' || process.server_for_ipv4[ip] || vpn_for_ipv4[ip]) {
    return res.send(403, '403 - recursive connections are forbidden');
  }
  /*
  var decrypted = decrypt(req.params.sid);
  var parts = decrypted.split('|');
  if (parts.length !== 2) return next(new Error('invalid sid: ' + decrypted));
  var server_name = parts[1];
  if (server_name !== process.server.name) return next(new Error('wrong server'));
  */
  var server_number = hmac_varint(req.params.sid);
  //if (server_number !== process.server.number) return next(new Error('bad sid'));
  if (server_number > 2) return next(new Error('bad sid'));
  res.render('index', { sid: req.params.sid });
});
router.get('/vm/:sid/admin', function(req, res, next) {
  res.render('admin', { sid: req.params.sid });
});


router.get('/welcome', function(req, res, next) {
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  console.log(ip);
  if (ip.split('.')[0] === '10' || process.server_for_ipv4[ip] || vpn_for_ipv4[ip]) {
    res.render('welcome', {sid: req.params.sid});
  } else {
    res.send(404);
  }
});

module.exports = router;

function new_hmac_id(len, varint, chars) {
  var id = new_id(len, chars);
  for (var i = 0; hmac_varint(id) != varint; i++) {
    id = new_id(len, chars);
  }
  console.log('finding id ' + id + ' took ' + i + 'attempts');
  return id;
}

function new_id(len, chars) {
  var id = '';
  len = len || 16;
  chars = chars || "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  while (id.length < len) {
    var num = chars.length;
    while (num >= chars.length) {
      num = crypto.randomBytes(1)[0];
    }
    id += chars[num];
  }
  return id;
}

function hmac_varint(text) {
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(text);
  const digest = hmac.digest();
  return digest[0]; // FIXME: extend this to parsing a varint, if we ever need more than 128 servers
}

function encrypt(text){
  var cipher = crypto.createCipher(algorithm,password)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}

function decrypt(text){
  var decipher = crypto.createDecipher(algorithm,password)
  var dec = decipher.update(text,'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
}

module.exports = router;
