// Static checks that do not need a browser. These catch the mistakes that otherwise
// only show up as "the extension silently refuses to load".
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const ok = [];

function check(name, fn) {
  try {
    const detail = fn();
    ok.push(detail ? `${name} — ${detail}` : name);
  } catch (e) {
    problems.push(`${name}: ${e.message}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

check('manifest.json parses', () => `v${manifest.version}`);

check('every JS file parses', () => {
  const files = fs.readdirSync(root).filter(f => f.endsWith('.js'));
  files.forEach(f => execFileSync(process.execPath, ['--check', path.join(root, f)]));
  return `${files.length} files`;
});

// Chrome silently rejects the whole manifest past four suggested keys, which presents
// as the service worker never registering.
check('at most 4 commands declare a suggested_key', () => {
  const withKeys = Object.entries(manifest.commands || {})
    .filter(([, c]) => c.suggested_key);
  if (withKeys.length > 4) {
    throw new Error(`${withKeys.length} found (${withKeys.map(([k]) => k).join(', ')}); Chrome allows 4`);
  }
  return `${withKeys.length}/4`;
});

check('every referenced file exists', () => {
  const refs = new Set();
  const walk = (v) => {
    if (typeof v === 'string') {
      if (/\.(js|css|png|html|json)$/.test(v) && !v.startsWith('http')) refs.add(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(manifest);
  const missing = [...refs].filter(r => !fs.existsSync(path.join(root, r)));
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`);
  return `${refs.size} files`;
});

// Each mode in the background script needs an icon pair, or the toolbar icon breaks
// silently when that mode is activated.
check('every mode has both icon sizes', () => {
  const bg = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  const ids = [...bg.matchAll(/\{\s*id:\s*"([a-z]+)"/g)].map(m => m[1]);
  const missing = [];
  ids.forEach(id => {
    ['19x19', '38x38'].forEach(size => {
      const p = path.join(root, 'images', 'icons', size, `icon-${id}.png`);
      if (!fs.existsSync(p)) missing.push(`${size}/icon-${id}.png`);
    });
  });
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`);
  return `${ids.length} modes: ${ids.join(', ')}`;
});

check('manifest version matches package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version !== manifest.version) {
    throw new Error(`package.json ${pkg.version} != manifest ${manifest.version}`);
  }
  return manifest.version;
});

// Two data-loss regressions worth guarding structurally, because reproducing them in a
// browser depends on winning a race and would make the suite flaky.
check('restoreFromStorage merges instead of overwriting state', () => {
  const src = fs.readFileSync(path.join(root, 'page-code.js'), 'utf8');
  const start = src.indexOf('async function restoreFromStorage');
  if (start === -1) throw new Error('restoreFromStorage not found');
  const body = src.slice(start, src.indexOf('\n    }', start));
  // The message listener is registered synchronously but this read is async, so a
  // context-menu action can land mid-flight. Assigning to `state` would discard it.
  if (/\bstate\s*=\s*\{/.test(body)) {
    throw new Error('assigns to state — a racing context-menu action would be lost');
  }
  if (!/mergeInto\(state/.test(body)) throw new Error('does not call mergeInto(state, ...)');
  return 'merges';
});

check('flushChanges omits an unloaded site scope', () => {
  const src = fs.readFileSync(path.join(root, 'page-code.js'), 'utf8');
  const start = src.indexOf('function flushChanges');
  if (start === -1) throw new Error('flushChanges not found');
  const body = src.slice(start, src.indexOf('\n    }', start));
  // The background reads an empty scope as "delete the key", so a frame that never loaded
  // the site scope must not send its empty view of it.
  if (!/siteScopeLoaded/.test(body)) {
    throw new Error('sends site unconditionally — would wipe the origin\u2019s site rules');
  }
  return 'guarded by siteScopeLoaded';
});

ok.forEach(l => console.log(`PASS  ${l}`));
problems.forEach(l => console.error(`FAIL  ${l}`));
console.log(`\n${ok.length}/${ok.length + problems.length} checks passed`);
process.exit(problems.length ? 1 : 0);
