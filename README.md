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
<h2>Server Backend</h2>
<p>Summary
<ul>
<li>This is were most of the action occurs.</li>
<li>This is written in node.js (aka javascript for backend servers).</li>
<li>The code can be found within local file 'server.js' and then any files in the 'routes' sub-directory;</li>
<li>Extra files to make the node.js work are in node_modules (which is not in git) and package.json</li>
</ul>

<h2>Browser Client Code</h2>
<p>Code can be found in the 'web' sub directory;

<h2>Flow</h2>
<p>There are 3 main steps which need to be accomplished by the user and 1 by the system:
<ol>
<li>Register: aka create a voter entry in our system;</li>
<li>Get Certified: aka get a bunch of your friends to vouch for you;<li>
<li>Vote</li>

