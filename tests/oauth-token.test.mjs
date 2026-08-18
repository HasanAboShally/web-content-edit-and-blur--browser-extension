// The OAuth helper holds a client secret and mints a refresh token that grants
// permanent publish rights to an extension with thousands of users. The failure
// that would hurt is not a crash — it is accepting a callback that did not come
// from the request this process started, or reporting success when Google
// actually refused. Both are covered here.
//
// No browser and no network: fetch is stubbed and the callback is driven with
// a plain HTTP request, so the real CLI runs end to end.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ceb-oauth-'));

// Replaces fetch before the script loads, so the script itself is unmodified.
const stub = path.join(tmp, 'stub.mjs');
fs.writeFileSync(
  stub,
  `const s = JSON.parse(process.env.CEB_TOKEN_RESPONSE);
globalThis.fetch = async () => ({
  ok: s.status < 400,
  status: s.status,
  json: async () => s.body,
});\n`,
);

// A fake \`gh\` on PATH, so the real "write the secret" path runs without
// touching the repository's actual secrets. It records what it was given.
const binDir = path.join(tmp, 'bin');
fs.mkdirSync(binDir);
const ghLog = path.join(tmp, 'gh.log');
fs.writeFileSync(
  path.join(binDir, 'gh'),
  `#!/bin/sh
if [ "$1" = "auth" ]; then exit 0; fi
if [ "$1" = "secret" ] && [ "$2" = "set" ]; then
  read -r value
  printf '%s=%s\\n' "$3" "$value" >> ${JSON.stringify(ghLog)}
  exit 0
fi
exit 1\n`,
  { mode: 0o755 },
);

const CLIENT_ID = 'stub-client.apps.googleusercontent.com';

/** Ask the OS for a free port rather than hoping a hardcoded one is idle. */
const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

/**
 * Run the helper, wait for it to print its authorisation URL, then drive the
 * localhost callback exactly as a browser would.
 */
function run({ port, tokenResponse, callback, args = [], clientId = CLIENT_ID }) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--import', stub, 'scripts/oauth-token.mjs', '--no-browser', '--port', String(port), ...args],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          CEB_TOKEN_RESPONSE: JSON.stringify(tokenResponse ?? { status: 200, body: {} }),
          CHROME_CLIENT_ID: clientId,
          CHROME_CLIENT_SECRET: 'stub-secret',
        },
      },
    );

    let out = '';
    let fired = false;
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    const onData = async (chunk) => {
      out += chunk;
      if (fired) return;
      const match = out.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?\S+/);
      if (!match) return;
      fired = true;
      const state = new URL(match[0]).searchParams.get('state');
      const query = callback(state);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/?${query}`);
        out += `\n[[callback ${res.status}]]\n${await res.text()}`;
      } catch (err) {
        out += `\n[[callback failed: ${err.message}]]`;
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => {
      out += chunk;
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, authUrl: (out.match(/https:\/\/accounts\.google\.com\S+/) || [''])[0] });
    });
  });
}

const readGhLog = () => (fs.existsSync(ghLog) ? fs.readFileSync(ghLog, 'utf8') : '');

// ── 1. Happy path ──────────────────────────────────────────────────────────
{
  const r = await run({
    port: await freePort(),
    tokenResponse: { status: 200, body: { access_token: 'a', refresh_token: 'REFRESH-VALUE' } },
    callback: (state) => `code=auth-code&state=${state}`,
  });
  check('valid callback exits 0', r.code === 0, `exit ${r.code}`);

  const log = readGhLog();
  check('writes all three Chrome secrets', /CHROME_CLIENT_ID=/.test(log) && /CHROME_CLIENT_SECRET=/.test(log) && /CHROME_REFRESH_TOKEN=/.test(log));
  check('stores the refresh token Google returned', log.includes('CHROME_REFRESH_TOKEN=REFRESH-VALUE'));
  check('never prints the refresh token', !r.out.includes('REFRESH-VALUE'));

  const url = new URL(r.authUrl);
  check(
    'requests offline access with forced consent',
    url.searchParams.get('access_type') === 'offline' && url.searchParams.get('prompt') === 'consent',
    'without both, Google returns no refresh token',
  );
  check('requests only the chromewebstore scope', url.searchParams.get('scope') === 'https://www.googleapis.com/auth/chromewebstore');
  check('sends a state parameter', (url.searchParams.get('state') || '').length >= 32);
}

// ── 2. The security check ──────────────────────────────────────────────────
{
  fs.rmSync(ghLog, { force: true });
  const r = await run({
    port: await freePort(),
    tokenResponse: { status: 200, body: { access_token: 'a', refresh_token: 'SHOULD-NOT-BE-STORED' } },
    callback: () => 'code=attacker-code&state=wrong-state',
  });
  check('rejects a callback with a mismatched state', r.code === 1, `exit ${r.code}`);
  check('says why the state was rejected', /state parameter did not match/.test(r.out));
  check('stores nothing after a state mismatch', !readGhLog().includes('SHOULD-NOT-BE-STORED'));
}

// ── 3. Google refuses ──────────────────────────────────────────────────────
{
  fs.rmSync(ghLog, { force: true });
  const r = await run({ port: await freePort(), callback: (state) => `error=access_denied&state=${state}` });
  check('fails when the user declines consent', r.code === 1 && /access_denied/.test(r.out), `exit ${r.code}`);
  check('stores nothing when consent is declined', readGhLog() === '');
}

{
  const r = await run({ port: await freePort(), callback: (state) => `state=${state}` });
  check('fails when the redirect carries no code', r.code === 1 && /code/i.test(r.out), `exit ${r.code}`);
}

// ── 4. Token exchange failures get actionable messages ─────────────────────
{
  const port = await freePort();
  const r = await run({
    port,
    tokenResponse: { status: 400, body: { error: 'redirect_uri_mismatch' } },
    callback: (state) => `code=auth-code&state=${state}`,
  });
  check(
    'redirect_uri_mismatch names the exact URI to register',
    r.code === 1 && r.out.includes(`http://localhost:${port}`),
    'the default message alone does not say which URI',
  );
}

{
  const r = await run({
    port: await freePort(),
    tokenResponse: { status: 200, body: { access_token: 'only-an-access-token' } },
    callback: (state) => `code=auth-code&state=${state}`,
  });
  check(
    'explains a missing refresh token instead of storing a blank',
    r.code === 1 && /revoke|already authoris/i.test(r.out),
    `exit ${r.code}`,
  );
}

// ── 5. Input validation ────────────────────────────────────────────────────
{
  const r = await run({ port: await freePort(), clientId: 'not-a-google-client', callback: (s) => `code=x&state=${s}` });
  check('rejects a client ID that is not a Google OAuth client', r.code === 1 && /googleusercontent/.test(r.out), `exit ${r.code}`);
}

fs.rmSync(tmp, { recursive: true, force: true });

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
process.exit(failed.length ? 1 : 0);
