const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),M=require('../src/motion'),Model=require('../src/model');
const file=path.resolve(__dirname,'../../../2. Loop RGV/loop-rgv-calculator(2).html'),source=fs.readFileSync(file,'utf8');
const start=source.indexOf('    const defaults = {'),end=source.indexOf('    function trackLengthMm',start),fnStart=source.indexOf('    function mpm('),fnEnd=source.indexOf('    function bindInputs()',fnStart);
assert.ok(start>=0&&end>start&&fnStart>0&&fnEnd>fnStart);
const ctx=vm.createContext({});vm.runInContext('const fmt=n=>String(n);\n'+source.slice(start,end)+'\n'+source.slice(fnStart,fnEnd)+'\nglobalThis.old=derive(defaults);',ctx);
assert.equal(ctx.old.errors.length,0);
const distances=[10.458,10.460],rows=distances.map(distance=>({distance,legacySeconds:ctx.old.travel(distance,'legacy').time,legacyContinuousSeconds:ctx.old.travel(distance,'continuous').time,physicalSeconds:M.solve(0,distance,{v:100/60,a:.3,d:.3},[{from:distance-1.2,to:distance-.8,v:30/60},{from:distance-.8,to:distance,v:5/60}]).duration}));
assert.ok(rows[1].legacySeconds-rows[0].legacySeconds>9);assert.ok(Math.abs(rows[1].physicalSeconds-rows[0].physicalSeconds)<.03);
const n1=ctx.old.cycle(1).emptyDist,n8=ctx.old.cycle(8).emptyDist,c=Model.clone(Model.defaults),new1=Model.calculate({...c,vehicles:1}).emptyDistance,new8=Model.calculate(c).emptyDistance;assert.equal(new1,new8);assert.ok(n8<n1);
const report={source:path.relative(path.resolve(__dirname,'..'),file),sha256:crypto.createHash('sha256').update(source).digest('hex'),sourceFunctions:'defaults + mpm/forward/weightedDistances/derive (direct extraction)',dFixed:ctx.old.dFixed,rows,emptyDistance:{legacyN1:n1,legacyN8:n8,newN1:new1,newN8:new8},note:'신규 선도는 동일 속도·가감속에 마지막 1.2m 중속, 마지막 0.8m 저속이라는 공간 제한을 적용. 레거시 7구간과 해석이 다르므로 동일 시간 일치는 요구하지 않음. 기존 Python 35건은 소스가 없어 실행하지 않음.'};
fs.writeFileSync(path.resolve(__dirname,'../qa/legacy-comparison.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));

