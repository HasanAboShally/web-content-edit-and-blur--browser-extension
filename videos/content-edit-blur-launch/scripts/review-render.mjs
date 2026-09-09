#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = path.join(root, 'out/content-edit-blur-launch.mp4');
const outputDir = path.join(root, 'out/review');
const frames = [36, 94, 160, 260, 335, 445, 492, 565, 675, 755, 850, 925, 1035, 1100, 1280, 1380];
fs.rmSync(outputDir, {recursive: true, force: true});
fs.mkdirSync(outputDir, {recursive: true});
for (const frame of frames) {
  const output = path.join(outputDir, `f${String(frame).padStart(4, '0')}.jpg`);
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(frame / 30), '-i', input, '-frames:v', '1', '-q:v', '2', output], {stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const contactSheet = path.join(root, 'analysis/render-contact-sheet.jpg');
const rows = [];
for (let index = 0; index < frames.length; index += 4) {
  const row = path.join(outputDir, `row-${index / 4}.jpg`);
  const sources = frames.slice(index, index + 4).map(frame => path.join(outputDir, `f${String(frame).padStart(4, '0')}.jpg`));
  const result = spawnSync('magick', [...sources, '-resize', '480x270!', '-bordercolor', '#17171a', '-border', '8', '+append', row], {stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
  rows.push(row);
}
const montage = spawnSync('magick', [...rows, '-append', contactSheet], {stdio: 'inherit'});
if (montage.status !== 0) process.exit(montage.status ?? 1);
rows.forEach((row) => fs.rmSync(row, {force: true}));
console.log(`Created ${contactSheet}`);
