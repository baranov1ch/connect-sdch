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
var debug = require('debug')('sdch');
var onHeaders = require('on-headers');
var rangeParser = require('range-parser');
var sdch = require('sdch');
var vary = require('vary');
var zlib = require('zlib');

exports.DictionaryStorage = DictionaryStorage;

exports.filter = function (req, res) {
  var type = res.getHeader('Content-Type');
  if (type === undefined) {
    debug(req.url + ' has no content-type header, not compressible');
    return false;
  }

  if (type === 'application/x-sdch-dictionary')
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

exports.defaultToSend = function(storage) {
  return function(req, availableDicts) {
    var hash = {}
    availableDicts.forEach(function(e) { hash[e] = true; });
    return storage.dicts().filter(function(e) {
      return !hash[e.clientHash];
    });
  };
};

exports.defaultToEncode = function(storage) {
  return function(req, availableDicts) {
    var dicts = availableDicts.map(function(e) {
      return storage.getByClientHash(e);
    }).filter(function(e) {
      return e;
    }).filter(function(e) {
      return !e.path || sdch.clientUtils.pathMatch(req.url, e.path);
    }).sort(function(a, b) {
      if (!a.path && !b.path)
        return 0;
      if (!a.path)
        return Infinity;
      if (!b.path)
        return -Infinity;
      return b.path.length - a.path.length;
    });
    if (dicts.length === 0)
      return null;
    return dicts[0];
  };
};

exports.addCacheControlPrivate = function(res) {
  var cc = res.getHeader('Cache-Control');
  if (!cc) {
    res.setHeader('Cache-Control', 'private');
    return;
  }
  var privateSeen = false;

  var newCC = cc.split(',').map(function(e) {
    var parts = e.split('=');
    var key = parts.shift.trim();
    var val = parts.shift();
    if (key.toLowerCase() === 'public') {
      privateSeen = true;
      // Remove public and replace with private.
      return 'private';
    }
    if (key.toLowerCase() === 'private') {
      // if we have not already set 'private', then do it and skip all the
      // field-name stuff, we're totally private.
      if (!privateSeen)
        return 'private';

      // Else, return nothing.
      return '';
    }
  }).reduce(function(a, b) {
    if (a === '')
      return b;
    if (b === '')
      return a;
    return a + ',' + b;
  });
  res.setHeader('Cache-Control', newCC);
};

exports.serve = function(storage, opts) {
  opts = opts || {}
  return function(req, res, next) {
    var dict = storage.getByUrl(req.url);
    if (!dict) {
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
      if (ranges.length !== 1 || ranges.type !== 'bytes' || ranges === -1 ||
          ranges === -2) {
        res.statusCode = 416;
        res.end();
        return;
      } else {
        opts.range = ranges[0];
      }
    }

    res.setHeader('content-type', 'application/x-sdch-dictionary');
    res.setHeader('Etag', dict.etag);
    res.setHeader('Accept-Ranges', 'bytes');

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    if (opts.range) {
      res.statusCode = 206;
      var rangeHeader = opts.range.start + '-' +
                        opts.range.end + '/' +
                        dict.getLength();
      res.setHeader('Content-Range', rangeHeader);
    } else {
      res.setHeader('Content-Length', dict.getLength());
    }

    dict.getOutputStream(opts).pipe(res);
  }
};

exports.multicompress = function(options) {
  options = options || {};
  var compressFilter = options.filter || exports.filter;
  var encodingFilter = options.encodingFilter || exports.defaultEncodingFilter;
  var acceptable = options.acceptable || [];
  if (acceptable.indexOf('identity') === -1)
    acceptable.push('identity');
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
      if (!compressFilter(req, res)) {
        nocompress('filtered');
        return;
      }

      vary(res, 'Accept-Encoding');
      vary(res, 'Avail-Dictionary');

      if (!compress) {
        nocompress();
        return;
      }

      var encoding = res.getHeader('Content-Encoding') || 'identity';

      if (!encodingFilter(encoding)) {
        nocompress('unencodable encoding');
        return;
      }

      if ('HEAD' === req.method) {
        nocompress('HEAD request');
        return;
      }

      var accept = accepts(req);
      var method = accept.encodings(acceptable);

      if (!method || method === 'identity') {
        nocompress('not acceptable');
        return;
      }

      if (options.beforeEncoding)
        options.beforeEncoding(req, res);

      if (options.createEncoder)
        stream = options.createEncoder(req, res, method);

      if (!stream) {
        nocompress('no encoder found');
        return;
      }

      var contentEncoding = res.getHeader('Content-Encoding');
      if (contentEncoding) {
        contentEncoding += ',';
        contentEncoding += method;
      } else {
        contentEncoding = method;
      }

      addListeners(stream, stream.on, listeners);

      // overwrite the flush method
      res.flush = function(){
        debug('res.flush');
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

exports.compress = function(options, encoderOptions) {
  options = options || {};
  options.acceptable = ['gzip', 'deflate'];
  options.encodingFilter = function (enc) {
    return enc === 'sdch';
  };
  options.createEncoder = function(req, res, method) {
    if (method === 'gzip')
      return zlib.createGzip(encoderOptions);

    if (method === 'deflate')
      return zlib.createDeflate(encoderOptions);

    return null;
  };
  return exports.multicompress(options);
}

exports.encode = function(options, encoderOptions) {
  options = options || {};
  if (!options.storage) {
    if (!(options.toSend && options.toEncode))
      throw new Error('provide either storage or dictionary selectors');
  }

  var toSend = options.toSend || exports.defaultToSend(options.storage);
  var toEncode = options.toEncode || exports.defaultToEncode(options.storage);
  encoderOptions = encoderOptions || {};

  // Set default vcdiff config from SDCH spec unless user defined smth. else.
  if (encoderOptions.interleaved === undefined)
    encoderOptions.interleaved = true;

  if (encoderOptions.checksum === undefined)
    encoderOptions.checksum = true;

  options.encodingFilter = function (enc) {
    return enc === 'identity';
  };
  options.acceptable = ['sdch'];
  options.beforeEncoding = function (req, res) {
    var dicts = toSend(req, getAvailableDictionaries(req));
    if (!dicts)
      return;

    if (!(dicts instanceof Array))
      dicts = [dicts];

    if (dicts.length === 0)
      return;

    var getDict = dicts.map(function(e) {
      return e.url;
    }).reduce(function(a,b) {
      return a + ', ' + b;
    });

    if (getDict)
      res.setHeader('Get-Dictionary', getDict);
  };
  options.createEncoder = function(req, res, method) {
    if (method !== 'sdch')
      return null;

    var availableDicts = getAvailableDictionaries(req);
    if (availableDicts.length === 0) {
      debug('no dictionaries available');
      return null;
    }

    var dict = toEncode(req, availableDicts);
    if (!dict) {
      res.setHeader('X-SDCH-Encode', '0');
      debug('no dictionaries chosen');
      return null;
    }
    // TODO: adjust caching headers.
    // addCacheControlPrivate(res);
    return sdch.createSdchEncoder(dict, encoderOptions);
  };
  return exports.multicompress(options);
}

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

DictionaryStorage.prototype.dicts = function() {
  return this._dicts;
};

function getAvailableDictionaries(req) {
  var header = req.headers['avail-dictionary'];
  if (typeof header !== 'string')
    return [];
  return header.split(',').map(function(e) { return e.trim(); });
};

function addListeners(stream, on, listeners) {
  for (var i = 0; i < listeners.length; i++) {
    on.apply(stream, listeners[i]);
  }
};

function noop() {};
