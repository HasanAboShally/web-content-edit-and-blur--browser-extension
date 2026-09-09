#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(projectRoot, '../..');
const outputDir = path.join(projectRoot, 'public', 'captures');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ceb-launch-captures-'));
const source = fs.readFileSync(path.join(repoRoot, 'store-assets', 'showcase.html'));

const staticRoutes = new Map([
  ['/images/app-icon-128.png', [path.join(repoRoot, 'images', 'app-icon-128.png'), 'image/png']],
  ['/fonts/instrument-sans-400.woff2', [path.join(repoRoot, 'docs', 'fonts', 'instrument-sans-400.woff2'), 'font/woff2']],
  ['/fonts/instrument-sans-600.woff2', [path.join(repoRoot, 'docs', 'fonts', 'instrument-sans-600.woff2'), 'font/woff2']],
  ['/fonts/instrument-serif-400.woff2', [path.join(repoRoot, 'docs', 'fonts', 'instrument-serif-400.woff2'), 'font/woff2']],
]);

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://local').pathname;
  if (pathname === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  const staticRoute = staticRoutes.get(pathname);
  if (staticRoute) {
    response.writeHead(200, {'Content-Type': staticRoute[1], 'Cache-Control': 'no-store'});
    fs.createReadStream(staticRoute[0]).pipe(response);
    return;
  }
  response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}).end(source);
});

const wait = (page, milliseconds) => page.waitForTimeout(milliseconds);

async function drag(page, from, to, steps = 18) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], {steps});
  await page.mouse.up();
  await wait(page, 180);
}

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let context;
try {
  fs.mkdirSync(outputDir, {recursive: true});
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: {width: 1920, height: 1080},
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${repoRoot}`, `--load-extension=${repoRoot}`],
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', {timeout: 15000});
  await worker.evaluate(async () => {
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
      annotateSize: 4,
    });
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.emulateMedia({colorScheme: 'light', reducedMotion: 'reduce'});
  const url = `${base}/launch-film.html`;
  await page.goto(url, {waitUntil: 'load'});
  await page.evaluate(() => document.fonts.ready);
  await wait(page, 700);

  const tabId = await worker.evaluate(async targetUrl =>
    (await chrome.tabs.query({url: targetUrl}))[0]?.id ?? null, url);
  if (tabId === null) throw new Error('Could not find the launch capture tab');
  const activate = mode => worker.evaluate(async ({id, modeId}) => {
    await ensureInitialized(id);
    await switchMode(id, modeId);
  }, {id: tabId, modeId: mode});
  const settle = async () => {
    await wait(page, 500);
    await page.evaluate(() => document.getElementById('ceb-panel')?.remove());
  };
  const shot = async name => {
    await page.screenshot({path: path.join(outputDir, name), animations: 'disabled', scale: 'device'});
  };

  await shot('base.png');

  await activate('edit');
  await settle();
  await shot('edit-before.png');
  await page.locator('#headline').evaluate(element => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.type('Launch performance review', {delay: 75});
  await wait(page, 450);
  await shot('edit-after.png');

  await activate('blur');
  await settle();
  await page.click('#revenue-value');
  await page.click('#ceb-blur-strength-seg [data-blur-level="2"]');
  await page.keyboard.press('Escape');
  await page.click('#customer-email');
  await page.keyboard.press('Escape');
  await wait(page, 350);
  await shot('blur-after.png');

  await activate('redact');
  await settle();
  await page.click('#api-key');
  await page.keyboard.press('Escape');
  await wait(page, 350);
  await shot('redact-after.png');

  await activate('annotate');
  await settle();
  const headline = await page.locator('#headline').boundingBox();
  const conversion = await page.locator('#conversion-value').boundingBox();
  const apiKey = await page.locator('#api-key').boundingBox();
  const activity = await page.locator('.activity').boundingBox();
  if (!headline || !conversion || !apiKey || !activity) throw new Error('Capture layout target missing');

  await page.click('.ceb-note-tool[data-note-tool="marker"]');
  await drag(page, [headline.x + 8, headline.y + headline.height - 5], [headline.x + Math.min(620, headline.width - 8), headline.y + headline.height - 5]);
  await page.click('.ceb-note-tool[data-note-tool="ellipse"]');
  await drag(page, [conversion.x - 18, conversion.y - 12], [conversion.x + conversion.width + 18, conversion.y + conversion.height + 12]);
  await page.click('.ceb-note-tool[data-note-tool="arrow"]');
  await drag(page, [apiKey.x - 230, apiKey.y + 120], [apiKey.x + apiKey.width / 2, apiKey.y + apiKey.height / 2]);
  await page.click('#ceb-ui-seg [data-ui="advanced"]');
  await page.click('.ceb-note-tool[data-note-tool="step"]');
  await page.mouse.click(activity.x + 22, activity.y + 58);
  await page.mouse.click(activity.x + 22, activity.y + 112);
  await page.mouse.click(activity.x + 22, activity.y + 166);
  await wait(page, 350);
  await shot('annotate-after.png');
  await page.locator('#ceb-toolbar').screenshot({path: path.join(outputDir, 'toolbar.png'), animations: 'disabled', scale: 'device'});

  await activate('idle');
  await settle();
  await page.evaluate(() => {
    const toolbar = document.getElementById('ceb-toolbar');
    if (toolbar) toolbar.style.visibility = 'hidden';
  });
  await shot('final-clean.png');

  const selectors = {
    page: 'body',
    headline: '#headline',
    revenue: '#revenue-value',
    conversion: '#conversion-value',
    customerEmail: '#customer-email',
    apiKey: '#api-key',
    activity: '.activity',
  };
  const layout = await page.evaluate(input => {
    const result = {viewport: {width: innerWidth, height: innerHeight}, deviceScaleFactor: window.devicePixelRatio};
    for (const [name, selector] of Object.entries(input)) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      result[name] = {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
    }
    return result;
  }, selectors);
  fs.writeFileSync(path.join(outputDir, 'layout.json'), `${JSON.stringify(layout, null, 2)}\n`);
  if (errors.length) throw new Error(`Capture page errors: ${errors.join(' | ')}`);
  console.log(`Created launch captures in ${path.relative(repoRoot, outputDir)}`);
} finally {
  if (context) await context.close();
  server.close();
  fs.rmSync(profile, {recursive: true, force: true});
}
