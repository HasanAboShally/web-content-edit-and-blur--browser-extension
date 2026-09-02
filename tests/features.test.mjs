// Feature tests for the v2.1 additions: redaction, smart picker, undo/redo,
// site-scoped rules, export/import, and the Essentials/Advanced split.
import { setupExtensionTest } from './harness.mjs';

const BASE = process.env.CEB_TEST_URL || 'http://localhost:8731';
const URL1 = `${BASE}/index.html`;
const URL2 = `${BASE}/page2.html`;
const {
  sw, page, tabId, pageErrors, swErrors, results, check, teardown,
} = await setupExtensionTest({
  profilePrefix: 'ceb-feat-',
  initialUrl: URL1,
});

const activate = (mode) => sw.evaluate(async ({ id, mode }) => {
  try { await ensureInitialized(id); await switchMode(id, mode); return 'ok'; }
  catch (e) { return 'ERR ' + e.message; }
}, { id: tabId, mode });

const readKey = (key) => sw.evaluate(async (k) => (await chrome.storage.local.get([k]))[k] ?? null, key);
const pageKey = `changes_${BASE}/index.html`;
const siteKey = `site_${BASE}`;

// ---------- Redaction ----------
check('activate redact mode', (await activate('redact')) === 'ok');
await page.waitForTimeout(1000);
const externalRedactUi = await page.evaluate(() => ({
  view: document.querySelector('#ceb-toolbar')?.dataset.ui,
  visible: getComputedStyle(document.querySelector('.ceb-tb-btn[data-mode="redact"]')).display,
  active: document.querySelector('.ceb-tb-btn[data-mode="redact"]')?.classList.contains('active'),
}));
check('an external Redact activation reveals its Advanced control',
  externalRedactUi.view === 'advanced' && externalRedactUi.visible !== 'none' && externalRedactUi.active,
  JSON.stringify(externalRedactUi));
await page.click('#title');
await page.waitForTimeout(500);

const redactStyle = await page.evaluate(() => {
  const el = document.querySelector('#title');
  const cs = getComputedStyle(el);
  return { filter: cs.filter, bg: cs.backgroundColor, cls: el.className };
});
check('redact applies brightness(0)', redactStyle.filter.includes('brightness(0)'), redactStyle.filter);
check('redact applies opaque black background',
  /rgb\(0,\s*0,\s*0\)/.test(redactStyle.bg), redactStyle.bg);
check('redact tags element with class', redactStyle.cls.includes('ceb-redacted-element'), redactStyle.cls);

const redactStored = await readKey(pageKey);
check('redact rule persisted with kind=redact',
  (redactStored?.rules || []).some(r => r.kind === 'redact'),
  JSON.stringify((redactStored?.rules || []).map(r => r.kind)));

// The point of redaction is that it survives as a solid block — verify by sampling
// pixels rather than trusting the CSS.
const solid = await page.evaluate(async () => {
  const el = document.querySelector('#title');
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
});
check('redacted element still occupies layout space', solid);

// The whole point of redaction is that the pixels are gone, so assert on rendered
// output rather than trusting the computed style. #pic is a solid green SVG.
await activate('idle');
await page.waitForTimeout(500);
await activate('redact');
await page.waitForTimeout(700);
await page.click('#pic');
await page.waitForTimeout(600);
await activate('idle');           // drop the editing outline before capturing
await page.waitForTimeout(600);

const shot = await page.locator('#pic').screenshot();
const { width, height } = await page.locator('#pic').boundingBox();
const leaked = await page.evaluate(async (dataUrl) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  // Inset to skip the inline element's 1px of surrounding page background.
  const d = g.getImageData(3, 3, c.width - 6, c.height - 6).data;
  let nonBlack = 0, greenish = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] + d[i + 1] + d[i + 2] > 12) nonBlack++;
    if (d[i + 1] > d[i] + 20 && d[i + 1] > d[i + 2] + 20) greenish++;
  }
  return { nonBlack, greenish, total: d.length / 4 };
}, `data:image/png;base64,${shot.toString('base64')}`);

check('redaction leaves no original colour', leaked.greenish === 0, `${leaked.greenish} green px`);
check('redacted area renders fully opaque black',
  leaked.nonBlack === 0, `${leaked.nonBlack}/${leaked.total} non-black`);

// ---------- Undo / redo ----------
// Operates on #pic because that was the most recent action.
await page.keyboard.press('Control+z');
await page.waitForTimeout(500);
const afterUndo = await page.evaluate(() => getComputedStyle(document.querySelector('#pic')).filter);
check('undo removes the redaction', !afterUndo.includes('brightness(0)'), afterUndo);

await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(500);
const afterRedo = await page.evaluate(() => getComputedStyle(document.querySelector('#pic')).filter);
check('redo restores the redaction', afterRedo.includes('brightness(0)'), afterRedo);

// Regression: undo used to be gated on being in a mode, so pressing Escape to view
// the result and then Ctrl+Z did nothing. The gate is now "do we have something to
// undo", and the presses above ran while idle, which is the case that was broken.
check('undo/redo work while idle', !afterUndo.includes('brightness(0)') && afterRedo.includes('brightness(0)'));

// #title must be untouched by that undo/redo round trip.
const titleIntact = await page.evaluate(() => getComputedStyle(document.querySelector('#title')).filter);
check('undo/redo does not disturb other rules', titleIntact.includes('brightness(0)'), titleIntact);

// ---------- Smart picker traversal ----------
check('activate blur mode', (await activate('blur')) === 'ok');
await page.waitForTimeout(600);

await page.hover('#card-1 > p.para');
await page.waitForTimeout(400);
const hudBefore = await page.evaluate(() => document.querySelector('#ceb-picker-hud')?.textContent ?? '');
check('picker HUD appears on hover', hudBefore.length > 0, hudBefore);

await page.keyboard.press('ArrowUp');
await page.waitForTimeout(300);
const hudAfter = await page.evaluate(() => document.querySelector('#ceb-picker-hud')?.textContent ?? '');
check('ArrowUp walks to the parent element', hudAfter !== hudBefore && /div/i.test(hudAfter), `${hudBefore} -> ${hudAfter}`);

await page.keyboard.press('Enter');
await page.waitForTimeout(500);
const parentBlurred = await page.evaluate(() =>
  getComputedStyle(document.querySelector('#card-1')).filter);
check('Enter applies to the traversed ancestor, not the leaf',
  parentBlurred.includes('blur'), parentBlurred);

// ---------- Escape deselects, then exits mode ----------
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const modeAfterDeselect = await page.evaluate(() => ({
  mode: [...document.body.classList].filter(c => c.startsWith('ceb-mode-')).join(','),
  selectionHidden: document.querySelector('#ceb-privacy-selection')?.hidden,
}));
check('Escape first deselects the privacy effect',
  modeAfterDeselect.mode.includes('ceb-mode-blur') && modeAfterDeselect.selectionHidden,
  JSON.stringify(modeAfterDeselect));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const modeAfterEsc = await page.evaluate(() =>
  [...document.body.classList].filter(c => c.startsWith('ceb-mode-')).join(','));
check('a second Escape returns to idle', modeAfterEsc.includes('ceb-mode-idle'), modeAfterEsc);

// ---------- Site-scoped rules ----------
await page.evaluate(() => {
  const seg = document.querySelector('#ceb-ui-seg .ceb-seg-btn[data-ui="advanced"]');
  seg?.click();
});
await page.waitForTimeout(300);
const advancedVisible = await page.evaluate(() =>
  document.querySelector('#ceb-toolbar')?.getAttribute('data-ui'));
check('Advanced toggle switches the toolbar', advancedVisible === 'advanced', String(advancedVisible));

const redactBtnShown = await page.evaluate(() => {
  const b = document.querySelector('.ceb-tb-btn[data-mode="redact"]');
  return b ? getComputedStyle(b).display !== 'none' : false;
});
check('Redact button is visible in Advanced', redactBtnShown);

check('activate Area targeting', (await activate('draw')) === 'ok');
await page.waitForTimeout(500);
await page.click('.ceb-tb-btn[data-mode="redact"]');
await page.waitForTimeout(300);
const redactArea = await page.evaluate(() => ({
  areaMode: document.body.classList.contains('ceb-mode-draw'),
  effect: document.querySelector('.ceb-privacy-grid .ceb-tb-btn.active')?.dataset.mode,
  target: document.querySelector('#ceb-target-seg .ceb-seg-btn.active')?.dataset.target,
  hint: document.querySelector('#ceb-mode-indicator')?.textContent,
}));
check('choosing Redact preserves Area targeting',
  redactArea.areaMode && redactArea.effect === 'redact' && redactArea.target === 'area'
    && /redact an area/i.test(redactArea.hint),
  JSON.stringify(redactArea));

await page.click('#ceb-ui-seg .ceb-seg-btn[data-ui="essentials"]');
await page.waitForTimeout(300);
const essentialsArea = await page.evaluate(() => ({
  areaMode: document.body.classList.contains('ceb-mode-draw'),
  effect: document.querySelector('.ceb-privacy-grid .ceb-tb-btn.active')?.dataset.mode,
  redactDisplay: getComputedStyle(document.querySelector('.ceb-tb-btn[data-mode="redact"]')).display,
  redoDisplay: getComputedStyle(document.querySelector('#ceb-btn-redo')).display,
  hint: document.querySelector('#ceb-mode-indicator')?.textContent,
}));
check('Essentials never leaves a hidden Redact area effect active',
  essentialsArea.areaMode && essentialsArea.effect === 'blur'
    && essentialsArea.redactDisplay === 'none' && /blur an area/i.test(essentialsArea.hint),
  JSON.stringify(essentialsArea));
check('Redo remains available in Essentials', essentialsArea.redoDisplay !== 'none', JSON.stringify(essentialsArea));
await page.click('#ceb-ui-seg .ceb-seg-btn[data-ui="advanced"]');
await page.waitForTimeout(300);

check('activate hide mode for site rule', (await activate('hide')) === 'ok');
await page.waitForTimeout(600);
const scopeVisible = await page.evaluate(() => {
  const scope = document.querySelector('#ceb-scope-tools');
  return scope ? !scope.hidden && getComputedStyle(scope).display !== 'none' : false;
});
check('rule scope appears only after choosing a scoped tool', scopeVisible);
await page.click('#ceb-scope-seg .ceb-seg-btn[data-scope="site"]');
await page.waitForTimeout(300);
await page.click('#ceb-ui-seg .ceb-seg-btn[data-ui="essentials"]');
await page.waitForTimeout(300);
const essentialsScope = {
  stored: await readKey('defaultScope'),
  active: await page.evaluate(() =>
    document.querySelector('#ceb-scope-seg .ceb-seg-btn.active')?.dataset.scope),
};
check('Essentials resets invisible site scope to This page',
  essentialsScope.stored === 'page' && essentialsScope.active === 'page',
  JSON.stringify(essentialsScope));
await page.click('#ceb-ui-seg .ceb-seg-btn[data-ui="advanced"]');
await page.waitForTimeout(300);
await page.click('#ceb-scope-seg .ceb-seg-btn[data-scope="site"]');
await page.waitForTimeout(300);
await page.click('#bottom');
await page.waitForTimeout(700);

const siteStored = await readKey(siteKey);
check('site-scoped rule written to site key',
  (siteStored?.rules || []).some(r => r.scope === 'site'),
  JSON.stringify(siteStored?.rules?.map(r => `${r.kind}:${r.scope}`)));

// Navigate to a *different path* on the same origin — the site rule must follow.
await page.goto(URL2, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const siteRuleApplied = await page.evaluate(() => {
  const el = document.querySelector('#bottom');
  return el ? getComputedStyle(el).visibility : 'missing';
});
check('site rule applies on a different path of the same origin',
  siteRuleApplied === 'hidden', siteRuleApplied);

const pageRuleLeaked = await page.evaluate(() =>
  getComputedStyle(document.querySelector('#title')).filter);
check('page-scoped rule does NOT leak to the other path',
  !pageRuleLeaked.includes('brightness(0)'), pageRuleLeaked);

// ---------- Export / import ----------
await page.goto(URL1, { waitUntil: 'load' });
await page.waitForTimeout(2500);

const exported = await sw.evaluate(async (id) => {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(id, { action: 'exportRules' }, { frameId: 0 }, (r) => resolve(r ?? null));
  });
}, tabId);
check('export returns a payload', !!exported && !!exported.data, JSON.stringify(exported).slice(0, 120));

const exportShape = exported?.data;
check('export payload is versioned v2', exportShape?.version === 2, String(exportShape?.version));
const exportedRules = [...(exportShape?.page?.rules || []), ...(exportShape?.site?.rules || [])];
check('export contains the rules', exportedRules.length > 0,
  `${exportedRules.length} rules: ${exportedRules.map(r => `${r.kind}:${r.scope}`).join(',')}`);

// Wipe, then import the same payload back and confirm the effects return.
await sw.evaluate(async ({ pk, sk }) => { await chrome.storage.local.remove([pk, sk]); }, { pk: pageKey, sk: siteKey });
await page.evaluate(() => location.reload());
await page.waitForTimeout(2000);

// Storage was wiped, so nothing auto-injects. Re-inject before importing.
await activate('idle');
await page.waitForTimeout(900);

const importResult = await sw.evaluate(async ({ id, payload }) => {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(id, { action: 'importRules', data: payload }, { frameId: 0 }, (r) => resolve(r ?? null));
  });
}, { id: tabId, payload: exportShape });
await page.waitForTimeout(900);

const afterImport = await page.evaluate(() => ({
  title: getComputedStyle(document.querySelector('#title')).filter,
  card: getComputedStyle(document.querySelector('#card-1')).filter,
}));
check('import re-applies redaction', afterImport.title.includes('brightness(0)'), afterImport.title);
check('import re-applies blur', afterImport.card.includes('blur'), afterImport.card);

// ---------- Rules panel ----------
await activate('blur');
await page.waitForTimeout(900);
const panelRows = await page.evaluate(() => {
  document.querySelector('#ceb-ui-seg .ceb-seg-btn[data-ui="advanced"]')?.click();
  document.querySelector('#ceb-rules-toggle')?.click();
  return document.querySelectorAll('#ceb-rules-list .ceb-rule').length;
});
check('rules panel lists the imported rules', panelRows > 0, `${panelRows} rows`);

const deletedOk = await page.evaluate(async () => {
  const before = document.querySelectorAll('#ceb-rules-list .ceb-rule').length;
  document.querySelector('#ceb-rules-list .ceb-rule .ceb-rule-del')?.click();
  await new Promise(r => setTimeout(r, 400));
  return { before, after: document.querySelectorAll('#ceb-rules-list .ceb-rule').length };
});
check('deleting a rule from the panel removes it',
  deletedOk.after === deletedOk.before - 1, JSON.stringify(deletedOk));

// ---------- Essentials hides only Advanced affordances ----------
const essentialsHidden = await page.evaluate(async () => {
  document.querySelector('#ceb-ui-seg .ceb-seg-btn[data-ui="essentials"]')?.click();
  await new Promise(r => setTimeout(r, 300));
  return {
    redact: getComputedStyle(document.querySelector('.ceb-tb-btn[data-mode="redact"]')).display,
    rules: getComputedStyle(document.querySelector('#ceb-rules-toggle').parentElement).display,
    redo: getComputedStyle(document.querySelector('#ceb-btn-redo')).display,
  };
});
check('Essentials hides Redact and rule management but keeps Redo',
  essentialsHidden.redact === 'none' && essentialsHidden.rules === 'none'
    && essentialsHidden.redo !== 'none',
  JSON.stringify(essentialsHidden));

// Existing installs store the old Simple/Pro names. Preserve their chosen density,
// while stripping Advanced-only state that would otherwise be invisible in Essentials.
await sw.evaluate(async () => chrome.storage.local.set({ uiMode: 'pro' }));
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1800);
await activate('blur');
await page.waitForTimeout(700);
const migratedPro = {
  view: await page.evaluate(() => document.querySelector('#ceb-toolbar')?.dataset.ui),
  stored: await readKey('uiMode'),
};
check('legacy Pro preference migrates to Advanced',
  migratedPro.view === 'advanced' && migratedPro.stored === 'advanced',
  JSON.stringify(migratedPro));

await sw.evaluate(async () => chrome.storage.local.set({
  uiMode: 'simple', defaultScope: 'site', drawKind: 'redact', annotateTool: 'step'
}));
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1800);
await activate('annotate');
await page.waitForTimeout(700);
const migratedSimple = {
  view: await page.evaluate(() => document.querySelector('#ceb-toolbar')?.dataset.ui),
  uiMode: await readKey('uiMode'),
  scope: await readKey('defaultScope'),
  areaEffect: await readKey('drawKind'),
  annotateTool: await readKey('annotateTool'),
};
check('legacy Simple preference migrates to safe Essentials defaults',
  migratedSimple.view === 'essentials' && migratedSimple.uiMode === 'essentials'
    && migratedSimple.scope === 'page' && migratedSimple.areaEffect === 'blur'
    && migratedSimple.annotateTool === 'arrow',
  JSON.stringify(migratedSimple));

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
check('no service worker errors', swErrors.length === 0, swErrors.join(' | '));

const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} passed`);
await teardown();
process.exit(passed === results.length ? 0 : 1);
