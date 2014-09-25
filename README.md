# connect-sdch

SDCH middleware for connect and node.js

## Quick example

```javascript
var express = require('express');
var fs = require('fs');
var sdch = require('sdch');
var sdchConnect = require('connect-sdch');


var app = express();
var dicts = [
  new sdch.SdchDictionary({
    url: '/dict/kotiki.dict',
    domain: 'kotiki.cc',
    data: fs.readFileSync('dict')
  }),
  new sdch.SdchDictionary({
    url: '/dict/kotiki.dict',
    path: '/somespecificpath',
    domain: 'kotiki.cc',
    data: fs.readFileSync('dict')
  }),
];
var dictionaryStorage = new sdchConnect.DictionaryStorage(dicts);

// The order is important. First, serve dictionaries, then encode, (to be able
// to encode newer dicts with older available to the client), then compress
// SDCH-encoded content by gzip/deflate. Regular `compression` middleware won't
// compress anything with `Content-Encoding` set.
app.use(sdchConnect.compress());
app.use(sdchConnect.encode({ dictionaries: dictionaryStorage });
app.use(sdchConnect.serve(dictionaryStorage));

app.get('/', function (req, res) {
  res.setHeader('content-type', 'text/html');
  fs.createReadStream('kotiki.html').pipe(res);
});

// For this path, second dictionary will be used.
app.get('/somespecificpath', function (req, res) {
  res.setHeader('content-type', 'text/html');
  fs.createReadStream('somespecificpath.html').pipe(res);
});

app.listen(3000);
```

## API Reference

TODO

## TODO

  * Serve `cache-control: private`

