// Contextual privacy editing: explicit blur strength, non-destructive Area selection,
// move/resize/delete parity, persistence wording, and recoverable toolbar positioning.
import { setupExtensionTest } from './harness.mjs';

const BASE = process.env.CEB_TEST_URL || 'http://localhost:8731';
const URL1 = `${BASE}/index.html`;
const {
  sw, page, tabId, pageErrors, swErrors, results, check, teardown,
} = await setupExtensionTest({
  profilePrefix: 'ceb-privacy-edit-',
  initialUrl: URL1,
  viewport: { width: 1280, height: 800 },
});
const activate = mode => sw.evaluate(async ({ id, mode }) => {
  await ensureInitialized(id);
  await switchMode(id, mode);
}, { id: tabId, mode });
const readKey = key => sw.evaluate(async value => (await chrome.storage.local.get([value]))[value] ?? null, key);
const pageKey = `changes_${BASE}/index.html`;
const wait = ms => page.waitForTimeout(ms);

await activate('blur');
await wait(700);
await page.evaluate(() => document.getElementById('ceb-panel')?.remove());

const initialPrivacyUi = await page.evaluate(() => ({
  strengthVisible: !document.getElementById('ceb-blur-strength')?.hidden,
  activeStrength: document.querySelector('#ceb-blur-strength-seg .active')?.textContent,
  rememberLabel: document.querySelector('.ceb-tb-toggle-label')?.textContent,
  rememberTitle: document.querySelector('.ceb-tb-toggle')?.title,
}));
check('Blur exposes a direct strength choice before applying',
  initialPrivacyUi.strengthVisible && initialPrivacyUi.activeStrength === 'Soft',
  JSON.stringify(initialPrivacyUi));
check('persistence copy says changes are remembered locally',
  initialPrivacyUi.rememberLabel === 'Remember changes'
    && /after reload/i.test(initialPrivacyUi.rememberTitle)
    && /browser/i.test(initialPrivacyUi.rememberTitle),
  JSON.stringify(initialPrivacyUi));

await page.click('#title');
await wait(450);
let selectedRule = await page.evaluate(() => ({
  visible: !document.getElementById('ceb-privacy-selection')?.hidden,
  status: document.getElementById('ceb-privacy-selection-status')?.textContent,
  filter: getComputedStyle(document.getElementById('title')).filter,
}));
check('new element blur is selected for contextual editing',
  selectedRule.visible && selectedRule.status === 'Soft blur element selected'
    && selectedRule.filter.includes('blur(4px)'),
  JSON.stringify(selectedRule));

await page.click('#title');
await wait(300);
let stored = await readKey(pageKey);
check('clicking an existing blur selects instead of cycling or deleting',
  stored.rules.filter(rule => rule.selector === '#title').length === 1
    && stored.rules.find(rule => rule.selector === '#title')?.level === 1,
  JSON.stringify(stored.rules));

await page.click('#ceb-blur-strength-seg [data-blur-level="2"]');
await wait(450);
stored = await readKey(pageKey);
selectedRule = await page.evaluate(() => ({
  status: document.getElementById('ceb-privacy-selection-status')?.textContent,
  filter: getComputedStyle(document.getElementById('title')).filter,
}));
check('Strong changes the selected blur directly',
  stored.rules.find(rule => rule.selector === '#title')?.level === 2
    && selectedRule.status === 'Strong blur element selected'
    && selectedRule.filter.includes('blur(20px)'),
  JSON.stringify(selectedRule));

await page.click('#ceb-ui-seg [data-ui="advanced"]');
await page.click('#ceb-scope-seg [data-scope="site"]');
await wait(400);
let siteStored = await readKey(`site_${BASE}`);
stored = await readKey(pageKey);
check('scope controls edit the selected element effect directly',
  (siteStored?.rules || []).some(rule => rule.selector === '#title')
    && !(stored?.rules || []).some(rule => rule.selector === '#title'),
  JSON.stringify({ page: stored?.rules || [], site: siteStored?.rules || [] }));
await page.click('#ceb-scope-seg [data-scope="page"]');
await wait(350);
await page.click('.ceb-tb-btn[data-mode="redact"]');
await wait(450);
let changedEffect = await page.evaluate(() => ({
  selected: document.getElementById('ceb-privacy-selection-status')?.textContent,
  filter: getComputedStyle(document.getElementById('title')).filter,
}));
check('privacy effect buttons edit the selected element',
  changedEffect.selected === 'Redacted element selected'
    && changedEffect.filter.includes('brightness(0)'),
  JSON.stringify(changedEffect));
await page.click('.ceb-tb-btn[data-mode="blur"]');
await wait(400);
await page.click('#ceb-btn-privacy-remove');
await wait(400);
stored = await readKey(pageKey);
const removedRule = await page.evaluate(() => getComputedStyle(document.getElementById('title')).filter);
check('selected element effects use an explicit Remove action',
  !(stored?.rules || []).some(rule => rule.selector === '#title')
    && !removedRule.includes('blur') && !removedRule.includes('brightness'),
  `${removedRule} ${JSON.stringify(stored?.rules || [])}`);

await page.click('#ceb-blur-strength-seg [data-blur-level="1"]');
await activate('draw');
await wait(500);
await page.mouse.move(180, 280);
await page.mouse.down();
await page.mouse.move(400, 410, { steps: 8 });
await page.mouse.up();
await wait(400);
let area = await page.evaluate(() => {
  const element = document.querySelector('.ceb-blur-area');
  const rect = element?.getBoundingClientRect();
  return element ? {
    id: element.dataset.cebAreaId,
    left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    pointerEvents: getComputedStyle(element).pointerEvents,
    backdrop: getComputedStyle(element).backdropFilter,
    handles: document.querySelectorAll('#ceb-privacy-handles .ceb-area-handle').length,
    status: document.getElementById('ceb-privacy-selection-status')?.textContent,
  } : null;
});
check('new Areas are selected with four resize handles',
  area && area.handles === 4 && area.status === 'Soft blur area selected', JSON.stringify(area));
check('Area visuals are inert and use the chosen blur strength',
  area?.pointerEvents === 'none' && area.backdrop.includes('blur(4px)'), JSON.stringify(area));

const center = [Math.round(area.left + area.width / 2), Math.round(area.top + area.height / 2)];
const areaCountBeforeSelect = await page.locator('.ceb-blur-area').count();
await page.mouse.click(center[0], center[1]);
await wait(250);
check('clicking an Area selects it without deleting it',
  (await page.locator('.ceb-blur-area').count()) === areaCountBeforeSelect);

await page.mouse.move(center[0], center[1]);
await page.mouse.down();
await page.mouse.move(center[0] + 60, center[1] + 30, { steps: 8 });
await page.mouse.up();
await wait(350);
let moved = await page.evaluate(id => {
  const element = [...document.querySelectorAll('.ceb-blur-area')]
    .find(item => item.dataset.cebAreaId === id);
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}, area.id);
check('dragging a selected Area moves it',
  Math.abs(moved.left - area.left - 60) < 4 && Math.abs(moved.top - area.top - 30) < 4,
  `${area.left},${area.top} -> ${moved.left},${moved.top}`);
await page.click('#ceb-btn-undo');
await wait(300);
let moveHistory = await page.evaluate(() => {
  const rect = document.querySelector('.ceb-blur-area').getBoundingClientRect();
  return { left: rect.left, top: rect.top };
});
check('undo restores an Area move',
  Math.abs(moveHistory.left - area.left) < 3 && Math.abs(moveHistory.top - area.top) < 3,
  JSON.stringify(moveHistory));
await page.click('#ceb-btn-redo');
await wait(300);
moveHistory = await page.evaluate(() => {
  const rect = document.querySelector('.ceb-blur-area').getBoundingClientRect();
  return { left: rect.left, top: rect.top };
});
check('redo reapplies an Area move',
  Math.abs(moveHistory.left - moved.left) < 3 && Math.abs(moveHistory.top - moved.top) < 3,
  JSON.stringify(moveHistory));

const seHandle = await page.evaluate(() => {
  const handle = document.querySelector('#ceb-privacy-handles [data-ceb-area-corner="se"]');
  const rect = handle?.getBoundingClientRect();
  return rect ? [rect.left + rect.width / 2, rect.top + rect.height / 2] : null;
});
check('selected Area exposes its southeast resize handle', !!seHandle, JSON.stringify(seHandle));
await page.mouse.move(seHandle[0], seHandle[1]);
await page.mouse.down();
await page.mouse.move(seHandle[0] + 50, seHandle[1] + 35, { steps: 8 });
await page.mouse.up();
await wait(350);
let resized = await page.evaluate(id => {
  const element = [...document.querySelectorAll('.ceb-blur-area')]
    .find(item => item.dataset.cebAreaId === id);
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}, area.id);
check('dragging an Area handle resizes without moving the opposite corner',
  resized.width > moved.width + 40 && resized.height > moved.height + 25
    && Math.abs(resized.left - moved.left) < 3 && Math.abs(resized.top - moved.top) < 3,
  JSON.stringify({ moved, resized }));

const abortCenter = [resized.left + resized.width / 2, resized.top + resized.height / 2];
await page.mouse.move(abortCenter[0], abortCenter[1]);
await page.mouse.down();
await page.mouse.move(abortCenter[0] + 70, abortCenter[1] + 30, { steps: 6 });
await page.keyboard.press('Escape');
await page.mouse.up();
await wait(300);
const afterAbort = await page.evaluate(() => {
  const rect = document.querySelector('.ceb-blur-area').getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
});
check('Escape during an Area drag restores the last committed geometry',
  Math.abs(afterAbort.left - resized.left) < 3 && Math.abs(afterAbort.top - resized.top) < 3
    && Math.abs(afterAbort.width - resized.width) < 3 && Math.abs(afterAbort.height - resized.height) < 3,
  JSON.stringify({ resized, afterAbort }));

await page.click('#ceb-blur-strength-seg [data-blur-level="2"]');
await wait(350);
area = await page.evaluate(() => ({
  backdrop: getComputedStyle(document.querySelector('.ceb-blur-area')).backdropFilter,
  status: document.getElementById('ceb-privacy-selection-status')?.textContent,
}));
check('blur strength edits the selected Area',
  area.backdrop.includes('blur(20px)') && area.status === 'Strong blur area selected',
  JSON.stringify(area));

await page.click('.ceb-tb-btn[data-mode="redact"]');
await wait(350);
let areaEffect = await page.evaluate(() => ({
  kind: document.querySelector('.ceb-blur-area')?.dataset.cebAreaKind,
  background: getComputedStyle(document.querySelector('.ceb-blur-area')).backgroundColor,
  strengthHidden: document.getElementById('ceb-blur-strength')?.hidden,
  status: document.getElementById('ceb-privacy-selection-status')?.textContent,
}));
check('Blur and Redact switch the selected Area effect in place',
  areaEffect.kind === 'redact' && areaEffect.background === 'rgb(0, 0, 0)'
    && areaEffect.strengthHidden && areaEffect.status === 'Redacted area selected',
  JSON.stringify(areaEffect));
await page.click('.ceb-tb-btn[data-mode="blur"]');
await wait(300);

const beforeNudge = await page.evaluate(() => document.querySelector('.ceb-blur-area').getBoundingClientRect().left);
await page.keyboard.press('Shift+ArrowRight');
await wait(300);
const afterNudge = await page.evaluate(() => document.querySelector('.ceb-blur-area').getBoundingClientRect().left);
check('keyboard nudges a selected Area by 10px with Shift',
  Math.abs(afterNudge - beforeNudge - 10) < 3, `${beforeNudge} -> ${afterNudge}`);

await page.keyboard.press('Escape');
await wait(250);
const deselected = await page.evaluate(() => ({
  selectionHidden: document.getElementById('ceb-privacy-selection')?.hidden,
  stillAreaMode: document.body.classList.contains('ceb-mode-draw'),
}));
check('Escape deselects an Area before exiting the mode',
  deselected.selectionHidden && deselected.stillAreaMode, JSON.stringify(deselected));

const currentArea = await page.evaluate(() => {
  const rect = document.querySelector('.ceb-blur-area').getBoundingClientRect();
  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
});
await page.mouse.click(currentArea[0], currentArea[1]);
await wait(200);
await page.keyboard.press('Delete');
await wait(350);
check('Delete explicitly removes a selected Area', (await page.locator('.ceb-blur-area').count()) === 0);

// Draw one more Area, leave editing mode, and verify the visual cannot steal page clicks.
await page.mouse.move(120, 110);
await page.mouse.down();
await page.mouse.move(320, 160, { steps: 6 });
await page.mouse.up();
await wait(250);
const inertPoint = await page.evaluate(() => {
  const rect = document.querySelector('.ceb-blur-area').getBoundingClientRect();
  window.__cebUnderlyingClicks = 0;
  const point = [rect.left + rect.width / 2, rect.top + rect.height / 2];
  const target = document.elementsFromPoint(point[0], point[1])
    .find(element => !element.id?.startsWith('ceb-') && !element.classList?.contains('ceb-blur-area'));
  target?.addEventListener('click', () => { window.__cebUnderlyingClicks += 1; });
  return { point, target: target?.id || target?.className || target?.tagName || 'none' };
});
await activate('idle');
await wait(250);
const topAtArea = await page.evaluate(({ point }) => {
  const target = document.elementFromPoint(point[0], point[1]);
  return target?.className ? String(target.className) : target?.tagName;
}, inertPoint);
await page.mouse.click(inertPoint.point[0], inertPoint.point[1]);
await wait(150);
const underlyingClicks = await page.evaluate(() => window.__cebUnderlyingClicks);
check('Areas are inert outside privacy editing modes',
  !/ceb-blur-area/.test(topAtArea || '') && underlyingClicks === 1,
  `${inertPoint.target} -> ${topAtArea} clicks=${underlyingClicks}`);

await activate('annotate');
await wait(450);
const persistenceOff = await page.evaluate(() => {
  const input = document.getElementById('ceb-persist-toggle');
  input.checked = false;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
});
check('master persistence can be paused', persistenceOff && (await readKey('persistEnabled')) === false);
let persistenceUi = await page.evaluate(() => ({
  checked: document.getElementById('ceb-persist-toggle')?.checked,
  annotationLabel: document.getElementById('ceb-btn-note-keep')?.textContent,
  annotationPressed: document.getElementById('ceb-btn-note-keep')?.getAttribute('aria-pressed'),
}));
check('paused persistence does not claim annotations are remembered',
  !persistenceUi.checked && persistenceUi.annotationLabel === 'Save annotations too'
    && persistenceUi.annotationPressed === 'false',
  JSON.stringify(persistenceUi));
await page.click('#ceb-btn-note-keep');
await wait(300);
persistenceUi = await page.evaluate(() => ({
  checked: document.getElementById('ceb-persist-toggle')?.checked,
  annotationLabel: document.getElementById('ceb-btn-note-keep')?.textContent,
  annotationPressed: document.getElementById('ceb-btn-note-keep')?.getAttribute('aria-pressed'),
}));
check('saving annotations also enables the required master persistence',
  (await readKey('persistEnabled')) === true && (await readKey('annotateKeep')) === true
    && persistenceUi.checked && persistenceUi.annotationLabel === 'Annotations remembered'
    && persistenceUi.annotationPressed === 'true',
  JSON.stringify(persistenceUi));

// Before Area levels existed, every saved blur Area rendered at 20px. Preserve that
// appearance when loading an old v2 payload with no level field.
await sw.evaluate(async ({ key }) => {
  await chrome.storage.local.set({
    [key]: {
      v: 2,
      rules: [],
      replacements: [],
      annotations: [],
      areas: [{ id: 'legacy-area', kind: 'blur', x: 80, y: 90, width: 120, height: 70, scope: 'page' }],
    },
  });
}, { key: pageKey });
await page.reload({ waitUntil: 'load' });
await wait(1700);
const legacyArea = await page.evaluate(() => ({
  count: document.querySelectorAll('.ceb-blur-area').length,
  backdrop: getComputedStyle(document.querySelector('.ceb-blur-area')).backdropFilter,
}));
check('legacy Areas without a level preserve the old Strong blur',
  legacyArea.count === 1 && legacyArea.backdrop.includes('blur(20px)'),
  JSON.stringify(legacyArea));

await activate('blur');
await wait(300);
await page.setViewportSize({ width: 1280, height: 720 });
await wait(150);
let toolbarBox = await page.locator('#ceb-toolbar').boundingBox();
const headerPoint = [toolbarBox.x + 75, toolbarBox.y + 24];
await page.mouse.move(headerPoint[0], headerPoint[1]);
await page.mouse.down();
await page.mouse.move(1800, 1100, { steps: 8 });
await page.mouse.up();
await wait(250);
toolbarBox = await page.locator('#ceb-toolbar').boundingBox();
check('toolbar drag is clamped to the right and bottom edges',
  toolbarBox.x + toolbarBox.width <= 1280.5 && toolbarBox.y + toolbarBox.height <= 720.5,
  JSON.stringify(toolbarBox));

const movedHeader = [toolbarBox.x + 75, toolbarBox.y + 24];
await page.mouse.move(movedHeader[0], movedHeader[1]);
await page.mouse.down();
await page.mouse.move(-600, -500, { steps: 8 });
await page.mouse.up();
await wait(250);
toolbarBox = await page.locator('#ceb-toolbar').boundingBox();
check('toolbar drag is clamped to the left and top edges',
  toolbarBox.x >= -0.5 && toolbarBox.y >= -0.5,
  JSON.stringify(toolbarBox));

await page.setViewportSize({ width: 375, height: 640 });
await wait(300);
toolbarBox = await page.locator('#ceb-toolbar').boundingBox();
check('toolbar remains recoverable after viewport resize',
  toolbarBox.x >= -0.5 && toolbarBox.y >= -0.5
    && toolbarBox.x + toolbarBox.width <= 375.5
    && toolbarBox.y + toolbarBox.height <= 640.5,
  JSON.stringify(toolbarBox));

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
check('no service worker errors', swErrors.length === 0, swErrors.join(' | '));

await teardown();
const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
