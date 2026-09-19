// Focused regression for the reported maximum-speed validation message.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.STC_PLAYWRIGHT_PATH || path.join(os.tmpdir(), 'stc-browser-check/node_modules/playwright'));
const base = path.resolve(__dirname, '..'), qa = path.join(os.tmpdir(), 'stc-browser-check/results');
fs.mkdirSync(qa, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1480, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage(), errors = [], checks = [], network = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  await context.route(/^https?:/, r => r.abort());
  const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log('PASS ' + name); };
  const apply = async () => { await page.locator('#calculate').click(); };
  try {
    await page.goto(pathToFileURL(path.resolve(base, '../스태커크레인_실행.html')).href);
    await page.locator('#analysisKpis .kpi').first().waitFor();
    const initialTheory = await page.locator('#analysisKpis .kpi-value').first().innerText();
    await page.locator('#speedUnit').selectOption('m/s');
    await page.locator('#vx').fill('180'); await apply();
    if (process.argv.includes('--before')) {
      const msError = await page.locator('#error').innerText();
      await page.locator('#speedUnit').selectOption('m/min'); await apply();
      const minError = await page.locator('#error').innerText();
      await page.locator('#vx').fill('180'); await apply();
      const accepted = await page.locator('#error').isHidden(), equal = initialTheory === await page.locator('#analysisKpis .kpi-value').first().innerText();
      console.log(JSON.stringify({ msError, minError, entered180MminAccepted: accepted, capacityEquals3Ms: equal }, null, 2));
      return;
    }
    let message = await page.locator('#error').innerText();
    check('reported 180-in-m/s input is rejected with units and explicit conversion guidance', message.includes('0.001 ~ 20 m/s') && message.includes('180 m/min') && message.includes('3 m/s'));
    check('invalid speed field is identified and focused', await page.locator('#vx').getAttribute('aria-invalid') === 'true' && await page.locator('#vx').evaluate(e => document.activeElement === e));
    check('invalid speed is not silently changed', await page.locator('#vx').inputValue() === '180');
    await page.screenshot({ path: path.join(qa, 'v021-speed-error.png'), fullPage: true });
    await page.locator('#speedUnit').selectOption('m/min');
    check('unit switch clears stale error and preserves physical values', await page.locator('#error').isHidden() && await page.locator('#vx').inputValue() === '10800');
    await apply(); message = await page.locator('#error').innerText();
    check('minute-unit validation uses 0.06–1200 m/min and the actual displayed input', message.includes('0.06 ~ 1200 m/min') && message.includes('10800 m/min'));
    await page.locator('#vx').fill('180'); await apply();
    check('180 m/min calculates successfully and matches 3 m/s', await page.locator('#error').isHidden() && initialTheory === await page.locator('#analysisKpis .kpi-value').first().innerText());
    check('speed hint shows both the selected range and equivalent speed', (await page.locator('#speedHint-vx').innerText()).includes('0.06~1200 m/min') && (await page.locator('#speedHint-vx').innerText()).includes('3 m/s'));
    const event = page.waitForEvent('download'); await page.locator('#saveProject').click();
    const savedPath = path.join(qa, 'v021-speed-project.json'); await (await event).saveAs(savedPath);
    const saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
    check('saved project keeps SI values and minute display preference', saved.config.vx === 3 && saved.config.vy === 1 && saved.config.vf === .6 && saved.config.speedUnit === 'm/min');
    for (const [id, value, limit] of [['vx', '1201', 1200], ['vy', '601', 600], ['vf', '301', 300]]) {
      await page.locator(id === 'vx' ? '#vy' : '#vx').fill(id === 'vx' ? '60' : '180');
      await page.locator('#vf').fill('36'); await page.locator('#vy').fill('60');
      await page.locator('#' + id).fill(value); await apply();
      const text = await page.locator('#error').innerText();
      check(id + ' uses its own converted limit and highlights the correct field', text.includes('0.06 ~ ' + limit + ' m/min') && await page.locator('#' + id).getAttribute('aria-invalid') === 'true');
      await page.locator('#' + id).fill(id === 'vx' ? '180' : id === 'vy' ? '60' : '36');
    }
    for (const [values, name] of [[['.06', '.06', '.06'], 'lower'], [['1200', '600', '300'], 'upper']]) {
      for (const [i, id] of ['vx', 'vy', 'vf'].entries()) await page.locator('#' + id).fill(values[i]);
      await apply(); check('all axes accept their exact ' + name + ' bound in m/min', await page.locator('#error').isHidden());
    }
    for (const value of ['', '0', '-1']) {
      await page.locator('#vx').fill(value); await apply();
      check('empty/zero/negative speed remains invalid: ' + JSON.stringify(value), await page.locator('#error').isVisible());
    }
    await page.locator('#vx').fill('180'); await page.locator('#vy').fill('60'); await page.locator('#vf').fill('36'); await apply();
    for (let i = 0; i < 4; i++) { await page.locator('#speedUnit').selectOption('m/s'); await page.locator('#speedUnit').selectOption('m/min'); }
    await apply(); check('repeated unit switches preserve throughput and inputs', initialTheory === await page.locator('#analysisKpis .kpi-value').first().innerText() && await page.locator('#vx').inputValue() === '180');
    await page.locator('#projectFile').setInputFiles(savedPath);
    await page.waitForFunction(() => document.getElementById('speedUnit').value === 'm/min' && document.getElementById('vx').value === '180' && document.body.dataset.dirty === 'false');
    await page.screenshot({ path: path.join(qa, 'v021-speed-corrected.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check('speed help remains inside mobile layout', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    check('no browser errors or network requests', errors.length === 0 && network.length === 0);
    fs.writeFileSync(path.join(qa, 'v021-speed-results.json'), JSON.stringify({ checks, errors, network, testedAt: new Date().toISOString() }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
