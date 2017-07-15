# tuxdotio
The code from the defunct tux.io site.

Sorry for the mess, this code was hacked together while being hits hundreds of times a minute by Reddit and Hacker News traffic.

The project was abandoned due to cost.  It orignally had three 32GB dedicated servers.  That was reduced to one, but even one server costs $500 a year.  Peak traffic was about 2,000 unique users per day.  This had declined to about 40 unique users per day.  If 10% of users would pay for the service, it would have cost them $125 a year, due to under utlisation of the server.  (It can cope with 30 simulateous users, enough for many 100's of unique users per day.)

# interesting bits
This code isn't very interesting, but...
<pre>
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
</pre>

This code fixes all the attacks I saw when running it live, i.e. fork bombs, bitcoin mining, etc.

# improvements
If I were to do this again, I would make some major changes:
- Abandon ZFS and use a file system image and overlays - this would allow the underling OS to be kept upto date, without having to keep all the ZFS forks up to date too.  ZFS would sometimes freeze (oncee a week) and need a reboot to start working again.
- Use a database for storing statistics.

# things done right
While this project is a mess, there are a couple of good areas:
- app.js uses a multi-step approach to starting the VMs, by looking at the output of lxc commands.  This is much better than acting on the expected state of containers.
- The use of maxmind for load balanceing worked well with three servers.
