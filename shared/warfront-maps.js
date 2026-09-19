// Shared by the browser and authoritative server. A map is selected once per campaign.
(function(root){
'use strict';
const maps=[
  {
    "id": "libya",
    "name": "Libya",
    "zones": [
      "Tripoli Breakwater",
      "Ghadames Caravanserai",
      "Sirte Salt Flats",
      "Black Wadi",
      "Kufra Wells"
    ],
    "image": "warfront/concepts/subdued-screenprint/01-libya.png"
  },
  {
    "id": "south-africa",
    "name": "South Africa",
    "zones": [
      "Jackal Kopje",
      "Kimberley Pit",
      "Karoo Windmill",
      "Cape Signal Station",
      "Dragon's Teeth"
    ],
    "image": "warfront/concepts/subdued-screenprint/02-south-africa.png"
  },
  {
    "id": "alaska",
    "name": "Alaska",
    "zones": [
      "Whiteout Station",
      "Yukon Ferry",
      "Denali Icefall",
      "Abandoned Cannery",
      "Raven Inlet"
    ],
    "image": "warfront/concepts/subdued-screenprint/03-alaska.png"
  },
  {
    "id": "polish-carpathians",
    "name": "Polish Carpathians",
    "zones": [
      "Wolfpine Monastery",
      "Dunajec Gorge",
      "Shepherd's Hollow",
      "The Broken Viaduct",
      "Bieszczady Watchtower"
    ],
    "image": "warfront/concepts/subdued-screenprint/04-polish-carpathians.png"
  },
  {
    "id": "amazon",
    "name": "Amazon",
    "zones": [
      "Jaguar Landing",
      "Drowned Mission",
      "Emerald Canopy",
      "Rubber Baron's Estate",
      "Serpent Lagoon"
    ],
    "image": "warfront/concepts/subdued-screenprint/05-amazon.png"
  },
  {
    "id": "french-fields",
    "name": "French Fields",
    "zones": [
      "Widow's Orchard",
      "Saint-Martin Bell Tower",
      "The Red Mill",
      "Poppy Cemetery",
      "Château des Cendres"
    ],
    "image": "warfront/concepts/subdued-screenprint/06-french-fields.png"
  },
  {
    "id": "leningrad",
    "name": "Leningrad",
    "zones": [
      "Nevsky Barricade",
      "Frozen Tram Depot",
      "Ladoga Lifeline",
      "Admiralty Yard",
      "The Silent Conservatory"
    ],
    "image": "warfront/concepts/subdued-screenprint/07-leningrad.png"
  },
  {
    "id": "ukraine",
    "name": "Ukraine",
    "zones": [
      "Polissia Woodcutters' Camp",
      "Dnieper Ferry",
      "The Golden Granary",
      "Sunflower Railhead",
      "Donbas Ironworks"
    ],
    "image": "warfront/concepts/subdued-screenprint/08-ukraine.png"
  },
  {
    "id": "chihuahua-desert",
    "name": "Chihuahua Desert",
    "zones": [
      "Vulture Mesa",
      "The Dry Aqueduct",
      "Coyote Chapel",
      "Mapimí Ghost Town",
      "Copper Canyon Switchback"
    ],
    "image": "warfront/concepts/subdued-screenprint/09-chihuahua-desert.png"
  },
  {
    "id": "norway-tundra",
    "name": "Norway Tundra",
    "zones": [
      "Aurora Watch",
      "Tana Reindeer Camp",
      "The Blue Crevasse",
      "Alta Radio Mast",
      "Varanger Whaling Pier"
    ],
    "image": "warfront/concepts/subdued-screenprint/10-norway-tundra.png"
  }
];
const zoneIds=['north-gate','silver-crossing','heartland','sunken-road','crown-reach'];
function get(id){return maps.find(map=>map.id===id)||maps.find(map=>map.id==='french-fields');}
function pick(previousId,random=Math.random){const pool=maps.filter(map=>map.id!==previousId);return pool[Math.min(pool.length-1,Math.max(0,Math.floor(random()*pool.length)))];}
function apply(event,map){event.mapId=map.id;event.mapName=map.name;(event.zones||[]).forEach((zone,i)=>{zone.mapId=map.id;zone.name=map.zones[zoneIds.indexOf(zone.id)]||map.zones[i];});return event;}
const api={maps,zoneIds,get,pick,apply};
if(typeof module==='object'&&module.exports)module.exports=api;else root.FateWarfrontMaps=api;
})(globalThis);
