const test = require('node:test'), assert = require('node:assert/strict');
const Easy = require('../src/easy.js'), Model = require('../src/core/model.js'), Original = require('../../01_stacker_crane/src/model.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const c = more => ({ ...Easy.defaults, length: 12, height: 6, bays: 6, levels: 3, ...more });
test('basic-only input uses explicit defaults and correct display units', () => {
  const a = Easy.fromDisplay({ vx: '180', vy: '60', vf: '36', transferLift: '140', loadedFactor: '100', targetUtil: '85', operatingEfficiency: '85' });
  assert.equal(a.vx, 3); assert.equal(a.vy, 1); assert.equal(a.vf, .6); assert.equal(a.transferLift, .14); assert.equal(a.loadedFactor, 1); assert.equal(a.targetUtil, .85);
  near(Model.calculate(a).factor, .85);
  for (const key of Object.keys(Easy.fields)) assert.equal(Easy.fromDisplay({ [key]: Easy.display(a, key) }, a)[key], a[key]);
});
test('same inputs produce exactly the original calculator results across modes, geometry and efficiency', () => {
  for (const method of ['cells', 'fem']) for (const mode of ['sc-return', 'dc', 'mixed']) for (const rackDepth of ['single', 'double']) {
    const config = c({ method, mode, rackDepth, cranes: 2, operatingEfficiency: 73.5, loadedFactor: .5, control: .25 });
    const a = Model.calculate(config), b = Original.calculate(config);
    for (const key of ['sc', 'dc', 'cycle', 'theory', 'available', 'capacity', 'required']) near(a[key], b[key]);
  }
});
test('parameter file changes only parameter keys and survives a save/load round trip', () => {
  const preset = Easy.parameterPack(c({ ax: .8, control: .25, operatingEfficiency: 80, loadedFactor: .75 }));
  const base = c({ name: '다른 창고', length: 77, bays: 106, inbound: 42, outbound: 32, vx: 2.5, stroke: 2 });
  const applied = Easy.applyParameters(base, preset);
  assert.equal(applied.control, .25); assert.equal(applied.loadedFactor, .75); assert.equal(applied.operatingEfficiency, 80);
  for (const key of Object.keys(base).filter(k => !Easy.parameterKeys.includes(k))) assert.deepEqual(applied[key], base[key]);
  assert.deepEqual(Easy.parameterPack(applied).parameters, preset.parameters);
  assert.ok(!('length' in preset.parameters)); assert.ok(!('inbound' in preset.parameters));
});
test('invalid display values reject with percent, mm and speed units; null automatic geometry is supported', () => {
  for (const [key, val] of [['loadedFactor', '1'], ['operatingEfficiency', '.85'], ['targetUtil', '1'], ['vx', '0'], ['control', '-1'], ['bays', '1.5'], ['vy', '']]) assert.throws(() => Easy.fromDisplay({ [key]: val }), e => e.field === key);
  assert.equal(Easy.fromDisplay({ firstLevelHeight: '', levelPitch: '', operatingEfficiency: '' }).operatingEfficiency, null);
  assert.throws(() => Easy.fromDisplay({ height: '4', levels: '10', firstLevelHeight: '1', levelPitch: '1' }), /최상단/);
});
test('malformed, foreign, incomplete and incompatible parameter presets are rejected atomically', () => {
  const preset = Easy.parameterPack(c()), before = structuredClone(c());
  for (const data of [null, {}, { ...preset, units: 'mm' }, { ...preset, parameters: { ...preset.parameters, length: 99 } }, { ...preset, parameters: { control: .25 } }, { ...preset, parameters: { ...preset.parameters, operatingEfficiency: 101 } }]) assert.throws(() => Easy.applyParameters(before, data));
  assert.deepEqual(before, c());
});
test('easy project is original-compatible and legacy inputs preserve their effective coefficient', () => {
  const a = c({ operatingEfficiency: 82.5, loadedFactor: .65 });
  assert.deepEqual(Original.unpack(Easy.projectPack(a)), Model.validate(a));
  const legacy = Original.pack(c({ operatingEfficiency: null, A: .95, Ft: .9, Ew: .85, basis: 'measured', ports: [{ ioX: null }] }));
  delete legacy.config.operatingEfficiency; legacy.moduleVersion = '0.3.2';
  const loaded = Easy.projectUnpack(legacy); assert.deepEqual(loaded.ports, []); near(Model.calculate(loaded).factor, .95 * .9 * .85);
  assert.throws(() => Easy.projectUnpack(Original.pack(c({ ports: [{ ioX: 2 }] }))), /개별 포트/);
});
test('shorter control delay increases capacity, but slower loaded motion reduces it', () => {
  const a = Model.calculate(c({ control: .5, loadedFactor: .5 })), b = Model.calculate(c({ control: .25, loadedFactor: .5 })), d = Model.calculate(c({ control: .25, loadedFactor: .25 }));
  near(a.cycle - b.cycle, .25); assert.ok(b.available > a.available); assert.ok(d.available < a.available);
});
test('SC/DC comparison counts one/two loads and handles impossible DC without NaN', () => {
  const r = Model.calculate(c()), rows = Easy.comparisons(r);
  assert.equal(rows[0].loads, 1); assert.equal(rows[1].loads, 2);
  near(rows[0].theory, 3600 / rows[0].time); near(rows[1].theory, 7200 / rows[1].time);
  near(rows[1].available, rows[1].theory * .85);
  assert.equal(Easy.comparisons(Model.calculate(c({ bays: 1, levels: 1, sides: 1 })))[1].theory, null);
});
test('only target utilization changes sizing; efficiency changes capacity once', () => {
  const a = Model.calculate(c()), b = Model.calculate(c({ targetUtil: .4 })), d = Model.calculate(c({ operatingEfficiency: 50 }));
  near(a.available, b.available); near(d.available, a.theory * .5); near(a.cycle, d.cycle);
});
