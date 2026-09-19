// Read-only comparison. Does not change application inputs or calculation code.
// Fix common physical inputs and representative points to isolate the algorithms.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const M = require('../../src/motion'), Model = require('../../src/model');
const root = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(path.join(root, '참고 및 검증 자료/INQUIRY_인도'), 'utf8').trimEnd().split(/\r?\n/);
const n = i => Number(source[i]);
const saved = Model.unpack(JSON.parse(fs.readFileSync(path.join(root, '참고 및 검증 자료/스태커크레인 설계 검토_프로젝트.json'), 'utf8')));
const original = Model.calculate(saved);
const levels = source.slice(9, 60).map(Number).filter(x => x > 0);
assert.equal(n(86), 1); assert.equal(n(84), 1);
assert.equal(n(71), n(72)); assert.equal(n(74), n(75));
assert.ok(levels.every(h => h === levels[0]));
const c = {...saved, length: (n(2)-1)*n(5)/1000, height: (levels.length-1)*levels[0]/1000,
  bays: n(2)*n(66), levels: levels.length, firstLevelHeight:0, levelPitch:levels[0]/1000,
  ioX:-n(8)/1000, ioY:0, outX:-n(8)/1000, outY:0, ports:[],routes:[],
  vx:n(69)/60, vy:n(72)/60, vf:n(75)/60,
  stroke:n(60)/1000, transferLift:n(61)/1000,
  position:n(82), forkDwell:n(83), control:0, loadedFactor:1};
c.ax=c.dx=c.vx/n(77); c.ay=c.dy=c.vy/n(78); c.af=c.df=c.vf/n(79);
const low = {x:n(70)/60, y:n(73)/60, f:n(76)/60};
const approach = {x:n(62)/1000, y:n(63)/1000, f:n(64)/1000};
const p1 = {x:c.length/5,y:2*c.height/3,z:-c.stroke,side:-1};
const p2 = {x:2*c.length/3,y:c.height/5,z:-c.stroke,side:-1};
const home = M.port(c,'in'), efficiency=n(81)/100;

// Independent transcription of the company axis-time equations, previously
// verified against the supplied executable and three displayed test cases.
function companyAxis(d,v,u,a,s,w=0) {
  if(d===0)return 0;
  if(d<=s)return d/u;
  const critical=v*v/a+s-u*u/(2*a);
  return (d>critical ? (2*v-u)/a+s/u+(d-critical)/v : 2*Math.sqrt((d-s+u*u/(2*a))/a)+s/u-u/a)+w;
}
const alignRow = (name,from,to) => {
  const distances={x:Math.abs(to.x-from.x),y:Math.abs(to.y-from.y)};
  const oldAxis = {}, company = {}, difference = {};
  for(const k of ['x','y']) {
    const v=c['v'+k], a=c['a'+k], d=distances[k];
    oldAxis[k]=M.axis(d,v,a,a).duration+(d>0?n(82):0);
    company[k]=companyAxis(d,v,low[k],a,approach[k],n(82));
    difference[k]=company[k]-oldAxis[k];
  }
  return {name,distances,originalAxisWithSameAllowance:oldAxis,companyAxis:company,
    axisDifference:difference,originalSimultaneous:Math.max(oldAxis.x,oldAxis.y),companySimultaneous:Math.max(company.x,company.y)};
};
const movement=[alignRow('Home-P1',home,p1),alignRow('Home-P2',home,p2),alignRow('P1-P2',p1,p2)];
const oldFork=M.fork(c);
const companyForkOneWay=companyAxis(c.stroke,c.vf,low.f,c.af,approach.f,0);
const companyLift=c.transferLift/low.y;
const companyFork=2*companyForkOneWay+companyLift+c.forkDwell;
const alignedIn=[p1,p2].map(p=>M.plan(c,'in',home,p,null,true));
const alignedDC=M.plan(c,'dc',home,p1,p2,true);
const sc=alignedIn.reduce((s,p)=>s+p.duration,0)/2, dc=alignedDC.duration;
const companySc=movement[0].companySimultaneous+movement[1].companySimultaneous+2*companyFork;
const companyDc=movement.reduce((s,p)=>s+p.companySimultaneous,0)+4*companyFork;
const scMoveGap=movement.slice(0,2).reduce((s,p)=>s+p.companySimultaneous-p.originalSimultaneous,0);
const dcMoveGap=movement.reduce((s,p)=>s+p.companySimultaneous-p.originalSimultaneous,0);
const forkMotionGap=2*(companyForkOneWay-oldFork.profile.duration), liftGap=companyLift-oldFork.lift.duration;
const gaps={
  movementApproach:{sc:scMoveGap,dc:dcMoveGap},
  forkApproach:{sc:2*forkMotionGap,dc:4*forkMotionGap},
  carriageLift:{sc:2*liftGap,dc:4*liftGap},
  total:{sc:companySc-sc,dc:companyDc-dc}
};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
near(Object.values(gaps).slice(0,3).reduce((s,p)=>s+p.sc,0),gaps.total.sc);
near(Object.values(gaps).slice(0,3).reduce((s,p)=>s+p.dc,0),gaps.total.dc);
near(sc,movement.slice(0,2).reduce((s,p)=>s+p.originalSimultaneous,0)+2*oldFork.duration);
near(dc,movement.reduce((s,p)=>s+p.originalSimultaneous,0)+4*oldFork.duration);
assert.deepEqual([companySc,companyDc,3600/companySc*efficiency,7200/companyDc*efficiency].map(x=>+x.toFixed(1)),[86.3,143.5,35.5,42.7]);
const calc=(sc,dc,factor)=>({sc,dc,scIdeal:3600/sc,dcIdeal:7200/dc,scAtSameEfficiency:3600/sc*factor,dcAtSameEfficiency:7200/dc*factor});
const rawDC=M.plan(saved,'dc',original.ports.in,...original.fem.dcPairs[0],true);
const part=(plan,type)=>plan.actions.filter(a=>a.type===type).reduce((sum,a)=>sum+a.duration,0);
const rawParts={sc:original.scParts,dc:Object.fromEntries(['move','position','fork','control'].map(k=>[k,part(rawDC,k)]))};
// One change at a time in the saved project: sensitivities, not additive shares.
const variations=[['Original JSON',{}],['Travel deceleration converted from 6 s',{dx:c.dx}],
 ['Hoist high speed and acceleration time',{vy:c.vy,ay:c.ay,dy:c.dy}],
 ['Fork stroke',{stroke:c.stroke}],['Fork high speed and acceleration time',{vf:c.vf,af:c.af,df:c.df}],
 ['Carriage lift distance',{transferLift:c.transferLift}],['Allowance convention',{position:c.position,forkDwell:c.forkDwell,control:0}],
 ['All common motion specifications',{vx:c.vx,ax:c.ax,dx:c.dx,vy:c.vy,ay:c.ay,dy:c.dy,vf:c.vf,af:c.af,df:c.df,stroke:c.stroke,transferLift:c.transferLift,position:c.position,forkDwell:c.forkDwell,control:0}]]
 .map(([name,patch])=>{const r=Model.calculate({...saved,...patch});return{name,sc:r.sc,dc:r.dc,deltaSc:r.sc-original.sc,deltaDc:r.dc-original.dc};});
const output={scope:'Restored v0.3.2. Comparison only: original motion kernel with identical physical specifications and fixed company representative points. No app code changes.',
  original:calc(original.sc,original.dc,efficiency),originalParts:rawParts,
  alignedOriginal:calc(sc,dc,efficiency),company:calc(companySc,companyDc,efficiency),efficiency,
  alignedInputs:c,representativePoints:{p1,p2,home},movement,
  fork:{originalOneWay:oldFork.profile.duration,companyOneWay:companyForkOneWay,
    originalLift:oldFork.lift.duration,companyLift,commonAllowance:c.forkDwell,originalTotal:oldFork.duration,companyTotal:companyFork},
  timeGapDecomposition:gaps,oneAtATimeSensitivities:variations,
  note:'The app cannot express the company continuous representative points plus exterior common port in its old UI. Fixed points here are passed directly to its unchanged motion kernel solely to isolate time equations. Sensitivities depend on the starting conditions and must not be summed.'};
fs.writeFileSync(path.join(__dirname,'comparison.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({original:output.original,aligned:output.alignedOriginal,company:output.company,movement,fork:output.fork,gaps,variations},null,2));
