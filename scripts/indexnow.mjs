#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const site = 'https://hasanaboshally.github.io/web-content-edit-and-blur--browser-extension/';
const host = new URL(site).host;
const key = '9960456be0d09c8440edf631e8812f9e';
const keyLocation = `${site}${key}.txt`;
const sitemap = fs.readFileSync(path.join(root, 'docs', 'sitemap.xml'), 'utf8');
const urlList = [...sitemap.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g)].map(match => match[1]);

if (!urlList.length || urlList.some(url => !url.startsWith(site))) {
  throw new Error('sitemap.xml must contain only canonical URLs below the project site path');
}
const keyFile = fs.readFileSync(path.join(root, 'docs', `${key}.txt`), 'utf8').trim();
if (keyFile !== key) throw new Error('IndexNow key file does not match the submitted key');

const payload = { host, key, keyLocation, urlList };
if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'User-Agent': 'Content-Edit-Blur-Release/1.0',
  },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(15_000),
});

if (response.status !== 200 && response.status !== 202) {
  const detail = (await response.text()).slice(0, 500);
  throw new Error(`IndexNow returned ${response.status}${detail ? `: ${detail}` : ''}`);
}
console.log(`IndexNow accepted ${urlList.length} canonical URLs (${response.status}).`);
