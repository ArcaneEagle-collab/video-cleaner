const { downloadArtifact } = require('@electron/get');
const extract = require('extract-zip');
const fs = require('fs');
const path = require('path');
const electronPkg = require('../node_modules/electron/package.json');

async function main() {
  const version = electronPkg.version;
  console.log(`Downloading Electron v${version} for ${process.platform}-${process.arch}...`);
  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.platform,
    arch: process.arch,
  });
  console.log(`Downloaded artifact to: ${zipPath}`);
  const distPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist');
  console.log(`Extracting to: ${distPath}...`);
  await extract(zipPath, { dir: distPath });
  fs.writeFileSync(path.join(__dirname, '..', 'node_modules', 'electron', 'path.txt'), 'electron.exe');
  console.log('Electron successfully installed and configured!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
