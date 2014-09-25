var async = require('async');
var request = require('superagent');
var sdch = require('sdch');
var url = require('url');
var zlib = require('zlib');

function initialRequest(callback) {
  var testUrl = 'http://kotiki.cc:3000'
  request.get(testUrl)
  .set('accept-encoding', 'sdch, gzip')
  .end(function(err, response) {
    if (err) {
      callback(err);
      return;
    }
    var getDict = response.headers['get-dictionary'];
    if (!getDict) {
      callback(new Error('No valid dict URLs found in headers'));
      return;
    }
    var urls = getDict.split(',').map(function(e) {
      return e.trim();
    }).map(function(e) {
      return url.resolve(testUrl, e);
    }).filter(function(e) {
      return sdch.clientUtils.canFetchDictionary(e, testUrl);
    });
    if (urls.length === 0) {
      callback(new Error('No valid dict URLs found in headers'));
    } else {
      callback(null, urls);
    }
  });
};

function fetchDictionaries(urls, callback) {
  var fetches = urls.map(function(e) {
    return function(cb) {
      request.get(e)
      .set('accept-encoding', 'sdch, gzip')
      .buffer()
      .end(function(ee, res) {
        if (ee)
          return cb(ee);
        try {
          var opts = sdch.createDictionaryOptions(e, res.text);
          var dict = sdch.clientUtils.createDictionaryFromOptions(opts);
          cb(null, dict);
        } catch (err) {
          cb(err);
        }
      });
    };
  });
  async.parallel(fetches, function(err, result) {
    if (err) {
      callback(err);
    } else {
      callback(null, result);
    }
  });
};

function getSdchedResource(dicts, callback) {
  var urlToGo = 'http://kotiki.cc:3000';
  var avDicts = dicts.filter(function(e) {
    return sdch.clientUtils.canAdvertiseDictionary(e, urlToGo);
  });
  if (avDicts.length === 0)
    return callback(new Error('No valid dicts for the requested URL'));

  var avDictHeader = avDicts.map(function(e) {
    return e.clientHash;
  }).reduce(function(a, b) {
    return a + ', ' + b;
  });
  request.get(urlToGo)
  .set('accept-encoding', 'sdch, gzip')
  .set('avail-dictionary', avDictHeader)
  .request()
  .on('response', function(res) {
    var CE = res.headers['content-encoding'];
    if (!CE)
      return callback(null, enc.toString());

    CE = CE.split(',').map(function(e) { return e.trim(); });
    if (CE.length > 2)
      return callback(new Error('Too much of encodings'));
    var p = res;
    if (CE.indexOf('gzip') !== -1) {
      p = p.pipe(zlib.createGunzip());
    } else if (CE.indexOf('deflate') !== -1) {
      p = p.pipe(zlib.creatInflate());
    }
    if (CE.indexOf('sdch') !== -1) {
      p = p.pipe(sdch.createSdchDecoder(
        avDicts,
        {
          url: urlToGo,
          validationCallback: function(dict, referer) {
            // Just for example. This is already done by default.
            return sdch.clientUtils.canUseDictionary(dict, referer);
          }
        }));
    }
    callback(null, p);
  })
  .end();
};

async.waterfall([
  initialRequest,
  fetchDictionaries,
  getSdchedResource,
],
function(err, result) {
  if (err) {
    throw err;
  }
  result.pipe(process.stdout);
});
