var express = require('express');
var fs = require('fs');
var sdch = require('sdch');
var sdchConnect = require('./lib/connect-sdch');

var app = express();

var dicts = [
  new sdch.SdchDictionary({
    url: '/dict/kotiki.dict',
    domain: 'kotiki.cc',
    data: fs.readFileSync('dict')
  })
];
var dictionaryStorage = new sdchConnect.DictionaryStorage(dicts);

app.use(sdchConnect.compress());
app.use(sdchConnect.encode({
  storage: dictionaryStorage
}));
app.use(sdchConnect.serve(dictionaryStorage));

app.get('/', function (req, res) {
  res.setHeader('content-type', 'text/html');
  res.setHeader('cache-control', 'no-store');
  fs.createReadStream('kotiki.html').pipe(res);
});

console.log("starting....");

app.listen(3000);
