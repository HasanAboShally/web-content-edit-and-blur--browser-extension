#!/usr/bin/env node
/**
 * Build every store package in one go.
 *
 * Defaults to the version in manifest.json so that the common case cannot
 * introduce a version the repository does not claim.
 *
 * Usage:
 *   npm run build:all
 *   npm run build:all -- 2.4.0
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const version =
  process.argv[2]?.replace(/^v/, '') ??
  JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8')).version;

for (const target of ['chrome', 'firefox', 'edge']) {
  const result = spawnSync('node', [path.join('scripts', 'build.mjs'), target, version], {
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const verify = spawnSync('node', [path.join('scripts', 'verify-packages.mjs'), version], {
  stdio: 'inherit',
});
process.exit(verify.status ?? 1);
