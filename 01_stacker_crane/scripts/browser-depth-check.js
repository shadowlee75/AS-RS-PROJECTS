// Local browser fallback: connected Browser runtime reported no available browsers.
'use strict';
const fs=require('node:fs'), path=require('node:path'), os=require('node:os'), assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.STC_PLAYWRIGHT_PATH || path.join(os.tmpdir(),'stc-depth-browser/node_modules/playwright'));
const Model=require('../src/model.js');
const base=path.resolve(__dirname,'..'), qa=path.join(os.tmpdir(),'stc-depth-qa');
fs.mkdirSync(qa,{recursive:true});
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1600,height:1050},acceptDownloads:true});
  const checks=[],errors=[],network=[];
  page.on('pageerror',e=>errors.push(e.message)); page.on('request',r=>{if(/^https?:/.test(r.url())) network.push(r.url());});
  await page.route(/^https?:/,r=>r.abort());
  await page.addInitScript(()=>{
    for(const [name,type,capture] of [['STCScene','Scene','qaScene'],['STCEngine','Fleet','qaFleet']]){
      let api;Object.defineProperty(window,name,{configurable:true,get:()=>api,set:value=>{
        const Original=value[type]; value[type]=class extends Original{constructor(...args){super(...args);window[capture]=this;}};api=value;
      }});
    }
  });
  const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name);};
  const apply=async()=>{await page.locator('#calculate').click();await page.waitForFunction(()=>document.body.dataset.dirty==='false',{},{timeout:10000});};
  const download=async(button,name)=>{const pending=page.waitForEvent('download');await page.locator(button).click();const d=await pending;const file=path.join(qa,name);await d.saveAs(file);return fs.readFileSync(file,'utf8');};
  try{
    await page.goto(pathToFileURL(path.join(base,'../스태커크레인_실행.html')).href);
    check('default single-deep project boots',await page.locator('#rackDepth').inputValue()==='single' && (await page.locator('#rackCount').innerText()).includes('600셀'));
    check('rear stroke is hidden and disabled for single-deep',!await page.locator('#rearStroke').isVisible() && await page.locator('#rearStroke').isDisabled());
    await page.locator('#rackDepth').selectOption('double');
    check('depth selector marks results stale and exposes rear input',await page.locator('#dirtyNotice').isVisible() && await page.locator('#rearStroke').isVisible());
    await page.locator('#rearStroke').fill('1');await page.locator('#calculate').click();
    check('invalid rear reach gives field-specific error',(await page.locator('#error').innerText()).includes('뒷열') && await page.locator('#rearStroke').getAttribute('aria-invalid')==='true');
    await page.locator('#rearStroke').fill('2.8');await apply();
    check('double-deep capacity and calculation assumptions visible',(await page.locator('#rackCount').innerText()).includes('1,200셀') && (await page.locator('#analysisNotice').innerText()).includes('50:50'));
    check('header badge follows selected depth',(await page.locator('#depthBadge').innerText()).includes('Double Deep'));
    const saved=JSON.parse(await download('#saveProject','double-project.json'));
    check('JSON persists depth and rear reach',saved.config.rackDepth==='double' && saved.config.rearStroke===2.8);
    const md=await download('#report','double-report.md');
    check('MD includes depth, reach, capacity and access limits',['더블딥','2.8','1200','재배치'].every(t=>md.includes(t)));
    await page.locator('.sidebar').evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(qa,'01-depth-selection.png')});
    await page.locator('[data-tab=simulation]').click();
    check('3D uses every depth cell and expanded aisle clearance',await page.evaluate(()=>!qaScene.fallback && qaScene.loads.count===1200 && qaScene.stride>=8.1 && qaScene.rack.some(c=>c.depth===2 && Math.abs(c.z)===2.8)));
    await page.locator('#cellDepth').selectOption('2');await page.locator('#findCell').click();
    check('rear cell can be selected by address',(await page.locator('#cellInfo').innerText()).includes('-D2') && await page.evaluate(()=>Math.abs(qaScene.highlight.position.z)===2.8));
    await page.locator('#simFinish').click();await page.waitForFunction(()=>document.getElementById('measureStatus').textContent==='측정 종료');
    check('completed simulation preserves inventory and jobs',await page.evaluate(()=>qaFleet.snapshot().conservation && qaFleet.snapshot().jobsConserved));
    const csv=await download('#exportSim','double-jobs.csv');check('completed job CSV identifies depths',/-D[12]/.test(csv));
    await page.screenshot({path:path.join(qa,'02-double-3d.png')});
    await page.locator('[data-tab=motion]').click();await page.locator('#previewDepth').selectOption('2');await page.locator('#previewOutDepth').selectOption('2');await page.locator('#refreshMotion').click();
    check('motion selector uses actual rear stroke and depth addresses',(await page.locator('#previewDescription').innerText()).includes('-D2') && (await page.locator('#phaseTable').innerText()).includes('2.80'));
    await page.screenshot({path:path.join(qa,'03-rear-motion.png')});
    await page.locator('#pdfReport').click();const popup=page.waitForEvent('popup');await page.locator('#createPdfReport').click();const report=await popup;await report.waitForLoadState('domcontentloaded');
    const reportText=await report.locator('body').innerText();
    check('print report includes depth specifications and assumptions',['더블딥','뒷열','2.8','재배치'].every(t=>reportText.includes(t)));
    check('print tables fit page width',!await report.evaluate(()=>[...document.querySelectorAll('table')].some(e=>e.getBoundingClientRect().right>e.closest('section').getBoundingClientRect().right+3)));
    await report.screenshot({path:path.join(qa,'04-print-report.png'),fullPage:true});await report.close();
    await page.locator('#rackDepth').selectOption('single');await apply();
    check('switching back restores capacity and resets rear selections',(await page.locator('#rackCount').innerText()).includes('600셀') && await page.locator('#previewDepth').inputValue()==='1' && await page.locator('#cellDepth').isDisabled());
    await page.locator('#projectFile').setInputFiles({name:'double.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    await page.waitForFunction(()=>document.body.dataset.dirty==='false' && document.getElementById('rackDepth').value==='double');
    check('saved project reload restores double-deep UI',await page.locator('#rearStroke').inputValue()==='2.8' && (await page.locator('#rackCount').innerText()).includes('1,200셀'));
    await page.locator('[data-tab=overview]').click();await page.locator('#method').selectOption('fem');await apply();
    check('FEM analysis includes rear depth average',(await page.locator('#analysisNotice').innerText()).includes('50:50'));
    await page.locator('[data-tab=motion]').click();await page.locator('#previewDepth').selectOption('2');await page.locator('#refreshMotion').click();
    check('FEM preview accepts D2',(await page.locator('#previewDescription').innerText()).includes('-D2'));
    const legacy=Model.pack(Model.defaults);delete legacy.config.rackDepth;delete legacy.config.rearStroke;legacy.moduleVersion='0.3.0';
    await page.locator('#projectFile').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
    await page.waitForFunction(()=>document.body.dataset.dirty==='false' && document.getElementById('rackDepth').value==='single');
    check('old projects migrate to single-deep',await page.locator('#rearStroke').isDisabled());
    await page.goto(pathToFileURL(path.join(base,'../스태커크레인_사용매뉴얼.html')).href);
    await page.locator('a[href="#depth-update"]').click();
    check('manual describes depth selection and access assumptions',(await page.locator('#depth-update').innerText()).includes('뒷열 우선 입고'));
    await page.screenshot({path:path.join(qa,'05-manual.png')});
    check('offline execution has no JavaScript errors or network requests',errors.length===0 && network.length===0);
    fs.writeFileSync(path.join(qa,'browser-results.json'),JSON.stringify({checks:checks.length,passed:checks,errors,network},null,2));
    console.log('Evidence: '+qa);
  }catch(error){await page.screenshot({path:path.join(qa,'failure.png')});console.error({errors});throw error;}
  finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
