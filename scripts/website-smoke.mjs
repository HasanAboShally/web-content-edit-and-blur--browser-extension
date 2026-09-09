#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const docs = path.join(root, 'docs');
const images = path.join(root, 'images');
const canonical = 'https://hasanaboshally.github.io/web-content-edit-and-blur--browser-extension/';
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

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
      : file.endsWith('.woff2') ? 'font/woff2'
        : file.endsWith('.xml') ? 'application/xml; charset=utf-8'
          : file.endsWith('.md') ? 'text/markdown; charset=utf-8'
            : file.endsWith('.txt') ? 'text/plain; charset=utf-8'
              : 'application/octet-stream';
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
  const localOrigin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${localOrigin}/`, { waitUntil: 'load' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const metadata = await page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content,
    robots: document.querySelector('meta[name="robots"]')?.content,
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    markdown: document.querySelector('link[rel="alternate"][type="text/markdown"]')?.href,
    describedBy: document.querySelector('link[rel="describedby"]')?.href,
    sitemap: document.querySelector('link[rel="sitemap"]')?.href,
    ogImage: document.querySelector('meta[property="og:image"]')?.content,
    ogWidth: document.querySelector('meta[property="og:image:width"]')?.content,
    ogHeight: document.querySelector('meta[property="og:image:height"]')?.content,
    h1Count: document.querySelectorAll('h1').length,
    mainCount: document.querySelectorAll('main').length,
    faqCount: document.querySelectorAll('#faq dt').length,
    imagesWithoutAlt: document.querySelectorAll('img:not([alt])').length,
    imagesWithoutDimensions: document.querySelectorAll('img:not([width]), img:not([height])').length,
    brokenFragments: [...document.querySelectorAll('a[href^="#"]')]
      .map(link => link.getAttribute('href').slice(1))
      .filter(id => id && !document.getElementById(id)),
  }));
  if (metadata.title !== 'Edit, Blur & Redact Any Webpage | Content Edit & Blur') {
    throw new Error(`Website title is stale: ${metadata.title}`);
  }
  if (!metadata.description || metadata.description.length < 140 || metadata.description.length > 160) {
    throw new Error(`Meta description should be 140–160 characters: ${metadata.description?.length}`);
  }
  if (metadata.canonical !== canonical) throw new Error(`Canonical URL is stale: ${metadata.canonical}`);
  if (!metadata.robots?.includes('index,follow')) throw new Error(`Indexing directive is missing: ${metadata.robots}`);
  if (metadata.markdown !== `${canonical}index.md`
      || metadata.describedBy !== `${canonical}llms.txt`
      || metadata.sitemap !== `${canonical}sitemap.xml`) {
    throw new Error(`Machine-readable discovery links are stale: ${JSON.stringify(metadata)}`);
  }
  if (!metadata.ogImage?.includes('/og-image.png?v=2.4.0')
      || metadata.ogWidth !== '1200' || metadata.ogHeight !== '630') {
    throw new Error(`Social metadata is stale: ${JSON.stringify(metadata)}`);
  }
  if (metadata.h1Count !== 1 || metadata.mainCount !== 1 || metadata.faqCount !== 6) {
    throw new Error(`Website semantics are incomplete: ${JSON.stringify(metadata)}`);
  }
  if (metadata.imagesWithoutAlt || metadata.imagesWithoutDimensions || metadata.brokenFragments.length) {
    throw new Error(`Website media or fragment links are incomplete: ${JSON.stringify(metadata)}`);
  }

  const structuredData = (await page.locator('script[type="application/ld+json"]').allTextContents())
    .flatMap(text => {
      const value = JSON.parse(text);
      return value['@graph'] || [value];
    });
  const app = structuredData.find(item => item['@type'] === 'SoftwareApplication');
  const website = structuredData.find(item => item['@type'] === 'WebSite');
  const webpage = structuredData.find(item => item['@type'] === 'WebPage');
  const author = structuredData.find(item => item['@type'] === 'Person');
  if (!app || !website || !webpage || !author) throw new Error('Structured product identity is incomplete');
  if (app.name !== 'Content Edit & Blur'
      || app.applicationCategory !== 'BrowserApplication'
      || app.softwareVersion !== manifest.version
      || Number(app.offers?.price) !== 0
      || app.installUrl?.length !== 3) {
    throw new Error(`SoftwareApplication data is stale: ${JSON.stringify(app)}`);
  }
  // Store ratings are visible social proof, but Google forbids aggregating
  // ratings from other websites in structured data.
  if (app.aggregateRating || app.review) throw new Error('External store ratings must not be structured as first-party reviews');

  const resources = await Promise.all([
    ['sitemap.xml', 'application/xml'],
    ['llms.txt', 'text/plain'],
    ['index.md', 'text/markdown'],
  ].map(async ([name, contentType]) => {
    const response = await fetch(`${localOrigin}/${name}`);
    return { name, contentType, status: response.status, actualType: response.headers.get('content-type'), text: await response.text() };
  }));
  for (const resource of resources) {
    if (resource.status !== 200 || !resource.actualType?.startsWith(resource.contentType)) {
      throw new Error(`Machine-readable resource failed: ${JSON.stringify(resource)}`);
    }
  }
  const sitemap = resources.find(resource => resource.name === 'sitemap.xml').text;
  const llms = resources.find(resource => resource.name === 'llms.txt').text;
  const markdown = resources.find(resource => resource.name === 'index.md').text;
  if (!sitemap.includes(`<loc>${canonical}</loc>`)
      || !llms.startsWith('# Content Edit & Blur')
      || !llms.includes(`${canonical}index.md`)
      || !markdown.includes('more than 9,700 users')
      || !markdown.includes(`Canonical website: ${canonical}`)) {
    throw new Error('Sitemap or LLM-readable product facts are incomplete');
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
  console.log(`PASS  Website SEO, structured data, LLM sources, dark theme and 375px reflow`);
} finally {
  await browser.close();
  server.close();
}
