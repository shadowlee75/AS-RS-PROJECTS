const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../src/model.js');
const Report = require('../src/report.js');
const Engine = require('../src/engine.js');
const cfg = extra => ({ ...Model.defaults, length: 8, height: 4, bays: 4, levels: 2, ...extra });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('efficiency: 85% scales SC, DC and mixed capacity once, without changing cycle times', () => {
  for (const mode of ['sc-return', 'sc-stay', 'dc', 'mixed']) for (const rackDepth of ['single', 'double']) {
    const c = cfg({ mode, rackDepth, cranes: 2, A: .9, Ft: .8, Ew: .7, basis: 'assumption' });
    const old = Model.calculate(c), result = Model.calculate({ ...c, operatingEfficiency: 85 });
    near(result.factor, .85);
    assert.equal(result.factorSource, 'efficiency');
    for (const key of ['scIn', 'scOut', 'sc', 'dc', 'cycle', 'theory', 'theoryTotal']) near(result[key], old[key]);
    near(result.available, old.theory * .85);
    near(result.capacity, old.theoryTotal * .85);
    for (const aisle of result.aisles) near(aisle.available, aisle.theory * .85);
    assert.equal(result.required, Math.ceil(result.demand / (Math.min(...result.aisles.map(a => a.available)) * c.targetUtil)));
  }
});

test('efficiency: direct input needs no legacy coefficients or basis; 100% equals theoretical capacity', () => {
  const result = Model.calculate(cfg({ operatingEfficiency: 100 }));
  assert.equal(result.available, result.theory);
  assert.equal(result.capacity, result.theoryTotal);
  assert.match(Model.correctionText(result), /운전효율 100% 직접 적용/);
});

test('efficiency: legacy projects retain original factor, and clearing direct input restores it', () => {
  const old = cfg({ A: .95, Ft: .9, Ew: .85, basis: 'measured' }); delete old.operatingEfficiency;
  const migrated = Model.unpack({ ...Model.pack(cfg()), moduleVersion: '0.3.2', config: old });
  assert.equal(migrated.operatingEfficiency, null);
  near(Model.calculate(migrated).factor, .95 * .9 * .85);
  const saved = Model.pack({ ...migrated, operatingEfficiency: 85.5 });
  assert.deepEqual(Model.unpack(saved), saved.config);
  near(Model.calculate({ ...saved.config, operatingEfficiency: null }).factor, .95 * .9 * .85);
  assert.equal(Model.calculate(cfg()).factor, null);
});

test('efficiency: rejects out of range values and mistaken ratio inputs with the correct field', () => {
  for (const operatingEfficiency of [0, .85, -1, 100.1, NaN, Infinity, '85', '']) {
    assert.throws(() => Model.validate(cfg({ operatingEfficiency })), error => error.field === 'operatingEfficiency');
  }
  for (const operatingEfficiency of [1, 85, 85.5, 100, null]) assert.equal(Model.validate(cfg({ operatingEfficiency })).operatingEfficiency, operatingEfficiency);
});

test('efficiency: target utilization only affects sizing, not corrected throughput', () => {
  const a = Model.calculate(cfg({ operatingEfficiency: 85, targetUtil: 1, inbound: 200, outbound: 200 }));
  const b = Model.calculate({ ...a.config, targetUtil: .5 });
  near(a.available, b.available); near(a.capacity, b.capacity); near(a.cycle, b.cycle);
  assert.ok(b.required > a.required);
});

test('efficiency: sensitivity uses direct efficiency instead of ignored coefficients and respects limits', () => {
  for (const operatingEfficiency of [1, 85, 100]) {
    const result = Model.calculate(cfg({ operatingEfficiency })), rows = Model.sensitivity(result);
    assert.equal(rows.length, 4);
    for (const row of rows) {
      assert.equal(row.key, 'operatingEfficiency');
      assert.ok(row.value >= 1 && row.value <= 100);
      near(row.capacity, result.theoryTotal * row.value / 100);
    }
  }
  assert.equal(Model.sensitivity(Model.calculate(cfg({ A: 1, Ft: 1, Ew: 1, basis: 'ideal' }))).length, 12);
});

test('efficiency: calculation report identifies applied efficiency and separate design utilization', () => {
  const report = Report.markdown(Model.calculate(cfg({ operatingEfficiency: 85, A: .9, Ft: .9, Ew: .9, basis: 'measured' })));
  assert.match(report, /운전효율 85% 직접 적용/);
  assert.match(report, /목표 설계 부하율은 필요 대수와 부하 판정 기준/);
  assert.match(report, /운전효율 직접 입력 시 세부 A·Ft·Ew는 사용하지 않습니다/);
  assert.doesNotMatch(report, /NaN|Infinity/);
});

test('efficiency: applying analytical efficiency does not rescale physical DES completion counts or timing', () => {
  const c = cfg({ hours: .1, warmup: 0, inbound: 300, outbound: 300 });
  const a = Engine.run(c), b = Engine.run({ ...c, operatingEfficiency: 85 });
  assert.deepEqual(a.logs, b.logs);
  const { config: beforeConfig, ...beforeStats } = a.snapshot();
  const { config: afterConfig, ...afterStats } = b.snapshot();
  assert.equal(beforeConfig.operatingEfficiency, null);
  assert.equal(afterConfig.operatingEfficiency, 85);
  assert.deepEqual(beforeStats, afterStats);
});
