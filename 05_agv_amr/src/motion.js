(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.AgvMotion=api;})(globalThis,function(){
'use strict';
const EPS=1e-9;
function profile(s,v,a,b,u0=0,u1=0){
  if(![s,v,a,b,u0,u1].every(Number.isFinite)||s<0||v<=0||a<=0||b<=0||u0<0||u1<0||Math.max(u0,u1)>v+EPS)throw Error('운동 입력 범위 오류');
  if(u1*u1>u0*u0+2*a*s+EPS||u0*u0>u1*u1+2*b*s+EPS)throw Error('실현 불가능한 경계속도');
  if(s===0)return {s,v,a,b,u0,u1,duration:0,peak:u0,phases:[]};
  const peak=Math.min(v,Math.sqrt((2*a*b*s+b*u0*u0+a*u1*u1)/(a+b))),ta=Math.max(0,(peak-u0)/a),tb=Math.max(0,(peak-u1)/b);
  const sa=(u0+peak)*ta/2,sb=(u1+peak)*tb/2,tc=Math.max(0,(s-sa-sb)/peak),phases=[];
  let t=0,x=0;
  for(const [dt,vel,acc]of [[ta,u0,a],[tc,peak,0],[tb,peak,-b]]){if(dt>EPS){phases.push({t,x,v:vel,a:acc,dt});x+=vel*dt+acc*dt*dt/2;t+=dt;}}
  return {s,v,a,b,u0,u1,duration:t,peak,phases};
}
function sample(p,t){if(t<=0)return {position:0,velocity:p.u0,acceleration:p.phases[0]?.a||0};if(t>=p.duration)return {position:p.s,velocity:p.u1,acceleration:0};const q=p.phases.find(q=>t<q.t+q.dt+EPS)||p.phases[p.phases.length-1],d=Math.max(0,Math.min(q.dt,t-q.t));return {position:q.x+q.v*d+q.a*d*d/2,velocity:Math.max(0,q.v+q.a*d),acceleration:q.a};}
function chain(segments,a,b){
  if(!segments.length)return [];
  const u=Array(segments.length+1).fill(Infinity);u[0]=0;u[u.length-1]=0;
  segments.forEach((s,i)=>{u[i]=Math.min(u[i],s.v);u[i+1]=Math.min(u[i+1],s.v);if(s.stopAfter)u[i+1]=0;});
  for(let i=0;i<segments.length;i++)u[i+1]=Math.min(u[i+1],Math.sqrt(u[i]*u[i]+2*a*segments[i].s));
  for(let i=segments.length-1;i>=0;i--)u[i]=Math.min(u[i],Math.sqrt(u[i+1]*u[i+1]+2*b*segments[i].s));
  return segments.map((s,i)=>profile(s.s,s.v,a,b,u[i],u[i+1]));
}
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
function pointSegment(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d)):0;return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);}
function segmentDistance(a,b,c,d){
  const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x),c1=cross(a,b,c),c2=cross(a,b,d),c3=cross(c,d,a),c4=cross(c,d,b);
  if(c1*c2<0&&c3*c4<0)return 0;
  return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}
function makeRoute(points,edges,vehicle,loaded,startHeading=0){
  if(points.length<2)return {duration:0,distance:0,phases:[],points,heading:startHeading};
  const v=loaded?vehicle.loadedV:vehicle.emptyV,a=loaded?vehicle.loadedA:vehicle.emptyA,b=loaded?vehicle.loadedB:vehicle.emptyB;
  const headings=edges.map((e,i)=>Math.atan2(points[i+1].y-points[i].y,points[i+1].x-points[i].x));
  const segs=edges.map((e,i)=>({s:Math.hypot(points[i+1].x-points[i].x,points[i+1].y-points[i].y),v:Math.min(v,e.speed),stopAfter:points[i+1].stop||i===edges.length-1||Math.abs(angle(headings[i+1]-headings[i]))>1e-6||edges[i+1]?.door>0}));
  const profiles=chain(segs,a,b),phases=[];let t=0,heading=startHeading;
  edges.forEach((e,i)=>{
    const delta=angle(headings[i]-heading);
    if(vehicle.turning&&Math.abs(delta)>1e-6){const p=profile(Math.abs(delta),vehicle.omega,vehicle.alpha,vehicle.alpha);phases.push({kind:'turn',start:t,duration:p.duration,profile:p,from:points[i],heading,delta});t+=p.duration;}
    heading=headings[i];
    if(e.door>0){phases.push({kind:'door',start:t,duration:e.door,from:points[i],heading,edgeId:e.id});t+=e.door;}
    phases.push({kind:'move',start:t,duration:profiles[i].duration,profile:profiles[i],from:points[i],to:points[i+1],heading,edgeId:e.id});t+=profiles[i].duration;
  });
  return {duration:t,distance:segs.reduce((s,p)=>s+p.s,0),phases,points,heading};
}
function pose(route,t){
  if(!route.phases.length){const p=route.points[0]||{x:0,y:0};return {x:p.x,y:p.y,heading:route.heading,speed:0};}
  if(t>=route.duration){const p=route.points[route.points.length-1];return {x:p.x,y:p.y,heading:route.heading,speed:0};}
  const p=route.phases.find(p=>t<p.start+p.duration)||route.phases[route.phases.length-1],dt=Math.max(0,t-p.start);
  if(p.kind==='door')return {x:p.from.x,y:p.from.y,heading:p.heading,speed:0};
  const m=sample(p.profile,dt);
  if(p.kind==='turn')return {x:p.from.x,y:p.from.y,heading:p.heading+Math.sign(p.delta)*m.position,speed:0};
  const f=p.profile.s?m.position/p.profile.s:1;
  return {x:p.from.x+(p.to.x-p.from.x)*f,y:p.from.y+(p.to.y-p.from.y)*f,heading:p.heading,speed:m.velocity};
}
return {profile,sample,chain,makeRoute,pose,angle,pointSegment,segmentDistance};
});
