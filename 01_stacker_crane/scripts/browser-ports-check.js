// External ports and actual cargo-center P1/P2 verification against the shipped HTML.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.STC_PLAYWRIGHT_PATH || path.join(os.tmpdir(), 'stc-browser-check/node_modules/playwright'));
const Model = require('../src/model.js'), Motion = require('../src/motion.js'), base = path.resolve(__dirname, '..');
const qa = path.join(os.tmpdir(), 'stc-browser-check/results'); fs.mkdirSync(qa, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1640, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage(), checks = [], errors = [], network = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  await context.route(/^https?:/, r => r.abort());
  await page.addInitScript(() => {
    let api; Object.defineProperty(window, 'STCScene', { configurable: true, get: () => api, set: value => {
      const Original = value.Scene; value.Scene = class extends Original { constructor(...args) { super(...args); window.qaScene = this; } }; api = value;
    } });
  });
  const check = (name, condition) => { assert.ok(condition, name); checks.push(name); console.log('PASS ' + name); };
  const near = (a, b) => Math.abs(a - b) < 1e-5;
  const apply = async () => { await page.locator('#calculate').click(); };
  const load = async c => {
    await page.locator('#projectFile').setInputFiles({ name: c.name + '.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(Model.pack(c))) });
    await page.waitForFunction(c => document.getElementById('name').value === c.name && document.body.dataset.dirty === 'false', c);
  };
  const download = async (id, name) => { const event = page.waitForEvent('download'); await page.locator(id).click(); const file = path.join(qa, name); await (await event).saveAs(file); return file; };
  try {
    await page.goto(pathToFileURL(path.resolve(base, '../스태커크레인_실행.html')).href); await page.locator('#analysisKpis .kpi').first().waitFor();
    check('default P1/P2 mode is actual cargo center', await page.locator('#pointMode').inputValue() === 'cell');
    const c = { ...Model.defaults, name: '외부 포트·화물 중심 검증 예시', method: 'fem', femCase: 6, length: 33.9, height: 17, bays: 6, levels: 6, firstLevelHeight: 1.3, levelPitch: 2.5,
      cranes: 2, ioX: -3, ioY: 9.6, outX: -3, outY: 1.6, hours: .2, warmup: 0, inbound: 140, outbound: 140, peak: 1,
      ports: [{}, { ioX: 38, ioY: 9.6, outX: 38, outY: 1.6 }] };
    await load(c);
    check('negative and beyond-rack ports load for two real STCs without stretching the rack', await page.locator('#error').isHidden() && await page.locator('#length').inputValue() === '33.9' && await page.locator('#ioX').inputValue() === '-3' && (await page.locator('#aisleAnalysis').innerText()).includes('38.00'));
    const r = Model.calculate(c), points = r.fem.inbound;
    const rows = await page.locator('#femPoints tbody tr').evaluateAll(rows => rows.map(r => [...r.children].map(c => c.textContent)));
    check('representative point table uses the actual cell XYZ and addresses', rows.length === 4 && rows.every((row, i) => { const p = r.aisles[Math.floor(i / 2)].fem.inbound[i % 2]; return near(Number(row[2]), p.x) && near(Number(row[3]), p.y) && near(Number(row[4]), p.z) && row[5] === Model.address(p, Math.floor(i / 2)); }));
    check('actual port extension and comparison coordinates are clearly labeled', (await page.locator('#femSummary').innerText()).includes('설계 계산') && (await page.locator('#femPoints thead').innerText()).includes('이론 XYZ') && await page.locator('#referencePorts tbody tr').count() === 2);
    const diagram = await page.locator('#rackDiagram svg').evaluate(svg => {
      const markers = [...svg.querySelectorAll('[data-point]')];
      return { centered: markers.every(p => { const rect = svg.querySelector('[data-cell="' + p.dataset.cellId + '"]'); return rect && Math.abs(Number(p.getAttribute('cx')) - (Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2)) < 1e-7 && Math.abs(Number(p.getAttribute('cy')) - (Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) / 2)) < 1e-7; }),
        rackLeft: Number(svg.querySelector('[data-rack]').getAttribute('x')), portX: Number(svg.querySelector('[data-port="in"]').getAttribute('cx')), allVisible: [...svg.querySelectorAll('[data-point], [data-port]')].every(p => Number(p.getAttribute('cx')) > 0 && Number(p.getAttribute('cx')) < 750 && Number(p.getAttribute('cy')) > 0 && Number(p.getAttribute('cy')) < 290), cells: svg.querySelectorAll('[data-cell]').length };
    });
    check('P1/P2 circles coincide with cargo rectangle centers in the drawing', diagram.centered && diagram.cells === 36);
    check('negative port appears outside the rack and inside the SVG viewport', diagram.portX < diagram.rackLeft && diagram.allVisible);
    await page.locator('.sidebar').evaluate(e => { e.scrollTop = 0; }); await page.locator('#toast').waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.join(qa, 'v023-ports-overview.png'), fullPage: true });
    await page.locator('[data-tab="simulation"]').click(); await page.locator('#scene canvas').waitFor();
    const info = await page.evaluate(() => {
      const s = qaScene, matrix = new THREE.Matrix4();
      const centered = s.pointMarkers.every(p => { s.loads.getMatrixAt(p.userData.aisle * s.rack.length + p.userData.cellId, matrix); return p.position.distanceTo(new THREE.Vector3().setFromMatrixPosition(matrix)) < 1e-5; });
      const ports = s.labels.filter(l => l.userData.text?.startsWith('IN (') || l.userData.text?.startsWith('OUT (')).map(l => { const p = l.position.clone().project(s.camera); return { text: l.userData.text, visible: Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z > -1 && p.z < 1 }; });
      return { centered, markers: s.pointMarkers.length, cells: s.loads.count, ports, bounds: s.bounds, centers: s.rack.filter(c => c.level === 1 && c.side === -1).map(c => c.x) };
    });
    check('all four 3D P1/P2 markers exactly enclose the corresponding cargo centers', info.centered && info.markers === 4 && info.cells === 144);
    check('3D camera includes ports on both outside ends', info.bounds.xMin === -3 && info.bounds.xMax === 38 && info.ports.length === 4 && info.ports.every(p => p.visible));
    check('physical bay centers remain at the 5.65 m pitch', info.centers.every((x, i) => near(x, [2.825, 8.475, 14.125, 19.775, 25.425, 31.075][i])));
    await page.locator('#simSpeed').selectOption('50'); await page.locator('#simPlay').click();
    await page.waitForFunction(() => qaScene.aisles.every(a => a.engine.time > 40), null, { timeout: 15000 }); await page.locator('#simPlay').click();
    check('all outside-port STCs animate using their own signed motion poses', await page.evaluate(() => qaScene.aisles.every(a => a.crane.position.x === a.engine.pose().x.p && a.carriage.position.y === a.engine.pose().y.p && a.fork.position.z === a.engine.pose().f.p)));
    await page.screenshot({ path: path.join(qa, 'v023-ports-3d.png'), fullPage: true });
    await page.locator('#simFinish').click(); await page.waitForFunction(() => document.getElementById('measureStatus').textContent === '측정 종료');
    check('external-port simulation completes with inventory and job conservation', await page.evaluate(() => qaScene.latestFleet.snapshot().conservation && qaScene.latestFleet.snapshot().jobsConserved && qaScene.latestFleet.snapshot().completed.in > 0 && qaScene.latestFleet.snapshot().completed.out > 0));
    await page.locator('[data-tab="motion"]').click();
    check('CASE motion source is automatically selected and identifies real cells', await page.locator('#motionSource').inputValue() === 'fem' && (await page.locator('#previewDescription').innerText()).includes(Model.address(points[0], 0)));
    const duration = Motion.plan(c, 'dc', Motion.port(c, 'in'), points[0], points[1], true).duration;
    check('motion graph duration matches the actual exterior-port and cell-center route', near(Number(await page.locator('#motionCharts svg').first().getAttribute('data-duration')), duration));
    await page.locator('#motionSeek').evaluate(e => { e.value = 350; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.screenshot({ path: path.join(qa, 'v023-ports-motion.png'), fullPage: true });
    const savedPath = await download('#saveProject', 'v023-ports-project.json'), saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
    check('project export keeps negative ports, per-STC outside ports and center mode', saved.config.ioX === -3 && saved.config.ports[1].outX === 38 && saved.config.pointMode === 'cell');
    const md = fs.readFileSync(await download('#report', 'v023-ports-report.md'), 'utf8');
    check('report exports applied cell coordinates and reference coordinates separately', md.includes('적용 화물 셀') && md.includes(Model.address(points[0], 0)) && md.includes('이론 XYZ (비교)') && md.includes('설계 확장'));
    await page.locator('#pointMode').selectOption('theory'); await apply();
    check('theory comparison enforces the original CASE port conditions', await page.locator('#error').isVisible() && (await page.locator('#error').innerText()).includes('이론 좌표 비교'));
    await page.locator('#pointMode').selectOption('cell'); await page.locator('#ioY').fill('-2'); await page.locator('#outY').fill('20'); await apply();
    check('below-datum and above-rack Y inputs also calculate', await page.locator('#error').isHidden() && (await page.locator('#travelEnvelope').innerText()).includes('-2.000'));
    await page.locator('#outX').fill('40'); await apply(); await page.locator('[data-tab="overview"]').click();
    check('right external port is drawn beyond the last bay', await page.locator('#rackDiagram svg').evaluate(svg => { const r = svg.querySelector('[data-rack]'), p = svg.querySelector('[data-port="out"]'); return Number(p.getAttribute('cx')) > Number(r.getAttribute('x')) + Number(r.getAttribute('width')); }));
    for (let femCase = 1; femCase <= 6; femCase++) {
      await page.locator('#femCase').selectOption(String(femCase)); await apply();
      check('CASE ' + femCase + ' supports actual center selection with unchanged outside ports', await page.locator('#error').isHidden() && await page.locator('#ioX').inputValue() === '-3' && await page.locator('#outX').inputValue() === '40' && (await page.locator('#femPoints thead').innerText()).includes('적용 화물 셀'));
    }
    await page.locator('#projectFile').setInputFiles(savedPath); await page.waitForFunction(() => document.getElementById('outX').value === '-3' && document.body.dataset.dirty === 'false');
    check('project import restores external coordinates', await page.locator('#ioY').inputValue() === '9.6' && await page.locator('#pointMode').inputValue() === 'cell');
    await page.setViewportSize({ width: 390, height: 844 });
    check('new comparison table and external diagram fit the mobile page', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    check('no JavaScript errors or runtime network requests', errors.length === 0 && network.length === 0);
    fs.writeFileSync(path.join(qa, 'v023-ports-results.json'), JSON.stringify({ checks, errors, network, browser: await browser.version(), testedAt: new Date().toISOString() }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
