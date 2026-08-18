#!/usr/bin/env node
/**
 * Verify that a release is internally consistent before anything is built or
 * uploaded.
 *
 * This exists because `scripts/build.mjs` *writes* the version it is given into
 * the packaged manifest. That is convenient, but it means a mistyped tag is not
 * an error: tagging v9.9.9 would happily produce a package claiming 9.9.9 while
 * every file in the repository still said 2.3.0, and it would ship. The repo is
 * the source of truth, so the tag has to agree with it rather than override it.
 *
 * Usage:
 *   node scripts/preflight.mjs            # check the repo agrees with itself
 *   node scripts/preflight.mjs 2.3.0      # also require that version
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const problems = [];
const notes = [];

const read = (file) => readFileSync(path.join(root, file), 'utf8');
const readJson = (file) => JSON.parse(read(file));

const requested = process.argv[2]?.replace(/^v/, '') ?? '';
if (requested && !/^\d+\.\d+\.\d+$/.test(requested)) {
  console.error(`Not a semver version: ${process.argv[2]}`);
  process.exit(1);
}

const manifest = readJson('manifest.json').version;
const pkg = readJson('package.json').version;
notes.push(`manifest.json    ${manifest}`);
notes.push(`package.json     ${pkg}`);

if (manifest !== pkg) {
  problems.push(`manifest.json says ${manifest} but package.json says ${pkg}.`);
}

// The version the release is actually about: the tag when given one, otherwise
// whatever the repo currently claims.
const version = requested || manifest;

if (requested) {
  notes.push(`requested        ${requested}`);
  if (requested !== manifest) {
    problems.push(
      `tag v${requested} does not match manifest.json (${manifest}). ` +
        'Bump the version in the repo and commit it before tagging.',
    );
  }
}

if (existsSync(path.join(root, 'CHANGELOG.md'))) {
  const changelog = read('CHANGELOG.md');
  const heading = new RegExp(`^##\\s*\\[?${version.replace(/\./g, '\\.')}\\]?`, 'm');
  if (heading.test(changelog)) {
    notes.push(`CHANGELOG.md     has an entry for ${version}`);
  } else {
    problems.push(`CHANGELOG.md has no "## [${version}]" section. Write the release notes first.`);
  }
}

// A released version must not already exist as a tag, or the release is a
// no-op that silently republishes an older build.
notes.push(`releasing        ${version}`);

console.log('Release preflight\n');
for (const note of notes) console.log(`  ${note}`);

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length > 1 ? 's' : ''}:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('\nConsistent.');
