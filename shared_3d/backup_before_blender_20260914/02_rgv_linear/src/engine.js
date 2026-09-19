(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./motion.js'),require('./model.js'));else root.RGVEngine=factory(root.RGVMotion,root.RGVModel);})(typeof globalThis!=='undefined'?globalThis:this,function(M,Model){
  'use strict';
  const EPS=1e-8,states={idle:'대기',empty:'공차 이동',loaded:'적재 이동',load:'상차',unload:'하차',control:'제어',blocked:'버퍼 차단',dock:'이재부 대기'};
  class Heap{
    constructor(){this.a=[];}
    less(a,b){return a.time<b.time||(a.time===b.time&&a.seq<b.seq);}
    push(e){const a=this.a;a.push(e);let i=a.length-1;while(i){const p=(i-1)>>1;if(!this.less(a[i],a[p]))break;[a[i],a[p]]=[a[p],a[i]];i=p;}}
    peek(){return this.a[0];}
    pop(){const a=this.a,top=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;while(true){let k=i,l=2*i+1,r=l+1;if(l<a.length&&this.less(a[l],a[k]))k=l;if(r<a.length&&this.less(a[r],a[k]))k=r;if(k===i)break;[a[i],a[k]]=[a[k],a[i]];i=k;}}return top;}
  }
  function rng(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  function percentile(a,q){if(!a.length)return 0;const sorted=a.slice().sort((a,b)=>a-b),x=(sorted.length-1)*q,k=Math.floor(x);return sorted[k]+(sorted[Math.min(k+1,sorted.length-1)]-sorted[k])*(x-k);}
  function interval95(values){const n=values.length,mean=n?values.reduce((a,b)=>a+b,0)/n:0,sd=n>1?Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/(n-1)):0;const t=[0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045];return{n,mean,sd,ci95:n>1?(t[Math.min(n-1,29)]||1.96)*sd/Math.sqrt(n):null};}
  class Engine{
    constructor(input){
      this.config=Model.validate(input);const c=this.config;this.time=0;this.warmup=c.warmup*60;this.horizon=this.warmup+c.hours*3600;this.heap=new Heap();this.seq=0;this.jobs=[];this.logs=[];this.legLogs=[];this.series=[];this.eventCount=0;this.failed=null;
      this.created=0;this.delivered=0;this.shipped=0;this.measuredCreated=0;this.measuredDelivered=0;this.measuredShipped=0;this.waits=[];this.leads=[];this.queueArea=0;this.maxQueue=0;this.pendingCargo=0;this.ready=c.sections.map(()=>new Set());
      this.cars=c.sections.map((s,index)=>({index,section:s,x:s.home,state:'idle',stage:'idle',active:null,job:null,leg:null,loaded:false,stateTime:Object.fromEntries(Object.keys(states).map(k=>[k,0])),emptyDistance:0,loadedDistance:0,completed:0,measuredCompleted:0,waits:[],reason:''}));
      this.docks=Object.fromEntries(c.stations.map(s=>[s.id,{owner:null,busy:0}]));this.outputs=Object.fromEntries(c.stations.map(s=>[s.id,{...s,items:[],reserved:0,releaseScheduled:false,max:0}]));
      this.buffers={};if(c.layout==='tandem')for(let i=0;i<c.handoffs.length;i++)for(const direction of ['R','L']){const id='H'+i+direction;this.buffers[id]={id,boundary:i,direction,items:[],reserved:0,capacity:c.handoffs[i].capacity,max:0,x:c.sections[i].end};}
      this.generate();const step=Math.max(1,this.horizon/240);for(let t=0;t<=this.horizon;t+=step)this.schedule(Math.min(t,this.horizon),'sample',()=>this.sample());this.schedule(this.horizon,'sample',()=>this.sample());this.advanceTo(0);
    }
    schedule(time,type,fn){if(time<=this.horizon+EPS)this.heap.push({time:Math.max(this.time,time),seq:this.seq++,type,fn});}
    generate(){const c=this.config;
      if(c.demandMode==='history'){for(const event of c.history)this.schedule(event.time,'arrival',()=>this.arrive(event,event.quantity));return;}
      for(let index=0;index<c.ods.length;index++){
        const od=c.ods[index],random=rng((c.seed^parseInt(Model.hash(od),16))>>>0),bands=c.profile.length?c.profile.map(p=>({start:p.start*60,end:p.end*60,multiplier:p.multiplier})):[{start:0,end:this.horizon,multiplier:1}];
        for(const band of bands){const rate=od.rate*c.peak*band.multiplier/c.batchSize;if(!rate)continue;const gap=()=>c.arrival==='poisson'?-Math.log(Math.max(1e-12,1-random()))*3600/rate:3600/rate*(1+c.jitter*(2*random()-1));let t=band.start+gap();let count=0;
          while(t<=band.end+EPS&&t<=this.horizon+EPS){const eventTime=t;this.schedule(eventTime,'arrival',()=>this.arrive(od,c.batchSize));t+=gap();if(++count>100000)throw Error('작업 생성 한도를 초과했습니다.');}
        }
      }
    }
    arrive(od,q){if(this.jobs.length>=100000)throw Error('실제 작업이 100,000회를 초과했습니다.');const job={id:'J'+String(this.jobs.length+1).padStart(6,'0'),from:od.from,to:od.to,quantity:q,arrival:this.time,ready:this.time,firstDispatch:null,legs:Model.route(this.config,od),legIndex:0,status:'waiting',assigned:false,picked:false};this.jobs.push(job);this.ready[job.legs[0].section].add(job);this.pendingCargo+=q;this.created+=q;if(this.time>=this.warmup)this.measuredCreated+=q;}
    contents(b){return b.items.reduce((n,j)=>n+j.quantity,0);}
    queueCount(){return this.pendingCargo;}
    account(until){const start=Math.max(this.time,this.warmup),end=Math.min(until,this.horizon),dt=Math.max(0,end-start);if(!dt)return;
      const queue=this.queueCount();this.queueArea+=queue*dt;this.maxQueue=Math.max(this.maxQueue,queue);
      for(const car of this.cars){car.stateTime[car.state]+=dt;if(car.active?.profile){const profile=car.active.profile,lo=M.at(profile,start-car.active.start).x,hi=M.at(profile,end-car.active.start).x;car[car.active.loaded?'loadedDistance':'emptyDistance']+=Math.abs(hi-lo);}}
      for(const dock of Object.values(this.docks))if(dock.owner!==null)dock.busy+=dt;
    }
    action(car,state,duration,finish,profile=null){car.state=state;car.reason='';car.active={start:this.time,duration,profile,loaded:car.loaded};this.schedule(this.time+duration,'action',()=>{car.active=null;finish();});}
    travel(car,x,loaded,finish){const profile=M.move(this.config,car.section,car.x,x,loaded);if(profile.duration<EPS){car.x=x;finish();return;}car.loaded=loaded;this.action(car,loaded?'loaded':'empty',profile.duration,()=>{car.x=x;finish();},profile);}
    reserveDock(p,car){if(p.kind!=='station')return true;const dock=this.docks[p.id];if(dock.owner!==null&&dock.owner!==car.index)return false;dock.owner=car.index;return true;}
    releaseDock(p){if(p.kind==='station')this.docks[p.id].owner=null;}
    dispatch(car){const ready=this.ready[car.index];if(!ready.size)return false;let job=null,best=Infinity;const cache=new Map();
      for(const candidate of ready){let score=0;if(this.config.dispatch==='nearest'){const x=candidate.legs[candidate.legIndex].from.x;if(!cache.has(x))cache.set(x,M.move(this.config,car.section,car.x,x,false).duration);score=cache.get(x);}if(job===null||score<best-EPS||(Math.abs(score-best)<EPS&&(candidate.ready<job.ready||(candidate.ready===job.ready&&candidate.arrival<job.arrival)))){job=candidate;best=score;}}
      ready.delete(job);this.pendingCargo-=job.quantity;job.assigned=true;car.job=job;car.leg=job.legs[job.legIndex];car.legStart=this.time;car.stage='approach';
      if(job.firstDispatch===null){job.firstDispatch=this.time;if(this.time>=this.warmup)this.waits.push(this.time-job.arrival);}
      if(this.time>=this.warmup)car.waits.push(this.time-job.ready);
      this.action(car,'control',this.config.control,()=>this.travel(car,car.leg.from.x,false,()=>{car.stage='waitLoad';}));return true;
    }
    tryLoad(car){const point=car.leg.from;if(!this.reserveDock(point,car)){car.state='dock';car.reason=point.id+' 이재부 사용 중';return false;}
      car.stage='loading';this.action(car,'load',Model.handling(this.config,point,true),()=>{
        this.releaseDock(point);const job=car.job;if(point.kind==='handoff'){const buffer=this.buffers[point.id],index=buffer.items.indexOf(job);if(index<0)throw Error('인계 화물 소유권 오류');buffer.items.splice(index,1);}
        job.status='active';job.picked=true;car.loaded=true;car.stage='travel';this.travel(car,car.leg.to.x,true,()=>{car.stage='waitUnload';});
      });return true;
    }
    destination(car){return car.leg.to.kind==='handoff'?this.buffers[car.leg.to.id]:this.outputs[car.leg.to.id];}
    tryUnload(car){const p=car.leg.to,b=this.destination(car),cap=p.kind==='handoff'?b.capacity:b.buffer,q=car.job.quantity;
      if(this.contents(b)+b.reserved+q>cap){car.state='blocked';car.reason=(p.kind==='handoff'?'인계':'출고')+' 버퍼 가득 참';return false;}
      if(!this.reserveDock(p,car)){car.state='dock';car.reason=p.id+' 이재부 사용 중';return false;}
      b.reserved+=q;car.stage='unloading';this.action(car,'unload',Model.handling(this.config,p,false),()=>{
        this.releaseDock(p);const job=car.job;b.reserved-=q;b.items.push(job);b.max=Math.max(b.max,this.contents(b));car.loaded=false;job.assigned=false;job.picked=false;car.completed+=q;if(this.time>=this.warmup)car.measuredCompleted+=q;
        this.legLogs.push({jobId:job.id,section:car.section.id,quantity:q,start:car.legStart,end:this.time,fromX:car.leg.from.x,toX:p.x});
        if(p.kind==='handoff'){job.legIndex++;job.status='buffer';job.ready=this.time;this.ready[job.legs[job.legIndex].section].add(job);this.pendingCargo+=q;}
        else{job.status='output';job.deliveredAt=this.time;this.delivered+=q;if(this.time>=this.warmup){this.measuredDelivered+=q;this.leads.push(this.time-job.arrival);}this.logs.push({id:job.id,from:job.from,to:job.to,quantity:q,arrival:job.arrival,dispatch:job.firstDispatch,complete:this.time,wait:job.firstDispatch-job.arrival,lead:this.time-job.arrival,measured:this.time>=this.warmup});this.startRelease(b);}
        car.job=null;car.leg=null;car.stage='return';
        if(this.config.parking==='home')this.travel(car,car.section.home,false,()=>{car.stage='idle';car.state='idle';});else{car.stage='idle';car.state='idle';}
      });return true;
    }
    startRelease(output){if(output.releaseScheduled||!output.items.length)return;output.releaseScheduled=true;const job=output.items[0];
      this.schedule(this.time+output.takeaway*job.quantity,'release',()=>{output.releaseScheduled=false;const delivered=output.items.shift();if(delivered!==job)throw Error('출고 버퍼 순서 오류');job.status='done';job.shippedAt=this.time;this.shipped+=job.quantity;if(this.time>=this.warmup)this.measuredShipped+=job.quantity;this.startRelease(output);});
    }
    pump(){for(const car of this.cars){if(car.active)continue;if(car.stage==='idle')this.dispatch(car);else if(car.stage==='waitLoad')this.tryLoad(car);else if(car.stage==='waitUnload')this.tryUnload(car);}this.maxQueue=Math.max(this.maxQueue,this.time>=this.warmup?this.queueCount():0);}
    advanceTo(target){if(!Number.isFinite(target)||target<this.time-EPS)throw Error('시간을 이전으로 이동하려면 동일 설정으로 리셋하세요.');target=Math.min(target,this.horizon);try{
      while(this.heap.peek()&&this.heap.peek().time<=target+EPS){const t=this.heap.peek().time;this.account(t);this.time=t;
        do{const event=this.heap.pop();if(++this.eventCount>1500000)throw Error('이벤트 1,500,000회 한도: 부분 결과입니다.');event.fn();}while(this.heap.peek()&&Math.abs(this.heap.peek().time-t)<1e-10);
        this.pump();
      }
      this.account(target);this.time=target;this.pump();
    }catch(e){this.failed=e.message;throw e;}return this;
    }
    pose(car){if(car.active?.profile)return{...M.at(car.active.profile,this.time-car.active.start),loaded:car.loaded};return{x:car.x,v:0,a:0,loaded:car.loaded};}
    sample(){this.series.push({time:this.time,queue:this.queueCount(),wip:this.created-this.shipped,delivered:this.delivered,shipped:this.shipped});}
    snapshot(){
      const measuredTime=Math.max(0,this.time-this.warmup),factor=measuredTime?3600/measuredTime:0;
      const waiting=this.jobs.filter(j=>(j.status==='waiting'||j.status==='buffer')&&!j.assigned).reduce((n,j)=>n+j.quantity,0),active=this.jobs.filter(j=>j.assigned||j.status==='active').reduce((n,j)=>n+j.quantity,0),output=Object.values(this.outputs).reduce((n,b)=>n+this.contents(b),0);
      const bufferCargo=Object.values(this.buffers).reduce((n,b)=>n+this.contents(b),0),oldest=this.jobs.filter(j=>(j.status==='waiting'||j.status==='buffer')&&!j.assigned).reduce((n,j)=>Math.max(n,this.time-j.arrival),0);
      const cars=this.cars.map(car=>{const busy=measuredTime?(measuredTime-car.stateTime.idle)/measuredTime:0,dist=car.emptyDistance+car.loadedDistance;return{id:car.section.id,name:car.section.name,...this.pose(car),state:car.state,reason:car.reason,stage:car.stage,job:car.job?.id||'',completed:car.completed,throughput:car.measuredCompleted*factor,stateTime:{...car.stateTime},busy,emptyRatio:dist?car.emptyDistance/dist:0,emptyDistance:car.emptyDistance,loadedDistance:car.loadedDistance,p95Wait:percentile(car.waits,.95)};});
      const sectionsBlocked=cars.filter(c=>c.state==='blocked'||c.state==='dock').length;
      const deadlock=sectionsBlocked>0&&!this.cars.some(c=>c.active)&&!this.heap.a.some(e=>e.type==='release');
      const measuredSeries=this.series.filter(s=>s.time>=this.warmup),part=Math.max(1,Math.floor(measuredSeries.length/4)),average=a=>a.length?a.reduce((n,p)=>n+p.queue,0)/a.length:0,first=average(measuredSeries.slice(0,part)),last=average(measuredSeries.slice(-part));
      return{time:this.time,horizon:this.horizon,measuredTime,complete:this.time>=this.horizon-EPS,created:this.created,delivered:this.delivered,shipped:this.shipped,measuredCreated:this.measuredCreated,measuredDelivered:this.measuredDelivered,measuredShipped:this.measuredShipped,
        throughput:this.measuredDelivered*factor,shippingRate:this.measuredShipped*factor,waiting,active,output,bufferCargo,wip:this.created-this.shipped,conserved:this.created===waiting+active+output+this.shipped,
        cargoDeliveredOnce:this.delivered<=this.created,oldest,p95Wait:percentile(this.waits,.95),meanWait:this.waits.length?this.waits.reduce((a,b)=>a+b,0)/this.waits.length:0,p95Lead:percentile(this.leads,.95),waitSamples:this.waits.length,meanQueue:measuredTime?this.queueArea/measuredTime:0,maxQueue:this.maxQueue,
        queueTrend:(last+1)/(first+1),saturated:last>first+2&&last>3,deadlock,failed:this.failed,cars,buffers:Object.values(this.buffers).map(b=>({id:b.id,x:b.x,capacity:b.capacity,count:this.contents(b),reserved:b.reserved,max:b.max})),stations:Object.values(this.outputs).map(b=>({id:b.id,count:this.contents(b),reserved:b.reserved,capacity:b.buffer,max:b.max,dockBusy:measuredTime?this.docks[b.id].busy/measuredTime:0})),eventCount:this.eventCount};
    }
  }
  function run(c){const e=new Engine(c);e.advanceTo(e.horizon);return e;}
  return{Heap,rng,percentile,interval95,Engine,run,states};
});
