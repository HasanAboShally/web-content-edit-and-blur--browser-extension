// The store APIs answer 200 even when they refuse the release, so the verdict
// lives in the response body. Every bug this suite covers was a *silent* one:
// the script reported success and exited 0 while nothing shipped. Chrome's v2
// API renamed the fields v1 used, which is exactly the kind of drift that never
// shows up until a real release is already half-done.
//
// No browser here — fetch is stubbed and the real CLI runs end to end.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// Replaces fetch before publish.mjs loads, so the script itself is unmodified.
const stub = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ceb-publish-')), 'stub.mjs');
fs.writeFileSync(
  stub,
  `const s = JSON.parse(process.env.CEB_SCENARIO);
globalThis.fetch = async (url) => {
  const body = url.includes('oauth2') ? { access_token: 'stub', expires_in: 3600 }
    : url.includes(':upload') ? s.upload
    : url.includes(':fetchStatus') ? s.status
    : url.includes(':publish') ? s.publish
    : {};
  return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(body ?? {}) };
};\n`,
);

// A real package has to exist or the script stops before reaching the API.
const pkg = path.join(ROOT, 'dist', `content-edit-blur-chrome-${VERSION}.zip`);
if (!fs.existsSync(pkg)) {
  const built = spawnSync(process.execPath, ['scripts/build.mjs', 'chrome', VERSION], { cwd: ROOT });
  if (built.status !== 0) {
    console.log('FAIL  could not build a chrome package to test against');
    process.exit(1);
  }
}

function run(scenario) {
  const result = spawnSync(process.execPath, ['--import', stub, 'scripts/publish.mjs', 'chrome', '--version', VERSION], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      CEB_SCENARIO: JSON.stringify(scenario),
      CHROME_CLIENT_ID: 'stub',
      CHROME_CLIENT_SECRET: 'stub',
      CHROME_REFRESH_TOKEN: 'stub',
      CHROME_EXTENSION_ID: 'stub',
      CHROME_PUBLISHER_ID: 'stub',
    },
  });
  // A timeout means the poll never terminated, which is itself a failure mode.
  const timedOut = result.signal === 'SIGTERM' || result.error?.code === 'ETIMEDOUT';
  return { ok: !timedOut && result.status === 0, timedOut, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

const cases = [
  // v2 spells rejection FAILED; the v1 spelling was FAILURE, and matching the
  // wrong one let a rejected upload through to :publish.
  { name: 'a rejected upload fails the run', accept: false, scenario: { upload: { uploadState: 'FAILED' } } },
  { name: 'a clean upload is submitted', accept: true, scenario: { upload: { uploadState: 'SUCCEEDED' }, publish: { state: 'PENDING_REVIEW' } } },
  { name: 'an already-published item is accepted', accept: true, scenario: { upload: { uploadState: 'SUCCEEDED' }, publish: { state: 'PUBLISHED' } } },
  // :publish answers 200 with the refusal in the body.
  { name: 'a rejected submission fails the run', accept: false, scenario: { upload: { uploadState: 'SUCCEEDED' }, publish: { state: 'REJECTED' } } },
  { name: 'a cancelled submission fails the run', accept: false, scenario: { upload: { uploadState: 'SUCCEEDED' }, publish: { state: 'CANCELLED' } } },
  // v1 returned {status: [...]}, v2 returns {state}. Reading the old shape made
  // every publish look successful.
  { name: 'a v1-shaped publish reply is not trusted', accept: false, scenario: { upload: { uploadState: 'SUCCEEDED' }, publish: { status: ['OK'] } } },
  // fetchStatus reports the upload under lastAsyncUploadState. Polling
  // uploadState there matched nothing, so the loop ran to the full timeout.
  { name: 'an async upload is polled to success', accept: true, scenario: { upload: { uploadState: 'IN_PROGRESS' }, status: { lastAsyncUploadState: 'SUCCEEDED' }, publish: { state: 'PUBLISHED' } } },
  { name: 'an async upload that fails is caught', accept: false, scenario: { upload: { uploadState: 'IN_PROGRESS' }, status: { lastAsyncUploadState: 'FAILED' } } },
  { name: 'a lost async upload is caught', accept: false, scenario: { upload: { uploadState: 'IN_PROGRESS' }, status: { lastAsyncUploadState: 'NOT_FOUND' } } },
  // Refuse to guess: an unknown state must not be assumed good.
  { name: 'an unrecognised upload state fails the run', accept: false, scenario: { upload: { uploadState: 'SUCCESS' }, publish: { state: 'PUBLISHED' } } },
];

for (const c of cases) {
  const r = run(c.scenario);
  check(c.name, r.ok === c.accept, r.timedOut ? 'timed out — the poll never terminated' : '');
}

// Consuming the next token blindly made `--notes --dry-run` set notes to
// "--dry-run" and leave dryRun false, i.e. publish for real.
for (const args of [['chrome', '--notes', '--dry-run'], ['chrome', '--version'], ['chrome', '--version', '--dry-run']]) {
  const r = spawnSync(process.execPath, ['scripts/publish.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });
  const refused = r.status !== 0 && /Missing value for/.test(`${r.stdout}${r.stderr}`);
  check(`\`${args.join(' ')}\` is refused, not silently accepted`, refused);
}

// The likely trigger is an API key pasted into the client ID field, and a
// truncated prefix is not an exact match so Actions log masking would miss it.
const SECRET = 'SUPERSECRET_pasted_into_the_wrong_variable';
const leak = spawnSync(process.execPath, ['scripts/publish.mjs', 'edge', '--dry-run', '--version', VERSION], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, EDGE_PRODUCT_ID: '11111111-1111-1111-1111-111111111111', EDGE_CLIENT_ID: SECRET, EDGE_API_KEY: 'stub' },
});
const leakOut = `${leak.stdout ?? ''}${leak.stderr ?? ''}`;
check('a malformed credential is reported without printing it', !leakOut.includes('SUPERSECRET') && /EDGE_CLIENT_ID/.test(leakOut));

// AMO identifies an add-on by the GUID in its manifest and rejects a mismatch as
// a different add-on. The listing's GUID was auto-assigned by AMO at first
// upload, so it is not guessable and drift here is silent until release day.
const firefoxPkg = path.join(ROOT, 'dist', `content-edit-blur-firefox-${VERSION}.zip`);
if (!fs.existsSync(firefoxPkg)) {
  spawnSync(process.execPath, ['scripts/build.mjs', 'firefox', VERSION], { cwd: ROOT });
}
const firefoxEnv = { FIREFOX_API_KEY: 'user:1:1', FIREFOX_API_SECRET: 'stub' };

const mismatch = spawnSync(process.execPath, ['scripts/publish.mjs', 'firefox', '--dry-run', '--version', VERSION], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, ...firefoxEnv, FIREFOX_ADDON_ID: '{content-edit-blur@hasanaboshally}' },
});
check(
  'a gecko id that disagrees with FIREFOX_ADDON_ID fails before upload',
  mismatch.status !== 0 && /different add-on/.test(`${mismatch.stdout}${mismatch.stderr}`),
);

// A Firefox package built without an id would be unmatchable on AMO. The chrome
// package stands in for one, since it carries no browser_specific_settings.
const chromePkg = path.join(ROOT, 'dist', `content-edit-blur-chrome-${VERSION}.zip`);
const stash = `${firefoxPkg}.stash`;
fs.renameSync(firefoxPkg, stash);
fs.copyFileSync(chromePkg, firefoxPkg);
const noId = spawnSync(process.execPath, ['scripts/publish.mjs', 'firefox', '--dry-run', '--version', VERSION], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, ...firefoxEnv },
});
fs.rmSync(firefoxPkg);
fs.renameSync(stash, firefoxPkg);
check(
  'a Firefox package with no gecko id is refused',
  noId.status !== 0 && /no browser_specific_settings/.test(`${noId.stdout}${noId.stderr}`),
);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
