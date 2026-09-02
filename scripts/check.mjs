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
const PAGE_SCRIPT_FILES = JSON.parse(
  fs.readFileSync(path.join(root, 'page/modules.json'), 'utf8'),
);
const PAGE_STYLE_FILES = JSON.parse(
  fs.readFileSync(path.join(root, 'page/styles.json'), 'utf8'),
);
const TYPECHECK_FILES = ['page/model.js', 'page/geometry.js'];
const pageSources = PAGE_SCRIPT_FILES.map(file => ({
  file,
  source: fs.readFileSync(path.join(root, file), 'utf8'),
}));
const pageSource = pageSources.map(({ source }) => source).join('\n');
const pageStyleSources = PAGE_STYLE_FILES.map(file => ({
  file,
  source: fs.readFileSync(path.join(root, file), 'utf8'),
}));
const CHROMIUM_TEST_SUITES = [
  'core.test.mjs',
  'context-menu.test.mjs',
  'features.test.mjs',
  'annotate.test.mjs',
  'markup.test.mjs',
  'privacy-editing.test.mjs',
  'regression.test.mjs',
];
const STORE_SCREENSHOTS = [
  '01-edit-and-smart-pick.png',
  '02-blur-and-redact.png',
  '03-draw-to-blur.png',
  '04-annotate-and-highlight.png',
  '05-rules-and-site-scope.png',
];

function pngDimensions(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  const signature = '89504e470d0a1a0a';
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== signature) {
    throw new Error(`${file} is not a valid PNG`);
  }
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

check('manifest.json parses', () => `v${manifest.version}`);

check('page module manifest is valid', () => {
  if (!Array.isArray(PAGE_SCRIPT_FILES) || !PAGE_SCRIPT_FILES.length) {
    throw new Error('page/modules.json must be a non-empty array');
  }
  if (new Set(PAGE_SCRIPT_FILES).size !== PAGE_SCRIPT_FILES.length) {
    throw new Error('page/modules.json contains duplicate modules');
  }
  const invalid = PAGE_SCRIPT_FILES.filter(file => !/^page\/[a-z-]+\.js$/.test(file));
  if (invalid.length) throw new Error(`invalid module path(s): ${invalid.join(', ')}`);
  if (PAGE_SCRIPT_FILES[0] !== 'page/model.js') throw new Error('page/model.js must load first');
  if (PAGE_SCRIPT_FILES.at(-1) !== 'page/main.js') throw new Error('page/main.js must load last');
  const dependencyEdges = [
    ['page/geometry.js', 'page/areas.js'],
    ['page/geometry.js', 'page/annotation-rendering.js'],
    ['page/annotation-rendering.js', 'page/annotation-interactions.js'],
    ['page/toolbar-template.js', 'page/toolbar-controller.js'],
    ['page/toolbar-controller.js', 'page/toolbar-state.js'],
  ];
  const reversed = dependencyEdges.filter(([dependency, consumer]) =>
    PAGE_SCRIPT_FILES.indexOf(dependency) > PAGE_SCRIPT_FILES.indexOf(consumer));
  if (reversed.length) {
    throw new Error(`module dependency order reversed: ${reversed.map(edge => edge.join(' before ')).join(', ')}`);
  }
  return `${PAGE_SCRIPT_FILES.length} unique ordered modules`;
});

check('page style manifest is valid', () => {
  if (!Array.isArray(PAGE_STYLE_FILES) || !PAGE_STYLE_FILES.length) {
    throw new Error('page/styles.json must be a non-empty array');
  }
  if (new Set(PAGE_STYLE_FILES).size !== PAGE_STYLE_FILES.length) {
    throw new Error('page/styles.json contains duplicate styles');
  }
  const invalid = PAGE_STYLE_FILES.filter(file => !/^page\/styles\/[a-z-]+\.css$/.test(file));
  if (invalid.length) throw new Error(`invalid style path(s): ${invalid.join(', ')}`);
  if (PAGE_STYLE_FILES.at(-1) !== 'page/styles/toolbar-system.css') {
    throw new Error('page/styles/toolbar-system.css must load last');
  }
  return `${PAGE_STYLE_FILES.length} unique ordered styles`;
});

check('every JS file parses', () => {
  const files = [
    ...fs.readdirSync(root).filter(f => f.endsWith('.js')),
    ...PAGE_SCRIPT_FILES,
  ];
  files.forEach(f => execFileSync(process.execPath, ['--check', path.join(root, f)]));
  return `${files.length} files`;
});

check('page module directory has exactly the ordered script set', () => {
  if (fs.existsSync(path.join(root, 'page-code.js'))) {
    throw new Error('legacy page-code.js must be removed');
  }
  const actual = fs.readdirSync(path.join(root, 'page'))
    .filter(file => file.endsWith('.js'))
    .map(file => `page/${file}`)
    .sort();
  const expected = [...PAGE_SCRIPT_FILES].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected [${expected.join(', ')}], found [${actual.join(', ')}]`);
  }
  return `${actual.length} modules; legacy script absent`;
});

check('page style directory has exactly the ordered style set', () => {
  if (fs.existsSync(path.join(root, 'page-style.css'))) {
    throw new Error('legacy root page-style.css must be removed');
  }
  const actual = fs.readdirSync(path.join(root, 'page/styles'), { withFileTypes: true })
    .map(entry => `page/styles/${entry.name}${entry.isFile() ? '' : '/'}`)
    .sort();
  const expected = [...PAGE_STYLE_FILES].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected [${expected.join(', ')}], found [${actual.join(', ')}]`);
  }
  return `${actual.length} styles; legacy stylesheet absent`;
});

check('page modules stay within the reviewable size target', () => {
  const oversized = pageSources
    .map(({ file, source }) => [file, source.split('\n').length])
    .filter(([, lines]) => lines > 900);
  if (oversized.length) {
    throw new Error(oversized.map(([file, lines]) => `${file} ${lines} lines`).join(', '));
  }
  return 'all <= 900 lines';
});

check('page styles stay within the reviewable size target', () => {
  const oversized = pageStyleSources
    .map(({ file, source }) => [file, source.split('\n').length])
    .filter(([, lines]) => lines >= 900);
  if (oversized.length) {
    throw new Error(oversized.map(([file, lines]) => `${file} ${lines} lines`).join(', '));
  }
  return 'all < 900 lines';
});

check('page styles do not use @import', () => {
  const offenders = pageStyleSources
    .filter(({ source }) => /@import\b/i.test(source))
    .map(({ file }) => file);
  if (offenders.length) throw new Error(`forbidden @import in ${offenders.join(', ')}`);
  return `${PAGE_STYLE_FILES.length} styles checked`;
});

check('background loads the canonical page module manifest', () => {
  const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  if (!/fetch\(chrome\.runtime\.getURL\("page\/modules\.json"\)\)/.test(background)) {
    throw new Error('background does not read page/modules.json');
  }
  if (!/pageScriptFiles\(\)/.test(background)
      || !/executeScript\(\{ target, files: scriptFiles \}\)/.test(background)) {
    throw new Error('page injection does not use the canonical module list');
  }
  return `${PAGE_SCRIPT_FILES.length} scripts; main last`;
});

check('background loads and injects the canonical page style manifest', () => {
  const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  if (!/fetch\(chrome\.runtime\.getURL\("page\/styles\.json"\)\)/.test(background)) {
    throw new Error('background does not read page/styles.json');
  }
  const loaderStart = background.indexOf('let pageStyleFilesPromise;');
  const loaderEnd = background.indexOf('const tabStates', loaderStart);
  const loader = background.slice(loaderStart, loaderEnd);
  if (loaderStart === -1 || loaderEnd === -1
      || !/function pageStyleFiles\(\)/.test(loader)
      || !/new Set\(files\)\.size !== files\.length/.test(loader)
      || !/page\/styles\/toolbar-system\.css/.test(loader)
      || !/return Object\.freeze\(files\)/.test(loader)
      || !/pageStyleFilesPromise = null/.test(loader)) {
    throw new Error('style manifest is not cached and validated like the script manifest');
  }
  if (!/const \[styleFiles, scriptFiles\] = await Promise\.all\(\[\s*pageStyleFiles\(\),\s*pageScriptFiles\(\),?\s*\]\)/.test(background)) {
    throw new Error('page manifests are not both resolved before frame injection');
  }
  const insertions = [...background.matchAll(/chrome\.scripting\.insertCSS\s*\(/g)];
  if (insertions.length !== 1
      || !/insertCSS\(\{ target, files: styleFiles \}\)/.test(background)) {
    throw new Error('page styles are not inserted together from the canonical list');
  }
  const insert = background.indexOf('chrome.scripting.insertCSS');
  const execute = background.indexOf('chrome.scripting.executeScript');
  if (insert === -1 || execute === -1 || insert > execute) {
    throw new Error('page scripts execute before styles are inserted');
  }
  if (background.includes('page-style.css')) {
    throw new Error('background still references legacy page-style.css');
  }
  return `${PAGE_STYLE_FILES.length} styles in one pre-script insertion`;
});

check('only the last page module bootstraps side effects', () => {
  if (PAGE_SCRIPT_FILES.at(-1) !== 'page/main.js') throw new Error('page/main.js is not last');
  const nonMain = pageSources.slice(0, -1);
  const topLevelEffects = [
    /^ {4}(?:window|document|chrome\.(?:runtime|storage))\.[A-Za-z]/m,
    /^ {4}(?:setInterval|setTimeout|requestAnimationFrame|queueMicrotask|addEventListener)\(/m,
    /^ {4}(?:restoreFromStorage|initImageLoader)\(/m,
    /^ {4}new (?:MutationObserver|ResizeObserver|IntersectionObserver)\b/m,
    /^ {4}(?:modeChanged\s*=|\(function)/m,
  ];
  const offenders = nonMain
    .filter(({ source }) => topLevelEffects.some(pattern => pattern.test(source)))
    .map(({ file }) => file);
  if (offenders.length) throw new Error(`top-level side effect in ${offenders.join(', ')}`);
  if (nonMain.some(({ source }) => source.includes('__cebInitialized'))) {
    throw new Error('__cebInitialized is owned by a non-main module');
  }
  const main = pageSources.at(-1).source;
  if (!/function bootstrapPage\(\)/.test(main)
      || !/if \(window\.__cebInitialized\) return;/.test(main)
      || !/window\.__cebInitialized = true;/.test(main)
      || !main.trimEnd().endsWith('bootstrapPage();')) {
    throw new Error('main.js lacks the guarded final bootstrap');
  }
  const runtimeListener = main.indexOf('chrome.runtime.onMessage.addListener(handlePageMessage)');
  const readyMarker = main.indexOf('window.__cebInitialized = true;');
  if (runtimeListener === -1 || readyMarker < runtimeListener
      || !/const listeners = new AbortController\(\)/.test(main)
      || !/delete window\.__cebInitialized;/.test(main)) {
    throw new Error('main.js bootstrap is not transactional');
  }
  if (/ceb-toolbar-styles|style\.textContent\s*=/.test(pageSource)) {
    throw new Error('toolbar CSS still lives in JavaScript');
  }
  return 'guarded bootstrap in main.js';
});

check('background probes and serializes initialization', () => {
  const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  const ensureStart = background.indexOf('async function ensureInitialized');
  const ensureBody = background.slice(ensureStart, background.indexOf('\n}', ensureStart) + 2);
  const probe = ensureBody.indexOf('await probeMode(tabId)');
  const inject = ensureBody.indexOf('await injectPageScripts');
  if (ensureStart === -1 || probe === -1 || inject === -1 || probe > inject) {
    throw new Error('ensureInitialized does not probe before injection');
  }
  if (!/const initializationFlights = new Map\(\)/.test(background)
      || !/serializeInitialization\(`tab:\$\{tabId\}`/.test(ensureBody)) {
    throw new Error('concurrent initialization is not serialized');
  }
  if (!/return typeof res\?\.mode === "string" \? res\.mode : null;/.test(background)) {
    throw new Error('probeMode does not distinguish idle from no receiver');
  }
  return 'probe-first with in-flight deduplication';
});

// A broken build or publish script only shows up at release time otherwise, which
// is the worst moment to discover it.
check('every build script parses', () => {
  const dir = path.join(root, 'scripts');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.mjs'));
  files.forEach(f => execFileSync(process.execPath, ['--check', path.join(dir, f)]));
  return `${files.length} files`;
});

check('every test suite parses', () => {
  const dir = path.join(root, 'tests');
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.mjs'));
  files.forEach(file => execFileSync(process.execPath, ['--check', path.join(dir, file)]));
  return `${files.length} files`;
});

check('workflow actions are pinned to immutable commits', () => {
  const workflowDir = path.join(root, '.github', 'workflows');
  const workflows = fs.readdirSync(workflowDir).filter(file => file.endsWith('.yml'));
  const mutable = [];
  for (const workflow of workflows) {
    const lines = fs.readFileSync(path.join(workflowDir, workflow), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!/\buses:\s*[^.\/\s][^\s]*@/.test(line)) return;
      if (!/@[0-9a-f]{40}\s+#\s+v\d/i.test(line)) mutable.push(`${workflow}:${index + 1}`);
    });
  }
  if (mutable.length) throw new Error(`mutable or undocumented action ref(s): ${mutable.join(', ')}`);
  return `${workflows.length} workflows`;
});

check('Chromium suites use the shared extension harness', () => {
  const directLaunches = [];
  const missingHarness = [];
  for (const file of CHROMIUM_TEST_SUITES) {
    const source = fs.readFileSync(path.join(root, 'tests', file), 'utf8');
    if (/\bchromium\.launchPersistentContext\s*\(/.test(source)) directLaunches.push(file);
    if (!/from ['"]\.\/harness\.mjs['"]/.test(source)
        || !/\bsetupExtensionTest\s*\(/.test(source)) {
      missingHarness.push(file);
    }
  }
  if (directLaunches.length) {
    throw new Error(`direct chromium.launchPersistentContext in ${directLaunches.join(', ')}`);
  }
  if (missingHarness.length) {
    throw new Error(`tests/harness.mjs not used by ${missingHarness.join(', ')}`);
  }
  return `${CHROMIUM_TEST_SUITES.length} suites`;
});

check('package lock matches package metadata', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const rootPackage = lock.packages?.[''];
  if (lock.version !== pkg.version || rootPackage?.version !== pkg.version) {
    throw new Error('package version differs from package-lock.json');
  }
  if (JSON.stringify(rootPackage?.devDependencies || {}) !== JSON.stringify(pkg.devDependencies || {})) {
    throw new Error('devDependencies differ from package-lock.json');
  }
  return `lockfile v${lock.lockfileVersion}`;
});

check('incremental JSDoc typecheck stays strict and scoped', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'jsconfig.typecheck.json'), 'utf8'));
  const options = config.compilerOptions || {};
  if (pkg.scripts?.typecheck !== 'tsc -p jsconfig.typecheck.json') {
    throw new Error('package typecheck script does not use jsconfig.typecheck.json');
  }
  if (!pkg.devDependencies?.typescript) throw new Error('TypeScript devDependency is missing');
  if (!pkg.scripts?.validate?.includes('npm run typecheck')) {
    throw new Error('npm run validate does not enforce the typecheck');
  }
  for (const option of ['allowJs', 'checkJs', 'noEmit', 'strict']) {
    if (options[option] !== true) throw new Error(`${option} must remain true`);
  }
  if (options.moduleDetection !== 'legacy') {
    throw new Error('checked page files must be treated as classic scripts');
  }
  if (!Array.isArray(options.lib) || !options.lib.includes('DOM')
      || JSON.stringify(options.types) !== '[]') {
    throw new Error('typecheck must use browser DOM types without implicit @types packages');
  }
  if (JSON.stringify(config.files) !== JSON.stringify(TYPECHECK_FILES)) {
    throw new Error(`checked files must be exactly [${TYPECHECK_FILES.join(', ')}]`);
  }
  const missing = TYPECHECK_FILES.filter(file => !PAGE_SCRIPT_FILES.includes(file));
  if (missing.length) throw new Error(`checked runtime module missing from page/modules.json: ${missing.join(', ')}`);
  const optedOut = TYPECHECK_FILES.filter(file =>
    fs.readFileSync(path.join(root, file), 'utf8').includes('@ts-nocheck'));
  if (optedOut.length) throw new Error(`@ts-nocheck is forbidden in ${optedOut.join(', ')}`);
  return `${TYPECHECK_FILES.length} runtime modules`;
});

check('contributor docs describe the current architecture', () => {
  const architecture = fs.readFileSync(path.join(root, 'ARCHITECTURE.md'), 'utf8');
  const contributing = fs.readFileSync(path.join(root, 'CONTRIBUTING.md'), 'utf8');
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  const prTemplate = fs.readFileSync(path.join(root, '.github', 'pull_request_template.md'), 'utf8');
  if (!architecture.includes('page/modules.json') || !architecture.includes('page/main.js')) {
    throw new Error('ARCHITECTURE.md does not describe the ordered module program');
  }
  const undocumented = PAGE_SCRIPT_FILES.filter(file => !architecture.includes(`\`${file}\``));
  if (undocumented.length) {
    throw new Error(`ARCHITECTURE.md is missing module(s): ${undocumented.join(', ')}`);
  }
  if (!architecture.includes('page/styles.json')) {
    throw new Error('ARCHITECTURE.md does not describe the ordered style manifest');
  }
  const undocumentedStyles = PAGE_STYLE_FILES.filter(file => !architecture.includes(`\`${file}\``));
  if (undocumentedStyles.length) {
    throw new Error(`ARCHITECTURE.md is missing style(s): ${undocumentedStyles.join(', ')}`);
  }
  if (!contributing.includes('[ARCHITECTURE.md](ARCHITECTURE.md)')) {
    throw new Error('CONTRIBUTING.md does not link to ARCHITECTURE.md');
  }
  if (!contributing.includes('page/styles.json')) {
    throw new Error('CONTRIBUTING.md does not describe the ordered style manifest');
  }
  if (![architecture, contributing, agents, prTemplate]
      .every(source => source.includes('npm run typecheck'))) {
    throw new Error('contributor guidance does not consistently require npm run typecheck');
  }
  if (/page-code\.js|Simple mode|Pro mode/.test(`${contributing}\n${prTemplate}`)) {
    throw new Error('contributor guidance contains retired architecture or UI terminology');
  }
  return 'architecture linked; retired terms absent';
});

check('release media has store-safe dimensions', () => {
  const listing = fs.readFileSync(path.join(root, 'store-assets/listing-copy.md'), 'utf8');
  for (const screenshot of STORE_SCREENSHOTS) {
    const relative = `store-assets/screenshots/${screenshot}`;
    const [width, height] = pngDimensions(relative);
    if (width !== 1280 || height !== 800) {
      throw new Error(`${relative} is ${width}×${height}, expected 1280×800`);
    }
    if (!listing.includes(`screenshots/${screenshot}`)) {
      throw new Error(`${screenshot} is not documented in store listing copy`);
    }
  }
  const [ogWidth, ogHeight] = pngDimensions('docs/og-image.png');
  if (ogWidth !== 1200 || ogHeight !== 630) {
    throw new Error(`docs/og-image.png is ${ogWidth}×${ogHeight}, expected 1200×630`);
  }
  return `${STORE_SCREENSHOTS.length} store images plus social card`;
});

check('manifest description matches shared store copy', () => {
  const listing = fs.readFileSync(path.join(root, 'store-assets/listing-copy.md'), 'utf8');
  const summary = listing.match(/^## Short summary\s+([^\n]+)$/m)?.[1]?.trim();
  if (!summary) throw new Error('store-assets/listing-copy.md has no short summary');
  if (manifest.description !== summary) {
    throw new Error('manifest.json description differs from the shared short summary');
  }
  if (summary.length > 132) throw new Error(`short summary is ${summary.length} characters; Chrome allows 132`);
  return `${summary.length}/132 characters`;
});

check('release-facing copy matches the manifest version', () => {
  const listing = fs.readFileSync(path.join(root, 'store-assets/listing-copy.md'), 'utf8');
  const website = fs.readFileSync(path.join(root, 'docs/index.html'), 'utf8');
  if (!listing.includes(`## Version ${manifest.version} highlights`)) {
    throw new Error(`store listing has no ${manifest.version} highlights section`);
  }
  if (!website.includes(`releases/tag/v${manifest.version}`)
      || !website.includes(`<b>v${manifest.version}</b>`)
      || !website.includes(`og-image.png?v=${manifest.version}`)) {
    throw new Error(`website release announcement or social image is not ${manifest.version}`);
  }
  return `v${manifest.version}`;
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
  const src = pageSource;
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
  const src = pageSource;
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
  const page = pageSource;
  const bg = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  const bodyOf = (src, marker) => {
    const start = src.indexOf(marker);
    if (start === -1) throw new Error(`${marker} not found`);
    return src.slice(start, start + 1200);
  };
  // These two predicates decide the same question in different files: the page model uses
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

check('every post-bootstrap page API operation uses the guarded adapter', () => {
  const src = pageSource;
  // On an invalidated context runtime/storage operations throw *synchronously*, so a trailing
  // .catch() never attaches and the exception escapes. Keep runtime messages and
  // storage access behind callExtensionApi(), which handles both sync throws and
  // async rejections.
  const calls = src.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /chrome\.(?:runtime\.sendMessage|storage\.local\.(?:get|set|remove))\s*\(/.test(line));
  const raw = calls.filter(([, line]) => !/callExtensionApi\(\(\) => chrome\./.test(line));
  if (raw.length) {
    throw new Error(`unguarded Chrome API at line(s) ${raw.map(([n]) => n).join(', ')} — use a guarded adapter`);
  }
  if (!/function callExtensionApi/.test(src)) throw new Error('callExtensionApi adapter missing');
  if (!/function sendToBackground/.test(src)) throw new Error('sendToBackground helper missing');
  if (!/function readStorage/.test(src) || !/function writeStorage/.test(src)) {
    throw new Error('guarded storage helpers missing');
  }
  return `${calls.length} call sites guarded`;
});

check('the Advanced-only annotate tools match the toolbar markup', () => {
  const src = pageSource;
  // Two independent lists decide which tools are Advanced: the constant that resets the
  // active tool when you drop back to Essentials, and the ceb-advanced-only class in the
  // toolbar. If they drift, a tool is either visible in Essentials but reset out from
  // under the user on the next mode switch, or hidden with no way to reach it.
  const declared = (src.match(/const ADVANCED_ANNOTATE_TOOLS = \[([^\]]*)\]/) || [])[1];
  if (declared === undefined) throw new Error('ADVANCED_ANNOTATE_TOOLS missing');
  const fromConst = declared.match(/'([^']+)'/g).map(s => s.slice(1, -1)).sort();
  const fromMarkup = [...src.matchAll(/class="ceb-note-tool ceb-advanced-only" data-note-tool="([^"]+)"/g)]
    .map(m => m[1]).sort();
  if (fromConst.join(',') !== fromMarkup.join(',')) {
    throw new Error(`ADVANCED_ANNOTATE_TOOLS [${fromConst}] != ceb-advanced-only buttons [${fromMarkup}]`);
  }
  return `${fromConst.length} Advanced tool${fromConst.length === 1 ? '' : 's'} in both`;
});

ok.forEach(l => console.log(`PASS  ${l}`));
problems.forEach(l => console.error(`FAIL  ${l}`));
console.log(`\n${ok.length}/${ok.length + problems.length} checks passed`);
process.exit(problems.length ? 1 : 0);
