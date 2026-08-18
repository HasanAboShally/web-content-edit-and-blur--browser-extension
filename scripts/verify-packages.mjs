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
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { FIREFOX_GECKO_ID } from './store-ids.mjs';

const root = process.cwd();
const version = process.argv[2] ?? JSON.parse(
  spawnSync('node', ['-p', "JSON.stringify(require('./manifest.json'))"], { encoding: 'utf8' }).stdout,
).version;

const TARGETS = ['chrome', 'firefox', 'edge'];
const REQUIRED = ['manifest.json', 'background.js', 'page-code.js', 'page-style.css', 'context-target.js'];
const ALLOWED = new RegExp(`^(?:${REQUIRED.join('|').replace(/\./g, '\\.')}|images/.*)$`);
const FORBIDDEN = /(?:^|\/)(?:popup\.html|popup\.css|popup\.js)$/;

const problems = [];

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

  for (const required of REQUIRED) {
    if (!entries.includes(required)) problems.push(`${rel} is missing ${required}`);
  }
  if (!entries.some((e) => e.startsWith('images/'))) {
    problems.push(`${rel} contains no images/`);
  }
  for (const entry of entries) {
    if (FORBIDDEN.test(entry)) problems.push(`${rel} contains a removed popup file: ${entry}`);
    else if (!ALLOWED.test(entry) && !entry.endsWith('/')) problems.push(`${rel} has an unexpected entry: ${entry}`);
  }

  const manifest = JSON.parse(unzip(file, ['-p'], ['manifest.json']));
  if (manifest.version !== version) {
    problems.push(`${rel} declares version ${manifest.version}, expected ${version}`);
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
  } else {
    if (manifest.background?.service_worker !== 'background.js') {
      problems.push(`${rel} should use background.service_worker`);
    }
    if (manifest.background?.scripts) {
      problems.push(`${rel} still has background.scripts, which is Firefox-only`);
    }
  }

  console.log(`  ${rel} — ${entries.length} entries, manifest ${manifest.version}`);
}

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length > 1 ? 's' : ''}:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`\nAll ${TARGETS.length} packages verified.`);
