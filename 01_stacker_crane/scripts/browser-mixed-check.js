'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require('../../06_conveyor/node_modules/playwright');
const Model = require('../src/model.js'), E = require('../src/engine.js');
const base = path.resolve(__dirname, '..'), qa = path.join(base, 'qa/sc-dc-case-20260916');
fs.mkdirSync(qa, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 }, acceptDownloads: true });
  const checks = [], errors = [], network = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  await page.route(/^https?:/, r => r.abort());
  await page.addInitScript(() => {
    for (const [name, type, capture] of [['STCScene','Scene','qaScene'], ['STCEngine','Fleet','qaFleet']]) {
      let api; Object.defineProperty(window, name, { configurable: true, get: () => api, set: value => {
        const Original = value[type]; value[type] = class extends Original { constructor(...args) { super(...args); window[capture] = this; } }; api = value;
      } });
    }
  });
  const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log('PASS ' + name); };
  const applied = async () => { await page.locator('#calculate').click(); await page.waitForFunction(() => document.body.dataset.dirty === 'false'); };
  const load = async config => {
    await page.locator('#projectFile').setInputFiles({ name: 'qa.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(Model.pack(config))) });
    await page.waitForFunction(name => document.getElementById('name').value === name && document.body.dataset.dirty === 'false', config.name);
  };
  const download = async (button, name) => {
    const event = page.waitForEvent('download'); await page.locator(button).click(); const file = await event;
    const target = path.join(qa, name); await file.saveAs(target); return fs.readFileSync(target, 'utf8');
  };
  try {
    await page.goto(pathToFileURL(path.join(base,'../스태커크레인_실행.html')).href);
    check('default project boots offline', await page.locator('.version').textContent() === 'v0.3.0' && errors.length === 0);
    await page.locator('#mode').selectOption('mixed'); await page.locator('#scRatio').fill('60');
    check('single edit complements dual to 100%', await page.locator('#dcRatio').inputValue() === '40');
    await page.locator('#dcRatio').fill('50'); await page.locator('#ratioBasis').selectOption('loads'); await applied();
    check('load-based 50% converts to 33.3% cycles on screen', (await page.locator('#cycleSummary').innerText()).includes('33.3%'));
    await page.locator('#ratioBasis').selectOption('cycles'); await page.locator('#scRatio').fill('60');
    await page.locator('#editRoutes').click(); await page.locator('#sixRoutes').click();
    check('six CASE rows auto-generated and normalized', await page.locator('#routeTable tbody tr').count() === 6 && (await page.locator('#routeTotals').textContent()).includes('100.000%'));
    await page.screenshot({ path: path.join(qa, '01-route-editor.png') });
    await page.locator('#routeTable tbody tr').nth(0).locator('[data-route=weight]').fill('10');
    await page.locator('#closeRoutes').click(); await page.locator('#calculate').click();
    check('invalid distribution is rejected without applying partial settings', await page.locator('#error').isVisible() && (await page.locator('#error').textContent()).includes('100%'));
    await page.locator('#editRoutes').click(); await page.locator('#routeTable tbody tr').nth(0).locator('[data-route=weight]').fill('16.666667'); await page.locator('#closeRoutes').click();
    await page.locator('#method').selectOption('fem'); await applied();
    check('analysis lists all six CASE routes', await page.locator('#routeAnalysis tbody tr').count() === 6 && (await page.locator('#cycleSummary').innerText()).includes('포트 전환 공차시간'));
    const packed = JSON.parse(await download('#saveProject','mixed-project.json'));
    check('saved JSON contains ratios and every route coordinate', packed.config.mode === 'mixed' && packed.config.dcRatio === 40 && packed.config.routes.length === 6 && packed.config.routes.every(r => 'outZ' in r));
    await page.locator('#resetDefaults').click(); await load(packed.config);
    check('JSON reload restores mixed UI and allocation table', await page.locator('#mode').inputValue() === 'mixed' && await page.locator('#dcRatio').inputValue() === '40' && await page.locator('#routeTable tbody tr').count() === 6);
    await page.locator('[data-tab=simulation]').click();
    check('3D renders six CASE marker sets and seven shared physical buffers', await page.evaluate(() => !qaScene.fallback && new Set(qaScene.pointMarkers.map(p=>p.userData.femCase)).size === 6 && qaScene.aisles[0].portQueues.length === 7));
    const before = await page.evaluate(() => qaScene.controls.target.toArray());
    const bounds = await page.locator('#scene canvas').boundingBox();
    await page.mouse.move(bounds.x+bounds.width*.6,bounds.y+bounds.height*.6); await page.mouse.down({button:'middle'});
    await page.mouse.move(bounds.x+bounds.width*.6+75,bounds.y+bounds.height*.6-35,{steps:8}); await page.mouse.up({button:'middle'});
    const after = await page.evaluate(() => qaScene.controls.target.toArray());
    check('middle-wheel drag pans the 3D view', after.some((v,i)=>Math.abs(v-before[i])>.1));
    await page.locator('#simFinish').click(); await page.waitForFunction(()=>document.getElementById('measureStatus').textContent==='측정 종료');
    const snapshot = await page.evaluate(()=>qaFleet.snapshot()), expected = E.runFleet(packed.config).snapshot();
    check('built HTML DES matches source counts and mixture', snapshot.measuredCycles.sc === expected.measuredCycles.sc && snapshot.measuredCycles.dc === expected.measuredCycles.dc && snapshot.throughput === expected.throughput);
    check('actual ratio and conservation visible after completion', (await page.locator('#simMix').textContent()).includes('실제 DC 40.0%') && snapshot.conservation && snapshot.jobsConserved);
    await page.screenshot({ path: path.join(qa,'02-simulation.png') });
    const csv = await download('#exportSim','mixed-jobs.csv');
    check('CSV carries route and CASE for completed jobs', csv.includes('port_route') && csv.includes('fem_case') && csv.includes('CASE6'));
    const md = await download('#report','mixed-report.md');
    check('calculation export contains every route and requested/actual ratios', md.includes('SC/DC 지정 비율') && md.includes('측정구간 완료 SC/DC') && md.includes('| CASE6 | 6 |') && !md.includes('[object Object]'));
    await page.locator('[data-tab=motion]').click(); await page.locator('#motionRoute').selectOption('5');
    check('motion preview selects the CASE 6 inlet at height', (await page.locator('#previewDescription').textContent()).includes('CASE6 · CASE 6') && await page.locator('#motionRoute option').count() === 6);
    await page.locator('#pdfReport').click(); const popupEvent = page.waitForEvent('popup'); await page.locator('#createPdfReport').click(); const report = await popupEvent;
    await report.waitForLoadState('domcontentloaded');
    const reportText = await report.locator('body').innerText();
    check('print report includes CASE 1–6 and mixed operating results', ['CASE1','CASE2','CASE3','CASE4','CASE5','CASE6','실제 완료 SC / DC','복합 입·출고'].every(t=>reportText.includes(t)));
    const overflow = await report.evaluate(()=>[...document.querySelectorAll('table')].some(e=>e.getBoundingClientRect().right>e.closest('section').getBoundingClientRect().right+3));
    check('print tables remain within page width', !overflow);
    fs.writeFileSync(path.join(qa,'mixed-report.html'), await report.content()); await report.close();
    const multi = { ...Model.defaults, name: 'STC별 CASE 배치 QA', cranes: 3, bays: 6, levels: 4, hours: .15, warmup: 0,
      method:'fem', pointMode:'theory', mode:'mixed', dcRatio:30, ports:[{femCase:2},{femCase:5},{femCase:6}] };
    await load(multi); await page.locator('[data-tab=simulation]').click();
    check('each crane applies its own CASE and 3D port coordinates', await page.evaluate(()=>qaFleet.engines.map(e=>e.config.femCase).join(',')==='2,5,6' && qaScene.aisles.length===3));
    await page.locator('#simFinish').click(); await page.waitForFunction(()=>document.getElementById('measureStatus').textContent==='측정 종료');
    check('multiple crane simulation preserves stock and jobs', await page.evaluate(()=>qaFleet.snapshot().conservation && qaFleet.snapshot().jobsConserved));
    await page.locator('[data-tab=overview]').click(); await page.screenshot({path:path.join(qa,'03-per-crane-cases.png')});
    await page.locator('#editRoutes').click(); await page.locator('#routeAisle').fill('2'); await page.locator('#addRoute').click(); await page.locator('#addRoute').click();
    check('adding routes normalizes only the selected crane', await page.locator('#routeTable tbody tr').count()===2 && (await page.locator('#routeTotals').textContent()).includes('STC 2: 100.000%'));
    await page.locator('[data-route-remove="1"]').click();
    check('removing a route restores remaining allocation to 100%', await page.locator('#routeTable [data-route=weight]').inputValue()==='100');
    await page.locator('#closeRoutes').click(); await applied();
    const mixedMulti = JSON.parse(await download('#saveProject','multi-project.json'));
    check('per-crane CASE and route override coexist after save', mixedMulti.config.ports[2].femCase===6 && mixedMulti.config.routes[0].aisle===2);
    await page.locator('[data-tab=experiments]').click(); await page.locator('#repCount').selectOption('5'); await page.locator('#runExperiments').click();
    await page.waitForFunction(()=>document.getElementById('experimentStatus').textContent.startsWith('20회 완료'));
    check('repeat comparison includes the configured mixture as a fourth mode', await page.locator('#experimentResults tbody tr').count()===4 && (await page.locator('#experimentResults').innerText()).includes('지정 비율'));
    const experiments = JSON.parse(await download('#exportExperiments','mixed-experiments.json'));
    check('repeat JSON retains cycle counts and observed DC ratio', experiments.runs.length===20 && experiments.runs.every(r=>'actualDCRatio' in r && 'measuredCycles' in r));
    await page.goto(pathToFileURL(path.join(base,'../스태커크레인_사용매뉴얼.html')).href);
    check('updated manual links to new ratio and CASE instructions', await page.locator('#mixed-update').count()===1 && (await page.locator('#mixed-update').innerText()).includes('최대 6개 조합'));
    await page.locator('a[href="#mixed-update"]').click(); await page.screenshot({path:path.join(qa,'04-manual.png')});
    check('no JavaScript errors or external network requests', errors.length===0 && network.length===0);
    fs.writeFileSync(path.join(qa,'browser-results.json'),JSON.stringify({checks:checks.length,passed:checks,errors,network},null,2));
  } finally { await browser.close(); }
})().catch(e=>{ console.error(e); process.exitCode=1; });
