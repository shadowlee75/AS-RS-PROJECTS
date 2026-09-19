// Verifies transfer kinematics, real 3D cargo attachment and UI units in the shipped offline HTML.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.STC_PLAYWRIGHT_PATH || path.join(os.tmpdir(), 'stc-browser-check/node_modules/playwright'));
const Model = require('../src/model.js'), base = path.resolve(__dirname, '..');
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
  const load = async data => {
    await page.locator('#projectFile').setInputFiles({ name: 'transfer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await page.waitForFunction(name => document.getElementById('name').value === name && document.body.dataset.dirty === 'false', data.config.name);
  };
  const download = async id => { const event = page.waitForEvent('download'); await page.locator(id).click(); return await event; };
  try {
    await page.goto(pathToFileURL(path.resolve(base, '../스태커크레인_실행.html')).href);
    await page.locator('#analysisKpis .kpi').first().waitFor();
    check('110 mm default input and independent settling dwell are shown', await page.locator('#transferLift').inputValue() === '110' && (await page.locator('label[for="forkDwell"]').innerText()).includes('안착 대기'));
    const old = Model.pack({ ...Model.defaults, name: '이전 프로젝트 이재 모델' }); delete old.config.transferLift; old.moduleVersion = '0.2.3';
    await load(old);
    check('older projects initialize the newly specified 110 mm stroke', await page.locator('#transferLift').inputValue() === '110');
    const c = { ...Model.defaults, name: '110 mm 상하차 동작 검증', length: 6, height: 4, bays: 3, levels: 2, sides: 2,
      firstLevelHeight: 1, levelPitch: 2, cranes: 2, ioX: -1, ioY: .5, ioZ: -.8, outX: -1, outY: 1.5, outZ: .8,
      ports: [{}, { ioX: 7, outX: 7, ioY: 2, outY: 0, ioZ: .8, outZ: -.8 }],
      inbound: 200, outbound: 200, peak: 1, hours: .1, warmup: 0, jitter: 0, mode: 'dc' };
    await load(Model.pack(c));
    await page.locator('[data-tab="simulation"]').click(); await page.locator('#scene canvas').waitFor();
    check('all requested STCs have independent real 3D carriages and forks', await page.evaluate(() => qaScene.aisles.length === 2 && !qaScene.fallback));
    const result = await page.evaluate(() => {
      const s = qaScene, fleet = s.latestFleet, near = (a, b) => Math.abs(a - b) < 1e-5;
      fleet.advanceTo(0);
      const samples = [];
      fleet.engines.forEach((e, aisle) => {
        e.cycle.plan.actions.filter(a => a.type === 'fork').forEach(a => {
          const f = a.fork;
          for (const [stage, t] of [['out', f.liftStart / 2], ['lift', f.liftStart + f.lift.duration / 4],
            ['lift', f.liftStart + f.lift.duration * 3 / 4], ['settle', f.liftEnd + f.dwell / 2],
            ['in', f.retractStart + f.profile.duration / 2]]) samples.push({ aisle, effect: a.effect, stage, time: e.cycle.start + a.start + t });
        });
      });
      const observations = [], failures = [];
      for (const item of samples.sort((a, b) => a.time - b.time)) {
        fleet.advanceTo(item.time); s.lastRender = -Infinity; s.update(fleet); s.scene.updateMatrixWorld(true);
        const a = s.aisles[item.aisle], p = a.engine.pose(), transfer = p.transfer, point = transfer.point;
        const cargo = new THREE.Vector3(); a.cargo.getWorldPosition(cargo);
        const cargoFollows = transfer.onFork ? near(cargo.y, p.y.p) && near(cargo.z, a.z + p.f.p) : near(cargo.y, point.y) && near(cargo.z, a.z + point.z);
        if (p.action.effect !== item.effect || transfer.stage !== item.stage) failures.push('stage ' + JSON.stringify(item));
        if (!near(a.carriage.position.y, p.y.p) || !near(a.fork.position.z, p.f.p)) failures.push('axes');
        if (item.stage === 'lift' && !(p.y.v * (transfer.pick ? 1 : -1) > 0 && near(p.f.v, 0) && near(Math.abs(p.f.p), Math.abs(point.z)))) failures.push('vertical interlock');
        if (a.cargo.visible && !cargoFollows) failures.push('cargo follows or rests incorrectly');
        let rackScale = null;
        if (point.id != null) {
          const matrix = new THREE.Matrix4(); s.loads.getMatrixAt(item.aisle * s.rack.length + point.id, matrix);
          rackScale = new THREE.Vector3().setFromMatrixScale(matrix).x;
          const loaded = item.effect === 'pickOut' ? !transfer.onFork : !transfer.onFork;
          const expected = loaded ? 1 : .18;
          if (!near(rackScale, expected)) failures.push('duplicate or missing rack cargo: ' + JSON.stringify(item));
          if (a.cargo.visible !== transfer.onFork) failures.push('rack transfer visibility');
        } else if (!a.cargo.visible) failures.push('port cargo is missing');
        const ledger = fleet.snapshot();
        if (!ledger.conservation || !ledger.jobsConserved) failures.push('ledger');
        observations.push({ ...item, y: p.y.p, fork: p.f.p, cargo: cargo.toArray(), cargoVisible: a.cargo.visible, rackScale, label: p.label });
      }
      return { observations, failures };
    });
    check('40 phase samples cover both STCs and all four transfer operations', result.observations.length === 40 && new Set(result.observations.map(x => x.effect)).size === 4);
    check('cargo lifts with the fork and stays on the destination during retraction without duplication', result.failures.length === 0);
    fs.writeFileSync(path.join(qa, 'v024-transfer-poses.json'), JSON.stringify(result, null, 2));
    // Reset and seek the real UI to the middle of a rack pickup.
    await page.locator('#simReset').click();
    const target = await page.evaluate(() => {
      const fleet = qaScene.latestFleet; fleet.advanceTo(0);
      const a = fleet.engines[0].cycle.plan.actions.find(a => a.effect === 'pickOut');
      return (a.start + a.fork.liftStart + a.fork.lift.duration / 2) / fleet.horizon * 1000;
    });
    await page.locator('#simSeek').evaluate((e, t) => { e.value = String(t); e.dispatchEvent(new Event('change', { bubbles: true })); }, target);
    await page.locator('#viewIso').click(); await page.locator('#toast').waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.join(qa, 'v024-transfer-3d.png'), fullPage: true });
    await page.locator('#simFinish').click(); await page.waitForFunction(() => document.getElementById('measureStatus').textContent === '측정 종료');
    check('full fleet simulation completes with preserved inventory and work counts', await page.evaluate(() => { const s = qaScene.latestFleet.snapshot(); return s.conservation && s.jobsConserved && s.completed.in > 0 && s.completed.out > 0; }));
    await page.locator('[data-tab="motion"]').click();
    check('motion timeline identifies fork OUT/IN and carriage UP/DOWN 110 mm', (await page.locator('#motionTimeline').textContent()).includes('UP 110 mm') && (await page.locator('#motionTimeline').textContent()).includes('DOWN 110 mm'));
    check('phase table includes the 0.11 m carriage profile', (await page.locator('#phaseTable tbody tr').last().innerText()).includes('캐리지 이재 UP / DOWN') && (await page.locator('#phaseTable tbody tr').last().innerText()).includes('0.11'));
    const motion = await page.evaluate(() => {
      const c = qaScene.config, rack = STCModel.cells(c);
      const cell = (bay, level, side) => rack.find(p => p.bay === +document.getElementById(bay).value && p.level === +document.getElementById(level).value && p.side === +document.getElementById(side).value);
      const plan = STCMotion.plan(c, document.getElementById('previewKind').value, STCMotion.port(c, 'in'),
        cell('previewBay', 'previewLevel', 'previewSide'), cell('previewOutBay', 'previewOutLevel', 'previewOutSide'), true);
      window.qaMotionPlan = plan;
      return plan.actions.filter(a => a.type === 'fork').map(a => ({ pick: a.pick, time: a.start + a.fork.liftStart + a.fork.lift.duration / 2, duration: plan.duration }));
    });
    for (const pick of [true, false]) {
      const a = motion.find(a => a.pick === pick);
      await page.locator('#motionSeek').evaluate((e, a) => { e.value = String(a.time / a.duration * 1000); e.dispatchEvent(new Event('input', { bubbles: true })); }, a);
      check((pick ? 'pickup' : 'deposit') + ' graph playback exposes the signed Y pulse and stopped fork', await page.evaluate(pick => {
        const p = STCMotion.planAt(qaMotionPlan, +document.getElementById('motionSeek').value / 1000 * qaMotionPlan.duration);
        return p.y.v * (pick ? 1 : -1) > 0 && p.f.v === 0 && document.getElementById('motionPhase').textContent.includes(pick ? 'UP 110 mm' : 'DOWN 110 mm');
      }, pick));
    }
    await page.locator('#toast').waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.join(qa, 'v024-transfer-motion.png'), fullPage: true });
    const savedPath = path.join(qa, 'v024-transfer-project.json'); await (await download('#saveProject')).saveAs(savedPath);
    const saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
    check('saved project stores 0.11 m and SI speeds with m/min display', saved.config.transferLift === .11 && saved.config.vy === 1 && saved.config.speedUnit === 'm/min');
    const reportPath = path.join(qa, 'v024-transfer-report.md'); await (await download('#report')).saveAs(reportPath);
    const md = fs.readFileSync(reportPath, 'utf8');
    check('report contains both sequences and 110 mm input', md.includes('UP 110 mm') && md.includes('DOWN 110 mm') && md.includes('캐리지 이재 승하강량 | 110 | mm'));
    await page.locator('#transferLift').fill('150'); await page.locator('#calculate').click();
    await page.locator('[data-tab="simulation"]').click();
    check('editing lift in millimetres changes SI configuration to 0.15 m', await page.evaluate(() => qaScene.config.transferLift === .15));
    await page.locator('#speedUnit').selectOption('m/s'); await page.locator('#calculate').click();
    check('speed unit conversion preserves lift input and SI distance', await page.locator('#transferLift').inputValue() === '150' && await page.evaluate(() => qaScene.config.transferLift === .15));
    await page.locator('#projectFile').setInputFiles(savedPath); await page.waitForFunction(() => document.getElementById('transferLift').value === '110');
    check('project reload restores the 110 mm setting', await page.locator('#transferLift').inputValue() === '110');
    await page.locator('#transferLift').fill('-1'); await page.locator('#calculate').click();
    check('invalid lift shows a millimetre range error', await page.locator('#error').isVisible() && (await page.locator('#error').innerText()).includes('0 ~ 1000 mm'));
    await page.locator('#transferLift').fill('110'); await page.locator('#calculate').click();
    await page.setViewportSize({ width: 390, height: 844 });
    check('new transfer fields fit the mobile document width', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    check('no JavaScript errors or runtime network requests', errors.length === 0 && network.length === 0);
    fs.writeFileSync(path.join(qa, 'v024-transfer-results.json'), JSON.stringify({ checks, errors, network, browser: await browser.version(), testedAt: new Date().toISOString() }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
