#!/usr/bin/env node
/**
 * Verify that the built ZIPs contain exactly what they should.
 *
 * This used to live as thirty lines of bash inside the release workflow, where
 * it could only run on CI and only when a tag was pushed. It catches real
 * mistakes - a stray file, a popup left behind by an old layout, the Firefox
 * manifest transform silently not applying - so it belongs somewhere it can be
 * run locally before tagging.
 *
 * Usage:
 *   node scripts/verify-packages.mjs [version]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { FIREFOX_GECKO_ID } from './store-ids.mjs';

const root = process.cwd();
const version = process.argv[2] ?? JSON.parse(
  spawnSync('node', ['-p', "JSON.stringify(require('./manifest.json'))"], { encoding: 'utf8' }).stdout,
).version;

const TARGETS = ['chrome', 'firefox', 'edge'];
const PAGE_SCRIPT_FILES = JSON.parse(readFileSync(path.join(root, 'page/modules.json'), 'utf8'));
const PAGE_STYLE_FILES = JSON.parse(readFileSync(path.join(root, 'page/styles.json'), 'utf8'));
const ROOT_FILES = ['manifest.json', 'background.js', 'context-target.js'];

function validateOrderedFiles(files, manifestPath, pattern, finalFile) {
  if (!Array.isArray(files) || !files.length) {
    throw new Error(`${manifestPath} must be a non-empty ordered list`);
  }
  if (new Set(files).size !== files.length) {
    throw new Error(`${manifestPath} contains duplicate entries`);
  }
  const invalid = files.filter(file => typeof file !== 'string' || !pattern.test(file));
  if (invalid.length) throw new Error(`${manifestPath} has invalid entries: ${invalid.join(', ')}`);
  if (finalFile && files.at(-1) !== finalFile) {
    throw new Error(`${manifestPath} must end with ${finalFile}`);
  }
}

validateOrderedFiles(PAGE_SCRIPT_FILES, 'page/modules.json', /^page\/[a-z-]+\.js$/, 'page/main.js');
validateOrderedFiles(
  PAGE_STYLE_FILES,
  'page/styles.json',
  /^page\/styles\/[a-z-]+\.css$/,
  'page/styles/toolbar-system.css',
);

function filesUnder(relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === '__MACOSX') return [];
    const relative = `${relativeDirectory}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(relative) : [relative];
  });
}

const REQUIRED = [
  ...ROOT_FILES,
  'page/modules.json',
  'page/styles.json',
  ...PAGE_SCRIPT_FILES,
  ...PAGE_STYLE_FILES,
  ...filesUnder('images'),
].sort();
const REQUIRED_SET = new Set(REQUIRED);

const problems = [];

if (existsSync(path.join(root, 'page-style.css'))) {
  problems.push('source tree still contains the removed root page-style.css');
}

const expectedPageEntries = [
  'modules.json',
  'styles',
  'styles.json',
  ...PAGE_SCRIPT_FILES.map(file => path.basename(file)),
].sort();
const actualPageEntries = readdirSync(path.join(root, 'page')).sort();
if (JSON.stringify(actualPageEntries) !== JSON.stringify(expectedPageEntries)) {
  problems.push(
    `page/ should contain exactly [${expectedPageEntries.join(', ')}], `
      + `found [${actualPageEntries.join(', ')}]`,
  );
}

const expectedStyleEntries = [...PAGE_STYLE_FILES].sort();
const actualStyleEntries = readdirSync(path.join(root, 'page/styles'), { withFileTypes: true })
  .map(entry => `page/styles/${entry.name}${entry.isFile() ? '' : '/'}`)
  .sort();
if (JSON.stringify(actualStyleEntries) !== JSON.stringify(expectedStyleEntries)) {
  problems.push(
    `page/styles/ should contain exactly [${expectedStyleEntries.join(', ')}], `
      + `found [${actualStyleEntries.join(', ')}]`,
  );
}

for (const styleFile of PAGE_STYLE_FILES) {
  const source = readFileSync(path.join(root, styleFile), 'utf8');
  const lines = source.split('\n').length;
  if (lines >= 900) problems.push(`${styleFile} has ${lines} lines; CSS modules must stay below 900`);
  if (/@import\b/i.test(source)) problems.push(`${styleFile} uses forbidden @import`);
}

function unzip(file, flags, members = []) {
  const result = spawnSync('unzip', [...flags, file, ...members], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`unzip failed for ${file}: ${result.stderr}`);
  return result.stdout;
}

for (const target of TARGETS) {
  const rel = `dist/content-edit-blur-${target}-${version}.zip`;
  const file = path.join(root, rel);
  if (!existsSync(file)) {
    problems.push(`${rel} is missing. Run: node scripts/build.mjs ${target} ${version}`);
    continue;
  }

  const entries = unzip(file, ['-Z1']).split('\n').map((s) => s.trim()).filter(Boolean);
  const packagedFiles = entries.filter((entry) => !entry.endsWith('/')).sort();

  for (const required of REQUIRED) {
    if (!packagedFiles.includes(required)) problems.push(`${rel} is missing ${required}`);
  }
  for (const entry of packagedFiles) {
    if (!REQUIRED_SET.has(entry)) problems.push(`${rel} has an unexpected entry: ${entry}`);
  }

  const manifest = JSON.parse(unzip(file, ['-p'], ['manifest.json']));
  if (manifest.version !== version) {
    problems.push(`${rel} declares version ${manifest.version}, expected ${version}`);
  }

  const packagedOrder = JSON.parse(unzip(file, ['-p'], ['page/modules.json']));
  if (JSON.stringify(packagedOrder) !== JSON.stringify(PAGE_SCRIPT_FILES)) {
    problems.push(`${rel} page/modules.json has the wrong files or order`);
  }

  const packagedStyleOrder = JSON.parse(unzip(file, ['-p'], ['page/styles.json']));
  if (JSON.stringify(packagedStyleOrder) !== JSON.stringify(PAGE_STYLE_FILES)) {
    problems.push(`${rel} page/styles.json has the wrong files or order`);
  }

  // The two manifests genuinely differ, and the difference is easy to break
  // without noticing because both still load in their own browser.
  if (target === 'firefox') {
    if (manifest.background?.scripts?.[0] !== 'background.js') {
      problems.push(`${rel} should use background.scripts for Firefox`);
    }
    if (manifest.background?.service_worker) {
      problems.push(`${rel} still has background.service_worker, which Firefox ignores`);
    }
    if (manifest.browser_specific_settings?.gecko?.id !== FIREFOX_GECKO_ID) {
      problems.push(
        `${rel} declares gecko id ${manifest.browser_specific_settings?.gecko?.id ?? '(none)'}, ` +
          `expected ${FIREFOX_GECKO_ID} — AMO would not match it to the listing`,
      );
    }
    const dataCollection = manifest.browser_specific_settings?.gecko?.data_collection_permissions;
    if (JSON.stringify(dataCollection?.required) !== JSON.stringify(['none'])) {
      problems.push(`${rel} must declare gecko.data_collection_permissions.required as ["none"]`);
    }
  } else {
    if (manifest.background?.service_worker !== 'background.js') {
      problems.push(`${rel} should use background.service_worker`);
    }
    if (manifest.background?.scripts) {
      problems.push(`${rel} still has background.scripts, which is Firefox-only`);
    }
  }

  console.log(`  ${rel} — ${packagedFiles.length} files, manifest ${manifest.version}`);
}

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length > 1 ? 's' : ''}:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`\nAll ${TARGETS.length} packages verified.`);
