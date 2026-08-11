import { chromium } from 'playwright';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const EXT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASE = process.env.CEB_TEST_URL || 'http://localhost:8731';
const URL_UNDER_TEST = `${BASE}/index.html`;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceb-profile-'));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const ctx = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const swErrors = [];
sw.on('console', (m) => { if (m.type() === 'error') swErrors.push(m.text()); });
check('service worker registered', !!sw, sw?.url().split('/').pop());

const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL_UNDER_TEST, { waitUntil: 'load' });
check('page has an iframe', page.frames().length === 2, `${page.frames().length} frames`);

const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0]?.id ?? null, URL_UNDER_TEST);
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

// Drawn blur area must scroll with the document.
check('activate draw mode', (await activate('draw')) === 'ok');
await page.waitForTimeout(800);
await page.mouse.move(200, 300);
await page.mouse.down();
await page.mouse.move(420, 430, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(600);

const areaBefore = await page.evaluate(() => {
  const el = document.querySelector('.ceb-blur-area');
  return el ? { top: el.getBoundingClientRect().top, position: getComputedStyle(el).position } : null;
});
check('draw created a blur area', !!areaBefore, JSON.stringify(areaBefore));
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

// Drawn area survives a reload and is not duplicated by a second restore.
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2000);
let areaCount = await page.evaluate(() => document.querySelectorAll('.ceb-blur-area').length);
check('drawn area restored after reload', areaCount === 1, `count=${areaCount}`);

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

await ctx.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
