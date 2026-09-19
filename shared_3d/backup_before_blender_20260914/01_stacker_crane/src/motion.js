(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.STCMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '0.2.4';
  function port(c, kind) {
    const inbound = kind === 'in';
    const x = inbound ? c.ioX : (c.outX ?? c.ioX), y = inbound ? c.ioY : (c.outY ?? c.ioY);
    const z = (inbound ? c.ioZ : c.outZ) ?? -c.stroke;
    return { x, y, z, side: Math.sign(z) || -1, port: kind };
  }
  function axis(distance, speed, accel, decel) {
    if (![distance, speed, accel, decel].every(Number.isFinite) || distance < 0 || speed <= 0 || accel <= 0 || decel <= 0)
      throw new Error('거리 ≥ 0, 속도·가속도·감속도 > 0인 유한한 수를 입력하세요.');
    const critical = speed * speed / 2 * (1 / accel + 1 / decel);
    const peak = Math.min(speed, Math.sqrt(2 * distance / (1 / accel + 1 / decel)));
    const ta = peak / accel, td = peak / decel;
    const cruiseDistance = Math.max(0, distance - peak * peak / 2 * (1 / accel + 1 / decel));
    const tc = peak > 0 ? cruiseDistance / peak : 0;
    const phases = [];
    let t = 0, p = 0, v = 0;
    function phase(label, duration, a) {
      if (duration <= 0) return;
      phases.push({ label, start: t, duration, position: p, velocity: v, acceleration: a });
      p += v * duration + a * duration * duration / 2;
      v += a * duration;
      t += duration;
    }
    phase('가속', ta, accel); phase('정속', tc, 0); phase('감속', td, -decel);
    return { distance, speed, accel, decel, peak, critical, duration: t, ta, tc, td,
      shape: distance === 0 ? '정지' : tc > 1e-9 ? '사다리꼴' : '삼각형', phases };
  }
  function at(profile, time) {
    if (profile.duration === 0 || time >= profile.duration) return { p: profile.distance, v: 0, a: 0, phase: '정지' };
    if (time < 0) return { p: 0, v: 0, a: 0, phase: '대기' };
    const phase = profile.phases.find(p => time < p.start + p.duration) || profile.phases.at(-1);
    const t = Math.max(0, time - phase.start);
    return { p: phase.position + phase.velocity * t + phase.acceleration * t * t / 2,
      v: Math.max(0, phase.velocity + phase.acceleration * t), a: phase.acceleration, phase: phase.label };
  }
  function move(c, from, to, loaded) {
    const f = loaded ? c.loadedFactor : 1;
    const x = axis(Math.abs(to.x - from.x), c.vx * f, c.ax * f, c.dx * f);
    const y = axis(Math.abs(to.y - from.y), c.vy * f, c.ay * f, c.dy * f);
    return { type: 'move', from: { ...from }, to: { ...to }, loaded, x, y,
      duration: Math.max(x.duration, y.duration), directionX: Math.sign(to.x - from.x), directionY: Math.sign(to.y - from.y) };
  }
  function fork(c, distance = c.stroke) {
    const profile = axis(distance, c.vf, c.af, c.df);
    const factor = c.loadedFactor, lift = axis(c.transferLift ?? .11, c.vy * factor, c.ay * factor, c.dy * factor);
    const liftStart = profile.duration, liftEnd = liftStart + lift.duration, retractStart = liftEnd + c.forkDwell;
    return { profile, lift, liftStart, liftEnd, retractStart, duration: retractStart + profile.duration, dwell: c.forkDwell };
  }
  function forkAt(f, time) {
    if (time < f.profile.duration) return at(f.profile, time);
    if (time < f.retractStart) return { p: f.profile.distance, v: 0, a: 0, phase: time < f.liftEnd ? '캐리지 승하강' : '안착 대기' };
    const p = at(f.profile, time - f.retractStart);
    return { p: f.profile.distance - p.p, v: -p.v, a: -p.a, phase: p.phase === '정지' ? '정지' : '인입 ' + p.phase };
  }
  function plan(c, kind, from, inCell, outCell, returnHome) {
    const home = port(c, 'in'), output = port(c, 'out');
    const actions = [];
    let pos = { ...from };
    function travel(to, loaded) {
      // Stored load centres are the lower transfer reference. Loaded travel is 110 mm higher by default.
      to = { ...to, y: to.y + (loaded ? (c.transferLift ?? .11) : 0) };
      const m = move(c, pos, to, loaded);
      if (m.duration > 0) {
        actions.push({ ...m, label: loaded ? '적재 이동' : '공차 이동' });
        if (c.position > 0) actions.push({ type: 'position', label: '정위치', duration: c.position, from: { ...to }, to: { ...to }, loaded });
      }
      pos = { ...to };
    }
    function transfer(atPoint, pick, effect) {
      const f = fork(c, Math.abs(atPoint.z ?? c.stroke));
      const end = { ...atPoint, y: atPoint.y + (pick ? f.lift.distance : 0) };
      actions.push({ type: 'fork', label: ({ pickIn: 'IN 상차', placeIn: '랙 입고', pickOut: '랙 출고', placeOut: 'OUT 하차' })[effect],
        duration: f.duration, fork: f, pick, effect, point: { ...atPoint }, from: { ...pos }, to: end, side: atPoint.side || 1 });
      pos = { ...end };
    }
    if (c.control > 0) actions.push({ type: 'control', label: '제어 지연', duration: c.control, from: { ...pos }, to: { ...pos } });
    if (kind === 'in' || kind === 'dc') {
      travel(home, false); transfer(home, true, 'pickIn'); travel(inCell, true); transfer(inCell, false, 'placeIn');
    }
    if (kind === 'out' || kind === 'dc') {
      travel(outCell, false); transfer(outCell, true, 'pickOut'); travel(output, true); transfer(output, false, 'placeOut');
    }
    // A DC includes the empty A→E return, even when the ports are separated.
    if (kind === 'dc' || (returnHome && kind === 'in')) travel(home, false);
    let t = 0;
    for (const action of actions) { action.start = t; t += action.duration; action.end = t; }
    return { kind, actions, duration: t, from: { ...from }, to: pos };
  }
  function planAt(p, time) {
    const action = p.actions.find(a => time < a.end) || null;
    const zero = { p: 0, v: 0, a: 0, phase: '정지' };
    if (!action) return { x: { ...zero, p: p.to.x }, y: { ...zero, p: p.to.y }, f: zero, label: '완료', action: null };
    const local = Math.max(0, time - action.start);
    const x = { ...zero, p: action.from.x }, y = { ...zero, p: action.from.y };
    let f = { ...zero }, transfer = null, label = action.label;
    if (action.type === 'move') {
      const sx = at(action.x, local), sy = at(action.y, local);
      Object.assign(x, { p: action.from.x + sx.p * action.directionX, v: sx.v * action.directionX, a: sx.a * action.directionX, phase: sx.phase });
      Object.assign(y, { p: action.from.y + sy.p * action.directionY, v: sy.v * action.directionY, a: sy.a * action.directionY, phase: sy.phase });
    } else if (action.type === 'fork') {
      f = forkAt(action.fork, local);
      f = { ...f, p: f.p * action.side, v: f.v * action.side, a: f.a * action.side };
      const lift = at(action.fork.lift, local - action.fork.liftStart), sign = action.pick ? 1 : -1;
      Object.assign(y, { p: action.from.y + sign * lift.p, v: sign * lift.v, a: sign * lift.a, phase: lift.phase });
      const stage = local < action.fork.liftStart ? 'out' : local < action.fork.liftEnd ? 'lift' : local < action.fork.retractStart ? 'settle' : 'in';
      const stageLabel = { out: '포크 OUT', lift: '캐리지 ' + (action.pick ? 'UP' : 'DOWN') + ' ' + Number((action.fork.lift.distance * 1000).toFixed(3)) + ' mm', settle: '안착 대기', in: '포크 IN' }[stage];
      label += ' · ' + stageLabel;
      transfer = { point: action.point, pick: action.pick, stage,
        onFork: action.pick ? local >= action.fork.liftStart : local < action.fork.liftEnd };
    }
    return { x, y, f, label, action, transfer };
  }
  function sampleTimes(p) {
    const times = new Set([0, p.duration]);
    const add = t => { if (t >= 0 && t <= p.duration) { times.add(t); if (t > 0) times.add(Math.max(0, t - 1e-7)); } };
    for (const action of p.actions) {
      add(action.start); add(action.end);
      if (action.type === 'move') for (const profile of [action.x, action.y]) {
        profile.phases.forEach(ph => add(action.start + ph.start)); add(action.start + profile.duration);
      }
      if (action.type === 'fork') {
        for (const offset of [0, action.fork.retractStart]) {
          action.fork.profile.phases.forEach(ph => add(action.start + offset + ph.start));
          add(action.start + offset + action.fork.profile.duration);
        }
        action.fork.lift.phases.forEach(ph => add(action.start + action.fork.liftStart + ph.start));
        add(action.start + action.fork.liftEnd);
      }
    }
    for (let i = 0; i <= 360; i++) times.add(p.duration * i / 360);
    return [...times].sort((a, b) => a - b);
  }
  return { VERSION, port, axis, at, move, fork, forkAt, plan, planAt, sampleTimes };
});
