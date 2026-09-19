// Verify the shipped offline UI, real Three.js instances and unit-scaled charts.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.STC_PLAYWRIGHT_PATH || path.join(os.tmpdir(), 'stc-browser-check/node_modules/playwright'));
const Model = require('../src/model.js'), base = path.resolve(__dirname, '..');
const qa = path.join(os.tmpdir(), 'stc-browser-check/results'); fs.mkdirSync(qa, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, acceptDownloads: true });
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
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const apply = async () => { await page.locator('#calculate').click(); };
  const download = async (button, name) => { const event = page.waitForEvent('download'); await page.locator(button).click(); const file = path.join(qa, name); await (await event).saveAs(file); return file; };
  try {
    await page.goto(pathToFileURL(path.resolve(base, '../스태커크레인_실행.html')).href);
    await page.locator('#analysisKpis .kpi').first().waitFor();
    check('default inputs are 180/60/36 m/min and auto rack heights', await page.locator('#speedUnit').inputValue() === 'm/min' && await page.locator('#vx').inputValue() === '180' && await page.locator('#vy').inputValue() === '60' && await page.locator('#vf').inputValue() === '36' && await page.locator('#firstLevelHeight').inputValue() === '' && await page.locator('#levelPitch').inputValue() === '');
    check('default actual first/top heights preserve the old rack', (await page.locator('#levelHeights tbody tr').first().innerText()).includes('1.000') && (await page.locator('#levelHeights tbody tr').last().innerText()).includes('19.000'));
    for (const [id, value] of Object.entries({ name: '1단 높이·속도 단위 검증', height: 12, bays: 12, levels: 4, firstLevelHeight: .6, levelPitch: 2.4, cranes: 2 })) await page.locator('#' + id).fill(String(value));
    check('live height hint shows the resulting top', (await page.locator('#rackHeightHint').innerText()).includes('최상단 7.800 m'));
    await apply(); check('custom geometry applies without an error', await page.locator('#error').isHidden() && await page.locator('body').getAttribute('data-dirty') === 'false');
    const heights = [.6, 3, 5.4, 7.8];
    const rows = await page.locator('#levelHeights tbody tr').evaluateAll(rows => rows.map(r => Number(r.children[1].textContent)));
    check('applied height table matches independently calculated Y values', rows.length === 4 && rows.every((v, i) => near(v, heights[i])));
    const svgLevels = await page.locator('#rackDiagram [data-height]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.height)));
    check('2D rack level labels use actual height positions', svgLevels.length === 4 && svgLevels.every((v, i) => near(v, heights[i])));
    await page.locator('.sidebar').evaluate(e => { e.scrollTop = 0; });
    await page.locator('#toast').waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.join(qa, 'v022-height-overview.png'), fullPage: true });
    const savedPath = await download('#saveProject', 'v022-height-project.json'), saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
    check('project saves explicit heights and SI speeds with m/min display', saved.config.firstLevelHeight === .6 && saved.config.levelPitch === 2.4 && saved.config.vx === 3 && saved.config.vy === 1 && saved.config.vf === .6 && saved.config.speedUnit === 'm/min');
    const reportPath = await download('#report', 'v022-height-report.md'), report = fs.readFileSync(reportPath, 'utf8');
    check('downloaded report shows real heights and m/min speeds', report.includes('| 1 | 0.6 |') && report.includes('| 4 | 7.8 |') && report.includes('| 주행 최대속도 | 180 | m/min |'));
    await page.locator('[data-tab="simulation"]').click(); await page.locator('#scene canvas').waitFor();
    const sceneInfo = await page.evaluate(() => {
      const s = qaScene, matrix = new THREE.Matrix4();
      const cells = Array.from({ length: s.loads.count }, (_, i) => { s.loads.getMatrixAt(i, matrix); return { y: matrix.elements[13], level: s.rack[i % s.rack.length].level }; });
      return { count: s.loads.count, cranes: s.aisles.length, cells, labels: s.labels.filter(l => l.userData.axis === 'levels').map(l => l.userData.positions) };
    });
    check('both STCs render all 192 cells at actual Y coordinates', sceneInfo.count === 192 && sceneInfo.cranes === 2 && sceneInfo.cells.every(c => near(c.y, heights[c.level - 1])));
    check('all 3D level labels align with the four transfer heights', sceneInfo.labels.length === 4 && sceneInfo.labels.every(row => row.every((v, i) => near(v, heights[i]))));
    for (const [aisle, level, y] of [[0, 1, .6], [1, 4, 7.8]]) {
      await page.locator('#simAisle').selectOption(String(aisle)); await page.locator('#cellLevel').fill(String(level)); await page.locator('#findCell').click();
      check('selected STC ' + (aisle + 1) + ' level ' + level + ' highlights correct height', near(await page.evaluate(() => qaScene.highlight.position.y), y) && (await page.locator('#cellInfo').innerText()).includes(y.toFixed(2)));
    }
    await page.locator('#simSpeed').selectOption('50'); await page.locator('#simPlay').click();
    await page.waitForFunction(() => qaScene.aisles.every(a => a.engine.time > 25), null, { timeout: 15000 }); await page.locator('#simPlay').click();
    const play = await page.evaluate(() => ({ matched: qaScene.aisles.every(a => { const p = a.engine.pose(); return a.crane.position.x === p.x.p && a.carriage.position.y === p.y.p && a.fork.position.z === p.f.p; }), model: ['x', 'y', 'f'].map(axis => STCCharts.fmt(qaScene.aisles[Number(document.getElementById('simAisle').value)].engine.pose()[axis].v * 60, 2)), shown: [...document.querySelectorAll('#liveAxes .values')].map(e => e.children[1].textContent) }));
    check('all STCs play using actual engine poses', play.matched);
    check('live 3D speeds are numerically converted to m/min', play.shown.every((s, i) => s === play.model[i] + ' m/min'));
    await page.screenshot({ path: path.join(qa, 'v022-height-3d.png'), fullPage: true });
    await page.locator('[data-tab="motion"]').click();
    await page.locator('#previewKind').selectOption('in'); await page.locator('#previewBay').fill('12'); await page.locator('#previewLevel').fill('1'); await page.locator('#refreshMotion').click();
    check('phase table reports the first level lift distance and minute peak speeds', (await page.locator('#phaseTable thead').innerText()).includes('도달속도 (m/min)') && Number(await page.locator('#phaseTable tbody tr').nth(1).locator('td').nth(1).innerText()) === .6 && Number(await page.locator('#phaseTable tbody tr').first().locator('td').nth(3).innerText()) === 180);
    const plotted = await page.evaluate(() => {
      const chart = document.querySelector('#motionCharts .axis-chart-card svg');
      return { title: chart.getAttribute('aria-label'), ticks: [...chart.querySelectorAll('text[text-anchor="end"][font-size="8"]')].map(n => Number(n.textContent)) };
    });
    check('velocity graph scales its signed Y ticks to m/min', plotted.title.includes('m/min') && plotted.ticks[0] === -212 && plotted.ticks.at(-1) === 212);
    const motionCheck = await page.evaluate(c => {
      const cell = STCModel.cells(c).find(p => p.bay === 12 && p.level === 1 && p.side === -1), plan = STCMotion.plan(c, 'in', STCMotion.port(c, 'in'), cell, null, true);
      const firstMove = plan.actions.find(a => a.type === 'move');
      const time = firstMove.start + firstMove.duration / 2, seek = document.getElementById('motionSeek'); seek.value = String(Math.round(time / plan.duration * 1000)); seek.dispatchEvent(new Event('input', { bubbles: true }));
      const pose = STCMotion.planAt(plan, Number(seek.value) / 1000 * plan.duration);
      return ['x', 'y', 'f'].every(axis => document.getElementById('motionValue-' + axis).textContent === STCCharts.fmt(pose[axis].p, 2) + ' m  ·  ' + STCCharts.fmt(pose[axis].v * 60, 2) + ' m/min  ·  ' + STCCharts.fmt(pose[axis].a, 2) + ' m/s²');
    }, saved.config);
    check('graph playback values use the same trajectory with x60 velocity conversion', motionCheck);
    await page.screenshot({ path: path.join(qa, 'v022-height-motion.png'), fullPage: true });
    await page.locator('#speedUnit').selectOption('m/s'); await apply();
    check('optional m/s switch preserves physical values and updates graph units', await page.locator('#vx').inputValue() === '3' && (await page.locator('#phaseTable thead').innerText()).includes('도달속도 (m/s)') && (await page.locator('#motionCharts .chart-title').first().innerText()) === '속도 / m/s');
    await page.locator('#speedUnit').selectOption('m/min'); await page.locator('#levelPitch').fill('4'); await apply();
    check('unreachable top height is rejected and pitch input highlighted', (await page.locator('#error').innerText()).includes('12.6 m') && await page.locator('#levelPitch').getAttribute('aria-invalid') === 'true');
    await page.locator('#levelPitch').fill('2.4'); await apply();
    await page.locator('#applyCase').click(); await apply();
    check('FEM application retains custom actual heights', await page.locator('#error').isHidden() && await page.locator('#firstLevelHeight').inputValue() === '0.6' && (await page.locator('#levelHeights tbody tr').last().innerText()).includes('7.800'));
    await page.locator('#projectFile').setInputFiles(savedPath);
    await page.waitForFunction(() => document.getElementById('method').value === 'cells' && document.body.dataset.dirty === 'false');
    check('JSON reload restores geometry and minute inputs', await page.locator('#levelPitch').inputValue() === '2.4' && await page.locator('#vx').inputValue() === '180');
    await page.locator('#levels').fill('1'); await page.locator('#firstLevelHeight').fill('0'); await apply();
    await page.locator('[data-tab="simulation"]').click();
    check('one-level rack at floor height renders with padded label textures', await page.evaluate(() => qaScene.rack.every(c => c.y === 0) && qaScene.labels.filter(l => l.userData.axis === 'levels').every(l => l.userData.positions[0] === 0 && l.geometry.parameters.height > 12)));
    await page.locator('#firstLevelHeight').fill('12'); await apply();
    check('one-level rack at maximum height is accepted and rendered', await page.locator('#error').isHidden() && await page.evaluate(() => qaScene.rack.every(c => c.y === 12)));
    await page.locator('#projectFile').setInputFiles([]); // The UI load button also clears the prior file selection.
    await page.locator('#projectFile').setInputFiles(savedPath);
    await page.waitForFunction(() => document.getElementById('levels').value === '4' && document.body.dataset.dirty === 'false');
    await page.setViewportSize({ width: 390, height: 844 }); await page.locator('[data-tab="overview"]').click();
    check('new geometry controls and table fit the mobile layout', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(qa, 'v022-height-mobile.png'), fullPage: true });
    check('offline run has no browser errors or network requests', errors.length === 0 && network.length === 0);
    fs.writeFileSync(path.join(qa, 'v022-height-results.json'), JSON.stringify({ checks, errors, network, browser: await browser.version(), testedAt: new Date().toISOString() }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
