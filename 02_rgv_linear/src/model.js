(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./motion.js'));else root.RGVModel=factory(root.RGVMotion);})(typeof globalThis!=='undefined'?globalThis:this,function(M){
  'use strict';
  const VERSION='0.2.0',SCHEMA='rgv-linear/project@1';
  const defaults={
    name:'직선 RGV 설계 검토',length:60,layout:'single',distanceUnit:'m',speedUnit:'m/min',unit:'PLT',batchSize:1,
    emptyV:2.5,emptyA:.6,emptyD:.6,loadedV:2,loadedA:.5,loadedD:.5,
    handlingMode:'total',position:.5,interlock:.5,signal:0,control:.5,stopDwell:0,
    jerkMode:'none',accelScale:.9,jerkDelay:.3,creepDistance:0,creepV:.15,
    dispatch:'fifo',parking:'home',peak:1.2,targetUtil:.8,A:null,Ft:null,Ew:null,basis:'',basisNote:'',
    hours:2,warmup:10,seed:20260911,arrival:'takt',jitter:.1,demandMode:'rate',profile:[],history:[],
    sections:[{id:'R1',name:'RGV 01',start:0,end:60,home:0,speedFactor:1,vehicles:1}],
    stations:[{id:'S1',name:'입고',x:0,load:6,unload:6,buffer:8,takeaway:0,stop:false},{id:'S2',name:'출고',x:60,load:6,unload:6,buffer:8,takeaway:0,stop:false}],
    ods:[{id:'OD1',from:'S1',to:'S2',rate:40}],zones:[],handoffs:[]
  };
  const fields={
    length:['레일 전체 길이','distance',.1,1000,1,'각 구간과 스테이션의 좌표는 0부터 전체 길이 사이입니다.'],
    batchSize:['1회 최대 적재량','개/회',1,8,1,'수요는 화물 개수/h입니다. 수요 생성 모드는 같은 OD의 완전 배치만 운송하며 화물 1개를 중간 인계마다 중복 집계하지 않습니다.'],
    emptyV:['공차 최대속도','speed',.01,20,.1,'무부하 접근 및 대기점 복귀의 최대속도입니다.'],emptyA:['공차 가속도','m/s²',.01,10,.1,'공차 주행의 일정 가속도입니다.'],emptyD:['공차 감속도','m/s²',.01,10,.1,'공차 주행의 일정 감속도입니다.'],
    loadedV:['적재 최대속도','speed',.01,20,.1,'화물을 운송할 때의 최대속도입니다.'],loadedA:['적재 가속도','m/s²',.01,10,.1,'적재 주행의 일정 가속도입니다.'],loadedD:['적재 감속도','m/s²',.01,10,.1,'적재 주행의 일정 감속도입니다.'],
    position:['정위치','s/이재',0,120,.1,'상차·하차 각 1회에 포함됩니다. 총 이재시간에 다시 더하지 않습니다.'],interlock:['인터록','s/이재',0,120,.1,'상차·하차의 인터록 지연입니다. 간편 모드 총 시간에 포함됩니다.'],signal:['신호·기동','s/이재',0,120,.1,'이재 신호·기동 지연입니다. 상세 합계로 관리합니다.'],control:['배차 제어 지연','s/구간 작업',0,120,.1,'차량이 한 구간 작업을 배차할 때 1회 적용합니다.'],stopDwell:['중간 정지 대기','s/정지',0,120,.1,'통과 중 정지가 체크된 스테이션에서 정지 후 기다릴 시간입니다. 상하차 지점의 이재시간과는 별개입니다.'],
    accelScale:['유효 가감속 비율','ratio',.1,1,.05,'jerk 근사에서 가속도·감속도에만 곱합니다. 추가 시간 방식과 동시에 적용하지 않습니다.'],jerkDelay:['jerk 보정시간','s/이동',0,30,.1,'추가 시간 근사에서 실제 이동이 있는 구간마다 한 번 더합니다. 정밀 S-curve가 아닙니다.'],
    creepDistance:['도착 저속구간 길이','distance',0,50,.1,'0이면 끔. 목적지 앞 지정 거리의 속도를 제한하며 그 전부터 필요한 감속을 계산합니다.'],creepV:['도착 저속구간 속도','speed',.01,5,.05,'저속구간은 기존 제한보다 빠르게 만들지 않습니다.'],
    peak:['피크 계수','배',1,5,.1,'평균 OD 수요에 곱합니다. 작업이력 CSV 모드에서는 적용하지 않습니다.'],targetUtil:['목표 설계 부하율','ratio',.1,1,.05,'0.8은 80%. 대기 변동을 고려한 설계 목표이며 초과 자체로 계산을 막지 않습니다.'],
    A:['가용도 A','ratio',.01,1,.01,'가용시간 비율. 보정 분석에만 적용하고 DES 관측값에 다시 곱하지 않습니다.'],Ft:['교통계수 Fₜ','ratio',.01,1,.01,'근거가 있는 운영 손실계수. 단독·분리 구간에서도 가정 근거를 기록하세요.'],Ew:['작업효율 E𝑤','ratio',.01,1,.01,'다른 계수와 같은 손실을 중복하지 마세요.'],
    hours:['측정 시간','h',.05,24,.25,'준비운전 이후 통계를 측정하는 시간입니다.'],warmup:['준비운전 제외','min',0,240,1,'상태·화물은 유지하고 이 구간의 통계 시간만 제외합니다.'],seed:['난수 시드','정수',0,4294967295,1,'동일 설정·버전·시드에서 동일 이벤트를 재현합니다.'],jitter:['일정간격 변동폭','ratio',0,.95,.05,'0.1이면 평균 도착간격의 ±10%. Poisson과 CSV에는 적용하지 않습니다.']
  };
  const clone=o=>JSON.parse(JSON.stringify(o));
  function fail(message,field){const error=Error(message);error.field=field;throw error;}
  function number(x,min,max,label,int=false){if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max||(int&&!Number.isInteger(x)))fail(label+': '+min+'~'+max+(int?' 정수':' 숫자')+'를 입력하세요.');}
  function ids(rows,label){const set=new Set();for(const row of rows){if(typeof row.id!=='string'||!/^[A-Za-z0-9_-]{1,30}$/.test(row.id)||set.has(row.id))fail(label+' ID는 중복 없는 영문·숫자·_·- 조합(30자 이내)이어야 합니다.');set.add(row.id);if(row.name!=null&&(typeof row.name!=='string'||row.name.length>80))fail(label+' 이름은 80자 이내여야 합니다.');}}
  function validate(input){
    if(!input||typeof input!=='object')fail('프로젝트 입력이 필요합니다.');
    const c=clone(input);
    for(const [key,[label,,min,max]]of Object.entries(fields)){
      if(['A','Ft','Ew'].includes(key)&&c[key]===null)continue;
      try{number(c[key],min,max,label,['seed','batchSize'].includes(key));}catch(e){e.field=key;throw e;}
    }
    if(typeof c.name!=='string'||!c.name.trim()||c.name.length>160)fail('프로젝트명은 1~160자로 입력하세요.','name');
    const enums={layout:['single','independent','tandem'],distanceUnit:['m','mm'],speedUnit:['m/min','m/s'],unit:['PLT','BOX','TOTE'],handlingMode:['total','detail'],jerkMode:['none','reduced','delay'],dispatch:['fifo','nearest'],parking:['home','stay'],arrival:['takt','poisson'],demandMode:['rate','history'],basis:['','ideal','assumption','vendor','measured']};
    for(const [key,values]of Object.entries(enums))if(!values.includes(c[key]))fail('지원하지 않는 선택: '+key,key);
    if(typeof c.basisNote!=='string'||c.basisNote.length>500)fail('계수 근거 메모는 500자 이내로 입력하세요.','basisNote');
    const limits={stations:[1,30],sections:[1,8],ods:[0,200],zones:[0,30],handoffs:[0,7],profile:[0,48],history:[0,50000]};
    for(const [key,[min,max]]of Object.entries(limits))if(!Array.isArray(c[key])||c[key].length<min||c[key].length>max)fail(key+' 항목은 '+min+'~'+max+'개여야 합니다.');
    ids(c.sections,'구간');ids(c.stations,'스테이션');ids(c.ods,'OD');
    if(c.layout==='single'&&c.sections.length!==1)fail('단일 레일은 차량 1대·구간 1개만 지원합니다. 분리 구간 또는 Tandem을 선택하세요.');
    for(let i=0;i<c.sections.length;i++){
      const s=c.sections[i];number(s.start,0,c.length,'구간 시작');number(s.end,0,c.length,'구간 끝');number(s.home,s.start,s.end,'대기 위치');number(s.speedFactor,.1,1,'구간 속도 비율');
      if(s.vehicles!==1)fail('공유레일 다중 차량은 미지원입니다. 각 물리적 분리 구간에는 차량 1대만 배치하세요.');
      if(s.end<=s.start)fail('구간 끝은 시작보다 커야 합니다.');
      if(i&&s.start<c.sections[i-1].end-1e-8)fail('구간은 X 오름차순이며 겹치지 않아야 합니다.');
      if(c.layout==='tandem'&&i&&Math.abs(s.start-c.sections[i-1].end)>1e-8)fail('Tandem 구간 경계는 서로 이어져야 합니다.');
    }
    if(c.layout==='tandem'&&(c.sections[0].start!==0||c.sections.at(-1).end!==c.length))fail('Tandem 구간은 0부터 전체 레일 길이까지 이어져야 합니다.');
    const overhead=c.position+c.interlock+c.signal;
    for(const s of c.stations){number(s.x,0,c.length,s.id+' 위치');number(s.load,0,600,s.id+' 상차시간');number(s.unload,0,600,s.id+' 하차시간');number(s.buffer,c.batchSize,10000,s.id+' 출고 버퍼',true);number(s.takeaway,0,3600,s.id+' 외부 반출간격');if(typeof s.stop!=='boolean')fail('중간 정지는 참/거짓이어야 합니다.');if(s.load<overhead-1e-8||s.unload<overhead-1e-8)fail(s.id+' 총 이재시간이 정위치·인터록·신호 합보다 작습니다. 상세 지연값을 조정하세요.');if(!c.sections.some(r=>s.x>=r.start-1e-8&&s.x<=r.end+1e-8))fail(s.id+'가 이동 가능 구간 밖에 있습니다.');}
    if(c.handoffs.length!==Math.max(0,c.sections.length-1)&&c.layout==='tandem')fail('Tandem 인계 버퍼 수는 구간 수−1개여야 합니다.');
    for(const b of c.handoffs){number(b.capacity,c.batchSize,10000,'인계 방향별 버퍼',true);number(b.transfer,0,600,'인계 상차/하차 시간');}
    for(const z of c.zones){number(z.from,0,c.length,'속도구간 시작');number(z.to,0,c.length,'속도구간 끝');number(z.v,.01,20,'제한속도');if(z.to<=z.from)fail('속도제한 구간 끝은 시작보다 커야 합니다.');}
    const stations=new Set(c.stations.map(s=>s.id));
    for(const od of c.ods){if(!stations.has(od.from)||!stations.has(od.to))fail(od.id+'의 출발·도착 스테이션 ID를 확인하세요.');number(od.rate,0,10000,od.id+' 물동량');route(c,od);}
    const end=c.hours*60+c.warmup;
    for(let i=0;i<c.profile.length;i++){const p=c.profile[i];number(p.start,0,end,'시간대 시작');number(p.end,0,end,'시간대 끝');number(p.multiplier,0,10,'시간대 배율');if(p.end<=p.start||(i&&p.start<c.profile[i-1].end))fail('시간대는 시작 순서대로 입력하고 겹치지 않게 지정하세요.');}
    for(const j of c.history){number(j.time,0,end*60,'작업 도착초');number(j.quantity,1,c.batchSize,'작업 적재량',true);if(!stations.has(j.from)||!stations.has(j.to))fail('작업 이력의 스테이션 ID를 확인하세요.');route(c,j);}
    const effectiveHours=c.hours+c.warmup/60,maxMultiplier=c.profile.length?Math.max(...c.profile.map(p=>p.multiplier)):1;
    if(c.demandMode==='rate'&&c.ods.reduce((n,o)=>n+o.rate,0)*c.peak*maxMultiplier*effectiveHours/c.batchSize>50000)fail('예상 작업이 50,000회를 초과합니다. 수요·시간을 줄이세요.');
    return c;
  }
  function point(c,id){const s=c.stations.find(s=>s.id===id);if(!s)fail('알 수 없는 스테이션: '+id);return{kind:'station',id:s.id,x:s.x};}
  function route(c,od){
    const from=point(c,od.from),to=point(c,od.to),direction=Math.sign(to.x-from.x)||1;
    let segments;
    if(c.layout!=='tandem'||Math.abs(to.x-from.x)<1e-8){const index=c.sections.findIndex(s=>from.x>=s.start-1e-8&&from.x<=s.end+1e-8&&to.x>=s.start-1e-8&&to.x<=s.end+1e-8);if(index<0)fail(od.from+'→'+od.to+': 독립 구간 사이 반송은 Tandem 인계 구성이 필요합니다.');segments=[index];}
    else{segments=c.sections.map((s,i)=>({s,i})).filter(({s})=>Math.min(Math.max(from.x,to.x),s.end)-Math.max(Math.min(from.x,to.x),s.start)>1e-8).map(({i})=>i);if(direction<0)segments.reverse();}
    return segments.map((section,k)=>{
      const transfer=index=>({kind:'handoff',id:'H'+index+(direction>0?'R':'L'),boundary:index,x:c.sections[index].end,direction});
      return{section,from:k===0?from:transfer(Math.min(section,segments[k-1])),to:k===segments.length-1?to:transfer(Math.min(section,segments[k+1]))};
    });
  }
  function handling(c,p,pick){return p.kind==='station'?c.stations.find(s=>s.id===p.id)[pick?'load':'unload']:c.handoffs[p.boundary].transfer;}
  function demand(c){
    if(c.demandMode==='history'){
      const map=new Map();for(const j of c.history.filter(j=>j.time>=c.warmup*60&&j.time<=c.warmup*60+c.hours*3600)){const key=j.from+'→'+j.to;const x=map.get(key)||{id:key,from:j.from,to:j.to,rate:0,missions:0};x.rate+=j.quantity/c.hours;x.missions+=1/c.hours;map.set(key,x);}return[...map.values()];
    }
    const scale=c.peak*(c.profile.length?Math.max(...c.profile.map(p=>p.multiplier)):1);
    return c.ods.map(o=>({...o,rate:o.rate*scale,missions:o.rate*scale/c.batchSize}));
  }
  function preview(c,od,sectionIndex){const legs=route(c,od),leg=legs.find(l=>l.section===sectionIndex)||legs[0],section=c.sections[leg.section];const start=c.parking==='home'?section.home:leg.from.x;const actions=[];let t=0;
    function add(kind,duration,from,to,profile){if(duration<=0)return;actions.push({kind,duration,start:t,from,to,profile});t+=duration;}
    add('control',c.control,start,start);const approach=M.move(c,section,start,leg.from.x,false);add('empty',approach.duration,start,leg.from.x,approach);add('load',handling(c,leg.from,true),leg.from.x,leg.from.x);
    const loaded=M.move(c,section,leg.from.x,leg.to.x,true);add('loaded',loaded.duration,leg.from.x,leg.to.x,loaded);add('unload',handling(c,leg.to,false),leg.to.x,leg.to.x);
    if(c.parking==='home'){const back=M.move(c,section,leg.to.x,section.home,false);add('empty',back.duration,leg.to.x,section.home,back);}
    return{leg,actions,duration:t,start,finish:c.parking==='home'?section.home:leg.to.x};
  }
  function previewAt(plan,t){const action=plan.actions.find(a=>t<a.start+a.duration)||plan.actions.at(-1);if(!action||t>=plan.duration)return{x:plan.finish,v:0,a:0,kind:'idle'};return{...(action.profile?M.at(action.profile,t-action.start):{x:action.from,v:0,a:0}),kind:action.kind};}
  function hash(c){let h=2166136261;for(const ch of JSON.stringify(c)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');}
  function calculate(input){
    const c=validate(input),ods=demand(c).filter(o=>o.rate>0),total=ods.reduce((n,o)=>n+o.rate,0),factor=[c.A,c.Ft,c.Ew].every(n=>n!==null)&&c.basis?c.A*c.Ft*c.Ew:null;
    const routes=ods.map(od=>({od,legs:route(c,od)})),legRows=[];
    const sections=c.sections.map((s,i)=>{
      const entries=routes.flatMap(r=>r.legs.filter(l=>l.section===i).map(leg=>({leg,od:r.od}))),missionRate=entries.reduce((n,e)=>n+e.od.missions,0),cargoRate=entries.reduce((n,e)=>n+e.od.rate,0);let work=0,emptyDistance=0,loadedDistance=0;
      for(const e of entries){const {leg,od}=e,loaded=M.move(c,s,leg.from.x,leg.to.x,true);let emptyTime=0,emptyDist=0;
        if(c.parking==='home'){for(const [a,b]of [[s.home,leg.from.x],[leg.to.x,s.home]]){emptyTime+=M.move(c,s,a,b,false).duration;emptyDist+=Math.abs(b-a);}}
        else for(const prev of entries){const weight=prev.od.missions/missionRate;emptyTime+=weight*M.move(c,s,prev.leg.to.x,leg.from.x,false).duration;emptyDist+=weight*Math.abs(prev.leg.to.x-leg.from.x);}
        const load=handling(c,leg.from,true),unload=handling(c,leg.to,false),cycle=emptyTime+loaded.duration+load+unload+c.control;
        if(cycle<=1e-9)fail(od.id+': 사이클 시간이 0입니다. 실제 이재시간 또는 이동거리를 입력하세요.');
        work+=od.missions*cycle;emptyDistance+=od.missions*emptyDist;loadedDistance+=od.missions*loaded.length;
        legRows.push({od:od.id,from:od.from,to:od.to,section:s.id,sectionIndex:i,rate:od.rate,missions:od.missions,emptyTime,loadedTime:loaded.duration,load,unload,control:c.control,cycle,emptyDistance:emptyDist,loadedDistance:loaded.length});
      }
      const mean=missionRate?work/missionRate:0,theory=work?cargoRate*3600/work:0,available=factor===null?null:theory*factor;
      return{...s,index:i,work,missionRate,cargoRate,cycle:mean,theory,available,util:factor===null?null:work/(3600*factor),required:factor===null?null:Math.ceil(work/(3600*factor*c.targetUtil)-1e-12),emptyRatio:emptyDistance+loadedDistance?emptyDistance/(emptyDistance+loadedDistance):0};
    });
    const stationRows=c.stations.map(s=>{const incoming=ods.filter(o=>o.to===s.id),outgoing=ods.filter(o=>o.from===s.id),work=incoming.reduce((n,o)=>n+o.missions*s.unload,0)+outgoing.reduce((n,o)=>n+o.missions*s.load,0),releaseWork=incoming.reduce((n,o)=>n+o.rate*s.takeaway,0);return{...s,work,releaseWork,util:work/3600,releaseUtil:releaseWork/3600};});
    const resources=[...sections.map(s=>({name:s.name||s.id,type:'vehicle',work:s.work})),...stationRows.flatMap(s=>[{name:s.id+' 이재부',type:'station',work:s.work},{name:s.id+' 외부 반출',type:'release',work:s.releaseWork}])].filter(r=>r.work>0);
    const nominal=Math.max(0,...resources.map(r=>r.work)),adjusted=factor===null?null:Math.max(0,...resources.map(r=>r.type==='vehicle'?r.work/factor:r.work));
    const theory=nominal?total*3600/nominal:0,available=adjusted===null?null:adjusted?total*3600/adjusted:0;
    const bottleneck=resources.slice().sort((a,b)=>(b.work/(b.type==='vehicle'?(factor??1):1))-(a.work/(a.type==='vehicle'?(factor??1):1)))[0]?.name||'수요 없음';
    const warnings=[];
    if(factor===null)warnings.push('보정계수 A·Fₜ·E𝑤와 근거를 선택하면 보정능력과 차량부하 환산 대수를 표시합니다.');
    if(c.parking==='stay')warnings.push('위치 대기 분석은 연속 작업 OD가 독립이라는 공차 근사입니다. FIFO·가까운 작업의 차이는 DES로 확인하세요.');
    if(c.layout==='tandem')warnings.push('Tandem 분석은 인계 상·하차를 포함한 무대기 추정치입니다. 유한 버퍼의 차단과 양방향 교착은 시뮬레이션으로 확인하세요.');
    if(sections.some(s=>s.required>1))warnings.push('목표 부하율을 초과하는 구간이 있습니다. 환산 대수는 작업부하 참고값이며 동일 레일 차량 증설을 허용하는 값이 아닙니다.');
    if(c.demandMode==='history')warnings.push('작업이력 모드 분석은 측정구간 이력의 평균 부하입니다. 피크계수·시간대 배율은 추가 적용하지 않습니다.');
    if(c.profile.length&&c.demandMode==='rate')warnings.push('분석은 시간대 최대 배율, DES는 시간대별 배율을 사용합니다. 표에 없는 시간대의 도착은 0입니다.');
    if(total===0)warnings.push('요구 물동량이 0입니다. 처리능력은 현재 OD 혼합이 없어 미평가(0)입니다.');
    return{config:c,total,factor,theory,available,bottleneck,sections,stations:stationRows,legRows,warnings,resources,hash:hash(c),shortage:available===null?null:Math.max(0,total-available*c.targetUtil),version:VERSION,kernelVersion:M.VERSION};
  }
  function pack(c){const config=validate(c);return{schemaVersion:SCHEMA,projectId:'rgv-'+hash(config),deviceType:'rgv_linear',moduleVersion:VERSION,kernelVersion:M.VERSION,savedAt:new Date().toISOString(),units:{distance:'m',speed:'m/s',acceleration:'m/s²',time:'s'},config};}
  function unpack(doc){if(!doc||doc.schemaVersion!==SCHEMA||doc.deviceType!=='rgv_linear')fail('지원하지 않는 프로젝트입니다. 직선 RGV 프로젝트 JSON을 선택하세요.');if(!doc.units||doc.units.distance!=='m'||doc.units.speed!=='m/s'||doc.units.time!=='s'||doc.units.acceleration!=='m/s²')fail('프로젝트 내부 단위가 SI 규격과 다릅니다.');if(typeof doc.moduleVersion!=='string'||doc.moduleVersion.split('.')[0]!=='0')fail('지원하지 않는 프로그램 주요 버전입니다.');return validate(doc.config);}
  function preset(name){const c=clone(defaults);if(name==='tandem'||name==='blocked'){
    c.name=name==='blocked'?'Tandem 인계 차단 검토':'Tandem 2구간 예시';c.layout='tandem';c.sections=[{id:'R1',name:'RGV 01',start:0,end:20,home:0,speedFactor:1,vehicles:1},{id:'R2',name:'RGV 02',start:20,end:60,home:20,speedFactor:name==='blocked'?.35:1,vehicles:1}];c.handoffs=[{capacity:2,transfer:4}];c.ods[0].rate=name==='blocked'?120:40;c.parking='stay';
    }else if(name==='bidirectional'){c.name='다중 스테이션 양방향';c.parking='stay';c.stations.splice(1,0,{id:'S3',name:'중간 공정',x:25,load:8,unload:8,buffer:4,takeaway:0,stop:false});c.ods=[{id:'OD1',from:'S1',to:'S2',rate:25},{id:'OD2',from:'S2',to:'S1',rate:20},{id:'OD3',from:'S3',to:'S2',rate:10}];c.zones=[{from:20,to:30,v:1}];}
    return c;
  }
  return{VERSION,SCHEMA,defaults,fields,clone,validate,route,point,handling,demand,preview,previewAt,calculate,pack,unpack,hash,preset};
});
