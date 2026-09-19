// Local Edge fallback when the connected Browser has no available browser.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.STC_PLAYWRIGHT_PATH || path.join(os.tmpdir(), 'stc-browser-check/node_modules/playwright'));
const qa = path.join(os.tmpdir(), 'stc-browser-check/results/help'); fs.mkdirSync(qa, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1480, height: 1050 } });
  const page = await context.newPage(), errors = [], requests = [], checks = [];
  context.on('page', p => p.on('pageerror', e => errors.push(e.message))); page.on('pageerror', e => errors.push(e.message));
  context.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
  await context.route(/^https?:/, r => r.abort());
  const check = (name, ok) => { assert.ok(ok, name); checks.push(name); console.log('PASS ' + name); };
  const help = (key, p = page) => p.locator('[data-help="' + key + '"]');
  const panel = page.locator('#contextHelp');
  const close = async () => { if (await panel.isVisible()) await page.keyboard.press('Escape'); await page.mouse.move(1470, 1040); };
  const withinViewport = p => p.evaluate(() => {
    const r = document.getElementById('contextHelp').getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
  });
  try {
    const url = pathToFileURL(path.resolve(__dirname, '../../스태커크레인_실행.html')).href;
    await page.goto(url); await help('length').waitFor();
    const coverage = await page.evaluate(() => ({
      fields: Object.keys(STCModel.defaults).filter(k => k !== 'ports' && !document.querySelector('[data-help="' + k + '"]')),
      actions: [...document.querySelectorAll('button[id]:not(.help-close), select[id], input[type=range]')].filter(e => !document.querySelector('[data-help="' + e.id + '"]')).map(e => e.id),
      tabs: [...document.querySelectorAll('[data-tab]')].every(e => e.parentElement.querySelector('.help-button')),
      summaries: [...document.querySelectorAll('summary')].every(e => e.querySelector('.help-button')),
      nested: document.querySelectorAll('button button,label .help-button').length,
      count: document.querySelectorAll('.help-button').length
    }));
    check('all configuration fields, actions, tabs, section menus and sliders have help', !coverage.fields.length && !coverage.actions.length && coverage.tabs && coverage.summaries);
    check('help never nests a button inside an action or an input label', coverage.nested === 0);
    const baseline = await page.locator('#analysisKpis').innerText();
    await help('length').hover(); await panel.waitFor();
    check('hover opens specific input rules and a numeric cargo-center example', (await panel.innerText()).includes('2.825') && (await panel.innerText()).includes('랙 길이'));
    await panel.hover(); await page.waitForTimeout(300);
    check('pointer can move into the help and keep reading it', await panel.isVisible());
    await page.mouse.move(1460, 1030); await panel.waitFor({ state: 'hidden' });
    check('unpinned hover help closes after leaving the trigger and panel', await panel.isHidden());
    await help('length').click(); await page.mouse.move(1460, 1030); await page.waitForTimeout(300);
    check('click pins help while the pointer leaves', await panel.isVisible() && await panel.getAttribute('data-pinned') === 'true');
    await help('height').hover();
    check('hovering a second help leaves the pinned explanation intact', (await panel.locator('strong').innerText()) === '랙 길이');
    await help('height').click();
    check('clicking a different help replaces the pinned explanation', (await panel.locator('strong').innerText()) === '랙 높이' && await help('length').getAttribute('aria-expanded') === 'false');
    await help('height').click(); check('second click toggles the pinned help closed', await panel.isHidden());
    await help('length').click(); await page.locator('h1').click();
    check('outside click closes help without dirtying or recalculating', await panel.isHidden() && await page.locator('body').getAttribute('data-dirty') === 'false' && await page.locator('#analysisKpis').innerText() === baseline);
    await help('length').focus(); await page.keyboard.press('Enter');
    check('keyboard Enter pins help and moves focus to its close control', await panel.getAttribute('data-pinned') === 'true' && await panel.locator('.help-close').evaluate(e => e === document.activeElement));
    await page.keyboard.press('Escape');
    check('Escape closes help and returns keyboard focus to its trigger', await panel.isHidden() && await help('length').evaluate(e => e === document.activeElement) && await help('length').getAttribute('aria-expanded') === 'false');
    await page.keyboard.press('Space'); await panel.locator('.help-close').click();
    check('Space activates help and the close button restores focus without reopening', await panel.isHidden() && await help('length').evaluate(e => e === document.activeElement));
    const details = page.locator('#factorFields').locator('xpath=ancestor::details');
    await help('factorSection').click();
    check('section question mark does not expand a collapsed menu', !(await details.evaluate(e => e.open)) && await panel.isVisible());
    await close(); await details.locator('summary').click(); check('section menu still expands normally', await details.evaluate(e => e.open));
    await help('simulationTab').click();
    check('tab question mark does not change the active page', await page.locator('[data-tab="overview"]').getAttribute('aria-pressed') === 'true');
    await close(); await page.locator('[data-tab="simulation"]').click(); await page.locator('#scene canvas').waitFor();
    await help('simPlay').click(); await page.waitForTimeout(300);
    check('play help does not start the simulator', (await page.locator('#simClock').innerText()) === '00:00:00');
    await close(); await page.locator('#length').fill('61'); await help('simStep').click();
    check('help remains usable while results await applying changed inputs', await panel.isVisible() && await page.locator('body').getAttribute('data-dirty') === 'true');
    await close(); await page.locator('#calculate').click();
    await page.locator('#cranes').fill('2'); await page.locator('#cranes').press('Tab');
    await close();
    await page.locator('#portTable tbody tr').nth(1).locator('[data-port="ioX"]').fill('-3');
    await page.locator('#editPorts').click();
    check('rebuilt STC port table retains overrides and one help per column', await page.locator('#portTable tbody tr').count() === 2 && await page.locator('#portTable thead .help-button').count() === 7 && await page.locator('#portTable tbody tr').nth(1).locator('[data-port="ioX"]').inputValue() === '-3');
    await help('individual-outX').click();
    check('port help explains per-STC blanks, zero and external coordinates', (await panel.innerText()).includes('0은 실제 좌표 0') && (await panel.innerText()).includes('음수') && await withinViewport(page));
    await page.screenshot({ path: path.join(qa, 'v026-ports-help.png') });
    await close(); await page.locator('#calculate').click(); await page.locator('[data-tab="motion"]').click();
    await help('transferLift').click();
    check('carriage help preserves the agreed OUT, UP/DOWN 110 mm, IN sequence', (await panel.innerText()).includes('110 mm') && (await panel.innerText()).includes('캐리지 UP → 포크 IN') && (await panel.innerText()).includes('캐리지 DOWN → 포크 IN'));
    await close(); await page.locator('#pdfReport').click(); await help('pdfDocumentNo').click();
    check('PDF dialog help is visible and interactive in the modal top layer', await panel.isVisible() && await panel.evaluate(e => e.parentElement.id === 'pdfOptions' && e.matches(':popover-open')) && await withinViewport(page));
    await page.screenshot({ path: path.join(qa, 'v026-pdf-help.png') });
    await page.keyboard.press('Escape');
    check('Escape closes PDF help while leaving the PDF settings dialog open', await panel.isHidden() && await page.locator('#pdfOptions').evaluate(e => e.open));
    const wasChecked = await page.locator('#pdfIncludeGraphs').isChecked();
    await help('pdfIncludeGraphs').click(); await page.keyboard.press('Escape');
    check('checkbox help does not change PDF inclusion choices', await page.locator('#pdfIncludeGraphs').isChecked() === wasChecked);
    const popupPromise = page.waitForEvent('popup'); await page.locator('#createPdfReport').click(); const popup = await popupPromise;
    await popup.waitForLoadState();
    check('PDF preview still opens with six motion graphs and no help controls', await popup.locator('.axis-chart-card svg').count() === 6 && await popup.locator('.help-button,#contextHelp').count() === 0);
    await popup.close(); await page.locator('[data-tab="overview"]').click(); await help('overviewTab').click();
    await page.emulateMedia({ media: 'print' });
    check('main-page printing hides question marks and open help', await panel.isHidden() && await help('overviewTab').isHidden());
    await page.emulateMedia({ media: 'screen' }); await close();
    await page.evaluate(() => { document.querySelector('.sidebar').scrollTop = 0; window.scrollTo(0, 0); });
    await help('overviewTab').click(); await page.screenshot({ path: path.join(qa, 'v026-overview-help.png') }); await close();
    for (const width of [1024, 780, 390, 320]) {
      await page.setViewportSize({ width, height: 844 }); await page.locator('.top-actions [data-help="pdfReport"]').click();
      check('viewport ' + width + ' fits the page and help panel', await withinViewport(page) && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.keyboard.press('Escape');
    }
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.route(/^https?:/, r => r.abort()); const touchPage = await mobile.newPage(); touchPage.on('pageerror', e => errors.push(e.message));
    await touchPage.goto(url); await help('length', touchPage).tap();
    check('touch opens pinned help with accessible touch targets', await touchPage.locator('#contextHelp').getAttribute('data-pinned') === 'true' && (await help('length', touchPage).boundingBox()).width >= 28 && await withinViewport(touchPage));
    await touchPage.screenshot({ path: path.join(qa, 'v026-mobile-help.png') });
    await touchPage.locator('#contextHelp .help-close').tap();
    check('touch close leaves the help dismissed', await touchPage.locator('#contextHelp').isHidden());
    await mobile.close();
    if (errors.length || requests.length) console.log({ errors, requests });
    check('no browser errors or HTTP dependencies', !errors.length && !requests.length);
    fs.writeFileSync(path.join(qa, 'v026-help-results.json'), JSON.stringify({ checks, coverage, errors, requests, browser: await browser.version(), testedAt: new Date().toISOString() }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
