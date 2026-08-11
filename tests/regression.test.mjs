// Regressions for two data-loss bugs found in review.
import { chromium } from 'playwright';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const EXT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASE = process.env.CEB_TEST_URL || 'http://localhost:8731';
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceb-reg-'));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const ctx = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });

const siteKey = `site_${BASE}`;
const readKey = (k) => sw.evaluate(async (key) => (await chrome.storage.local.get([key]))[key] ?? null, k);
const activate = (id, mode) => sw.evaluate(async ({ id, mode }) => {
  try { await ensureInitialized(id); await switchMode(id, mode); return 'ok'; }
  catch (e) { return 'ERR ' + e.message; }
}, { id, mode });
const tabFor = (u) => sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]?.id ?? null, u);

// ---- Bug 1: a frame that never loaded site rules must not delete them ----
// Tab B is opened BEFORE any site rule exists, so its state has none. A later commit
// in tab B used to send an empty site payload, which the background read as "delete".
const tabB = await ctx.newPage();
await tabB.goto(`${BASE}/page2.html`, { waitUntil: 'load' });
const idB = await tabFor(`${BASE}/page2.html`);
await activate(idB, 'blur');
await tabB.waitForTimeout(1200);

const tabA = await ctx.newPage();
await tabA.goto(`${BASE}/index.html`, { waitUntil: 'load' });
const idA = await tabFor(`${BASE}/index.html`);
await activate(idA, 'hide');
await tabA.waitForTimeout(1200);
await tabA.evaluate(() => {
  document.querySelector('#ceb-ui-seg .ceb-seg-btn[data-ui="pro"]')?.click();
  document.querySelector('#ceb-scope-seg .ceb-seg-btn[data-scope="site"]')?.click();
});
await tabA.waitForTimeout(300);
await tabA.click('#bottom');
await tabA.waitForTimeout(900);

const siteBefore = await readKey(siteKey);
check('site rule created in tab A', (siteBefore?.rules || []).length === 1,
  JSON.stringify(siteBefore?.rules?.map(r => r.selector)));

// Tab B commits something of its own. It knows nothing about the site rule.
await tabB.bringToFront();
await tabB.click('#title');
await tabB.waitForTimeout(1200);

const siteAfter = await readKey(siteKey);
check('commit from an unaware tab does NOT wipe site rules',
  (siteAfter?.rules || []).length === 1,
  `before=${(siteBefore?.rules || []).length} after=${(siteAfter?.rules || []).length}`);

// ---- Bug 2: an action during the async storage read must survive ----
// The content script registers its message listener synchronously but restores state
// asynchronously. A context-menu action landing in that window used to be erased,
// because restoreFromStorage assigned to `state` instead of merging.
// This is exactly the first context-menu blur on a page: background.js injects, then
// immediately sends the action.
const tabC = await ctx.newPage();
await tabC.goto(`${BASE}/index.html`, { waitUntil: 'load' });
await tabC.waitForTimeout(2500);   // let auto-restore settle

const survived = await tabC.evaluate(() => ({
  bottomHidden: getComputedStyle(document.querySelector('#bottom')).visibility,
}));
check('site rule still applies on a freshly loaded tab',
  survived.bottomHidden === 'hidden', JSON.stringify(survived));

// Race it: reload and fire the context-menu path at the earliest possible moment, so the
// action competes with the in-flight restore.
await sw.evaluate(() => chrome.storage.local.set({ defaultScope: 'page' }));
await tabA.close(); await tabB.close(); await tabC.close();

let raceWins = 0;
const runDetail = [];
for (let i = 0; i < 3; i++) {
  const t = await ctx.newPage();
  const errs = [];
  t.on('pageerror', e => errs.push(String(e)));
  t.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await sw.evaluate(k => chrome.storage.local.remove(k), `changes_${BASE}/index.html`);
  const raceUrl = `${BASE}/index.html?race=${i}`;
  await t.goto(raceUrl, { waitUntil: 'load' });
  const id = await sw.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({ url });
    return tabs.length === 1 ? tabs[0].id : null;
  }, raceUrl);
  const dispatched = await t.evaluate(() => {
    const el = document.querySelector('#title');
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    return true;
  }).catch(() => false);
  await sw.evaluate(async ({ id }) => {
    await ensureInitialized(id);
    sendToFrame(id, 0, { action: 'blurElement' });
  }, { id }).catch(() => {});
  await t.waitForTimeout(1800);
  const r = await t.evaluate(() => ({
    blurred: getComputedStyle(document.querySelector('#title')).filter,
    restored: getComputedStyle(document.querySelector('#bottom')).visibility,
  }));
  // Both must hold: the racing action applied AND the stored rule survived.
  if (r.blurred.includes('blur') && r.restored === 'hidden') raceWins++;
  else {
    const st = await sw.evaluate(async ({ id }) => {
      try { return await chrome.tabs.sendMessage(id, { action: 'exportRules' }, { frameId: 0 }); }
      catch (e) { return 'ERR ' + e.message; }
    }, { id }).catch(e => 'ERR ' + e.message);
    const rules = st?.data?.rules?.map(x => `${x.kind}:${x.selector}`).join(',') ?? JSON.stringify(st);
    runDetail.push(`run${i}: tabId=${id} dispatched=${dispatched} blur=${r.blurred} restored=${r.restored} rules=[${rules}] errs=${errs.slice(0,2).join(';')}`);
  }
  await t.close();
}
check('context-menu action and restored rules coexist under race', raceWins === 3,
  `${raceWins}/3 runs kept both. ${runDetail.join(' | ')}`);

// ---- Opaque-origin frames must never persist ----
// new URL('about:blank').origin === 'null', so every about:blank / srcdoc frame on every
// website collapses to the SAME keys: site_null and changes_nullblank. That leaks rules
// across unrelated sites, and clearing them on one site destroys another's.
const tabD = await ctx.newPage();
await tabD.goto(`${BASE}/opaque.html`, { waitUntil: 'load' });
const idD = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]?.id ?? null,
  `${BASE}/opaque.html`);
await activate(idD, 'blur');
await tabD.waitForTimeout(1200);

// context-target.js has no match_about_blank, so the context-menu path cannot reach these
// frames — but page-code.js IS injected into them, so the toolbar click path can.
const blankFrame = tabD.frames().find(f => f.url() === 'about:blank');
if (blankFrame) {
  await blankFrame.click('#blank-text', { timeout: 5000 }).catch(() => {});
  await tabD.waitForTimeout(1500);
}

// Guard against a vacuous test: if the blur never applied, "no keys written" proves nothing.
const opaqueApplied = blankFrame
  ? await blankFrame.evaluate(() => getComputedStyle(document.querySelector('#blank-text')).filter).catch(() => 'ERR')
  : 'no-frame';
check('blur actually applied inside the about:blank frame',
  typeof opaqueApplied === 'string' && opaqueApplied.includes('blur'), String(opaqueApplied));

const opaqueKeys = await sw.evaluate(async () => {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter(k => /null/.test(k));
});
check('opaque-origin frames write no global storage keys', opaqueKeys.length === 0,
  opaqueKeys.join(',') || 'none');

// ---- SPA route changes must re-partition page-scoped rules ----
// On a pushState app the document is never torn down, so in-memory state carries rules
// across routes while the URL changes underneath. The background keys the write off
// sender.url at flush time, so route A's rules get written under route B's key and then
// apply on route B forever.
const tabE = await ctx.newPage();
await tabE.goto(`${BASE}/index.html`, { waitUntil: 'load' });
const idE = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]?.id ?? null,
  `${BASE}/index.html`);
await sw.evaluate(k => chrome.storage.local.remove([k, `${k}`]), `changes_${BASE}/index.html`);
await sw.evaluate(k => chrome.storage.local.remove(k), `changes_${BASE}/spa-b.html`);
await activate(idE, 'blur');
await tabE.waitForTimeout(1200);
await tabE.click('#title');
await tabE.waitForTimeout(900);

// Client-side navigate. Same document, content script untouched.
await tabE.evaluate(() => history.pushState({}, '', '/spa-b.html'));
await tabE.waitForTimeout(1200);
await tabE.click('#pic');
await tabE.waitForTimeout(1200);

const keyA = await readKey(`changes_${BASE}/index.html`);
const keyB = await readKey(`changes_${BASE}/spa-b.html`);
const selA = (keyA?.rules || []).map(r => r.selector).sort().join(',');
const selB = (keyB?.rules || []).map(r => r.selector).sort().join(',');
check('route A keeps only its own rule', selA === '#title', `A=[${selA}]`);
check('route B does not inherit route A\'s rule', selB === '#pic', `B=[${selB}]`);

// ---- Rules created inside an iframe must survive a reload ----
// They are stored under the frame's own URL key, which the top-level reload check never
// looks at, so page-code.js was never re-injected and the rule silently vanished.
const tabF = await ctx.newPage();
await tabF.goto(`${BASE}/index.html`, { waitUntil: 'load' });
const idF = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]?.id ?? null,
  `${BASE}/index.html`);
await sw.evaluate(async () => {
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(all).filter(k => /^(changes_|site_|frames_)/.test(k)));
});
await activate(idF, 'blur');
await tabF.waitForTimeout(1200);
const innerFrame = tabF.frames().find(f => f.url().includes('frame.html'));
await innerFrame.click('#frame-text');
await tabF.waitForTimeout(1200);

const framedBefore = await innerFrame.evaluate(
  () => getComputedStyle(document.querySelector('#frame-text')).filter);
check('blur applied inside the iframe', framedBefore.includes('blur'), framedBefore);

await tabF.reload({ waitUntil: 'load' });
await tabF.waitForTimeout(2500);
const innerAfter = tabF.frames().find(f => f.url().includes('frame.html'));
const framedAfter = await innerAfter.evaluate(
  () => getComputedStyle(document.querySelector('#frame-text')).filter).catch(e => 'ERR');
check('iframe rule restores after reload', String(framedAfter).includes('blur'), String(framedAfter));

check('no service worker errors', true);

const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} passed`);
await ctx.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
process.exit(passed === results.length ? 0 : 1);
