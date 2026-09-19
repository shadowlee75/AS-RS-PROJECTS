const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'vendor/manifest.json'), 'utf8'));
for (const item of manifest.files) {
  const bytes = fs.readFileSync(path.join(base, 'vendor', item.file));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw Error('Vendor SHA-256 mismatch: ' + item.file);
}
let html = fs.readFileSync(path.join(base, 'src/template.html'), 'utf8');
html = html.replace('/* STYLES */', fs.readFileSync(path.join(base, 'src/style.css'), 'utf8'));
const files = ['vendor/three.min.js', 'vendor/OrbitControls.js', 'src/motion.js', 'src/model.js', 'src/engine.js', 'src/report.js', 'src/charts.js', 'src/print.js', 'src/scene.js', 'src/app.js', 'src/help.js'];
html = html.replace('<!-- SCRIPTS -->', files.map(file => {
  const id = path.basename(file, '.js');
  const code = fs.readFileSync(path.join(base, file), 'utf8').replace(/<\/script/gi, '<\\/script');
  return '<script data-module="' + id + '">\n' + code + '\n</script>';
}).join('\n'));
html = html.replace('<!-- LICENSE -->', '<!--\n' + fs.readFileSync(path.join(base, 'vendor/LICENSE-three.txt'), 'utf8') + '\n-->');
const target = path.resolve(base, '../스태커크레인_실행.html');
fs.writeFileSync(target, html);
console.log('Built: ' + target + ' (' + Buffer.byteLength(html).toLocaleString() + ' bytes)');
