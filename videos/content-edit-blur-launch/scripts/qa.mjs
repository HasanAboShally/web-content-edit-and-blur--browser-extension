#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frames = [36, 94, 160, 260, 335, 445, 492, 565, 675, 755, 850, 925, 1035, 1100, 1280, 1380];
const qa = path.join(root, 'out', 'qa');
const review = path.join(root, 'analysis');
fs.rmSync(qa, {recursive: true, force: true});
fs.mkdirSync(qa, {recursive: true});
for (const frame of frames) {
  const output = path.join(qa, `f${String(frame).padStart(4, '0')}.png`);
  const result = spawnSync('npx', ['remotion', 'still', 'src/index.ts', 'ContentEditBlurLaunch', output, `--frame=${frame}`], {cwd: root, stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const rows = [];
for (let index = 0; index < frames.length; index += 4) {
  const row = path.join(qa, `row-${index / 4}.jpg`);
  const sources = frames.slice(index, index + 4).map((frame) => path.join(qa, `f${String(frame).padStart(4, '0')}.png`));
  const result = spawnSync('magick', [...sources, '-resize', '480x270!', '-bordercolor', '#17171a', '-border', '8', '+append', row], {stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
  rows.push(row);
}
const montage = spawnSync('magick', [...rows, '-append', path.join(review, 'contact-sheet.jpg')], {stdio: 'inherit'});
if (montage.status !== 0) process.exit(montage.status ?? 1);
rows.forEach((row) => fs.rmSync(row, {force: true}));
console.log(`Created ${path.join(review, 'contact-sheet.jpg')}`);
