var mongo = require('mongodb');
var validator = require('validator');
var child_process = require('child_process');

var log4js = require('log4js');

var log = log4js.getLogger('vote');

var ursa = require('ursa');
var fs = require('fs');

var Server = mongo.Server,
    Db = mongo.Db,
    BSON = mongo.BSONPure;

log.debug("about to connect to mongodb");

var server = new Server('localhost', 27017, {auto_reconnect: true});
db = new Db('voters', server);

db.open(function(err, db) {
    if(!err) {
        log.info("Connected to 'voter' database");
        db.collection('voters', {strict:true}, function(err, collection) {
            if (err) {
                log.error("The 'voters' collection doesn't exist. Go CREATE it!");
            }
        });
    }
});

db.open(function(err, db) {
    if(!err) {
        log.info("Connected to 'voter links' database");
        db.collection('voters', {strict:true}, function(err, collection) {
            if (err) {
                log.error("The 'voters' collection doesn't exist. Go CREATE it!");
            }
        });
    }
});



// create a new voter with public/private keys
// sample:
//   {
//      "name" : "Nicolas Duchastel de Montrouge",                 -- MANDATORY
//      "email" : "nduchast@hotmail.com",                          -- MANDATORY
//      "facebook" : "facebook.com/nicolas.duchasteldemontrouge",  -- optional
//      "twitter" : "@nduchast"                                    -- optional
//      "lastRiding" : "Hull-Aylmer",                              -- optional
//      "currentLocation" : {                                      -- optional
//          "city": "Woodinville",                                 -- any set of fields
//          "state" : "Washington",
//          "country" : "USA"
//      },
//      "vote": {
//        "party": "ndp" 
//      }
//   }
exports.createKeysAndVote = function(req, res) {
    var voter = req.body;
    log.debug('Adding voter: ' + JSON.stringify(voter));

    // look for name
    if (!voter.hasOwnProperty('name')) {
       log.error('invalid voter information: missing voter name');
       res.status(400).send('invalid voter information: missing voter name');
       return;
    }
    log.debug("Voter's name is " + voter['name']);
    if (voter['name'].length < 1) {
       log.error('invalid voter information: empty voter name');
       res.status(400).send('invalid voter information: empty voter name');
       return;
    }

    // check email
    if (!voter.hasOwnProperty('email')) {
       log.error('invalid voter information: missing email');
       res.status(400).send('invalid voter information: missing email');
       return;
    }
    if (!validator.isEmail(voter['email'])) {
       log.error("invalid voter information: invalid email: '" + voter['email']+"'");
       res.status(400).send("invalid voter information: invalid email: '" + voter['email']+"'");
       return;
    }
    log.debug("looking for email '" + voter.email + "'");
    db.collection('voters', function(err, collection) {
        collection.findOne({'email': voter.email}, function(err, item) {
          if (item) {
             log.error("already found item is '" + item + "'");
             log.error("voter already exist for email '" + voter.email + "'; id = '" + item._id + "'");
             res.status(403).send("voter already exist for email '" + voter.email + "'; id = '" + item._id + "'");
             return;
          }


          // check for party vote
          if (!voter.hasOwnProperty('vote')) {
             log.error('must specify what party / form whom you are voting for');
             res.status(400).send('must specify what party / form whom you are voting for');
             return;
          }
          var vote = voter['vote'];
          if (!vote.hasOwnProperty('party')) {
             log.error('must specify for which party you are voting for');
             res.status(400).send('must specify for which party you are voting for');
             return;
          }
          var party = vote['party'].trim().toLowerCase();
          switch (party) {
            case 'bloc': 
            case 'conservative': 
            case 'green': 
            case 'liberal': 
            case 'ndp': 
            case 'none':
              break;
            default:
              log.error('must specify a valid party or none');
              res.status(400).send('must specify a valid party or none');
              return;
          }

          log.debug('about to start key gen');

          // genrate keys
          var keys = ursa.generatePrivateKey(1024);
          var privPem = keys.toPrivatePem('base64');
          var pubPem = keys.toPublicPem('base64');
          var priv = ursa.createPrivateKey(privPem, '', 'base64');
          var pub = ursa.createPublicKey(pubPem, 'base64');

          log.debug("public key pem ='" + pubPem + "'");
          log.debug("private key pem ='" + privPem + "'");

          var privUTF8 = keys.toPrivatePem('utf8');
          var pubUTF8 = keys.toPrivatePem('utf8');
          log.debug("public key pem (utf8) ='" + pubUTF8 + "'");
          log.debug("private key pem (utf8) ='" + privUTF8 + "'");

          // encrypt vote
          var encrypted_vote = priv.privateEncrypt(party, 'utf8', 'base64');
          log.debug("encrypted message = '" + encrypted_vote + "'");

          // save public key (for DB)
          voter.public_key = pubPem;
          voter.encrypted_vote = encrypted_vote;

          // check decrypted
          var check = pub.publicDecrypt(voter.encrypted_vote, 'base64', 'utf8');

          // remove vote from object to store in DB.
          delete voter['vote'];

          // write to DB
          db.collection('voters', function(err, collection) {
             collection.insert(voter, {safe:true}, function(err, result) {
                if (err) {
                    log.error({'error':'An error has occurred'});
                    res.status(500).send({'error':'An error has occurred'});
                    return;
                }
      
                // set values to return back to caller.
                result.public_key = pubPem;
                result.private_key = privPem;
                result.check_vote = check;

                log.info("ID for '" + voter['name'] + "' is '" + result.insertedIds[0] + "'");

                res.send(result);
                return;
             });
          });

        });
    });

};

// sample request to certify someone else
//    {
//      "respondent_id": "561e619e6844cd6825f71123"
//      "guarantee" : "2388830aa391299d9299901238786471ffeabbcd828000"
//    }
//    Note:
//     * Where guarantee is text "Canadian Expat Adult" encrypted with respondent's private key;
//     * Requestor's id is passed in the URL:
exports.certify = function(req, res) {
    var requestor_id = req.params.id;
    var json = req.body;

    log.info("Certifying '" + requestor_id + "' using '" + JSON.stringify(json) +"'");

    // look for respondent's id
    if (!json.hasOwnProperty('respondent_id')) {
       log.error('missing responding id in json query');
       res.status(400).send('missing responding id in json query');
       return;
    }
    var respondent_id = json.respondent_id;

    // look for encrypted guarantee
    if (!json.hasOwnProperty('guarantee')) {
       log.error('missing encrypted guarantee in json query');
       res.status(400).send('missing encrypted guarantee in json query');
       return;
    }
    var guarantee = json.guarantee;

    // fetch requestor's data from DB (aka person who needs to get certified)
    log.debug("looking for requestor '" + requestor_id + "'");
    db.collection('voters', function(err, collection) {
        var obj_id = new require('mongodb').ObjectID(requestor_id);
        collection.findOne({'_id': obj_id}, function(err, requestor) {
          if (!requestor) {
             log.error("cannot find requestor '" + requestor_id + "'");
             res.status(404).send("cannot find requestor '" + requestor_id + "'");
             return;
          }
          log.info("found requestor '" + requestor.name + "' (" + requestor_id + ")");
  
          log.debug("looking for respondent '" + respondent_id + "'");
          obj_id = new require('mongodb').ObjectID(respondent_id);
          collection.findOne({'_id': obj_id}, function(err, respondent) {
            if (!respondent) {
               log.error("cannot find respondent '" + respondent_id + "'");
               res.status(404).send("cannot find respondent '" + respondent_id + "'");
               return;
            }
            log.info("found respondent '" + respondent.name + "' (" + respondent_id + ")");

            // validate encrypted guarantee / certification
/***
            var pub = ursa.createPublicKey(respondent.public_key, 'base64');
            var check = pub.publicDecrypt(guarantee, 'base64', 'utf8');
            log.debug("decrypyed guarantee text is '" + check + "'");

***/
            check = guarantee;
            if (check.toLocaleLowerCase() != "canadian expat adult") {
               log.error("invalid gurantee; maybe cannot decrypt?");
               res.status(400).send("invalid gurantee; maybe cannot decrypt?");
               return;
            }
 
            var link = {
               "validator" : {
                  "_id": respondent_id,
                  "name": respondent.name,
                  "email": respondent.email
               },
               "target" : {
                  "_id": requestor_id,
                  "name": requestor.name,
                  "email": requestor.email
               },
               "target" : "Canadian Expat Adult"
            };
            db.collection('links', function(err, collection) {
               collection.insert(link, {safe:true}, function(err, result) {
                  if (err) {
                     log.error("ERROR: error inserting '" + requestor.name + "' vouching for '" + respondent.name + "'");
                     res.status(500).send('some unknown server error trying to add certification');
                     return;
                  }

                  log.info("successfully inserted '" + requestor.name + "' vouching for '" + respondent.name + "'");
                  res.status(200).send();
               });
            });
         }); 
        });
      });
};



exports.fetchVoter = function(req, res) {
    var id = req.params.id;
    var obj_id = new require('mongodb').ObjectID(req.params.id);
    log.info("Retrieving voter: '" + id + "'");
    db.collection('voters', function(err, collection) {
        collection.findOne({'_id': obj_id}, function(err, item) {
            delete item.encrypted_vote;
            res.send(item);
        });
    });
};

