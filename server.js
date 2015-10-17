var express = require('express'),
    cluster  = require('express-cluster'),
    vote = require('./routes/vote'),
    fs = require("fs"),
    http = require("http"),
    https = require('https');

/**
 * Initialise log4js first, so we don't miss any log messages
 */
var log4js = require('log4js');
log4js.configure('./config/log4js.json');

var logger = log4js.getLogger('startup');

cluster(function() {
   var app = express();

   app.use(log4js.connectLogger(log4js.getLogger("http"), { level: 'auto' }));

   app.use(express.logger('dev'));     /* 'default', 'short', 'tiny', 'dev' */
   app.use(express.bodyParser());

   app.post('/voter', vote.createKeysAndVote);
   app.post('/voter/:id/certify', vote.certify);
   app.get('/voter/:id', vote.fetchVoter);
   app.get('/search', vote.search);

   app.use(express.static(__dirname + '/web'));

   var options = {
     key: fs.readFileSync('expatvote.key'),
     cert: fs.readFileSync('expatvote.cert')
   };

   https.createServer(options, app).listen(8443);

   http.createServer(function(req, res){
      res.writeHead(301, {
       "location" : "https://expatvote.ca"
      });
      res.end();
   }).listen(8080);

});
