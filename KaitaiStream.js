/**
  KaitaiStream is an implementation of Kaitai Struct API for JavaScript.
  Based on DataStream - https://github.com/kig/DataStream.js

  @param {ArrayBuffer} arrayBuffer ArrayBuffer to read from.
  @param {?Number} byteOffset Offset from arrayBuffer beginning for the KaitaiStream.
  */
KaitaiStream = function(arrayBuffer, byteOffset) {
  this._byteOffset = byteOffset || 0;
  if (arrayBuffer instanceof ArrayBuffer) {
    this.buffer = arrayBuffer;
  } else if (typeof arrayBuffer == "object") {
    this.dataView = arrayBuffer;
    if (byteOffset) {
      this._byteOffset += byteOffset;
    }
  } else {
    this.buffer = new ArrayBuffer(arrayBuffer || 1);
  }
  this.position = 0;
};
KaitaiStream.prototype = {};

/* Fix for Opera 12 not defining BYTES_PER_ELEMENT in typed array prototypes. */
if (Uint8Array.prototype.BYTES_PER_ELEMENT === undefined) {
    Uint8Array.prototype.BYTES_PER_ELEMENT = Uint8Array.BYTES_PER_ELEMENT; 
    Int8Array.prototype.BYTES_PER_ELEMENT = Int8Array.BYTES_PER_ELEMENT; 
    Uint8ClampedArray.prototype.BYTES_PER_ELEMENT = Uint8ClampedArray.BYTES_PER_ELEMENT; 
    Uint16Array.prototype.BYTES_PER_ELEMENT = Uint16Array.BYTES_PER_ELEMENT; 
    Int16Array.prototype.BYTES_PER_ELEMENT = Int16Array.BYTES_PER_ELEMENT; 
    Uint32Array.prototype.BYTES_PER_ELEMENT = Uint32Array.BYTES_PER_ELEMENT; 
    Int32Array.prototype.BYTES_PER_ELEMENT = Int32Array.BYTES_PER_ELEMENT; 
    Float64Array.prototype.BYTES_PER_ELEMENT = Float64Array.BYTES_PER_ELEMENT; 
}

/**
  Whether to extend KaitaiStream buffer when trying to write beyond its size.
  If set, the buffer is reallocated to twice its current size until the
  requested write fits the buffer.
  @type {boolean}
  */
KaitaiStream.prototype._dynamicSize = true;
Object.defineProperty(KaitaiStream.prototype, 'dynamicSize',
  { get: function() {
      return this._dynamicSize;
    },
    set: function(v) {
      if (!v) {
        this._trimAlloc();
      }
      this._dynamicSize = v;
    } });

/**
  Virtual byte length of the KaitaiStream backing buffer.
  Updated to be max of original buffer size and last written size.
  If dynamicSize is false is set to buffer size.
  @type {number}
  */
KaitaiStream.prototype._byteLength = 0;

/**
  Returns the byte length of the KaitaiStream object.
  @type {number}
  */
Object.defineProperty(KaitaiStream.prototype, 'byteLength',
  { get: function() {
    return this._byteLength - this._byteOffset;
  }});

/**
  Set/get the backing ArrayBuffer of the KaitaiStream object.
  The setter updates the DataView to point to the new buffer.
  @type {Object}
  */
Object.defineProperty(KaitaiStream.prototype, 'buffer',
  { get: function() {
      this._trimAlloc();
      return this._buffer;
    },
    set: function(v) {
      this._buffer = v;
      this._dataView = new DataView(this._buffer, this._byteOffset);
      this._byteLength = this._buffer.byteLength;
    } });

/**
  Set/get the byteOffset of the KaitaiStream object.
  The setter updates the DataView to point to the new byteOffset.
  @type {number}
  */
Object.defineProperty(KaitaiStream.prototype, 'byteOffset',
  { get: function() {
      return this._byteOffset;
    },
    set: function(v) {
      this._byteOffset = v;
      this._dataView = new DataView(this._buffer, this._byteOffset);
      this._byteLength = this._buffer.byteLength;
    } });

/**
  Set/get the backing DataView of the KaitaiStream object.
  The setter updates the buffer and byteOffset to point to the DataView values.
  @type {Object}
  */
Object.defineProperty(KaitaiStream.prototype, 'dataView',
  { get: function() {
      return this._dataView;
    },
    set: function(v) {
      this._byteOffset = v.byteOffset;
      this._buffer = v.buffer;
      this._dataView = new DataView(this._buffer, this._byteOffset);
      this._byteLength = this._byteOffset + v.byteLength;
    } });

/**
  Internal function to resize the KaitaiStream buffer when required.
  @param {number} extra Number of bytes to add to the buffer allocation.
  @return {null}
  */
KaitaiStream.prototype._realloc = function(extra) {
  if (!this._dynamicSize) {
    return;
  }
  var req = this._byteOffset + this.position + extra;
  var blen = this._buffer.byteLength;
  if (req <= blen) {
    if (req > this._byteLength) {
      this._byteLength = req;
    }
    return;
  }
  if (blen < 1) {
    blen = 1;
  }
  while (req > blen) {
    blen *= 2;
  }
  var buf = new ArrayBuffer(blen);
  var src = new Uint8Array(this._buffer);
  var dst = new Uint8Array(buf, 0, src.length);
  dst.set(src);
  this.buffer = buf;
  this._byteLength = req;
};

/**
  Internal function to trim the KaitaiStream buffer when required.
  Used for stripping out the extra bytes from the backing buffer when
  the virtual byteLength is smaller than the buffer byteLength (happens after
  growing the buffer with writes and not filling the extra space completely).

  @return {null}
  */
KaitaiStream.prototype._trimAlloc = function() {
  if (this._byteLength == this._buffer.byteLength) {
    return;
  }
  var buf = new ArrayBuffer(this._byteLength);
  var dst = new Uint8Array(buf);
  var src = new Uint8Array(this._buffer, 0, dst.length);
  dst.set(src);
  this.buffer = buf;
};

/**
  Sets the KaitaiStream read/write position to given position.
  Clamps between 0 and KaitaiStream length.

  @param {number} pos Position to seek to.
  @return {null}
  */
KaitaiStream.prototype.seek = function(pos) {
  var npos = Math.max(0, Math.min(this.byteLength, pos));
  this.position = (isNaN(npos) || !isFinite(npos)) ? 0 : npos;
};

/**
  Returns true if the KaitaiStream seek pointer is at the end of buffer and
  there's no more data to read.

  @return {boolean} True if the seek pointer is at the end of the buffer.
  */
KaitaiStream.prototype.isEof = function() {
  return (this.position >= this.byteLength);
};

/**
  Maps an Int32Array into the KaitaiStream buffer, swizzling it to native
  endianness in-place. The current offset from the start of the buffer needs to
  be a multiple of element size, just like with typed array views.

  Nice for quickly reading in data. Warning: potentially modifies the buffer
  contents.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} Int32Array to the KaitaiStream backing buffer.
  */
KaitaiStream.prototype.mapInt32Array = function(length, e) {
  this._realloc(length * 4);
  var arr = new Int32Array(this._buffer, this.byteOffset+this.position, length);
  KaitaiStream.arrayToNative(arr, e == null ? this.endianness : e);
  this.position += length * 4;
  return arr;
};

/**
  Maps an Int16Array into the KaitaiStream buffer, swizzling it to native
  endianness in-place. The current offset from the start of the buffer needs to
  be a multiple of element size, just like with typed array views.

  Nice for quickly reading in data. Warning: potentially modifies the buffer
  contents.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} Int16Array to the KaitaiStream backing buffer.
  */
KaitaiStream.prototype.mapInt16Array = function(length, e) {
  this._realloc(length * 2);
  var arr = new Int16Array(this._buffer, this.byteOffset+this.position, length);
  KaitaiStream.arrayToNative(arr, e == null ? this.endianness : e);
  this.position += length * 2;
  return arr;
};

/**
  Maps an Int8Array into the KaitaiStream buffer.

  Nice for quickly reading in data.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} Int8Array to the KaitaiStream backing buffer.
  */
KaitaiStream.prototype.mapInt8Array = function(length) {
  this._realloc(length * 1);
  var arr = new Int8Array(this._buffer, this.byteOffset+this.position, length);
  this.position += length * 1;
  return arr;
};

/**
  Maps a Uint32Array into the KaitaiStream buffer, swizzling it to native
  endianness in-place. The current offset from the start of the buffer needs to
  be a multiple of element size, just like with typed array views.

  Nice for quickly reading in data. Warning: potentially modifies the buffer
  contents.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} Uint32Array to the KaitaiStream backing buffer.
  */
KaitaiStream.prototype.mapUint32Array = function(length, e) {
  this._realloc(length * 4);
  var arr = new Uint32Array(this._buffer, this.byteOffset+this.position, length);
  KaitaiStream.arrayToNative(arr, e == null ? this.endianness : e);
  this.position += length * 4;
  return arr;
};

/**
  Maps a Uint16Array into the KaitaiStream buffer, swizzling it to native
  endianness in-place. The current offset from the start of the buffer needs to
  be a multiple of element size, just like with typed array views.

  Nice for quickly reading in data. Warning: potentially modifies the buffer
  contents.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} Uint16Array to the KaitaiStream backing buffer.
  */
KaitaiStream.prototype.mapUint16Array = function(length, e) {
  this._realloc(length * 2);
  var arr = new Uint16Array(this._buffer, this.byteOffset+this.position, length);
  KaitaiStream.arrayToNative(arr, e == null ? this.endianness : e);
  this.position += length * 2;
  return arr;
};

/**
  Maps a Uint8Array into the KaitaiStream buffer.

  Nice for quickly reading in data.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} Uint8Array to the KaitaiStream backing buffer.
  */
KaitaiStream.prototype.mapUint8Array = function(length) {
  this._realloc(length * 1);
  var arr = new Uint8Array(this._buffer, this.byteOffset+this.position, length);
  this.position += length * 1;
  return arr;
};

/**
  Maps a Float64Array into the KaitaiStream buffer, swizzling it to native
  endianness in-place. The current offset from the start of the buffer needs to
  be a multiple of element size, just like with typed array views.

  Nice for quickly reading in data. Warning: potentially modifies the buffer
  contents.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} Float64Array to the KaitaiStream backing buffer.
  */
KaitaiStream.prototype.mapFloat64Array = function(length, e) {
  this._realloc(length * 8);
  var arr = new Float64Array(this._buffer, this.byteOffset+this.position, length);
  KaitaiStream.arrayToNative(arr, e == null ? this.endianness : e);
  this.position += length * 8;
  return arr;
};

/**
  Maps a Float32Array into the KaitaiStream buffer, swizzling it to native
  endianness in-place. The current offset from the start of the buffer needs to
  be a multiple of element size, just like with typed array views.

  Nice for quickly reading in data. Warning: potentially modifies the buffer
  contents.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} Float32Array to the KaitaiStream backing buffer.
  */
KaitaiStream.prototype.mapFloat32Array = function(length, e) {
  this._realloc(length * 4);
  var arr = new Float32Array(this._buffer, this.byteOffset+this.position, length);
  KaitaiStream.arrayToNative(arr, e == null ? this.endianness : e);
  this.position += length * 4;
  return arr;
};

/**
  Reads an Int32Array of desired length and endianness from the KaitaiStream.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} The read Int32Array.
 */
KaitaiStream.prototype.readInt32Array = function(length, e) {
  length = length == null ? (this.byteLength-this.position / 4) : length;
  var arr = new Int32Array(length);
  KaitaiStream.memcpy(arr.buffer, 0,
                    this.buffer, this.byteOffset+this.position,
                    length*arr.BYTES_PER_ELEMENT);
  KaitaiStream.arrayToNative(arr, e == null ? this.endianness : e);
  this.position += arr.byteLength;
  return arr;
};

/**
  Reads an Int16Array of desired length and endianness from the KaitaiStream.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} The read Int16Array.
 */
KaitaiStream.prototype.readInt16Array = function(length, e) {
  length = length == null ? (this.byteLength-this.position / 2) : length;
  var arr = new Int16Array(length);
  KaitaiStream.memcpy(arr.buffer, 0,
                    this.buffer, this.byteOffset+this.position,
                    length*arr.BYTES_PER_ELEMENT);
  KaitaiStream.arrayToNative(arr, e == null ? this.endianness : e);
  this.position += arr.byteLength;
  return arr;
};

/**
  Reads an Int8Array of desired length from the KaitaiStream.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} The read Int8Array.
 */
KaitaiStream.prototype.readInt8Array = function(length) {
  length = length == null ? (this.byteLength-this.position) : length;
  var arr = new Int8Array(length);
  KaitaiStream.memcpy(arr.buffer, 0,
                    this.buffer, this.byteOffset+this.position,
                    length*arr.BYTES_PER_ELEMENT);
  this.position += arr.byteLength;
  return arr;
};

/**
  Reads a Uint32Array of desired length and endianness from the KaitaiStream.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} The read Uint32Array.
 */
KaitaiStream.prototype.readUint32Array = function(length, e) {
  length = length == null ? (this.byteLength-this.position / 4) : length;
  var arr = new Uint32Array(length);
  KaitaiStream.memcpy(arr.buffer, 0,
                    this.buffer, this.byteOffset+this.position,
                    length*arr.BYTES_PER_ELEMENT);
  KaitaiStream.arrayToNative(arr, e == null ? this.endianness : e);
  this.position += arr.byteLength;
  return arr;
};

/**
  Reads a Uint16Array of desired length and endianness from the KaitaiStream.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} The read Uint16Array.
 */
KaitaiStream.prototype.readUint16Array = function(length, e) {
  length = length == null ? (this.byteLength-this.position / 2) : length;
  var arr = new Uint16Array(length);
  KaitaiStream.memcpy(arr.buffer, 0,
                    this.buffer, this.byteOffset+this.position,
                    length*arr.BYTES_PER_ELEMENT);
  KaitaiStream.arrayToNative(arr, e == null ? this.endianness : e);
  this.position += arr.byteLength;
  return arr;
};

/**
  Reads a Uint8Array of desired length from the KaitaiStream.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} The read Uint8Array.
 */
KaitaiStream.prototype.readUint8Array = function(length) {
  length = length == null ? (this.byteLength-this.position) : length;
  var arr = new Uint8Array(length);
  KaitaiStream.memcpy(arr.buffer, 0,
                    this.buffer, this.byteOffset+this.position,
                    length*arr.BYTES_PER_ELEMENT);
  this.position += arr.byteLength;
  return arr;
};

/**
  Reads a Float64Array of desired length and endianness from the KaitaiStream.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} The read Float64Array.
 */
KaitaiStream.prototype.readFloat64Array = function(length, e) {
  length = length == null ? (this.byteLength-this.position / 8) : length;
  var arr = new Float64Array(length);
  KaitaiStream.memcpy(arr.buffer, 0,
                    this.buffer, this.byteOffset+this.position,
                    length*arr.BYTES_PER_ELEMENT);
  KaitaiStream.arrayToNative(arr, e == null ? this.endianness : e);
  this.position += arr.byteLength;
  return arr;
};

/**
  Reads a Float32Array of desired length and endianness from the KaitaiStream.

  @param {number} length Number of elements to map.
  @param {?boolean} e Endianness of the data to read.
  @return {Object} The read Float32Array.
 */
KaitaiStream.prototype.readFloat32Array = function(length, e) {
  length = length == null ? (this.byteLength-this.position / 4) : length;
  var arr = new Float32Array(length);
  KaitaiStream.memcpy(arr.buffer, 0,
                    this.buffer, this.byteOffset+this.position,
                    length*arr.BYTES_PER_ELEMENT);
  KaitaiStream.arrayToNative(arr, e == null ? this.endianness : e);
  this.position += arr.byteLength;
  return arr;
};

/**
  Reads a 32-bit int from the KaitaiStream with the desired endianness.

  @param {?boolean} e Endianness of the number.
  @return {number} The read number.
 */
KaitaiStream.prototype.readInt32 = function(e) {
  var v = this._dataView.getInt32(this.position, e == null ? this.endianness : e);
  this.position += 4;
  return v;
};

/**
  Reads a 16-bit int from the KaitaiStream with the desired endianness.

  @param {?boolean} e Endianness of the number.
  @return {number} The read number.
 */
KaitaiStream.prototype.readInt16 = function(e) {
  var v = this._dataView.getInt16(this.position, e == null ? this.endianness : e);
  this.position += 2;
  return v;
};

/**
  Reads an 8-bit int from the KaitaiStream.

  @return {number} The read number.
 */
KaitaiStream.prototype.readInt8 = function() {
  var v = this._dataView.getInt8(this.position);
  this.position += 1;
  return v;
};

// ========================================================================
// Unsigned
// ========================================================================

/**
  Reads an 8-bit unsigned int from the KaitaiStream.
  @return {number} The read number.
 */
KaitaiStream.prototype.readU1 = function() {
  var v = this._dataView.getUint8(this.position);
  this.position += 1;
  return v;
};

/**
  Reads a 16-bit little-endian unsigned int from the KaitaiStream.
  @return {number} The read number.
 */
KaitaiStream.prototype.readU2le = function(e) {
  var v = this._dataView.getUint16(this.position, 1);
  this.position += 2;
  return v;
};

/**
  Reads a 32-bit little-endian unsigned int from the KaitaiStream.
  @return {number} The read number.
 */
KaitaiStream.prototype.readU4le = function(e) {
  var v = this._dataView.getUint32(this.position, 1);
  this.position += 4;
  return v;
};

// TODO: do something about 64-bit integers

/**
  Reads a 16-bit big-endian unsigned int from the KaitaiStream.
  @return {number} The read number.
 */
KaitaiStream.prototype.readU2be = function(e) {
  var v = this._dataView.getUint16(this.position);
  this.position += 2;
  return v;
};

/**
  Reads a 32-bit big-endian unsigned int from the KaitaiStream.
  @return {number} The read number.
 */
KaitaiStream.prototype.readU4be = function(e) {
  var v = this._dataView.getUint32(this.position);
  this.position += 4;
  return v;
};

// TODO: do something about 64-bit integers

// ========================================================================
// Signed
// ========================================================================

/**
  Reads a 32-bit float from the KaitaiStream with the desired endianness.

  @param {?boolean} e Endianness of the number.
  @return {number} The read number.
 */
KaitaiStream.prototype.readFloat32 = function(e) {
  var v = this._dataView.getFloat32(this.position, e == null ? this.endianness : e);
  this.position += 4;
  return v;
};

/**
  Reads a 64-bit float from the KaitaiStream with the desired endianness.

  @param {?boolean} e Endianness of the number.
  @return {number} The read number.
 */
KaitaiStream.prototype.readFloat64 = function(e) {
  var v = this._dataView.getFloat64(this.position, e == null ? this.endianness : e);
  this.position += 8;
  return v;
};

/**
  Native endianness. Either KaitaiStream.BIG_ENDIAN or KaitaiStream.LITTLE_ENDIAN
  depending on the platform endianness.

  @type {boolean}
 */
KaitaiStream.endianness = new Int8Array(new Int16Array([1]).buffer)[0] > 0;

/**
  Copies byteLength bytes from the src buffer at srcOffset to the
  dst buffer at dstOffset.

  @param {Object} dst Destination ArrayBuffer to write to.
  @param {number} dstOffset Offset to the destination ArrayBuffer.
  @param {Object} src Source ArrayBuffer to read from.
  @param {number} srcOffset Offset to the source ArrayBuffer.
  @param {number} byteLength Number of bytes to copy.
 */
KaitaiStream.memcpy = function(dst, dstOffset, src, srcOffset, byteLength) {
  var dstU8 = new Uint8Array(dst, dstOffset, byteLength);
  var srcU8 = new Uint8Array(src, srcOffset, byteLength);
  dstU8.set(srcU8);
};

/**
  Converts array to native endianness in-place.

  @param {Object} array Typed array to convert.
  @param {boolean} arrayIsLittleEndian True if the data in the array is
                                       little-endian. Set false for big-endian.
  @return {Object} The converted typed array.
 */
KaitaiStream.arrayToNative = function(array, arrayIsLittleEndian) {
  if (arrayIsLittleEndian == this.endianness) {
    return array;
  } else {
    return this.flipArrayEndianness(array);
  }
};

/**
  Converts native endianness array to desired endianness in-place.

  @param {Object} array Typed array to convert.
  @param {boolean} littleEndian True if the converted array should be
                                little-endian. Set false for big-endian.
  @return {Object} The converted typed array.
 */
KaitaiStream.nativeToEndian = function(array, littleEndian) {
  if (this.endianness == littleEndian) {
    return array;
  } else {
    return this.flipArrayEndianness(array);
  }
};

/**
  Flips typed array endianness in-place.

  @param {Object} array Typed array to flip.
  @return {Object} The converted typed array.
 */
KaitaiStream.flipArrayEndianness = function(array) {
  var u8 = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  for (var i=0; i<array.byteLength; i+=array.BYTES_PER_ELEMENT) {
    for (var j=i+array.BYTES_PER_ELEMENT-1, k=i; j>k; j--, k++) {
      var tmp = u8[k];
      u8[k] = u8[j];
      u8[j] = tmp;
    }
  }
  return array;
};

/**
  Creates an array from an array of character codes.
  Uses String.fromCharCode in chunks for memory efficiency and then concatenates
  the resulting string chunks.

  @param {array} array Array of character codes.
  @return {string} String created from the character codes.
**/
KaitaiStream.createStringFromArray = function(array) {
  var chunk_size = 0x8000;
  var chunks = [];
  for (var i=0; i < array.length; i += chunk_size) {
    chunks.push(String.fromCharCode.apply(null, array.subarray(i, i + chunk_size)));
  }
  return chunks.join("");
};

/**
  Read a string of desired length and encoding from the KaitaiStream.

  @param {number} length The length of the string to read in bytes.
  @param {?string} encoding The encoding of the string data in the KaitaiStream.
                            Defaults to ASCII.
  @return {string} The read string.
 */
KaitaiStream.prototype.readStrByteLimit = function(length, encoding) {
  return KaitaiStream.arrayToString(this.readBytes(length), encoding);
};

KaitaiStream.prototype.readStrEos = function(encoding) {
  return KaitaiStream.arrayToString(this.readBytesFull(), encoding);
};

/**
  Read null-terminated string of desired length from the KaitaiStream. Truncates
  the returned string so that the null byte is not a part of it.

  @param {?number} length The length of the string to read.
  @return {string} The read string.
 */
KaitaiStream.prototype.readCString = function(length) {
  var blen = this.byteLength-this.position;
  var u8 = new Uint8Array(this._buffer, this._byteOffset + this.position);
  var len = blen;
  if (length != null) {
    len = Math.min(length, blen);
  }
  for (var i = 0; i < len && u8[i] != 0; i++); // find first zero byte
  var s = KaitaiStream.createStringFromArray(this.mapUint8Array(i));
  if (length != null) {
    this.position += len-i;
  } else if (i != blen) {
    this.position += 1; // trailing zero if not at end of buffer
  }
  return s;
};

KaitaiStream.prototype.readStrz = function(encoding, terminator, include, consume, eosError) {
  var blen = this.byteLength-this.position;
  var u8 = new Uint8Array(this._buffer, this._byteOffset + this.position);
  for (var i = 0; i < blen && u8[i] != terminator; i++); // find first zero byte
  if (i == blen) {
    // we've read all the buffer and haven't found the terminator
    if (eosError) {
      throw "End of stream reached, but no terminator " + term + " found";
    } else {
      return KaitaiStream.arrayToString(this.mapUint8Array(i), encoding);
    }
  } else {
    var arr;
    if (include) {
      arr = this.mapUint8Array(i + 1);
    } else {
      arr = this.mapUint8Array(i);
    }
    if (consume) {
      this.position += 1;
    }
    return KaitaiStream.arrayToString(arr, encoding);
  }
}

KaitaiStream.prototype.readBytes = function(len) {
  return this.mapUint8Array(len);
}

KaitaiStream.prototype.readBytesFull = function() {
  return this.mapUint8Array(this.byteLength - this.position);
}

KaitaiStream.arrayToString = function(arr, encoding) {
  if (encoding == null || encoding == "ASCII") {
    return KaitaiStream.createStringFromArray(arr);
  } else {
    if (typeof TextDecoder === 'function') {
      // we're in the browser that supports TextDecoder
      return (new TextDecoder(encoding)).decode(arr);
    } else {
      // probably we're in node.js

      // check if it's supported natively by node.js Buffer
      // see https://github.com/nodejs/node/blob/master/lib/buffer.js#L187 for details
      switch (encoding.toLowerCase()) {
        case 'utf8':
        case 'utf-8':
        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return new Buffer(arr).toString(encoding);
          break;
        default:
          // unsupported encoding, we'll have to resort to iconv-lite
          if (typeof KaitaiStream.iconvlite === 'undefined')
            KaitaiStream.iconvlite = require('iconv-lite');

          return KaitaiStream.iconvlite.decode(arr, encoding);
      }
    }
  }
}

// Export KaitaiStream for amd environments
if (typeof define === 'function' && define.amd) {
  define('KaitaiStream', [], function() {
    return KaitaiStream;
  });
}

// Export KaitaiStream for CommonJS
if (typeof module === 'object' && module && module.exports) {
  module.exports = KaitaiStream;
}
