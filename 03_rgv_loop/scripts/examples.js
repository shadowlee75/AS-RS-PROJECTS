const fs=require('node:fs'),path=require('node:path'),Model=require('../src/model'),R=require('../src/report'),E=require('../src/engine');
const results=[];for(const [key,file]of [['default','01_다차량_기본'],['single','02_단일차량'],['congested','03_출고버퍼_정체'],['block','04_고정블록'],['history','05_작업이력']]){const c=Model.preset(key),a=Model.calculate(c),s=E.run(c).snapshot();fs.writeFileSync(path.resolve(__dirname,'../examples/'+file+'.json'),JSON.stringify(Model.pack(c),null,2));results.push({example:file,vehicles:c.vehicles,demand:a.total,empirical:a.current.available,theory:a.current.theory,simulation:s});}
fs.writeFileSync(path.resolve(__dirname,'../examples/작업이력_양식.csv'),R.csv([['time_s','from','to','quantity'],[0,'P1','D1',1],[20,'P2','D2',1],[100,'D2','P1',1]]));
fs.writeFileSync(path.resolve(__dirname,'../qa/example-results.json'),JSON.stringify(results,null,2));console.log(results.map(r=>r.example+': '+r.simulation.throughput+'/h, conservation '+r.simulation.conserved).join('\n'));

