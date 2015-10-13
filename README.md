# ExpatVoteSystem

<h1>Summary</h1>
<p>This is code to implement a voting system for Canadian Expat
<p>The goal is to implement a somewhat reasonable system; but, not 100% 'real' or accurate - a small project to have a proof of concept.

<h1>Design</h1>
<p>The overall idea is thatA
<ul>
<li>Every Canadian can 'register' and 'vote' once;
<li>To make it simpler, will only take 'vote' for a party at the national level; not individual ridings;
<li>To ensure that only 'valid' (i.e. Canadian, living outside Canada and 18+ yrs) electors do vote, we ask that each elector gets 'vouched' for by 2 other electors;
<li>This creates a chain or web of trust between electors registered;
<li>To be considered 'certified' (aka for their vote to count), each elector needs to have a chain of trust going back to 1 of a few 'master' elector: this is to simulate an authoritive entity such as Elections Canada (i.e. in a real government system, any elector would send in authoritive documents such as passport, birth certificates etc.. to Elections Canada and they would validate and then certify the elector. In this case, as a very coarse approximation, this proof of concept does this by using the 'web of trust' and the fact that each elector as a chain back to the 'master';
<li>Uses public key (aka public/private keys) to digitally sign votes and statement of electors vouching for each other;
</ul>

<h1>Implementation</h1>
<h3>Server Backend</h3>
<p>Summary
<ul>
<li>This is were most of the action occurs.</li>
<li>This is written in node.js (aka javascript for backend servers).</li>
<li>The code can be found within local file 'server.js' and then any files in the 'routes' sub-directory;</li>
<li>Extra files to make the node.js work are in node_modules (which is not in git) and package.json</li>
</ul>

<h3>REST API</h3>
<p>The node.js code implements a REST Api which is used by front-end (aka browser client) code to execute operations.
<ul>
<li>POST : /voter - includes all info to create voter, a public/private key pair and vote (i.e. for now, just the party voter likes);<br>
  Result
  <ul>
  <li>voter information (name, facebook, email, twitter...) - includes unique ID (from MongoDb) for new voter record</li>
  <li>public key - should be stored by user - e.g. cut + paste somewhere? OR we could save as a cookie?</li>
  <li>private key - should be stored by user - e.g. cut + paste somewhere? OR we could save as a cookie?</li>
  </ul>
  Can error out if voter already exists (based on unique email address).
</li>
<li>GET : /voter/:id - fetch info about a specific voter</li>
<li>POST : /voter/:id/certify - whoever is calling this is about to vouch voter :id<br>
   <ul>
   <li>voter (aka web user) who calls this (from a web page) is actually 'Person A' who is the one vouching for someone else; aka the 'Respondant';</li>
   <li>the person represented by :id is 'Person B'; aka the person being vouched for or certified;
   </ul>
</ul>

<h3>Database</h3>
<p>We also use a MongoDb instance to store all records:
<ul>
<li>Voter table - it contains name, email (primary key), facebook page, twitter,... public key, encryption of vote;</li>
<li>Relationship - that's where we store each link of the 'web of trust': e.g. Person A vouches for person B;</li>
</ul>

<h3>Browser Client Code</h3>
<p>Code can be found in the 'web' sub directory;

<h3>Flow</h3>
<p>There are 3 main steps which need to be accomplished by the user and 1 by the system:
<ol>
<li>Register: aka create a voter entry in our system;</li>
<li>Get Certified: aka get a bunch of your friends to vouch for you;</li>
<li>Vote</li>
</ol>

<p>Here are the files
<ul>
<li>create.html - actually does both step #1 and step #2 - i.e. will ask for all info and also for party to vote for. Then, will send it 'down' to server backend where a new public/private key pair will be generated. Then, the vote (represented by small text of party name) will be encrypted using the private key.</li>
<li>vouch.html - this will be a web page where anyone with an accout (aka voter record created in create.html) can vouch for someone else. This will take :id for both user vouching (aka respondant) (maybe we can store :id / private key in cookies?) and for person being vouched for; the :id value in the URL;</li>
</ul>

