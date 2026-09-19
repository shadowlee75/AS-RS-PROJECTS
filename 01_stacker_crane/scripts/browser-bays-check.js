// Local browser verification fallback, as in browser-depth-check.js.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.STC_PLAYWRIGHT_PATH || path.join(os.tmpdir(),'stc-depth-browser/node_modules/playwright'));
const Model=require('../src/model.js'),E=require('../src/engine.js');
const base=path.resolve(__dirname,'..'),qa=path.join(os.tmpdir(),'stc-bays-qa');fs.mkdirSync(qa,{recursive:true});
(async()=>{
 const checks=[],errors=[],network=[],results=[];
 const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name);};
 for(const rackDepth of ['single','double']){
  const config={...Model.defaults,bays:106,levels:14,rackDepth};
  const result=Model.calculate(config),fleet=new E.Fleet(config);fleet.advanceTo(fleet.horizon);
  check(rackDepth+' 106 x 14 calculates every cell and conserves jobs',result.cells===106*14*2*Model.depthCount(config) && Number.isFinite(result.theory) && fleet.snapshot().conservation && fleet.snapshot().jobsConserved);
  check(rackDepth+' 106 x 14 FEM resolves actual cells',Model.calculate({...config,method:'fem'}).fem.inbound.every(c=>c.id>=0));
  results.push({rackDepth,cells:result.cells,theory:result.theory,sc:result.sc,dc:result.dc});
 }
 check('200 Bays accepted',Model.validate({...Model.defaults,bays:200}).bays===200);
 for(const bays of [0,106.5,201]) assert.throws(()=>Model.validate({...Model.defaults,bays}));
 assert.throws(()=>Model.validate({...Model.defaults,bays:200,levels:30,rackDepth:'double',cranes:6}),/120,000/);
 check('invalid Bays and total cell limit still rejected',true);
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1600,height:1050},acceptDownloads:true});
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});await page.route(/^https?:/,r=>r.abort());
 await page.addInitScript(()=>{
  let api;Object.defineProperty(window,'STCScene',{configurable:true,get:()=>api,set:value=>{
   const Original=value.Scene;value.Scene=class extends Original{constructor(...args){super(...args);window.qaScene=this;}};api=value;
  }});
 });
 const apply=async()=>{await page.locator('#calculate').click();await page.waitForFunction(()=>document.body.dataset.dirty==='false');};
 try{
  await page.goto(pathToFileURL(path.join(base,'../스태커크레인_실행.html')).href);
  check('deployed input allows 1-200 Bays',await page.locator('#bays').getAttribute('max')==='200');
  await page.locator('#bays').fill('106');await page.locator('#levels').fill('14');await apply();
  check('106 Bays accepted in UI with correct single capacity',!await page.locator('#error').isVisible() && await page.locator('#bays').evaluate(e=>e.validity.valid) && (await page.locator('#rackCount').innerText()).includes('2,968셀'));
  await page.locator('#rackDepth').selectOption('double');await apply();
  check('double-deep capacity uses all 106 Bays',(await page.locator('#rackCount').innerText()).includes('5,936셀'));
  await page.locator('.sidebar').evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(qa,'01-106-bays.png')});
  await page.locator('[data-tab=simulation]').click();await page.locator('#cellBay').fill('106');await page.locator('#cellLevel').fill('14');await page.locator('#cellDepth').selectOption('2');await page.locator('#findCell').click();
  check('3D includes every cell and labels the last Bay',await page.evaluate(()=>!qaScene.fallback && qaScene.loads.count===5936 && qaScene.labels.filter(p=>p.userData.axis==='bays').every(p=>p.userData.values.length===106 && p.userData.values.at(-1)==='106')));
  check('last rear cell can be selected',(await page.locator('#cellInfo').innerText()).includes('-106-14-D2'));
  await page.screenshot({path:path.join(qa,'02-last-bay-3d.png')});
  await page.locator('[data-tab=motion]').click();await page.locator('#previewBay').fill('106');await page.locator('#previewLevel').fill('14');await page.locator('#previewDepth').selectOption('2');await page.locator('#refreshMotion').click();
  check('motion preview reaches Bay 106',(await page.locator('#previewDescription').innerText()).includes('-106-14-D2'));
  const pending=page.waitForEvent('download');await page.locator('#saveProject').click();const d=await pending;const saved=path.join(qa,'106-bay-project.json');await d.saveAs(saved);
  const project=JSON.parse(fs.readFileSync(saved,'utf8'));check('saved project retains 106 Bays and 14 levels',project.config.bays===106 && project.config.levels===14 && project.config.rackDepth==='double');
  await page.locator('#bays').fill('201');await page.locator('#calculate').click();check('above-limit error clearly states 200',(await page.locator('#error').innerText()).includes('200'));
  await page.locator('#bays').fill('200');await page.locator('#levels').fill('1');await apply();await page.locator('[data-tab=simulation]').click();
  check('maximum Bay count renders all labels',await page.evaluate(()=>qaScene.labels.filter(p=>p.userData.axis==='bays').every(p=>p.userData.values.length===200 && p.userData.values.at(-1)==='200')));
  await page.locator('#projectFile').setInputFiles(saved);await page.waitForFunction(()=>document.body.dataset.dirty==='false' && document.getElementById('bays').value==='106');
  check('saved 106-Bay project reloads',await page.locator('#levels').inputValue()==='14' && (await page.locator('#rackCount').innerText()).includes('5,936셀'));
  check('no JavaScript errors or external requests',!errors.length && !network.length);
  fs.writeFileSync(path.join(qa,'results.json'),JSON.stringify({checks:checks.length,passed:checks,errors,network,results},null,2));console.log('Evidence: '+qa);
 }catch(e){await page.screenshot({path:path.join(qa,'failure.png')});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
