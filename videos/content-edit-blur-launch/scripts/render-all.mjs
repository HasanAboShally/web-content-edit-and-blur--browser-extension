#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(root, '../..');
const renders = [
  ['out/content-edit-blur-launch.mp4', []],
  ['out/content-edit-blur-launch-no-bgm.mp4', ['--props=props-no-bgm.json']],
];
fs.mkdirSync(path.join(root, 'out'), {recursive: true});
for (const [output, extra] of renders) {
  const result = spawnSync('npx', ['remotion', 'render', 'src/index.ts', 'ContentEditBlurLaunch', output, '--codec=h264', '--crf=18', '--pixel-format=yuv420p', ...extra], {cwd: root, stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const [source, target] of [
  ['out/content-edit-blur-launch.mp4', 'store-assets/video/content-edit-blur-launch.mp4'],
  ['out/content-edit-blur-launch-no-bgm.mp4', 'store-assets/video/content-edit-blur-launch-no-bgm.mp4'],
]) {
  fs.copyFileSync(path.join(root, source), path.join(repoRoot, target));
  console.log(`Copied ${target}`);
}
