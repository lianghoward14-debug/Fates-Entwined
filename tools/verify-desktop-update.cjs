const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const yaml = require('js-yaml');

async function verify(directory) {
  const metadata = yaml.load(fs.readFileSync(path.join(directory, 'latest.yml'), 'utf8'));
  const installer = metadata.files?.find(file => file.url.endsWith('.exe'));
  if (!installer || path.basename(installer.url) !== installer.url) {
    throw new Error('Update metadata must reference a local installer filename.');
  }
  const file = path.join(directory, installer.url);
  const size = fs.statSync(file).size;
  const hash = crypto.createHash('sha512');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  if (size !== installer.size || hash.digest('base64') !== installer.sha512) {
    throw new Error('Update installer does not match latest.yml.');
  }
  const blockmap = JSON.parse(zlib.gunzipSync(fs.readFileSync(`${file}.blockmap`)));
  if (!blockmap.version || !blockmap.files?.length) throw new Error('Empty update blockmap.');
  let end = 0;
  for (const entry of blockmap.files) {
    if (entry.offset !== end || !entry.sizes?.length || entry.sizes.length !== entry.checksums?.length
      || entry.sizes.some(value => !Number.isSafeInteger(value) || value <= 0)) {
      throw new Error('Invalid update blockmap coverage.');
    }
    end += entry.sizes.reduce((total, value) => total + value, 0);
  }
  if (end !== size) throw new Error('Update blockmap does not cover the installer.');
  console.log(`Verified incremental update artifacts for ${metadata.version}`);
}

if (require.main === module) verify(process.argv[2] || 'dist').catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
module.exports = { verify };
