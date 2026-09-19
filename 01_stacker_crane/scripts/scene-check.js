const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.STC_PLAYWRIGHT_PATH || path.join(os.tmpdir(), 'stc-browser-check/node_modules/playwright'));
const qa = process.env.STC_QA_DIR || path.join(os.tmpdir(), 'stc-browser-check/results');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1480, height: 1080 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../../스태커크레인_실행.html')).href);
    await page.locator('[data-tab="simulation"]').click(); await page.locator('#scene canvas').waitFor();
    const regression = await page.evaluate(() => {
      const host = document.createElement('div'); host.style.cssText = 'width:640px;height:360px;position:fixed;left:-1000px'; document.body.appendChild(host);
      const engine = new STCEngine.Engine(STCModel.defaults), view = new STCScene.Scene(host, STCModel.defaults, () => {}); view.update(engine);
      const matrix = new THREE.Matrix4(); let fullSizeLoads = 0;
      for (let i = 0; i < engine.rack.length; i++) { view.loads.getMatrixAt(i, matrix); if (Math.abs(matrix.elements[0] - 1) < .001) fullSizeLoads++; }
      const report = { loadMeshAttached: view.loads.parent === view.scene, fullSizeLoads, inventory: engine.initialInventory, cellCount: view.loads.count, drawCalls: view.renderer.info.render.calls };
      view.dispose(); host.remove(); return report;
    });
    assert.equal(regression.loadMeshAttached, true); assert.equal(regression.fullSizeLoads, regression.inventory); assert.equal(regression.cellCount, 600);
    assert.ok(regression.drawCalls < 30, 'static rack batching should keep draw calls below 30');
    await page.locator('#simSeek').evaluate(el => { el.value = 200; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.screenshot({ path: path.join(qa, '03-simulation.png'), fullPage: true });
    await page.locator('#simPlay').click();
    const startClock = await page.locator('#simClock').innerText();
    await page.waitForFunction(start => document.getElementById('simClock').textContent !== start, startClock);
    await page.locator('#simPlay').click();
    await page.locator('#viewFront').click(); await page.locator('#viewIso').click();
    assert.equal(errors.length, 0);
    fs.writeFileSync(path.join(qa, 'scene-results.json'), JSON.stringify({ ...regression, playback: true, viewSwitch: true, errors, testedAt: new Date().toISOString() }, null, 2));
    console.log('SCENE CHECK: ' + JSON.stringify(regression) + '; playback/view switch passed; no page errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
