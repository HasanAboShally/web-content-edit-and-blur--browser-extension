#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const routes = new Map([
  ['/og-card.html', [path.join(root, 'store-assets', 'og-card.html'), 'text/html; charset=utf-8']],
  ['/images/app-icon-128.png', [path.join(root, 'images', 'app-icon-128.png'), 'image/png']],
  ['/fonts/instrument-sans-400.woff2', [path.join(root, 'docs', 'fonts', 'instrument-sans-400.woff2'), 'font/woff2']],
  ['/fonts/instrument-sans-600.woff2', [path.join(root, 'docs', 'fonts', 'instrument-sans-600.woff2'), 'font/woff2']],
  ['/fonts/instrument-serif-400.woff2', [path.join(root, 'docs', 'fonts', 'instrument-serif-400.woff2'), 'font/woff2']],
]);

const server = http.createServer((request, response) => {
  const route = routes.get(request.url);
  if (!route) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store' });
  fs.createReadStream(route[0]).pipe(response);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const output = path.join(root, 'docs', 'og-image.png');

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/og-card.html`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: output, animations: 'disabled' });
  if (errors.length) throw new Error(errors.join(' | '));
  console.log(`Created ${path.relative(root, output)}`);
} finally {
  await browser.close();
  server.close();
}
