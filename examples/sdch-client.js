var async = require('async');
var request = require('superagent');
var sdch = require('sdch');
var zlib = require('zlib');
var request = require('superagent');

function initialRequest(callback) {
  var testUrl = 'http://localhost:3000'
  request.get(testUrl)
  .set('accept-encoding', 'sdch, gzip')
  .end(function(err, res) {
    if (err) {
      callback(err);
      return;
    }
    var getDict = response['get-dictionary'];
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
      request.get('http://localhost:3000')
      .set('accept-encoding', 'sdch, gzip')
      .end(function(e, res) {
        try {
          var opts = sdch.createDictionaryOptions(dictUrl, res.body);
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
  var urlToGo = 'http://localhost:3000';
  var avDicts = dicts.filter(function(e) {
    return sdch.clientUtils.canAdvertiseDictionary(e, urlToGo);
  }).map(function(e) {
    return e.clientHash;
  }).reduce(function(a, b) {
    return a + ', ' + b;
  });
  if (avDicts.length === 0) {
    callback(new Error('No valid dicts for the requested URL'));
  } else {
    request.get('http://localhost:3000')
    .set('accept-encoding', 'sdch, gzip')
    .set('avail-dictionary', avDicts)
    .end(function(err, res) {
    });
  }
};
