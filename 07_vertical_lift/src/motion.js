(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LiftMotion=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='1.0.0', EPS=1e-9;
  // Continuous boundary-speed solver. Coordinates are metres; time is seconds.
  function solve(from,to,spec,zones=[],stops=[]){
    const {v,a,d}=spec;
    if(![from,to,v,a,d].every(Number.isFinite)||Math.min(v,a,d)<=0)throw Error('이동 좌표는 유한한 수, 속도·가감속은 양수여야 합니다.');
    const sign=Math.sign(to-from)||1, length=Math.abs(to-from), phases=[];
    if(length<EPS)return{from,to,sign,length,duration:0,peak:0,phases,boundaries:[0],speeds:[0]};
    const mapped=zones.map(z=>({start:Math.min((z.from-from)*sign,(z.to-from)*sign),end:Math.max((z.from-from)*sign,(z.to-from)*sign),v:z.v}));
    for(const z of mapped)if(![z.start,z.end,z.v].every(Number.isFinite)||z.v<=0)throw Error('속도제한 값이 올바르지 않습니다.');
    const stopPoints=stops.map(s=>(s-from)*sign).filter(s=>s>EPS&&s<length-EPS);
    const raw=[0,length,...mapped.flatMap(z=>[z.start,z.end]).filter(x=>x>EPS&&x<length-EPS),...stopPoints].sort((a,b)=>a-b);
    const x=raw.filter((n,i)=>i===0||n-raw[i-1]>EPS), caps=x.slice(1).map((p,i)=>{
      const middle=(p+x[i])/2;return Math.min(v,...mapped.filter(z=>middle>=z.start-EPS&&middle<=z.end+EPS).map(z=>z.v));
    });
    const speed=x.map((p,i)=>i===0||i===x.length-1||stopPoints.some(s=>Math.abs(s-p)<EPS)?0:Math.min(caps[i-1],caps[i]));
    for(let i=1;i<x.length;i++)speed[i]=Math.min(speed[i],Math.sqrt(speed[i-1]**2+2*a*(x[i]-x[i-1])));
    for(let i=x.length-2;i>=0;i--)speed[i]=Math.min(speed[i],Math.sqrt(speed[i+1]**2+2*d*(x[i+1]-x[i])));
    let t=0,p=0,velocity=0,peak=0;
    function phase(dt,acc,label){if(dt<EPS)return;phases.push({start:t,duration:dt,p,v:velocity,a:acc,label});p+=velocity*dt+acc*dt*dt/2;velocity+=acc*dt;t+=dt;}
    for(let i=0;i<caps.length;i++){
      const s=x[i+1]-x[i], u=speed[i],w=speed[i+1];p=x[i];velocity=u;
      const top=Math.min(caps[i],Math.sqrt((2*s+u*u/a+w*w/d)/(1/a+1/d)));
      peak=Math.max(peak,top);const up=Math.max(0,(top-u)/a),down=Math.max(0,(top-w)/d);
      const cruise=Math.max(0,s-(top*top-u*u)/(2*a)-(top*top-w*w)/(2*d));
      phase(up,a,'가속');phase(cruise/top,0,'정속');phase(down,-d,'감속');
      if(i<caps.length-1&&stopPoints.some(k=>Math.abs(k-x[i+1])<EPS)&&spec.stopDwell>0){velocity=0;phase(spec.stopDwell,0,'중간 정지');}
    }
    return{from,to,sign,length,duration:t,peak,phases,boundaries:x,speeds:speed};
  }
  function at(profile,time){
    if(time<0)return{x:profile.from,v:0,a:0,label:'대기'};
    if(time>=profile.duration-EPS||!profile.phases.length)return{x:profile.to,v:0,a:0,label:'정지'};
    const phase=profile.phases.find(p=>time<p.start+p.duration-EPS)||profile.phases.at(-1),dt=Math.max(0,Math.min(phase.duration,time-phase.start));
    return{x:profile.from+profile.sign*(phase.p+phase.v*dt+phase.a*dt*dt/2),v:profile.sign*(phase.v+phase.a*dt),a:profile.sign*phase.a,label:phase.label};
  }
  return{VERSION,solve,at};
});
