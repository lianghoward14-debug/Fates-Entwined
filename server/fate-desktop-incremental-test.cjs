const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { verify } = require('../tools/verify-desktop-update.cjs');
const { computeOperations, OperationKind } = require('electron-updater/out/differentialDownloader/downloadPlanBuilder');

async function main() {
  // Exercise the actual updater planner: unchanged assets are copied locally,
  // while only the changed middle block is requested from the release server.
  const map = checksums => ({ version: '2', files: [{ name: 'file', offset: 0, sizes: [1024, 16, 1024], checksums }] });
  const plan = computeOperations(map(['art', 'old-code', 'audio']), map(['art', 'new-code', 'audio']), { info() {}, warn() {} });
  const bytes = kind => plan.filter(op => op.kind === kind).reduce((sum, op) => sum + op.end - op.start, 0);
  assert.equal(bytes(OperationKind.DOWNLOAD), 16);
  assert.equal(bytes(OperationKind.COPY), 2048);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fate-incremental-'));
  try {
    const content = Buffer.alloc(2064, 42);
    const file = path.join(directory, 'Setup-1.0.1.exe');
    await fs.writeFile(file, content);
    await fs.writeFile(path.join(directory, 'latest.yml'), JSON.stringify({ version: '1.0.1', files: [{
      url: path.basename(file), size: content.length, sha512: crypto.createHash('sha512').update(content).digest('base64')
    }] }));
    await fs.writeFile(`${file}.blockmap`, zlib.gzipSync(JSON.stringify(map(['art', 'new-code', 'audio']))));
    await verify(directory);
    await fs.writeFile(file, Buffer.alloc(content.length, 43));
    await assert.rejects(verify(directory), /does not match/);
    await fs.writeFile(file, content);
    await fs.writeFile(`${file}.blockmap`, zlib.gzipSync(JSON.stringify(map(['missing']))));
    await assert.rejects(verify(directory), /coverage/);
    await fs.unlink(`${file}.blockmap`);
    await assert.rejects(verify(directory), /ENOENT/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
  console.log('Incremental download planning and release validation tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
