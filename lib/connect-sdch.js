/*!
 * connect-sdch
 * https://github.com/baranov1ch/connect-sdch
 *
 * Copyright 2014 Alexey Baranov <me@kotiki.cc>
 * Released under the MIT license
 */

var accepts = require('accepts');
var bytes = require('bytes');
var compressible = require('compressible');
var debug = require('debug')('sdch')
var onHeaders = require('on-headers');
var rangeParser = require('range-parser');
var sdch = require('sdch');
var vary = require('vary');
var zlib = require('zlib');

exports.DictionaryStorage = DictionaryStorage;

exports.filter = function (req, res) {
  var type = res.getHeader('Content-Type')
  if (type === undefined) {
    debug('no content-type header, not compressible');
    return false;
  }

  if (type === 'application/x-sdch-dict')
    return true;

  if (!compressible(type)) {
    debug('%s not compressible', type);
    return false;
  }

  return true;
};

exports.postSdchMethods = {
  gzip: zlib.createGzip,
  deflate: zlib.createDeflate
};

exports.serve = function(storage, opts) {
  opts = opts || {}
  return function(req, res, next) {
    debug("Serving: " + req.url);
    var dict = storage.getByUrl(req.url);
    if (!dict) {
      debug("Not a dictionary: " + req.url);
      next();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 'OPTIONS' === req.method
        ? 200
        : 405;
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      res.end();
      return;
    }
    var etag = req.headers['if-none-match'];
    if (etag) {
      etags = etag.split(',').map(function(e) { return e.trim(); });
      if (etags.indexOf(dict.etag) !== -1) {
        res.setHeader('Etag', dict.etag);
        res.setHeader('Accept-Ranges', 'bytes');
        res.statusCode = 304;
        res.end();
        return;
      }
    }
    var ranges = req.headers['range'];
    var ifRange = req.headers['if-range'];
    if (ifRange && dict.etag !== ifRange)
      ranges = null;
    if (ranges) {
      ranges = rangeParser(dict.getLength(), ranges);
      if (ranges.length !== 1 || ranges.type !== 'bytes') {
        res.statusCode = 416;
        res.end();
        return;
      } else {
        opts.range = ranges[0];
      }
    }

    res.setHeader('Content-Type', 'application/x-sdch-dict');
    res.setHeader('Etag', dict.etag);
    res.setHeader('Accept-Ranges', 'bytes');
    if (opts.range) {
      res.statusCode = 206;
      var rangeHeader = opts.range.start + '-' +
                        opts.range.end + '/' +
                        dict.getLength();
      res.setHeader('Content-Range', rangeHeader);
    } else {
      res.setHeader('Content-Length', dict.getLength());
    }
    if (req.method === 'GET') {
      dict.getOutputStream(opts).pipe(res);
    } else {
      response.end();
    }
  }
};

// Deeply copy-pasted from expressjs/compression.
exports.encode = function(options) {
  options = options || {};
  var filter = options.filter || exports.filter;
  var sdchAction = options.sdchAction || exports.sdchAction;
  var threshold;

  if (false === options.threshold || 0 === options.threshold) {
    threshold = 0
  } else if ('string' === typeof options.threshold) {
    threshold = bytes(options.threshold);
  } else {
    threshold = options.threshold || 1024;
  }

  return function(req, res, next) {
    var compress = true;
    var listeners = [];
    var write = res.write;
    var on = res.on;
    var end = res.end;
    var stream;

    req.on('close', function() {
      res.write = res.end = function() {};
    });

    // flush is noop by default
    res.flush = noop;

    // proxy

    res.write = function(chunk, encoding) {
      if (!this._header) {
        // if content-length is set and is lower
        // than the threshold, don't compress
        var len = Number(res.getHeader('Content-Length'));
        checkthreshold(len);
        this._implicitHeader();
      }
      return stream
        ? stream.write(new Buffer(chunk, encoding))
        : write.call(res, chunk, encoding);
    };

    res.end = function(chunk, encoding) {
      var len;
      if (chunk)
        len = Buffer.isBuffer(chunk)
          ? chunk.length
          : Buffer.byteLength(chunk, encoding);

      if (!this._header)
        checkthreshold(len);

      if (chunk)
        this.write(chunk, encoding);

      return stream
        ? stream.end()
        : end.call(res);
    };

    res.on = function(type, listener) {
      if (!listeners || type !== 'drain')
        return on.call(this, type, listener);

      if (stream)
        return stream.on(type, listener);

      // buffer listeners for future stream
      listeners.push([type, listener]);

      return this;
    }

    function checkthreshold(len) {
      if (compress && len < threshold) {
        debug('size below threshold');
        compress = false;
      }
    }

    function nocompress(msg) {
      debug('no compression' + (msg ? ': ' + msg : ''));
      addListeners(res, on, listeners);
      listeners = null;
    }

    onHeaders(res, function() {
      if (!filter(req, res)) {
        nocompress('filtered');
        return;
      }

      vary(res, 'Accept-Encoding');

      var action = sdchAction(req,
                              getAvailableDictionaries(req));
      if (action.newDictionary && typeof action.newDictionary === 'string')
        res.setHeader('Get-Dictionary', action.newDictionary);

      if (!compress) {
        nocompress();
        return;
      }

      var encoding = res.getHeader('Content-Encoding') || 'identity';

      if ('identity' !== encoding) {
        nocompress('already encoded');
        return;
      }

      if ('HEAD' === req.method) {
        nocompress('HEAD request');
        return;
      }

      var accept = accepts(req);
      var sdchMethod = accept.encodings(['sdch', 'identity']);

      // client do not accept SDCH.
      if (!sdchMethod || sdchMethod === 'identity') {
        nocompress('not acceptable');
        return;
      }

      if (!action.dictionary || !(action.dictionary instanceof Object)) {
        nocompress('no suitable dictionary found');
        return;
      }

      stream = sdch.createSdchEncoder(action.dictionary, options);
      var contentEncoding = 'sdch';

      // post-compress SDCH-encoded stream if possible.
      var postCompress = accept.encodings(['gzip', 'deflate', 'identity']);
      if (postCompress && postCompress !== 'identity') {
        stream = stream.pipe(exports.postSdchMethods[postCompress](options));
        contentEncoding += ', ';
        contentEncoding += postCompress;
      }
      addListeners(stream, stream.on, listeners);

      // overwrite the flush method
      res.flush = function(){
        stream.flush();
      };

      // header fields
      res.setHeader('Content-Encoding', contentEncoding);
      res.removeHeader('Content-Length');

      // compression
      stream.on('data', function(chunk){
        if (write.call(res, chunk) === false) {
          stream.pause();
        }
      });

      stream.on('end', function(){
        end.call(res);
      });

      on.call(res, 'drain', function() {
        stream.resume();
      });
    });

    next();
  };
};

function DictionaryStorage(dicts) {
  if (!(dicts instanceof Array))
    throw new Error('dicts should be and Array of SdchDictionary');

  this._dicts = dicts;
  this._clientHashMap = {};
  this._urlMap = {};
  this._pathMap = {};

  // Fill indices.
  var self = this;
  dicts.forEach(function(e) {
    self._clientHashMap[e.clientHash] = e;
    self._urlMap[e.url] = e;
  });
};

DictionaryStorage.prototype.getByClientHash = function(hash) {
  return this._clientHashMap[hash];
};

DictionaryStorage.prototype.getByUrl = function(url) {
  return this._urlMap[url];
};

function getAvailableDictionaries(req) {
  var header = req.headers['avail-dictionary'];
  if (typeof header !== 'string')
    return [];
  return header.split(',').map(function(e) { return e.trim(); });
};

/**
 * Add bufferred listeners to stream
 */

function addListeners(stream, on, listeners) {
  for (var i = 0; i < listeners.length; i++) {
    on.apply(stream, listeners[i]);
  }
};

function noop() {};
