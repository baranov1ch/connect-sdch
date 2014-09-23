var express = require('express');
var fs = require('fs');
var sdch = require('sdch');
var sdchConnect = require('connect-sdch');
var url = require('url');
var zlib = require('zlib');

var app = express();

var dicts = [
  new sdch.SdchDictionary({
    url: '/dict/kotiki.dict',
    domain: 'kotiki.cc',
    path: '/',
    maxAge: 6000,
    ports: [80, 443, 3000],
    data: fs.readFileSync('dict')
  })
];

var dictionaryStorage = new sdchConnect.DictionaryStorage(dicts);

app.use(sdchConnect.compress({
  threshold: 60
}));
app.use(sdchConnect.encode({
  threshold: 60,
  toSend: function(req, clientDicts) {
    return dicts[0];
  },
  toEncode: function(req, clientDicts) {
    var dictHash = clientDicts.find(function(e) {
      return dictionaryStorage.getByClientHash(e);
    });
    return dictionaryStorage.getByClientHash(dictHash);
  }
}));
app.use(sdchConnect.serve(dictionaryStorage));

app.get('/', function (req, res) {
  res.setHeader('content-type', 'text/html');
  res.setHeader('cache-control', 'no-store');
  fs.createReadStream('examples/kotiki.html').pipe(res);
});

console.log("starting....");

app.listen(3000);
