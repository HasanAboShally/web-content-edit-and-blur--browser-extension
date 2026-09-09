#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const source = fs.readFileSync(path.join(root, 'store-assets', 'showcase.html'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ceb-demo-profile-'));
const recordingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceb-demo-video-'));
const outputDir = path.join(root, 'store-assets', 'video');
const output = path.join(outputDir, 'content-edit-blur-demo.mp4');

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

async function pause(ms) {
  await page.waitForTimeout(ms);
}

async function caption(text, ms = 1800) {
  await page.evaluate(label => {
    document.getElementById('ceb-video-caption')?.remove();
    const el = document.createElement('div');
    el.id = 'ceb-video-caption';
    el.textContent = label;
    el.style.cssText = [
      'position:fixed', 'left:28px', 'bottom:24px', 'z-index:2147483647',
      'max-width:720px', 'padding:12px 16px', 'border-radius:10px',
      'background:rgba(23,23,26,.94)', 'color:#fff',
      'box-shadow:0 14px 35px rgba(0,0,0,.24)',
      'font:600 20px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'letter-spacing:-.01em',
    ].join(';');
    document.body.appendChild(el);
  }, text);
  await pause(ms);
  await page.evaluate(() => document.getElementById('ceb-video-caption')?.remove());
}

async function drag(from, to, steps = 12) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps });
  await page.mouse.up();
  await pause(350);
}

try {
  fs.mkdirSync(outputDir, { recursive: true });
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: recordingDir, size: { width: 1280, height: 720 } },
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
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
      annotateSize: 3,
    });
  });

  page = await context.newPage();
  const video = page.video();
  const errors = [];
  const workerErrors = [];
  page.on('pageerror', error => errors.push(String(error)));
  worker.on('console', message => {
    if (message.type() === 'error') workerErrors.push(message.text());
  });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const url = `${base}/demo.html`;
  await page.goto(url, { waitUntil: 'load' });
  const tabId = await worker.evaluate(async targetUrl =>
    (await chrome.tabs.query({ url: targetUrl }))[0]?.id ?? null, url);
  if (tabId === null) throw new Error('Could not find the demo tab');

  const activate = mode => worker.evaluate(async ({ id, modeId }) => {
    await ensureInitialized(id);
    await switchMode(id, modeId);
  }, { id: tabId, modeId: mode });
  const ready = async () => {
    await pause(450);
    await page.evaluate(() => document.getElementById('ceb-panel')?.remove());
  };

  await caption('Turn any webpage into a clean, shareable visual.', 2100);

  await activate('edit');
  await ready();
  await page.evaluate(() => {
    document.getElementById('headline').textContent = 'Launch performance review';
  });
  await caption('Edit text directly on the page.');

  await activate('blur');
  await ready();
  await page.click('#revenue-value');
  await page.click('#ceb-blur-strength-seg [data-blur-level="2"]');
  await page.keyboard.press('Escape');
  await page.click('#customer-email');
  await page.keyboard.press('Escape');
  await caption('Blur details before a demo or screen share.');

  await page.click('#ceb-ui-seg [data-ui="advanced"]');
  await pause(250);
  await activate('redact');
  await ready();
  await page.click('#api-key');
  await page.keyboard.press('Escape');
  await caption('Redact sensitive pixels before sharing a screenshot.');

  await activate('annotate');
  await ready();
  await page.click('.ceb-note-tool[data-note-tool="marker"]');
  await drag([255, 153], [720, 153]);
  await page.click('.ceb-note-tool[data-note-tool="arrow"]');
  await drag([690, 304], [525, 255]);
  await caption('Highlight, draw and explain the change.');

  await activate('idle');
  await ready();
  await caption('Free · Open source · No account · No tracking', 2600);

  if (errors.length) throw new Error(`Page errors: ${errors.join(' | ')}`);
  if (workerErrors.length) throw new Error(`Service worker errors: ${workerErrors.join(' | ')}`);

  await page.close();
  page = null;
  const webm = await video.path();
  const result = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', webm,
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output,
  ], { stdio: 'inherit' });
  if (result.error?.code === 'ENOENT') {
    throw new Error('ffmpeg is required to encode the store demo video');
  }
  if (result.status !== 0) throw new Error(`ffmpeg exited ${result.status}`);
  console.log(`Created ${path.relative(root, output)}`);
} finally {
  if (page) await page.close().catch(() => {});
  if (context) await context.close().catch(() => {});
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(recordingDir, { recursive: true, force: true });
}
