#!/usr/bin/env node
/**
 * Publish built packages to the Chrome Web Store, Firefox Add-ons and Edge Add-ons.
 *
 * Each store's REST API is called directly. That is deliberate:
 *
 *   - No third-party GitHub Action ever receives the store credentials.
 *   - The Edge API has no maintained action worth depending on, so that half
 *     would have been hand-written regardless.
 *   - The same script runs locally, so a failing release can be debugged
 *     without pushing tags.
 *
 * Node 20+ ships fetch, FormData, Blob and webcrypto, so this needs no
 * dependencies, which keeps the repo's install surface at zero.
 *
 * Usage:
 *   node scripts/publish.mjs <chrome|firefox|edge|all> [options]
 *
 * Options:
 *   --version <x.y.z>  Version to publish. Defaults to the manifest version.
 *   --dry-run          Check credentials, packages and connectivity, then stop
 *                      before anything is uploaded.
 *   --upload-only      Upload the package but do not submit it for review.
 *   --notes <text>     Notes for store reviewers (Edge and Firefox).
 *
 * Every store needs its own credentials in the environment. Run with --dry-run
 * to be told exactly which ones are missing. See PUBLISHING.md.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const STORES = ['chrome', 'firefox', 'edge'];
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const root = process.cwd();

/* ------------------------------------------------------------------ *
 * Small utilities
 * ------------------------------------------------------------------ */

const log = (...args) => console.log(...args);
const step = (store, message) => log(`  [${store}] ${message}`);

class PublishError extends Error {}

function fail(message) {
  throw new PublishError(message);
}

/**
 * Fetch that treats a non-2xx as fatal and surfaces the response body, because
 * every one of these APIs explains the real problem there and nowhere else.
 */
async function request(url, options = {}, { store, what, expect } = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (cause) {
    fail(`${what} failed: could not reach ${new URL(url).host} (${cause.message})`);
  }

  const body = await response.text();
  const ok = expect ? expect.includes(response.status) : response.ok;
  if (!ok) {
    fail(
      `${what} failed: HTTP ${response.status} ${response.statusText}\n` +
        `    ${url}\n` +
        `    ${body.slice(0, 900) || '(empty response body)'}`,
    );
  }

  let json = null;
  if (body) {
    try {
      json = JSON.parse(body);
    } catch {
      json = null;
    }
  }
  return { response, body, json };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll until `check` reports done. Store review pipelines are asynchronous and
 * a silent timeout would be worse than a loud one, so this always ends in a
 * definite answer.
 */
async function pollUntil(check, { store, what, timeoutMs = 10 * 60_000, intervalMs = 5_000 }) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    const result = await check(attempt);
    if (result.done) return result;
    if (attempt === 1 || attempt % 6 === 0) {
      step(store, `${what}: ${result.status ?? 'waiting'}…`);
    }
    await sleep(intervalMs);
  }
  fail(`${what} did not finish within ${Math.round(timeoutMs / 60_000)} minutes`);
}

/** Read required environment variables, reporting all missing ones at once. */
function credentials(store, names) {
  const values = {};
  const missing = [];
  for (const name of names) {
    const value = process.env[name];
    if (!value || !value.trim()) missing.push(name);
    else values[name] = value.trim();
  }
  if (missing.length) {
    fail(
      `missing ${missing.length} credential${missing.length > 1 ? 's' : ''} for ${store}: ` +
        `${missing.join(', ')}\n    See PUBLISHING.md for how to obtain them.`,
    );
  }
  return values;
}

/* ------------------------------------------------------------------ *
 * Package resolution
 * ------------------------------------------------------------------ */

function manifestVersion() {
  return JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8')).version;
}

/**
 * Locate the built package and confirm the manifest inside it matches the
 * version being published, so a stale dist/ can never be shipped silently.
 */
function resolvePackage(store, version) {
  const file = path.join(root, 'dist', `content-edit-blur-${store}-${version}.zip`);
  if (!existsSync(file)) {
    fail(
      `package not found: ${path.relative(root, file)}\n` +
        `    Build it first: node scripts/build.mjs ${store} ${version}`,
    );
  }

  const unzip = spawnSync('unzip', ['-p', file, 'manifest.json'], { encoding: 'utf8' });
  if (unzip.status !== 0) {
    fail(`could not read manifest.json from ${path.relative(root, file)}`);
  }
  let packaged;
  try {
    packaged = JSON.parse(unzip.stdout);
  } catch {
    fail(`manifest.json inside ${path.relative(root, file)} is not valid JSON`);
  }
  if (packaged.version !== version) {
    fail(
      `version mismatch: ${path.relative(root, file)} contains manifest version ` +
        `${packaged.version}, expected ${version}. Rebuild the package.`,
    );
  }

  return { file, bytes: statSync(file).size, manifest: packaged };
}

/* ------------------------------------------------------------------ *
 * Chrome Web Store — API v2
 * https://developer.chrome.com/docs/webstore/using-api
 *
 * v2 superseded v1 in October 2025 and adds the publisher ID to the path.
 * v1 (www.googleapis.com/chromewebstore/v1.1/...) is archived.
 * ------------------------------------------------------------------ */

const CHROME_API = 'https://chromewebstore.googleapis.com';

async function chromeAccessToken({ CHROME_CLIENT_ID, CHROME_CLIENT_SECRET, CHROME_REFRESH_TOKEN }) {
  const { json } = await request(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CHROME_CLIENT_ID,
        client_secret: CHROME_CLIENT_SECRET,
        refresh_token: CHROME_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    },
    { store: 'chrome', what: 'Chrome OAuth token refresh', expect: [200, 400, 401] },
  );

  // Google returns a bare "invalid_grant" for a refresh token that has expired,
  // been revoked, or was issued by a different client. By far the likeliest
  // cause is the 7-day expiry Google applies to external OAuth apps left in
  // "Testing" status, which turns a working release into a broken one a week
  // later with no other warning.
  if (json?.error === 'invalid_grant') {
    fail(
      'Chrome refresh token is no longer valid (invalid_grant).\n' +
        '    Most likely the OAuth consent screen is still in "Testing" status, which\n' +
        '    expires refresh tokens after 7 days. Set it to "In production" (or use an\n' +
        '    Internal user type on Workspace), then mint a new token:\n' +
        '      node scripts/oauth-token.mjs',
    );
  }
  if (json?.error) {
    fail(`Chrome OAuth token refresh failed: ${json.error}${json.error_description ? ` — ${json.error_description}` : ''}`);
  }
  if (!json?.access_token) fail('Chrome OAuth token refresh returned no access_token');
  return json.access_token;
}

async function publishChrome({ version, dryRun, uploadOnly }) {
  const env = credentials('chrome', [
    'CHROME_CLIENT_ID',
    'CHROME_CLIENT_SECRET',
    'CHROME_REFRESH_TOKEN',
    'CHROME_EXTENSION_ID',
    'CHROME_PUBLISHER_ID',
  ]);
  const item = `publishers/${env.CHROME_PUBLISHER_ID}/items/${env.CHROME_EXTENSION_ID}`;
  const pkg = resolvePackage('chrome', version);
  step('chrome', `package ${path.basename(pkg.file)} (${Math.round(pkg.bytes / 1024)} KB)`);

  const token = await chromeAccessToken(env);
  const auth = { Authorization: `Bearer ${token}` };
  step('chrome', 'credentials accepted');

  if (dryRun) {
    // fetchStatus is read-only, so it proves the credentials reach this item
    // without touching the listing.
    const { json } = await request(
      `${CHROME_API}/v2/${item}:fetchStatus`,
      { method: 'GET', headers: auth },
      { store: 'chrome', what: 'Chrome fetchStatus' },
    );
    step('chrome', `item reachable (${json?.itemId ?? env.CHROME_EXTENSION_ID})`);
    // Worth surfacing: a taken-down item cannot be published, and finding that
    // out from a dry run beats finding out mid-release.
    if (json?.takenDown) step('chrome', 'WARNING: item is taken down for a policy violation');
    if (json?.warned) step('chrome', 'WARNING: item has a policy warning');
    return { store: 'chrome', status: 'dry-run ok' };
  }

  const { json: upload, body: uploadBody } = await request(
    `${CHROME_API}/upload/v2/${item}:upload`,
    {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/zip' },
      body: await readFile(pkg.file),
    },
    { store: 'chrome', what: 'Chrome upload' },
  );

  // v2 enum: UPLOAD_STATE_UNSPECIFIED | SUCCEEDED | IN_PROGRESS | FAILED | NOT_FOUND.
  // These are not the v1 spellings (SUCCESS/FAILURE), and getting them wrong is
  // silent: a rejected upload would sail through to :publish.
  if (upload?.uploadState === 'FAILED') {
    fail(`Chrome upload rejected: ${uploadBody.slice(0, 900)}`);
  }
  if (upload?.uploadState === 'IN_PROGRESS') {
    await pollUntil(
      async () => {
        const { json, body } = await request(
          `${CHROME_API}/v2/${item}:fetchStatus`,
          { method: 'GET', headers: auth },
          { store: 'chrome', what: 'Chrome fetchStatus' },
        );
        // fetchStatus reports the async upload under a different key than the
        // upload response itself.
        const state = json?.lastAsyncUploadState;
        if (state === 'FAILED') fail(`Chrome upload rejected: ${body.slice(0, 900)}`);
        if (state === 'NOT_FOUND') fail('Chrome lost track of the upload (lastAsyncUploadState=NOT_FOUND)');
        return { done: state === 'SUCCEEDED', status: state };
      },
      { store: 'chrome', what: 'Chrome upload processing' },
    );
  } else if (upload?.uploadState !== 'SUCCEEDED') {
    // Refuse to guess at an unrecognised state rather than publish on a hunch.
    fail(`Chrome upload returned an unexpected uploadState: ${uploadBody.slice(0, 900)}`);
  }
  step('chrome', 'uploaded');

  if (uploadOnly) return { store: 'chrome', status: 'uploaded (not submitted)' };

  const { json: published, body: publishBody } = await request(
    `${CHROME_API}/v2/${item}:publish`,
    { method: 'POST', headers: auth },
    { store: 'chrome', what: 'Chrome publish' },
  );

  // :publish answers 200 even when the submission is refused, so the ItemState
  // in the body is the real result.
  const ACCEPTED = new Set(['PENDING_REVIEW', 'STAGED', 'PUBLISHED', 'PUBLISHED_TO_TESTERS']);
  const state = published?.state;
  if (!ACCEPTED.has(state)) {
    fail(`Chrome publish was not accepted (state=${state ?? 'missing'}): ${publishBody.slice(0, 900)}`);
  }
  for (const warning of published?.warningInfo?.warnings ?? []) {
    step('chrome', `warning: ${warning.message ?? JSON.stringify(warning)}`);
  }
  step('chrome', `submitted (${state})`);
  return { store: 'chrome', status: `submitted (${state})` };
}

/* ------------------------------------------------------------------ *
 * Edge Add-ons — Update REST API v1.1
 * https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api
 *
 * v1 (access tokens) stopped being supported on 31 Dec 2024. v1.1 uses an
 * API key plus client ID, and every mutation is asynchronous: the response is
 * a 202 whose Location header carries the operation ID to poll.
 * ------------------------------------------------------------------ */

const EDGE_API = 'https://api.addons.microsoftedge.microsoft.com';

function edgeOperationId(response, what) {
  const location = response.headers.get('location');
  if (!location) fail(`${what} returned no Location header, so there is no operation to poll`);
  return location.split('/').filter(Boolean).pop();
}

async function publishEdge({ version, dryRun, uploadOnly, notes }) {
  const env = credentials('edge', ['EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_API_KEY']);

  // Partner Center rejects malformed ids at header validation with a 400 before
  // it ever checks the key, so catch that here where the message can name the
  // offending variable instead of surfacing an opaque server error.
  // Report the shape, never the content: this fires exactly when a variable
  // holds something unexpected, and the likeliest cause is the API key pasted
  // into the wrong slot. A truncated prefix is not an exact secret match, so
  // Actions log masking would not catch it.
  for (const name of ['EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID']) {
    if (!GUID_PATTERN.test(env[name])) {
      fail(`${name} must be a GUID (got ${env[name].length} characters).`);
    }
  }

  const base = `${EDGE_API}/v1/products/${env.EDGE_PRODUCT_ID}`;
  const auth = {
    Authorization: `ApiKey ${env.EDGE_API_KEY}`,
    'X-ClientID': env.EDGE_CLIENT_ID,
  };
  const pkg = resolvePackage('edge', version);
  step('edge', `package ${path.basename(pkg.file)} (${Math.round(pkg.bytes / 1024)} KB)`);

  if (dryRun) {
    // There is no read-only endpoint, so probe a deliberately absent operation.
    // Valid credentials answer 404 because the operation does not exist; bad
    // ones answer 401/403. Nothing is modified either way.
    //
    // Treat anything other than a clean "not found" as failure. An earlier
    // version passed on any non-401/403 status, which meant a 400 from request
    // validation was reported as success - a dry run that cannot fail is worse
    // than no dry run at all.
    const probe = await fetch(
      `${base}/submissions/draft/package/operations/${randomUUID()}`,
      { method: 'GET', headers: auth },
    ).catch((cause) => fail(`Edge credential probe could not reach ${EDGE_API} (${cause.message})`));

    if (probe.status === 401 || probe.status === 403) {
      fail(`Edge credentials rejected (HTTP ${probe.status}). Check EDGE_API_KEY and EDGE_CLIENT_ID.`);
    }
    if (probe.status >= 400 && probe.status !== 404) {
      fail(
        `Edge credential probe failed: HTTP ${probe.status} ${probe.statusText}\n` +
          `    ${(await probe.text()).slice(0, 500)}`,
      );
    }
    step('edge', 'credentials accepted');
    return { store: 'edge', status: 'dry-run ok' };
  }

  const { response: uploadResponse } = await request(
    `${base}/submissions/draft/package`,
    {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/zip' },
      body: await readFile(pkg.file),
    },
    { store: 'edge', what: 'Edge package upload', expect: [202] },
  );

  const uploadOperation = edgeOperationId(uploadResponse, 'Edge package upload');
  await pollUntil(
    async () => {
      const { json } = await request(
        `${base}/submissions/draft/package/operations/${uploadOperation}`,
        { method: 'GET', headers: auth },
        { store: 'edge', what: 'Edge upload status' },
      );
      if (json?.status === 'Failed') {
        fail(`Edge upload rejected: ${json.message ?? ''} ${JSON.stringify(json.errors ?? [])}`);
      }
      return { done: json?.status === 'Succeeded', status: json?.status };
    },
    { store: 'edge', what: 'Edge upload processing' },
  );
  step('edge', 'uploaded');

  if (uploadOnly) return { store: 'edge', status: 'uploaded (not submitted)' };

  const { response: publishResponse } = await request(
    `${base}/submissions`,
    {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notes || `Release ${version}` }),
    },
    { store: 'edge', what: 'Edge publish', expect: [202] },
  );

  const publishOperation = edgeOperationId(publishResponse, 'Edge publish');
  await pollUntil(
    async () => {
      const { json } = await request(
        `${base}/submissions/operations/${publishOperation}`,
        { method: 'GET', headers: auth },
        { store: 'edge', what: 'Edge publish status' },
      );
      if (json?.status === 'Failed') {
        fail(`Edge publish rejected: ${json.message ?? ''} ${JSON.stringify(json.errors ?? [])}`);
      }
      return { done: json?.status === 'Succeeded', status: json?.status };
    },
    { store: 'edge', what: 'Edge publish' },
  );
  step('edge', 'submitted for review');
  return { store: 'edge', status: 'submitted for review' };
}

/* ------------------------------------------------------------------ *
 * Firefox Add-ons (AMO)
 * Filled in from the API research; see publishFirefox below.
 * ------------------------------------------------------------------ */

const AMO_API = 'https://addons.mozilla.org/api/v5';

/**
 * AMO authenticates with a short-lived HS256 JWT rather than a bearer token.
 * The spec caps `exp` at five minutes past `iat`, so this is minted per call.
 */
function amoToken(key, secret) {
  const b64 = (input) =>
    Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(
    JSON.stringify({ iss: key, jti: randomUUID(), iat: issuedAt, exp: issuedAt + 240 }),
  );
  const signature = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${payload}.${signature}`;
}

async function publishFirefox({ version, dryRun, uploadOnly, notes }) {
  const env = credentials('firefox', ['FIREFOX_API_KEY', 'FIREFOX_API_SECRET']);
  const pkg = resolvePackage('firefox', version);
  step('firefox', `package ${path.basename(pkg.file)} (${Math.round(pkg.bytes / 1024)} KB)`);

  // AMO identifies an add-on by the GUID in its manifest, and rejects an upload
  // whose id does not match the add-on being updated. Taking the id from the
  // package itself means the two can never disagree; FIREFOX_ADDON_ID is only
  // needed to override that, and then it has to agree.
  const geckoId = pkg.manifest?.browser_specific_settings?.gecko?.id;
  if (!geckoId) {
    fail('Firefox package has no browser_specific_settings.gecko.id — AMO cannot match it to the listing.');
  }
  const override = process.env.FIREFOX_ADDON_ID?.trim();
  if (override && override !== geckoId) {
    fail(
      `Firefox package declares gecko id ${geckoId}, but FIREFOX_ADDON_ID is set to a different value. ` +
        'AMO would treat this as a different add-on and reject the upload. ' +
        'Fix FIREFOX_GECKO_ID in scripts/build.mjs or clear the secret.',
    );
  }

  const authHeader = () => ({ Authorization: `JWT ${amoToken(env.FIREFOX_API_KEY, env.FIREFOX_API_SECRET)}` });
  const addon = encodeURIComponent(geckoId);

  if (dryRun) {
    // Check the account endpoint, not the add-on endpoint: add-on detail is
    // public for listed add-ons, so it would answer 200 even with invalid
    // credentials and give a false pass. /accounts/profile/ requires the JWT.
    const { json: profile } = await request(
      `${AMO_API}/accounts/profile/`,
      { method: 'GET', headers: authHeader() },
      { store: 'firefox', what: 'AMO credential check' },
    );
    step('firefox', `credentials accepted (account ${profile?.username ?? profile?.id ?? 'unknown'})`);

    const { json: addonInfo } = await request(
      `${AMO_API}/addons/addon/${addon}/`,
      { method: 'GET', headers: authHeader() },
      { store: 'firefox', what: 'AMO add-on lookup' },
    );
    step('firefox', `add-on reachable (${addonInfo?.slug ?? geckoId})`);
    return { store: 'firefox', status: 'dry-run ok' };
  }

  // Step 1 — upload the archive and let AMO validate it.
  const form = new FormData();
  form.set('upload', new Blob([await readFile(pkg.file)], { type: 'application/zip' }), path.basename(pkg.file));
  form.set('channel', 'listed');

  const { json: upload } = await request(
    `${AMO_API}/addons/upload/`,
    { method: 'POST', headers: authHeader(), body: form },
    { store: 'firefox', what: 'AMO upload', expect: [200, 201, 202] },
  );
  if (!upload?.uuid) fail('AMO upload returned no uuid');
  step('firefox', 'uploaded, waiting for validation');

  // Step 2 — validation is asynchronous and is the usual place a release dies.
  const validated = await pollUntil(
    async () => {
      const { json } = await request(
        `${AMO_API}/addons/upload/${upload.uuid}/`,
        { method: 'GET', headers: authHeader() },
        { store: 'firefox', what: 'AMO validation status' },
      );
      return { done: Boolean(json?.processed), status: json?.processed ? 'processed' : 'validating', json };
    },
    { store: 'firefox', what: 'AMO validation' },
  );

  if (!validated.json?.valid) {
    const messages = (validated.json?.validation?.messages ?? [])
      .filter((m) => m.type === 'error')
      .map((m) => {
        const where = [m.file, m.line].filter(Boolean).join(':');
        const id = Array.isArray(m.id) ? m.id.join('/') : m.id;
        return `      - ${id ? `[${id}] ` : ''}${m.message}${where ? ` (${where})` : ''}`;
      })
      .join('\n');
    fail(`AMO rejected the package during validation:\n${messages || JSON.stringify(validated.json?.validation)}`);
  }
  step('firefox', 'validation passed');

  if (uploadOnly) return { store: 'firefox', status: 'uploaded (not submitted)' };

  // Step 3 — attach the validated upload to the add-on as a new version.
  // A 409 means this version already exists on AMO, which is the usual result
  // of re-running a release, so name it rather than dumping the raw body.
  const versionBody = { upload: upload.uuid };
  if (notes) versionBody.approval_notes = notes;

  const response = await fetch(`${AMO_API}/addons/addon/${addon}/versions/`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(versionBody),
  }).catch((cause) => fail(`AMO version create could not reach addons.mozilla.org (${cause.message})`));

  if (response.status === 409) {
    fail(`AMO already has version ${version} for this add-on. Bump the version in manifest.json.`);
  }
  if (!response.ok) {
    fail(
      `AMO version create failed: HTTP ${response.status} ${response.statusText}\n` +
        `    ${(await response.text()).slice(0, 900)}`,
    );
  }
  step('firefox', 'submitted for review');
  return { store: 'firefox', status: 'submitted for review' };
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

const PUBLISHERS = { chrome: publishChrome, firefox: publishFirefox, edge: publishEdge };

function usage() {
  return [
    'Usage: node scripts/publish.mjs <chrome|firefox|edge|all> [options]',
    '',
    'Options:',
    '  --version <x.y.z>  Version to publish (default: manifest.json version)',
    '  --dry-run          Verify credentials and packages, then stop',
    '  --upload-only      Upload without submitting for review',
    '  --notes <text>     Reviewer notes (Edge and Firefox)',
    '',
    'Example:',
    '  node scripts/publish.mjs all --dry-run',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { stores: [], dryRun: false, uploadOnly: false, notes: '', version: '' };
  let error = null;

  // Take the value after a flag only if it is really a value. Consuming the next
  // token blindly means `--notes --dry-run` swallows the safety flag and
  // publishes for real, which is the most expensive possible parsing bug here.
  const valueFor = (flag, i) => {
    const value = argv[i];
    if (value === undefined || value.startsWith('-')) {
      error ??= `Missing value for ${flag}`;
      return null;
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--upload-only') options.uploadOnly = true;
    else if (arg === '--version') options.version = valueFor(arg, ++i) ?? '';
    else if (arg === '--notes') options.notes = valueFor(arg, ++i) ?? '';
    else if (arg.startsWith('-')) return { error: `Unknown option: ${arg}` };
    else if (arg === 'all') options.stores.push(...STORES);
    else if (STORES.includes(arg)) options.stores.push(arg);
    else return { error: `Unknown store: ${arg}` };
  }

  if (error) return { error };
  options.stores = [...new Set(options.stores)];
  if (!options.stores.length) return { error: 'No store specified.' };
  if (options.version && !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(options.version)) {
    return { error: `Invalid version: ${options.version}` };
  }
  return { options };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    log(usage());
    return 0;
  }
  if (parsed.error) {
    console.error(`${parsed.error}\n\n${usage()}`);
    return 1;
  }

  const { stores, dryRun, uploadOnly, notes } = parsed.options;
  const version = parsed.options.version || manifestVersion();

  log(
    `${dryRun ? 'Dry run' : uploadOnly ? 'Uploading' : 'Publishing'} v${version} ` +
      `to ${stores.join(', ')}\n`,
  );

  const results = [];
  for (const store of stores) {
    log(`${store}:`);
    try {
      results.push({ ...(await PUBLISHERS[store]({ version, dryRun, uploadOnly, notes })), ok: true });
    } catch (error) {
      if (!(error instanceof PublishError)) throw error;
      console.error(`  [${store}] ${error.message}`);
      results.push({ store, status: error.message.split('\n')[0], ok: false });
    }
    log('');
  }

  const failed = results.filter((r) => !r.ok);
  log('Summary');
  for (const result of results) {
    log(`  ${result.ok ? 'OK  ' : 'FAIL'}  ${result.store.padEnd(8)} ${result.status}`);
  }

  if (failed.length) {
    console.error(`\n${failed.length} of ${results.length} store(s) failed.`);
    return 1;
  }
  log(`\nAll ${results.length} store(s) succeeded.`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
