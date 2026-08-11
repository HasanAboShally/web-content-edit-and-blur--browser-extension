#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import path from 'node:path';

const REQUIRED_FILES = [
  'manifest.json',
  'background.js',
  'page-code.js',
  'page-style.css',
  'context-target.js',
];
const REQUIRED_PATHS = [...REQUIRED_FILES, 'images'];
const TARGETS = new Set(['chrome', 'firefox', 'edge']);
const FIREFOX_GECKO_ID = '{content-edit-blur@hasanaboshally}';

function help() {
  return `Usage: node scripts/build.mjs <chrome|firefox|edge> <version>\n\nBuilds a browser-specific extension ZIP in dist/.\nExample: node scripts/build.mjs firefox 2.0.0`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [target, version] = process.argv.slice(2);
if (target === '--help' || target === '-h') {
  console.log(help());
  process.exit(0);
}
if (!TARGETS.has(target) || !version) {
  fail(help());
}
if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) {
  fail(`Invalid extension version: ${version}`);
}

const root = process.cwd();
const distDir = path.join(root, 'dist');
const stagingDir = path.join(distDir, `staging-${target}`);
const zipPath = path.join(distDir, `content-edit-blur-${target}-${version}.zip`);

for (const requiredPath of REQUIRED_PATHS) {
  if (!existsSync(path.join(root, requiredPath))) {
    fail(`Required extension path is missing: ${requiredPath}`);
  }
}

rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
mkdirSync(distDir, { recursive: true });
rmSync(zipPath, { force: true });

const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
manifest.version = version;

if (target === 'firefox') {
  const serviceWorker = manifest.background?.service_worker;
  if (!serviceWorker) {
    fail('manifest.json must define background.service_worker for Firefox transform');
  }
  manifest.background = { scripts: [serviceWorker] };
  manifest.browser_specific_settings = {
    ...(manifest.browser_specific_settings ?? {}),
    gecko: {
      ...(manifest.browser_specific_settings?.gecko ?? {}),
      id: FIREFOX_GECKO_ID,
    },
  };
}

writeFileSync(
  path.join(stagingDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

for (const file of REQUIRED_FILES.filter((file) => file !== 'manifest.json')) {
  await cp(path.join(root, file), path.join(stagingDir, file));
}
await cp(path.join(root, 'images'), path.join(stagingDir, 'images'), {
  recursive: true,
  filter: (source) => !path.basename(source).startsWith('.') && path.basename(source) !== '__MACOSX',
});

const zip = spawnSync('zip', ['-r', '-X', zipPath, ...REQUIRED_PATHS], {
  cwd: stagingDir,
  stdio: 'inherit',
});
if (zip.error) {
  fail(`Unable to run zip: ${zip.error.message}`);
}
if (zip.status !== 0) {
  fail(`zip failed with exit code ${zip.status}`);
}

rmSync(stagingDir, { recursive: true, force: true });
console.log(`Created ${path.relative(root, zipPath)}`);
