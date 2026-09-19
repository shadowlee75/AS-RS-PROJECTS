(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./motion'):root.AgvMotion,typeof module==='object'&&module.exports?require('./model'):root.AgvModel);if(typeof module==='object'&&module.exports)module.exports=api;root.AgvEngine=api;})(globalThis,function(M,Model){
'use strict';
const EPS=1e-8,STATES={idle:'유휴',empty:'공차주행',loaded:'적재주행',pickup:'픽업',dropoff:'하역',control:'제어',traffic:'교통대기',blocked:'버퍼차단',returning:'주차복귀',toCharge:'충전기 이동',dock:'충전 도킹',charging:'충전',undock:'충전 이탈',chargeWait:'충전대기',stopped:'계획정지',failed:'운행불가'};
class Heap{constructor(){this.a=[];this.seq=0;}less(a,b){return a.time<b.time||(a.time===b.time&&(a.priority<b.priority||(a.priority===b.priority&&a.seq<b.seq)));}push(time,type,data={},priority=5){const x={time,type,data,priority,seq:this.seq++};this.a.push(x);let i=this.a.length-1;while(i>0){const p=(i-1)>>1;if(!this.less(x,this.a[p]))break;this.a[i]=this.a[p];i=p;}this.a[i]=x;}pop(){const top=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(true){let c=i*2+1;if(c>=this.a.length)break;if(c+1<this.a.length&&this.less(this.a[c+1],this.a[c]))c++;if(!this.less(this.a[c],last))break;this.a[i]=this.a[c];i=c;}this.a[i]=last;}return top;}peek(){return this.a[0];}}
function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function demands(p){
  if(p.demandMode==='history')return p.history.filter(h=>h.release<p.horizon).map(h=>({...h,completed:null,assigned:null,vehicle:null})).sort((a,b)=>a.release-b.release||String(a.id).localeCompare(String(b.id)));
  const rng=random(p.seed),tasks=[],cuts=[0,...p.profiles.flatMap(x=>[x.start,x.end]),p.horizon].filter((x,i,a)=>a.indexOf(x)===i).sort((a,b)=>a-b);let id=0;
  for(const o of p.od){let next=p.arrival==='periodic'?.5:-Math.log(Math.max(1e-12,1-rng()));let cumulative=0;
    for(let i=0;i<cuts.length-1;i++){const start=cuts[i],end=cuts[i+1],profile=p.profiles.find(x=>start>=x.start&&start<x.end),lambda=o.rate/o.qty*p.demandFactor*(profile?.multiplier??1)/3600,volume=(end-start)*lambda;
      if(lambda>0)while(next<cumulative+volume-EPS){const release=start+(next-cumulative)/lambda;tasks.push({id:'J'+(++id),from:o.from,to:o.to,qty:o.qty,weight:o.weight,priority:o.priority,due:release+o.due,release,odId:o.id,completed:null,assigned:null,vehicle:null});if(tasks.length>50000)throw Error('요청 50,000건 초과');next+=p.arrival==='periodic'?1:-Math.log(Math.max(1e-12,1-rng()));}
      cumulative+=volume;
    }
  }
  return tasks.sort((a,b)=>a.release-b.release||a.id.localeCompare(b.id));
}
function percentile(values,q){if(!values.length)return null;const a=[...values].sort((x,y)=>x-y),k=(a.length-1)*q,i=Math.floor(k);return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(k-i);}
class Simulation{
  constructor(config){
    const v=Model.validate(config);if(v.errors.length)throw Error(v.errors.join('\n'));this.p=Model.clone(config);this.g=Model.graph(this.p);this.time=0;this.queue=new Heap();this.events=[];this.tasks=demands(this.p);this.pending=[];this.failures=[];this.reservations=[];this.stationBuffers=new Map();this.owners=new Map();this.closed=new Set();this.snapshots=[];this.count=0;this.done=false;this.routeCache=new Map();this.lastProgress=0;
    this.radius=Math.hypot(Math.max(this.p.vehicle.length,this.p.vehicle.cargoLength),Math.max(this.p.vehicle.width,this.p.vehicle.cargoWidth))/2+this.p.vehicle.clearance;
    const homes=this.p.nodes.filter(n=>n.type==='parking'&&n.enabled).slice(0,this.p.fleet);
    this.vehicles=homes.map((home,i)=>({id:'V'+(i+1),number:i+1,home:home.id,node:home.id,heading:0,stage:'idle',job:null,loaded:false,energy:this.p.battery.capacity*this.p.battery.initial,stateStart:0,state:'idle',motion:null,timeline:[],token:0,chargeVisits:0,distance:{empty:0,loaded:0,returning:0,toCharge:0},consumed:0,charged:0,reason:'대기',waitSince:0}));
    for(const x of this.vehicles)this.owners.set(x.node,x.id);
    for(const n of this.p.nodes.filter(n=>n.type==='station'))this.stationBuffers.set(n.id,{items:[],reserved:0,processing:0,occupancy:[],changes:[{time:0,qty:0}],completed:0});
    this.tasks.forEach((t,i)=>this.queue.push(t.release,'release',{index:i},2));
    for(const c of this.p.closures){this.queue.push(c.start,'closure',{c,active:true},1);this.queue.push(c.end,'closure',{c,active:false},1);}
    for(const s of this.p.stops){this.queue.push(s.start,'wake',{},3);this.queue.push(s.end,'wake',{},3);}
    for(let t=0;t<=this.p.horizon;t+=30)this.queue.push(t,'sample',{},9);
    this.queue.push(this.p.horizon,'end',{},10);this.armEnergy();
  }
  log(type,v,detail,taskId=null){this.events.push({time:this.time,type,vehicle:v?.id||'',node:v?.node||'',taskId:taskId||v?.job?.id||'',detail});}
  power(v){const b=this.p.battery;if(!b.enabled)return 0;if(v.state==='charging')return -b.chargePower*(v.energy/b.capacity>=.8-EPS?b.taper:1);if(v.state==='loaded')return b.loadedPower;if(['empty','returning','toCharge'].includes(v.state))return b.emptyPower;if(['pickup','dropoff','control','dock','undock'].includes(v.state))return b.handlingPower;return b.idlePower;}
  energyAt(v,t=this.time){return this.p.battery.enabled?Math.max(0,Math.min(this.p.battery.capacity,v.energy-this.power(v)*(t-v.stateStart)/3600)):v.energy;}
  closeState(v){
    const energy=this.energyAt(v),dt=this.time-v.stateStart,power=this.power(v);
    if(dt>EPS){v.timeline.push({start:v.stateStart,end:this.time,state:v.state,reason:v.reason,node:v.node,position:v.staticPosition||null,heading:v.heading,loaded:v.loaded,taskId:v.job?.id||null,energyStart:v.energy,energyEnd:energy,power,motion:v.motion});if(power>=0)v.consumed+=v.energy-energy;else v.charged+=energy-v.energy;}
    v.energy=energy;v.stateStart=this.time;
  }
  setState(v,state,reason=STATES[state],motion=null){
    if(v.state===state&&v.reason===reason&&!motion&&!v.motion)return;
    this.closeState(v);v.state=state;v.reason=reason;v.motion=motion;v.token++;
    if(['traffic','blocked','chargeWait'].includes(state)){if(!['traffic','blocked','chargeWait'].includes(v.previousState))v.waitSince=this.time;}else v.waitSince=this.time;
    v.previousState=state;this.log(state,v,reason);
    const pow=this.power(v);if(pow>0&&v.energy>0)this.queue.push(this.time+v.energy*3600/pow,'depleted',{id:v.id,token:v.token},0);
    if(state==='idle'&&this.p.battery.enabled&&v.energy/this.p.battery.capacity>this.p.battery.trigger&&pow>0)this.queue.push(this.time+(v.energy-this.p.battery.capacity*this.p.battery.trigger)*3600/pow,'wake',{},3);
  }
  armEnergy(){for(const v of this.vehicles){const power=this.power(v);if(power>0){this.queue.push(this.time+v.energy*3600/power,'depleted',{id:v.id,token:v.token},0);const delay=(v.energy-this.p.battery.capacity*this.p.battery.trigger)*3600/power;if(delay>0)this.queue.push(this.time+delay,'wake',{},3);}}}
  route(from,to,loaded=false,heading=0,banned=new Set()){
    const key=JSON.stringify([from,to,loaded,Math.round(heading*1e6),[...banned].sort()]);if(!this.routeCache.has(key)){if(this.routeCache.size>4000)this.routeCache.clear();this.routeCache.set(key,Model.route(this.p,this.g,from,to,loaded,heading,banned));}return this.routeCache.get(key);
  }
  activeClosed(){return new Set(this.p.closures.filter(c=>this.time>=c.start&&this.time<c.end).map(c=>c.pathId));}
  conflicts(route,v){
    const points=route.points,gap=this.radius*2;
    for(const o of this.vehicles){if(o===v)continue;if(o.motion){for(let i=1;i<points.length;i++)for(let j=1;j<o.motion.points.length;j++)if(M.segmentDistance(points[i-1],points[i],o.motion.points[j-1],o.motion.points[j])<gap-EPS)return {vehicle:o,reason:'경로 예약 '+o.id};}
      else {const node=o.staticPosition||this.g.nodes.get(o.node);for(let i=1;i<points.length;i++)if(M.pointSegment(node,points[i-1],points[i])<gap-EPS)return {vehicle:o,reason:'정지 외곽 '+o.id};}}
    return null;
  }
  blockedEdges(v){const banned=this.activeClosed(),gap=this.radius*2;for(const e of this.p.paths){const a=this.g.nodes.get(e.from),b=this.g.nodes.get(e.to);for(const other of this.vehicles){if(other===v)continue;let conflict=false;if(other.motion){for(let j=1;j<other.motion.points.length;j++)if(M.segmentDistance(a,b,other.motion.points[j-1],other.motion.points[j])<gap-EPS){conflict=true;break;}}else conflict=M.pointSegment(this.g.nodes.get(other.node),a,b)<gap-EPS;if(conflict){banned.add(e.id);break;}}}return banned;}
  move(v,target,state){
    if(v.node===target){this.arrive(v);this.advance(v);return true;}
    if(this.owners.has(target)&&this.owners.get(target)!==v.id){v.waitFor=this.owners.get(target);this.setState(v,state==='toCharge'?'chargeWait':'traffic',target+' 점유 '+v.waitFor);return false;}
    const closed=this.activeClosed();let r=this.route(v.node,target,v.loaded,v.heading,this.p.routing==='dynamic'?closed:new Set()),conflict=r?this.conflicts(r,v):null;
    if(r&&this.p.routing==='dynamic'&&conflict){const alt=this.route(v.node,target,v.loaded,v.heading,this.blockedEdges(v));if(alt&&!this.conflicts(alt,v)){r=alt;conflict=null;}}
    if(!r||r.phases.some(x=>closed.has(x.edgeId))){v.waitFor=null;this.setState(v,state==='toCharge'?'chargeWait':'traffic','통로 폐쇄 · '+target+' 진입 대기');return false;}
    if(conflict){v.waitFor=conflict.vehicle.id;this.setState(v,state==='toCharge'?'chargeWait':'traffic',conflict.reason);return false;}
    const power=v.loaded?this.p.battery.loadedPower:this.p.battery.emptyPower;
    if(this.p.battery.enabled&&this.energyAt(v)<r.duration*power/3600+EPS){this.fail(v,'다음 경로 주행 에너지 부족');return false;}
    v.waitFor=null;this.setState(v,state,target+' 이동',r);this.owners.delete(v.node);this.owners.set(target,v.id);v.target=target;
    v.distance[state]=(v.distance[state]||0)+r.distance;
    const reserved={vehicle:v.id,start:this.time,end:this.time+r.duration,points:r.points.map(n=>({x:n.x,y:n.y})),target,from:v.node};this.reservations.push(reserved);
    this.queue.push(this.time+r.duration,'arrive',{id:v.id,token:v.token},0);return true;
  }
  arrive(v){
    if(v.motion){const heading=v.motion.heading,target=v.target;this.setState(v,'idle','경로 도착');v.node=target;v.heading=heading;v.motion=null;this.lastProgress=this.time;}
    if(v.stage==='toPickup')v.stage='pickup';else if(v.stage==='toDrop')v.stage='dropoff';else if(v.stage==='returnHome'){v.stage='idle';this.setState(v,'idle','주차 베이 대기');}else if(v.stage==='toCharger')v.stage='dock';
  }
  startService(v,state,duration,next){this.setState(v,state);this.queue.push(this.time+duration,'service',{id:v.id,token:v.token,next},0);}
  charger(v){const list=this.p.nodes.filter(n=>n.type==='charger'&&n.enabled).map(n=>{const r=this.route(v.node,n.id,false,v.heading);const owner=this.vehicles.find(x=>x.id===this.owners.get(n.id));let delay=0;if(owner){const b=this.p.battery;delay=(b.target*b.capacity-this.energyAt(owner))*3600/(b.chargePower*b.taper)+b.undock+30;}return {n,r,cost:(r?.duration??Infinity)+Math.max(0,delay)};}).filter(x=>x.r).sort((a,b)=>a.cost-b.cost||a.n.id.localeCompare(b.n.id));return list[0]||null;}
  charge(v){const c=this.charger(v);if(!c){this.fail(v,'충전기 도달 경로 없음');return;}v.chargeTarget=c.n.id;v.stage='toCharger';this.advance(v);}
  enoughFor(v,job){if(!this.p.battery.enabled)return true;const b=this.p.battery,r1=this.route(v.node,job.from,false,v.heading),r2=this.route(job.from,job.to,true,r1?.heading||0),r3=this.route(job.to,v.home,false,r2?.heading||0);if(!r1||!r2||!r3)return false;
    const chargers=this.p.nodes.filter(n=>n.type==='charger'&&n.enabled),times=chargers.map(c=>this.route(v.home,c.id,false,r3.heading)?.duration??Infinity),tCharge=Math.min(...times),handling=this.g.nodes.get(job.from).pickup+this.g.nodes.get(job.to).dropoff+this.p.vehicle.control;
    const need=((r1.duration+r3.duration+tCharge)*b.emptyPower+r2.duration*b.loadedPower+handling*b.handlingPower)/3600+b.reserve*b.capacity;
    if(need>b.target*b.capacity+EPS){v.energyRejected=true;return false;}return this.energyAt(v)>=need;
  }
  advance(v){
    if(v.state==='failed'||v.motion||['pickup','dropoff','control','dock','charging','undock'].includes(v.state))return;
    const p=this.p,b=p.battery;
    if(v.stage==='toPickup'){this.move(v,v.job.from,'empty');return;}
    if(v.stage==='pickup'){this.startService(v,'pickup',this.g.nodes.get(v.node).pickup,'pickupDone');return;}
    if(v.stage==='toDrop'){this.move(v,v.job.to,'loaded');return;}
    if(v.stage==='dropoff'){const node=this.g.nodes.get(v.node),buffer=this.stationBuffers.get(v.node),used=buffer.items.reduce((s,x)=>s+x.qty,0)+buffer.reserved;if(node.process>0&&used+v.job.qty>node.buffer){v.waitFor=null;this.setState(v,'blocked',node.id+' 후공정 버퍼 가득 참');return;}buffer.reserved+=v.job.qty;this.startService(v,'dropoff',node.dropoff,'dropDone');return;}
    if(v.stage==='returnHome'){this.move(v,v.home,'returning');return;}
    if(v.stage==='toCharger'){this.move(v,v.chargeTarget,'toCharge');return;}
    if(v.stage==='dock'){this.startService(v,'dock',b.dock,'dockDone');return;}
    if(v.stage==='idle'){
      const planned=p.stops.find(x=>x.vehicle===v.number&&this.time>=x.start&&this.time<x.end);if(planned){this.setState(v,'stopped','계획 정지 ~'+planned.end+' s');return;}if(v.state==='stopped')this.setState(v,'idle');
      if(b.enabled&&(this.energyAt(v)/b.capacity<=b.trigger+EPS||(b.opportunity&&this.pending.length===0&&this.energyAt(v)/b.capacity<b.target-.05))){this.charge(v);return;}
      this.setState(v,'idle','주차 베이 대기');
    }
  }
  beginCharging(v){
    const b=this.p.battery;this.closeState(v);const target=v.energy/b.capacity<.8-EPS?Math.min(.8,b.target):b.target,rate=b.chargePower*(v.energy/b.capacity>=.8-EPS?b.taper:1),duration=Math.max(0,(target*b.capacity-v.energy)*3600/rate);
    this.setState(v,'charging',v.node+' 순충전');this.queue.push(this.time+duration,'chargeDone',{id:v.id,token:v.token},0);
  }
  bufferChange(id){const b=this.stationBuffers.get(id);b.changes.push({time:this.time,qty:b.items.reduce((s,x)=>s+x.qty,0)});}
  processBuffer(id){const n=this.g.nodes.get(id),b=this.stationBuffers.get(id);while(b.processing<n.processSlots){const item=b.items.find(x=>!x.processing);if(!item)break;item.processing=true;b.processing++;b.occupancy.push({start:this.time,end:this.time+n.process*item.qty});this.queue.push(this.time+n.process*item.qty,'processed',{id,jobId:item.id},0);}}
  finishService(v,next){
    this.setState(v,'idle','동작 완료');this.lastProgress=this.time;
    if(next==='pickupDone'){v.job.pickupCompleted=this.time;v.loaded=true;v.stage='control';this.startService(v,'control',this.p.vehicle.control,'controlDone');}
    if(next==='controlDone')v.stage='toDrop';
    if(next==='dropDone'){
      const j=v.job,b=this.stationBuffers.get(v.node),n=this.g.nodes.get(v.node);b.reserved-=j.qty;j.completed=this.time;this.log('completed',v,'목적지 인계 '+j.qty+' PLT');
      if(n.process>0){b.items.push({id:j.id,qty:j.qty,processing:false});this.bufferChange(v.node);this.processBuffer(v.node);}else b.completed+=j.qty;
      v.loaded=false;v.job=null;v.stage='returnHome';
    }
    if(next==='dockDone'){v.chargeVisits++;this.beginCharging(v);}
    if(next==='undockDone')v.stage='returnHome';
  }
  fail(v,reason){if(v.state==='failed')return;const stoppedPose=v.motion?M.pose(v.motion,this.time-v.stateStart):null;this.closeState(v);this.failures.push({time:this.time,vehicle:v.id,reason});this.log('failure',v,reason);v.state='failed';v.reason=reason;v.token++;v.stage='failed';if(stoppedPose){v.failedPose=stoppedPose;v.staticPosition=stoppedPose;v.heading=stoppedPose.heading;v.motion=null;}}
  dispatch(){
    for(const v of this.vehicles)this.advance(v);
    let available=this.vehicles.filter(v=>v.stage==='idle'&&v.state==='idle'),list=this.pending.filter(j=>j.assigned===null);
    if(this.p.dispatch==='due')list.sort((a,b)=>(a.due-60*a.priority)-(b.due-60*b.priority)||a.release-b.release);else list.sort((a,b)=>a.release-b.release||a.id.localeCompare(b.id));
    for(const j of list){if(!available.length)break;let candidates=available.map(v=>({v,r:this.route(v.node,j.from,false,v.heading)})).filter(x=>x.r&&this.enoughFor(x.v,j));
      if(this.p.dispatch==='nearest')candidates.sort((a,b)=>a.r.duration-b.r.duration||a.v.number-b.v.number);else candidates.sort((a,b)=>a.v.number-b.v.number);
      if(!candidates.length)continue;const v=candidates[0].v;this.closeState(v);j.assigned=this.time;j.vehicle=v.id;v.job=j;v.stage='toPickup';v.energyRejected=false;this.log('assigned',v,'작업 배정');available=available.filter(x=>x!==v);this.advance(v);
    }
    this.pending=this.pending.filter(j=>j.assigned===null);
    if(this.pending.length&&this.p.battery.enabled)for(const v of available){if(v.energyRejected){if(!this.failures.some(f=>f.vehicle===v.id&&f.reason.includes('최대 충전')))this.fail(v,'최대 충전 후에도 작업+충전 복귀 에너지 부족');}else if(this.energyAt(v)/this.p.battery.capacity<this.p.battery.target-.005)this.charge(v);}
    // Zero-duration arrivals/services are processed by the event queue; no recursive movement loop.
  }
  detectDeadlock(){
    const waits=new Map(this.vehicles.filter(v=>v.waitFor).map(v=>[v.id,v.waitFor]));let cycle=false;for(const start of waits.keys()){const seen=[];let x=start;while(waits.has(x)){if(seen.includes(x)){const members=seen.slice(seen.indexOf(x));cycle=members.every(id=>this.time-(this.vehicles.find(v=>v.id===id)?.waitSince||0)>=300);break;}seen.push(x);x=waits.get(x);}if(cycle)break;}
    if(cycle&&!this.failures.some(x=>x.reason==='미해결 자원 교착')){this.failures.push({time:this.time,vehicle:'',reason:'미해결 자원 교착'});this.log('deadlock',null,'300초 이상 진행 없는 자원 대기 순환. 수동 복구 필요');}
  }
  capture(){const released=this.tasks.filter(j=>j.release<=this.time),completed=released.filter(j=>j.completed!==null&&j.completed<=this.time);this.snapshots.push({time:this.time,released:released.length,completed:completed.length,qty:completed.reduce((s,j)=>s+j.qty,0),backlog:released.length-completed.length,soc:this.vehicles.map(v=>this.energyAt(v)/this.p.battery.capacity)});}
  stepBatch(maxEvents=1500){
    let n=0;while(!this.done&&n++<maxEvents){const e=this.queue.pop();if(!e){this.done=true;break;}this.time=Math.min(e.time,this.p.horizon);this.count++;if(this.count>1000000)throw Error('사건 상한 초과: 0초 반복/과도한 데이터 확인');
      const v=e.data.id?this.vehicles.find(v=>v.id===e.data.id):null,valid=v&&e.data.token===v.token;
      if(e.type==='release')this.pending.push(this.tasks[e.data.index]);
      if(e.type==='arrive'&&valid)this.arrive(v);
      if(e.type==='service'&&valid)this.finishService(v,e.data.next);
      if(e.type==='chargeDone'&&valid){this.closeState(v);if(v.energy/this.p.battery.capacity>=this.p.battery.target-EPS){this.setState(v,'idle');this.startService(v,'undock',this.p.battery.undock,'undockDone');}else {this.setState(v,'idle');this.beginCharging(v);}}
      if(e.type==='processed'){const b=this.stationBuffers.get(e.data.id),i=b.items.findIndex(x=>x.id===e.data.jobId);if(i>=0){b.completed+=b.items[i].qty;b.items.splice(i,1);b.processing--;this.bufferChange(e.data.id);this.processBuffer(e.data.id);this.lastProgress=this.time;}}
      if(e.type==='depleted'&&valid&&this.energyAt(v)<=EPS)this.fail(v,'SOC 고갈 · 구조 필요');
      if(e.type==='closure')this.log('closure',null,e.data.c.pathId+(e.data.active?' 신규 진입 폐쇄':' 재개방'));
      if(e.type==='end'){this.done=true;for(const v of this.vehicles)this.closeState(v);this.capture();break;}
      this.dispatch();
      if(e.type==='sample'){this.detectDeadlock();this.capture();}
    }
    return {done:this.done,time:this.time,progress:this.time/this.p.horizon,events:this.count};
  }
  run(){while(!this.done)this.stepBatch(10000);return this.result();}
  result(){
    if(!this.done)throw Error('계산 완료 후 결과를 조회하세요.');
    const p=this.p,run={schemaVersion:'agv-amr/run@1',engineVersion:Model.VERSION,configHash:Model.hash(p),runId:p.scenarioId+'-'+p.seed+'-'+Model.hash(p).slice(-8),config:p,tasks:this.tasks,vehicles:this.vehicles.map(v=>({id:v.id,home:v.home,timeline:v.timeline,energy:v.energy,initialEnergy:p.battery.capacity*p.battery.initial,consumed:v.consumed,charged:v.charged,chargeVisits:v.chargeVisits,distance:v.distance,failedPose:v.failedPose||null})),events:this.events,snapshots:this.snapshots,reservations:this.reservations,buffers:Object.fromEntries(this.stationBuffers),failures:this.failures,eventCount:this.count};
    run.metrics=metrics(run,p.horizon);run.audit=audit(run);return run;
  }
}
function segmentAt(vehicle,t){const a=vehicle.timeline;if(!a.length)return null;let lo=0,hi=a.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(a[mid].start<=t+EPS)lo=mid;else hi=mid-1;}return a[lo];}
function vehiclePose(run,vehicle,t){const seg=segmentAt(vehicle,t),p=run.config;if(!seg){const n=p.nodes.find(n=>n.id===vehicle.home);return {x:n.x,y:n.y,heading:0,state:'idle',loaded:false,soc:p.battery.initial,speed:0};}const dt=Math.max(0,Math.min(seg.end-seg.start,t-seg.start)),n=seg.position||p.nodes.find(n=>n.id===seg.node),position=seg.motion?M.pose(seg.motion,dt):{x:n.x,y:n.y,heading:seg.heading,speed:0};return {...position,state:seg.state,reason:seg.reason,loaded:seg.loaded,taskId:seg.taskId,soc:Math.max(0,Math.min(p.battery.capacity,seg.energyStart-seg.power*dt/3600))/p.battery.capacity};}
function metrics(run,t){
  const p=run.config,end=Math.min(t,p.horizon),start=Math.min(p.warmup,end),duration=end-start,window=run.tasks.filter(j=>j.completed!==null&&j.completed>=start&&j.completed<end),released=run.tasks.filter(j=>j.release<=end),completed=released.filter(j=>j.completed!==null&&j.completed<=end),cohort=released.filter(j=>j.release>=start&&j.release<end),finishedCohort=cohort.filter(j=>j.completed!==null&&j.completed<=end),outstanding=released.filter(j=>j.completed===null||j.completed>end),dueCohort=cohort.filter(j=>j.due<=end),onTime=dueCohort.filter(j=>j.completed!==null&&j.completed<=j.due).length;
  const leads=finishedCohort.map(j=>j.completed-j.release),stateTimes={},distances={empty:0,loaded:0,returning:0,toCharge:0};let consumed=0,charged=0,initialTotal=0,finalTotal=0,minSoc=1;
  for(const v of run.vehicles){
    initialTotal+=v.initialEnergy;const pose=vehiclePose(run,v,end);finalTotal+=pose.soc*p.battery.capacity;minSoc=Math.min(minSoc,pose.soc);
    for(const s of v.timeline){
      const dt=Math.max(0,Math.min(end,s.end)-Math.max(start,s.start));stateTimes[s.state]=(stateTimes[s.state]||0)+dt;
      if(s.start<end)minSoc=Math.min(minSoc,s.energyStart/p.battery.capacity);if(s.end<=end)minSoc=Math.min(minSoc,s.energyEnd/p.battery.capacity);
      if(s.start<end){const elapsed=Math.max(0,Math.min(end,s.end)-s.start),energy=Math.max(0,Math.min(p.battery.capacity,s.energyStart-s.power*elapsed/3600)),delta=s.energyStart-energy;if(delta>=0)consumed+=delta;else charged-=delta;}
      if(s.motion&&dt>0){let d=0;for(const phase of s.motion.phases)if(phase.kind==='move'){const ta=Math.max(0,start-s.start-phase.start),tb=Math.max(0,Math.min(phase.duration,end-s.start-phase.start));if(tb>ta)d+=M.sample(phase.profile,tb).position-M.sample(phase.profile,Math.min(ta,phase.duration)).position;}distances[s.state]=(distances[s.state]||0)+d;}
    }
  }
  const states=Object.fromEntries(Object.entries(stateTimes).map(([k,v])=>[k,duration?v/(duration*p.fleet):0])),allDistance=distances.empty+distances.loaded,qty=window.reduce((s,j)=>s+j.qty,0),requestQty=cohort.reduce((s,j)=>s+j.qty,0),doneQty=finishedCohort.reduce((s,j)=>s+j.qty,0),backlog=outstanding.length,overdue=outstanding.filter(j=>j.due<=end).length;
  const snapshots=run.snapshots.filter(s=>s.time>=Math.max(start,end-900)&&s.time<=end),socTrend=snapshots.length>1?(snapshots.at(-1).soc.reduce((s,x)=>s+x,0)-snapshots[0].soc.reduce((s,x)=>s+x,0))/p.fleet:0,backlogGrowth=snapshots.length>1?snapshots.at(-1).backlog-snapshots[0].backlog:0;
  const resourceRows=p.nodes.filter(n=>n.type==='station'||(n.type==='charger'&&n.enabled)).map(n=>{let busy=0,wait=0;for(const v of run.vehicles)for(const s of v.timeline){if(s.node!==n.id)continue;const d=Math.max(0,Math.min(end,s.end)-Math.max(start,s.start));if(['pickup','dropoff','dock','charging','undock'].includes(s.state))busy+=d;if(['blocked','traffic','chargeWait'].includes(s.state))wait+=d;}const b=run.buffers[n.id],processBusy=b?b.occupancy.reduce((sum,x)=>sum+Math.max(0,Math.min(end,x.end)-Math.max(start,x.start)),0):0;return {id:n.id,type:n.type,busy:duration?busy/duration:0,wait,processBusy:duration?processBusy/(duration*n.processSlots):0,buffer:b?[...b.changes].reverse().find(x=>x.time<=end)?.qty||0:0};});
  const m={time:end,duration,throughput:duration?qty*3600/duration:0,completedQty:qty,completedJobs:window.length,totalCompleted:completed.length,released:released.length,requestQty,fulfillment:requestQty?doneQty/requestQty:null,backlog,overdue,oldest:outstanding.length?Math.max(...outstanding.map(j=>end-j.release)):0,meanLead:leads.length?leads.reduce((a,b)=>a+b,0)/leads.length:null,p50:percentile(leads,.5),p95:percentile(leads,.95),maxLead:leads.length?Math.max(...leads):null,onTime:dueCohort.length?onTime/dueCohort.length:null,dueCount:dueCohort.length,cohortCompleted:finishedCohort.length,cohortCount:cohort.length,stateTimes,states,distances,emptyRatio:allDistance?distances.empty/allDistance:0,consumed,charged,initialEnergy:initialTotal,finalEnergy:finalTotal,minSoc,socTrend,backlogGrowth,resources:resourceRows,failures:run.failures.filter(f=>f.time<=end).length,chargeVisits:run.events.filter(e=>e.type==='dock'&&e.time<=end).length};
  return m;
}
function audit(run){
  const errors=[],p=run.config,byId=new Set();for(const t of run.tasks){if(byId.has(t.id))errors.push('중복 작업 ID');byId.add(t.id);if(t.completed!==null&&(!(t.completed>=t.assigned&&t.assigned>=t.release)))errors.push('요청 시간 순서');}
  for(const v of run.vehicles){let end=0;for(const s of v.timeline){if(Math.abs(s.start-end)>1e-6||s.end<s.start)errors.push(v.id+' 상태 장부 틈/중첩');if(s.energyStart< -1e-6||s.energyEnd< -1e-6||s.energyEnd>p.battery.capacity+1e-6)errors.push(v.id+' SOC 범위');end=s.end;}if(Math.abs(end-p.horizon)>1e-6)errors.push(v.id+' 상태시간 합');if(Math.abs(v.initialEnergy-v.consumed+v.charged-v.energy)>1e-5)errors.push(v.id+' 에너지 보존');}
  const completed=run.tasks.filter(j=>j.completed!==null).length,active=run.tasks.filter(j=>j.completed===null).length;if(completed+active!==run.tasks.length)errors.push('요청 수 보존');
  const gaps=Math.hypot(Math.max(p.vehicle.length,p.vehicle.cargoLength),Math.max(p.vehicle.width,p.vehicle.cargoWidth))+2*p.vehicle.clearance;
  const reservations=[...run.reservations].sort((a,b)=>a.start-b.start);let activeRoutes=[];
  for(const r of reservations){activeRoutes=activeRoutes.filter(x=>x.end>r.start+EPS);for(const o of activeRoutes){if(o.vehicle===r.vehicle)continue;let overlap=false;for(let i=1;i<r.points.length;i++)for(let j=1;j<o.points.length;j++)if(M.segmentDistance(r.points[i-1],r.points[i],o.points[j-1],o.points[j])<gaps-EPS)overlap=true;if(overlap)errors.push('이동 예약 외곽 중첩 '+r.vehicle+'/'+o.vehicle);}activeRoutes.push(r);}
  const nodes=new Map(p.nodes.map(n=>[n.id,n]));
  for(const r of reservations)for(const v of run.vehicles){if(v.id===r.vehicle)continue;const startSegment=segmentAt(v,r.start),startIndex=startSegment?v.timeline.indexOf(startSegment):0;for(let k=startIndex;k<v.timeline.length;k++){const s=v.timeline[k];if(s.start>=r.end-EPS)break;if(s.motion||s.end<=r.start+EPS)continue;const n=nodes.get(s.node);for(let i=1;i<r.points.length;i++)if(M.pointSegment(n,r.points[i-1],r.points[i])<gaps-EPS)errors.push('정지차량 외곽 침범 '+r.vehicle+'/'+v.id);}}
  for(const n of p.nodes.filter(n=>n.type==='station'||n.type==='charger')){const intervals=run.vehicles.flatMap(v=>v.timeline.filter(s=>s.node===n.id&&['pickup','dropoff','dock','charging','undock'].includes(s.state)).map(s=>({start:s.start,end:s.end,vehicle:v.id}))).sort((a,b)=>a.start-b.start);let last=null;for(const s of intervals){if(last&&s.start<last.end-EPS&&s.vehicle!==last.vehicle)errors.push(n.id+' 서비스 자원 초과');if(!last||s.end>last.end)last=s;}}
  for(const [id,b]of Object.entries(run.buffers)){const n=p.nodes.find(n=>n.id===id);if(b.changes.some(c=>c.qty>n.buffer||c.qty<0))errors.push(id+' 화물 버퍼 초과');}
  for(const j of run.tasks){if(j.pickupCompleted!==undefined&&(!(j.pickupCompleted>=j.assigned)||j.completed!==null&&j.completed<j.pickupCompleted))errors.push('화물 인계 순서');}
  return {ok:!errors.length,errors:[...new Set(errors)],checks:['요청 보존','상태시간 연속성','에너지 수지','SOC 범위','이동/정지 외곽 예약','서비스 자원 단일 점유','화물 인계 순서','유한 버퍼'],model:'conservative-route-reservation@1'};
}
function confidence(values){if(!values.length)return {mean:null,low:null,high:null,half:null,n:0};const n=values.length,mean=values.reduce((a,b)=>a+b,0)/n;if(n<2)return {mean,low:null,high:null,half:null,n};const t=[0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045,2.042],sd=Math.sqrt(values.reduce((s,x)=>s+(x-mean)**2,0)/(n-1)),half=(t[Math.min(n-1,30)]||1.96)*sd/Math.sqrt(n);return {mean,low:mean-half,high:mean+half,half,n};}
function assess(run){const m=run.metrics,p=run.config,a=Model.analytics(p),issues=[];if(!run.audit.ok||m.failures)issues.push('모델 오류/운행 실패');if(a.qty<=0)issues.push('평가 수요 없음');if(m.throughput<a.qty*p.goals.throughputRatio)issues.push('처리량 미달');if(m.p95===null||m.p95>p.goals.p95)issues.push('P95 목표 미달');if(m.onTime===null||m.onTime<p.goals.onTime)issues.push('납기 목표 미달/표본 부족');if(m.backlog>p.goals.maxBacklog||m.overdue>0||m.backlogGrowth>1)issues.push('미완료/증가 백로그');const sustainable=!p.battery.enabled||(run.vehicles.every(v=>v.chargeVisits>=2)&&m.socTrend>=-.03);if(!sustainable)issues.push('충전 반복·SOC 지속성 미확인');return {eligible:issues.length===0,label:issues.length?'조건 미충족 / 보류':'탐색 조건 충족 · 현장 검증 전',issues,sustainable};}
return {Simulation,demands,metrics,vehiclePose,segmentAt,percentile,confidence,assess,audit,STATES,random};
});
