var mongo = require('mongodb');
var validator = require('validator');
var child_process = require('child_process');
var url = require('url');

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
//      "twitter" : "@nduchast",                                   -- optional
//      "guid" : "1234-5678-90abcdef-1234-4567",                   -- MANDATORY
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

    // check GUID
    if (!voter.hasOwnProperty('guid')) {
       log.error('invalid voter information: missing GUID');
       res.status(400).send('invalid voter information: missing GUID');
       return;
    }
    log.debug("Voter's generated GUID is " + voter['guid']);

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

          // add basic stuff
          voter['vouchers'] = 0;
          voter['certified'] = false;

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
//      "guarantee" : "canadian adult expat",
//      "guid" : "12345678-90AB-CDEF-0123-4567890A"
//    }
//    Note:
//     * Where guarantee is text "Canadian Expat Adult" encrypted with respondent's private key;
//     * Requestor's id is passed in the URL:
exports.certify = function(req, res) {
    var requestor_id = req.params.id;
    var json = req.body;

    log.info("Certifying '" + requestor_id + "' using '" + JSON.stringify(json) +"'");

    // RESPONDENT (aka person who is vouching for the other)
    if (!json.hasOwnProperty('respondent_id')) {
        log.error('missing responding id in json query');
        res.status(400).send('missing responding id in json query');
        return;
    }
    var respondent_id = json.respondent_id;

    // GUARANTEE
    if (!json.hasOwnProperty('guarantee')) {
        log.error('missing guarantee in json query');
        res.status(400).send('missing guarantee in json query');
        return;
    }
    var guarantee = json.guarantee;

    // Check that GUARANTEE is valid
    if (guarantee.toLocaleLowerCase() != "canadian expat adult") {
       log.error("invalid gurantee; maybe cannot decrypt?");
       res.status(400).send("invalid gurantee; maybe cannot decrypt?");
       return;
    }

    // GUID
    if (!json.hasOwnProperty('guid')) {
        log.error('missing guid in json query');
        res.status(400).send('missing guid in json query');
        return;
    }
    var guid = json.guid;
    log.debug("GUID is = '" + guid + "' of size = " + guid.length);
    if (guid.length != 36) {
        log.error("invalid guid in json query (guid='" + guid + "')");
        res.status(400).send("invalid guid in json query (guid='" + guid + "')");
        return;
    }


    // get ObjectID objects; so that we can query with them later
    var requestor_ob_id  = new require('mongodb').ObjectID(requestor_id);
    var respondent_ob_id = new require('mongodb').ObjectID(respondent_id);

    // check if already vouched: i.e. if respondant already vouched for requestor
    db.collection('links', function(err, collection) {

        var linkQuery = {
            'target.id' : requestor_id,     // not an ObjectId, but just a text string
            'validator.id' : respondent_id  // not an ObjectId, but just a text string
        };
        log.debug("query to find link is '" + linkQuery + "'");
        collection.findOne(linkQuery, function(err, link) {

            if (err) {
                log.error("error searching for link: " + err);
                res.status(500).send("error searching for link '" + respondent_id + "' vouching for '" + requestor_id + "'");
                return;
            }

            log.info("link row is '" + link + "'");

            if (link) {
                log.info("already have '" + respondent_id + "' vouching for '" + requestor_id + "'");
                res.status(403).send("already have '" + respondent_id + "' vouching for '" + requestor_id + "'");
                return;
            }


            // fetch requestor's data from DB (aka person who needs to get certified)
            log.debug("looking for requestor '" + requestor_id + "'");
            db.collection('voters', function(err, collection) {

                collection.findOne({'_id': requestor_ob_id}, function(err, requestor) {
                  if (!requestor) {
                     log.error("cannot find requestor '" + requestor_id + "'");
                     res.status(404).send("cannot find requestor '" + requestor_id + "'");
                     return;
                  }
                  log.info("found requestor '" + requestor.name + "' (" + requestor_id + "); email='" + requestor.email + "'");
  
                  // RESPONDENT (person who is vouching that other is legit)
                  log.debug("looking for respondent '" + respondent_id + "'");
                  collection.findOne({'_id': respondent_ob_id}, function(err, respondent) {

                      if (!respondent) {
                          log.error("cannot find respondent '" + respondent_id + "'");
                          res.status(404).send("cannot find respondent '" + respondent_id + "'");
                          return;
                      }

                      log.info("found respondent '" + respondent.name + "' (" + respondent_id + "); email='" + respondent.email + "'");

                      // "encryption" (using GUID since issues with keys) check: is this the real respondent? can this request vouch?
                      if (respondent.guid.trim().toLowerCase() != guid) {
                          log.error("encryption error; not authorized to vouch for requestor");
                          res.status(404).send("encryption error; not authorized to vouch for requestor");
                          return;
                      }
                      log.info("guid (" + guid + ") matches guid for respondent '" + respondent.name + "'");

                      // OK; all checks done... NOW ADD a new link!  aka vouch!
                      var link = {
                         "validator" : {
                            "id": respondent_id,       // not an ObjectId; just text string
                            "name": respondent.name,
                            "email": respondent.email
                         },
                         "target" : {
                            "id": requestor_id,        // not an ObjectId; just text string
                            "name": requestor.name,
                            "email": requestor.email
                         },
                         "target" : "canadian expat adult"
                      };
                      log.info("adding link '" + link + "'");

                      db.collection('links', function(err, collection) {
                          collection.insert(link, {safe:true}, function(err, result) {
                              if (err) {
                                  log.error("ERROR: error inserting '" + requestor.name + "' vouching for '" + respondent.name + "'");
                                  res.status(500).send('some unknown server error trying to add certification');
                                  return;
                              }

                              log.info("successfully inserted '" + requestor.name + "' vouching for '" + respondent.name + "'");

                              // increment count on REQUESTOR's record
                              var newVoucherCount = requestor.vouchers + 1;

                              // if VOUCH by MASTER; you are now certified
                              var newCertifyFlag = requestor.certified;
                              if (respondent.master == true) {
                                 newCertifyFlag = true; // could reste to true if already true; but, that's OK
                                 log.info("changing (possibly) certification for '" + requestor.name + "'; was = " + requestor.certified + " and now will be = " + newCertifyFlag);
                              }

                              // UPDATE requestor's record in voters table
                              db.collection('voters', function(err, collection) {
                                 collection.update({'_id': requestor_ob_id}, {$inc: { vouchers:1}, $set: { certified: newCertifyFlag} }, function(err, requestor) {
                                    if (err) {
                                       log.error("ERROR: error updating record for '" + requestor.name + "'");
                                       res.status(500).send('some unknown server error trying to update voter record');
                                       return;
                                    }
                                    res.status(200).send();
                                 });
                              });


                          }); //   insert
                      }); //       'links' collection


                  }); //           find RESPONDENT

                }); //             find REQUESTOR

            }); //                 'voters' collection

        }); //                     find if link already present


    });  //                        'links' collection


};

function empty(data)
{
  if(typeof(data) == 'number' || typeof(data) == 'boolean')
  { 
    return false; 
  }
  if(typeof(data) == 'undefined' || data === null)
  {
    return true; 
  }
  if(typeof(data.length) != 'undefined')
  {
    return data.length == 0;
  }
  var count = 0;
  for(var i in data)
  {
    if(data.hasOwnProperty(i))
    {
      count ++;
    }
  }
  return count == 0;
}


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

exports.search = function(req, res) {
  var queryData = url.parse(req.url, true).query;
  log.debug("query data is = '" + queryData + "'");

  var fullname = queryData.fullname ? queryData.fullname : null;
  var email = queryData.email ? queryData.email : null;
  var facebook = queryData.facebook ? queryData.facebook : null;
  var twitter = queryData.twitter ? queryData.twitter : null;
  log.debug("fullname = '" + fullname + "' is "  + (empty(fullname) ? "empty" : 'not_empty'));;
  log.debug("email = '" + email + "' is " + (empty(email) ? "empty" : "not_empty"));
  log.debug("facebook = '" + facebook + "' is "  + (empty(facebook) ? "empty" : 'not_empty'));;
  log.debug("twitter = '" + twitter + "' is " + (empty(twitter) ? "empty" : "not_empty"));

  var query = { };
  if (!empty(fullname)) {
    query.name = new RegExp(fullname, 'i');
  }
  if (!empty(email)) {
    query.email = new RegExp(email, 'i');
  }
  if (!empty(facebook)) {
    query.facebook = new RegExp(facebook, 'i');
  }
  if (!empty(twitter)) {
    query.twitter = new RegExp(twitter, 'i');
  }
  if (empty(query)) {
     log.error("must specify something for a search criteria");
     res.status(400).send("must specify something for a search criteria");
     return;
  }

  log.info("search with query = '" + JSON.stringify(query) + "'");

  var options = {
    "limit": 10,
    "sort": "name"
  }
  var fields = {
     "vote" : false,
     "encrypted_vote" : false,
     "guid" : false
  }
  db.collection('voters', function(err, collection) {
      collection.find(query, fields, options).toArray(function(err, docs) {
          if (err) {
              res.status(500).send("can't execute search: " +err);
              return;
          }
          res.send(docs);
      });
  });

};



