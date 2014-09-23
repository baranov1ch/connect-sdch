connectSdch = require '../lib/connect-sdch'
bytes = require 'bytes'
chai = require 'chai'
crypto = require 'crypto'
http = require 'http'
request = require 'supertest'
sdch = require 'sdch'
zlib = require 'zlib'

should = chai.should()

describe 'connectSdch', ->
  describe 'serving dicts', ->
    dict = new sdch.SdchDictionary
      url: '/dict/kotiki.dict',
      domain: 'kotiki.cc',
      path: '/',
      maxAge: 6000,
      ports: [80, 443, 3000],
      data: 'hello worldhello worldhello worldhello worldhello world' +
            'hello worldhello worldhello worldhello worldhello world'
    storage = new connectSdch.DictionaryStorage [dict]

    it 'should serve dictionaries', (done) ->
      server = createDictServer storage, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello world'

      request server
        .get '/dict/kotiki.dict'
        .expect 'Content-Length', dict.getLength()
        .expect 'Accept-Ranges', 'bytes'
        .expect 'Etag', dict.etag
        .expect 'Content-Type', 'application/x-sdch-dict', done

    it 'should return not modified', (done) ->
      server = createDictServer storage, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello world'

      request server
        .get '/dict/kotiki.dict'
        .set 'If-None-Match', dict.etag
        .expect 304, done

    it 'should return range if requested', (done) ->
      server = createDictServer storage, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello world'

      request server
        .get '/dict/kotiki.dict'
        .set 'Range', 'bytes=10-60'
        .expect 206
        .expect 'Content-Range', '10-60/' + dict.getLength(), done

    it 'should return not satifiable for multiranges', (done) ->
      server = createDictServer storage, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello world'

      request server
        .get '/dict/kotiki.dict'
        .set 'Range', 'bytes=10-40,50-60'
        .expect 416, done

    it 'should return not satifiable for non-byte ranges', (done) ->
      server = createDictServer storage, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello world'

      request server
        .get '/dict/kotiki.dict'
        .set 'Range', 'cats=10-40'
        .expect 416, done

    it 'should return not satifiable for wrong ranges', (done) ->
      server = createDictServer storage, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello world'

      request server
        .get '/dict/kotiki.dict'
        .set 'Range', 'bytes=100-40'
        .expect 416, done

    it 'should return full content for not matching if-range', (done) ->
      server = createDictServer storage, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello world'

      request server
        .get '/dict/kotiki.dict'
        .set 'Range', 'bytes=10-60'
        .set 'If-Range', 'asdasdadsa'
        .expect 200, done

    it 'should respond to head', (done) ->
      server = createDictServer storage, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello world'

      request server
        .head '/dict/kotiki.dict'
        .end (err, res) ->
          if (err)
            return done err
          res.headers.should.not.have.property 'content-length'
          done()

    it 'should respond to options', (done) ->
      server = createDictServer storage, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello world'

      request server
        .options '/dict/kotiki.dict'
        .expect 'Allow', 'GET, HEAD, OPTIONS'
        .expect 200, done

    it 'should not allow put', (done) ->
      server = createDictServer storage, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello world'

      request server
        .put '/dict/kotiki.dict'
        .expect 'Allow', 'GET, HEAD, OPTIONS'
        .expect 405, done

    it 'should not allow post', (done) ->
      server = createDictServer storage, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello world'

      request server
        .post '/dict/kotiki.dict'
        .expect 'Allow', 'GET, HEAD, OPTIONS'
        .expect 405, done

    it 'should not allow delete', (done) ->
      server = createDictServer storage, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello world'

      request server
        .delete '/dict/kotiki.dict'
        .expect 'Allow', 'GET, HEAD, OPTIONS'
        .expect 405, done

  describe 'sdchConnect.encode', ->
    dict = new sdch.SdchDictionary
      url: '/dict/kotiki.dict',
      domain: 'kotiki.cc',
      data: 'hello worldhello worldhello worldhello worldhello world' +
            'hello worldhello worldhello worldhello worldhello world'
    opts =
      threshold: 0
      toSend: (r, dicts) -> dict
      toEncode: (r, dicts) -> dict

    it 'should serve sdch', (done) ->
      server = createSimpleSdch opts, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello worldhello worldhello worldhello worldhello world' +
                'hello worldhello worldhello'

      request server
        .get '/'
        .set 'Accept-Encoding', 'sdch'
        .set 'Avail-Dictionary', dict.clientHash
        .expect 'Get-Dictionary', dict.url
        .expect 'Content-Encoding', 'sdch', done

    it 'should not encode head', (done) ->
      server = createSimpleSdch opts, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello worldhello worldhello worldhello worldhello world' +
                'hello worldhello worldhello'

      request server
        .head '/'
        .set 'Accept-Encoding', 'sdch'
        .set 'Avail-Dictionary', dict.clientHash
        .end (err, res) ->
          if (err)
            return done err
          res.headers.should.not.have.property 'content-encoding'
          done()

    it 'should skip unknown encodings', (done) ->
      server = createSimpleSdch opts, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello worldhello worldhello worldhello worldhello world' +
                'hello worldhello worldhello'

      request server
        .head '/'
        .set 'Accept-Encoding', 'bogus'
        .end (err, res) ->
          if (err)
            return done err
          res.headers.should.not.have.property 'content-encoding'
          done()

    it 'should skip if content-encoding already set', (done) ->
      server = createSimpleSdch opts, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.setHeader 'Content-Encoding', 'x-custom'
        res.end 'hello worldhello worldhello worldhello worldhello world' +
                'hello worldhello worldhello'

      request server
        .head '/'
        .set 'Accept-Encoding', 'sdch'
        .set 'Avail-Dictionary', dict.clientHash
        .expect 'Content-Encoding', 'x-custom'
        .expect 200, done

    it 'should set Vary', (done) ->
      server = createSimpleSdch opts, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello worldhello worldhello worldhello worldhello world' +
                'hello worldhello worldhello'

      request server
        .get '/'
        .set 'Avail-Dictionary', dict.clientHash
        .set 'Accept-Encoding', 'sdch'
        .expect 'Content-Encoding', 'sdch'
        .expect 'Vary', 'Accept-Encoding'
        .expect 'Get-Dictionary', dict.url, done

    it 'should set Vary even if Accept-Encoding is not set', (done) ->
      myOpts =
        threshold: 1000
        toSend: (r, dicts) -> dict
        toEncode: (r, dicts) -> dict
      server = createSimpleSdch myOpts, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello worldhello worldhello worldhello worldhello world' +
                'hello worldhello worldhello'

      request server
        .get '/'
        .expect 'Vary', 'Accept-Encoding'
        .end (err, res) ->
          if (err)
            return done err
          res.headers.should.not.have.property 'content-encoding'
          done()

    it 'should set Vary for HEAD request', (done) ->
      server = createSimpleSdch opts, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello worldhello worldhello worldhello worldhello world' +
                'hello worldhello worldhello'

      request server
        .head '/'
        .set 'Avail-Dictionary', dict.clientHash
        .set 'Accept-Encoding', 'sdch'
        .expect 'Vary', 'Accept-Encoding', done

    it 'should not set Vary if Content-Type does not pass filter', (done) ->
      server = createSimpleSdch opts, (req, res) ->
        res.setHeader 'Content-Type', 'image/jpeg'
        res.end()

      request server
        .get '/'
        .end (err, res) ->
          if (err)
            return done err
          res.headers.should.not.have.property 'vary'
          done()

    it 'should not encode if client does not accept sdch', (done) ->
      server = createSimpleSdch opts, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello worldhello worldhello worldhello worldhello world' +
                'hello worldhello worldhello'

      request server
        .get '/'
        .set 'Avail-Dictionary', dict.clientHash
        .end (err, res) ->
          if (err)
            return done err
          res.headers.should.not.have.property 'content-encoding'
          res.headers.should.not.have.property 'get-dictionary'
          # If the client does not expect SDCH, no need to pass this header.
          res.headers.should.not.have.property 'x-sdch-encode'
          done()

    it 'should not encode if client does not advertises', (done) ->
      server = createSimpleSdch opts, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello worldhello worldhello worldhello worldhello world' +
                'hello worldhello worldhello'

      request server
        .get '/'
        .set 'Accept-Encoding', 'sdch'
        .end (err, res) ->
          if (err)
            return done err
          res.headers.should.not.have.property 'content-encoding'
          # If the client does not expect SDCH, no need to pass this header.
          res.headers.should.not.have.property 'x-sdch-encode'
          done()

    it 'should set x-sdch-encode-0', (done) ->
      myOpts =
        threshold: 0
        toSend: (r, dicts) -> dict
        toEncode: (r, dicts) -> null
      server = createSimpleSdch myOpts, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello worldhello worldhello worldhello worldhello world' +
                'hello worldhello worldhello'

      request server
        .get '/'
        .set 'Accept-Encoding', 'sdch'
        .set 'Avail-Dictionary', dict.clientHash
        .expect 'X-SDCH-Encode', '0'
        .end (err, res) ->
          if (err)
            return done err
          res.headers.should.not.have.property 'content-encoding'
          done()

    it 'should not set get-dictionary header if toSend returns null', (done) ->
      myOpts =
        threshold: 0
        toSend: (r, dicts) -> null
        toEncode: (r, dicts) -> dict
      server = createSimpleSdch myOpts, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello worldhello worldhello worldhello worldhello world' +
                'hello worldhello worldhello'

      request server
        .get '/'
        .set 'Avail-Dictionary', dict.clientHash
        .set 'Accept-Encoding', 'sdch'
        .expect 'Content-Encoding', 'sdch'
        .end (err, res) ->
          if (err)
            return done err
          res.headers.should.not.have.property 'get-dictionary'
          done()

    it 'should transfer chunked', (done) ->
      server = createSimpleSdch opts, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello worldhello worldhello worldhello worldhello world' +
                'hello worldhello worldhello'

      request server
        .get '/'
        .set 'Avail-Dictionary', dict.clientHash
        .set 'Accept-Encoding', 'sdch'
        .expect 'Transfer-Encoding', 'chunked', done

    it 'should remove content-length for chunked', (done) ->
      server = createSimpleSdch opts, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.end 'hello worldhello worldhello worldhello worldhello world' +
                'hello worldhello worldhello'

      request server
        .get '/'
        .set 'Avail-Dictionary', dict.clientHash
        .set 'Accept-Encoding', 'sdch'
        .expect 'Content-Encoding', 'sdch'
        .end (err, res) ->
          if (err)
            return done err
          res.headers.should.not.have.property 'content-length'
          done()

    it 'should allow writing after close', (done) ->
      server = createSimpleSdch opts, (req, res) ->
        res.setHeader 'Content-Type', 'text/plain'
        res.on 'close', ->
          res.write 'hello worldhello worldhello worldhello worldhello world'
          res.end 'hello worldhello worldhello'
          done()
        res.destroy()

      request server
        .get '/'
        .end ->

    describe 'transferring', ->
      myDict = new sdch.SdchDictionary
        url: '/dict/kotiki.dict',
        domain: 'kotiki.cc',
        data: 'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh' +
              'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh'
      myOpts =
        threshold: 0
        toSend: (r, dicts) -> myDict
        toEncode: (r, dicts) -> myDict

      parser = (res, fn) ->
        res.data = []
        res.nread = 0
        res.on 'data', (chunk) ->
          res.data.push chunk
          res.nread += chunk.length
        res.on 'end', ->
          try
            enc = Buffer.concat res.data, res.nread
            decoded = sdch.sdchDecodeSync enc, [myDict]
            fn null, decoded
          catch err
            fn err

      it 'should transfer big bodies', (done) ->
        len = bytes '2mb'
        buf = new Buffer len
        server = createSimpleSdch myOpts, (req, res) ->
          res.setHeader 'Content-Type', 'text/plain'
          res.end buf

        buf.fill 'h'

        request server
          .get '/'
          .set 'Avail-Dictionary', myDict.clientHash
          .set 'Accept-Encoding', 'sdch'
          .expect 'Transfer-Encoding', 'chunked'
          .expect 'Content-Encoding', 'sdch'
          .parse parser
          .end (err, res) ->
            if err
              return done err
            res.body.toString().should.equal buf.toString()
            res.body.length.should.equal len
            done()

      it 'should transfer large bodies with multiple writes', (done) ->
        len = bytes '40kb'
        buf = new Buffer len
        server = createSimpleSdch myOpts, (req, res) ->
          res.setHeader 'Content-Type', 'text/plain'
          res.write buf
          res.write buf
          res.write buf
          res.end buf

        buf.fill 'h'

        request server
          .get '/'
          .set 'Avail-Dictionary', myDict.clientHash
          .set 'Accept-Encoding', 'sdch'
          .expect 'Transfer-Encoding', 'chunked'
          .expect 'Content-Encoding', 'sdch'
          .parse parser
          .end (err, res) ->
            if err
              return done err
            res.body.slice(0, len).toString().should.equal buf.toString()
            res.body.length.should.equal len * 4
            done()

      it 'should back-pressure when compressed', (done) ->
        buf = null
        client = null
        drained = false
        resp = null
        server = createSimpleSdch opts, (req, res) ->
          resp = res
          res.on 'drain', ->
            drained = true

          res.setHeader 'Content-Type', 'text/plain'
          res.write 'hello worldhello worldhello worldhello worldhello world'
          pressure()

        wait = 2

        crypto.pseudoRandomBytes 1024 * 128, (err, chunk) ->
          buf = chunk
          pressure()

        complete = ->
          if --wait != 0
            return
          drained.should.be.true
          done()

        pressure = ->
          if !buf || !resp || !client
            return

          while resp.write(buf) != false
            resp.flush()

          resp.on 'drain', ->
            resp.write 'end'
            resp.end()
          resp.on 'finish', complete
          client.resume()

        request server
          .get '/'
          .set 'Avail-Dictionary', dict.clientHash
          .set 'Accept-Encoding', 'sdch'
          .request()
          .on 'response', (res) ->
            client = res
            res.headers['content-encoding'].should.equal 'sdch'
            res.pause()
            res.on 'end', complete
            pressure()
          .end()

      it 'should back-pressure when uncompressed', (done) ->
        buf = null
        client = null
        drained = false
        resp = null
        server = createSimpleSdch opts, (req, res) ->
          resp = res
          res.on 'drain', ->
            drained = true

          res.setHeader 'Content-Type', 'text/plain'
          res.write 'hello worldhello worldhello worldhello worldhello world'
          pressure()

        wait = 2

        crypto.pseudoRandomBytes 1024 * 128, (err, chunk) ->
          buf = chunk
          pressure()

        complete = ->
          if --wait != 0
            return
          drained.should.be.true
          done()

        pressure = ->
          if !buf || !resp || !client
            return

          while resp.write(buf) != false
            resp.flush()

          resp.on 'drain', ->
            resp.write 'end'
            resp.end()
          resp.on 'finish', complete
          client.resume()

        request server
          .get '/'
          .request()
          .on 'response', (res) ->
            client = res
            res.headers.should.not.have.property 'content-encoding'
            res.pause()
            res.on 'end', complete
            pressure()
          .end()

    describe 'thresholds', ->
      it 'should not compress responses below the threshold size', (done) ->
        myOpts =
          threshold: '1kb'
          toSend: (r, dicts) -> dict
          toEncode: (r, dicts) -> dict
        server = createSimpleSdch myOpts, (req, res) ->
          res.setHeader 'Content-Type', 'text/plain'
          res.setHeader 'Content-Length', '110'
          res.end('hello worldhello worldhello worldhello worldhello world' +
                  'hello worldhello worldhello worldhello worldhello world')

        request server
          .get('/')
          .set 'Avail-Dictionary', dict.clientHash
          .set 'Accept-Encoding', 'sdch'
          .end (err, res) ->
            if (err)
              return done err
            res.headers.should.not.have.property 'content-encoding'
            done()

      it 'should compress responses above the threshold size', (done) ->
        myOpts =
          threshold: '1kb'
          toSend: (r, dicts) -> dict
          toEncode: (r, dicts) -> dict
        server = createSimpleSdch myOpts, (req, res) ->
          res.setHeader 'Content-Type', 'text/plain'
          res.setHeader 'Content-Length', '2048'
          res.end new Buffer 2048

        request server
          .get('/')
          .set 'Avail-Dictionary', dict.clientHash
          .set 'Accept-Encoding', 'sdch'
          .expect 'Content-Encoding', 'sdch', done

      it 'should compress when streaming without a content-length', (done) ->
        myOpts =
          threshold: '1kb'
          toSend: (r, dicts) -> dict
          toEncode: (r, dicts) -> dict
        server = createSimpleSdch myOpts, (req, res) ->
          res.setHeader 'Content-Type', 'text/plain'
          res.write 'hello worldhello worldhello worldhello worldhello world'
          setTimeout ->
            res.end 'hello worldhello worldhello worldhello worldhello world'
          10

        request server
          .get('/')
          .set 'Avail-Dictionary', dict.clientHash
          .set 'Accept-Encoding', 'sdch'
          .expect 'Content-Encoding', 'sdch', done

      it 'should not compress when streaming and content-length is lower than threshold', (done) ->
        myOpts =
          threshold: '1kb'
          toSend: (r, dicts) -> dict
          toEncode: (r, dicts) -> dict
        server = createSimpleSdch myOpts, (req, res) ->
          res.setHeader 'Content-Type', 'text/plain'
          res.setHeader 'Content-Length', '110'
          res.write 'hello worldhello worldhello worldhello worldhello world'
          setTimeout ->
            res.end 'hello worldhello worldhello worldhello worldhello world'
          10

        request server
          .get('/')
          .set 'Avail-Dictionary', dict.clientHash
          .set 'Accept-Encoding', 'sdch'
          .end (err, res) ->
            if (err)
              return done err
            res.headers.should.not.have.property 'content-encoding'
            done()

      it 'should compress when streaming and content-length is larger than threshold', (done) ->
        myOpts =
          threshold: '1kb'
          toSend: (r, dicts) -> dict
          toEncode: (r, dicts) -> dict
        server = createSimpleSdch myOpts, (req, res) ->
          res.setHeader 'Content-Type', 'text/plain'
          res.write new Buffer 1024
          setTimeout ->
            res.end new Buffer 1024
          10

        request server
          .get('/')
          .set 'Avail-Dictionary', dict.clientHash
          .set 'Accept-Encoding', 'sdch'
          .expect 'Content-Encoding', 'sdch', done

    describe 'res.flush', ->
      it 'should always be present', (done) ->
        server = createSimpleSdch opts, (req, res) ->
          res.statusCode = if typeof res.flush == 'function' then 200 else 500
          res.flush()
          res.end()

        request server
          .get '/'
          .expect 200, done

      it 'should flush the response', (done) ->
        chunks = 0
        resp = null
        server = createSimpleSdch opts, (req, res) ->
          resp = res
          res.setHeader 'Content-Type', 'text/plain'
          res.setHeader 'Content-Length', '2048'
          write()

        write = ->
          chunks++
          if chunks == 2
            return resp.end()
          if chunks > 2
            return chunks--
          resp.write new Buffer 1024
          resp.flush()

        request server
          .get '/'
          .set 'Avail-Dictionary', dict.clientHash
          .set 'Accept-Encoding', 'sdch'
          .request()
          .on 'response', (res) ->
            res.headers['content-encoding'].should.equal('sdch')
            res.on 'data', write
            res.on 'end', ->
              chunks.should.equal 2
              done()
          .end()

      it 'should flush small chunks for sdch', (done) ->
        chunks = 0
        resp = null
        server = createSimpleSdch opts, (req, res) ->
          resp = res
          res.setHeader 'Content-Type', 'text/plain'
          write()

        write = ->
          chunks++
          if chunks == 20
            return resp.end()
          if chunks > 20
            return chunks--
          resp.write '..'
          resp.flush()

        request server
        .get '/'
        .set 'Avail-Dictionary', dict.clientHash
        .set 'Accept-Encoding', 'sdch'
        .request()
        .on 'response', (res) ->
          res.headers['content-encoding'].should.equal 'sdch'
          res.on 'data', write
          res.on 'end', ->
            chunks.should.equal 20
            done()
        .end()

    describe 'connectSdch.compress', ->
      it 'should compress sdch respones', (done) ->
        server = createSimpleGzip opts, (req, res) ->
          res.setHeader 'Content-Type', 'text/plain'
          res.setHeader 'Content-Encoding', 'sdch'
          res.end 'hello worldhello worldhello worldhello worldhello world' +
                  'hello worldhello worldhello'

        request server
          .get '/'
          .set 'Accept-Encoding', 'sdch,gzip'
          .set 'Avail-Dictionary', dict.clientHash
          .expect 'Content-Encoding', 'sdch,gzip', done

      it 'should not compress other encodings but sdch', (done) ->
        server = createSimpleGzip opts, (req, res) ->
          res.setHeader 'Content-Type', 'text/plain'
          res.setHeader 'Content-Encoding', 'x-custom'
          res.end 'hello worldhello worldhello worldhello worldhello world' +
                  'hello worldhello worldhello'

        request server
          .get '/'
          .set 'Accept-Encoding', 'sdch,gzip'
          .set 'Avail-Dictionary', dict.clientHash
          .expect 'Content-Encoding', 'x-custom', done

      describe 'res.flush', ->
        it 'should flush the gzip response', (done) ->
          chunks = 0
          resp = null
          server = createSimpleGzip opts, (req, res) ->
            resp = res
            res.setHeader 'Content-Type', 'text/plain'
            res.setHeader 'Content-Length', '2048'
            write()

          write = ->
            chunks++
            if chunks == 2
              return resp.end()
            if chunks > 2
              return chunks--
            resp.write new Buffer 1024
            resp.flush()

          request server
            .get '/'
            .set 'Accept-Encoding', 'gzip'
            .request()
            .on 'response', (res) ->
              res.headers['content-encoding'].should.equal('gzip')
              res.on 'data', write
              res.on 'end', ->
                chunks.should.equal 2
                done()
            .end()

    describe 'end-to-end', ->
      storage = new connectSdch.DictionaryStorage [dict]
      parser = (res, fn) ->
        res.data = []
        res.nread = 0
        res.on 'data', (chunk) ->
          res.data.push chunk
          res.nread += chunk.length
        res.on 'end', ->
          try
            enc = Buffer.concat res.data, res.nread
            zlib.gunzip enc, (err, decompressed) ->
              decoded = sdch.sdchDecodeSync decompressed, [dict]
              fn null, decoded
          catch err
            fn err
      it 'should sdch-encode and gzip', (done) ->
        server = createFullServer storage, opts, {}, (req, res) ->
          res.setHeader 'Content-Type', 'text/plain'
          res.end 'hello worldhello worldhello worldhello worldhello world' +
                  'hello worldhello worldhello worldhello worldhello world'

        request server
          .get '/'
          .set 'Accept-Encoding', 'gzip,deflate,sdch'
          .set 'Avail-Dictionary', dict.clientHash
          .expect 'Transfer-Encoding', 'chunked'
          .expect 'Content-Encoding', 'sdch,gzip'
          .expect 'Get-Dictionary', dict.url
          .parse parser
          .end (err, res) ->
            if err
              done err
            done()

      it 'should sdch-encode and gzip dict contents', (done) ->
        server = createFullServer storage, opts, {}, (req, res) ->
          res.setHeader 'Content-Type', 'text/plain'
          res.end 'hello world'

        request server
          .get '/dict/kotiki.dict'
          .set 'Accept-Encoding', 'gzip,deflate,sdch'
          .set 'Avail-Dictionary', dict.clientHash
          .expect 'Transfer-Encoding', 'chunked'
          .expect 'Content-Encoding', 'sdch,gzip'
          .expect 'Get-Dictionary', dict.url
          .parse parser
          .end (err, res) ->
            if err
              done err
            done()

createDictServer = (storage, fn) ->
  serve = connectSdch.serve storage
  http.createServer (req, res) ->
    serve req, res, (err) ->
      if err
        res.statusCode = err.status || 500
        res.end(err.message)
        return
      fn req, res

createSimpleGzip = (opts, fn) ->
  compress = connectSdch.compress opts
  http.createServer (req, res) ->
    compress req, res, (err) ->
      if err
        res.statusCode = err.status || 500
        res.end(err.message)
        return
      fn req, res

createSimpleSdch = (opts, fn) ->
  encode = connectSdch.encode opts
  http.createServer (req, res) ->
    encode req, res, (err) ->
      if err
        res.statusCode = err.status || 500
        res.end(err.message)
        return
      fn req, res


createFullServer = (storage, encodeOpts, compressOpts, fn) ->
  serve = connectSdch.serve storage
  encode = connectSdch.encode encodeOpts
  compress = connectSdch.compress compressOpts
  http.createServer (req, res) ->
    compress req, res, (err) ->
      if err
        res.statusCode = err.status || 500
        res.end(err.message)
        return
      encode req, res, (err) ->
        if err
          res.statusCode = err.status || 500
          res.end(err.message)
          return
        serve req, res, (err) ->
          if err
            res.statusCode = err.status || 500
            res.end(err.message)
            return
          fn req, res
