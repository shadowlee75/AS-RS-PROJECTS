const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(path.join(os.tmpdir(), 'stc-browser-check/node_modules/playwright'));
const Model = require('../src/model.js'), base = path.resolve(__dirname, '..');
const qa = path.join(os.tmpdir(), 'stc-browser-check/results'); fs.mkdirSync(qa, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1680, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage(), checks = [], errors = [], network = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  await context.route(/^https?:/, r => r.abort());
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, 'STCScene', { configurable: true, get: () => api, set: value => {
      const Original = value.Scene; value.Scene = class extends Original { constructor(...args) { super(...args); window.qaScene = this; } }; api = value;
    } });
  });
  const check = (name, condition) => { assert.ok(condition, name); checks.push(name); console.log('PASS ' + name); };
  const load = async c => {
    await page.locator('#projectFile').setInputFiles({ name: 'qa.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(Model.pack(c))) });
    await page.waitForFunction(c => document.getElementById('name').value === c.name && document.getElementById('method').value === c.method && Number(document.getElementById('femCase').value) === c.femCase && Number(document.getElementById('cranes').value) === c.cranes && document.body.dataset.dirty === 'false', c);
    assert.ok(await page.locator('#error').isHidden(), await page.locator('#error').innerText());
  };
  try {
    await page.goto(pathToFileURL(path.resolve(base, '../스태커크레인_실행.html')).href);
    await page.locator('#analysisKpis .kpi').first().waitFor();
    const c = { ...Model.defaults, name: 'FEM·3대 STC 검증', cranes: 3, bays: 12, levels: 6, hours: .25, warmup: 0, inbound: 300, outbound: 300, peak: 1,
      ports: [{ ioX: 0, ioY: 0, ioZ: -.8, outX: 60, outY: 0, outZ: 1 }, { ioX: 12, ioY: 2, ioZ: -.6, outX: 48, outY: 10, outZ: -1.1 }, { ioX: 30, ioY: 4, ioZ: 1, outX: 0, outY: 0, outZ: -.6 }] };
    await load(c);
    check('3 per-STC port rows and analytical rows', await page.locator('#portTable tbody tr').count() === 3 && await page.locator('#aisleAnalysis tbody tr').count() === 3);
    await page.locator('[data-tab="simulation"]').click(); await page.locator('#scene canvas').waitFor();
    const info = await page.evaluate(() => {
      const s = qaScene; return { cranes: s.aisles.length, loads: s.loads.count, bays: s.labels.filter(l => l.userData.axis === 'bays').map(l => l.userData.values),
        levels: s.labels.filter(l => l.userData.axis === 'levels').map(l => l.userData.values), occupied: s.aisles.map(a => a.engine.inventory()) };
    });
    check('three real cranes and 432 physical rack cell instances', info.cranes === 3 && info.loads === 432);
    check('every bay and level label exists on both rack sides for all STCs', info.bays.length === 6 && info.bays.every(a => a.length === 12 && a[11] === '012') && info.levels.length === 6 && info.levels.every(a => a.length === 6 && a[5] === '06'));
    check('separate per-aisle inventory initialized', info.occupied.every(n => n === 72));
    await page.locator('#simAisle').selectOption('2'); await page.locator('#cellSide').selectOption('1'); await page.locator('#cellBay').fill('12'); await page.locator('#cellLevel').fill('6'); await page.locator('#findCell').click();
    check('exact last bay/level address selected on STC 3', (await page.locator('#cellInfo').innerText()).includes('STC03-B-012-06'));
    const highlight = await page.evaluate(() => [qaScene.highlight.position.x, qaScene.highlight.position.y, qaScene.highlight.position.z]);
    check('selected cell maps to exact input cell center and local Z', Math.abs(highlight[0] - 57.5) < 1e-9 && Math.abs(highlight[1] - 18.3333333333) < 1e-7 && Math.abs(highlight[2] - (qaSceneStride(c) * 2 + 1.2)) < 1e-9);
    await page.locator('#simSpeed').selectOption('10'); await page.locator('#simPlay').click();
    await page.waitForFunction(() => qaScene.aisles.every(a => a.engine.time > 35), null, { timeout: 30000 }); await page.locator('#simPlay').click();
    const poses = await page.evaluate(() => qaScene.aisles.map(a => ({ t: a.engine.time, actual: [a.crane.position.x, a.carriage.position.y, a.fork.position.z], model: [a.engine.pose().x.p, a.engine.pose().y.p, a.engine.pose().f.p], attached: a.cargo.parent === a.fork })));
    check('all STCs animate at one clock using their own motion poses', poses.every(p => p.t === poses[0].t && JSON.stringify(p.actual) === JSON.stringify(p.model) && p.attached) && new Set(poses.map(p => JSON.stringify(p.actual))).size > 1);
    await page.screenshot({ path: path.join(qa, 'v02-01-fleet-3d.png'), fullPage: true });
    await page.locator('#viewSelected').click(); await page.locator('#viewFront').click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    check('front view retains rendered pixels after resize and view switching', await page.evaluate(() => {
      const source = qaScene.renderer.domElement, canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0); const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0; for (let i = 0; i < pixels.length; i += 16) if (pixels[i] > 35 || pixels[i + 1] > 70 || pixels[i + 2] > 90) visible++;
      return visible > 500;
    }));
    await page.screenshot({ path: path.join(qa, 'v02-02-address-detail.png'), fullPage: true });
    await page.locator('#simFinish').click(); await page.waitForFunction(() => document.getElementById('measureStatus').textContent === '측정 종료');
    check('all STCs finish and conservation ledger balances', (await page.locator('#inventoryEquation').innerText()).includes('✓') && await page.locator('#fleetTable tbody tr').count() === 3);
    const csvEvent = page.waitForEvent('download'); await page.locator('#exportSim').click(); const csv = await csvEvent; await csv.saveAs(path.join(qa, 'v02-fleet-jobs.csv'));
    const text = fs.readFileSync(path.join(qa, 'v02-fleet-jobs.csv'), 'utf8');
    check('exported jobs identify all STCs, rack addresses and port XYZ', ['STC1/', 'STC2/', 'STC3/', 'rack_address', 'port_z_m'].every(t => text.includes(t)));
    const saveEvent = page.waitForEvent('download'); await page.locator('#saveProject').click(); await (await saveEvent).saveAs(path.join(qa, 'v02-project.json'));
    const saved = Model.unpack(JSON.parse(fs.readFileSync(path.join(qa, 'v02-project.json'), 'utf8')));
    check('project roundtrip preserves independent 3D ports', JSON.stringify(saved.ports) === JSON.stringify(Model.validate(c).ports));
    await page.locator('[data-tab="overview"]').click();
    for (let k = 1; k <= 6; k++) {
      let f = { ...Model.defaults, name: 'CASE ' + k + ' QA', method: 'fem', pointMode: 'theory', femCase: k, bays: 12, levels: 6, ioY: 8 };
      f = { ...f, ...Model.casePorts(f) }; await load(f);
      const expected = Model.calculate(f);
      check('CASE ' + k + ' applies reference points and actual cycle values', (await page.locator('#femSummary').innerText()).includes('CASE ' + k) && await page.locator('#femPoints tbody tr').count() === (k === 2 ? 4 : 2) && (await page.locator('#aisleAnalysis').innerText()).includes(expected.dc.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
      await page.locator('[data-tab="motion"]').click(); await page.locator('#motionSource').selectOption('fem');
      check('CASE ' + k + ' representative motion graphs render for all axes', await page.locator('#motionCharts svg').count() === 6 && (await page.locator('#previewDescription').innerText()).includes('FEM'));
      if (k === 2) { await page.locator('#femRoute').selectOption('1'); check('CASE 2 mirrored path selectable', (await page.locator('#previewDescription').innerText()).includes('P1′')); }
      await page.locator('[data-tab="overview"]').click();
    }
    await page.screenshot({ path: path.join(qa, 'v02-03-fem-case6.png'), fullPage: true });
    await page.locator('#outX').fill('10'); await page.locator('#calculate').click();
    check('incompatible FEM port geometry is blocked', await page.locator('#error').isVisible() && (await page.locator('#error').innerText()).includes('CASE 6'));
    await page.locator('#method').selectOption('cells'); await page.locator('#calculate').click();
    check('custom XYZ ports accepted in full cell method', await page.locator('#error').isHidden());
    await page.locator('#femCase').selectOption('2'); await page.locator('#applyCase').click(); await page.locator('#calculate').click();
    check('CASE preset updates port geometry and enables FEM calculation', await page.locator('#outX').inputValue() === '60' && await page.locator('#method').inputValue() === 'fem' && await page.locator('#error').isHidden());
    await page.locator('[data-tab="motion"]').click(); await page.locator('#motionSource').selectOption('fem');
    await page.screenshot({ path: path.join(qa, 'v02-04-fem-motion.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check('mobile layout retains page width with scrollable port tables', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    check('offline operation and no browser errors', network.length === 0 && errors.length === 0);
    fs.writeFileSync(path.join(qa, 'v02-browser-results.json'), JSON.stringify({ checks, errors, network, browser: await browser.version(), testedAt: new Date().toISOString() }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
function qaSceneStride(c) { return Math.max(5, c.stroke * 2 + 2.5); }
