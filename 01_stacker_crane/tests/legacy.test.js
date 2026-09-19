const test = require('node:test');
const assert = require('node:assert/strict');
const golden = require('./legacy-golden.json');
const Model = require('../src/model.js');
for (const [index, example] of golden.cases.entries()) test('existing HTML comparison ' + (index + 1) + ': discrete SC/DC, loadedFactor=1, transferLift=0', () => {
  // The historical model had no explicit carriage movement. Compare its exact zero-lift limit.
  const actual = Model.calculate({ ...example.config, transferLift: 0 });
  assert.ok(Math.abs(actual.sc - example.expected.sc) < 1e-9);
  assert.ok(Math.abs(actual.dc - example.expected.dc) < 1e-9);
});
