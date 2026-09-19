(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./model'));else root.LoopTables=factory(root.LoopModel);})(globalThis,function(Model){
  'use strict';
  // Reconcile editable demand tables; transport physics remain in model/engine.
  function modes(c){return {odTableMode:c.odTableMode||'paired',periodTableMode:c.periodTableMode||(c.profile?.length?'manual':'hourly')};}
  function paired(stations){
    const groups=new Map(),warnings=[];
    for(const s of stations){const m=/^([PD])(\d+)$/i.exec(s.id);if(!m)continue;const number=m[2].replace(/^0+(?=\d)/,''),g=groups.get(number)||{P:[],D:[]};g[m[1].toUpperCase()].push(s.id);groups.set(number,g);}
    const pairs=[];for(const[number,g]of groups){if(g.P.length===1&&g.D.length===1)pairs.push({from:g.P[0],to:g.D[0]});else if(g.P.length>1||g.D.length>1)warnings.push(number+'번 P/D ID가 여러 개여서 자동 연결을 생략했습니다.');}
    return {pairs,warnings};
  }
  function hourly(c){
    const end=c.warmup+c.hours*60;if(!Number.isFinite(end)||c.hours<=0||c.hours>Model.LIMITS.hours||c.warmup<0||c.warmup>120)throw Error('측정시간과 준비운전 시간을 먼저 확인하세요.');
    const bounds=[0];if(c.warmup>0)bounds.push(c.warmup);for(let t=c.warmup+60;t<end-1e-8;t+=60)bounds.push(t);bounds.push(end);
    return bounds.slice(0,-1).map((start,i)=>({start,end:bounds[i+1],multiplier:c.profile.find(p=>p.start<=start+1e-8&&p.end>start+1e-8)?.multiplier??1}));
  }
  function reconcile(input,{renames={},rebuildProfile=false}={}){
    const c=Model.clone(input);Object.assign(c,modes(c));
    const ids=new Set();for(const s of c.stations){if(!/^[A-Za-z0-9_-]{1,30}$/.test(s.id)||ids.has(s.id))throw Error('스테이션 ID를 중복 없는 영문·숫자·_·-로 입력하면 OD 표가 자동 갱신됩니다.');ids.add(s.id);}
    for(const key of ['ods','history'])for(const o of c[key])for(const f of ['from','to'])if(Object.hasOwn(renames,o[f])&&ids.has(renames[o[f]]))o[f]=renames[o[f]];
    const removed=c.ods.filter(o=>!ids.has(o.from)||!ids.has(o.to)),orphanedHistory=c.history.filter(o=>!ids.has(o.from)||!ids.has(o.to));
    c.ods=c.ods.filter(o=>ids.has(o.from)&&ids.has(o.to));
    const added=[],{pairs,warnings}=paired(c.stations),existing=new Set(c.ods.map(o=>JSON.stringify([o.from,o.to]))),odIds=new Set(c.ods.map(o=>o.id));let n=1;
    if(c.odTableMode==='paired')for(const pair of pairs){const key=JSON.stringify([pair.from,pair.to]);if(existing.has(key))continue;while(odIds.has('OD'+n))n++;const row={id:'OD'+n++,...pair,rate:0};odIds.add(row.id);existing.add(key);added.push(row);c.ods.push(row);}
    if(c.ods.length>Model.LIMITS.ods)throw Error('자동 생성 후 OD는 '+c.ods.length+'개입니다. 최대 '+Model.LIMITS.ods+'개에 맞게 사용하지 않는 OD를 정리하세요.');
    const profileCreated=c.periodTableMode==='hourly'&&(!c.profile.length||rebuildProfile);if(profileCreated)c.profile=hourly(c);
    return {config:c,removed,added,orphanedHistory,profileCreated,warnings,pairCount:pairs.length};
  }
  return {modes,paired,hourly,reconcile};
});
