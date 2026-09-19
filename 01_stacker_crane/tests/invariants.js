const assert = require('node:assert/strict');
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} (tol ${tolerance})`);
const json = value => JSON.parse(JSON.stringify(value));
module.exports = function suite({ M, Model, E, R }, test) {
  const cfg = patch => ({ ...Model.defaults, ...patch });
  test('v0.2.4 transfer: independent 110 mm triangular profile and exact SC/DC time increments', () => {
    for (const loadedFactor of [1, .63]) {
      const c = cfg({ bays: 3, levels: 2, ioX: -3, ioY: -1, outX: 65, outY: 23, ioZ: -.7, outZ: 1, loadedFactor });
      const t = 2 * Math.sqrt(.11 / (.5 * loadedFactor)), r = Model.calculate(c), old = Model.calculate({ ...c, transferLift: 0 });
      near(M.fork(c).lift.duration, t); near(r.scIn - old.scIn, 2 * t); near(r.scOut - old.scOut, 2 * t); near(r.dc - old.dc, 4 * t);
      near(r.scParts.fork - old.scParts.fork, 2 * t); assert.ok(r.theory < old.theory);
      near(Model.envelope(c).yMax, 23.11);
    }
  });
  test('v0.2.4 transfer: OUT then signed Y movement then IN, with no overlapping axes', () => {
    for (const side of [-1, 1]) for (const stroke of [0, .8]) {
      const c = cfg({ bays: 2, levels: 2, ioZ: side * stroke, outZ: side * stroke, loadedFactor: .7, ay: .35, dy: .6 });
      const rack = Model.cells(c), plan = M.plan(c, 'dc', M.port(c, 'in'), rack[0], rack[3], true);
      for (const a of plan.actions.filter(a => a.type === 'fork')) {
        const f = a.fork, sign = a.pick ? 1 : -1;
        const sample = local => M.planAt(plan, a.start + local);
        near(a.to.y - a.from.y, sign * .11);
        if (f.liftStart > 0) { const out = sample(f.liftStart / 2); near(out.y.p, a.from.y); near(out.y.v, 0); assert.equal(out.transfer.onFork, !a.pick); }
        const up = sample(f.liftStart + f.lift.ta / 2), down = sample(f.liftEnd - f.lift.td / 2);
        near(up.f.p, a.side * f.profile.distance); near(up.f.v, 0); near(up.x.v, 0);
        assert.ok(up.y.v * sign > 0 && up.y.a * sign > 0 && down.y.a * sign < 0);
        assert.ok(up.label.includes(a.pick ? 'UP 110 mm' : 'DOWN 110 mm'));
        const settle = sample(f.liftEnd + f.dwell / 2); near(settle.y.p, a.to.y); near(settle.y.v, 0); near(settle.f.v, 0); assert.equal(settle.transfer.onFork, a.pick);
        if (f.profile.duration > 0) { const retract = sample(f.retractStart + f.profile.duration / 2); near(retract.y.p, a.to.y); near(retract.y.v, 0); assert.ok(retract.f.v * a.side < 0); }
        const times = M.sampleTimes(plan); assert.ok(times.includes(a.start + f.liftStart + f.lift.ta)); assert.ok(times.includes(a.start + f.liftEnd));
      }
    }
  });
  test('v0.2.4 transfer: pose continuity and unchanged stored cargo centres across all cycle modes', () => {
    const c = cfg({ bays: 3, levels: 2, firstLevelHeight: 0, ioX: -4, ioY: -2, outX: 65, outY: 24, outZ: 1 });
    const rack = Model.cells(c), original = json(rack);
    for (const kind of ['in', 'out', 'dc']) for (const returnHome of [true, false]) {
      const p = M.plan(c, kind, M.port(c, kind === 'out' ? 'out' : 'in'), rack[0], rack[3], returnHome);
      for (const a of p.actions) {
        if (a.start > 0) { const before = M.planAt(p, a.start - 1e-8), after = M.planAt(p, a.start); for (const axis of ['x', 'y', 'f']) near(before[axis].p, after[axis].p, 1e-7); }
        if (a.type === 'move' && a.loaded) near(a.to.y, (a.to.port ? M.port(c, a.to.port).y : rack[a.to.id].y) + .11);
      }
      near(M.planAt(p, p.duration - 1e-8).y.p, p.to.y, 1e-7);
    }
    assert.deepEqual(json(rack), original);
  });
  test('v0.2.4 transfer: project migration, SI storage, zero-lift compatibility and report millimetres', () => {
    const c = cfg(), old = { ...c }; delete old.transferLift;
    near(Model.validate(old).transferLift, .11); near(Model.unpack(json(Model.pack(c))).transferLift, .11);
    near(Model.validate({ ...c, transferLift: 0 }).transferLift, 0);
    for (const value of [null, NaN, -.01, 1.001, '110']) assert.throws(() => Model.validate({ ...c, transferLift: value }));
    const md = R.markdown(Model.calculate(c)); assert.ok(md.includes('캐리지 이재 승하강량 | 110 | mm')); assert.ok(md.includes('UP 110 mm') && md.includes('DOWN 110 mm'));
  });
  test('kinematics: independent known answers and invalid inputs', () => {
    for (const [s, v, a, d, expected] of [[0, 2, 1, 1, 0], [1, 2, 1, 1, 2], [4, 2, 1, 1, 4], [10, 2, 1, 1, 7], [10, 2, 1, .5, 8]]) near(M.axis(s, v, a, d).duration, expected);
    for (const values of [[-1, 1, 1, 1], [1, 0, 1, 1], [1, 1, -1, 1], [NaN, 1, 1, 1], [1, Infinity, 1, 1]]) assert.throws(() => M.axis(...values));
  });
  test('kinematics: 1000 random cases, independent peak bisection and phase integrals', () => {
    const random = Model.rng(729);
    for (let i = 0; i < 1000; i++) {
      const s = 10 ** (-5 + random() * 7), v = .01 + random() * 8, a = .01 + random() * 5, d = .01 + random() * 5;
      const p = M.axis(s, v, a, d);
      let low = 0, high = v;
      for (let j = 0; j < 80; j++) { const mid = (low + high) / 2; if (mid * mid / (2 * a) + mid * mid / (2 * d) <= s) low = mid; else high = mid; }
      const expected = low / a + low / d + Math.max(0, s - low * low / (2 * a) - low * low / (2 * d)) / low;
      near(p.duration, expected, 1e-7); near(M.at(p, 0).p, 0); near(M.at(p, p.duration).p, s);
      let integral = 0, prior = 0;
      for (const phase of p.phases) { integral += phase.velocity * phase.duration + phase.acceleration * phase.duration ** 2 / 2;
        near(M.at(p, phase.start).p, phase.position, 1e-7);
        if (phase.start > 1e-8) near(M.at(p, phase.start - 1e-9).v, M.at(p, phase.start + 1e-9).v, 1e-7);
      }
      near(integral, s, 1e-7);
      for (let j = 0; j <= 50; j++) { const point = M.at(p, p.duration * j / 50); assert.ok(point.p >= prior - 1e-8); assert.ok(point.v <= v + 1e-8); prior = point.p; }
    }
  });
  test('kinematics: continuity across triangular/trapezoidal boundary', () => {
    const v = 3.2, a = .7, d = .4, critical = v * v / 2 * (1 / a + 1 / d);
    near(M.axis(critical - 1e-7, v, a, d).duration, M.axis(critical + 1e-7, v, a, d).duration, 1e-6);
  });
  test('simultaneous axes: early arrival stays stopped; loaded reduction applies to a/d', () => {
    const c = cfg({ loadedFactor: .5 }), move = M.move(c, { x: 0, y: 0 }, { x: 60, y: 1 }, true);
    near(move.duration, Math.max(move.x.duration, move.y.duration)); assert.equal(M.at(move.y, move.duration).v, 0);
    near(move.x.accel, c.ax * .5); near(move.x.decel, c.dx * .5);
  });
  test('fork: extension, dwell, retraction and signed velocity', () => {
    const f = M.fork(cfg()); near(f.duration, 6.5 + 2 * Math.sqrt(.11 / .5)); near(M.forkAt(f, f.profile.duration + .2).p, 1.2);
    assert.ok(M.forkAt(f, f.retractStart + .2).v < 0); near(M.forkAt(f, f.duration).p, 0);
  });
  test('SC hand calculation; all-zero motion still has real fork transfer; single cell DC unavailable', () => {
    const c = cfg({ transferLift: 0, length: 10, height: 10, bays: 1, levels: 1, sides: 1, vx: 1, vy: 1, ax: 1, ay: 1, dx: 1, dy: 1, stroke: 1, vf: 1, af: 1, df: 1, forkDwell: 0, position: 0, control: 0 });
    const r = Model.calculate(c); near(r.sc, 20); assert.equal(r.dc, null); near(r.theory, 180);
    const origin = Model.calculate({ ...c, ioX: 5, ioY: 5 }); near(origin.sc, 8);
  });
  test('analytical cycle means equal all physical SC/DC plans on a small rack', () => {
    const c = cfg({ bays: 3, levels: 2, sides: 2, loadedFactor: .63, ioX: 4, ioY: 2, position: 1.7, control: 2.3 }), rack = Model.cells(c), home = { x: c.ioX, y: c.ioY };
    const r = Model.calculate(c);
    const sc = rack.reduce((sum, cell) => sum + M.plan(c, 'in', home, cell, null, true).duration, 0) / rack.length; near(r.sc, sc);
    let dc = 0, n = 0;
    for (const a of rack) for (const b of rack) if (a.id !== b.id) { dc += M.plan(c, 'dc', home, a, b, true).duration; n++; }
    near(r.dc, dc / n);
  });
  test('DC counts two handled loads, demand imbalance bounds pairing, and zero demand needs zero cranes', () => {
    const c = cfg({ A: 1, Ft: 1, Ew: 1, basis: 'ideal', bays: 3, levels: 2 });
    const full = Model.calculate(c); near(full.theory, 7200 / full.dc);
    near(Model.calculate({ ...c, inbound: 90, outbound: 10 }).p, 1 / 9);
    near(Model.calculate({ ...c, inbound: 0, outbound: 10 }).p, 0);
    near(Model.calculate({ ...c, inbound: 0, outbound: 0 }).required, 0);
  });
  test('coefficients stay unselected until supplied and are applied once; design utilization applies', () => {
    const c = cfg({ bays: 3, levels: 2 }), r = Model.calculate(c); assert.equal(r.available, null);
    assert.equal(Model.calculate({ ...c, A: .9, Ft: .8, Ew: 1 }).available, null);
    const corrected = Model.calculate({ ...c, A: .9, Ft: .8, Ew: 1, basis: 'assumption' });
    near(corrected.available, r.theory * .72); assert.equal(corrected.required, Math.ceil(corrected.demand / (corrected.available * c.targetUtil)));
  });
  test('invalid settings and foreign JSON versions are rejected, including partial configurations', () => {
    for (const patch of [{ vx: '' }, { sides: 1.5 }, { length: 0 }, { seed: NaN }, { ioY: 200 }, { A: 0 }, { mode: 'unknown' }, { inBuffer: -1 }, { hours: null }]) assert.throws(() => Model.validate(cfg(patch)));
    assert.throws(() => Model.validate({})); assert.throws(() => Model.unpack({ schemaVersion: 'other' }));
    const data = Model.pack(cfg()); assert.throws(() => Model.unpack({ ...data, moduleVersion: '2.0.0' })); assert.throws(() => Model.unpack({ ...data, units: 'mm' }));
  });
  test('project round-trip preserves SI inputs, Korean text and seed', () => {
    const c = cfg({ name: '시험 | "한글"', speedUnit: 'm/min', A: .97, Ft: .95, Ew: 1, basis: 'assumption' });
    assert.deepEqual(json(Model.unpack(json(Model.pack(c)))), json(c));
  });
  test('stable heap orders equal-time events by insertion sequence', () => {
    const heap = new E.Heap(); heap.push({ time: 2, id: 'z' }); heap.push({ time: 1, id: 'a' }); heap.push({ time: 1, id: 'b' });
    assert.deepEqual([heap.pop().id, heap.pop().id, heap.pop().id], ['a', 'b', 'z']);
  });
  test('DES: event-step, 0.1-second playback and bulk completion give identical statistics and logs', () => {
    const c = cfg({ hours: .1, warmup: .2, inbound: 220, outbound: 180, peak: 1, bays: 4, levels: 3, inBuffer: 2, outBuffer: 2, takeaway: 40 });
    const bulk = E.run(c), stepped = new E.Engine(c), frames = new E.Engine(c);
    while (stepped.time < stepped.horizon) { stepped.advanceTo(Math.min(stepped.heap.peek()?.time ?? stepped.horizon, stepped.horizon)); }
    for (let i = 0; i < Math.ceil(frames.horizon * 10); i++) frames.advanceTo(Math.min(frames.horizon, i / 10)); frames.advanceTo(frames.horizon);
    assert.deepEqual(json(stepped.snapshot()), json(bulk.snapshot())); assert.deepEqual(json(frames.snapshot()), json(bulk.snapshot())); assert.deepEqual(json(frames.logs), json(bulk.logs));
  });
  test('DES: conservation and reservations hold at every event for 30 varied scenarios', () => {
    const random = Model.rng(9751);
    for (let k = 0; k < 30; k++) {
      const c = cfg({ mode: ['sc-return', 'sc-stay', 'dc'][k % 3], hours: .12, warmup: 0, bays: 1 + k % 5, levels: 1 + k % 4, sides: 1 + k % 2,
        initialFill: random(), inbound: 50 + random() * 700, outbound: 50 + random() * 700, peak: 1, inBuffer: 1 + k % 4, outBuffer: 1 + k % 3, takeaway: k % 2 ? 35 : 0,
        storage: k % 2 ? 'nearest' : 'random', retrieval: ['fifo', 'random', 'nearest'][k % 3], seed: k });
      const e = new E.Engine(c);
      while (e.time < e.horizon) {
        e.advanceTo(Math.min(e.heap.peek()?.time ?? e.horizon, e.horizon)); const s = e.snapshot();
        assert.ok(s.conservation); assert.ok(s.jobsConserved); assert.ok(e.inSlots <= c.inBuffer && e.inSlots >= 0); assert.ok(e.outputCount <= c.outBuffer && e.outputCount >= 0);
        assert.ok(e.rack.filter(cell => cell.state === 'reservedIn').length <= 1); assert.ok(e.rack.filter(cell => cell.state === 'reservedOut').length <= 1);
        near(Object.values(s.stateTime).reduce((a, b) => a + b, 0), s.measuredTime, 1e-7);
      }
    }
  });
  test('DES: empty rack cannot fulfill retrieval; full rack cannot silently accept storage', () => {
    const empty = E.run(cfg({ initialFill: 0, inbound: 0, outbound: 100, hours: .2, warmup: 0 })).snapshot();
    assert.equal(empty.completed.out, 0); assert.ok(empty.starvedTime > 0); assert.ok(empty.queued > 0);
    const full = E.run(cfg({ initialFill: 1, inbound: 100, outbound: 0, hours: .2, warmup: 0, inBuffer: 1 })).snapshot();
    assert.equal(full.completed.in, 0); assert.ok(full.fullTime > 0); assert.ok(full.overflowTime > 0);
  });
  test('DES: finite output buffer causes blocking; takeaway conservation holds', () => {
    const c = cfg({ hours: .5, warmup: 0, inbound: 200, outbound: 200, peak: 1, takeaway: 300, outBuffer: 1 });
    const slow = E.run(c).snapshot(), fast = E.run({ ...c, takeaway: 0 }).snapshot();
    assert.ok(slow.stateTime.blocked > 0); assert.ok(slow.throughput < fast.throughput); assert.equal(slow.completed.out, slow.shipped + slow.output);
  });
  test('DES: warmup excludes only statistics and zero arrival produces exactly idle measurement time', () => {
    const e = E.run(cfg({ inbound: 0, outbound: 0, warmup: 1, hours: .1 })).snapshot();
    near(e.measuredTime, 360); near(e.stateTime.idle, 360); near(e.throughput, 0); assert.equal(e.stock, e.initialInventory);
  });
  test('DES: low-rate SC cycle agrees with a hand-computed single-cell physical plan', () => {
    const c = cfg({ mode: 'sc-return', bays: 1, levels: 1, sides: 1, initialFill: 0, inbound: 1, outbound: 0, hours: .1, warmup: 0, peak: 1, jitter: 0 });
    const r = Model.calculate(c), e = E.run(c); assert.equal(e.cycles.sc, 1); assert.equal(e.completed.in, 1);
    near(e.snapshot().stateTime.idle, e.horizon - r.sc);
  });
  test('DES: same seed reproducible; changes in analytical coefficients do not rescale DES', () => {
    const c = cfg({ hours: .2, warmup: 0, arrival: 'poisson' });
    const e1 = E.run(c), e2 = E.run(c), e3 = E.run({ ...c, A: .5, Ft: .5, Ew: .5, basis: 'assumption' });
    assert.deepEqual(json(e1.logs), json(e2.logs)); assert.deepEqual(json(e1.logs), json(e3.logs));
  });
  test('DES: pure saturated DC processes actual inbound/outbound pairs', () => {
    const s = E.run(cfg({ hours: .3, warmup: 0, inbound: 1000, outbound: 1000, peak: 1, mode: 'dc' })).snapshot();
    assert.ok(s.cycles.dc > 0); assert.ok(s.queued > 0); assert.ok(s.saturated); assert.ok(s.conservation && s.jobsConserved);
  });
  test('statistics: quantiles and Student t confidence intervals', () => {
    near(E.percentile([0, 10, 20, 30, 40], .95), 38); const stat = E.interval95([1, 2, 3, 4, 5]); near(stat.mean, 3); near(stat.sd, Math.sqrt(2.5)); near(stat.ci95, 2.776 * Math.sqrt(.5));
  });
  test('exports: escaped Korean text, formula-safe CSV, report metadata and inventory ledger', () => {
    const text = R.csv([['한글,"줄\n바꿈', '=1+1', 2]]); assert.ok(text.startsWith('\uFEFF')); assert.ok(text.includes('""')); assert.ok(text.includes("'=1+1"));
    const c = cfg({ bays: 2, levels: 2, name: '<script>|시험', hours: .1, warmup: 0 });
    const md = R.markdown(Model.calculate(c), E.run(c).snapshot()); assert.ok(md.includes('&lt;script&gt;\\|시험')); assert.ok(md.includes('재고 보존')); assert.ok(md.includes('seed:')); assert.ok(md.includes('입력 식별자')); assert.ok(md.includes('## 7.'));
  });

  test('v0.2 FEM CASE 1–6: independent reference coordinates, both midpoint branches', () => {
    const cases = [
      [1, {}, [[12, 20], [40, 6]]],
      [2, {}, [[12, 20], [40, 6]]],
      [3, { ioY: 9 }, [[12, 23], [40, 9]]],
      [3, { ioY: 21 }, [[12, 7], [40, 21]]],
      [3, { ioY: 15 }, [[12, 25], [40, 11]]],
      [4, { ioX: 15 }, [[17, 20], [45, 6]]],
      [4, { ioX: 45 }, [[43, 20], [15, 6]]],
      [4, { ioX: 30 }, [[22, 20], [50, 6]]],
      [5, { ioY: 12 }, [[12, 22], [40, 8]]],
      [6, { ioY: 12 }, [[12, 22], [40, 8]]]
    ];
    for (const [femCase, patch, expected] of cases) {
      let c = cfg({ method: 'fem', pointMode: 'theory', femCase, length: 60, height: 30, ...patch });
      c = { ...c, ...Model.casePorts(c) }; const f = Model.femPoints(c), r = Model.calculate(c);
      f.inbound.forEach((p, i) => { near(p.x, expected[i][0]); near(p.y, expected[i][1]); });
      assert.ok(r.dc > 0 && r.scIn > 0 && r.scOut > 0);
      if (femCase === 2) { near(f.outbound[0].x, 48); near(f.outbound[1].x, 20); assert.equal(r.dcTimes.length, 2); }
    }
  });
  test('v0.2 FEM cycles: independent segment sums and CASE 2 paired route average', () => {
    for (let femCase = 1; femCase <= 6; femCase++) {
      let c = cfg({ method: 'fem', pointMode: 'theory', femCase, height: 30, bays: 6, levels: 3, loadedFactor: .65, ioZ: -.9, outZ: -.9 });
      c = { ...c, ...Model.casePorts(c) };
      const r = Model.calculate(c), f = Model.femPoints(c);
      const duration = (a, b, loaded) => {
        const k = loaded ? c.loadedFactor : 1;
        const t = Math.max(M.axis(Math.abs(a.x - b.x), c.vx * k, c.ax * k, c.dx * k).duration, M.axis(Math.abs(a.y - b.y), c.vy * k, c.ay * k, c.dy * k).duration);
        return t + (t > 0 ? c.position : 0);
      };
      const fork = d => 2 * M.axis(d, c.vf, c.af, c.df).duration + M.axis(c.transferLift, c.vy * c.loadedFactor, c.ay * c.loadedFactor, c.dy * c.loadedFactor).duration + c.forkDwell;
      const expected = f.dcPairs.map(([a, b]) => duration(f.E, a, true) + duration(a, b, false) + duration(b, f.A, true) + duration(f.A, f.E, false) + 2 * fork(c.stroke) + fork(.9) * 2 + c.control);
      near(r.dc, expected.reduce((a, b) => a + b, 0) / expected.length);
      near(r.returnTime, duration(f.A, f.E, false));
    }
  });
  test('v0.2 separate XYZ ports: exact SC/DC enumeration, weighted demand, signed fork stroke', () => {
    const c = cfg({ bays: 3, levels: 2, sides: 1, ioX: 2, ioY: 3, ioZ: -.6, outX: 55, outY: 16, outZ: 1, inbound: 90, outbound: 10, loadedFactor: .6 });
    const rack = Model.cells(c), e = M.port(c, 'in'), a = M.port(c, 'out'), r = Model.calculate(c);
    const mean = kind => rack.reduce((s, cell) => s + M.plan(c, kind, kind === 'in' ? e : a, cell, cell, true).duration, 0) / rack.length;
    near(r.scIn, mean('in')); near(r.scOut, mean('out')); near(r.sc, r.scIn);
    let sum = 0, n = 0;
    for (const x of rack) for (const y of rack) if (x.id !== y.id) { sum += M.plan(c, 'dc', e, x, y, true).duration; n++; }
    near(r.dc, sum / n);
    const plan = M.plan(c, 'dc', e, rack[0], rack[1], true), forks = plan.actions.filter(a => a.type === 'fork');
    near(forks[0].fork.profile.distance, .6); near(forks[3].fork.profile.distance, 1);
    assert.equal(forks[0].side, -1); assert.equal(forks[3].side, 1);
    near(plan.to.x, e.x); near(plan.to.y, e.y);
    const expectedQ = 100 * 3600 / (80 * r.scIn + 10 * r.dc); near(r.theory, expectedQ);
  });
  test('v0.2 fleet: exact counts, distinct seeds and poses, conservation, replay and aggregate statistics', () => {
    const c = cfg({ cranes: 3, bays: 4, levels: 3, hours: .12, warmup: 0, inbound: 420, outbound: 390, peak: 1, ports: [
      { ioX: 0, ioY: 0, ioZ: -.6, outX: 60, outY: 0, outZ: 1 },
      { ioX: 20, ioY: 2, ioZ: -.8, outX: 10, outY: 8, outZ: -.9 }
    ] });
    const fleet = new E.Fleet(c), replay = new E.Fleet(c);
    assert.equal(fleet.engines.length, 3); assert.equal(fleet.engines.reduce((s, e) => s + e.rack.length, 0), 72);
    fleet.advanceTo(40);
    assert.equal(new Set(fleet.engines.map(e => e.config.seed)).size, 3);
    assert.ok(new Set(fleet.engines.map(e => JSON.stringify(e.pose()))).size > 1);
    while (fleet.time < fleet.horizon) {
      fleet.advanceTo(fleet.heap.peek()?.time ?? fleet.horizon);
      const s = fleet.snapshot(); assert.ok(s.conservation && s.jobsConserved);
      near(Object.values(s.stateTime).reduce((a, b) => a + b, 0), s.machineTime, 1e-7);
      near(s.throughput, s.aisles.reduce((a, b) => a + b.throughput, 0));
    }
    for (let t = 0; t < replay.horizon; t += .17) replay.advanceTo(t); replay.advanceTo(replay.horizon);
    assert.deepEqual(json(fleet.snapshot()), json(replay.snapshot())); assert.deepEqual(json(fleet.logs), json(replay.logs));
    assert.equal(new Set(fleet.logs.map(j => j.aisle)).size, 3); assert.ok(fleet.logs.every(j => j.address.startsWith('STC') && Number.isFinite(j.port.z)));
    const r = Model.calculate(c); near(r.theoryTotal, r.aisles.reduce((s, a) => s + a.theory, 0)); assert.notEqual(r.aisles[0].scIn, r.aisles[1].scIn);
  });
  test('v0.2 limits, CASE conditions, port reach and legacy project migration', () => {
    for (const patch of [{ method: 'fem', pointMode: 'theory', femCase: 2 }, { ioZ: -2 }, { outY: 101 }, { ports: [{ outX: -501 }] }, { cranes: 100, bays: 80, levels: 30 }]) assert.throws(() => Model.validate(cfg(patch)));
    const old = cfg({ stroke: 2, ioX: 7, ioY: 4 });
    for (const key of ['ports', 'ioZ', 'outX', 'outY', 'outZ', 'method', 'femCase']) delete old[key];
    const packed = Model.pack(old); packed.moduleVersion = '0.1.0'; packed.config = old;
    const migrated = Model.unpack(packed); near(M.port(migrated, 'out').x, 7); near(M.port(migrated, 'out').y, 4); near(M.port(migrated, 'out').z, -2);
    const custom = cfg({ cranes: 2, ports: [{ ioZ: .6, outX: 50, outY: 4, outZ: -.8 }] });
    assert.deepEqual(json(Model.unpack(json(Model.pack(custom)))), json(Model.validate(custom)));
  });
  test('v0.2.2 rack heights: explicit first level, pitch, automatic values and one-level rack', () => {
    const base = cfg({ height: 12, levels: 4, bays: 2 });
    for (const [patch, expected] of [[{}, [1.5, 4.5, 7.5, 10.5]], [{ firstLevelHeight: .6, levelPitch: 2.4 }, [.6, 3, 5.4, 7.8]],
      [{ firstLevelHeight: .6 }, [.6, 3.6, 6.6, 9.6]], [{ levelPitch: 2 }, [1, 3, 5, 7]], [{ levels: 1, firstLevelHeight: 0 }, [0]], [{ levels: 1, firstLevelHeight: 12 }, [12]]]) {
      const c = Model.validate({ ...base, ...patch }), rack = Model.cells(c);
      for (const cell of rack) near(cell.y, expected[cell.level - 1]);
      assert.equal(rack.length, c.bays * c.levels * c.sides);
      near(Model.rackLayout(c).top, expected.at(-1));
    }
  });
  test('v0.2.2 rack validation prevents unreachable top levels and invalid geometry', () => {
    const c = cfg({ height: 12, levels: 4, firstLevelHeight: 1, levelPitch: 3 });
    for (const patch of [{ firstLevelHeight: -1 }, { levelPitch: 0 }, { levelPitch: -1 }, { firstLevelHeight: Infinity }, { levelPitch: NaN }]) assert.throws(() => Model.validate({ ...c, ...patch }));
    assert.throws(() => Model.validate({ ...c, firstLevelHeight: 13 }), e => e.field === 'firstLevelHeight' && e.message.includes('최상단'));
    assert.throws(() => Model.validate({ ...c, levelPitch: 4 }), e => e.field === 'levelPitch' && e.message.includes('13 m'));
    near(Model.rackLayout(Model.validate({ ...c, firstLevelHeight: 3 })).top, 12);
  });
  test('v0.2.2 geometry project migration preserves old cell locations and explicit height round-trip', () => {
    const old = cfg({ height: 17, levels: 7, speedUnit: 'm/s' }); delete old.firstLevelHeight; delete old.levelPitch;
    const data = Model.pack(old); data.config = old; data.moduleVersion = '0.2.1';
    const c = Model.unpack(json(data)); assert.equal(c.firstLevelHeight, null); assert.equal(c.levelPitch, null);
    for (const cell of Model.cells(c)) near(cell.y, (cell.level - .5) * 17 / 7);
    const custom = cfg({ firstLevelHeight: .5, levelPitch: 2 });
    assert.deepEqual(json(Model.unpack(json(Model.pack(custom)))), json(custom));
    assert.equal(c.speedUnit, 'm/s'); near(c.vx, 3);
  });
  test('v0.2.2 custom height SC/DC analytical means agree with physical plans and change lift time', () => {
    const c = cfg({ length: 4, height: 12, levels: 4, bays: 2, sides: 1, firstLevelHeight: .6, levelPitch: 2.4, loadedFactor: .7 });
    const rack = Model.cells(c), r = Model.calculate(c), home = M.port(c, 'in');
    near(r.scIn, rack.reduce((sum, cell) => sum + M.plan(c, 'in', home, cell, null, true).duration, 0) / rack.length);
    let sum = 0, n = 0;
    for (const a of rack) for (const b of rack) if (a.id !== b.id) { sum += M.plan(c, 'dc', home, a, b, true).duration; n++; }
    near(r.dc, sum / n);
    assert.ok(r.scIn < Model.calculate({ ...c, firstLevelHeight: null, levelPitch: null }).scIn);
    const fem = { ...c, method: 'fem', pointMode: 'theory', femCase: 1 };
    assert.deepEqual(json(Model.femPoints(fem)), json(Model.femPoints({ ...fem, firstLevelHeight: null, levelPitch: null })));
    near(Model.calculate(fem).theory, Model.calculate({ ...fem, firstLevelHeight: null, levelPitch: null }).theory);
  });
  test('v0.2.2 custom heights reach all fleet cells and retain deterministic playback', () => {
    const c = cfg({ cranes: 2, bays: 3, levels: 4, height: 12, firstLevelHeight: .6, levelPitch: 2.4, hours: .12, warmup: 0, inbound: 400, outbound: 400, peak: 1 });
    const bulk = new E.Fleet(c), frames = new E.Fleet(c);
    for (const e of bulk.engines) for (const cell of e.rack) near(cell.y, [.6, 3, 5.4, 7.8][cell.level - 1]);
    bulk.advanceTo(bulk.horizon);
    for (let t = 0; t < frames.horizon; t += .17) frames.advanceTo(t); frames.advanceTo(frames.horizon);
    assert.deepEqual(json(bulk.logs), json(frames.logs)); assert.deepEqual(json(bulk.snapshot()), json(frames.snapshot()));
    assert.ok(bulk.snapshot().conservation && bulk.snapshot().jobsConserved);
  });
  test('v0.2.2 minute defaults and reports preserve SI motion and export actual heights', () => {
    const c = cfg({ firstLevelHeight: .5, levelPitch: 2 }), md = R.markdown(Model.calculate(c));
    assert.equal(c.speedUnit, 'm/min'); near(c.vx, 3); near(c.vy, 1); near(c.vf, .6);
    for (const row of ['| 주행 최대속도 | 180 | m/min |', '| 승강 최대속도 | 60 | m/min |', '| 포크 최대속도 | 36 | m/min |', '| 1 | 0.5 |', '| 10 | 18.5 |']) assert.ok(md.includes(row), row);
    assert.ok(R.markdown(Model.calculate({ ...c, speedUnit: 'm/s' })).includes('| 주행 최대속도 | 3 | m/s |'));
    near(Model.calculate(c).theory, Model.calculate({ ...c, speedUnit: 'm/s' }).theory);
  });
  test('v0.2.3 outside ports preserve rack centers and accept signed/global XYZ on every aisle', () => {
    const c = cfg({ length: 33.9, bays: 6, levels: 6, height: 17, firstLevelHeight: 1.3, levelPitch: 2.5, cranes: 2,
      ioX: -3, ioY: -2, outX: 42.5, outY: 21, ports: [{}, { ioX: -7, ioY: -4, outX: 44, outY: 25, outZ: .7 }] });
    const valid = Model.validate(c), rack = Model.cells(valid), regular = Model.cells(cfg({ ...c, ioX: 0, ioY: 0, outX: 0, outY: 0, ports: [] }));
    assert.deepEqual(json(rack), json(regular));
    for (const cell of rack) near(cell.x, [2.825, 8.475, 14.125, 19.775, 25.425, 31.075][cell.bay - 1]);
    const bounds = Model.envelope(valid); near(bounds.xMin, -7); near(bounds.xMax, 44); near(bounds.yMin, -4); near(bounds.yMax, 25 + valid.transferLift);
    const saved = Model.unpack(json(Model.pack(valid))); assert.deepEqual(json(saved), json(valid));
    for (const patch of [{ ioX: -501 }, { outY: -101 }, { ports: [{ ioY: Infinity }] }, { ports: [{ outZ: 2 }] }]) assert.throws(() => Model.validate({ ...c, ...patch }));
  });
  test('v0.2.3 exterior SC/DC times equal independent complete physical routes', () => {
    const c = cfg({ length: 12, height: 8, bays: 3, levels: 2, sides: 1, ioX: -5, ioY: -1, outX: 18, outY: 10, ioZ: -.5, outZ: 1, loadedFactor: .6 });
    const rack = Model.cells(c), r = Model.calculate(c), input = M.port(c, 'in'), output = M.port(c, 'out');
    near(r.scIn, rack.reduce((s, p) => s + M.plan(c, 'in', input, p, null, true).duration, 0) / rack.length);
    near(r.scOut, rack.reduce((s, p) => s + M.plan(c, 'out', output, null, p, true).duration, 0) / rack.length);
    let sum = 0, n = 0;
    for (const a of rack) for (const b of rack) if (a.id !== b.id) { sum += M.plan(c, 'dc', input, a, b, true).duration; n++; }
    near(r.dc, sum / n); assert.ok(r.scIn > Model.calculate({ ...c, ioX: 0, ioY: 0 }).scIn);
  });
  test('v0.2.3 P1/P2 use deterministic nearest actual cargo centers; theory remains comparable', () => {
    const c = cfg({ method: 'fem', length: 60, height: 12, bays: 6, levels: 4, firstLevelHeight: .5, levelPitch: 3 });
    const f = Model.femPoints(c);
    near(f.inbound[0].x, 15); near(f.inbound[0].y, 6.5); near(f.inbound[1].x, 35); near(f.inbound[1].y, 3.5);
    near(f.inbound[0].reference.x, 12); near(f.inbound[0].reference.y, 8);
    const theory = Model.femPoints({ ...c, pointMode: 'theory' }); near(theory.inbound[0].x, 12); near(theory.inbound[0].y, 8);
    const r = Model.calculate(c), input = M.port(c, 'in');
    near(r.scIn, f.inbound.reduce((s, p) => s + M.plan(c, 'in', input, p, null, true).duration, 0) / 2);
    near(r.dc, M.plan(c, 'dc', input, f.inbound[0], f.inbound[1], true).duration);
    assert.notEqual(r.scIn, Model.calculate({ ...c, pointMode: 'theory' }).scIn);
  });
  test('v0.2.3 all six CASE selections resolve to valid cells and distinct DC endpoints', () => {
    for (let femCase = 1; femCase <= 6; femCase++) {
      let c = cfg({ method: 'fem', femCase, bays: 6, levels: 6, length: 33.9, height: 17, firstLevelHeight: 1.3, levelPitch: 2.5 });
      c = { ...c, ...Model.casePorts(c) }; const f = Model.femPoints(c), rack = Model.cells(c);
      for (const pair of f.dcPairs) { assert.notEqual(pair[0].id, pair[1].id); for (const p of pair) {
        const cell = rack[p.id]; near(p.x, cell.x); near(p.y, cell.y); near(p.z, cell.z); assert.equal(p.bay, cell.bay); assert.equal(p.level, cell.level);
      } }
      assert.equal(f.dcPairs.length, femCase === 2 ? 2 : 1);
    }
    const single = cfg({ method: 'fem', bays: 1, levels: 1, sides: 1 }); assert.equal(Model.calculate(single).dc, null);
    const pair = Model.femPoints({ ...single, sides: 2 }).dcPairs[0]; assert.notEqual(pair[0].id, pair[1].id);
  });
  test('v0.2.3 external CASE paths keep actual ports and label reference-template extension', () => {
    const c = cfg({ method: 'fem', femCase: 6, length: 33.9, bays: 6, levels: 6, firstLevelHeight: 1.3, levelPitch: 2.5, ioX: -3, ioY: 9.6, outX: -3, outY: 1.6 });
    const f = Model.femPoints(c), r = Model.calculate(c);
    assert.equal(f.portMatch, false); near(f.E.x, -3); near(f.E.y, 9.6); near(f.A.y, 1.6);
    assert.ok(r.reference.includes('설계 계산') && r.reference.includes('실제 외부/자유 포트'));
    near(r.dc, M.plan(c, 'dc', M.port(c, 'in'), f.inbound[0], f.inbound[1], true).duration);
    assert.throws(() => Model.calculate({ ...c, pointMode: 'theory' }));
    const mirrored = Model.femPoints({ ...c, ioX: 37, outX: 37 }); assert.ok(mirrored.mirroredLayout); near(mirrored.theoretical.inbound[0].x, c.length * .8);
    const md = R.markdown(r); assert.ok(md.includes('적용 화물 셀') && md.includes('설계 확장') && md.includes('이론 XYZ (비교)') && md.includes('-3, 9.6'));
  });
  test('v0.2.3 cargo sits at geometric center of every rack slot including end levels', () => {
    for (const [firstLevelHeight, levelPitch] of [[.5, 2], [0, 1], [2, 2]]) {
      const c = cfg({ firstLevelHeight, levelPitch }), layout = Model.rackLayout(c);
      for (const cell of Model.cells(c)) near(cell.y, (layout.boundaries[cell.level - 1] + layout.boundaries[cell.level]) / 2);
    }
  });
  test('v0.2.3 signed-coordinate fleet playback is deterministic and conserves inventory', () => {
    const c = cfg({ cranes: 2, bays: 3, levels: 2, length: 12, height: 8, ioX: -4, ioY: -1, outX: 16, outY: 10, hours: .15, warmup: 0, inbound: 400, outbound: 400, peak: 1,
      ports: [{}, { ioX: -8, ioY: 9.6, outX: -8, outY: 1.6 }] });
    const bulk = new E.Fleet(c), frames = new E.Fleet(c); bulk.advanceTo(bulk.horizon);
    for (let t = 0; t < frames.horizon; t += .17) frames.advanceTo(t); frames.advanceTo(frames.horizon);
    assert.deepEqual(json(bulk.logs), json(frames.logs)); assert.deepEqual(json(bulk.snapshot()), json(frames.snapshot()));
    assert.ok(bulk.snapshot().conservation && bulk.snapshot().jobsConserved);
    assert.equal(new Set(bulk.logs.map(j => j.aisle)).size, 2); assert.ok(bulk.logs.some(j => j.port.x < 0) && bulk.logs.some(j => j.port.y > c.height));
  });
  test('v0.2.1 speed validation reports selected units without reinterpreting SI inputs', () => {
    for (const [key, limit] of [['vx', 20], ['vy', 10], ['vf', 5]]) {
      const values = cfg({ speedUnit: 'm/min', [key]: limit + 1 });
      assert.throws(() => Model.validate(values), e => e.field === key && e.message.includes('0.06 ~ ' + limit * 60 + ' m/min') && e.message.includes('현재 입력: ' + (limit + 1) * 60 + ' m/min'));
      near(Model.validate({ ...values, [key]: limit })[key], limit);
      near(Model.validate({ ...values, [key]: .001 })[key], .001);
      assert.throws(() => Model.validate({ ...values, [key]: NaN }), e => e.field === key && e.message.includes('비어 있거나 숫자가 아닙니다'));
    }
    assert.throws(() => Model.validate(cfg({ vx: 180, speedUnit: 'm/s' })), e => e.field === 'vx' && e.message.includes('180 m/min') && e.message.includes('3 m/s'));
    assert.throws(() => Model.validate(cfg({ vx: 180, speedUnit: 'm/min' }))); // JSON/internal values always use SI.
    near(Model.calculate(cfg({ vx: 3, speedUnit: 'm/min' })).theory, Model.calculate(cfg({ vx: 3 })).theory);
  });
};
