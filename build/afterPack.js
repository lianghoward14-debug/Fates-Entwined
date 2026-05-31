const path = require('path');
const { execFileSync } = require('child_process');

exports.default = async function afterPack(context) {
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const ico = path.join(__dirname, 'icon.ico');
  const rcedit = path.join(context.packager.projectDir, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');

  console.log(`  • applying icon to ${path.basename(exe)}`);
  execFileSync(rcedit, [exe, '--set-icon', ico]);
};
