#!/usr/bin/env node
/**
 * Mint a Chrome Web Store refresh token and store the Chrome publishing
 * secrets in GitHub, without any credential being printed, logged, or pasted
 * through a third party.
 *
 * Google's own instructions route you through the OAuth Playground, which
 * means copying a client secret into a web page you don't control and then
 * copying a refresh token back out through your clipboard and shell history.
 * This does the same exchange against a throwaway server on localhost: the
 * only thing that leaves this process is a `gh secret set` write.
 *
 *   node scripts/oauth-token.mjs
 *
 * Flags:
 *   --print       show the values instead of writing them to GitHub
 *   --no-browser  print the URL instead of opening it (headless / over SSH)
 *   --port <n>    listen on a different port (must match the registered URI)
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import process from 'node:process';
import readline from 'node:readline';

const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const DEFAULT_PORT = 8976;

const bold = (s) => `\u001b[1m${s}\u001b[0m`;
const dim = (s) => `\u001b[2m${s}\u001b[0m`;
const orange = (s) => `\u001b[38;5;202m${s}\u001b[0m`;
const green = (s) => `\u001b[32m${s}\u001b[0m`;

function fail(message) {
  console.error(`\n\u001b[31m✗\u001b[0m ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { print: false, port: DEFAULT_PORT, browser: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--print') args.print = true;
    else if (arg === '--no-browser') args.browser = false;
    else if (arg === '--port') {
      const value = argv[i + 1];
      if (!value || value.startsWith('-')) fail('--port requires a port number');
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        fail(`--port must be an integer between 1024 and 65535, got "${value}"`);
      }
      args.port = port;
      i += 1;
    } else fail(`Unknown argument "${arg}"`);
  }
  return args;
}

/** Read a line from the terminal without echoing it. */
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('This script needs an interactive terminal to read credentials safely.'));
      return;
    }
    process.stdout.write(question);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Swallow the echo of everything typed after the prompt itself.
    const onKeypress = (chunk, key) => {
      if (key && (key.name === 'return' || key.name === 'enter')) return;
      readline.moveCursor(process.stdout, -1000, 0);
      readline.clearLine(process.stdout, 1);
      process.stdout.write(question);
    };
    process.stdin.on('keypress', onKeypress);

    rl.question('', (answer) => {
      process.stdin.off('keypress', onKeypress);
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

/**
 * Prefer an already-set environment variable, otherwise prompt without echo.
 * The env path exists so a failed run can be retried, and so this works over a
 * connection with no usable TTY.
 */
async function readCredential(envName, question) {
  const fromEnv = process.env[envName];
  if (fromEnv) {
    console.log(`${question}${dim(`(from $${envName})`)}`);
    return fromEnv.trim();
  }
  return promptHidden(question);
}

function openBrowser(url) {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    // Detached so closing this process later doesn't take the browser with it.
    const child = spawn(command, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** The page Google redirects back to. Matches the project's landing page. */
function resultPage({ ok, heading, detail }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ok ? 'Authorised' : 'Authorisation failed'} — Content Edit &amp; Blur</title>
<style>
  :root { color-scheme: dark }
  * { box-sizing: border-box }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#0a0a0b;
         color:#ece9e2; font:16px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif;
         padding:2rem; text-align:center }
  .card { max-width:30rem }
  .mark { width:2.5rem; height:2.5rem; border-radius:.75rem; margin:0 auto 1.75rem;
          background:${ok ? '#ff5c16' : '#7f1d1d'}; display:grid; place-items:center;
          color:${ok ? '#17171a' : '#ece9e2'}; font-size:1.25rem; font-weight:700 }
  h1 { font:600 1.6rem/1.25 ui-serif,Georgia,serif; margin:0 0 .75rem; letter-spacing:-.02em }
  p { margin:0; color:#a8a29a }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.85em;
         background:#17171a; padding:.15em .4em; border-radius:.3em; color:#ece9e2 }
</style></head>
<body><div class="card">
  <div class="mark">${ok ? '✓' : '!'}</div>
  <h1>${heading}</h1>
  <p>${detail}</p>
</div></body></html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const redirectUri = `http://localhost:${args.port}`;

  console.log(`\n${bold('Chrome Web Store — mint a refresh token')}\n`);
  console.log(`Before starting, in ${orange('console.cloud.google.com')}:`);
  console.log(`  1. APIs & Services → Library → enable ${bold('Chrome Web Store API')}`);
  console.log(`  2. Credentials → Create credentials → ${bold('OAuth client ID')} → ${bold('Web application')}`);
  console.log(`  3. Authorised redirect URIs → add exactly ${bold(redirectUri)}`);
  console.log(
    `  4. OAuth consent screen → publishing status ${bold('In production')}\n` +
      `     ${dim('Leaving it in "Testing" expires the refresh token after 7 days,')}\n` +
      `     ${dim('which breaks releases a week later with no other warning.')}\n`,
  );

  if (!args.print) {
    const ghCheck = spawn('gh', ['auth', 'status'], { stdio: 'ignore' });
    const [code] = await once(ghCheck, 'close');
    if (code !== 0) {
      fail('`gh` is not authenticated. Run `gh auth login`, or re-run with --print to handle the values yourself.');
    }
  }

  const clientId = await readCredential('CHROME_CLIENT_ID', 'Client ID:     ');
  if (!clientId) fail('Client ID is required');
  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    fail('That does not look like a Google OAuth client ID (it should end in .apps.googleusercontent.com)');
  }
  const clientSecret = await readCredential('CHROME_CLIENT_SECRET', 'Client secret: ');
  if (!clientSecret) fail('Client secret is required');

  const state = randomBytes(16).toString('hex');
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    // offline + consent together are what guarantee a refresh token comes back;
    // without prompt=consent Google returns only an access token on re-auth.
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString();

  const server = createServer((req, res) => {
    const url = new URL(req.url, redirectUri);
    if (url.pathname !== '/') {
      res.writeHead(404).end();
      return;
    }

    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');

    const finish = (page, outcome) => {
      res.writeHead(outcome.ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page);
      // Let the response flush before tearing the listener down.
      setTimeout(() => server.close(), 250);
      settle(outcome);
    };

    if (error) {
      finish(
        resultPage({ ok: false, heading: 'Authorisation declined', detail: `Google returned <code>${error}</code>. Nothing was saved.` }),
        { ok: false, reason: `Google returned "${error}"` },
      );
      return;
    }
    if (returnedState !== state) {
      finish(
        resultPage({ ok: false, heading: 'State mismatch', detail: 'The response did not come from the request this script started. Nothing was saved.' }),
        { ok: false, reason: 'state parameter did not match — possible cross-site request' },
      );
      return;
    }
    if (!code) {
      finish(
        resultPage({ ok: false, heading: 'No authorisation code', detail: 'Google redirected back without a code. Nothing was saved.' }),
        { ok: false, reason: 'no authorisation code in the redirect' },
      );
      return;
    }

    finish(
      resultPage({ ok: true, heading: 'Authorised', detail: 'You can close this tab and return to your terminal.' }),
      { ok: true, code },
    );
  });

  let settle;
  const received = new Promise((resolve) => {
    settle = resolve;
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      fail(`Port ${args.port} is already in use. Free it, or pass --port <n> and register that URI instead.`);
    }
    fail(`Local callback server failed: ${err.message}`);
  });

  // Bind before announcing. listen() is asynchronous, so printing the URL or
  // launching a browser first invites a connection the socket cannot yet accept.
  server.listen(args.port, '127.0.0.1');
  await once(server, 'listening');

  console.log(`\nListening on ${bold(redirectUri)} — waiting for Google…`);
  if (!args.browser || !openBrowser(authUrl.href)) {
    console.log('\nOpen this URL to authorise:\n');
    console.log(`  ${authUrl.href}\n`);
  }
  console.log(
    dim('\n  An "unverified app" warning is expected for a private app —\n') +
      dim('  choose Advanced → Continue.\n'),
  );

  const result = await received;
  if (!result.ok) fail(`Authorisation failed: ${result.reason}`);

  console.log('Exchanging the authorisation code…');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: result.code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.refresh_token) {
    const reason = payload?.error_description || payload?.error || `HTTP ${response.status}`;
    if (payload?.error === 'redirect_uri_mismatch') {
      fail(`Token exchange failed: the redirect URI is not registered.\n    Add exactly ${redirectUri} to the OAuth client's authorised redirect URIs.`);
    }
    if (!payload?.refresh_token && response.ok) {
      fail('Google returned an access token but no refresh token.\n    This happens when the app was already authorised; revoke access at\n    myaccount.google.com/permissions and run this again.');
    }
    fail(`Token exchange failed: ${reason}`);
  }

  if (args.print) {
    console.log(`\n${bold('Set these as repository secrets:')}\n`);
    console.log(`  CHROME_CLIENT_ID=${clientId}`);
    console.log(`  CHROME_CLIENT_SECRET=${clientSecret}`);
    console.log(`  CHROME_REFRESH_TOKEN=${payload.refresh_token}\n`);
    console.log(dim('  These are now in your terminal scrollback. Clear it when done.\n'));
    return;
  }

  const secrets = {
    CHROME_CLIENT_ID: clientId,
    CHROME_CLIENT_SECRET: clientSecret,
    CHROME_REFRESH_TOKEN: payload.refresh_token,
  };

  console.log('');
  for (const [name, value] of Object.entries(secrets)) {
    const child = spawn('gh', ['secret', 'set', name], { stdio: ['pipe', 'inherit', 'inherit'] });
    child.stdin.end(value);
    const [code] = await once(child, 'close');
    if (code !== 0) fail(`Failed to set ${name}. Re-run with --print to set it manually.`);
    console.log(`  ${green('✓')} ${name}`);
  }

  console.log(`\n${green('Done.')} Verify without publishing:\n`);
  console.log(`  ${bold('npm run build:all && node scripts/publish.mjs chrome --dry-run')}\n`);
}

main().catch((error) => fail(error.message));
