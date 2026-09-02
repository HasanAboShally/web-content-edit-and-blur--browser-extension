#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { firefox } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version;
const packagePath = path.join(root, 'dist', `content-edit-blur-firefox-${version}.zip`);
const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceb-firefox-smoke-'));
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function confirmsInstall(output) {
  // Normalize terminal formatting before looking for the confirmation.
  const normalized = stripVTControlCharacters(output).replace(/\s+/g, ' ');
  return /\bInstalled\b.*\btemporary add-on\b/.test(normalized);
}

function stopProcessTree(child, signal) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function fail(message, output = '') {
  if (output.trim()) console.error(output.trim());
  throw new Error(message);
}

function firefoxBinary() {
  const configured = process.env.FIREFOX_BINARY;
  if (configured) return configured;
  const bundled = firefox.executablePath();
  if (bundled && fs.existsSync(bundled)) return bundled;
  const locator = process.platform === 'win32' ? 'where' : 'which';
  for (const command of ['firefox', 'firefox-esr']) {
    const probe = spawnSync(locator, [command], { encoding: 'utf8' });
    const found = probe.status === 0 ? String(probe.stdout).trim().split(/\r?\n/)[0] : '';
    if (found) return found;
  }
  fail('Firefox is unavailable. Run: npx playwright install firefox');
}

function run(command, args, message) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) fail(message, `${result.stdout}\n${result.stderr}`);
}

try {
  run(process.execPath, ['scripts/build.mjs', 'firefox', version], 'Firefox package build failed');
  if (process.platform === 'win32') {
    run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force',
      packagePath, sourceDir,
    ], 'Could not unpack the Firefox package');
  } else {
    run('unzip', ['-q', packagePath, '-d', sourceDir], 'Could not unpack the Firefox package');
  }
  run(npx, [
    '--yes', 'web-ext@10.6.0', 'lint',
    '--source-dir', sourceDir,
    '--warnings-as-errors',
    '--no-config-discovery',
  ], 'Firefox package lint failed');
  console.log('PASS  Mozilla lint: 0 errors, 0 warnings, 0 notices');

  const output = await new Promise((resolve, reject) => {
    const child = spawn(npx, [
      '--yes',
      'web-ext@10.6.0',
      'run',
      '--source-dir', sourceDir,
      '--target', 'firefox-desktop',
      '--firefox', firefoxBinary(),
      '--args=-headless',
      '--no-reload',
      '--no-input',
      '--no-config-discovery',
      '--start-url', 'about:blank',
    ], {
      cwd: root,
      detached: process.platform !== 'win32',
      env: { ...process.env, NO_COLOR: '1' },
    });

    let combined = '';
    let installed = false;
    let finishing = false;
    let settled = false;
    let shutdownTimeout;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(shutdownTimeout);
      callback(value);
    };
    const append = chunk => {
      const text = String(chunk);
      combined += text;
      process.stdout.write(text);
      if (!installed && confirmsInstall(combined)) {
        installed = true;
        finishing = true;
        setTimeout(() => {
          stopProcessTree(child, 'SIGTERM');
          shutdownTimeout = setTimeout(() => {
            stopProcessTree(child, 'SIGKILL');
            settle(resolve, combined);
          }, 5_000);
        }, 750);
      }
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);

    const timeout = setTimeout(() => {
      finishing = true;
      stopProcessTree(child, 'SIGKILL');
      settle(reject, new Error(`Firefox did not install the add-on within 60 seconds\n${combined}`));
    }, 60_000);

    child.on('error', error => {
      settle(reject, error);
    });
    child.on('close', code => {
      if (installed && finishing) settle(resolve, combined);
      else settle(reject, new Error(`Firefox smoke test exited ${code ?? 'before startup'}\n${combined}`));
    });
  });

  if (!confirmsInstall(output)) fail('Firefox did not confirm temporary add-on installation', output);
  console.log(`\nPASS  Firefox installed Content Edit & Blur ${version}`);
} finally {
  fs.rmSync(sourceDir, { recursive: true, force: true });
}
