#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.png', 'image/png'], ['.woff2', 'font/woff2'],
]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  const relative = pathname === '/' ? 'styleframe.html' : pathname.replace(/^\//, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end(); return;
  }
  response.writeHead(200, {'Content-Type': types.get(path.extname(file)) || 'application/octet-stream'});
  fs.createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1});
  await page.goto(`http://127.0.0.1:${server.address().port}/styleframe.html`, {waitUntil: 'load'});
  await page.evaluate(() => document.fonts.ready);
  for (const id of ['hook', 'product', 'finale']) {
    await page.locator(`#${id}`).screenshot({path: path.join(root, 'analysis/styleframes', `${id}.png`)});
  }
  console.log('Created 3 styleframes');
} finally {
  await browser.close();
  server.close();
}
