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

check('both emptiness checks agree on what counts as content', () => {
  const page = fs.readFileSync(path.join(root, 'page-code.js'), 'utf8');
  const bg = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  const bodyOf = (src, marker) => {
    const start = src.indexOf(marker);
    if (start === -1) throw new Error(`${marker} not found`);
    return src.slice(start, src.indexOf('\n}', start) + 2 || undefined).slice(0, 900);
  };
  // These two predicates decide the same question in different files: page-code uses
  // it to skip a write, background uses it to *delete the key*. When a new collection
  // is added to one and not the other, the payload is written by one side and erased
  // by the other. That is exactly how kept annotations were being lost.
  const collections = ['rules', 'areas', 'replacements', 'annotations'];
  const pageBody = bodyOf(page, 'function isEmptyPayload');
  const bgBody = bodyOf(bg, 'function hasChanges');
  const missing = collections.filter(c => !pageBody.includes(c) || !bgBody.includes(c));
  if (missing.length) {
    throw new Error(`isEmptyPayload/hasChanges disagree about: ${missing.join(', ')}`);
  }
  return `${collections.length} collections in both`;
});

check('every background message goes through the guarded helper', () => {
  const src = fs.readFileSync(path.join(root, 'page-code.js'), 'utf8');
  // On an invalidated context sendMessage throws *synchronously*, so a trailing
  // .catch() never attaches and the exception escapes. That is how a screenshot
  // once left the entire UI hidden: its restore was attached via .finally and
  // never ran. sendToBackground() is the single place that swallows it.
  const raw = src.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /chrome\.runtime\.sendMessage\s*\(/.test(line)
      && !/return Promise\.resolve\(chrome\.runtime\.sendMessage/.test(line));
  if (raw.length) {
    throw new Error(`unguarded sendMessage at line(s) ${raw.map(([n]) => n).join(', ')} — use sendToBackground()`);
  }
  if (!/function sendToBackground/.test(src)) throw new Error('sendToBackground helper missing');
  return 'all call sites use sendToBackground()';
});

check('the Pro-only annotate tools match the toolbar markup', () => {
  const src = fs.readFileSync(path.join(root, 'page-code.js'), 'utf8');
  // Two independent lists decide which tools are Pro: the constant that resets the
  // active tool when you drop back to Simple, and the ceb-pro-only class in the
  // toolbar. If they drift, a tool is either visible in Simple but reset out from
  // under the user on the next mode switch, or hidden with no way to reach it.
  const declared = (src.match(/const PRO_ANNOTATE_TOOLS = \[([^\]]*)\]/) || [])[1];
  if (declared === undefined) throw new Error('PRO_ANNOTATE_TOOLS missing');
  const fromConst = declared.match(/'([^']+)'/g).map(s => s.slice(1, -1)).sort();
  const fromMarkup = [...src.matchAll(/class="ceb-note-tool ceb-pro-only" data-note-tool="([^"]+)"/g)]
    .map(m => m[1]).sort();
  if (fromConst.join(',') !== fromMarkup.join(',')) {
    throw new Error(`PRO_ANNOTATE_TOOLS [${fromConst}] != ceb-pro-only buttons [${fromMarkup}]`);
  }
  return `${fromConst.length} Pro tools in both`;
});

ok.forEach(l => console.log(`PASS  ${l}`));
problems.forEach(l => console.error(`FAIL  ${l}`));
console.log(`\n${ok.length}/${ok.length + problems.length} checks passed`);
process.exit(problems.length ? 1 : 0);
