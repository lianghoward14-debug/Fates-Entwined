'use strict';
// Export only static strings with a player-visible provenance. Never read user data.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),output=path.join(root,'docs/localization');fs.mkdirSync(output,{recursive:true});
const entries=new Map(),excluded=[];
function decode(s){const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',times:'×',mdash:'—',ndash:'–',hellip:'…',rarr:'→'};return s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(raw,key)=>{if(entities[key])return entities[key];if(key[0]==='#'){const n=key[1]==='x'?parseInt(key.slice(2),16):Number(key.slice(1));if(Number.isFinite(n)&&n<=0x10ffff)return String.fromCodePoint(n);}return raw;});}
function add(raw,file,line,provenance){
 let s=decode(raw).replace(/\s+/g,' ').trim();s=s.replace(/(?:ZXQ\d+QXZ){2,}/g, x=>x.match(/ZXQ\d+QXZ/)[0]);const ids=new Map();s=s.replace(/ZXQ\d+QXZ/g,x=>{if(!ids.has(x))ids.set(x,ids.size);return 'ZXQ'+ids.get(x)+'QXZ';});const plain=s.replace(/ZXQ\d+QXZ/g,'').trim();
 if(!/[A-Za-z]{2,}/.test(plain)||s.length>5000||ids.size>10)return;
 if(/^[_#.]|^--|https?:|[{}=]|=>|\b(?:function|const|undefined|null)\b|\\[wdsb]|#[\da-f]{3,8}\b|\d(?:px|rem)\b|\b(?:rgba|rgb)\b|[A-Za-z]_[A-Za-z]|\.(?:png|webp|jpg|mp3|webm|mp4|js|css|svg|mjs)\b/.test(plain))return;
 if(/^[a-z][A-Za-z]*[A-Z]|^[a-z]+(?:[-.][a-z]+)+$/.test(plain)&&!/[\s]/.test(plain))return;
 if(/^\[|[<>]|^[A-Za-z]+\([^)]*\)$/.test(plain)&&!/[A-Za-z] \(/.test(plain))return;
 if(ids.size&&plain.replace(/[^A-Za-z]/g,'').length<5)return;
 const key=s.toLowerCase();if(!entries.has(key))entries.set(key,{source:s,locations:[],provenance:[]});const e=entries.get(key),loc=file+':'+line;if(e.locations.length<4&&!e.locations.includes(loc))e.locations.push(loc);if(!e.provenance.includes(provenance))e.provenance.push(provenance);
}
function parts(raw,file,line,reason){
 if(/<\/?(?:div|span|button|p|b|i|em|strong|h[1-6]|input|label|option|select|small|a|li|ul|img|section|header|footer|article|td|tr|th|text|tspan|svg|br|hr)\b/i.test(raw)){
  const html=raw.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  for(const m of html.matchAll(/\b(?:title|placeholder|aria-label|alt)\s*=\s*(["'])([\s\S]*?)\1/gi))add(m[2],file,line,'HTML accessible attribute');
  for(const text of html.split(/<[^>]*>/g))add(text,file,line,'HTML display text');
 }else if(reason)add(raw,file,line,reason);
}
function flatten(n,state={i:0}){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text;if(ts.isTemplateExpression(n))return n.head.text+n.templateSpans.map(s=>'ZXQ'+state.i+++'QXZ'+s.literal.text).join('');if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken)return flatten(n.left,state)+flatten(n.right,state);if(ts.isParenthesizedExpression(n))return flatten(n.expression,state);return 'ZXQ'+state.i+++'QXZ';}
function provenance(n,file,ast){
 let child=n;
 for(let p=n.parent;p&&!ts.isSourceFile(p);child=p,p=p.parent){
  if(ts.isPropertyAssignment(p)){
   const key=p.name.getText(ast).replace(/["']/g,'');
   if(/^(flavor|story|lore|bio|biography)$/.test(key))return false;
   if(p.name===child)return false;
   if(/^(title|label|text|description|desc|subtitle|copy|message|hint|tooltip|caption|subLabel|subcopy|emptyText|removeLabel|fallbackText)$/.test(key))return 'UI text property: '+key;
   if(/^(name|ability|effect)$/.test(key)&&/(01-data|01a-pressure|03-profile|04-game-setup|09-challenger-mode|09-challenger-v2|47-challenger|rule.*metadata|rules-oracle|warfront-maps|support-company)/.test(file))return 'Card/map display field: '+key;
  }
  if(ts.isBinaryExpression(p)&&p.operatorToken.kind===ts.SyntaxKind.EqualsToken){const left=p.left.getText(ast);if(/\.(?:textContent|innerText|innerHTML|outerHTML|title|placeholder)$/.test(left))return 'DOM display assignment';}
  if(ts.isCallExpression(p)){
   const fn=p.expression.getText(ast);
   if(/^(?:toast|showModal|showConfirm|showConfirmModal|alert|confirm|prompt|log|showAIDialogue|tutorialDialogue|tutorialHint|showTutorialHint|runNonVisualPrep|showFateLoadingScreen|updateFateLoadingScreen)$/.test(fn))return 'Visible UI call: '+fn;
   if(/\.(?:fillText|strokeText|measureText)$/.test(fn))return 'Canvas display text';
   if(/\.setAttribute$/.test(fn)&&p.arguments[0]&&/^(?:title|aria-label|placeholder|alt)$/.test(p.arguments[0].text||'')&&p.arguments[1]===child)return 'DOM accessible attribute';
  }
  if(ts.isVariableDeclaration(p)){
   const name=p.name.getText(ast);
   if(/12-ai-dialogue/.test(file)&&/^AI_.*(?:DIALOGUE_BANK|DIALOGUE_OPENERS|DIALOGUE_MIDDLES|DIALOGUE_ENDINGS)$/.test(name))return 'Authored AI dialogue';
   if(/(?:Text|Label|Title|Hint|Message|Caption|Tooltip|Copy)$/.test(name)||/^(?:title|label|message|hint|tooltip|caption|subcopy)$/.test(name))return 'UI display variable: '+name;
  }
  if(ts.isFunctionLike(p))break;
 }
 return null;
}
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of files(path.join(root,'src/scripts')).concat(files(path.join(root,'shared'))).filter(f=>/\.(js|mjs)$/.test(f))){
 const rel=path.relative(root,file).replace(/\\/g,'/');if(/(?:lore|campaign\/|53-japanese|54-localization|e2e|test|benchmark|ai-learning|07-ai\.js|07-ai-intelligence)/i.test(rel)){excluded.push(rel);continue;}
 const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 function visit(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isTemplateExpression(n)||(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken&&!(ts.isBinaryExpression(n.parent)&&n.parent.operatorToken.kind===ts.SyntaxKind.PlusToken))){const reason=provenance(n,rel,ast);if(reason!==false)parts(flatten(n),rel,ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1,reason);}ts.forEachChild(n,visit);}visit(ast);
}
parts(fs.readFileSync(path.join(root,'index.html'),'utf8'),'index.html',1,'HTML display text');
for(const file of files(path.join(root,'src/styles')).filter(f=>f.endsWith('.css')&&!f.endsWith('localization-generated.css'))){const source=fs.readFileSync(file,'utf8');for(const m of source.matchAll(/content\s*:\s*(["'])([^"']*[A-Za-z][^"']*)\1/g))add(m[2].replace(/\\A\s*/g,' '),path.relative(root,file).replace(/\\/g,'/'),source.slice(0,m.index).split('\n').length,'CSS display label');}
const list=[...entries.values()].sort((a,b)=>a.source.localeCompare(b.source));
fs.writeFileSync(path.join(output,'source-inventory.json'),JSON.stringify({scope:'Confirmed player-visible non-story text only',excluded,entries:list},null,2));
console.log(JSON.stringify({messages:list.length,characters:list.reduce((n,e)=>n+e.source.length,0),templates:list.filter(e=>/ZXQ\d+QXZ/.test(e.source)).length,provenance:[...new Set(list.flatMap(e=>e.provenance))],samples:list.filter((_,i)=>i%350===0)},null,2));
