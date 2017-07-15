"use strict";

var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var net = require('net');
var os = require('os');
var spawn = require('child_process').spawn;
var lxc = require('./lib/lxc')();
var date_log = require('./lib/date_log');
var exec = require( "child_process" ).exec;


// payment system
var FREE_CREDIT = process.FREE_CREDIT = 5000; // millicents
var COST_PER_CPUSEC = 10;
var COST_PER_MB_TX = 10;
var COST_PER_MB_RX = 10;
var spending = process.spending = {
  by_fingerprint: {}, // http://valve.github.io/fingerprintjs2/
  by_ip: {},
  by_sid: {}
};
/* e.g.
by_ip: {
  '1.2.3.4': {
    '2017-04-19T12:13:41.234Z_d6Y7w': {
      cpu: 156,
      rx: 4587543,
      tx: 154532,
      cost: 174
    }
  }
}
*/

var payments = process.payments = {
  by_fingerprint: {},
  by_ip: {},
  by_sid: {}
};
/*
by_sid: {
  'd3YU2': {
    // continue here
  }
}
*/
// end payment system



var servers = process.servers = [
  { name: 'de0', number: 0, ipv4:'5.9.147.142' },
  { name: 'ca0', number: 1, ipv4:'149.56.24.89' }//,
  //{ name: 'de1', number: 2, ipv4:'5.9.29.177' }
];

var host = process.host = os.hostname().split('.')[0];
var server_for_ipv4 = process.server_for_ipv4 = {};
for (var i in servers) {
  if (servers[i].name === host) {
    process.server = servers[i]; // TODO: look this up, from the server's IPv4 address
  }
  server_for_ipv4[servers[i].ipv4] = servers[i];
}
if (!process.server) {
  console.error(host + ' is not in ' + JSON.stringify(servers));
  process.exit(1);
}

function make_json_log(prefix, suffix) {
  var _log = date_log(prefix, suffix);
  return function(ob) {
    var out = {ts: new Date().toISOString(), host:host, pid: process.pid};
    for (var p in ob) {
      out[p] = ob[p];
    }
    _log(out);
  }
}
var log = process.log = make_json_log('/var/log/rd/', 'rd.log');

log({server_started:{server:process.server}});

var maxmind = require('maxmind');
var cityLookup = process.cityLookup = maxmind.openSync('/srv/rd/GeoLite2-City.mmdb');

process.stats = {
  pregenerated_sid_hits: 0,
  pregenerated_sid_misses: 0
};
process.conn_stats = {};
process.conns_for_sid = {};
process.pregenerated_sids = [];
process.poised = {} // sids that are expecting an imminent connection
process.ipv4_for_sid = {};
process.deathlist = {}; // a map from sid to timeout which will cause the VM to be stopped
process.stopped_callback_for_sid = {}; // callbacks for VMs which are stopping, many will be NOPs, just there as a flag
                                       // FIXME: do these need to be lists?

process.pregenerate_sid = function(sid) {
  console.log('pregenerating ' + sid);
  getReady(sid, function(ipv4) {
    console.log('pregenerated ', sid, ipv4);
    setTimeout(function() {
      // give the new server a few minutes to get to the desktop
      console.log('pregenerated moved to pool', sid, ipv4);
      process.pregenerated_sids.push(sid);
    }, 180000);
  });
};

var routes = require('./routes/index');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


function getReady(sid, callback) {
  var step1_attempts = 0;
  var step2_attempts = 0;
  var step3_attempts = 0;
  var MAX_ATTEMPTS = 1;
  var STEP3_MAX_ATTEMPTS = 20;

  step1();

  function step1() {
    //log({step1:{sid: sid}});
    if (step1_attempts > MAX_ATTEMPTS) {
      console.error('MAX_ATTEMPTS exceeded');
      return;
    }
    lxc.list(function(err, list) {
      if (err) {
        console.error(err);
        return;
      }

      //console.log('list', list);
      // create the vm (by cloning) if it doesn't exist
      if (!list[sid]) {
        step1_attempts++;
        lxc.copy('xfce', sid, true, console.log, step1);
      } else {
        step2();
      }
    });
  }

  // start the container, if it is not running
  function step2() {
    log({step2:{sid: sid}});
    if (step2_attempts > MAX_ATTEMPTS) {
      console.error('MAX_ATTEMPTS exceeded');
      return;
    }
    lxc.list(function(err, list) {
      if (err) {
        console.error(err);
        return;
      }
      if (!list[sid]) {
        console.error('sid ' + sid + ' not in list');
        return;
      }
      //console.log('list', list);
      if (list[sid].state === 'RUNNING') {
        lxc.cpuset(sid, function() {
          lxc.mem(sid, function() {
            lxc.memswap(sid, function() {
              lxc.rlim_cur(sid, function() {
                lxc.rlim_max(sid, function() {
                  step3(list);
                });
              });
            });
          });
        });
      } else {
        step2_attempts++;
        lxc.mount(sid, function() {
          exec('chgrp www-data /lxc/' + sid);
          exec('chgrp www-data /lxc/' + sid + '/home');
          exec('chgrp -R www-data /lxc/' + sid + '/home/tux');
          lxc.start(sid, step2);
        });
      }
    });
  }

  // wait for the container to get an address
  function step3() {
    //log({step3:{sid: sid}});
    if (step3_attempts > STEP3_MAX_ATTEMPTS) {
      console.error('STEP3_MAX_ATTEMPTS exceeded');
      return;
    }
    lxc.list(function(err, list) {
      if (err) {
        console.error(err);
        return;
      }
      if (!list[sid]) {
        console.error('sid ' + sid + ' not in list');
        return;
      }
      //console.log('list', list);
      if (list[sid].state === 'RUNNING' && list[sid].ipv4 !== '-') {
        step4(list[sid].ipv4);
      } else {
        step3_attempts++;
        setTimeout(step3, 1000);
      }
    });
  }

  // start the vncserver
  function step4(ipv4) {
    //log({step4: {sid: sid}});
    lxc.attach(sid, '/usr/bin/sudo -i -u tux /usr/bin/vncserver', function(err, output) {
      if (err) {
        console.error(err);
        return;
      }
      process.ipv4_for_sid[sid] = ipv4;
      callback(ipv4);
    });
  }

}

app.handleWebsocketConnection = function(ws_conn) {
  //console.log('WebSocket connection.', ws_conn.upgradeReq);
  var sid = ws_conn.upgradeReq.url.split('/').slice(-1)[0];
  var stats = process.stats;
  if (!stats[sid]) {
    stats[sid] = {
      vnc: {
        ws_opened: 0,
        vnc_opened: 0,
        rx: 0,
        tx: 0,
        ws_closed: 0,
        vnc_closed: 0,
        ws_error: 0,
        vnc_error: 0
      }
    }
  }
  var sid_stats = stats[sid];
  sid_stats.vnc.ws_opened++;

  // removed poised sid
  if (process.poised[sid]) {
    log({poised_sid_used:{sid:sid}});
    delete process.poised[sid];
  }

  var conn_stats = process.conn_stats;
  var cip = ws_conn.upgradeReq.headers['x-forwarded-for'] || ws_conn.upgradeReq.connection.remoteAddress;
  log({upgradeReq:ws_conn.upgradeReq.headers});
  var cid = cip + '_' + ws_conn.upgradeReq.connection.remotePort;
  log({ws_opened:{sid: sid, cid: cid, city: cityLookup.get(cip)}});
  conn_stats[cid] = {
    sid: sid,
    cid: cid,
    vnc: {
      connected: new Date(),
      rx: 0,
      tx: 0,
      disconnected: null
    }
  };
  var cid_stats = conn_stats[cid];

  if (process.conns_for_sid[sid]) {
    process.conns_for_sid[sid]++;
  } else {
    process.conns_for_sid[sid] = 1;
  }

  // this handles page refreshes
  if (process.deathlist[sid]) {
    clearTimeout(process.deathlist[sid]);
    delete process.deathlist[sid];
  }

  // if there is a pregenerated/running VM, use that, or if the VM is already running
  if (process.ipv4_for_sid[sid]) {
    step6(process.ipv4_for_sid[sid]);
    //delete process.ipv4_for_sid[sid]; don't delete it, we can use the same IP on refresh, if it's not stopped
  } else { // otherwise it is a reconnection to a stopped or stopping VM
    if (process.stopped_callback_for_sid[sid]) { // stopping
      // add a callback, for when the stopping has completed (it takes just a couple of seconds)
      log({container_stopping_will_restart:{sid: sid}});
      process.stopped_callback_for_sid[sid] = function () { // FIXME: what happens when multiple user of the same VM try to connect at the same time?
        log({container_stopping_being_restart:{sid: sid}});
        getReady(sid, step6);
      };
    } else {
      getReady(sid, step6);
    }
  }

  function step6(addr) {
    //log({step6:{addr: addr}});
    var sock = new net.Socket();
    sock.connect(5901, addr, function() {
      //console.log('sock connected');
      log({vnc_opened:{sid: sid, cid: cid, lcid: addr+':5901'}});
      sid_stats.vnc.vnc_opened++;
      sock.on('data', function(data) {
        //console.log('>', data);
        sid_stats.vnc.tx += data.length;
        cid_stats.vnc.tx += data.length;
        try {
          ws_conn.send(data);
        } catch(e) {
          log({error_ws_send_failed:{sid: sid, cid: cid, lcid: addr+':5901', error:JSON.stringify(e)}});
          sock.end();
        }
      });
      ws_conn.on('message', function(message) {
        //console.log('>', message);
        sid_stats.vnc.rx += message.length;
        cid_stats.vnc.rx += message.length;
        sock.write(message);
      });
      ws_conn.on('data', function(data) {
        //console.log('<', data);
        sid_stats.vnc.rx += data.length;
        cid_stats.vnc.rx += data.length;
        sock.write(data);
      });
    });
    sock.on('close', function() {
      //console.log('sock closed');
      log({vnc_closed:{sid: sid, cid: cid}});
      sid_stats.vnc.vnc_closed++;
      ws_conn.close();
    });
    sock.on('error', function(err) {
      //console.log('sock error', err);
      log({vnc_error:{sid: sid, cid: cid, err:err}});
      sid_stats.vnc.vnc_error++;
    });
    ws_conn.on('error', function(err) {
      //console.log('ws_conn error', err);
      log({ws_error:{sid: sid, cid: cid, err:err}});
      sid_stats.vnc.ws_error++;
    });
    ws_conn.on('close', function() {
      //console.log('ws_conn closed');
      log({ws_closed:{sid: sid, cid: cid}});
      sid_stats.vnc.ws_closed++;
      cid_stats.vnc.ws_closed++;
      process.conns_for_sid[sid]--;
      if (process.conns_for_sid[sid] < 1) {
        process.deathlist[sid] = setTimeout(function() {
          log({stopping_container:{sid: sid}});
          process.stopped_callback_for_sid[sid] = function() {}; // dummy callback
          delete process.ipv4_for_sid[sid];
          lxc.stop(sid, function (args) {
            console.log('stopped container: ' + sid + ', args: ' + args);
            process.stopped_callback_for_sid[sid]();
            delete process.stopped_callback_for_sid[sid];
            lxc.unmount(sid, function() {});
          });
        }, 10000); // stop VMs ten seconds after disconnection
      }
      sock.end()
    });
  }

};
module.exports = app;
