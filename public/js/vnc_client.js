var VNCClient = function(canvas) {
  this._rfb_canvas = new RFBCanvas(canvas);
  this._socket = false;
  this.ws = null;
};

VNCClient.prototype.send = function(data){
  this.ws.send(data);
};

VNCClient.prototype.serverInitComplete = function(rfb_client) {
  this._rfb_canvas.resize(rfb_client._framebuffer_width,
    rfb_client._framebuffer_height);
  document.title = rfb_client._server_name;
};

VNCClient.prototype.frameBufferUpdate = function(rfb_client, update) {
  this._rfb_canvas.drawRect(update.x, update.y, update.w, update.h, update.data);
};

VNCClient.prototype.frameBufferCopyrect = function(rfb_client, update){
  this._rfb_canvas.copyRect(update.x, update.y, update.w, update.h, update.src_x, update.src_y);
};

VNCClient.prototype.bindEvents = function(rfb_client) {
  var vnc = this;
  rfb_client.on(rfb_client.VNC_SERVER_INIT_COMPLETE, function() {
    vnc.serverInitComplete(this);
  });
  rfb_client.on(rfb_client.VNC_FRAME_BUFFER_UPDATE, function(update) {
    vnc.frameBufferUpdate(this, update);
  });
  rfb_client.on(rfb_client.VNC_FRAME_BUFFER_COPYRECT, function(update) {
    console.log("Copy rect called");
    vnc.frameBufferCopyrect(this, update);
  });
};

VNCClient.prototype.connect = function() {
  console.log('connecting');
  var ws_url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  this.ws = new WebSocket(ws_url);
  this.ws.binaryType = 'arraybuffer';

  var rfb_client = new RFBClient(this.ws, this._rfb_canvas);
  this.bindEvents(rfb_client);

  this.ws.onopen = function() {
    console.log("connected");
  };

  this.ws.onclose = function() {
    console.log("The connection has <strong>closed</strong> :(");
  };

  this.ws.onmessage = function(msg){
    console.log("data arrived: " + msg.data);
    rfb_client.dataReceived(msg);
  };
};