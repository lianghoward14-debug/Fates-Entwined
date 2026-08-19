import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const diagnosticsDir = path.join(root, 'diagnostics');
const requested = String(process.argv.find(value=>value.startsWith('--campaign-id=')) || '').split('=').slice(1).join('=');
const candidates = fs.existsSync(diagnosticsDir)
  ? fs.readdirSync(diagnosticsDir)
      .filter(name=>/^phase7-campaign-.*\.json$/i.test(name))
      .map(name=>({name, path:path.join(diagnosticsDir, name), mtimeMs:fs.statSync(path.join(diagnosticsDir, name)).mtimeMs}))
      .sort((a, b)=>b.mtimeMs - a.mtimeMs)
  : [];
const selected = requested
  ? candidates.find(entry=>entry.name === `phase7-campaign-${requested}.json`)
  : candidates[0];
if(!selected) throw new Error(requested ? `Campaign not found: ${requested}` : 'No Phase 7 campaign status exists');
const state = JSON.parse(fs.readFileSync(selected.path, 'utf8'));
console.log(JSON.stringify(state, null, 2));
