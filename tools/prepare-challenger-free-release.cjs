const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=process.cwd(),release=path.join(root,'.tmp/challengerfree-release');
const files=JSON.parse(fs.readFileSync(path.join(release,'live-source.json'),'utf8').replace(/^\uFEFF/,''));
for(const [file,source] of Object.entries(files)){
 const target=path.join(release,file.replace(/^public\//,''));
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);
}
fs.copyFileSync(path.join(root,'src/scripts/54-challenger-free-access.js'),path.join(release,'src/scripts/54-challenger-free-access.js'));
cp.execFileSync(process.execPath,[path.join(root,'tools/install-challenger-free.cjs')],{cwd:release,stdio:'inherit'});
const base='registry.fly.io/fates-entwined-main:deployment-01M5NGM8VDDS9PVER6F99XRBPF';
const changed=['03-profile-and-progression.js','09-challenger-mode.js','09-challenger-v2.js','47-challenger-war-event.js','54-challenger-free-access.js'];
fs.writeFileSync(path.join(release,'Dockerfile'),`FROM ${base}\nCOPY server/authoritative-v3/fly-data-api.mjs /app/server/authoritative-v3/fly-data-api.mjs\nCOPY index.html /app/public/index.html\n`+changed.map(p=>`COPY src/scripts/${p} /app/public/src/scripts/${p}\n`).join(''));
fs.copyFileSync(path.join(root,'fly.toml'),path.join(release,'fly.toml'));
let config=fs.readFileSync(path.join(release,'fly.toml'),'utf8').replace("dockerfile = 'Dockerfile.authority-v3-phase7-beta'","dockerfile = 'Dockerfile'");
fs.writeFileSync(path.join(release,'fly.toml'),config);
fs.writeFileSync(path.join(release,'.dockerignore'),'live-source.json\n');
for(const file of ['server/authoritative-v3/fly-data-api.mjs',...changed.map(p=>'src/scripts/'+p)])cp.execFileSync(process.execPath,['--check',path.join(release,file)]);
console.log('Targeted release prepared from deployed source: global setting, command and Challenger access only.');
