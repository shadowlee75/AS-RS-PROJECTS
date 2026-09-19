// Local browser fallback: connected Browser runtime reported no available browsers.
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.STC_PLAYWRIGHT_PATH || path.join(os.tmpdir(), 'stc-depth-browser/node_modules/playwright'));
const Model = require('../src/model.js');
const qa = path.resolve(__dirname, '../qa/efficiency-20260918');
fs.mkdirSync(qa, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 }, acceptDownloads: true });
  const checks = [], errors = [], network = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  await page.route(/^https?:/, r => r.abort());
  const check = (name, ok) => { assert.ok(ok, name); checks.push(name); console.log('PASS ' + name); };
  const apply = async () => { await page.locator('#calculate').click(); await page.waitForFunction(() => document.body.dataset.dirty === 'false'); };
  const load = async data => {
    await page.locator('#projectFile').setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await page.waitForFunction(() => document.body.dataset.dirty === 'false');
  };
  const download = async (button, name) => {
    const pending = page.waitForEvent('download'); await page.locator(button).click();
    const d = await pending, file = path.join(qa, name); await d.saveAs(file); return fs.readFileSync(file, 'utf8');
  };
  try {
    await page.goto(pathToFileURL(path.resolve(__dirname, '../../스태커크레인_실행.html')).href);
    check('new field is visible in an open section and uses percent', await page.locator('#operatingEfficiency').isVisible() && await page.locator('[data-unit=operatingEfficiency]').innerText() === '%');
    check('target utilization explains its separate purpose', (await page.locator('#targetUtilHint').innerText()).includes('필요 대수'));
    const baselineCycle = await page.locator('#cycleSummary').innerText();
    await page.locator('#operatingEfficiency').fill('85');
    check('editing efficiency marks results stale', await page.locator('#dirtyNotice').isVisible());
    await apply();
    const expected = Model.calculate({ ...Model.defaults, operatingEfficiency: 85 });
    check('85% visibly corrects hourly throughput', (await page.locator('#analysisKpis').innerText()).includes(expected.available.toFixed(1)) && (await page.locator('#analysisKpis').innerText()).includes('운전효율 85% 직접 적용'));
    check('efficiency leaves cycle times unchanged', await page.locator('#cycleSummary').innerText() === baselineCycle);
    check('legacy factors disabled and direct efficiency sensitivity shown', await page.locator('#A').isDisabled() && (await page.locator('#sensitivityTable').innerText()).includes('운전효율'));
    const saved = JSON.parse(await download('#saveProject', 'efficiency-project.json'));
    check('JSON saves 85 percent', saved.config.operatingEfficiency === 85);
    const md = await download('#report', 'efficiency-report.md');
    check('Markdown shows applied efficiency and target distinction', md.includes('운전효율 85% 직접 적용') && md.includes('표시 처리량에 곱하지 않습니다'));
    await page.locator('#operatingEfficiency').evaluate(e => {
      const sidebar = e.closest('.sidebar'), section = e.closest('details');
      sidebar.scrollTop += section.getBoundingClientRect().top - sidebar.getBoundingClientRect().top - 12;
    });
    await page.screenshot({ path: path.join(qa, '01-efficiency.png') });
    await page.locator('#targetUtil').fill('0.5'); await apply();
    check('target utilization does not rescale corrected throughput', (await page.locator('#analysisKpis').innerText()).includes(expected.available.toFixed(1)));
    await page.locator('#operatingEfficiency').fill('0.85'); await page.locator('#calculate').click();
    check('ratio entered as percentage is rejected with a field error', await page.locator('#operatingEfficiency').getAttribute('aria-invalid') === 'true' && (await page.locator('#error').innerText()).includes('1 ~ 100'));
    await page.locator('#operatingEfficiency').fill('100'); await apply();
    check('100% equals theoretical capacity', (await page.locator('#analysisKpis').innerText()).includes('운전효율 100% 직접 적용'));
    await load(saved);
    check('saved project reloads efficiency and corrections', await page.locator('#operatingEfficiency').inputValue() === '85' && await page.locator('#A').isDisabled());
    await page.locator('#pdfReport').click(); const popup = page.waitForEvent('popup'); await page.locator('#createPdfReport').click();
    const report = await popup; await report.waitForLoadState('domcontentloaded');
    const reportText = await report.locator('body').innerText();
    check('PDF preview states applied 85% and correct formula', reportText.includes('운전효율 85% 직접 적용') && reportText.includes('운전효율(%)÷100'));
    check('print tables fit report width', !await report.evaluate(() => [...document.querySelectorAll('table')].some(e => e.getBoundingClientRect().right > e.closest('section').getBoundingClientRect().right + 3)));
    await report.screenshot({ path: path.join(qa, '02-report.png'), fullPage: true }); await report.close();
    const legacy = Model.pack({ ...Model.defaults, A: .95, Ft: .95, Ew: 1, basis: 'assumption' });
    delete legacy.config.operatingEfficiency; legacy.moduleVersion = '0.3.2'; await load(legacy);
    check('legacy import keeps coefficients and no direct override', await page.locator('#operatingEfficiency').inputValue() === '' && !await page.locator('#A').isDisabled() && (await page.locator('#analysisKpis').innerText()).includes('0.9025'));
    await page.locator('#operatingEfficiency').fill('85'); await apply();
    check('85% replaces rather than multiplies legacy factors', (await page.locator('#analysisKpis').innerText()).includes(expected.available.toFixed(1)));
    await page.locator('#operatingEfficiency').fill(''); await apply();
    check('clearing efficiency restores old coefficients', (await page.locator('#analysisKpis').innerText()).includes('0.9025'));
    await page.locator('#operatingEfficiency').fill('85'); await apply();
    await page.locator('#idealFactors').click(); await apply();
    check('legacy preset clears direct override', await page.locator('#operatingEfficiency').inputValue() === '' && !await page.locator('#A').isDisabled());
    await page.goto(pathToFileURL(path.resolve(__dirname, '../../스태커크레인_사용매뉴얼.html')).href);
    await page.locator('a[href="#efficiency-update"]').click();
    check('manual explains direct efficiency', (await page.locator('#efficiency-update').innerText()).includes('85'));
    check('no browser errors or network requests', errors.length === 0 && network.length === 0);
    fs.writeFileSync(path.join(qa, 'browser-results.json'), JSON.stringify({ checks: checks.length, passed: checks, errors, network }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
