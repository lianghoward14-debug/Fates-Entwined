// Campus geometry is shared by rendering, movement, navigation and the minimap.
const CampusMap={width:2600,height:1900,
 buildings:[
 {x:360,y:310,w:330,h:190,name:'Moffitt Library',roof:'#687e89'},
 {x:1030,y:650,w:430,h:180,name:'Doe Library',roof:'#aaa691'},
 {x:410,y:960,w:310,h:210,name:'Dwinelle Hall',roof:'#b48468'},
 {x:1050,y:1090,w:300,h:180,name:'Wheeler Hall',roof:'#a58877'},
 {x:1840,y:380,w:310,h:180,name:'Hearst Mining',roof:'#9c8580'},
 {x:1950,y:1130,w:300,h:230,name:'Faculty Club',roof:'#9b755f'},
 {x:1510,y:1530,w:300,h:210,name:'Sproul Hall',roof:'#ae9c83'},
 {x:400,y:1530,w:300,h:190,name:'MLK Student Union',roof:'#8c9390'},
 {x:1690,y:760,w:82,h:95,name:'Campanile',tower:true,roof:'#d9d2b3'}],
 cover:[{x:940,y:410,w:95,h:28},{x:1450,y:420,w:95,h:28},{x:740,y:1370,w:105,h:30},{x:1490,y:1000,w:30,h:90},{x:2200,y:820,w:110,h:28},{x:1010,y:1660,w:30,h:70}],
 locations:[{name:'MEMORIAL GLADE',x:1250,y:300},{name:'WEST CRESCENT',x:270,y:740},{name:'CAMPANILE ESPLANADE',x:1800,y:960},{name:'STRAWBERRY CREEK',x:2180,y:1480},{name:'SATHER GATE',x:1200,y:1440},{name:'SPROUL PLAZA',x:1190,y:1770}],
 spawns:[{x:960,y:1470},{x:1440,y:1470},{x:1480,y:500},{x:930,y:500}],
 heals:[{x:290,y:740},{x:1250,y:330},{x:2180,y:920},{x:1200,y:1740}],
 region(x,y){return this.locations.reduce((a,b)=>Math.hypot(x-a.x,y-a.y)<Math.hypot(x-b.x,y-b.y)?a:b).name;}
};
if(typeof module!=='undefined')module.exports=CampusMap;
