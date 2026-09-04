import fs from 'node:fs';
import assert from 'node:assert/strict';
const target = process.argv[2];
assert.ok(target, 'target module required');
const source = fs.readFileSync(target, 'utf8');
const bypass = `    // Desktop/web installations use a stable local authority identity when a
    // Google account is not attached. This is the same identity exposed by
    // FATE_ONLINE.user.uid and is required by shared services such as Warfront.
    if(String(token||'').startsWith('session:')){
      const identity=cleanId(String(token).slice(8),112);
      if(!identity||!/^[A-Za-z0-9_-]+$/.test(identity))throw Object.assign(new Error('invalid installation session'),{status:401});
      return cleanId(\`local-\${identity}\`,128);
    }
`;
const normalized = source.replaceAll('\r\n','\n');
assert.equal(normalized.split(bypass).length, 2, 'expected exactly one known bypass; refuse unexpected image');
const patched = normalized.replace(bypass, '');
assert.ok(!patched.includes("startsWith('session:')"), 'session bypass remains');
assert.ok(patched.includes('verifier.verify(cert,decodePart(parts[2]))'), 'signature verification must remain');
fs.writeFileSync(target, source.includes('\r\n') ? patched.replaceAll('\n','\r\n') : patched);
console.log('Removed only the known unsigned-session authentication exception');
