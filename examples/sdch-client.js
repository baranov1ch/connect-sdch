var request = require('request');
var sdch = require('sdch');

request.get({
  url: 'http://localhost:3000',
  headers:  { 'accept-encoding': 'sdch, gzip' }
}, function(err, response, body) {
  console.log(body.length);
  console.log(response.headers['get-dictionary']);
  request.get({
    url: 'http://localhost:3000' + response.headers['get-dictionary'],
    headers:  { 'accept-encoding': 'sdch, gzip' }
  }, function(e, res, b) {
    console.log(b.length);
    var dict = sdch.parseSdchDictionary(b);
    request.get({
        url: 'http://localhost:3000/somepath',
        headers: { 'accept-encoding': 'sdch, gzip', 'avail-dictionary': dict.clientHash }
    }, function(err, resp, body) {
      console.log(body.length);
      console.log(body);
      request.get({
        url: 'http://localhost:3000' + response.headers['get-dictionary'],
        headers:  { 'accept-encoding': 'sdch, gzip', 'avail-dictionary': dict.clientHash }
      }, function(e, res, b) {
        console.log(b.length);
        console.log(b);
      });
    });
  });
});