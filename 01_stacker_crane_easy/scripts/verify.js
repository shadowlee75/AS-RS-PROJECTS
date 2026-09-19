'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict'), vm = require('node:vm');
const base = path.resolve(__dirname, '..'), workspace = path.resolve(base, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'qa/original-hashes.json'), 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
for (const [file, sha] of Object.entries(manifest)) assert.equal(hash(fs.readFileSync(path.join(workspace, file))), sha, 'Existing file changed: ' + file);
for (const name of ['motion', 'model', 'report', 'charts', 'print']) assert.ok(fs.readFileSync(path.join(base, 'src/core', name + '.js')).equals(fs.readFileSync(path.join(workspace, '01_stacker_crane/src', name + '.js'))), 'Core mismatch: ' + name);
const html = fs.readFileSync(path.join(workspace, '스태커크레인_간편실행.html'), 'utf8');
assert.ok(!/<script[^>]+src\s*=/i.test(html)); assert.ok(!/<link[^>]+href\s*=\s*["']https?:/i.test(html));
const context = vm.createContext({ console }); let count = 0;
for (const [, name, code] of html.matchAll(/<script data-module="([^"]+)">([\s\S]*?)<\/script>/g)) { new vm.Script(code); if (name !== 'app') vm.runInContext(code, context); count++; }
const c = context.STCEasy.fromDisplay({ vx: '180', operatingEfficiency: '85', loadedFactor: '100' });
const r = context.STCModel.calculate(c); assert.equal(c.vx, 3); assert.equal(c.loadedFactor, 1); assert.equal(r.factor, .85); assert.equal(r.available, r.theory * .85);
const result = { originalFilesUnchanged: Object.keys(manifest).length, copiedCoreIdentical: true, embeddedScripts: count, offline: true, deployedCalculationPassed: true };
fs.writeFileSync(path.join(base, 'qa/verification.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
