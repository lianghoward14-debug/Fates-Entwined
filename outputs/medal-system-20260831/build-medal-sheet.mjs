import fs from "node:fs/promises";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const names = [
  ["The First Standard","Founding"],["Crimson Vanguard","Valor"],["Azure Vanguard","Valor"],["Crown of the Victor","Royal"],["Iron Laurel","Classical"],
  ["Star of the Warfront","Campaign"],["The Unbroken Line","Defense"],["Spearhead Citation","Offense"],["Gilded Campaigner","Campaign"],["Medal of Entwined Fates","Fate"],
  ["Dawnwatch Honor","Sentinel"],["Twilight Standard","Sentinel"],["The Fivefold Star","Victory"],["Heartland Cross","Territory"],["North Gate Ribbon","Territory"],
  ["Silver Crossing Star","Territory"],["Sunken Road Crest","Territory"],["Crown Reach Laureate","Territory"],["Order of the Resolute","Order"],["Order of the Red Comet","Order"],
  ["Order of the Blue Moon","Order"],["The Fateforged Medal","Fate"],["Starlight Conqueror","Starlight"],["The Golden Front","Prestige"],["Ash and Glory Medal","Battle"],
  ["Banner of Tenacity","Endurance"],["The Final Advance","Offense"],["Shield of the Last Line","Defense"],["Laurel of Command","Leadership"],["Field Marshal's Star","Leadership"],
  ["The Quiet Strategist","Strategy"],["Master of Five Fronts","Strategy"],["Stormbreaker Medal","Valor"],["The Long Vigil","Endurance"],["Crest of the Warbound","Campaign"],
  ["The Concord Star","Unity"],["Twin Banners Medal","Unity"],["The Victorious Accord","Unity"],["Medal of Decisive Force","Commendation"],["Lightning Laureate","Commendation"],
  ["Master of Position Star","Commendation"],["The Gilded Hour","Prestige"],["The Ember Crown","Royal"],["The Sapphire Crown","Royal"],["The Eternal Standard","Legacy"],
  ["Veteran of the War Table","Legacy"],["The Mapmaker's Honor","Strategy"],["Champion of the Five Zones","Victory"],["The Lasting Peace","Legacy"],["Legend of the Warfront","Mythic"]
];

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Medal Catalog");
sheet.showGridLines = false;
sheet.freezePanes.freezeRows(4);
sheet.getRange("A1:D1").merge();
sheet.getRange("A1").values = [["WARFRONT MEDAL CATALOG"]];
sheet.getRange("A2:D2").merge();
sheet.getRange("A2").values = [["Naming approval draft · 50 medal variations · artwork intentionally omitted"]];
sheet.getRange("A4:D4").values = [["Medal ID","Medal Name","Theme","Approval"]];
sheet.getRange("A5:D54").values = names.map((row,i)=>["WAR-"+String(i+1).padStart(3,"0"),row[0],row[1],"Pending"]);
sheet.getRange("A1:D1").format = {fill:"#111D27",font:{name:"Cinzel",size:18,bold:true,color:"#F4D47A"},rowHeight:34,verticalAlignment:"center"};
sheet.getRange("A2:D2").format = {fill:"#172733",font:{name:"Aptos",size:10,italic:true,color:"#AFC2C9"},rowHeight:26,verticalAlignment:"center"};
sheet.getRange("A4:D4").format = {fill:"#9B742D",font:{name:"Aptos",size:10,bold:true,color:"#FFFFFF"},rowHeight:25,verticalAlignment:"center"};
sheet.getRange("A5:D54").format = {fill:"#F5F1E6",font:{name:"Aptos",size:10,color:"#17232B"},rowHeight:21,verticalAlignment:"center",borders:{insideHorizontal:{style:"thin",color:"#D8CFBC"}}};
sheet.getRange("A5:A54").format = {font:{name:"Consolas",size:9,color:"#66757B"},horizontalAlignment:"center"};
sheet.getRange("C5:C54").format = {font:{name:"Aptos",size:9,color:"#80662C"}};
sheet.getRange("D5:D54").format = {font:{name:"Aptos",size:9,italic:true,color:"#7B8589"},horizontalAlignment:"center"};
sheet.getRange("D5:D54").dataValidation = {rule:{type:"list",values:["Pending","Approved","Revise","Reject"]}};
sheet.getRange("A1:D54").format.borders = {outside:{style:"medium",color:"#8C6A2B"}};
sheet.getRange("A:A").format.columnWidth = 14;
sheet.getRange("B:B").format.columnWidth = 34;
sheet.getRange("C:C").format.columnWidth = 18;
sheet.getRange("D:D").format.columnWidth = 16;
const table = sheet.tables.add("A4:D54",true,"WarfrontMedals");
table.style = "TableStyleMedium2";
table.showBandedRows = true;
const preview = await workbook.render({sheetName:"Medal Catalog",range:"A1:D54",scale:1.2,format:"png"});
await fs.writeFile("outputs/medal-system-20260831/medal-catalog-preview.png",new Uint8Array(await preview.arrayBuffer()));
console.log((await workbook.inspect({kind:"table",range:"Medal Catalog!A1:D12",include:"values,formulas",tableMaxRows:12,tableMaxCols:4})).ndjson);
console.log((await workbook.inspect({kind:"match",searchTerm:"#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",options:{useRegex:true,maxResults:50},summary:"formula error scan"})).ndjson);
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save("outputs/medal-system-20260831/warfront-medal-catalog.xlsx");
