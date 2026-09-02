#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import path from 'node:path';
import { FIREFOX_GECKO_ID } from './store-ids.mjs';

const REQUIRED_FILES = [
  'manifest.json',
  'background.js',
  'context-target.js',
];
const REQUIRED_DIRECTORIES = ['page', 'images'];
const REQUIRED_PATHS = [...REQUIRED_FILES, ...REQUIRED_DIRECTORIES];
const TARGETS = new Set(['chrome', 'firefox', 'edge']);

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
const pageModuleManifest = path.join(root, 'page/modules.json');
const pageStyleManifest = path.join(root, 'page/styles.json');

for (const requiredPath of REQUIRED_PATHS) {
  if (!existsSync(path.join(root, requiredPath))) {
    fail(`Required extension path is missing: ${requiredPath}`);
  }
}
if (!existsSync(pageModuleManifest)) fail('Required page module manifest is missing: page/modules.json');
if (!existsSync(pageStyleManifest)) fail('Required page style manifest is missing: page/styles.json');
if (existsSync(path.join(root, 'page-style.css'))) {
  fail('Legacy root stylesheet must be removed: page-style.css');
}

rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
mkdirSync(distDir, { recursive: true });
rmSync(zipPath, { force: true });

const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
manifest.version = version;
const pageModules = JSON.parse(readFileSync(pageModuleManifest, 'utf8'));
const pageStyles = JSON.parse(readFileSync(pageStyleManifest, 'utf8'));
if (!Array.isArray(pageModules) || !pageModules.length
    || pageModules[pageModules.length - 1] !== 'page/main.js') {
  fail('page/modules.json must be a non-empty ordered list ending with page/main.js');
}
if (new Set(pageModules).size !== pageModules.length) {
  fail('page/modules.json must not contain duplicate modules');
}
for (const modulePath of pageModules) {
  if (!/^page\/[a-z-]+\.js$/.test(modulePath)) fail(`Invalid page module path: ${modulePath}`);
  if (!existsSync(path.join(root, modulePath))) fail(`Page module is missing: ${modulePath}`);
}
if (!Array.isArray(pageStyles) || !pageStyles.length
    || pageStyles.at(-1) !== 'page/styles/toolbar-system.css') {
  fail('page/styles.json must be a non-empty ordered list ending with page/styles/toolbar-system.css');
}
if (new Set(pageStyles).size !== pageStyles.length) {
  fail('page/styles.json must not contain duplicate styles');
}
for (const stylePath of pageStyles) {
  if (!/^page\/styles\/[a-z-]+\.css$/.test(stylePath)) fail(`Invalid page style path: ${stylePath}`);
  if (!existsSync(path.join(root, stylePath))) fail(`Page style is missing: ${stylePath}`);
  const source = readFileSync(path.join(root, stylePath), 'utf8');
  const lines = source.split('\n').length;
  if (lines >= 900) fail(`Page style must stay below 900 lines: ${stylePath} has ${lines}`);
  if (/@import\b/i.test(source)) fail(`Page style must not use @import: ${stylePath}`);
}

const actualPageEntries = readdirSync(path.join(root, 'page')).sort();
const expectedPageEntries = [
  'modules.json',
  'styles',
  'styles.json',
  ...pageModules.map(modulePath => path.basename(modulePath)),
].sort();
if (JSON.stringify(actualPageEntries) !== JSON.stringify(expectedPageEntries)) {
  fail(`page/ must contain exactly [${expectedPageEntries.join(', ')}]; found [${actualPageEntries.join(', ')}]`);
}

const actualStyleFiles = readdirSync(path.join(root, 'page/styles'), { withFileTypes: true })
  .map(entry => `page/styles/${entry.name}${entry.isFile() ? '' : '/'}`)
  .sort();
const expectedStyleFiles = [...pageStyles].sort();
if (JSON.stringify(actualStyleFiles) !== JSON.stringify(expectedStyleFiles)) {
  fail(
    `page/styles/ must contain exactly [${expectedStyleFiles.join(', ')}]; `
      + `found [${actualStyleFiles.join(', ')}]`,
  );
}

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
      // The extension stores edits locally and does not transmit user data. Firefox
      // displays this declaration in its install and add-on permission surfaces.
      data_collection_permissions: {
        required: ['none'],
      },
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
for (const directory of REQUIRED_DIRECTORIES) {
  await cp(path.join(root, directory), path.join(stagingDir, directory), {
    recursive: true,
    filter: (source) => !path.basename(source).startsWith('.') && path.basename(source) !== '__MACOSX',
  });
}

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
