const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.resolve(__dirname, '../../스태커크레인_실행.html'), 'utf8');
assert.ok(!/<script[^>]+src\s*=/i.test(html), 'Offline artifact must not fetch scripts.');
assert.ok(!/<link[^>]+href\s*=\s*["']https?:/i.test(html), 'Offline artifact must not fetch CSS.');
const scripts = new Map();
for (const match of html.matchAll(/<script data-module="([^"]+)">([\s\S]*?)<\/script>/g)) { assert.ok(!scripts.has(match[1]), 'Duplicate script module'); scripts.set(match[1], match[2]); }
const context = vm.createContext({ console });
for (const name of ['motion', 'model', 'company', 'engine', 'report']) {
  assert.ok(scripts.has(name), 'Missing module ' + name); vm.runInContext(scripts.get(name), context, { filename: name + '.js' });
}
let passed = 0;
require('../tests/invariants.js')({ M: context.STCMotion, Model: context.STCModel, E: context.STCEngine, R: context.STCReport }, (name, fn) => { fn(); passed++; });
for (const [name, code] of scripts) new vm.Script(code, { filename: name + '.js' });
const companyConfig = context.STCCompany.parse(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/company-inquiry.fe2'), 'utf8'));
const companyResult = context.STCModel.calculate(companyConfig);
assert.equal([companyResult.sc, companyResult.dc, companyResult.available, 7200 / companyResult.dc * companyResult.factor].map(n => n.toFixed(1)).join(','), '86.3,143.5,35.5,42.7', 'Company input parity in deployed modules');
passed++;
console.log('SHIPCHECK: ' + passed + ' invariant groups passed on extracted deployment modules; ' + scripts.size + ' script blocks parse. No external runtime scripts or styles.');
