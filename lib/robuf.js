"use strict";

function Robuf() {
  this.uint8Arrays = [];
  this.length = 0;
}

Robuf.prototype.push = function(uint8Array) {
  this.uint8Arrays.push(uint8Array);
  this.length += uint8Array.length;
};

Robuf.prototype.octetAt = function(offset) {
  var arrOff = 0;
  for (var i = 0; i < this.uint8Arrays.length; i++) {
    var uint8Array = this.uint8Arrays[i];
    if (offset < arrOff + uint8Array.length) {
      // we've found it
      return uint8Array[offset - arrOff];
    }
    arrOff += uint8Array.length;
  }
  throw new Error('index out of range');
};

Robuf.prototype.peek = function(length) {
  if (length > this.length) throw new Error('not enough bytes');

};


module.exports.Robuf = Robuf;