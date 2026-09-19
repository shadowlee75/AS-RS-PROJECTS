const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const M = require('../src/motion'), Model = require('../src/model'), Company = require('../src/company'), Engine = require('../src/engine'), Report = require('../src/report');
const source = fs.readFileSync(path.join(__dirname, 'fixtures/company-inquiry.fe2'), 'utf8');
const config = () => Company.parse(source);
const rounded = n => Number(n.toFixed(1));
const near = (a, b, tol = 1e-8) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const changeLine = (i, v) => { const a = source.split(/\r?\n/); a[i] = String(v); return a.join('\n'); };

test('company: supplied input reproduces all four independently observed result display values', () => {
  const c = config(), r = Model.calculate(c);
  assert.deepEqual([r.sc, r.dc, r.available, 7200 / r.dc * r.factor].map(rounded), [86.3, 143.5, 35.5, 42.7]);
  assert.equal(r.cells, 2968); assert.equal(rounded(M.fork(c).duration), 15.7);
  assert.deepEqual(r.fem.inbound.map(p => [Number(p.x.toFixed(2)), Number(p.y.toFixed(2))]), [[20.70, 13.78], [68.99, 4.13]]);
  assert.equal(c.Ew, .85); assert.equal(c.ioX, -1.195); assert.equal(c.outX, -1.195);
  assert.equal(c.vy * 60, 50); assert.equal(c.vf * 60, 60);
  near(c.vx / c.ax, 6); near(c.vy / c.ay, 3); near(c.vf / c.af, 3);
});
test('company: independently observed movement table, fork lift and allowances', () => {
  const c = config(), r = Model.calculate(c), [p1, p2] = r.fem.inbound;
  const table = [M.move(c,r.ports.in,p1,true), M.move(c,r.ports.in,p2,true), M.move(c,p1,p2,false)];
  assert.deepEqual(table.map(m => [rounded(m.x.duration), rounded(m.y.duration)]), [[17,21.8],[33.1,10.3],[25.8,16.9]]);
  near(M.fork(c).lift.duration, 1.8);
  const noMargin = Model.calculate({...c,moveAllowance:0,forkDwell:0});
  near(r.sc-noMargin.sc,6); near(r.dc-noMargin.dc,10.5);
});
test('company: separate executable runs with zero approach/margins and equal fork speeds', () => {
  const c = {...config(), approachX:0, approachY:0, approachF:0, moveAllowance:0, forkDwell:0};
  let r = Model.calculate(c);
  assert.deepEqual([r.sc,r.dc,r.available,7200/r.dc*r.factor,M.fork(c).duration].map(rounded),[73.4,120.2,41.7,50.9,12.5]);
  c.lowVf = c.vf; r = Model.calculate(c);
  assert.deepEqual([r.sc,r.dc,r.available,7200/r.dc*r.factor,M.fork(c).duration].map(rounded),[68.4,110.3,44.7,55.5,10]);
});
test('company: legacy projects retain their original calculations and new settings round trip', () => {
  const previous = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/company-previous-project.json'),'utf8'));
  const c = Model.unpack(previous), r = Model.calculate(c);
  assert.equal(c.motionModel,'stop'); near(r.sc,62.90910104885168); near(r.dc,100.27736876437002);
  const imported = config(); assert.deepEqual(Model.unpack(Model.pack(imported)), imported);
  assert.deepEqual(Company.parse(source,{inbound:12,outbound:17,peak:1.4,targetUtil:.7}).inbound,12);
});
test('company: malformed and unsupported files are rejected instead of partially converted', () => {
  for(const text of [source+'extra\n',changeLine(69,''),changeLine(81,'NaN'),changeLine(69,0),changeLine(77,0),changeLine(86,2),changeLine(84,2),changeLine(85,1),changeLine(3,1),changeLine(10,1700),changeLine(71,100),changeLine(74,90),changeLine(67,2),changeLine(70,200),changeLine(81,101),changeLine(83,-1)]) assert.throws(()=>Company.parse(text));
  assert.deepEqual(Company.parse('\uFEFF'+source.replace(/\r\n/g,'\n')),config());
});
test('creep: zero and low-only travel, triangular/trapezoidal boundaries, and positive monotone profiles', () => {
  near(M.creepAxis(0,3,.5,.5,1/12,.2,1.5).duration,0);
  near(M.creepAxis(.1,3,.5,.5,1/12,.2,1.5).duration,1.2);
  const rand = Model.rng(985133);
  for(let i=0;i<200;i++) {
    const distance=.5+rand()*150, v=.3+rand()*3, a=.2+rand(), low=v*(.05+.3*rand()), d=.01+rand()*.1;
    const p=M.creepAxis(distance,v,a,a,low,d,1.5);
    let last=0;
    for(let j=0;j<=100;j++) {
      const s=M.at(p,p.duration*j/100); assert.ok(s.p>=last-1e-8 && s.p<=distance+1e-8); assert.ok(Number.isFinite(s.v)); last=s.p;
    }
    near(last,distance);
    for(const phase of p.phases) assert.ok(phase.duration>=0);
    const critical=v*v/a-low*low/(2*a)+d;
    near(M.creepAxis(critical-1e-7,v,a,a,low,d,1.5).duration,M.creepAxis(critical+1e-7,v,a,a,low,d,1.5).duration,1e-5);
  }
  const tiny=M.creepAxis(.2000001,3,.5,.5,1/12,.2,1.5); assert.equal(tiny.approximate,true); near(M.at(tiny,tiny.duration).p,.2000001);
  assert.throws(()=>M.creepAxis(1,1,.5,.5,2,.2));
});
test('company: complete DC motion remains continuous, bounded and agrees with analysis', () => {
  const c=config(),r=Model.calculate(c),p=M.plan(c,'dc',r.ports.in,...r.fem.inbound,true);
  near(p.duration,r.dc);
  for(const t of M.sampleTimes(p)) {
    const s=M.planAt(p,t); for(const axis of [s.x,s.y,s.f]) for(const k of ['p','v','a']) assert.ok(Number.isFinite(axis[k]));
  }
  for(let i=1;i<p.actions.length;i++) {
    const previous=M.planAt(p,p.actions[i].start-1e-8),next=M.planAt(p,p.actions[i].start);
    near(previous.x.p,next.x.p,1e-6);near(previous.y.p,next.y.p,1e-6);
  }
  const text=Report.markdown(r,null); assert.ok(text.includes('저속 접근 모드')); assert.ok(text.includes('35.458')); assert.ok(text.includes('42.6568'));
});
test('company: simulator can complete a run with the new motion model', () => {
  const c={...config(),hours:.1,warmup:0,inbound:20,outbound:20,mode:'mixed',dcRatio:50};
  const f=new Engine.Fleet(c); f.advanceTo(f.horizon);
  const s=f.snapshot(); assert.ok(Number.isFinite(s.throughput)); assert.ok(f.logs.length>0);
  for(const job of f.logs) assert.ok(job.end>=job.start && Number.isFinite(job.end));
});
