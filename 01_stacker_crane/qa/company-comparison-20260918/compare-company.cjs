// Reproduce the observed discrepancy. This is an audit, not a parity test:
// the company input pages and its unrounded results are not yet available.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Model = require('../../src/model.js');
const Motion = require('../../src/motion.js');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const company = read(path.join(__dirname, 'company-result.json'));
const config = Model.unpack(read(path.resolve(__dirname, '../../../참고 및 검증 자료/스태커크레인 설계 검토_프로젝트.json')));
const current = Model.calculate(config);
const dcPlan = Motion.plan(config, 'dc', current.ports.in, ...current.fem.dcPairs[0], true);
const dcParts = Object.fromEntries(['move', 'fork', 'position', 'control'].map(type =>
  [type, dcPlan.actions.filter(a => a.type === type).reduce((s, a) => s + a.duration, 0)]));
const move = key => Math.max(...company.movement[key]);
const companyScMove = (move('inP1') + move('inP2') + move('outP1') + move('outP2')) / 2;
const companyDcMove = move('inP1') + move('P1P2') + move('outP2') + move('inOut');
const scReconstructed = companyScMove + 2 * company.forkCycleSeconds;
const dcReconstructed = companyDcMove + 4 * company.forkCycleSeconds;
assert.ok(Math.abs(scReconstructed - company.scSeconds) < 1e-9);
assert.ok(Math.abs(dcReconstructed - company.dcSeconds) < 1e-9);
assert.ok(Math.abs(dcPlan.duration - current.dc) < 1e-9);
// Bounds assume both displayed quantities were rounded to nearest 0.1.
const efficiency = (seconds, capacity, loads) => ({
  inferredPercent: 100 * seconds * capacity / (3600 * loads),
  roundingIntervalPercent: [
    100 * (seconds - .05) * (capacity - .05) / (3600 * loads),
    100 * (seconds + .05) * (capacity + .05) / (3600 * loads)
  ]
});
const strokeOnly = {...config, stroke: company.forkStrokeM};
const strokeResult = Model.calculate(strokeOnly);
const result = {
  scope: 'Comparison of saved JSON with company screenshot; input conditions are not identical.',
  company: {
    sc: {move: companyScMove, fork: 2 * company.forkCycleSeconds, total: scReconstructed,
      idealPalletsPerHour: 3600 / company.scSeconds, displayedPalletsPerHour: company.scPalletsPerHour,
      efficiency: efficiency(company.scSeconds, company.scPalletsPerHour, 1)},
    dc: {move: companyDcMove, fork: 4 * company.forkCycleSeconds, total: dcReconstructed,
      idealPalletsPerHour: 7200 / company.dcSeconds, displayedPalletsPerHour: company.dcPalletsPerHour,
      efficiency: efficiency(company.dcSeconds, company.dcPalletsPerHour, 2)}
  },
  current: {
    sc: {...current.scParts, total: current.sc, idealPalletsPerHour: 3600 / current.sc},
    dc: {...dcParts, total: current.dc, idealPalletsPerHour: 7200 / current.dc},
    forkCycleSeconds: Motion.fork(config).duration,
    correctionFactor: current.factor,
    scAtAssumed85Percent: 3600 / current.sc * .85,
    dcAtAssumed85Percent: 7200 / current.dc * .85
  },
  difference: {
    scCompanyMinusCurrentSeconds: company.scSeconds - current.sc,
    dcCompanyMinusCurrentSeconds: company.dcSeconds - current.dc,
    scCurrentIdealOverCompanyDisplayedPercent: (3600 / current.sc / company.scPalletsPerHour - 1) * 100,
    dcCurrentIdealOverCompanyDisplayedPercent: (7200 / current.dc / company.dcPalletsPerHour - 1) * 100
  },
  sensitivity: {
    note: 'Only stroke changed to 2.58 m; this does not reproduce company inputs.',
    forkCycleSeconds: Motion.fork(strokeOnly).duration,
    sc: strokeResult.sc, dc: strokeResult.dc
  }
};
fs.writeFileSync(path.join(__dirname, 'comparison.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
