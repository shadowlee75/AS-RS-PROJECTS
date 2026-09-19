'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Model = require('../src/model.js'), M = require('../src/motion.js'), E = require('../src/engine.js'), R = require('../src/report.js');
const cfg = patch => ({ ...Model.defaults, bays: 8, levels: 4, hours: .5, warmup: 0, peak: 1, jitter: 0, ...patch });
const route = (femCase, weight, patch = {}) => ({ aisle: 1, id: 'C' + femCase, femCase, weight, ...patch });
const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('mixed: 50:50 cycles handles three loads per SC+DC pair; 50% loads means one-third DC cycles', () => {
  const c = cfg({ mode: 'mixed', dcRatio: 50 }), r = Model.calculate(c);
  close(r.p, .5); close(r.mix.loadRatio, 2 / 3);
  close(r.cycle, (r.sc + r.dc) / 2); close(r.theory, 3600 * 3 / (r.sc + r.dc));
  const loads = Model.calculate({ ...c, ratioBasis: 'loads' });
  close(loads.p, 1 / 3); close(loads.mix.loadRatio, .5);
});
test('mixed: asymmetric demand caps DC and residual SC uses the remaining direction', () => {
  const c = cfg({ mode: 'mixed', dcRatio: 90, inbound: 80, outbound: 20, outX: 60 });
  const r = Model.calculate(c); close(r.p, .25); assert.ok(r.mix.limited); close(r.sc, r.scIn);
  assert.equal(Model.calculate({ ...c, outbound: 0 }).p, 0);
  assert.equal(Model.calculate({ ...c, bays: 1, levels: 1, sides: 1 }).p, 0);
  const empty = Model.calculate({ ...c, inbound: 0, outbound: 0, A: 1, Ft: 1, Ew: 1, basis: 'ideal' });
  assert.equal(empty.required, 0); assert.ok(Number.isFinite(empty.theory));
});
test('mixed: reject invalid ratios, CASEs, route coordinates, IDs, allocation and missing aisles', () => {
  for (const patch of [{ dcRatio: -1 }, { dcRatio: 101 }, { dcRatio: NaN }, { ratioBasis: 'invalid' },
    { ports: [{ femCase: 7 }] }, { routes: [route(1, 99)] }, { routes: [route(1, 100, { aisle: 2 })] },
    { routes: [route(1, 100, { ioZ: 3 })] }, { routes: [route(1, 100, { outX: Infinity })] },
    { routes: [route(1, 100, { id: '<script>' })] }, { routes: [route(1, 50), route(1, 50)] },
    { routes: Array.from({ length: 7 }, (_, i) => route(1, 100 / 7, { id: 'R' + i })) }]) assert.throws(() => Model.validate(cfg(patch)));
});
test('mixed: old projects keep their DC behavior; new ratios/routes survive JSON round trip', () => {
  const old = cfg(); delete old.dcRatio; delete old.ratioBasis; delete old.routes;
  const migrated = Model.unpack({ ...Model.pack(cfg()), moduleVersion: '0.2.6', config: old });
  assert.equal(migrated.mode, 'dc'); assert.deepEqual(migrated.routes, []);
  const c = cfg({ cranes: 2, mode: 'mixed', dcRatio: 30, ratioBasis: 'loads', ports: [{ femCase: 5 }, { femCase: 6 }], routes: [route(2, 40), route(5, 60)] });
  assert.deepEqual(Model.unpack(JSON.parse(JSON.stringify(Model.pack(c)))), Model.validate(c));
});
test('CASE 1–6: independently resolve and execute different CASE layouts on six cranes', () => {
  const c = cfg({ cranes: 6, method: 'fem', pointMode: 'theory', inbound: 600, outbound: 600,
    ports: Array.from({ length: 6 }, (_, i) => ({ femCase: i + 1 })) });
  const r = Model.calculate(c), expected = [[0,0,0,0],[0,0,60,0],[0,10,0,10],[30,0,30,0],[0,0,0,10],[0,10,0,0]];
  r.aisles.forEach((a, i) => { assert.equal(a.fem.case, i + 1); assert.deepEqual([a.ports.in.x,a.ports.in.y,a.ports.out.x,a.ports.out.y],expected[i]); });
  const fleet = E.runFleet(c);
  fleet.engines.forEach((e, i) => { assert.ok(e.logs.length); assert.ok(e.logs.every(j => j.femCase === i + 1)); assert.ok(e.snapshot().conservation); });
});
test('CASE mixed: all six routes share one rack, retain separate CASE representative points and actual ports', () => {
  const c = cfg({ method: 'fem', mode: 'mixed', routes: [1,2,3,4,5,6].map(k => route(k, k < 6 ? 15 : 25)) });
  const r = Model.calculate(c); assert.equal(r.allRoutes.length, 6); assert.equal(r.aisles.length, 1);
  assert.deepEqual(r.allRoutes.map(a => a.fem.case), [1,2,3,4,5,6]);
  const engine = E.run(c);
  assert.equal(engine.rack.length, 64); assert.ok(engine.snapshot().jobsConserved);
  for (const j of engine.logs) {
    const spec = engine.routes.find(route => route.id === j.route);
    assert.deepEqual(j.port, M.port(spec.config, j.kind)); assert.equal(j.femCase, spec.femCase);
  }
});
test('CASE mixed: cache includes CASE even when explicit port coordinates coincide', () => {
  const c = cfg({ method: 'fem', routes: [route(1, 50), route(3, 50, { ioY: 0, outY: 0 })] });
  const r = Model.calculate(c);
  assert.equal(r.routes[0].fem.case, 1); assert.equal(r.routes[1].fem.case, 3);
  assert.notDeepEqual(r.routes[0].fem.theoretical.inbound, r.routes[1].fem.theoretical.inbound);
});
test('CASE mixed: weighted cycle duration plus independently derived 50% cross-port transition', () => {
  const c = cfg({ bays: 2, levels: 1, sides: 1, mode: 'mixed', dcRatio: 100, routes: [route(1, 50), route(4, 50, { ioX: 60, outX: 60 })] });
  const r = Model.calculate(c), rack = Model.cells(c), settings = Model.routeConfigs(Model.aisleConfig(c, 0));
  const dc = settings.map(s => (M.plan(s.config,'dc',M.port(s.config,'in'),rack[0],rack[1],true).duration + M.plan(s.config,'dc',M.port(s.config,'in'),rack[1],rack[0],true).duration) / 2);
  const transition = (M.axis(60, c.vx, c.ax, c.dx).duration + c.position) / 2;
  close(r.transition, transition); close(r.cycle, (dc[0] + dc[1]) / 2 + transition);
  close(r.theory, 7200 / r.cycle);
});
test('mixed DES: saturated 0/25/50/75/100% targets stay within one completed cycle', () => {
  for (const dcRatio of [0,25,50,75,100]) {
    const s = E.run(cfg({ mode: 'mixed', dcRatio, inbound: 1000, outbound: 1000, inBuffer: 500 })).snapshot();
    const cycles = s.measuredCycles.sc + s.measuredCycles.dc;
    assert.ok(cycles > 12); assert.ok(Math.abs(s.measuredCycles.dc - cycles * dcRatio / 100) <= 1);
    assert.ok(s.conservation && s.jobsConserved);
    if (dcRatio === 0) assert.equal(s.cycles.dc, 0);
    if (dcRatio === 100) assert.equal(s.cycles.sc, 0);
  }
});
test('mixed DES: 100% requested with only inbound still completes feasible SC work', () => {
  const s = E.run(cfg({ mode: 'mixed', dcRatio: 100, inbound: 100, outbound: 0, initialFill: 0 })).snapshot();
  assert.equal(s.mix.p, 0); assert.equal(s.cycles.dc, 0); assert.ok(s.completed.in > 0); assert.ok(s.conservation);
});
test('mixed DES: per-port buffers are shared by identical coordinates and conserve every job at every event', () => {
  const c = cfg({ mode: 'mixed', dcRatio: 65, inbound: 500, outbound: 500, outBuffer: 1, inBuffer: 2, takeaway: 140,
    routes: [route(1, 30), route(2, 30), route(5, 40)] });
  const e = new E.Engine(c); let blocked = false, seen = new Set();
  assert.equal(e.portBuffers.size, 4); // one IN, three OUT pools
  while (e.heap.peek() && e.time < e.horizon) {
    e.advanceTo(Math.min(e.horizon, e.heap.peek().time)); const s = e.snapshot();
    assert.ok(s.conservation && s.jobsConserved); blocked ||= e.state === 'blocked';
    close(s.ports.filter(p => p.kind === 'in').reduce((n,p)=>n+p.count,0), e.inSlots);
    close(s.ports.filter(p => p.kind === 'out').reduce((n,p)=>n+p.count,0), e.outputCount);
    assert.equal(e.completed.out - e.shipped, e.outputCount);
    for (const b of s.ports) assert.ok(b.count >= 0 && b.count <= (b.kind === 'in' ? c.inBuffer : c.outBuffer));
    if (e.cycle) {
      seen.add(e.routes[e.cycle.route].id);
      if (e.cycle.kind === 'dc') assert.equal(e.cycle.inJob.route, e.cycle.outJob.route);
    }
  }
  assert.ok(blocked); assert.equal(seen.size, 3);
});
test('mixed DES: route demand allocations and floor-free coordinate travel survive fleet replay', () => {
  const c = cfg({ mode: 'mixed', cranes: 2, hours: .3, method: 'fem', inbound: 250, outbound: 180,
    ports: [{ femCase: 2 }, { femCase: 6 }], routes: [route(1, 25, { ioX: -3, outX: -3 }), route(5, 75), route(6, 100, { aisle: 2, ioY: 24 })] });
  const a = E.runFleet(c), b = new E.Fleet(c);
  for (let t = 0; t < b.horizon; t += 7.31) b.advanceTo(t); b.advanceTo(b.horizon);
  assert.deepEqual(a.logs, b.logs); assert.deepEqual(a.snapshot(), b.snapshot());
  assert.ok(Model.envelope(c).xMin <= -3); assert.ok(Model.envelope(c).yMax >= 24);
  const e = new E.Engine(cfg({ routes: [route(1, 25), route(2, 75)], inbound: 100, outbound: 100, hours: 1 }));
  const arrivals = e.heap.items.filter(x => x.type === 'arrival');
  for (const kind of ['in','out']) assert.equal(arrivals.filter(j => j.kind === kind && j.route === 0).length, 25);
});
test('mixed reports include requested/applied/observed ratios, all CASE routes and repositioning assumptions', () => {
  const c = cfg({ mode: 'mixed', method: 'fem', routes: [1,2,3,4,5,6].map(k => route(k, k < 6 ? 15 : 25)) });
  const text = R.markdown(Model.calculate(c), E.runFleet(c).snapshot());
  for (const token of ['SC/DC 지정 비율', '사이클 기준 목표 DC', '측정구간 완료 SC/DC', '전환 공차', '독립 선택', ...[1,2,3,4,5,6].map(k => '| C' + k + ' | ' + k + ' |')]) assert.ok(text.includes(token), token);
  assert.ok(!text.includes('[object Object]'));
});
