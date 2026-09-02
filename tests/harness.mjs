import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function getFirstTabId(serviceWorker, url) {
  return serviceWorker.evaluate(async (targetUrl) =>
    (await chrome.tabs.query({ url: targetUrl }))[0]?.id ?? null, url);
}

export function createCheck(results, recordResult = result => result) {
  return (name, pass, detail = '') => {
    results.push(recordResult({ name, pass, detail }));
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  };
}

export async function setupExtensionTest({
  profilePrefix = 'ceb-test-',
  initialUrl = null,
  viewport,
  recordResult,
} = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), profilePrefix));
  const results = [];
  const check = createCheck(results, recordResult);
  let ctx;
  let tornDown = false;

  const teardown = async () => {
    if (tornDown) return;
    tornDown = true;
    try {
      if (ctx) await ctx.close();
    } finally {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  };

  try {
    const launchOptions = {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    };
    if (viewport) launchOptions.viewport = viewport;

    ctx = await chromium.launchPersistentContext(userDataDir, launchOptions);

    let sw = ctx.serviceWorkers()[0];
    if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    const swErrors = [];
    sw.on('console', message => {
      if (message.type() === 'error') swErrors.push(message.text());
    });

    const pageErrors = [];
    let page = null;
    let tabId = null;
    if (initialUrl) {
      page = await ctx.newPage();
      page.on('pageerror', error => pageErrors.push(String(error)));
      await page.goto(initialUrl, { waitUntil: 'load' });
      tabId = await getFirstTabId(sw, initialUrl);
    }

    return {
      ctx,
      sw,
      page,
      tabId,
      pageErrors,
      swErrors,
      results,
      check,
      teardown,
    };
  } catch (error) {
    await teardown().catch(() => {});
    throw error;
  }
}