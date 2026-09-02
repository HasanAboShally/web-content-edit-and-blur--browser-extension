#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const docs = path.join(root, 'docs');
const images = path.join(root, 'images');

function within(directory, relativePath) {
  const candidate = path.resolve(directory, relativePath);
  const relative = path.relative(directory, candidate);
  return relative.startsWith('..') || path.isAbsolute(relative) ? null : candidate;
}

function localFile(urlPath) {
  if (urlPath === '/' || urlPath === '/index.html') return path.join(docs, 'index.html');
  if (urlPath.startsWith('/images/')) return within(images, urlPath.slice('/images/'.length));
  return within(docs, urlPath.replace(/^\/+/, ''));
}

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  const file = localFile(pathname);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end();
    return;
  }
  const type = file.endsWith('.html') ? 'text/html; charset=utf-8'
    : file.endsWith('.png') ? 'image/png'
      : file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(response);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const metadata = await page.evaluate(() => ({
    title: document.title,
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    ogImage: document.querySelector('meta[property="og:image"]')?.content,
    ogWidth: document.querySelector('meta[property="og:image:width"]')?.content,
    ogHeight: document.querySelector('meta[property="og:image:height"]')?.content,
  }));
  if (!metadata.title.includes('Content Edit & Blur')) throw new Error('Website title is missing');
  if (!metadata.canonical?.startsWith('https://')) throw new Error('Canonical URL is missing');
  if (!metadata.ogImage?.includes('/og-image.png?v=2.4.0')
      || metadata.ogWidth !== '1200' || metadata.ogHeight !== '630') {
    throw new Error(`Social metadata is stale: ${JSON.stringify(metadata)}`);
  }

  await page.click('#theme-btn');
  const theme = await page.evaluate(() => ({
    value: document.documentElement.dataset.theme,
    pressed: document.getElementById('theme-btn')?.getAttribute('aria-pressed'),
  }));
  if (theme.value !== 'dark' || theme.pressed !== 'true') {
    throw new Error(`Theme toggle state is inconsistent: ${JSON.stringify(theme)}`);
  }

  await page.setViewportSize({ width: 375, height: 800 });
  const reflow = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  if (reflow.scroll > reflow.client + 1) {
    throw new Error(`Website overflows at 375px: ${JSON.stringify(reflow)}`);
  }
  if (errors.length) throw new Error(`Website runtime errors: ${errors.join(' | ')}`);
  console.log(`PASS  Website desktop, dark theme, metadata and 375px reflow`);
} finally {
  await browser.close();
  server.close();
}
