#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const source = fs.readFileSync(path.join(root, 'store-assets', 'showcase.html'));
const outputDir = path.join(root, 'store-assets', 'screenshots');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ceb-store-shots-'));
const outputs = [
  '01-edit-and-smart-pick.png',
  '02-blur-and-redact.png',
  '03-draw-to-blur.png',
  '04-annotate-and-highlight.png',
  '05-rules-and-site-scope.png',
];

const server = http.createServer((request, response) => {
  if (request.url === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  }).end(source);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let context;
let page;

async function waitForUi() {
  await page.waitForTimeout(450);
  await page.evaluate(() => document.getElementById('ceb-panel')?.remove());
}

async function prepareShot(index, preferences = {}) {
  if (page) await page.close();
  await context.serviceWorkers()[0].evaluate(async values => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      onboarded: true,
      toolbarClosed: false,
      persistEnabled: true,
      uiMode: 'essentials',
      defaultScope: 'page',
      blurStrength: 1,
      drawKind: 'blur',
      annotateTool: 'arrow',
      annotateKeep: false,
      annotateSize: 3,
      ...values,
    });
  }, preferences);

  page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const url = `${base}/showcase-${index}.html`;
  await page.goto(url, { waitUntil: 'load' });
  const worker = context.serviceWorkers()[0];
  const tabId = await worker.evaluate(async targetUrl =>
    (await chrome.tabs.query({ url: targetUrl }))[0]?.id ?? null, url);
  if (tabId === null) throw new Error(`Could not find showcase tab ${index}`);

  const activate = mode => worker.evaluate(async ({ id, modeId }) => {
    await ensureInitialized(id);
    await switchMode(id, modeId);
  }, { id: tabId, modeId: mode });

  return { activate, errors };
}

async function capture(index, errors) {
  await page.waitForTimeout(300);
  const file = path.join(outputDir, outputs[index - 1]);
  await page.screenshot({ path: file, animations: 'disabled' });
  if (errors.length) throw new Error(`${outputs[index - 1]} page errors: ${errors.join(' | ')}`);
  console.log(`Created ${path.relative(root, file)}`);
}

async function drag(from, to, steps = 8) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps });
  await page.mouse.up();
  await page.waitForTimeout(180);
}

try {
  fs.mkdirSync(outputDir, { recursive: true });
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const workerErrors = [];
  worker.on('console', message => {
    if (message.type() === 'error') workerErrors.push(message.text());
  });

  // Edited content plus the exact-element picker.
  let shot = await prepareShot(1);
  await shot.activate('edit');
  await waitForUi();
  await page.evaluate(() => {
    document.getElementById('headline').textContent = 'Launch performance review';
  });
  await shot.activate('blur');
  await waitForUi();
  await page.hover('#conversion-value');
  await capture(1, shot.errors);

  // Multiple privacy effects, with one selected for direct editing.
  shot = await prepareShot(2, { uiMode: 'advanced' });
  await shot.activate('blur');
  await waitForUi();
  await page.click('#revenue-value');
  await page.click('#ceb-blur-strength-seg [data-blur-level="2"]');
  await page.keyboard.press('Escape');
  await page.click('#customer-email');
  await page.keyboard.press('Escape');
  await shot.activate('redact');
  await waitForUi();
  await page.click('#api-key');
  await capture(2, shot.errors);

  // Selected Area with handles and explicit strength controls.
  shot = await prepareShot(3, { blurStrength: 2 });
  await shot.activate('draw');
  await waitForUi();
  await drag([438, 628], [785, 724]);
  await capture(3, shot.errors);

  // A realistic annotation pass using the actual drawing interactions.
  shot = await prepareShot(4, { uiMode: 'advanced' });
  await shot.activate('annotate');
  await waitForUi();
  await page.click('.ceb-note-tool[data-note-tool="marker"]');
  await drag([255, 153], [720, 153], 12);
  await page.click('.ceb-note-tool[data-note-tool="ellipse"]');
  await drag([246, 202], [424, 315]);
  await page.click('.ceb-note-tool[data-note-tool="arrow"]');
  await drag([690, 304], [525, 255]);
  await page.click('.ceb-note-tool[data-note-tool="step"]');
  await page.mouse.click(770, 387);
  await page.mouse.click(770, 435);
  await page.mouse.click(770, 483);
  await capture(4, shot.errors);

  // Page- and site-scoped rules in the expanded management panel.
  shot = await prepareShot(5, { uiMode: 'advanced' });
  await shot.activate('blur');
  await waitForUi();
  await page.click('#ceb-scope-seg [data-scope="site"]');
  await page.click('#customer-email');
  await page.keyboard.press('Escape');
  await page.click('#ceb-scope-seg [data-scope="page"]');
  await shot.activate('redact');
  await waitForUi();
  await page.click('#api-key');
  await page.keyboard.press('Escape');
  await shot.activate('blur');
  await waitForUi();
  await page.click('#revenue-value');
  await page.click('#ceb-blur-strength-seg [data-blur-level="2"]');
  await page.keyboard.press('Escape');
  await shot.activate('idle');
  await waitForUi();
  await page.click('#ceb-rules-toggle');
  await page.evaluate(() => {
    document.getElementById('ceb-toast')?.remove();
    const body = document.querySelector('#ceb-toolbar .ceb-toolbar-body');
    if (body) body.scrollTop = body.scrollHeight;
  });
  await capture(5, shot.errors);

  if (workerErrors.length) throw new Error(`Service worker errors: ${workerErrors.join(' | ')}`);
} finally {
  if (context) await context.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
