const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../src/model.js');
const M = require('../src/motion.js');
const E = require('../src/engine.js');
const R = require('../src/report.js');
const cfg = more => ({ ...Model.defaults, length: 8, height: 4, bays: 4, levels: 2, hours: .2, warmup: 0, rackDepth: 'double', rearStroke: 2.8, ...more });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('depth: legacy migration, exact capacity, unique coordinates/addresses and JSON round trip', () => {
  const old = { ...Model.defaults }; delete old.rackDepth; delete old.rearStroke;
  const migrated = Model.validate(old);
  assert.equal(migrated.rackDepth, 'single');
  const single = Model.cells(migrated), double = Model.cells({ ...migrated, rackDepth: 'double' });
  assert.equal(double.length, single.length * 2);
  assert.equal(new Set(double.map(cell => Model.address(cell))).size, double.length);
  for (let i = 0; i < single.length; i++) {
    near(double[2*i].z, single[i].z); near(double[2*i+1].z, single[i].z * 2);
    near(double[2*i+1].x, single[i].x); near(double[2*i+1].y, single[i].y);
    assert.match(Model.address(double[2*i+1]), /-D2$/);
  }
  assert.deepEqual(Model.unpack(Model.pack(cfg())), Model.validate(cfg()));
});

test('depth: invalid type, rear reach, limits and deepest port reach', () => {
  for (const rackDepth of ['triple', 2, null]) assert.throws(() => Model.validate(cfg({rackDepth})));
  for (const rearStroke of [0, 1.2, -1, NaN, Infinity, 21]) assert.throws(() => Model.validate(cfg({rearStroke})));
  assert.equal(Model.depthStroke(Model.validate(cfg({rearStroke:null})), 2), 2.4);
  assert.equal(Model.validate(cfg({ioZ:2.5})).ioZ, 2.5);
  assert.throws(() => Model.validate(cfg({ioZ:3})), /스트로크/);
  assert.throws(() => Model.validate(cfg({bays:80, levels:30, sides:2, cranes:13})), /120,000/);
  assert.equal(Model.validate(cfg({rackDepth:'single', rearStroke:.5})).rackDepth, 'single');
});

test('depth: SC/DC increments independently match rear fork round-trip time; storage is doubled, throughput is not', () => {
  for (const method of ['cells', 'fem']) for (const pointMode of ['cell', 'theory']) for (let femCase=1; femCase<=6; femCase++) {
    const c = cfg({method, pointMode, femCase}); Object.assign(c, Model.casePorts(c));
    const s = Model.calculate({...c,rackDepth:'single'}), d = Model.calculate(c);
    const extra = M.fork(c,c.rearStroke).duration - M.fork(c,c.stroke).duration;
    near(d.scIn - s.scIn, extra / 2); near(d.scOut - s.scOut, extra / 2); near(d.dc - s.dc, extra);
    assert.equal(d.cells, s.cells*2); assert.ok(d.theory < s.theory);
    assert.match(d.reference, /더블딥/);
  }
});

test('depth: uniform analysis agrees with enumeration of distinct accessible lanes', () => {
  const c=cfg({bays:2,levels:1,sides:1,ioZ:-.8,outZ:1,loadedFactor:.8}), rack=Model.cells(c), result=Model.calculate(c);
  const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
  near(result.scIn,mean(rack.map(a=>M.plan(c,'in',M.port(c,'in'),a,null,true).duration)));
  near(result.dc,mean(rack.flatMap(a=>rack.filter(b=>!Model.sameLane(a,b)).map(b=>M.plan(c,'dc',M.port(c,'in'),a,b,true).duration))));
  const one=Model.calculate(cfg({bays:1,levels:1,sides:1}));
  assert.equal(one.cells,2); assert.equal(one.dc,null); assert.equal(one.p,0);
});

test('depth: rear motion reaches actual D2 center on either side', () => {
  const c=cfg();
  for (const cell of Model.cells(c).filter(cell=>cell.depth===2)) {
    const plan=M.plan(c,'in',M.port(c,'in'),cell,null,true), action=plan.actions.find(a=>a.effect==='placeIn');
    near(action.fork.profile.distance,c.rearStroke);
    near(M.planAt(plan,action.start+action.fork.liftStart).f.p,cell.z);
    near(M.planAt(plan,action.start+action.fork.liftEnd).y.p,cell.y);
  }
});

test('depth: rear-first storage and accessible FIFO prevent travel through an occupied front cell', () => {
  const e=new E.Engine(cfg({bays:1,levels:1,sides:1,inbound:0,outbound:0,initialFill:0}));
  assert.equal(e.chooseCell('empty','nearest',e.position,()=>0).depth,2);
  e.rack[1].state='occupied'; e.rack[1].storedAt=-10;
  assert.equal(e.chooseCell('empty','nearest',e.position,()=>0).depth,1);
  e.rack[0].state='occupied'; e.rack[0].storedAt=0;
  assert.equal(e.chooseCell('occupied','fifo',e.position,()=>0).depth,1);
  e.rack[0].state='empty';
  assert.equal(e.chooseCell('occupied','fifo',e.position,()=>0).depth,2);
  assert.equal(e.chooseCell('occupied','fifo',e.position,()=>0,e.rack[0]),null);
});

test('depth: all modes conserve inventory/jobs and maintain legal access at every event', () => {
  for (const mode of ['sc-return','sc-stay','dc','mixed']) for (const initialFill of [0,.4,1]) for (const storage of ['random','nearest']) {
    const c=cfg({mode,initialFill,storage,inbound:1200,outbound:1200,jitter:0,seed:76,takeaway:4});
    const e=new E.Engine(c);
    while(e.heap.peek() && e.heap.peek().time <= e.horizon) {
      e.advanceTo(e.heap.peek().time);
      const s=e.snapshot(); assert.ok(s.conservation); assert.ok(s.jobsConserved);
      const active=e.active;
      if(active?.point?.depth===2) assert.equal(e.rack[active.point.id-1].state,'empty');
      if(e.cycle?.kind==='dc') assert.ok(!Model.sameLane(e.cycle.inCell,e.cycle.outCell));
      for(let id=0;id<e.rack.length;id+=2) if(e.rack[id].state==='occupied') assert.notEqual(e.rack[id+1].state,'empty');
    }
    assert.ok(e.completed.in+e.completed.out>0);
  }
});

test('depth: input-only fills every slot; output-only drains front then rear', () => {
  for (const mode of ['dc','mixed']) for (const kind of ['in','out']) {
    const e=new E.Engine(cfg({mode,bays:1,levels:1,sides:1,initialFill:kind==='in'?0:1,inbound:kind==='in'?200:0,outbound:kind==='out'?200:0,hours:1}));
    e.advanceTo(e.horizon); assert.equal(e.completed[kind],2); assert.ok(e.snapshot().conservation);
    assert.deepEqual(e.logs.map(j=>j.cell.depth),kind==='in'?[2,1]:[1,2]);
  }
});

test('depth: fleet mixed CASEs retain depth in report, logs, and deterministic replay', () => {
  const c=cfg({cranes:2,mode:'mixed',method:'fem',ports:[{femCase:2},{femCase:5}],inbound:400,outbound:400});
  const a=new E.Fleet(c),b=new E.Fleet(c); a.advanceTo(a.horizon);
  for(let time=0;time<b.horizon;time+=.7) b.advanceTo(time); b.advanceTo(b.horizon);
  assert.deepEqual(a.logs,b.logs); assert.ok(a.snapshot().conservation); assert.ok(a.snapshot().jobsConserved);
  assert.ok(a.logs.every(j=>/-D[12]$/.test(j.address)));
  const md=R.markdown(Model.calculate(c),a.snapshot());
  for(const text of ['더블딥','2.8','재배치','뒷열']) assert.ok(md.includes(text));
});
