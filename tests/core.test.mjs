import { setupExtensionTest } from './harness.mjs';

const BASE = process.env.CEB_TEST_URL || 'http://localhost:8731';
const URL_UNDER_TEST = `${BASE}/index.html`;
const {
  ctx, sw, page, tabId, pageErrors, swErrors, results, check, teardown,
} = await setupExtensionTest({
  profilePrefix: 'ceb-profile-',
  initialUrl: URL_UNDER_TEST,
});

check('service worker registered', !!sw, sw?.url().split('/').pop());
check('page has an iframe', page.frames().length === 2, `${page.frames().length} frames`);
check('found tab from service worker', tabId !== null, `tabId=${tabId}`);

// Same sequence the toolbar-icon click handler runs.
const activate = (mode) => sw.evaluate(async ({ id, mode }) => {
  try {
    await ensureInitialized(id);
    await switchMode(id, mode);
    return 'ok';
  } catch (e) { return 'ERR ' + e.message; }
}, { id: tabId, mode });

const readStored = () => sw.evaluate(async (u) => {
  const url = new URL(u);
  const key = `changes_${url.origin}${url.pathname}`;
  const r = await chrome.storage.local.get([key]);
  return r[key] ?? null;
}, URL_UNDER_TEST);

check('activate blur mode', (await activate('blur')) === 'ok');
await page.waitForTimeout(1000);

const toolbars = await page.evaluate(() => document.querySelectorAll('#ceb-toolbar').length);
check('exactly one toolbar in top frame', toolbars === 1, `count=${toolbars}`);

const frameToolbars = await page.frames()[1].evaluate(() => document.querySelectorAll('#ceb-toolbar').length);
check('no toolbar inside iframe', frameToolbars === 0, `count=${frameToolbars}`);

// Simulate MV3 waking with an empty in-memory tab record, then race several callers.
// The existing top-frame listener must be probed rather than reinjected, and all callers
// must share one initialization flight.
const repeatedInit = await sw.evaluate(async (id) => {
  delete tabStates[id];
  await Promise.all(Array.from({ length: 4 }, () => ensureInitialized(id)));
  return { mode: tabStates[id]?.mode, inFlight: initializationFlights.size };
}, tabId);
const toolbarAfterRepeatedInit = await page.evaluate(() => document.querySelectorAll('#ceb-toolbar').length);
check('repeated concurrent initialization reuses the live page listener',
  repeatedInit.mode === 'blur' && repeatedInit.inFlight === 0 && toolbarAfterRepeatedInit === 1,
  JSON.stringify({ ...repeatedInit, toolbars: toolbarAfterRepeatedInit }));

// Blur two elements, one of which has selector-hostile id/class characters.
await page.click('#title');
await page.click('#odd\\.id');
await page.waitForTimeout(600);

const filters = await page.evaluate(() => ({
  title: getComputedStyle(document.querySelector('#title')).filter,
  odd: getComputedStyle(document.querySelector('#odd\\.id')).filter,
}));
check('click in blur mode blurs element', filters.title.includes('blur'), JSON.stringify(filters));
check('blurs element with awkward id/class chars', filters.odd.includes('blur'), filters.odd);

// One key press must produce one undo. Duplicate bootstrap listeners would consume both
// actions here; computed styles let the main world verify the result without reaching
// into the isolated world's lexical state.
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
await page.waitForFunction(() => [
  getComputedStyle(document.querySelector('#title')).filter,
  getComputedStyle(document.querySelector('#odd\\.id')).filter,
].filter(value => value.includes('blur')).length === 1, null, { timeout: 1500 }).catch(() => {});
const afterSingleUndo = await page.evaluate(() => [
  getComputedStyle(document.querySelector('#title')).filter,
  getComputedStyle(document.querySelector('#odd\\.id')).filter,
].filter(value => value.includes('blur')).length);
check('repeated initialization leaves exactly one global input listener', afterSingleUndo === 1,
  `${afterSingleUndo} blur rule${afterSingleUndo === 1 ? '' : 's'} after one undo`);
await page.click('#ceb-btn-redo');
await page.waitForTimeout(300);

const saved = await readStored();
const savedBlurs = (saved?.rules || []).filter(r => r.kind === 'blur');
check('changes written to storage', savedBlurs.length === 2, JSON.stringify(savedBlurs));

const selectorsResolve = await page.evaluate((rules) =>
  rules.every(b => { try { return document.querySelectorAll(b.selector).length === 1; } catch (e) { return false; } }),
  savedBlurs);
check('saved selectors resolve to exactly one element', selectorsResolve && savedBlurs.length === 2);

// Hide an element too, and confirm the saved selector is not polluted by ceb- classes.
check('activate hide mode', (await activate('hide')) === 'ok');
await page.waitForTimeout(400);
await page.click('#card-1');
await page.waitForTimeout(500);
const savedHide = await readStored();
const hideSel = (savedHide?.rules || []).filter(r => r.kind === 'hide').map(r => r.selector);
check('hide selector has no ceb- classes', hideSel.length > 0 && hideSel.every(s => !s.includes('ceb-')), JSON.stringify(hideSel));

// Reload — content script restores on its own with no message handshake.
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2000);
const restored = await page.evaluate(() => ({
  title: getComputedStyle(document.querySelector('#title')).filter,
  odd: getComputedStyle(document.querySelector('#odd\\.id')).filter,
  cardHidden: getComputedStyle(document.querySelector('#card-1 > p.para')).visibility,
  toolbars: document.querySelectorAll('#ceb-toolbar').length,
}));
check('auto-restores blur after reload', restored.title.includes('blur') && restored.odd.includes('blur'), JSON.stringify(restored));
check('auto-restores hide after reload', restored.cardHidden === 'hidden', restored.cardHidden);

// Area is a target, not a peer tool. "Draw" was mistaken for freehand annotation;
// Blur/Redact are effects, while Element/Area decides how that effect is targeted.
check('activate draw mode', (await activate('draw')) === 'ok');
await page.waitForTimeout(800);
const areaUi = await page.evaluate(() => {
  return {
    groups: [...document.querySelectorAll('.ceb-toolbar-body > .ceb-tb-section > .ceb-tb-section-label')]
      .slice(0, 3).map(item => item.textContent),
    content: [...document.querySelectorAll('.ceb-content-grid .ceb-tb-label')]
      .map(item => item.textContent),
    privacy: [...document.querySelectorAll('.ceb-privacy-grid .ceb-tb-label')]
      .map(item => item.textContent),
    hasPeerDrawTool: Boolean(document.querySelector('.ceb-tb-btn[data-mode="draw"]')),
    targetLabel: document.querySelector('#ceb-privacy-target > .ceb-tb-section-label')?.textContent,
    targets: [...document.querySelectorAll('#ceb-target-seg .ceb-seg-btn')]
      .map(item => item.textContent),
    targetActive: document.querySelector('#ceb-target-seg .ceb-seg-btn.active')?.dataset.target,
    effectActive: document.querySelector('.ceb-privacy-grid .ceb-tb-btn.active')?.dataset.mode,
    hint: document.querySelector('#ceb-mode-indicator')?.textContent,
  };
});
check('toolbar groups Content separately from Privacy effects',
  JSON.stringify(areaUi.groups.slice(0, 2)) === JSON.stringify(['Content', 'Privacy'])
    && JSON.stringify(areaUi.content) === JSON.stringify(['Edit', 'Annotate'])
    && JSON.stringify(areaUi.privacy) === JSON.stringify(['Blur', 'Hide', 'Redact']),
  JSON.stringify(areaUi));
check('Area is a target choice rather than a peer tool',
  !areaUi.hasPeerDrawTool && areaUi.targetLabel === 'Target'
    && JSON.stringify(areaUi.targets) === JSON.stringify(['Element', 'Area'])
    && areaUi.targetActive === 'area' && areaUi.effectActive === 'blur',
  JSON.stringify(areaUi));
check('Area points freehand users to Annotate Pen',
  /freehand.*Annotate.*Pen/i.test(areaUi.hint), JSON.stringify(areaUi));
const areaBadge = await sw.evaluate(async (id) => chrome.action.getBadgeText({ tabId: id }), tabId);
check('browser badge also calls the mode Area', areaBadge === 'Area', areaBadge);

await page.click('#ceb-target-seg .ceb-seg-btn[data-target="element"]');
await page.waitForTimeout(300);
const elementTargetMode = await page.evaluate(() => document.body.classList.contains('ceb-mode-blur'));
check('Element target returns Blur to element picking', elementTargetMode);
await page.click('#ceb-target-seg .ceb-seg-btn[data-target="area"]');
await page.waitForTimeout(300);
const areaTargetMode = await page.evaluate(() => document.body.classList.contains('ceb-mode-draw'));
check('Area target returns Blur to rectangle selection', areaTargetMode);

// Rectangular blur area must scroll with the document.
await page.mouse.move(200, 300);
await page.mouse.down();
await page.mouse.move(420, 430, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(600);

const areaBefore = await page.evaluate(() => {
  const el = document.querySelector('.ceb-blur-area');
  return el ? { top: el.getBoundingClientRect().top, position: getComputedStyle(el).position } : null;
});
check('Area created a blur region', !!areaBefore, JSON.stringify(areaBefore));
check('blur area is absolutely positioned', areaBefore?.position === 'absolute', areaBefore?.position);

await page.evaluate(() => window.scrollTo(0, 400));
await page.waitForTimeout(300);
const areaAfter = await page.evaluate(() => {
  const el = document.querySelector('.ceb-blur-area');
  return el ? el.getBoundingClientRect().top : null;
});
check('blur area scrolls with the page', areaBefore && areaAfter !== null && Math.abs((areaBefore.top - 400) - areaAfter) < 3,
  `before=${areaBefore?.top} after=${areaAfter}`);
await page.evaluate(() => window.scrollTo(0, 0));

// The area survives a reload and is not duplicated by a second restore.
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2000);
let areaCount = await page.evaluate(() => document.querySelectorAll('.ceb-blur-area').length);
check('area restored after reload', areaCount === 1, `count=${areaCount}`);

const savedNow = await readStored();
await sw.evaluate(async ({ id, changes }) => {
  await chrome.tabs.sendMessage(id, { action: 'applySavedChanges', changes });
}, { id: tabId, changes: savedNow }).catch(() => {});
await page.waitForTimeout(600);
areaCount = await page.evaluate(() => document.querySelectorAll('.ceb-blur-area').length);
check('re-applying saved changes does not duplicate areas', areaCount === 1, `count=${areaCount}`);

// Toolbar open/close must fully tear down.
check('activate blur mode again', (await activate('blur')) === 'ok');
await page.waitForTimeout(800);
await page.click('#ceb-toolbar .ceb-toolbar-close').catch(() => {});
await page.waitForTimeout(300);
const afterClose = await page.evaluate(() => document.querySelectorAll('#ceb-toolbar').length);
check('close removes the toolbar', afterClose === 0, `count=${afterClose}`);

// Reset must clear stored changes, not just local state.
await sw.evaluate(async (id) => { await resetPage(id); }, tabId);
await page.waitForTimeout(2500);
const afterReset = {
  stored: await readStored(),
  filter: await page.evaluate(() => getComputedStyle(document.querySelector('#title')).filter),
  areas: await page.evaluate(() => document.querySelectorAll('.ceb-blur-area').length),
};
check('reset clears stored changes', afterReset.stored === null, JSON.stringify(afterReset.stored));
check('reset actually un-blurs after reload', !afterReset.filter.includes('blur') && afterReset.areas === 0, JSON.stringify(afterReset));

check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('no service worker errors', swErrors.length === 0, swErrors.slice(0, 3).join(' | '));

await teardown();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
