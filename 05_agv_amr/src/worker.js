'use strict';
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
async function execute(config,progress){const sim=new AgvEngine.Simulation(config);while(!sim.done){const state=sim.stepBatch(1000);progress?.(state);await pause();}return sim.result();}
self.onmessage=async({data})=>{try{if(data.type==='run'){const run=await execute(data.config,s=>self.postMessage({type:'progress',...s}));self.postMessage({type:'result',run});}
  else if(data.type==='sweep'){
    let completed=0;const total=data.cases.length*data.repeats;
    for(const item of data.cases){
      const rows=[];
      for(let r=0;r<data.repeats;r++){
        const p=AgvModel.clone(item.config);p.seed=(p.seed+data.seedOffset+r*104729)>>>0;
        const run=await execute(p,s=>self.postMessage({type:'sweepProgress',completed,total,progress:s.progress}));
        rows.push({seed:p.seed,metrics:run.metrics,assessment:AgvEngine.assess(run),audit:run.audit});completed++;
      }
      const valid=rows.filter(x=>x.audit.ok&&!x.metrics.failures),ci=AgvEngine.confidence(valid.map(x=>x.metrics.throughput)),target=AgvModel.analytics(item.config).qty*item.config.goals.throughputRatio,ciPass=ci.low!==null&&ci.low>=target;
      const issues=[...new Set(rows.flatMap(x=>x.assessment.issues))];if(data.repeats<3)issues.push('반복 표본 부족');if(!ciPass)issues.push('처리량 신뢰하한 미달/미확정');
      const eligible=valid.length===rows.length&&rows.every(x=>x.assessment.eligible)&&data.repeats>=3&&ciPass;
      const result={fleet:item.fleet,chargers:item.chargers,routing:item.routing,label:item.fleet+'대 / 충전 '+item.chargers+' / '+(item.routing==='dynamic'?'동적':'고정'),ci,maxP95:rows.some(x=>x.metrics.p95===null)?null:Math.max(...rows.map(x=>x.metrics.p95)),maxBacklog:Math.max(...rows.map(x=>x.metrics.backlog)),failed:rows.length-valid.length,eligible,labelStatus:eligible?'조건 충족 · 현장 검증 전':issues.join(', '),rows,config:AgvModel.clone(item.config),configHash:AgvModel.hash(item.config),horizon:item.config.horizon,warmup:item.config.warmup,seedGroup:data.seedOffset?'independent-validation':'exploration'};
      self.postMessage({type:'experiment',result,completed});
    }
    self.postMessage({type:'sweepDone'});
  }
}catch(e){self.postMessage({type:'error',message:e.stack||e.message});}};
