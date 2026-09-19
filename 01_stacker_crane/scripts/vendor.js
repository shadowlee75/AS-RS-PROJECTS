// Run only when intentionally refreshing the pinned r128 vendor copy.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = path.resolve(__dirname, '../vendor');
const entries = [
  ['three.min.js', 'https://raw.githubusercontent.com/mrdoob/three.js/r128/build/three.min.js'],
  ['OrbitControls.js', 'https://raw.githubusercontent.com/mrdoob/three.js/r128/examples/js/controls/OrbitControls.js'],
  ['LICENSE-three.txt', 'https://raw.githubusercontent.com/mrdoob/three.js/r128/LICENSE']
];
(async () => {
  fs.mkdirSync(base, { recursive: true });
  const manifest = { version: 'three.js r128 (0.128.0)', files: [] };
  for (const [file, url] of entries) {
    const response = await fetch(url); if (!response.ok) throw Error('Download failed: ' + response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(path.join(base, file), bytes);
    manifest.files.push({ file, url, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  fs.writeFileSync(path.join(base, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('Pinned vendor files downloaded and SHA-256 recorded.');
})().catch(error => { console.error(error); process.exitCode = 1; });
