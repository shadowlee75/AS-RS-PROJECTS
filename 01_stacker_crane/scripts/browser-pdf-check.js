const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.STC_PLAYWRIGHT_PATH || path.join(os.tmpdir(), 'stc-browser-check/node_modules/playwright'));
const Model = require('../src/model.js');
const qa = path.join(os.tmpdir(), 'stc-browser-check/results/pdf'); fs.mkdirSync(qa, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
  const page = await context.newPage(), errors = [], requests = [], checks = [], reportFiles = [];
  context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  page.on('pageerror', e => errors.push(e.message));
  context.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
  await context.route(/^https?:/, r => r.abort());
  const check = (name, ok) => { assert.ok(ok, name); checks.push(name); console.log('PASS ' + name); };
  const load = async c => {
    await page.locator('#projectFile').setInputFiles({ name:'pdf-config.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(Model.pack(c))) });
    await page.waitForFunction(name => document.getElementById('name').value === name && document.body.dataset.dirty === 'false', c.name);
  };
  const report = async (filename, options = {}) => {
    await page.locator('#pdfReport').click();
    await page.locator('#pdfDocumentNo').fill(options.documentNo || 'STC-2026-001');
    await page.locator('#pdfRecipient').fill(options.recipient || '물류설비 검토팀');
    await page.locator('#pdfAuthor').fill(options.author || '설계 담당자');
    await page.locator('#pdfReviewer').fill(options.reviewer || '검토 담당자');
    await page.locator('#pdfIncludeGraphs').setChecked(options.graphs !== false);
    if (await page.locator('#pdfIncludeSim').isEnabled()) await page.locator('#pdfIncludeSim').setChecked(options.sim !== false);
    const event = page.waitForEvent('popup'); await page.locator('#createPdfReport').click();
    const popup = await event; await popup.waitForLoadState('load'); await popup.locator('h1').waitFor();
    await popup.evaluate(() => document.fonts.ready);
    await popup.emulateMedia({ media:'print' });
    const overflow = await popup.evaluate(() => [...document.querySelectorAll('table,svg,.summary-grid')].some(e => {
      const box = e.getBoundingClientRect(), main = document.querySelector('main').getBoundingClientRect();
      return box.left < main.left - 1 || box.right > main.right + 1;
    }));
    check(filename + ': tables and figures fit the report width', !overflow);
    await popup.pdf({ path:path.join(qa, filename + '.pdf'), preferCSSPageSize:true, printBackground:true, displayHeaderFooter:false });
    fs.writeFileSync(path.join(qa, filename + '.html'), await popup.content());
    reportFiles.push(filename + '.pdf');
    return popup;
  };
  try {
    await page.goto(pathToFileURL(path.resolve(__dirname, '../../스태커크레인_실행.html')).href);
    await page.locator('#analysisKpis .kpi').first().waitFor();
    check('PDF report action is visible alongside Markdown export', await page.locator('#pdfReport').isVisible() && await page.locator('#report').isVisible());
    await page.locator('#length').fill('61'); await page.locator('#pdfReport').click();
    check('stale unapplied calculations cannot be exported', !(await page.locator('#pdfOptions').evaluate(e => e.open)));
    await page.locator('#calculate').click();
    const initial = await report('v025-default');
    const text = await initial.locator('main').innerText();
    check('default report identifies missing factors and unrun simulation', text.includes('판정 보류') && text.includes('미실행'));
    check('cover total theoretical capacity equals the model', (await initial.locator('.summary-grid>div').nth(1).innerText()).includes(Model.calculate({ ...Model.defaults, length:61 }).theoryTotal.toLocaleString('ko-KR',{ minimumFractionDigits:1,maximumFractionDigits:1 })));
    check('report has selectable Korean tables, six motion graphs and specified 110 mm sequence', await initial.locator('table').count() > 6 && await initial.locator('.axis-chart-card svg').count() === 6 && text.includes('UP 110 mm') && text.includes('DOWN 110 mm'));
    await initial.evaluate(() => { window.qaPrintCalls = 0; window.print = () => { window.qaPrintCalls++; }; });
    await initial.emulateMedia({ media:'screen' }); await initial.locator('#printPdf').click();
    check('PDF save button invokes native print without printing app controls', await initial.evaluate(() => qaPrintCalls === 1));
    await initial.emulateMedia({ media:'print' });
    check('PDF toolbar is hidden by print CSS', !(await initial.locator('.print-toolbar').isVisible()));
    await initial.close();
    const c = { ...Model.defaults, name:'제출용 검증 - 외부 포트 FEM CASE 6', length:33.9, height:17, bays:6, levels:6, firstLevelHeight:1.3, levelPitch:2.5,
      method:'fem', femCase:6, cranes:2, ioX:-3, ioY:9.6, outX:-3, outY:1.6,
      ports:[{}, { ioX:38, outX:38 }], A:.95,Ft:.95,Ew:1,basis:'assumption',basisNote:'검증용 가정 - 첨부 도면의 확정 사양이 아님.',
      inbound:140,outbound:140,peak:1,hours:.1,warmup:0 };
    await load(c); await page.locator('[data-tab="simulation"]').click(); await page.locator('#simFinish').click();
    await page.waitForFunction(() => document.getElementById('measureStatus').textContent === '측정 종료');
    const complete = await report('v025-complete-fem');
    const completeText = await complete.locator('main').innerText();
    check('completed simulation, both STCs, applied centers and outside coordinates are included', completeText.includes('실행 상태: 완료') && completeText.includes('STC별 시뮬레이션 결과') && completeText.includes('STC02-') && completeText.includes('-3.000') && completeText.includes('38.000') && completeText.includes('FEM 셀 선정 참조 포트'));
    check('completed report matches current calculated SC and DC results', completeText.includes(Model.calculate(c).sc.toLocaleString('ko-KR',{ minimumFractionDigits:3,maximumFractionDigits:3 })) && completeText.includes(Model.calculate(c).dc.toLocaleString('ko-KR',{ minimumFractionDigits:3,maximumFractionDigits:3 })));
    await complete.close();
    await page.locator('#simReset').click(); await page.locator('#simSeek').evaluate(e => { e.value='200'; e.dispatchEvent(new Event('change',{bubbles:true})); });
    const partial = await report('v025-partial', { graphs:false, documentNo:'<img src=x onerror="window.pwned=1">', author:'홍길동 & 설계', recipient:'고객사 <검토> "제출"' });
    check('partial simulation is explicitly labeled and unchecked graphs omitted', (await partial.locator('main').innerText()).includes('진행 중 - 부분 결과') && await partial.locator('.axis-chart-card').count() === 0);
    check('report metadata is escaped and cannot execute markup', await partial.locator('img').count() === 0 && (await partial.locator('main').innerText()).includes('<img src=x') && await partial.evaluate(() => !window.pwned && window.opener === null));
    await partial.close();
    await load({ ...c, name:'최대 길이 및 다중 STC 검증 ' + '프로젝트'.repeat(55), cranes:12, basisNote:'설비 사양 및 적용 조건에 대한 검토 문구. '.repeat(10), hours:.05 });
    const long = await report('v025-long', { graphs:false, recipient:'제출처 검토 조직 '.repeat(7), author:'담당부서 '.repeat(10), documentNo:'문서번호'.repeat(20) });
    check('long metadata and all twelve STCs are retained', (await long.locator('main').innerText()).includes('STC12-') && (await long.locator('.project-name').innerText()).length > 200);
    await long.close();
    await page.setViewportSize({ width:390,height:844 }); await page.locator('#pdfReport').click();
    check('PDF action and options fit mobile width', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('pdfOptions').getBoundingClientRect().right <= innerWidth));
    await page.locator('#pdfCancel').click();
    check('no JavaScript errors or runtime network requests', !errors.length && !requests.length);
    fs.writeFileSync(path.join(qa,'v025-pdf-results.json'),JSON.stringify({ checks,errors,requests,reportFiles,browser:await browser.version(),testedAt:new Date().toISOString() },null,2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });

