// Annotation tests: the five mark kinds, the session-only persistence default and
// its "keep" opt-in, colour validation on import, scope containment, and the
// screenshot chrome-hiding fix.
import { setupExtensionTest } from './harness.mjs';

const BASE = process.env.CEB_TEST_URL || 'http://localhost:8731';
const URL1 = `${BASE}/index.html`;
const {
  sw, page, tabId, pageErrors, swErrors, results, check, teardown,
} = await setupExtensionTest({
  profilePrefix: 'ceb-note-',
  initialUrl: URL1,
});

// The extension UI is intentionally always light, even when the OS/browser preference
// is dark. Set the preference before the toolbar is created to catch regressions.
await page.emulateMedia({ colorScheme: 'dark' });

const activate = (mode) => sw.evaluate(async ({ id, mode }) => {
  try { await ensureInitialized(id); await switchMode(id, mode); return 'ok'; }
  catch (e) { return 'ERR ' + e.message; }
}, { id: tabId, mode });
const readKey = (key) => sw.evaluate(async (k) => (await chrome.storage.local.get([k]))[k] ?? null, key);
const pageKey = `changes_${BASE}/index.html`;
const siteKey = `site_${BASE}`;

// Drag on the annotate overlay. Uses real mouse events so the pointer handlers,
// not just the state functions, are what the test exercises.
async function drawNote(tool, from, to) {
  await page.evaluate((t) => {
    document.querySelector(`.ceb-note-tool[data-note-tool="${t}"]`)?.click();
  }, tool);
  await page.waitForTimeout(250);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  // Intermediate moves matter: pen records a path, and a single jump would
  // produce a two-point stroke that hides sampling bugs.
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(
      from[0] + ((to[0] - from[0]) * i) / 6,
      from[1] + ((to[1] - from[1]) * i) / 6
    );
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(350);
}

const countNotes = () => page.evaluate(() => document.querySelectorAll('.ceb-annotation').length);
const kindsOnPage = () => page.evaluate(() =>
  [...document.querySelectorAll('.ceb-annotation')].map(e => e.dataset.cebNoteKind));

check('activate annotate mode', (await activate('annotate')) === 'ok');
await page.waitForTimeout(800);

const overlayUp = await page.evaluate(() => !!document.getElementById('ceb-annotate-overlay'));
check('annotate mode installs its overlay', overlayUp);

const uiLayers = await page.evaluate(() => {
  const toolbar = document.getElementById('ceb-toolbar');
  const overlay = document.getElementById('ceb-annotate-overlay');
  const cs = toolbar ? getComputedStyle(toolbar) : null;
  return {
    theme: toolbar?.dataset.theme,
    background: cs?.backgroundColor,
    colorScheme: cs?.colorScheme,
    toolbarZ: Number(cs?.zIndex || 0),
    overlayZ: Number(overlay ? getComputedStyle(overlay).zIndex : 0),
    floatingBadge: !!document.getElementById('ceb-mode-badge'),
  };
});
check('toolbar stays light under a dark system preference',
  uiLayers.theme === 'light' && uiLayers.background === 'rgb(255, 255, 255)'
    && uiLayers.colorScheme.includes('light'), JSON.stringify(uiLayers));
check('toolbar is above the annotate input layer',
  uiLayers.toolbarZ > uiLayers.overlayZ, JSON.stringify(uiLayers));
check('the redundant floating mode badge does not cover the toolbar',
  uiLayers.floatingBadge === false, JSON.stringify(uiLayers));

const toolsVisible = await page.evaluate(() => {
  const el = document.querySelector('#ceb-annotate-tools');
  return el ? !el.hidden : 'missing';
});
check('annotation tool row is revealed in annotate mode', toolsVisible === true, String(toolsVisible));

// A DOM .click() bypasses hit testing. Use a real pointer click to prove the full-screen
// annotation layer no longer intercepts the toolbar.
let realToolClickError = '';
try {
  await page.click('.ceb-note-tool[data-note-tool="ellipse"]', { timeout: 3000 });
} catch (e) {
  realToolClickError = String(e);
}
const realToolActive = await page.evaluate(() =>
  document.querySelector('.ceb-note-tool[data-note-tool="ellipse"]')?.classList.contains('active'));
check('annotation tools remain pointer-accessible while annotating',
  !realToolClickError && realToolActive === true, realToolClickError || String(realToolActive));

// The first-run/shortcut dialog used to be caught by the active-mode document handler,
// so its close button could not run. Dismiss onboarding, then exercise the same path.
if (await page.locator('#ceb-panel').count()) {
  await page.click('#ceb-panel .ceb-panel-close');
}
await page.click('#ceb-btn-help');
const dialogTheme = await page.evaluate(() => {
  const panel = document.getElementById('ceb-panel');
  return panel ? {
    role: panel.getAttribute('role'),
    background: getComputedStyle(panel).backgroundColor,
  } : null;
});
check('shortcut dialog is a light accessible dialog',
  dialogTheme?.role === 'dialog' && dialogTheme.background === 'rgb(255, 255, 255)',
  JSON.stringify(dialogTheme));
await page.click('#ceb-panel .ceb-panel-close');
check('dialog controls work while annotate mode is active',
  (await page.locator('#ceb-panel').count()) === 0);

await page.click('.ceb-note-tool[data-note-tool="arrow"]');
await page.evaluate(() => {
  const input = document.querySelector('#ceb-note-width-input');
  input.value = '8';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(200);
const widthControl = await page.evaluate(() => ({
  value: document.querySelector('#ceb-note-width-input')?.value,
  output: document.querySelector('#ceb-note-width-value')?.textContent,
  visible: !document.querySelector('#ceb-note-width')?.hidden,
}));
check('stroke width control updates for line tools',
  widthControl.visible && widthControl.value === '8' && widthControl.output === '8 px',
  JSON.stringify(widthControl));
check('stroke width preference is remembered', (await readKey('annotateSize')) === 8);

// ---------- The four drag-drawn kinds ----------
// Box and Pen are everyday annotation tools, so Essentials must expose both.

for (const [tool, from, to] of [
  ['arrow', [200, 300], [320, 380]],
  ['ellipse', [200, 420], [340, 500]],
  ['rect', [420, 300], [540, 380]],
  ['pen', [420, 420], [540, 500]],
]) {
  const before = await countNotes();
  await drawNote(tool, from, to);
  const after = await countNotes();
  check(`drawing ${tool} adds one annotation`, after === before + 1, `${before} -> ${after}`);
}

const kinds = await kindsOnPage();
check('all four drawn kinds rendered',
  ['arrow', 'ellipse', 'rect', 'pen'].every(k => kinds.includes(k)), kinds.join(','));

// The SVG geometry has to be real, not a zero-size stub.
const svgOk = await page.evaluate(() => {
  const out = {};
  for (const el of document.querySelectorAll('.ceb-annotation')) {
    const kind = el.dataset.cebNoteKind;
    if (kind === 'arrow') {
      out.arrow = !!el.querySelector('line') && !!el.querySelector('polygon');
      out.arrowWidth = Number(el.querySelector('line')?.getAttribute('stroke-width'));
      out.annotationZ = Number(getComputedStyle(el).zIndex);
      out.overlayZ = Number(getComputedStyle(document.getElementById('ceb-annotate-overlay')).zIndex);
      out.toolbarZ = Number(getComputedStyle(document.getElementById('ceb-toolbar')).zIndex);
    }
    if (kind === 'ellipse') {
      const e = el.querySelector('ellipse');
      out.ellipse = !!e && parseFloat(e.getAttribute('rx')) > 10;
    }
    if (kind === 'rect') {
      const r = el.querySelector('rect');
      out.rect = !!r && parseFloat(r.getAttribute('width')) > 10;
    }
    if (kind === 'pen') {
      const p = el.querySelector('path');
      out.pen = !!p && (p.getAttribute('d') || '').includes('Q');
    }
  }
  return out;
});
check('arrow draws a shaft and a head', svgOk.arrow === true, JSON.stringify(svgOk));
check('new arrows use the selected stroke width', svgOk.arrowWidth === 8, JSON.stringify(svgOk));
check('annotation input stays above marks but below the toolbar',
  svgOk.annotationZ < svgOk.overlayZ && svgOk.overlayZ < svgOk.toolbarZ,
  JSON.stringify(svgOk));
check('ellipse has a real radius', svgOk.ellipse === true);
check('rect has a real width', svgOk.rect === true);
check('pen path is smoothed with quadratic curves', svgOk.pen === true);

// ---------- Text notes ----------
await page.evaluate(() => document.querySelector('.ceb-note-tool[data-note-tool="text"]')?.click());
await page.waitForTimeout(250);
await page.mouse.click(240, 560);
await page.waitForTimeout(350);
const editorOpen = await page.evaluate(() => !!document.getElementById('ceb-text-editor'));
check('clicking with the text tool opens an editor', editorOpen);

await page.keyboard.type('Explain this');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const textNote = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.ceb-annotation')].find(e => e.dataset.cebNoteKind === 'text');
  return el ? el.textContent : null;
});
check('committed text note renders its text', textNote === 'Explain this', String(textNote));

// An empty note is a slip, not a mark — it should not survive.
await page.mouse.click(240, 620);
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const textCount = await page.evaluate(() =>
  [...document.querySelectorAll('.ceb-annotation')].filter(e => e.dataset.cebNoteKind === 'text').length);
check('an empty text note is discarded', textCount === 1, `${textCount} text notes`);

// ---------- Undo ----------
const beforeUndo = await countNotes();
await page.evaluate(() => document.querySelector('#ceb-btn-undo')?.click());
await page.waitForTimeout(500);
const afterUndo = await countNotes();
check('undo removes the last annotation', afterUndo === beforeUndo - 1, `${beforeUndo} -> ${afterUndo}`);

// ---------- Session-only by default ----------
const storedDefault = await readKey(pageKey);
check('session-only annotations are not written to storage',
  !storedDefault?.annotations?.length, JSON.stringify(storedDefault?.annotations ?? []));

const siteStored = await readKey(siteKey);
check('annotations never leak into site scope',
  !siteStored?.annotations?.length, JSON.stringify(siteStored?.annotations ?? []));

await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1200);
check('session-only annotations are gone after reload', (await countNotes()) === 0);

// ---------- Keep after reload ----------
check('re-activate annotate mode', (await activate('annotate')) === 'ok');
await page.waitForTimeout(800);
await page.evaluate(async () => {
  document.querySelector('#ceb-ui-seg .ceb-seg-btn[data-ui="advanced"]')?.click();
  await new Promise(r => setTimeout(r, 200));
  document.querySelector('#ceb-btn-note-keep')?.click();
  await new Promise(r => setTimeout(r, 200));
});
await drawNote('ellipse', [200, 300], [330, 380]);
await page.waitForTimeout(600);

const keptStored = await readKey(pageKey);
check('kept annotations are written to storage',
  keptStored?.annotations?.length === 1, JSON.stringify(keptStored?.annotations?.map(a => a.kind) ?? []));

await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1400);
check('kept annotations survive a reload', (await countNotes()) === 1, `${await countNotes()} on page`);

// ---------- Import validation ----------
// color and size reach SVG presentation attributes, so a crafted import must not
// pass through untouched.
const sanitized = await sw.evaluate(async ({ key }) => {
  const bad = {
    id: 'evil', kind: 'ellipse', points: [[10, 10], [80, 80]],
    color: 'url(javascript:alert(1))', size: 99999, text: '', boxW: 200, persist: true, scope: 'page'
  };
  const cur = (await chrome.storage.local.get([key]))[key] || {};
  await chrome.storage.local.set({
    [key]: { v: 2, rules: cur.rules || [], areas: cur.areas || [],
             replacements: cur.replacements || [], annotations: [bad] }
  });
  return 'set';
}, { key: pageKey });
check('crafted annotation staged in storage', sanitized === 'set');

await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1400);
const rendered = await page.evaluate(() => {
  const el = document.querySelector('.ceb-annotation ellipse');
  return el ? { stroke: el.getAttribute('stroke'), width: el.getAttribute('stroke-width') } : null;
});
check('a crafted colour is replaced with a safe one',
  rendered !== null && /^#[0-9a-fA-F]{6}$/.test(rendered.stroke), JSON.stringify(rendered));
check('an out-of-range size is clamped',
  rendered !== null && Number(rendered.width) <= 40, JSON.stringify(rendered));

// ---------- Screenshot hides the extension's own chrome ----------
check('activate annotate for capture', (await activate('annotate')) === 'ok');
await page.waitForTimeout(700);
const capture = await page.evaluate(async () => {
  const tb = document.getElementById('ceb-toolbar');
  const overlay = document.getElementById('ceb-annotate-overlay');
  // The capture round-trips through the service worker, so poll for the hidden
  // window rather than trying to observe a single synchronous moment.
  let sawToolbarHidden = false;
  let sawOverlayHidden = false;
  const poll = setInterval(() => {
    if (getComputedStyle(tb).visibility === 'hidden') sawToolbarHidden = true;
    if (overlay && getComputedStyle(overlay).visibility === 'hidden') sawOverlayHidden = true;
  }, 20);
  document.querySelector('#ceb-btn-screenshot')?.click();
  await new Promise(r => setTimeout(r, 1500));
  clearInterval(poll);
  return { sawToolbarHidden, sawOverlayHidden, visibleAfter: getComputedStyle(tb).visibility };
});
check('toolbar is hidden while capturing', capture.sawToolbarHidden === true, JSON.stringify(capture));
check('annotate overlay is hidden while capturing', capture.sawOverlayHidden === true, JSON.stringify(capture));
check('toolbar comes back after capturing',
  capture.visibleAfter !== 'hidden', capture.visibleAfter);

// ---------- Essentials keeps common tools and hides only the specialized Step ----------
const essentialTools = await page.evaluate(async () => {
  document.querySelector('#ceb-ui-seg .ceb-seg-btn[data-ui="essentials"]')?.click();
  await new Promise(r => setTimeout(r, 300));
  const vis = t => {
    const b = document.querySelector(`.ceb-note-tool[data-note-tool="${t}"]`);
    return b ? getComputedStyle(b).display !== 'none' : 'missing';
  };
  return {
    arrow: vis('arrow'), ellipse: vis('ellipse'), marker: vis('marker'), text: vis('text'),
    rect: vis('rect'), pen: vis('pen'), step: vis('step')
  };
});
check('Essentials keeps all common annotation tools, including Box and Pen',
  essentialTools.arrow && essentialTools.ellipse && essentialTools.marker
    && essentialTools.text && essentialTools.rect && essentialTools.pen,
  JSON.stringify(essentialTools));
check('Essentials hides only the specialized numbered Step tool',
  essentialTools.step === false, JSON.stringify(essentialTools));

// ---------- Regression: a long pen stroke must not eat its own beginning ----------
// The buffer used to shift() the oldest samples away once a stroke passed the cap, so
// the start of the user's line vanished while they were still drawing it.
await activate('annotate');
await page.waitForTimeout(700);
await page.evaluate(async () => {
  document.querySelector('#ceb-ui-seg .ceb-seg-btn[data-ui="essentials"]')?.click();
  await new Promise(r => setTimeout(r, 250));
  document.querySelector('.ceb-note-tool[data-note-tool="pen"]')?.click();
});
await page.waitForTimeout(250);

// Zig-zag across a band well clear of the toolbar, feeding far more samples than the cap.
const BAND_TOP = 120, BAND_BOTTOM = 260, X0 = 60, X1 = 700;
await page.mouse.move(X0, BAND_TOP);
await page.mouse.down();
for (let i = 1; i <= 900; i++) {
  const t = i / 900;
  await page.mouse.move(X0 + (X1 - X0) * t, i % 2 ? BAND_BOTTOM : BAND_TOP);
}
await page.mouse.up();
await page.waitForTimeout(500);

const stroke = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.ceb-annotation')].find(e => e.dataset.cebNoteKind === 'pen');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
});
// The stroke must still span the band it was drawn across, not just its tail end.
check('a long pen stroke keeps its beginning',
  stroke !== null && stroke.left < X0 + 40, JSON.stringify(stroke));
check('a long pen stroke keeps its full span',
  stroke !== null && stroke.width > (X1 - X0) * 0.8, JSON.stringify(stroke));

// ---------- Regression: annotations must be invisible to the element picker ----------
// The picker used to lock onto the extension's own annotation wrapper, which both
// shadowed the page content underneath and persisted a bogus positional rule — a bare
// nth-of-type index counting extension-owned divs, which resolves to something
// unrelated on the next load. Annotations are now pointer-events:none, so the click
// lands on the page element beneath, which is what the user was aiming at.
const pickerBox = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.ceb-annotation')].find(e => e.dataset.cebNoteKind === 'pen');
  const r = el.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
});
const rulesBefore = (await readKey(pageKey))?.rules?.length ?? 0;
await activate('blur');
await page.waitForTimeout(700);
await page.mouse.move(pickerBox[0], pickerBox[1]);
await page.waitForTimeout(400);
const hovered = await page.evaluate(() => {
  const o = document.getElementById('ceb-picker-outline');
  return o ? getComputedStyle(o).display : 'missing';
});
await page.mouse.click(pickerBox[0], pickerBox[1]);
await page.waitForTimeout(700);
const rulesAfter = (await readKey(pageKey))?.rules ?? [];
const added = rulesAfter.slice(rulesBefore).map(r => r.selector);
check('clicking through an annotation never targets extension chrome',
  added.every(s => !/ceb-/.test(s) && !/^body > div:nth-of-type/.test(s)),
  JSON.stringify(added));
check('clicking through an annotation reaches the page element beneath',
  added.length === 1 && added[0] === '#card-1', JSON.stringify(added));

// ---------- Regression: stale page UI survives an extension reload safely ----------
// Every Chrome API throws synchronously once the extension context is invalidated.
// Runtime messaging used to leave screenshot chrome hidden, while direct storage calls
// surfaced as uncaught errors on chrome://extensions.
await activate('annotate');
await page.waitForTimeout(700);
const errorsBeforeReload = pageErrors.length;
await sw.evaluate(() => chrome.runtime.reload());
await page.waitForTimeout(1200);
const deadContext = await page.evaluate(async () => {
  document.querySelector('#ceb-btn-screenshot')?.click();
  await new Promise(r => setTimeout(r, 1200));
  const persist = document.getElementById('ceb-persist-toggle');
  persist.checked = !persist.checked;
  persist.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 100));
  const tb = document.getElementById('ceb-toolbar');
  return {
    visibility: tb ? getComputedStyle(tb).visibility : 'missing',
    notice: document.getElementById('ceb-toast')?.textContent || ''
  };
});
check('toolbar is visible again after a capture', deadContext.visibility === 'visible', deadContext.visibility);
const invalidationErrors = pageErrors.slice(errorsBeforeReload)
  .filter(error => /extension context invalidated/i.test(error));
check('stale storage controls fail safely after an extension reload',
  invalidationErrors.length === 0 && /refresh this page/i.test(deadContext.notice),
  JSON.stringify({ errors: invalidationErrors, notice: deadContext.notice }));

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
check('no service worker errors', swErrors.length === 0, swErrors.join(' | '));

const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} passed`);
await teardown();
process.exit(passed === results.length ? 0 : 1);
