var express = require('express'),
    vote = require('./routes/vote');

var app = express();

app.use(express.logger('dev'));     /* 'default', 'short', 'tiny', 'dev' */
app.use(express.bodyParser());

app.post('/voter', vote.createKeysAndVote);
app.post('/voter/:id/certify', vote.certify);
app.get('/voter/:id', vote.fetchVoter);
app.use(express.static(__dirname + '/web'));

var server = app.listen(80, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('listening at http://%s:%s', host, port);
});


