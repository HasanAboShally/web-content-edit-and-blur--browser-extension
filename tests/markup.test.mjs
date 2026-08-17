// Annotate v2: the highlighter, numbered step badges, and moving/resizing an existing
// mark. Also covers the pointer-events fix — annotations used to sit above the page and
// swallow clicks meant for it.
import { chromium } from 'playwright';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const EXT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASE = process.env.CEB_TEST_URL || 'http://localhost:8731';
const URL1 = `${BASE}/index.html`;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceb-markup-'));

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

const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL1, { waitUntil: 'load' });

const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0]?.id ?? null, URL1);
const activate = (mode) => sw.evaluate(async ({ id, mode }) => {
  try { await ensureInitialized(id); await switchMode(id, mode); return 'ok'; }
  catch (e) { return 'ERR ' + e.message; }
}, { id: tabId, mode });

const pickTool = async (tool) => {
  await page.evaluate((t) => {
    document.querySelector(`.ceb-note-tool[data-note-tool="${t}"]`)?.click();
  }, tool);
  await page.waitForTimeout(250);
};

// Real mouse events, so the pointer handlers are what is under test rather than the
// state functions they call.
async function dragMouse(from, to, steps = 8) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from[0] + ((to[0] - from[0]) * i) / steps,
      from[1] + ((to[1] - from[1]) * i) / steps
    );
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function drawNote(tool, from, to) {
  await pickTool(tool);
  await dragMouse(from, to);
}

const notes = () => page.evaluate(() =>
  [...document.querySelectorAll('.ceb-annotation')].map(e => ({
    id: e.dataset.cebNoteId,
    kind: e.dataset.cebNoteKind,
    left: Math.round(e.getBoundingClientRect().left),
    top: Math.round(e.getBoundingClientRect().top),
    width: Math.round(e.getBoundingClientRect().width),
  })));

check('activate annotate mode', (await activate('annotate')) === 'ok');
await page.waitForTimeout(800);

// A fresh profile shows the "Quick start" modal dead-centre, at a z-index above the
// annotate overlay — it would eat any click landing in the middle of the viewport.
// A returning user never sees it, so dismiss it rather than dodging the coordinates.
await page.evaluate(() => document.getElementById('ceb-panel')?.remove());

// Pro reveals the box, freehand and step tools.
await page.evaluate(async () => {
  document.querySelector('#ceb-ui-seg .ceb-seg-btn[data-ui="pro"]')?.click();
  await new Promise(r => setTimeout(r, 300));
});

// ---------- Highlighter ----------
await drawNote('marker', [180, 300], [420, 300]);

const marker = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.ceb-annotation')].find(e => e.dataset.cebNoteKind === 'marker');
  if (!el) return null;
  const p = el.querySelector('path');
  return {
    blend: getComputedStyle(el).mixBlendMode,
    cap: p?.getAttribute('stroke-linecap'),
    width: Number(p?.getAttribute('stroke-width')),
    color: p?.getAttribute('stroke'),
  };
});
check('marker draws a stroke', marker !== null, JSON.stringify(marker));
// Plain alpha over black text washes it out to grey; multiply keeps the text black and
// only tints the white around it, which is what makes this read as a highlighter.
check('marker multiplies into the page instead of painting over it',
  marker?.blend === 'multiply', String(marker?.blend));
check('marker has a chisel tip, not a round nib', marker?.cap === 'butt', String(marker?.cap));
check('marker is far wider than the pen', marker?.width >= 12, String(marker?.width));
check('marker takes its colour from the highlighter palette',
  marker?.color === '#fde047', String(marker?.color));

// The two palettes are not interchangeable: a saturated red multiplied over text is an
// almost-black smear, so the swatch row swaps with the tool.
const markerSwatches = await page.evaluate(() =>
  [...document.querySelectorAll('.ceb-note-swatch')].map(b => b.dataset.noteColor));
await pickTool('arrow');
const lineSwatches = await page.evaluate(() =>
  [...document.querySelectorAll('.ceb-note-swatch')].map(b => b.dataset.noteColor));
check('the swatch row swaps with the tool',
  markerSwatches[0] === '#fde047' && lineSwatches[0] === '#e11d48',
  `${markerSwatches[0]} vs ${lineSwatches[0]}`);

// Choosing a line colour must not change the highlighter's, or switching back would
// hand you a red highlighter.
await page.evaluate(() => {
  document.querySelector('.ceb-note-swatch[data-note-color="#16a34a"]')?.click();
});
await page.waitForTimeout(200);
await drawNote('marker', [180, 340], [420, 340]);
const secondMarkerColor = await page.evaluate(() => {
  const all = [...document.querySelectorAll('.ceb-annotation')].filter(e => e.dataset.cebNoteKind === 'marker');
  return all[all.length - 1]?.querySelector('path')?.getAttribute('stroke');
});
check('the marker keeps its own colour when the line colour changes',
  secondMarkerColor === '#fde047', String(secondMarkerColor));

// ---------- Numbered step badges ----------
await pickTool('step');
await page.mouse.click(600, 300);
await page.waitForTimeout(300);
await page.mouse.click(640, 340);
await page.waitForTimeout(300);
await page.mouse.click(680, 380);
await page.waitForTimeout(300);

const stepLabels = () => page.evaluate(() =>
  [...document.querySelectorAll('.ceb-annotation')]
    .filter(e => e.dataset.cebNoteKind === 'step')
    .map(e => e.querySelector('text')?.textContent));

let labels = await stepLabels();
check('each click places a step badge', labels.length === 3, JSON.stringify(labels));
check('step badges number themselves in order',
  JSON.stringify(labels) === JSON.stringify(['1', '2', '3']), JSON.stringify(labels));

// Numbers are derived from position, not stored, so removing one closes the gap rather
// than leaving a 1, 3 sequence behind.
const firstStepBox = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.ceb-annotation')].find(e => e.dataset.cebNoteKind === 'step');
  const r = el.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
});
await page.mouse.click(firstStepBox[0], firstStepBox[1]);
await page.waitForTimeout(400);
labels = await stepLabels();
check('removing a badge renumbers the rest',
  JSON.stringify(labels) === JSON.stringify(['1', '2']), JSON.stringify(labels));

// ---------- Moving a mark ----------
await pickTool('arrow');
await dragMouse([200, 480], [340, 560]);
const beforeMove = (await notes()).find(n => n.kind === 'arrow');
check('an arrow is on the page to move', !!beforeMove, JSON.stringify(beforeMove));

// Grab the middle of the shaft — on the ink, away from either endpoint handle.
const shaftMid = [Math.round((200 + 340) / 2), Math.round((480 + 560) / 2)];
await dragMouse(shaftMid, [shaftMid[0] + 90, shaftMid[1] + 40]);
const afterMove = (await notes()).find(n => n.kind === 'arrow');
check('dragging a mark moves it',
  Math.abs(afterMove.left - beforeMove.left - 90) < 12
  && Math.abs(afterMove.top - beforeMove.top - 40) < 12,
  `${beforeMove.left},${beforeMove.top} -> ${afterMove.left},${afterMove.top}`);
check('moving does not resize', Math.abs(afterMove.width - beforeMove.width) < 6,
  `${beforeMove.width} -> ${afterMove.width}`);

// A move is a discrete action, so it has to be undoable on its own.
await page.evaluate(() => document.querySelector('#ceb-btn-undo')?.click());
await page.waitForTimeout(400);
const afterUndo = (await notes()).find(n => n.kind === 'arrow');
check('undo puts a moved mark back',
  Math.abs(afterUndo.left - beforeMove.left) < 12 && Math.abs(afterUndo.top - beforeMove.top) < 12,
  `${afterUndo.left},${afterUndo.top} vs ${beforeMove.left},${beforeMove.top}`);

// ---------- Handles and resizing ----------
await page.mouse.move(shaftMid[0], shaftMid[1]);
await page.waitForTimeout(250);
const handleCount = await page.evaluate(() =>
  document.querySelectorAll('#ceb-note-handles .ceb-note-handle').length);
check('hovering a two-point shape reveals its handles', handleCount === 2, String(handleCount));

const resizeBefore = (await notes()).find(n => n.kind === 'arrow');
// The arrow's tip endpoint, which is where a handle sits.
await dragMouse([340, 560], [440, 620]);
const resizeAfter = (await notes()).find(n => n.kind === 'arrow');
check('dragging a handle resizes rather than moves',
  resizeAfter.width > resizeBefore.width + 40 && Math.abs(resizeAfter.left - resizeBefore.left) < 12,
  `w ${resizeBefore.width} -> ${resizeAfter.width}, left ${resizeBefore.left} -> ${resizeAfter.left}`);

// ---------- Drawing inside a shape ----------
// Hit testing follows the ink, not the bounding box. A box test would treat the hollow
// middle of a circle as part of it and start a move instead of a new mark.
// Coordinates must stay inside the 1280x720 viewport, and clear of the toolbar (x>1024).
await drawNote('ellipse', [700, 470], [900, 610]);
const beforeInside = (await notes()).length;
await drawNote('arrow', [760, 530], [840, 560]);
const afterInside = (await notes()).length;
check('drawing inside an existing circle still creates a mark',
  afterInside === beforeInside + 1, `${beforeInside} -> ${afterInside}`);

// ---------- Clicking a text note edits it rather than deleting it ----------
await pickTool('text');
await page.mouse.click(560, 700);
await page.waitForTimeout(300);
await page.keyboard.type('explain this');
await page.evaluate(() => document.getElementById('ceb-annotate-overlay')?.dispatchEvent(
  new MouseEvent('mousedown', { bubbles: true, clientX: 900, clientY: 200 })));
await page.waitForTimeout(400);

const textBox = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.ceb-annotation')].find(e => e.dataset.cebNoteKind === 'text');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return [Math.round(r.left + 20), Math.round(r.top + 8)];
});
check('the typed note was kept', textBox !== null, JSON.stringify(textBox));
await page.mouse.click(textBox[0], textBox[1]);
await page.waitForTimeout(400);
const editorOpen = await page.evaluate(() => !!document.getElementById('ceb-text-editor'));
const noteStillThere = await page.evaluate(() =>
  [...document.querySelectorAll('.ceb-annotation')].some(e => e.dataset.cebNoteKind === 'text'));
check('clicking a note opens its editor instead of deleting it',
  editorOpen && noteStillThere, `editor=${editorOpen} note=${noteStillThere}`);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// ---------- Regression: a note is grabbable at its words, not across its box ----------
// annotationBounds reports the wrap width (a fixed 220px default), so hit-testing that
// let a two-character note claim a wide strip of blank page and steal drags that began
// nowhere near anything visible.
const noteGeom = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.ceb-annotation')].find(e => e.dataset.cebNoteKind === 'text');
  const box = el.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(el);
  const ink = range.getBoundingClientRect();
  return {
    boxLeft: Math.round(box.left), boxWidth: Math.round(box.width),
    inkRight: Math.round(ink.right), top: Math.round(box.top + box.height / 2)
  };
});
// Inside the declared box but well past the last character.
const blankX = Math.round((noteGeom.inkRight + noteGeom.boxLeft + noteGeom.boxWidth) / 2);
check('the note box is much wider than its text',
  blankX > noteGeom.inkRight + 20, `ink ends ${noteGeom.inkRight}, probing ${blankX}`);

await activate('annotate');
await page.waitForTimeout(500);
await page.evaluate(() => document.getElementById('ceb-panel')?.remove());
const beforeBlank = (await notes()).length;
const noteLeftBefore = (await notes()).find(n => n.kind === 'text').left;
await drawNote('arrow', [blankX, noteGeom.top], [blankX + 90, noteGeom.top + 50]);
const afterBlank = (await notes()).length;
const noteLeftAfter = (await notes()).find(n => n.kind === 'text').left;
check('dragging from blank page beside a note draws instead of moving it',
  afterBlank === beforeBlank + 1 && noteLeftAfter === noteLeftBefore,
  `${beforeBlank} -> ${afterBlank}, note left ${noteLeftBefore} -> ${noteLeftAfter}`);

// ---------- Regression: a click on a resize handle must not delete the mark ----------
// The cursor over a handle promises a resize, and handles sit right on the shape, so
// treating a stationary click there as "remove" deleted the mark being reached for.
const handleTarget = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.ceb-annotation')].find(e => e.dataset.cebNoteKind === 'arrow');
  const r = el.getBoundingClientRect();
  return { id: el.dataset.cebNoteId, mid: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] };
});
// Hover to raise the handles, then read where one actually is.
await page.mouse.move(handleTarget.mid[0], handleTarget.mid[1]);
await page.waitForTimeout(250);
const handlePos = await page.evaluate(() => {
  const h = document.querySelector('#ceb-note-handles')?.children?.[0];
  if (!h) return null;
  const r = h.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
});
check('a handle is exposed to click', handlePos !== null, JSON.stringify(handlePos));
const beforeHandleClick = (await notes()).length;
await page.mouse.click(handlePos[0], handlePos[1]);
await page.waitForTimeout(350);
const afterHandleClick = (await notes()).length;
check('clicking a resize handle does not delete the mark',
  afterHandleClick === beforeHandleClick, `${beforeHandleClick} -> ${afterHandleClick}`);

// ---------- Regression: Escape mid-drag reverts, rather than half-applying ----------
// updateNote mutates the live annotation and only endNote commits, so any path that ends
// the gesture without endNote used to leave the mark moved on screen but absent from
// history: the next undo then discarded the move *and* ate the action before it.
const escFrom = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.ceb-annotation')].find(e => e.dataset.cebNoteKind === 'arrow');
  const r = el.getBoundingClientRect();
  return { id: el.dataset.cebNoteId, at: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] };
});
const escTarget = (await notes()).find(n => n.id === escFrom.id);
const orderBeforeDrag = await page.evaluate(() =>
  [...document.querySelectorAll('.ceb-annotation')].map(e => e.dataset.cebNoteId));
await page.mouse.move(escFrom.at[0], escFrom.at[1]);
await page.mouse.down();
for (let i = 1; i <= 6; i++) {
  await page.mouse.move(escFrom.at[0] + (80 * i) / 6, escFrom.at[1] + (40 * i) / 6);
  await page.waitForTimeout(16);
}
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.mouse.up();
await page.waitForTimeout(300);
const escAfter = (await notes()).find(n => n.id === escFrom.id);
check('Escape mid-drag puts the mark back',
  escAfter && Math.abs(escAfter.left - escTarget.left) < 4 && Math.abs(escAfter.top - escTarget.top) < 4,
  `${escTarget.left},${escTarget.top} -> ${escAfter && escAfter.left},${escAfter && escAfter.top}`);

// Repainting one mark mid-drag must not restack it. renderAnnotation appends, so a naive
// refresh bumped the dragged mark to the end of the paint order while state.annotations —
// which hit testing walks to decide what is on top — kept the original order.
const orderAfterDrag = await page.evaluate(() =>
  [...document.querySelectorAll('.ceb-annotation')].map(e => e.dataset.cebNoteId));
check('dragging a mark does not restack it above its neighbours',
  orderAfterDrag.join(',') === orderBeforeDrag.join(','),
  `moved ${orderBeforeDrag.indexOf(escFrom.id)} -> ${orderAfterDrag.indexOf(escFrom.id)} of ${orderAfterDrag.length}`);

// The abandoned move must not have left state and history disagreeing: one undo should
// remove the most recent *committed* action, not silently swallow the phantom move.
const beforeEscUndo = (await notes()).length;
await activate('annotate');
await page.waitForTimeout(400);
await page.evaluate(() => document.getElementById('ceb-panel')?.remove());
await page.evaluate(() => document.querySelector('#ceb-btn-undo')?.click());
await page.waitForTimeout(400);
const afterEscUndo = (await notes()).length;
check('undo after an aborted drag removes exactly one mark',
  afterEscUndo === beforeEscUndo - 1, `${beforeEscUndo} -> ${afterEscUndo}`);

// ---------- Regression: annotations must not swallow page clicks ----------
// They sit above the page, so while they were hit-testable a mark laid over a link
// intercepted the click — and, because the handler was "click to remove", deleted
// itself instead of letting the click through.
await activate('idle');
await page.waitForTimeout(500);

const clickThrough = await page.evaluate(async () => {
  const card = document.getElementById('card-1');
  const r = card.getBoundingClientRect();
  window.__cebHits = 0;
  card.addEventListener('click', () => { window.__cebHits += 1; });
  // Put a mark squarely over the card.
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
});
await activate('annotate');
await page.waitForTimeout(500);
await pickTool('marker');
await dragMouse([clickThrough[0] - 60, clickThrough[1]], [clickThrough[0] + 60, clickThrough[1]]);
await activate('idle');
await page.waitForTimeout(500);

const covered = await page.evaluate((pt) => {
  const top = document.elementFromPoint(pt[0], pt[1]);
  return top ? (top.className && String(top.className)) || top.id || top.tagName : 'none';
}, clickThrough);
await page.mouse.click(clickThrough[0], clickThrough[1]);
await page.waitForTimeout(300);
const hits = await page.evaluate(() => window.__cebHits);
const markSurvived = await page.evaluate(() =>
  [...document.querySelectorAll('.ceb-annotation')].some(e => e.dataset.cebNoteKind === 'marker'));
check('a mark does not become the top hit target', !/ceb-annotation/.test(covered), covered);
check('a click lands on the page element under a mark', hits === 1, `hits=${hits}`);
check('and the mark is not deleted by that click', markSurvived, String(markSurvived));

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
check('no service worker errors', swErrors.length === 0, swErrors.join(' | '));

await ctx.close();
fs.rmSync(userDataDir, { recursive: true, force: true });

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
