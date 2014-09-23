var request = require('request');
var sdch = require('sdch');
var zlib = require('zlib');

request.get({
  url: 'http://localhost:3000',
  headers:  { 'accept-encoding': 'sdch, gzip' }
}, function(err, response, body) {
  var dictUrl = 'http://localhost:3000/dict/kotiki.dict';
  request.get({
    url: dictUrl,
    headers:  { 'accept-encoding': 'sdch, gzip' }
  }, function(e, res, b) {
    var clientHash;
    var dict;
    try {
      dict = sdch.createSdchDictionary(dictUrl, b);
      clientHash = dict.clientHash;
    } catch (e) {
      console.log('dict error');
      return;
    }
    request.get({
        url: 'http://localhost:3000',
        headers: { 'accept-encoding': 'sdch, gzip', 'avail-dictionary': clientHash }
    })
      .pipe(zlib.createGunzip())
      .pipe(sdch.createSdchDecoder([dict]))
      .pipe(process.stdout);
  });
});