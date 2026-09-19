(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./motion'):root.AgvMotion);if(typeof module==='object'&&module.exports)module.exports=api;root.AgvModel=api;})(globalThis,function(M){
'use strict';
const SCHEMA='agv-amr/project@1',VERSION='0.3.0',clone=x=>JSON.parse(JSON.stringify(x));
function hash(obj){const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);let h=2166136261;const s=canonical(obj);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return 'fnv1a-'+(h>>>0).toString(16).padStart(8,'0');}
function preset(kind='standard'){
  const p={schemaVersion:SCHEMA,projectId:'AGV-AMR-DEMO',scenarioId:kind,parentScenarioId:'',name:'팔레트 이송 · 2개 공급 / 2개 공정',dataStatus:'가정 기반',sources:'개발계획서 PLAN-AGV-AMR-001 · 설명용 가정값. 현장 실측으로 교체 필요.',
    fleet:4,horizon:3600,warmup:0,seed:20260914,arrival:'periodic',demandMode:'od',demandFactor:1,dispatch:'fifo',routing:'dynamic',parking:'home',emptyModel:'eg',trafficFactor:1.1,availability:.95,chargeAvailability:.9,targetUtil:.85,
    goals:{throughputRatio:.95,p95:600,onTime:.95,maxBacklog:8},
    vehicle:{kind:'AMR',module:'lift',length:1.2,width:.9,payload:1000,cargoLength:1.2,cargoWidth:1,cargoHeight:1.1,emptyV:1.5,loadedV:1.2,emptyA:.5,loadedA:.3,emptyB:.7,loadedB:.5,turning:true,omega:.8,alpha:1,clearance:.15,control:4},
    battery:{enabled:true,capacity:1500,initial:.85,trigger:.25,target:.9,reserve:.08,emptyPower:350,loadedPower:500,handlingPower:280,idlePower:60,chargePower:1200,taper:.55,dock:8,undock:5,opportunity:false},
    nodes:[],paths:[],od:[{id:'OD1',from:'P1',to:'D1',rate:36,qty:1,weight:500,priority:1,due:600},{id:'OD2',from:'P2',to:'D2',rate:24,qty:1,weight:500,priority:1,due:600}],profiles:[],history:[],closures:[],stops:[]};
  const node=(id,x,y,type='junction',extra={})=>p.nodes.push({id,x,y,type,stop:false,pickup:15,dropoff:15,buffer:4,process:0,processSlots:1,enabled:true,...extra});
  const edge=(a,b,extra={})=>p.paths.push({id:'E'+(p.paths.length+1),from:a,to:b,width:3,speed:1.8,direction:'both',door:0,enabled:true,...extra});
  for(let i=0;i<12;i++){node('H'+i,i*4,0);node('K'+(i+1),i*4,-8,'parking');edge('K'+(i+1),'H'+i);if(i)edge('H'+(i-1),'H'+i);}
  for(const [id,x,y]of [['L1',0,8],['L2',0,16],['T0',0,24],['T1',12,24],['T2',24,24],['T3',36,24],['T4',44,24],['R1',44,8],['R2',44,16]])node(id,x,y);
  for(const [a,b]of [['H0','L1'],['L1','L2'],['L2','T0'],['T0','T1'],['T1','T2'],['T2','T3'],['T3','T4'],['T4','R2'],['R2','R1'],['R1','H11'],['H6','T2']])edge(a,b);
  for(const [id,x,y,hub]of [['P1',-6,8,'L1'],['P2',-6,16,'L2'],['D1',50,8,'R1'],['D2',50,16,'R2']]){node(id,x,y,'station');edge(hub,id);}
  for(let i=1;i<=3;i++){node('C'+i,i*12,32,'charger',{enabled:i===1});edge('T'+i,'C'+i);}
  if(kind==='bottleneck'){p.name='후공정 병목 · 60 PLT/Hr';p.od=[{...p.od[0],rate:90}];p.nodes.find(n=>n.id==='D1').process=60;p.nodes.find(n=>n.id==='D1').buffer=2;p.horizon=7200;}
  if(kind==='closure'){p.name='경로 폐쇄 · AMR 우회 비교';p.closures=[{id:'BLOCK1',pathId:p.paths.find(e=>e.from==='H5'&&e.to==='H6').id,start:300,end:1200}];}
  if(kind==='charging'){p.name='충전 경합 · 소용량 배터리 시험';p.battery.capacity=350;p.battery.initial=.4;p.horizon=14400;}
  if(kind==='zero'){p.name='0 수요 · 보존 검증';p.od.forEach(o=>o.rate=0);}
  if(kind==='golden'){
    p.name='계획서 예제 B · 72 PLT/Hr / 60 m';p.fleet=1;p.trafficFactor=1;p.emptyModel='return';p.battery.enabled=false;p.vehicle.turning=false;
    p.nodes=[];p.paths=[];node('K1',0,-6,'parking');node('P1',0,0,'station');node('D1',60,0,'station');edge('K1','P1');edge('P1','D1');p.od=[{id:'OD1',from:'P1',to:'D1',rate:72,qty:1,weight:500,priority:1,due:600}];
  }
  return p;
}
function graph(p){const nodes=new Map(p.nodes.map(n=>[n.id,n])),adj=new Map(p.nodes.map(n=>[n.id,[]]));for(const e of p.paths){if(!e.enabled||!nodes.get(e.from)?.enabled||!nodes.get(e.to)?.enabled)continue;const len=Math.hypot(nodes.get(e.from).x-nodes.get(e.to).x,nodes.get(e.from).y-nodes.get(e.to).y);adj.get(e.from).push({to:e.to,edge:e,len});if(e.direction==='both')adj.get(e.to).push({to:e.from,edge:e,len});}return {nodes,adj};}
function route(p,g,from,to,loaded=false,heading=0,banned=new Set()){
  if(!g.nodes.has(from)||!g.nodes.has(to))return null;
  if(from===to)return M.makeRoute([g.nodes.get(from)],[],p.vehicle,loaded,heading);
  const v=loaded?p.vehicle.loadedV:p.vehicle.emptyV,a=loaded?p.vehicle.loadedA:p.vehicle.emptyA,b=loaded?p.vehicle.loadedB:p.vehicle.emptyB;
  // Direction is part of the label: two arrivals at one node may have different turn costs.
  const key=(prev,n)=>JSON.stringify([prev,n]),start=key('',from),cost=new Map([[start,0]]),labels=new Map([[start,{node:from,prev:'',heading}]]),back=new Map(),done=new Set();let winner=null;
  while(true){let k=null,best=Infinity;for(const [id,c]of cost)if(!done.has(id)&&c<best){best=c;k=id;}if(k===null)break;const s=labels.get(k);if(s.node===to){winner=k;break;}done.add(k);
    for(const q of g.adj.get(s.node)||[]){if(banned.has(q.edge.id))continue;const x=g.nodes.get(s.node),y=g.nodes.get(q.to),h=Math.atan2(y.y-x.y,y.x-x.x),delta=Math.abs(M.angle(h-s.heading)),turn=p.vehicle.turning&&delta>1e-6?M.profile(delta,p.vehicle.omega,p.vehicle.alpha,p.vehicle.alpha).duration:0;
      const candidate=best+M.profile(q.len,Math.min(v,q.edge.speed),a,b).duration+turn+q.edge.door,nk=key(s.node,q.to);
      if(candidate<(cost.get(nk)??Infinity)){cost.set(nk,candidate);labels.set(nk,{node:q.to,prev:s.node,heading:h});back.set(nk,{key:k,edge:q.edge});}
    }
  }
  if(!winner)return null;const points=[g.nodes.get(to)],edges=[];while(winner!==start){const q=back.get(winner);edges.unshift(q.edge);winner=q.key;points.unshift(g.nodes.get(labels.get(winner).node));}
  return M.makeRoute(points,edges,p.vehicle,loaded,heading);
}
function validate(p){
  const errors=[],warnings=[],err=(s)=>errors.push(s),num=(v,lo,hi,label,integer=false)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi||(integer&&!Number.isInteger(v)))err(label+': '+lo+'~'+hi+(integer?' 정수':'')+' 필요');};
  if(!p||p.schemaVersion!==SCHEMA)return {errors:['지원하지 않는 프로젝트 스키마입니다. '+SCHEMA+' 형식이 필요합니다.'],warnings};
  for(const key of ['nodes','paths','od','history','profiles','closures','stops'])if(!Array.isArray(p[key]))err(key+': 표 데이터가 없습니다.');
  if(errors.length)return {errors,warnings};
  if(!p.vehicle||!p.battery||!p.goals)return {errors:['차량·배터리·목표 설정 누락'],warnings};
  for(const key of ['name','projectId','scenarioId','sources','dataStatus'])if(typeof p[key]!=='string'||p[key].length>10000)err(key+': 문자열(10,000자 이하) 필요');
  if(p.parking!=='home')err('지원 주차 정책은 전용 시작 베이 복귀(home)입니다.');
  num(p.fleet,1,50,'운영 대수',true);num(p.horizon,60,172800,'운전시간 s');num(p.warmup,0,p.horizon-1,'준비운전 s');num(p.seed,0,4294967295,'시드',true);num(p.demandFactor,0,20,'수요 배율');
  for(const k of ['availability','chargeAvailability','targetUtil'])num(p[k],.01,1,k);num(p.trafficFactor,1,5,'해석 교통배수');
  for(const [k,opts]of Object.entries({arrival:['periodic','poisson'],demandMode:['od','history'],dispatch:['fifo','nearest','due'],routing:['fixed','dynamic'],emptyModel:['eg','return','lower']}))if(!opts.includes(p[k]))err(k+': 지원하지 않는 설정');
  const v=p.vehicle,b=p.battery;
  for(const k of ['emptyV','loadedV','emptyA','loadedA','emptyB','loadedB','omega','alpha','length','width','cargoLength','cargoWidth','cargoHeight'])num(v[k],.001,100,k);
  num(v.payload,1,100000,'최대 하중 kg');num(v.clearance,0,5,'외곽 여유 m');num(v.control,0,3600,'제어시간 s');
  if(!['AGV','AMR'].includes(v.kind)||!['lift','roller'].includes(v.module))err('지원 장비: AGV/AMR 차동·전방향, 리프트/롤러 탑 모듈. 조향·견인 기구학은 미지원');
  for(const k of ['enabled','opportunity'])if(typeof b[k]!=='boolean')err('battery.'+k+': 참/거짓 필요');
  num(b.capacity,1,100000,'배터리 Wh');for(const k of ['initial','trigger','target','reserve'])num(b[k],0,1,'SOC '+k);
  if(!(b.reserve<b.trigger&&b.trigger<b.target&&b.initial>b.reserve))err('SOC: 예비 < 충전시작 < 충전목표, 초기 > 예비 조건 필요');
  for(const k of ['emptyPower','loadedPower','handlingPower','idlePower'])num(b[k],0,100000,k);num(b.chargePower,1,100000,'순충전전력 W');num(b.taper,.01,1,'80% 이후 충전비');for(const k of ['dock','undock'])num(b[k],0,3600,k);
  num(p.goals.throughputRatio,.01,1,'처리량 목표비');num(p.goals.onTime,.01,1,'납기 목표비');num(p.goals.p95,1,172800,'P95 목표');num(p.goals.maxBacklog,0,100000,'최대 백로그',true);
  const ids=new Set();for(const [i,n]of p.nodes.entries()){if(typeof n.id!=='string'||!n.id.trim()||ids.has(n.id))err('Nodes '+(i+2)+'행: ID 누락/중복');ids.add(n.id);num(n.x,-10000,10000,n.id+' X');num(n.y,-10000,10000,n.id+' Y');if(!['junction','station','parking','charger'].includes(n.type))err(n.id+': 미지원 노드 유형');if(n.type==='station'){num(n.pickup,.01,36000,n.id+' 픽업');num(n.dropoff,.01,36000,n.id+' 하역');num(n.buffer,1,100000,n.id+' 화물 버퍼',true);num(n.process,0,36000,n.id+' 후공정');num(n.processSlots,1,100,n.id+' 후공정 슬롯',true);}}
  if(p.nodes.length>500||p.paths.length>1000)err('입력 상한: 노드 500 / 경로 1,000');
  const parking=p.nodes.filter(n=>n.type==='parking'&&n.enabled);if(parking.length<p.fleet)err('차량마다 서로 다른 시작 주차 노드가 필요합니다. 현재 '+parking.length+'개');
  const edgeIds=new Set(),requiredWidth=Math.max(v.width,v.cargoWidth)+2*v.clearance;
  for(const [i,e]of p.paths.entries()){if(!e.id||edgeIds.has(e.id))err('Paths '+(i+2)+'행: ID 누락/중복');edgeIds.add(e.id);if(!ids.has(e.from)||!ids.has(e.to)||e.from===e.to)err(e.id+': 경로 끝점 오류');num(e.speed,.001,100,e.id+' 속도');num(e.width,requiredWidth,100,e.id+' 통로폭');num(e.door,0,3600,e.id+' 도어 지연');if(!['both','forward'].includes(e.direction))err(e.id+': 방향 오류');}
  if(errors.length)return {errors,warnings};
  const g=graph(p),radius=Math.hypot(Math.max(v.length,v.cargoLength),Math.max(v.width,v.cargoWidth))/2+v.clearance;
  for(let i=0;i<p.nodes.length;i++)for(let j=0;j<i;j++){const a=p.nodes[i],c=p.nodes[j],dist=Math.hypot(a.x-c.x,a.y-c.y);if(dist<1e-6)err(a.id+'/'+c.id+': 좌표 중복. 교차점은 공통 노드로 합치세요.');if(a.type!=='junction'&&c.type!=='junction'&&a.enabled&&c.enabled&&dist<2*radius)err(a.id+'/'+c.id+': 차량·적재 회전 외곽이 겹칩니다.');}
  for(const e of p.paths){const a=g.nodes.get(e.from),c=g.nodes.get(e.to);if(Math.hypot(a.x-c.x,a.y-c.y)<.001)err(e.id+': 길이가 0인 경로');}
  const station=id=>g.nodes.get(id)?.type==='station'&&g.nodes.get(id)?.enabled,odIds=new Set();let estimated=0;
  for(const [i,o]of p.od.entries()){if(!o.id||odIds.has(o.id))err('OD '+(i+2)+'행: ID 중복/누락');odIds.add(o.id);if(!station(o.from)||!station(o.to)||o.from===o.to)err(o.id+': 서로 다른 스테이션 ID 필요');num(o.rate,0,100000,o.id+' PLT/Hr');num(o.qty,1,100,o.id+' 작업당 수량',true);num(o.weight,0,v.payload,o.id+' 작업 총하중');num(o.priority,0,100,o.id+' 우선순위');num(o.due,1,172800,o.id+' 납기 s');if(station(o.to)&&o.qty>g.nodes.get(o.to).buffer)err(o.id+': 작업 수량이 목적지 버퍼보다 큼');estimated+=o.rate/o.qty*p.horizon/3600*p.demandFactor;}
  if(p.demandMode==='od'&&estimated>50000)err('작업 예상량 50,000건 초과: 시간/수요를 줄이세요.');
  const taskIds=new Set();for(const h of p.history){if(!h.id||taskIds.has(h.id))err('TaskHistory: 중복/누락 ID');taskIds.add(h.id);if(!station(h.from)||!station(h.to)||h.from===h.to)err(h.id+': 작업 스테이션 오류');num(h.release,0,p.horizon,h.id+' 발생 s');num(h.qty,1,100,h.id+' 수량',true);num(h.weight,0,v.payload,h.id+' 총하중');num(h.due,h.release,345600,h.id+' 절대 납기');num(h.priority,0,100,h.id+' 우선순위');if(station(h.to)&&h.qty>g.nodes.get(h.to).buffer)err(h.id+': 버퍼보다 큰 수량');}
  if(p.history.length>50000)err('작업 이력 50,000건 초과');if(p.demandMode==='history'&&(p.demandFactor!==1||p.profiles.length))err('작업 이력 모드는 배율 1, 시간대 프로파일 없음으로 설정하세요.');
  const intervals=[...p.profiles].sort((a,c)=>a.start-c.start);intervals.forEach((q,i)=>{num(q.start,0,p.horizon,'시간대 시작');num(q.end,q.start+.001,p.horizon,'시간대 종료');num(q.multiplier,0,20,'시간대 배율');if(i&&q.start<intervals[i-1].end)err('시간대 프로파일 중첩');});
  const closureIds=new Set();for(const q of p.closures){if(!q.id||closureIds.has(q.id))err('폐쇄 이벤트 ID 중복/누락');closureIds.add(q.id);if(!edgeIds.has(q.pathId))err(q.id+': 폐쇄 경로 없음');num(q.start,0,p.horizon,'폐쇄 시작');num(q.end,q.start+.001,p.horizon,'폐쇄 종료');}
  for(const q of p.stops){if(!Number.isInteger(q.vehicle)||q.vehicle<1||q.vehicle>p.fleet)err('정지 이력 차량 번호 오류');num(q.start,0,p.horizon,'정지 시작');num(q.end,q.start+.001,p.horizon,'정지 종료');}
  if(p.stops.length)warnings.push('계획 정지는 진행 중 동작 완료 후 적용되며 주차 베이에서 대기합니다. 주행 중 돌발 고장은 미지원입니다.');
  const chargers=p.nodes.filter(n=>n.type==='charger'&&n.enabled);if(b.enabled&&!chargers.length)err('배터리 사용 시 활성 충전기 1개 이상 필요');
  const checks=p.demandMode==='history'?p.history:p.od.filter(o=>o.rate>0);
  const cache=new Map(),hasRoute=(a,c)=>{const key=JSON.stringify([a,c]);if(!cache.has(key))cache.set(key,Boolean(route(p,g,a,c)));return cache.get(key);};
  for(const o of checks){if(station(o.from)&&station(o.to)&&!hasRoute(o.from,o.to))err(o.id+': 적재 경로 연결 안 됨');}
  for(const home of parking.slice(0,p.fleet))for(const o of checks){if(station(o.from)&&!hasRoute(home.id,o.from))err(home.id+' → '+o.from+': 출발 접근 불가');if(station(o.to)&&!hasRoute(o.to,home.id))err(o.to+' → '+home.id+': 주차 복귀 불가');}
  if(b.enabled)for(const n of p.nodes.filter(n=>['parking','station'].includes(n.type)&&n.enabled))if(!chargers.some(c=>hasRoute(n.id,c.id)&&hasRoute(c.id,n.id)))err(n.id+': 충전기 왕복 경로 없음');
  if(p.emptyModel==='eg')for(const a of checks)for(const c of checks)if(station(a.to)&&station(c.from)&&!hasRoute(a.to,c.from))err('EG 공차 '+a.to+' → '+c.from+': 연결 안 됨');
  if(p.emptyModel==='return')for(const o of checks)if(station(o.to)&&station(o.from)&&!hasRoute(o.to,o.from))err('공차 복귀 '+o.to+' → '+o.from+': 연결 안 됨');
  warnings.push('가정 기반 모델 · 실측 보정 전 결과입니다.','교통: 전 구간 배타 예약 + 회전 외곽 원 검사. 링크 내 추종·추월은 지원하지 않습니다.','주차: 매 작업 후 전용 시작 베이로 복귀. 해석 공차 기준선과 DES 실주행은 다를 수 있습니다.','DES는 명시한 교통·충전을 계산하며 해석용 가용도·교통계수를 다시 적용하지 않습니다.');
  if(!v.turning)warnings.push('방향 전환 추가시간 0: 전방향 시험 가정입니다.');
  if(p.warmup===0)warnings.push('유한 교대 시험: 시작 손실과 종료 시 미완료 요청을 포함합니다.');
  return {errors:[...new Set(errors)],warnings};
}
function minTransport(supply,demand,cost){
  // Successive shortest augmenting paths on a residual network; fractional flows are allowed.
  const m=supply.length,n=demand.length,N=m+n+2,S=N-2,T=N-1,adj=Array.from({length:N},()=>[]),refs=[];
  function add(a,b,cap,c){const x={to:b,cap,cost:c,rev:adj[b].length},y={to:a,cap:0,cost:-c,rev:adj[a].length};adj[a].push(x);adj[b].push(y);return x;}
  supply.forEach((x,i)=>add(S,i,x,0));demand.forEach((x,j)=>add(m+j,T,x,0));for(let i=0;i<m;i++)for(let j=0;j<n;j++)if(Number.isFinite(cost[i][j]))refs.push({i,j,e:add(i,m+j,1e12,cost[i][j])});
  let total=0,flow=0,required=supply.reduce((a,c)=>a+c,0);
  while(flow<required-1e-8){const dist=Array(N).fill(Infinity),prev=Array(N);dist[S]=0;for(let k=0;k<N-1;k++){let changed=false;for(let a=0;a<N;a++)if(Number.isFinite(dist[a]))for(let ei=0;ei<adj[a].length;ei++){const e=adj[a][ei];if(e.cap>1e-9&&dist[e.to]>dist[a]+e.cost+1e-9){dist[e.to]=dist[a]+e.cost;prev[e.to]={a,ei};changed=true;}}if(!changed)break;}if(!Number.isFinite(dist[T]))return {cost:Infinity,flow,flows:[]};let f=required-flow;for(let x=T;x!==S;){const z=prev[x];f=Math.min(f,adj[z.a][z.ei].cap);x=z.a;}for(let x=T;x!==S;){const z=prev[x],e=adj[z.a][z.ei];e.cap-=f;adj[x][e.rev].cap+=f;x=z.a;}flow+=f;total+=f*dist[T];}
  return {cost:total,flow,flows:refs.map(x=>({i:x.i,j:x.j,flow:adj[x.e.to][x.e.rev].cap})).filter(x=>x.flow>1e-8)};
}
function analytics(p){
  const validation=validate(p);if(validation.errors.length)throw Error(validation.errors.join('\n'));const g=graph(p),span=p.horizon/3600;
  let od=p.od.map(o=>({...o}));if(p.demandMode==='history'){const grouped=new Map();for(const h of p.history){const k=JSON.stringify([h.from,h.to,h.qty]);if(!grouped.has(k))grouped.set(k,{...h,rate:0});grouped.get(k).rate+=h.qty/span;}od=[...grouped.values()];}
  const profileFactor=1+p.profiles.reduce((s,x)=>s+(x.multiplier-1)*(x.end-x.start)/p.horizon,0),factor=p.demandMode==='od'?p.demandFactor*profileFactor:1;
  const rates=new Map(p.nodes.filter(n=>n.type==='station').map(n=>[n.id,{P:0,D:0}]));let jobs=0,qty=0,loadedWork=0,loadedTravel=0,handling=0;
  const rows=od.filter(o=>o.rate>0).map(o=>{const lambda=o.rate*factor/o.qty,r=route(p,g,o.from,o.to,true),pick=g.nodes.get(o.from).pickup,drop=g.nodes.get(o.to).dropoff,t=pick+drop+p.vehicle.control;rates.get(o.from).P+=lambda;rates.get(o.to).D+=lambda;jobs+=lambda;qty+=o.rate*factor;loadedTravel+=lambda*r.duration;handling+=lambda*t;loadedWork+=lambda*(r.duration+t);return {...o,lambda,rate:o.rate*factor,distance:r.distance,loadedTime:r.duration,pick,drop,control:p.vehicle.control};});
  const ids=[...rates.keys()],rCache=new Map(),empty=(a,b)=>{const k=JSON.stringify([a,b]);if(!rCache.has(k))rCache.set(k,route(p,g,a,b,false));return rCache.get(k);};
  let eg=0,ret=0;const flows=[];
  for(const a of ids)for(const b of ids){const f=jobs?rates.get(a).D*rates.get(b).P/jobs:0;if(f){const r=empty(a,b);eg+=f*(r?.duration??Infinity);flows.push({from:a,to:b,rate:f,time:r?.duration??null,distance:r?.distance??null});}}
  for(const o of rows)ret+=o.lambda*(empty(o.to,o.from)?.duration??Infinity);
  const sup=ids.filter(i=>rates.get(i).D>rates.get(i).P),dem=ids.filter(i=>rates.get(i).P>rates.get(i).D),lowerResult=minTransport(sup.map(i=>rates.get(i).D-rates.get(i).P),dem.map(i=>rates.get(i).P-rates.get(i).D),sup.map(i=>dem.map(j=>empty(i,j)?.duration??Infinity))),lower=lowerResult.cost;
  const emptyWork={eg,return:ret,lower}[p.emptyModel],travel=loadedTravel+emptyWork,extra=(p.trafficFactor-1)*travel,work=loadedWork+emptyWork+extra,den=3600*p.availability*p.chargeAvailability*p.targetUtil,raw=work/den,cycle=jobs?work/jobs:0;
  const alternatives=[['lower','정상상태 공차 하한',lower],['eg','EG 독립배차 기준선',eg],['return','출발지 복귀 기준',ret]].map(([key,label,w])=>({key,label,emptyWork:w,raw:(loadedWork+w+(p.trafficFactor-1)*(loadedTravel+w))/den,vehicles:jobs?Math.ceil((loadedWork+w+(p.trafficFactor-1)*(loadedTravel+w))/den):0}));
  const resources=p.nodes.filter(n=>n.type==='station').map(n=>{const r=rates.get(n.id),unloadQty=rows.filter(o=>o.to===n.id).reduce((s,o)=>s+o.rate,0);return {id:n.id,serviceLoad:(r.P*n.pickup+r.D*n.dropoff)/3600,processLoad:n.process?unloadQty*n.process/(3600*n.processSlots):0,processCapacity:n.process?3600*n.processSlots/n.process:null};});
  return {rows,jobs,qty,loadedWork,loadedTravel,handling,emptyWork,extra,work,cycle,raw,vehicles:jobs?Math.ceil(raw):0,capacity:cycle?3600*p.fleet*p.availability*p.chargeAvailability/cycle*(qty/jobs):0,alternatives,flows,lowerFlows:lowerResult.flows.map(f=>({from:sup[f.i],to:dem[f.j],rate:f.flow})),resources,validation};
}
function pack(config){return {schemaVersion:SCHEMA,equipmentType:'agv_amr',engineVersion:VERSION,savedAt:new Date().toISOString(),configHash:hash(config),config:clone(config)};}
function unpack(data){const p=data.config||data;if(data.configHash&&hash(p)!==data.configHash)throw Error('설정 해시가 일치하지 않습니다. 파일 손상을 확인하세요.');const v=validate(p);if(v.errors.length)throw Error(v.errors.join('\n'));return clone(p);}
return {SCHEMA,VERSION,clone,hash,preset,graph,route,validate,analytics,minTransport,pack,unpack};
});
