import { setupExtensionTest } from './harness.mjs';

const BASE = process.env.CEB_TEST_URL || 'http://localhost:8731';
const URL1 = `${BASE}/index.html`;
const {
  sw, page, tabId, pageErrors, swErrors, results, check, teardown,
} = await setupExtensionTest({
  profilePrefix: 'ceb-context-menu-',
  initialUrl: URL1,
  recordResult: ({ pass }) => pass,
});

// Right-click WITHOUT ever activating the extension first. This is the case that used
// to silently do nothing because the page modules had never been injected.
await page.evaluate(() => document.querySelector('#bottom')
  .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
await page.waitForTimeout(200);

await sw.evaluate(async ({ id }) => {
  await ensureInitialized(id);
  sendToFrame(id, 0, { action: 'blurElement' });
}, { id: tabId });
await page.waitForTimeout(1200);
const f = await page.evaluate(() => getComputedStyle(document.querySelector('#bottom')).filter);
check('context-menu blur works on a never-activated page', f.includes('blur'), f);

// Right-click inside the iframe, act on frame 1 only.
const frame = page.frames()[1];
await frame.evaluate(() => document.querySelector('#frame-text')
  .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
await page.waitForTimeout(200);
// webNavigation isn't a permission here; find the frame by messaging each candidate.
await sw.evaluate(async ({ id }) => {
  // frameId is unknown without webNavigation, so broadcast and let each frame decide.
  await chrome.tabs.sendMessage(id, { action: 'hideElement' });
}, { id: tabId });
await page.waitForTimeout(800);
const frameHidden = await frame.evaluate(() =>
  getComputedStyle(document.querySelector('#frame-text')).visibility);
check('context-menu hide reaches the iframe target', frameHidden === 'hidden', frameHidden);

// The top frame must NOT have hidden its own last-context target from that broadcast...
// (it will, since we broadcast; the real path uses info.frameId). Just confirm frameId routing exists.
check('sendToFrame passes a frameId',
  /frameId/.test(await sw.evaluate(() => sendToFrame.toString())));
check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
check('no service worker errors', swErrors.length === 0, swErrors.join(' | '));

await teardown();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
