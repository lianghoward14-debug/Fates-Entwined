const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function rewrite(file,fn){const p=path.join(root,file),s=fs.readFileSync(p,'utf8'),out=fn(s);if(out!==s)fs.writeFileSync(p,out);}
const targets=['src/scripts/23-board-canvas-renderer.js','src/scripts/24-card-grid-canvas-renderer.js','src/scripts/render-v2/03-card-texture-cache.js','src/scripts/render-v2/04-match-renderer-adapter.js'];
for(const file of targets)rewrite(file,s=>{
 if(s.includes('function localizeCanvasText('))return s;
 const ast=ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=[];
 function visit(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&['fillText','strokeText','measureText'].includes(n.expression.name.text)&&n.arguments.length){const arg=n.arguments[0];edits.push({start:arg.getStart(ast),end:arg.end,text:'localizeCanvasText('+arg.getText(ast)+')'});}ts.forEachChild(n,visit);}visit(ast);
 for(const e of edits.sort((a,b)=>b.start-a.start))s=s.slice(0,e.start)+e.text+s.slice(e.end);
 s=s.replace(/function trimText\(ctx, text, maxW\) \{/, 'function trimText(ctx, text, maxW) {\n    text = localizeCanvasText(text);');
 s=s.replace(/function truncateCanvasText\(ctx, text, maxW\) \{/, 'function truncateCanvasText(ctx, text, maxW) {\n    text = localizeCanvasText(text);');
 s=s.replace(/function wrapCanvasText\(ctx, text, maxW, maxLines\) \{/, 'function wrapCanvasText(ctx, text, maxW, maxLines) {\n    text = localizeCanvasText(text);');
 // Translate complete fallback card labels before truncating them.
 s=s.replace(/const name = String\(([^\n]+)\);/, 'const name = localizeCanvasText(String($1));');
 const start=s.indexOf('{');return s.slice(0,start+1)+'\n  function localizeCanvasText(text) { return window.FateI18n ? window.FateI18n.t(text) : String(text == null ? "" : text); }\n'+s.slice(start+1);
});
// Legacy handlers use English labels as identifiers. Read their retained source text.
const files=['src/scripts/06-rendering-and-helpers.js','src/scripts/09-challenger-mode.js','src/scripts/09-challenger-v2.js','src/scripts/17-online-social.js','src/scripts/18-online-rooms.js'];
for(const file of files)rewrite(file,s=>s.split('\n').map(line=>{
 if(!/textContent/.test(line)||!(/\/\^close\$\/|\/leaderboard\/|\/\^Friend Requests\/|===\s*'send'|===\s*'discard selected'|!==\s*'cancel'/.test(line)))return line;
 return line.replace(/\b(button|btn|b|title)\??\.textContent/g,(_,name)=>'(window.FateI18n ? window.FateI18n.sourceText('+name+') : '+name+'?.textContent)');
}).join('\n'));
rewrite('src/scripts/54-localization.js',s=>s.replace('.ingame-chat-name,','.ingame-chat-name,.wc-msg-text,.wc-msg-name,.party-member-copy > strong,.social-online-info > div:first-child,'));
rewrite('tools/localization-smoke.cjs',s=>s.replaceAll("['53-japanese-catalog.js','54-localization.js']","['53-japanese-content.js','53-japanese-catalog.js','54-localization.js']"));
console.log('Canvas localization and text-dependent UI actions updated.');
