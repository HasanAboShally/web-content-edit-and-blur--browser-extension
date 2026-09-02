#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, label) {
  console.log(`\n━━ ${label} ━━`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(npm, ['run', 'assets:release'], 'Generate release media');
run(npm, ['run', 'validate'], 'Run type, static and browser gates');
run(npm, ['run', 'test:website'], 'Validate the website and social metadata');
run(npm, ['run', 'test:firefox'], 'Validate the Firefox package and runtime');
run(npm, ['run', 'build:all', '--', version], 'Build final packages and checksums');
run(process.execPath, ['scripts/preflight.mjs', `v${version}`], 'Verify release metadata');

console.log(`\nRelease ${version} is locally ready. Store credential dry-run is still required.`);
