'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const base = path.resolve(__dirname, '..');
let html = fs.readFileSync(path.join(base, 'src/template.html'), 'utf8');
html = html.replace('/* STYLES */', () => fs.readFileSync(path.join(base, 'src/style.css'), 'utf8'));
const files = ['core/motion', 'core/model', 'core/report', 'core/charts', 'core/print', 'easy', 'app'];
html = html.replace('<!-- SCRIPTS -->', () => files.map(file => {
  const code = fs.readFileSync(path.join(base, 'src', file + '.js'), 'utf8');
  new vm.Script(code, { filename: file });
  return '<script data-module="' + file + '">\n' + code.replace(/<\/script/gi, '<\\/script') + '\n</script>';
}).join('\n'));
const target = path.resolve(base, '../스태커크레인_간편실행.html');
fs.writeFileSync(target, html);
console.log('Built separate easy application: ' + target + ' (' + Buffer.byteLength(html) + ' bytes)');
