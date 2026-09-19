const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const Model = require('../src/model.js');
const Motion = require('../src/motion.js');
const sourcePath = path.resolve(__dirname, '../../../1. Stacker Crane/스태커크레인_물동량계산기_v1.0.html');
const html = fs.readFileSync(sourcePath, 'utf8');
const script = html.match(/<script id="stc-engine">([\s\S]*?)<\/script>/)[1];
const context = vm.createContext({ console }); vm.runInContext(script, context);
const legacy = context.STC, selftests = legacy.selftest();
if (selftests.some(t => !t.ok)) throw Error('Legacy selftest failed');
const rows = [];
for (let i = 0; i < 16; i++) {
  const c = { ...Model.defaults, length: 12 + i * 3, height: 5 + i, bays: 2 + i % 4, levels: 2 + i % 3, sides: 1 + i % 2,
    ioX: i % 3, ioY: i % 2, vx: 1 + i / 10, vy: .5 + i / 20, ax: .4 + i / 30, dx: .5 + i / 25, position: i / 8, control: i / 5 };
  const f = Motion.fork(c).duration;
  const old = { ...legacy.defaults, length: c.length * 1000, height: c.height * 1000, bays: c.bays, levels: c.levels, sides: c.sides,
    ioX: c.ioX * 1000, ioY: c.ioY * 1000, vx: c.vx * 60, vy: c.vy * 60, ax: c.ax, ay: c.ay, dx: c.dx, dy: c.dy,
    loadedFactor: 100, position: c.position, cycleDelay: c.control, pickIO: f, depositRack: f, pickRack: f, depositIO: f };
  const value = legacy.discrete(old); rows.push({ config: c, expected: { sc: value.scIn, dc: value.dc } });
}
const target = path.resolve(__dirname, '../tests/legacy-golden.json');
fs.writeFileSync(target, JSON.stringify({ source: sourcePath, sha256: crypto.createHash('sha256').update(html).digest('hex'),
  scope: 'Existing HTML v1.0 discrete-cell model, loadedFactor=1; equal transfer times mapped from new fork kinematics. This is not a Python/FEM certification golden set.',
  legacySelftests: selftests.length, cases: rows }, null, 2));
console.log('Captured ' + rows.length + ' legacy comparison cases; existing selftests ' + selftests.length + '/' + selftests.length + '.');
