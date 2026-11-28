import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = fs.readFileSync(path.join(root, 'src/scripts/47-idle-chatter.js'), 'utf8');
const start = script.indexOf('const characters = Object.freeze(');
const end = script.indexOf('const clipUrl = ', start);
if(start < 0 || end < 0) throw new Error('Unable to find chatter roster');
const characters = vm.runInNewContext(script.slice(start, end) + '\ncharacters;');
const issues = [];
const overlaps = new Map();
for(const [key, entry] of Object.entries(characters)){
  if(!fs.existsSync(path.join(root, entry.portrait))) issues.push(`${key}: missing portrait ${entry.portrait}`);
  for(const [id,portrait] of Object.entries(entry.portraitsById || {})){
    if(!entry.ids.has(id)) issues.push(`${key}: portrait mapped to unrelated card ${id}`);
    if(!fs.existsSync(path.join(root,portrait))) issues.push(`${key}: missing variant portrait ${portrait}`);
  }
  for(const portrait of Object.values(entry.speakerPortraits || {})){
    if(!fs.existsSync(path.join(root,portrait))) issues.push(`${key}: missing speaker portrait ${portrait}`);
  }
  for(const [speaker,crop] of Object.entries(entry.speakerCrops || {})){
    if(!entry.speakerPortraits?.[speaker] || !['left','right'].includes(crop))
      issues.push(`${key}: invalid portrait crop for ${speaker}`);
  }
  if(!entry.clips?.length) issues.push(`${key}: no clips`);
  for(const id of entry.ids){
    if(!overlaps.has(id)) overlaps.set(id, []);
    overlaps.get(id).push(key);
  }
  for(let index=0; index<entry.clips.length; index++){
    if(!entry.clips[index]?.some(text=>String(text).trim())) issues.push(`${key}: empty caption ${index+1}`);
    for(const part of entry.clips[index] || []){
      const caption=typeof part === 'string' ? part : part?.text;
      if(!String(caption || '').trim()) issues.push(`${key}: blank caption part ${index+1}`);
      if(/voice line \d+|talk together/i.test(String(caption))) issues.push(`${key}: placeholder caption ${index+1}`);
      if(part?.speaker && (!entry.speakerPortraits?.[part.speaker] || !entry.speakerNames?.[part.speaker]))
        issues.push(`${key}: missing speaker portrait/name for ${part.speaker}`);
    }
    const num=entry.clipNumbers?.[index] ?? index+1;
    const file=path.join(root,'assets/audio/chatter',`${entry.file}${num}.${entry.extension || 'mp3'}`);
    if(!fs.existsSync(file) || fs.statSync(file).size < 100) issues.push(`${key}: missing audio ${path.basename(file)}`);
  }
}
for(const [id,expected] of [['99','rozsiZsofia'],['100','felicytakvetka']]){
  const groups=overlaps.get(id) || [];
  if(groups.length!==1 || groups[0]!==expected)
    issues.push(`union card ${id} must use ${expected} chatter only; found ${groups.join(', ')}`);
}
if(characters.felicytakvetka?.unionCardId!=='100') issues.push('Felicyta/Kvetka union card cannot activate its own chatter');
for(const [group,left,right] of [['felicytakvetka','kvetka','felicyta'],['rozsiZsofia','zsofia','rozsi']]){
  const entry=characters[group];
  if(entry?.speakerCrops?.[left]!=='left' || entry?.speakerCrops?.[right]!=='right')
    issues.push(`${group}: character portraits do not match their union card positions`);
  if(entry?.speakerPortraits?.[left]!==entry?.portrait || entry?.speakerPortraits?.[right]!==entry?.portrait)
    issues.push(`${group}: character portraits must be cropped from the union card art`);
}
console.log(JSON.stringify({characters:Object.keys(characters).length,issues,overlaps:[...overlaps].filter(([,entries])=>entries.length>1)},null,2));
if(issues.length) process.exitCode=1;
