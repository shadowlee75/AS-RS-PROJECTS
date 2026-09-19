const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=path.resolve(__dirname,'..'),html=fs.readFileSync(path.resolve(base,'../직선RGV_실행.html'),'utf8'),modules=new Map();
assert.ok(!/<script[^>]+src=/i.test(html));assert.ok(!/<link[^>]+href=/i.test(html));
for(const match of html.matchAll(/<script\s+data-module="([^"]+)"[^>]*>\n([\s\S]*?)\n<\/script>/g)){assert.ok(!modules.has(match[1]));modules.set(match[1],match[2]);}
const manifest=JSON.parse(fs.readFileSync(path.join(base,'qa/build-manifest.json'),'utf8'));
assert.deepEqual([...modules.keys()],['three.min','OrbitControls','motion','model','engine','view','report','scene','blender-models','app']);
for(const [id,code]of modules){new vm.Script(code,{filename:id+'.js'});assert.equal(crypto.createHash('sha256').update(code).digest('hex'),manifest.modules[id]);assert.equal(code,fs.readFileSync(path.join(base,manifest.sources[id]),'utf8'));}
const context=vm.createContext({console});vm.runInContext('Math.random = function(){throw Error("Use seeded random");};',context);
for(const id of ['motion','model','engine','view','report','scene'])vm.runInContext(modules.get(id),context,{filename:id+'.js'});
let count=0;require('../tests/invariants.js')({M:context.RGVMotion,Model:context.RGVModel,E:context.RGVEngine,R:context.RGVReport},(name,fn)=>{fn();count++;});
let sceneCount=0;require('../tests/scene-invariants.js')({Model:context.RGVModel,E:context.RGVEngine,S:context.RGVScene},(name,fn)=>{fn();sceneCount++;});
const checks={invariantGroups:count,sceneInvariantGroups:sceneCount,inlineModules:modules.size,sha256Matched:true,seededOnly:true,noExternalRuntime:true};fs.writeFileSync(path.join(base,'qa/shipcheck.json'),JSON.stringify(checks,null,2));console.log('SHIPCHECK '+JSON.stringify(checks));
