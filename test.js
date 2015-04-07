var sdch = require('sdch');
var connectSdch = require('./lib/connect-sdch');
var fs = require('fs')

var dictsToServeArray =     [new sdch.SdchDictionary({
    url : 'http://yandex.ru/dict',
    domain: 'yandex.ru',
    data: fs.readFileSync('README.md')
})];

var storage = new connectSdch.DictionaryStorage(dictsToServeArray);
