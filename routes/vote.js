var mongo = require('mongodb');
var validator = require('validator');
var child_process = require('child_process');

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
exports.createKeys = function(req, res) {
    var voter = req.body;
    console.log('Adding voter: ' + JSON.stringify(voter));

    // look for name
    if (!voter.hasOwnProperty('name')) {
       res.status(400).send('invalid voter information: missing voter name');
       return;
    }
    console.log("Voter's name is " + voter['name']);
    if (voter['name'].length < 1) {
       res.status(400).send('invalid voter information: empty voter name');
       return;
    }

    // check email
    if (!voter.hasOwnProperty('email')) {
       res.status(400).send('invalid voter information: missing email');
       return;
    }
    if (!validator.isEmail(voter['email'])) {
       res.status(400).send("invalid voter information: invalid email: '" + voter['email']+"'");
       return;
    }

    // check for party vote
    if (!voter.hasOwnProperty('vote')) {
       res.status(400).send('must specify what party / form whom you are voting for');
       return;
    }
    var vote = voter['vote'];
    if (!vote.hasOwnProtery('party')) {
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
        res.status(400).send('must specify a valid party or none');
    }

    console.log('about to start key gen');

    // genrate key
    var cmd = './genkey.sh "' + voter.name + '" ' + voter.email;
    console.log("about to execute '" + cmd + "'");
    child_process.exec(cmd, function(error, stdout, stderr){
       if (error != null) {
          console.log("Execution error '" + error + "'");
          return;
       }

       // parse stdout ; split public and private key
       var lines = stdout.match(/^.*([\n\r]+|$)/gm);
       console.log('number of lines is ' + lines.length);
       var stage = 0;
       var public_key = "";
       var private_key = "";
       for (var i = 0; i<lines.length; i++) {
          var str = lines[i];
          if (str.substr(0,5) == '-----') {
             stage++;
          }
          switch (stage) {
            case 0: // before --BEGIN PGP PUBLIC...
              break;
            case 1: // inside PGP Public
              public_key += str;
              break;
            case 2: // between PUBLIC and PRIVATE keys
              if (str.substr(0,8) == '-----END') {
                public_key += str;
              }
              break;
            case 3: // inside PGP Private
              private_key += str;
              break;
            case 4:
              if (str.substr(0,8) == '-----END') {
                private_key += str;
              }
            default:
              break;
          }
       }
       console.log('public key is :\n'  + public_key);
       console.log('private key is :\n' + private_key);

       // save public key
       voter.public_key = public_key;



       db.collection('voters', function(err, collection) {
          collection.insert(voter, {safe:true}, function(err, result) {
             if (err) {
                 res.status(500).send({'error':'An error has occurred'});
                 return;
             }

             res.send(result);
             return;
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
        last_riding: "Hull--Aylmer",
        current_location: {
           city: "Woodinville",
           state: "Washington",
           country: "USA"
        }
    },
    {
	_id: "2",
        name: "Gill Frank",
        email: "gill.a.frank@gmail.com",
        facebook: "facebook.com/gill.frank",
        twitter: "@1gillianfrank1",
        last_riding: "Toronto--Danforth",
        current_location: {
           city: "Itacha",
           state: "New York",
           country: "USA"
        }
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


