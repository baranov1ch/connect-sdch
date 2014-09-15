var express = require('express');
var fs = require('fs');
var sdchConnect = require('connect-sdch');
var sdch = require('sdch');

var app = express();

var dicts = [
  new sdch.SdchDictionary({
    url: '/dict/kotiki1.dict',
    domain: 'kotiki.cc',
    path: '/',
    data: 'Hello WorldHello WorldHello WorldHello WorldHello WorldHello WorldHello WorldHello WorldHello WorldHello WorldHello WorldHello WorldHello WorldHello WorldHello World'
  }),
  new sdch.SdchDictionary({
    url: '/dict/kotiki2.dict',
    domain: 'kotiki.cc',
    path: '/somepath',
    data: fs.readFileSync('examples/kotiki.dict')
  })
];

var dictionaryStorage = new sdchConnect.DictionaryStorage(dicts);

app.use(sdchConnect.encode({
  threshold: 60,
  sdchAction: function(req, clientDicts) {
    var dictHash = clientDicts.find(function(e) {
      return dictionaryStorage.getByClientHash(e);
    });
    var dict = dictionaryStorage.getByClientHash(dictHash);
    var newDict;
    if (req.url.indexOf('/somepath') === 0) {
      newDict = dicts[1];
    } else {
      newDict = dicts[0];
    }
    console.log('Sending dict: ' + newDict.url);
    return { newDictionary: newDict.url, dictionary: dict };
  }
}));
app.use(sdchConnect.serve(dictionaryStorage));

app.get('/', function (req, res) {
  res.send('Hello WorldHello WorldHello WorldHello WorldHello' +
           ' WorldHello WorldHello WorldHello WorldHello WorldHello' +
           ' WorldHello WorldHello WorldHello WorldHello WorldHello World' +
           'Hello WorldHello WorldHello WorldHello WorldHello' +
           ' WorldHello WorldHello WorldHello WorldHello WorldHello' +
           ' WorldHello WorldHello WorldHello WorldHello WorldHello World' +
           'Hello WorldHello WorldHello WorldHello WorldHello' +
           ' WorldHello WorldHello WorldHello WorldHello WorldHello' +
           ' WorldHello W
           ]
          ]orldHello WorldHello WorldHello WorldHello World');
})

app.get('/somepath', function (req, res) {
  res.send('Hello WorldHello WorldHello WorldHello WorldHello' +
           ' WorldHello WorldHello WorldHello WorldHello WorldHello' +
           ' WorldHello WorldHello WorldHello WorldHello WorldHello World' +
           'Hello WorldHello WorldHello WorldHello WorldHello' +
           ' WorldHello WorldHello WorldHello WorldHello WorldHello' +
           ' WorldHello WorldHello WorldHello WorldHello WorldHello World' +
           'Hello WorldHello WorldHello WorldHello WorldHello' +
           ' WorldHello WorldHello WorldHello WorldHello WorldHello' +
           ' WorldHello WorldHello WorldHello WorldHello WorldHello World');
})

console.log("starting....");

app.listen(3000);