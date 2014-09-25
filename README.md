# connect-sdch

[![Build Status](https://travis-ci.org/baranov1ch/connect-sdch.svg?branch=master)](https://travis-ci.org/baranov1ch/connect-sdch)

SDCH middleware for connect and node.js. Refer to [the spec](http://lists.w3.org/Archives/Public/ietf-http-wg/2008JulSep/att-0441/Shared_Dictionary_Compression_over_HTTP.pdf) for more information.

Uses [sdch](https://github.com/baranov1ch/node-sdch) module inside.

Keep in mind, that it is to accurate in all aspects. For instance:

* Chromium already supports SDCH-over-HTTPS as it is now considered to not
introduce additional risks.

* Chromium does not support comma separated port list. Use multiple headers.

* Chromium downloads only the first dictionary from `Get_Dictionary` header.

## Example

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
app.use(sdchConnect.encode({ storage: dictionaryStorage });
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

## Quick Reference

The full middleware consisits of three parts:

* Dictionary serving

#### connectSdch.serve(storage)

Intercepts requests for SDCH-dictionary urls and serves them.
Supports etags (`If-None-Match`), range requests (`Range`), and `If-Range` headers.
Dictionaries are served with `application/x-sdch-dictionary` content-type.

`storage` should be an instance of `connectSdch.DictionaryStorage` (see example).

* SDCH encoding

Both compression middlewares are more or less copy-pasted from
[expressjs/compression](https://github.com/expressjs/compression) so and generally have similar api and accept
similar options (`treshold`, `filter`, etc) plus some SDCH-specific stuff.
The only difference is that encoding options (for [zlib](http://nodejs.org/api/zlib.html) and [sdch](https://github.com/baranov1ch/node-sdch) and inherently [vcdiff](https://github.com/baranov1ch/node-vcdiff)
are passed via separate argument `encodeOptions`.

#### connectSdch.encode(options, encodeOptions)

Does all encoding stuff.

When it sees `Accept-Encoding` header including sdch,
it appends to the response `Get-Dictionary` header containig available
dictionaries. If the client has advertised some dictionaries, they won't be
appended to the `Get-Dictionary` header. This is the default behavior that
can be overriden (see below).

> NOTE Chromium downloads only the first dictionary from that header.

If the request contains `Avail-Dictionary` header, then this middleware tries
to encode the response choosing the most appropriate dictionary. If you have 2
dictionaries, and the client has downloaded both of them (and advertised in
`Avail-Dictionary`) the server has to decide which dictionary to choose. The
default behavior is to choose the most specific dictionary for the requested
path. So if you have dictionaries for the path `/` (or no path), `/path/`
and `/path/path`, for the request `/path/path/123` the latter will be used.
However, this behavior may be also overriden.

To overide default behavior, you may pass 2 functions in `options`:

* `toSend(request, availableDicts)` is used to determine the contents of
`Get-Dictionary` header. Should return Array of `sdch.SdchDictionary` or
`null` or empty Array.

* `toEncode(request, availableDicts)` is used to determine which dictionary
will be used to encode the response. Should return `sdch.SdchDictionary` or
`null`

`availableDicts` is an Array of client hashes (parsed `Avail-Dictionary` header).

If you don't provide these functions, be sure to provide
`connectSdch.DictionaryStorage` via `options.storage`.

If you don't provise any `encodeOptions`, default as per spec will be used
for open-vcdiff (interleaved encoding and appending adler32 checksum).

Example:

```javascript
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

app.use(connectSdch.encode({
  threshold: '1kb',
  toSend: function(req, availDicts) {
      if (req['i-hate-sdch'])
        return []
      // Unconditionaly return first dictionary.
      return [dicts[0]]
    },
  toEncode: function(req, availDicts) {
      // Use only first dictionary
      if (availDicts.length > 0 &&
          availDicts[0] === dicts[0].clientHash)
        return dicts[0]
      return null;
    }
  }, { /* some vcdiff options */ }));

```

* Post-SDCH compression

#### connectSdch.compress(options, encodeOptions)

SDCH compression does not looks good it its not post-compressed with
gzip/deflate. The text is still very redundant. Default compression modules
in most of the servers does not compress, if the response already has
`Content-Encoding` header. This middleware does it for sdch responses.

Example:

```javascript
app.use(connectSdch.compress({ threshold: '1kb' }, { /* some zlib options */ }));

```

## API Reference

TODO

## TODO

  * Serve `cache-control: private`
  * Make working examples

