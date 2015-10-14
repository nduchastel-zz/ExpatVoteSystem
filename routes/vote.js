var mongo = require('mongodb');
var validator = require('validator');
var child_process = require('child_process');



var ursa = require('ursa');
var fs = require('fs');

var Server = mongo.Server,
    Db = mongo.Db,
    BSON = mongo.BSONPure;

var server = new Server('localhost', 27017, {auto_reconnect: true});
db = new Db('voters', server);

db.open(function(err, db) {
    if(!err) {
        console.log("Connected to 'voter' database");
        db.collection('voters', {strict:true}, function(err, collection) {
            if (err) {
                console.log("The 'voters' collection doesn't exist. Creating it with sample data...");
                populateVoters();
            }
        });
    }
});

db.open(function(err, db) {
    if(!err) {
        console.log("Connected to 'voter links' database");
        db.collection('voters', {strict:true}, function(err, collection) {
            if (err) {
                console.log("The 'voter links' collection doesn't exist. Creating it with sample data...");
                populateLinks();
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
    console.log('Adding voter: ' + JSON.stringify(voter));

    // look for name
    if (!voter.hasOwnProperty('name')) {
       console.log('invalid voter information: missing voter name');
       res.status(400).send('invalid voter information: missing voter name');
       return;
    }
    console.log("Voter's name is " + voter['name']);
    if (voter['name'].length < 1) {
       console.log('invalid voter information: empty voter name');
       res.status(400).send('invalid voter information: empty voter name');
       return;
    }

    // check email
    if (!voter.hasOwnProperty('email')) {
       console.log('invalid voter information: missing email');
       res.status(400).send('invalid voter information: missing email');
       return;
    }
    if (!validator.isEmail(voter['email'])) {
       console.log("invalid voter information: invalid email: '" + voter['email']+"'");
       res.status(400).send("invalid voter information: invalid email: '" + voter['email']+"'");
       return;
    }
    console.log("looking for email '" + voter.email + "'");
    db.collection('voters', function(err, collection) {
        collection.findOne({'email': voter.email}, function(err, item) {
          if (item) {
             console.log("already found item is '" + item + "'");
             console.log("voter already exist for email '" + voter.email + "'; id = '" + item._id + "'");
             res.status(403).send("voter already exist for email '" + voter.email + "'; id = '" + item._id + "'");
             return;
          }


          // check for party vote
          if (!voter.hasOwnProperty('vote')) {
             console.log('must specify what party / form whom you are voting for');
             res.status(400).send('must specify what party / form whom you are voting for');
             return;
          }
          var vote = voter['vote'];
          if (!vote.hasOwnProperty('party')) {
             console.log('must specify for which party you are voting for');
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
              console.log('must specify a valid party or none');
              res.status(400).send('must specify a valid party or none');
              return;
          }

          console.log('about to start key gen');

          // genrate keys
          var keys = ursa.generatePrivateKey(1024);
          var privPem = keys.toPrivatePem('base64');
          var pubPem = keys.toPublicPem('base64');
          var priv = ursa.createPrivateKey(privPem, '', 'base64');
          var pub = ursa.createPublicKey(pubPem, 'base64');

          console.log("public key pem ='" + pubPem + "'");
          console.log("private key pem ='" + privPem + "'");

          // encrypt vote
          var encrypted_vote = priv.privateEncrypt(party, 'utf8', 'base64');
          console.log("encrypted message = '" + encrypted_vote + "'");

          // save public key (for DB)
          voter.public_key = pubPem;
          voter.encrypted_vote = encrypted_vote;

          // check decrypted
          var check = pub.publicDecrypt(voter.encrypted_vote, 'base64', 'utf8');

          // remove vote from object to store in DB.
          delete voter['vote'];

          console.log('after delete \n' + JSON.stringify(voter));

          // write to DB
          db.collection('voters', function(err, collection) {
             collection.insert(voter, {safe:true}, function(err, result) {
                if (err) {
                    console.log({'error':'An error has occurred'});
                    res.status(500).send({'error':'An error has occurred'});
                    return;
                }
      
                // set values to return back to caller.
                result.public_key = pubPem;
                result.private_key = privPem;
                result.check_vote = check;

                console.log("ID for '" + voter['name'] + "' is '" + result.insertedIds[0] + "'");

                res.send(result);
                return;
             });
          });

        });
    });

};

// sample request to certify someone else
//    {
//      "validator": {
//         "gpg_name" : "Gill Frank (some_email@gmail.com)",
//         "_id": "5567893"
//         "private_key" : "
//              -----BEGIN RSA PRIVATE KEY-----
//              MIIEpAIBAAKCAQEAy5q9/zTgeMXTj8Sj+gvv8ux9NeAhqZp8joYPo2vivA+oWqMD
//              …."
//      },
//      "certification" : "Canadian Expat Adult"
//    }
exports.certify = function(req, res) {
    var target_id = req.params.id;
    var j_req = req.body;

    console.log('Certifying: ' + JSON.stringify(j_req));

    var request = JSON.parse(j_req);
   
    var target = db.collection('voters', function(err, collection) {
        return collection.find({_id: target_id}).limit(1);
    });
    if (target.length < 1)
    {
      res.status(400).send('Voter to certified not found');
      return;
    }
    if (request.indexOf("validator")  < 0) {
       console.log('Cannot certify as validator is not defined!');
       res.status(404).send('missing validator');
       return;
    }
    if (request["validator"].indexOf("_id") < 0) {
       console.log('Cannot certify as id for validator  is not defined!');
       res.status(403).send('missing validator id');
       return;
    }
    var certifier = db.collection('links', function(err, collection) {
        var myId = request['validator']['_id'];
        return collection.find({_id: myId}).limit(1);
    });
    if (certifier.length < 1)
    {
      res.status(404).send('Voter which would certify not found');
      return;
    }
    db.collection('links', function(err, collection) {
       var link = {
          "validator" : {
             "_id": certifier['_id'],
             "name": certifier['name'],
             "email": certifier['email']
          },
          "target" : {
             "_id": target['_id'],
             "name": target['name'],
             "email": target['email']
          },
          "target" : "Canadian Expat Adult"
       };
       collection.insert(link, {safe:true}, function(err, result) {
         if (err) {
            console.log('ERROR: ' + certifier['name'] + ' was NOT able to certify that ' + target['name'] + ' is a Canadian Expat Adult');
            res.status(500, 'some unknown server error trying to add certification');
         } else {
            console.log(certifier['name'] + ' was able to certify that ' + target['name'] + ' is a Canadian Expat Adult');
         }
       });
    });
};

/*--------------------------------------------------------------------------------------------------------------------*/
// Populate database with sample data -- Only used once: the first time the application is started.
// You'd typically not find this code in a real-life app, since the database would already exist.
var populateVoters = function() {

    var masters = [
    {
	_id: "1",
        name: "Nicolas Duchastel de Montrouge",
        email: "nduchast@hotmail.com",
        facebook: "facebook.com/nicolas.duchasteldemontrouge",
        twitter: "@nduchast",
        certified: yes,
        master: yes
    },
    {
	_id: "2",
        name: "Gill Frank",
        email: "gill.a.frank@gmail.com",
        facebook: "facebook.com/gill.frank",
        twitter: "@1gillianfrank1",
        certified: yes,
        master: yes
    }];

    db.collection('voters', function(err, collection) {
        collection.insert(masters, {safe:true}, function(err, result) {});
    });
};


var populateLinks = function() {

    var base_links = [
    {
        validator: {
           _id: "1",
           name: "Nicolas Duchastel de Montrouge",
           email: "nduchast@hotmail.com"
        },
        target: {
           _id: "2",
           name: "Gill Frank",
           email: "gill.a.frank@hgmail.com"
        },
        certification: "Canadian Expat Adult"
    },
    {
        validator: {
           id: "2",
           name: "Gill Frank",
           email: "gill.a.frank@hgmail.com"
        },
        target: {
           id: "1",
           name: "Nicolas Duchastel de Montrouge",
           email: "nduchast@hotmail.com"
        },
        certification: "Canadian Expat Adult"
    }];

    db.collection('links', function(err, collection) {
        collection.insert(base_links, {safe:true}, function(err, result) {});
    });
};



exports.fetchVoter = function(req, res) {
    var id = req.params.id;
    var obj_id = new require('mongodb').ObjectID(req.params.id);
    console.log("Retrieving voter: '" + id + "'");
    db.collection('voters', function(err, collection) {
        collection.findOne({'_id': obj_id}, function(err, item) {
            delete item.encrypted_vote;
            res.send(item);
        });
    });
};

