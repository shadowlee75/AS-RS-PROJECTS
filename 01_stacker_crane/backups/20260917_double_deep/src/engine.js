(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./motion.js'), require('./model.js'));
  else root.STCEngine = factory(root.STCMotion, root.STCModel);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, Model) {
  'use strict';
  class Heap {
    constructor() { this.items = []; this.seq = 0; }
    before(a, b) { return a.time < b.time || (a.time === b.time && a.seq < b.seq); }
    push(event) {
      event.seq = this.seq++;
      const a = this.items; a.push(event); let i = a.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (!this.before(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
    }
    peek() { return this.items[0]; }
    pop() {
      const a = this.items, result = a[0], last = a.pop();
      if (a.length) { a[0] = last; let i = 0; while (true) { let j = i * 2 + 1; if (j >= a.length) break;
        if (j + 1 < a.length && this.before(a[j + 1], a[j])) j++;
        if (!this.before(a[j], a[i])) break; [a[j], a[i]] = [a[i], a[j]]; i = j;
      } }
      return result;
    }
  }
  const stateNames = { idle: '대기', loaded: '적재 이동', empty: '공차 이동', fork: '포크 이재', position: '정위치', control: '제어 지연', blocked: '출고 차단' };
  function percentile(values, q) {
    if (!values.length) return 0;
    const a = [...values].sort((x, y) => x - y), p = (a.length - 1) * q, i = Math.floor(p);
    return a[i] + (a[Math.min(i + 1, a.length - 1)] - a[i]) * (p - i);
  }
  class Engine {
    constructor(input, validated = false) {
      this.config = validated ? input : Model.validate(input);
      const c = this.config;
      this.routes = Model.routeConfigs(c); this.mixing = Model.mix(c); this.startedCycles = { sc: 0, dc: 0 };
      this.portBuffers = new Map();
      for (const route of this.routes) for (const kind of ['in', 'out']) {
        const key = Model.portKey(route.config, kind);
        if (!this.portBuffers.has(key)) this.portBuffers.set(key, { key, kind, count: 0, lastTakeaway: 0 });
      }
      this.warmup = c.warmup * 60; this.horizon = this.warmup + c.hours * 3600; this.time = 0; this.accountedUntil = 0;
      this.rack = Model.cells(c).map(cell => ({ ...cell, state: 'empty', storedAt: 0 }));
      const initRandom = Model.rng(c.seed ^ 0x37A1), indices = this.rack.map(cell => cell.id);
      for (let i = indices.length - 1; i > 0; i--) { const j = Math.floor(initRandom() * (i + 1)); [indices[i], indices[j]] = [indices[j], indices[i]]; }
      this.initialInventory = Math.floor(this.rack.length * c.initialFill);
      indices.slice(0, this.initialInventory).forEach((id, i) => { this.rack[id].state = 'occupied'; this.rack[id].storedAt = -this.initialInventory + i; });
      this.storeRandom = Model.rng(c.seed ^ 0x63B1); this.retrieveRandom = Model.rng(c.seed ^ 0x74C1);
      this.heap = new Heap(); this.inQueue = []; this.outQueue = []; this.backlog = [];
      this.inSlots = 0; this.outputCount = 0; this.lastTakeaway = 0; this.cargo = null;
      this.position = M.port(this.routes[0].config, ['sc-return', 'mixed'].includes(c.mode) && c.inbound === 0 ? 'out' : 'in');
      this.state = 'idle'; this.active = null; this.cycle = null; this.actionIndex = 0;
      this.created = { in: 0, out: 0 }; this.completed = { in: 0, out: 0 }; this.measured = { in: 0, out: 0 };
      this.shipped = 0; this.measuredShipped = 0; this.cycles = { sc: 0, dc: 0 }; this.measuredCycles = { sc: 0, dc: 0 };
      this.waits = []; this.leads = []; this.logs = []; this.series = [];
      this.stateTime = Object.fromEntries(Object.keys(stateNames).map(key => [key, 0]));
      this.queueArea = 0; this.inventoryArea = 0; this.overflowTime = 0; this.starvedTime = 0; this.fullTime = 0; this.maxQueue = 0;
      this.lastCycle = null; this.version = 0; this.dispatchScheduled = false;
      this.scheduleArrivals('in', c.inbound * c.peak / c.cranes, Model.rng(c.seed ^ 0x11A7));
      this.scheduleArrivals('out', c.outbound * c.peak / c.cranes, Model.rng(c.seed ^ 0x22A7));
      const bin = Math.max(60, Math.ceil(this.horizon / 240));
      for (let t = 0; t < this.horizon; t += bin) this.heap.push({ type: 'sample', time: t });
      this.heap.push({ type: 'sample', time: this.horizon });
    }
    scheduleArrivals(kind, rate, random) {
      if (rate === 0) return;
      const c = this.config, interval = 3600 / rate;
      const gap = () => c.arrival === 'poisson' ? -Math.log(1 - random()) * interval : interval * (1 + (2 * random() - 1) * c.jitter);
      let t = c.arrival === 'poisson' ? gap() : 0, count = 0;
      const credits = this.routes.map(() => 0);
      while (t < this.horizon) {
        if (++count > 50000) throw Error('실제 생성 작업이 한도를 초과했습니다. 측정 시간을 줄이세요.');
        this.routes.forEach((r, i) => { credits[i] += r.weight; });
        const route = credits.reduce((best, value, i) => value > credits[best] + 1e-12 ? i : best, 0); credits[route] -= 1;
        this.heap.push({ type: 'arrival', time: t, kind, route, id: kind + '-' + count }); t += gap();
      }
    }
    pending() { return this.inQueue.length + this.outQueue.length + this.backlog.length; }
    inventory() { return this.rack.reduce((n, cell) => n + (cell.state === 'occupied' || cell.state === 'reservedOut' ? 1 : 0), 0); }
    accrue(to) {
      const dt = Math.max(0, to - Math.max(this.accountedUntil, this.warmup));
      if (dt > 0) {
        this.stateTime[this.state] += dt; this.queueArea += this.pending() * dt; this.inventoryArea += this.inventory() * dt;
        if (this.backlog.length) this.overflowTime += dt;
        if (this.state === 'idle' && this.outQueue.length && !this.rack.some(cell => cell.state === 'occupied')) this.starvedTime += dt;
        if (this.state === 'idle' && (this.inQueue.length || this.backlog.length) && !this.rack.some(cell => cell.state === 'empty')) this.fullTime += dt;
      }
      this.time = to; this.accountedUntil = to;
    }
    admit() {
      for (let i = 0; i < this.backlog.length;) {
        const job = this.backlog[i], buffer = this.buffer(job.route, 'in');
        if (buffer.count >= this.config.inBuffer) { i++; continue; }
        this.backlog.splice(i, 1); this.inQueue.push(job); buffer.count++; this.inSlots++;
      }
    }
    buffer(route, kind) { return this.portBuffers.get(Model.portKey(this.routes[route ?? 0].config, kind)); }
    chooseCell(state, rule, origin, random) {
      const eligible = this.rack.filter(cell => cell.state === state);
      if (!eligible.length) return null;
      if (rule === 'random') return eligible[Math.floor(random() * eligible.length)];
      if (rule === 'fifo') return eligible.reduce((a, b) => b.storedAt < a.storedAt ? b : a);
      return eligible.reduce((a, b) => M.move(this.config, origin, b, false).duration < M.move(this.config, origin, a, false).duration ? b : a);
    }
    dispatch() {
      if (this.cycle || this.time >= this.horizon) return;
      if (this.config.mode === 'mixed' || this.routes.length > 1) return this.dispatchMixed();
      const c = this.routes[0].config;
      let inCell = this.inQueue.length ? this.chooseCell('empty', c.storage, { x: c.ioX, y: c.ioY }, this.storeRandom) : null;
      let outCell = this.outQueue.length ? this.chooseCell('occupied', c.retrieval, inCell && c.mode === 'dc' ? inCell : this.position, this.retrieveRandom) : null;
      let kind;
      if (inCell && outCell && c.mode === 'dc') kind = 'dc';
      else if (inCell && (!outCell || this.inQueue[0].arrival <= this.outQueue[0].arrival)) { kind = 'in'; outCell = null; }
      else if (outCell) { kind = 'out'; inCell = null; }
      else { this.state = 'idle'; return; }
      const inJob = inCell ? this.inQueue.shift() : null, outJob = outCell ? this.outQueue.shift() : null;
      if (inCell) inCell.state = 'reservedIn'; if (outCell) outCell.state = 'reservedOut';
      for (const job of [inJob, outJob].filter(Boolean)) { job.start = this.time; if (this.time >= this.warmup) this.waits.push(this.time - job.arrival); }
      const cfg = this.routes[0].config;
      const plan = M.plan(cfg, kind, this.position, inCell, outCell, c.mode === 'sc-return');
      this.cycle = { kind, inJob, outJob, inCell, outCell, plan, config: cfg, route: 0, start: this.time };
      this.startedCycles[kind === 'dc' ? 'dc' : 'sc']++;
      this.lastCycle = this.cycle; this.actionIndex = 0; this.version++; this.startAction();
    }
    dispatchMixed() {
      const c = this.config, hasSpace = this.rack.some(p => p.state === 'empty'), hasStock = this.rack.some(p => p.state === 'occupied');
      const firstIn = hasSpace ? this.inQueue[0] : null, firstOut = hasStock ? this.outQueue[0] : null;
      let inJob = null, outJob = null, route = 0;
      const completedStarts = this.startedCycles.sc + this.startedCycles.dc;
      const wantDual = c.mode === 'dc' || (c.mode === 'mixed' && this.mixing.p > 0 && this.mixing.p * (completedStarts + 1) - this.startedCycles.dc >= .5 - 1e-9);
      if (wantDual && hasSpace && hasStock) {
        // A DC belongs to one I/O pair. Never silently combine ports from different CASE routes.
        for (const candidate of this.inQueue) {
          const partner = this.outQueue.find(job => job.route === candidate.route);
          if (partner) { inJob = candidate; outJob = partner; route = candidate.route; break; }
        }
      }
      if (!inJob && !outJob) {
        if (firstIn && (!firstOut || firstIn.arrival <= firstOut.arrival)) { inJob = firstIn; route = firstIn.route; }
        else if (firstOut) { outJob = firstOut; route = firstOut.route; }
        else { this.state = 'idle'; return; }
      }
      const cfg = this.routes[route].config, kind = inJob && outJob ? 'dc' : inJob ? 'in' : 'out';
      const inCell = inJob ? this.chooseCell('empty', c.storage, M.port(cfg, 'in'), this.storeRandom) : null;
      const outCell = outJob ? this.chooseCell('occupied', c.retrieval, kind === 'dc' ? inCell : this.position, this.retrieveRandom) : null;
      if (inCell) { inCell.state = 'reservedIn'; this.inQueue.splice(this.inQueue.indexOf(inJob), 1); }
      if (outCell) { outCell.state = 'reservedOut'; this.outQueue.splice(this.outQueue.indexOf(outJob), 1); }
      for (const job of [inJob, outJob].filter(Boolean)) { job.start = this.time; if (this.time >= this.warmup) this.waits.push(this.time - job.arrival); }
      const plan = M.plan(cfg, kind, this.position, inCell, outCell, c.mode === 'sc-return' || c.mode === 'mixed');
      this.cycle = { kind, inJob, outJob, inCell, outCell, plan, config: cfg, route, start: this.time };
      this.startedCycles[kind === 'dc' ? 'dc' : 'sc']++;
      this.lastCycle = this.cycle; this.actionIndex = 0; this.version++; this.startAction();
    }
    startAction() {
      const action = this.cycle.plan.actions[this.actionIndex];
      if (!action) {
        const key = this.cycle.kind === 'dc' ? 'dc' : 'sc'; this.cycles[key]++;
        if (this.time >= this.warmup) this.measuredCycles[key]++;
        this.cycle = null; this.active = null; this.state = 'idle'; this.dispatch(); return;
      }
      if (action.effect === 'placeOut' && this.buffer(this.cycle.route, 'out').count >= this.config.outBuffer) { this.state = 'blocked'; this.active = null; return; }
      this.active = { ...action, startTime: this.time, endTime: this.time + action.duration };
      this.state = action.type === 'move' ? (action.loaded ? 'loaded' : 'empty') : action.type;
      this.heap.push({ type: 'actionDone', time: this.active.endTime });
    }
    finishJob(job, kind) {
      job.end = this.time; this.completed[kind]++;
      if (this.time >= this.warmup) { this.measured[kind]++; this.leads.push(this.time - job.arrival); }
      this.logs.push({ id: job.id, kind, arrival: job.arrival, start: job.start, end: job.end,
        wait: job.start - job.arrival, lead: job.end - job.arrival, cycle: this.cycle.kind, measured: this.time >= this.warmup,
        cell: { ...(kind === 'in' ? this.cycle.inCell : this.cycle.outCell) }, port: M.port(this.cycle.config, kind),
        route: this.routes[this.cycle.route].id, femCase: this.cycle.config.femCase });
    }
    finishAction() {
      const action = this.active, cycle = this.cycle;
      this.position = { ...action.to };
      switch (action.effect) {
        case 'pickIn': this.inSlots--; this.buffer(cycle.route, 'in').count--; this.cargo = 'in'; this.admit(); break;
        case 'placeIn': cycle.inCell.state = 'occupied'; cycle.inCell.storedAt = this.time; this.cargo = null; this.finishJob(cycle.inJob, 'in'); break;
        case 'pickOut': cycle.outCell.state = 'empty'; this.cargo = 'out'; break;
        case 'placeOut':
          this.cargo = null; this.finishJob(cycle.outJob, 'out');
          if (this.config.takeaway === 0) { this.shipped++; if (this.time >= this.warmup) this.measuredShipped++; }
          else { const buffer = this.buffer(cycle.route, 'out'); this.outputCount++; buffer.count++;
            buffer.lastTakeaway = Math.max(this.time, buffer.lastTakeaway) + this.config.takeaway; this.lastTakeaway = buffer.lastTakeaway;
            this.heap.push({ type: 'takeaway', time: buffer.lastTakeaway, route: cycle.route }); }
          break;
      }
      this.version++; this.active = null; this.actionIndex++; this.startAction();
    }
    advanceTo(target) {
      if (!Number.isFinite(target) || target < this.time) throw Error('시뮬레이션 시각은 현재 시각 이후의 유한한 값이어야 합니다.');
      target = Math.min(target, this.horizon);
      while (this.heap.peek() && this.heap.peek().time <= target) {
        const event = this.heap.pop(); this.accrue(event.time);
        if (event.type === 'arrival') {
          const job = { id: event.id, kind: event.kind, arrival: this.time, route: event.route }; this.created[event.kind]++;
          if (event.kind === 'in') { this.backlog.push(job); this.admit(); } else this.outQueue.push(job);
          // Queue a zero-time decision after the already scheduled arrivals at
          // this timestamp, so simultaneous inbound/outbound can form a DC.
          if (!this.dispatchScheduled) { this.dispatchScheduled = true; this.heap.push({ type: 'dispatch', time: this.time }); }
        } else if (event.type === 'dispatch') {
          this.dispatchScheduled = false; this.dispatch();
        } else if (event.type === 'actionDone') this.finishAction();
        else if (event.type === 'takeaway') {
          this.outputCount--; this.buffer(event.route, 'out').count--; this.shipped++; if (this.time >= this.warmup) this.measuredShipped++;
          if (this.state === 'blocked') this.startAction(); else this.dispatch();
        } else if (event.type === 'sample') {
          this.series.push({ time: this.time, queue: this.pending(), inventory: this.inventory(), completed: this.completed.in + this.completed.out, output: this.outputCount });
        }
        if (this.time >= this.warmup) this.maxQueue = Math.max(this.maxQueue, this.pending());
      }
      this.time = target; return this;
    }
    pose() {
      const zero = { p: 0, v: 0, a: 0, phase: '정지' };
      if (!this.active) return { x: { ...zero, p: this.position.x }, y: { ...zero, p: this.position.y }, f: zero, label: stateNames[this.state] };
      const a = this.active, localPlan = { actions: [{ ...a, start: 0, end: a.duration }], duration: a.duration, to: a.to };
      return M.planAt(localPlan, this.time - a.startTime);
    }
    snapshot() {
      const measuredTime = Math.max(0, this.time - this.warmup), denominator = measuredTime || 1;
      // UI frame boundaries must not alter accumulated statistics. Project only
      // the uncommitted tail here; permanent accounting occurs at DES events.
      const tail = Math.max(0, this.time - Math.max(this.accountedUntil, this.warmup));
      const stateTime = { ...this.stateTime }; stateTime[this.state] += tail;
      const done = this.completed.in + this.completed.out, created = this.created.in + this.created.out;
      const queued = this.pending(), inProgress = created - done - queued;
      const stock = this.inventory(), outboundOnCrane = this.cargo === 'out' ? 1 : 0;
      return { time: this.time, horizon: this.horizon, measuredTime, created: { ...this.created }, completed: { ...this.completed }, measured: { ...this.measured },
        throughput: measuredTime > 0 ? (this.measured.in + this.measured.out) * 3600 / measuredTime : 0,
        inboundRate: measuredTime > 0 ? this.measured.in * 3600 / measuredTime : 0, outboundRate: measuredTime > 0 ? this.measured.out * 3600 / measuredTime : 0,
        shippingRate: measuredTime > 0 ? this.measuredShipped * 3600 / measuredTime : 0,
        queued, inProgress, inQueue: this.inQueue.length, outQueue: this.outQueue.length, overflow: this.backlog.length, output: this.outputCount,
        stock, outboundOnCrane, initialInventory: this.initialInventory, averageInventory: (this.inventoryArea + stock * tail) / denominator,
        meanQueue: (this.queueArea + queued * tail) / denominator, maxQueue: this.maxQueue, busy: measuredTime ? 1 - stateTime.idle / measuredTime : 0,
        meanWait: this.waits.length ? this.waits.reduce((a, b) => a + b, 0) / this.waits.length : 0,
        p95Wait: percentile(this.waits, 0.95), maxWait: this.waits.reduce((a, b) => Math.max(a, b), 0),
        p95Lead: percentile(this.leads, 0.95), waitSamples: this.waits.length,
        oldestPending: [...this.inQueue, ...this.outQueue, ...this.backlog].reduce((max, job) => Math.max(max, this.time - job.arrival), 0),
        state: this.state, stateTime, overflowTime: this.overflowTime + (this.backlog.length ? tail : 0),
        starvedTime: this.starvedTime + (this.state === 'idle' && this.outQueue.length && !this.rack.some(cell => cell.state === 'occupied') ? tail : 0),
        fullTime: this.fullTime + (this.state === 'idle' && (this.inQueue.length || this.backlog.length) && !this.rack.some(cell => cell.state === 'empty') ? tail : 0),
        cycles: { ...this.cycles }, measuredCycles: { ...this.measuredCycles },
        mix: { ...this.mixing, actual: this.measuredCycles.sc + this.measuredCycles.dc ? this.measuredCycles.dc / (this.measuredCycles.sc + this.measuredCycles.dc) : null },
        ports: [...this.portBuffers.values()].map(p => ({ ...p })),
        conservation: this.initialInventory + this.completed.in - this.completed.out === stock + outboundOnCrane,
        jobsConserved: created === done + queued + inProgress && inProgress >= 0 && inProgress <= 2,
        shipped: this.shipped, saturated: queued > 0 && (stateTime.idle / denominator < 0.05 || stateTime.blocked > 0),
        seed: this.config.seed, config: this.config };
    }
  }
  class Fleet {
    constructor(input) {
      this.config = Model.validate(input); this.time = 0;
      this.engines = Array.from({ length: this.config.cranes }, (_, i) => new Engine({ ...Model.aisleConfig(this.config, i), seed: (this.config.seed + Math.imul(i, 104729)) >>> 0 }, true));
      this.horizon = this.engines[0].horizon; this.warmup = this.engines[0].warmup;
      this.heap = { peek: () => this.engines.map(e => e.heap.peek()).filter(Boolean).reduce((a, b) => !a || b.time < a.time ? b : a, null) };
    }
    advanceTo(target) { this.engines.forEach(e => e.advanceTo(target)); this.time = this.engines[0].time; return this; }
    get logs() {
      return this.engines.flatMap((e, i) => e.logs.map(job => ({ ...job, id: 'STC' + (i + 1) + '/' + job.id, aisle: i + 1,
        address: Model.address(job.cell, i), seed: e.config.seed }))).sort((a, b) => a.end - b.end || a.aisle - b.aisle);
    }
    get series() {
      return this.engines[0].series.map((point, index) => {
        const sum = { time: point.time, queue: 0, inventory: 0, completed: 0, output: 0 };
        for (const e of this.engines) for (const key of ['queue', 'inventory', 'completed', 'output']) sum[key] += e.series[index][key];
        return sum;
      });
    }
    snapshot() {
      const rows = this.engines.map((e, i) => ({ ...e.snapshot(), aisle: i + 1 })), first = rows[0];
      const s = { ...first, config: this.config, aisles: rows, cranes: rows.length, state: 'fleet', stateTime: {},
        conservation: rows.every(r => r.conservation), jobsConserved: rows.every(r => r.jobsConserved), saturated: rows.some(r => r.saturated) };
      for (const key of ['throughput', 'inboundRate', 'outboundRate', 'shippingRate', 'queued', 'inProgress', 'inQueue', 'outQueue', 'overflow', 'output', 'stock', 'outboundOnCrane',
        'initialInventory', 'averageInventory', 'meanQueue', 'waitSamples', 'overflowTime', 'starvedTime', 'fullTime', 'shipped']) s[key] = rows.reduce((sum, r) => sum + r[key], 0);
      for (const key of ['created', 'completed', 'measured', 'cycles', 'measuredCycles', 'stateTime']) {
        s[key] = {}; for (const sub of Object.keys(first[key])) s[key][sub] = rows.reduce((sum, r) => sum + r[key][sub], 0);
      }
      s.mix = { ...first.mix, actual: s.measuredCycles.sc + s.measuredCycles.dc ? s.measuredCycles.dc / (s.measuredCycles.sc + s.measuredCycles.dc) : null };
      s.busy = rows.reduce((sum, r) => sum + r.busy, 0) / rows.length;
      s.machineTime = s.measuredTime * rows.length;
      s.oldestPending = Math.max(...rows.map(r => r.oldestPending));
      s.maxQueue = Math.max(0, ...this.series.filter(p => p.time >= this.warmup).map(p => p.queue), s.queued);
      const waits = this.engines.flatMap(e => e.waits), leads = this.engines.flatMap(e => e.leads);
      s.meanWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
      s.p95Wait = percentile(waits, .95); s.p95Lead = percentile(leads, .95); s.maxWait = waits.reduce((a, b) => Math.max(a, b), 0);
      return s;
    }
  }
  function run(config) { const engine = new Engine(config); engine.advanceTo(engine.horizon); return engine; }
  function runFleet(config) { const fleet = new Fleet(config); return fleet.advanceTo(fleet.horizon); }
  function interval95(values) {
    const n = values.length;
    if (!n) return { mean: 0, sd: 0, ci95: 0, n: 0 };
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)) : 0;
    const t = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
    return { mean, sd, ci95: n > 1 ? (t[Math.min(n - 1, 30)]) * sd / Math.sqrt(n) : null, n };
  }
  return { Engine, Fleet, Heap, run, runFleet, stateNames, percentile, interval95 };
});
