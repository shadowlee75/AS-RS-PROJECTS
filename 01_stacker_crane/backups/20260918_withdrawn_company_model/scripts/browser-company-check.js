// Local browser fallback: connected Browser runtime has no available browser.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.STC_PLAYWRIGHT_PATH||path.join(os.tmpdir(),'stc-depth-browser/node_modules/playwright'));
const base=path.resolve(__dirname,'..'),qa=path.join(base,'qa/company-comparison-20260918/browser');fs.mkdirSync(qa,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1600,height:1050},acceptDownloads:true});
 const page=await context.newPage(),errors=[],network=[],checks=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
 context.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});await context.route(/^https?:/,r=>r.abort());
 const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name);};
 const download=async(button,name)=>{const p=page.waitForEvent('download');await page.locator(button).click();const d=await p;const f=path.join(qa,name);await d.saveAs(f);return fs.readFileSync(f,'utf8');};
 const apply=async()=>{await page.locator('#calculate').click();await page.waitForFunction(()=>document.body.dataset.dirty==='false');};
 try{
  await page.goto(pathToFileURL(path.join(base,'../스태커크레인_실행.html')).href);
  check('default boots without changing the old motion model',await page.locator('#motionModel').inputValue()==='stop');
  await page.locator('#companyFile').setInputFiles(path.join(base,'../참고 및 검증 자료/INQUIRY_인도'));
  await page.waitForFunction(()=>document.getElementById('motionModel').value==='creep'&&document.body.dataset.dirty==='false');
  check('company file imports all input and output values',(await page.locator('#cycleSummary').innerText()).includes('86.30')&&(await page.locator('#cycleSummary').innerText()).includes('143.47')&&(await page.locator('#cycleSummary').innerText()).includes('35.5 / 42.7'));
  check('company geometry and efficiency applied',(await page.locator('#rackCount').innerText()).includes('2,968')&&await page.locator('#Ew').inputValue()==='0.85'&&await page.locator('#pointMode').inputValue()==='continuous');
  check('low speed uses m/min',await page.locator('#lowVy').inputValue()==='5'&&await page.locator('#vy').inputValue()==='50');
  const saved=JSON.parse(await download('#saveProject','company-project.json'));
  check('saved project retains complete comparison settings',saved.config.motionModel==='creep'&&saved.config.stroke===2.5825&&saved.config.lowVy===5/60&&saved.config.position===0);
  const md=await download('#report','company-report.md');check('Markdown includes mode, inputs and both corrected rates',['저속 접근 모드','35.458','42.6568','최소 접근거리'].every(t=>md.includes(t)));
  await page.screenshot({path:path.join(qa,'01-company-results.png')});
  await page.locator('#motionModel').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(qa,'02-company-inputs.png')});
  await page.locator('#speedUnit').selectOption('m/s');check('low speed converted on unit change',Math.abs(Number(await page.locator('#lowVy').inputValue())-5/60)<1e-10);
  await apply();check('unit change preserves calculated time',(await page.locator('#cycleSummary').innerText()).includes('143.47'));
  await page.locator('#speedUnit').selectOption('m/min');await apply();
  await page.locator('#lowVx').fill('181');await page.locator('#calculate').click();check('invalid low speed shows field-specific error',await page.locator('#lowVx').getAttribute('aria-invalid')==='true');
  await page.locator('#lowVx').fill('5');await apply();
  await page.locator('[data-tab=motion]').click();check('motion identifies continuous representative coordinates',(await page.locator('#previewDescription').innerText()).includes('연속 대표점'));
  await page.locator('#motionSeek').fill('500');await page.locator('#motionSeek').dispatchEvent('input');await page.screenshot({path:path.join(qa,'03-motion.png')});
  await page.locator('#pdfReport').click();const pp=page.waitForEvent('popup');await page.locator('#createPdfReport').click();const report=await pp;await report.waitForLoadState('domcontentloaded');
  const rt=await report.locator('body').innerText();check('PDF report includes low speed input and timing model',['저속 접근','최소 접근거리','86.299','143.471'].every(t=>rt.includes(t)));
  check('PDF report tables stay inside their sections',!await report.evaluate(()=>[...document.querySelectorAll('table')].some(e=>e.getBoundingClientRect().right>e.closest('section').getBoundingClientRect().right+3)));
  await report.screenshot({path:path.join(qa,'04-report.png'),fullPage:true});fs.writeFileSync(path.join(qa,'company-report.html'),await report.content());await report.close();
  await page.locator('[data-tab=simulation]').click();await page.locator('#simFinish').click();await page.waitForFunction(()=>document.getElementById('measureStatus').textContent==='측정 종료');
  check('simulation completes with low-speed model',(await page.locator('#measureStatus').innerText())==='측정 종료');await page.screenshot({path:path.join(qa,'05-simulation.png')});
  await page.locator('#companyFile').setInputFiles({name:'bad',mimeType:'text/plain',buffer:Buffer.from('invalid')});await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('실패'));
  check('invalid company file leaves current inputs intact',await page.locator('#stroke').inputValue()==='2.5825');
  await page.locator('#projectFile').setInputFiles(path.join(qa,'company-project.json'));await page.waitForFunction(()=>document.body.dataset.dirty==='false');
  check('imported project reloads identical time',(await page.locator('#cycleSummary').innerText()).includes('143.47'));
  await page.setViewportSize({width:390,height:844});await page.locator('[data-tab=overview]').click();await page.screenshot({path:path.join(qa,'06-mobile.png')});
  check('mobile page does not overflow horizontally',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  check('no browser script errors',errors.length===0);check('offline only',network.length===0);
  fs.writeFileSync(path.join(qa,'results.json'),JSON.stringify({checks,errors,network},null,2));
 }catch(error){await page.screenshot({path:path.join(qa,'failure.png'),fullPage:true});fs.writeFileSync(path.join(qa,'failure.json'),JSON.stringify({error:error.stack,errors},null,2));throw error;}
 finally{await browser.close();}
})();
