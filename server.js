var express = require('express'),
    vote = require('./routes/vote');

var app = express();

app.configure(function () {
    app.use(express.logger('dev'));     /* 'default', 'short', 'tiny', 'dev' */
    app.use(express.bodyParser());
});

app.post('/voter', vote.createKeysAndVote);
app.post('/voter/:id/certify', vote.certify);
app.get('/voter/:id', vote.fetchVoter);

app.listen(3001);
console.log('Listening on port 3001...');
