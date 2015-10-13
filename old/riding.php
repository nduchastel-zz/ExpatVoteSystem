<?php
$_GET['pvalue'] = 'quebec'; 
 
$ridings = [ 'alberta' => ['Calgary Heritage', 'Calgary Centre', 'Bow River', 'Foothills', 'Banff-Airdrie'
                          ],
             'bc' => ['Burnaby North-Seymour', 'Burnaby South', 'Richmond Centre', 'Delta'
                     ],
             'manitorba' => ['Winnipeg Centre', 'Saint-Boniface-Saint-Vital', 'Winnipeg South', 'Elmwood-Transcona'
                            ],
             'newbrunswick' => ['Fredericton', 'Fundy Royal', 'Miramichi-Grand-Lake', 'Tobique-Mactaquac'
                               ],
             'newfoundland' => ['Avalon', 'South St-Johns-Mount Pearl', 'East St-Johns', 'Bonavista-Burin-Trinity', 'Long Range Mountains'
	                       ],
             'novascotia' => ['Dartmouth-Cole Harbour','Halifax', 'South Shores-Saint-Margarets', 'West Halifax', 'Nova Centre'
	                     ],
             'ontario' => ['Carleton', 'Orleans', 'Scarborough Soutwest', 'Eglington-Lawrence', 'York Centre', 'Markham-Thornhill',
                           'Don Valley North', 'Davenport', 'University-Rosedale', 'Spadina-Fort York', 'Toronto-Danforth',
                           'Thornhill', 'Milton', 'Hamilton Mountain', 'Brantford-Brant'
	                  ],
             'pei' => ['Cardigan', 'Malpeque', 'Egmont'
	              ],
             'quebec' => ['Papineau', 'Outremont', 'Mont-Royal', 'Saint-Laurent', 'Longueil-Saint-Hubert', 'Hull-Aylmer', 'Gatineau',
                          'Quebec', 'Beauport-Limoilou', 'Louis-Saint-Laurent', 'Louis-Hebert'
	                 ],
             'saskatchewan' => ['Saskatoon-University', 'Saskatoon-Grasswoord', 'West Saskatoon', 'Regina-Waskana', 'Regina Lewvan'
	                       ],
             'nwt' => ['Northwest Territories'
	              ],
             'nunavut' => ['Nunavut'
	                  ],
             'yukon' => ['Yukon'
	                ]
      ];

echo '<option value="">Please select provincial rdiding</option>\n';

if (array_key_exists($pvalue, $ridings)) {
  $provincial_riding = $ridings[$pvalue];
  foreach($provincial_riding as $district) {
    echo '<option value="'.$district.'">' . $district . "</option>\n";
  }
}
 
?>
