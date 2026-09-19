const assert = require('node:assert/strict');
module.exports = function ({ Model, E, S }, test) {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
  const history = (preset = 'single') => { const c = Model.preset(preset); c.warmup = 0; c.hours = .25; c.demandMode = 'history'; c.history = [{ time: 0, from: 'S1', to: 'S2', quantity: 1 }]; return c; };
  test('3D 레이아웃은 실제 X 좌표·물리적 분리 구간을 유지', () => {
    const c = Model.preset('tandem'), d = S.layout(c);
    assert.equal(d.lanes.length, 2); assert.equal(d.buffers.length, 2);
    close(d.lanes[0].end, c.sections[0].end); close(d.ports[1].x, c.stations[1].x);
    assert.ok(d.lanes[1].z > d.lanes[0].z && d.buffers[0].z > d.lanes[0].z && d.buffers[0].z < d.lanes[1].z);
  });
  test('3D 차량 위치·적재 상태는 실제 엔진과 일치', () => {
    const c = history(), e = new E.Engine(c), d = S.layout(c);
    for (let t = 0; t < 100; t += .7) { e.advanceTo(t); const s = S.frameState(e, d); close(s.cars[0].x, e.pose(e.cars[0]).x); assert.equal(s.cars[0].loaded, e.cars[0].loaded); }
  });
  test('상차 화물은 상차시간 동안 스테이션에서 차량으로 이동', () => {
    const c = history(), e = new E.Engine(c), d = S.layout(c); e.advanceTo(c.control + c.stations[0].load / 2);
    const pose = S.frameState(e, d).cars[0]; assert.equal(pose.state, 'load'); assert.equal(pose.quantity, 1);
    close(pose.cargo.z, (d.ports[0].z + d.lanes[0].z) / 2); assert.equal(e.cars[0].loaded, false);
  });
  test('Tandem 상차 중 화물은 버퍼와 차량에 중복 표시하지 않음', () => {
    const c = history('tandem'), e = new E.Engine(c), d = S.layout(c); let observed = false;
    for (let t = 0; t <= 200; t += .25) { e.advanceTo(t); const car = e.cars[1]; if (car.state !== 'load' || car.leg.from.kind !== 'handoff') continue;
      const s = S.frameState(e, d), b = s.stocks.find(b => b.kind === 'handoff' && b.id === car.leg.from.id);
      assert.equal(b.count, 1); assert.equal(b.visualCount, 0); assert.equal(s.cars[1].cargo.quantity, 1); observed = true; break;
    } assert.ok(observed);
  });
  test('차단 차량은 적재 상태 유지·버퍼 숫자는 실제 수량', () => {
    const c = Model.preset('blocked'), e = E.run(c), s = S.frameState(e, S.layout(c));
    const blocked = s.cars.find(c => c.state === 'blocked'); assert.ok(blocked && blocked.loaded && blocked.cargo);
    for (const b of s.stocks) assert.ok(b.count + b.reserved <= b.capacity && b.visualCount <= b.count);
  });
  test('3D 프레임 생성은 시드·엔진·완료 결과에 영향을 주지 않음', () => {
    const c = Model.preset('bidirectional'), a = E.run(c), b = new E.Engine(c), d = S.layout(c);
    for (let t = 0; t < b.horizon; t += 17) { b.advanceTo(t); S.frameState(b, d); } b.advanceTo(b.horizon);
    assert.equal(JSON.stringify(a.logs), JSON.stringify(b.logs)); assert.ok(b.snapshot().conserved);
  });
  test('스테이션 ID와 인계 ID가 같아도 3D 재고를 구분', () => {
    const c = history('tandem'); c.stations[0].id = 'H0R'; c.ods[0].from = 'H0R'; c.history[0].from = 'H0R';
    const e = new E.Engine(c), s = S.frameState(e, S.layout(c));
    const stocks = s.stocks.filter(s => s.id === 'H0R'); assert.equal(stocks.length, 2); assert.ok(stocks.some(s => s.kind === 'station')); assert.ok(stocks.some(s => s.kind === 'handoff'));
  });
};
