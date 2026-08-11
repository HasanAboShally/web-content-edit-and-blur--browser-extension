// Serves tests/fixtures on an ephemeral port and runs each suite against it, so the
// tests need no manually started server and cannot collide on a fixed port.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures');

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  const file = path.join(fixtures, rel || 'index.html');
  // Never serve outside the fixture directory.
  if (!file.startsWith(fixtures)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
console.log(`fixtures served at ${base}\n`);

const suites = ['core.test.mjs', 'context-menu.test.mjs', 'features.test.mjs', 'regression.test.mjs'];
// CEB_ONLY=features.test.mjs npm test — run a single suite while developing.
const only = process.env.CEB_ONLY ? [process.env.CEB_ONLY] : suites;
let failed = 0;

for (const suite of only) {
  console.log(`\n──────── ${suite} ────────`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, suite)], {
      stdio: 'inherit',
      env: { ...process.env, CEB_TEST_URL: base },
    });
    child.on('close', resolve);
  });
  if (code !== 0) failed++;
}

server.close();
console.log(failed ? `\n${failed} suite(s) failed` : '\nAll suites passed');
process.exit(failed ? 1 : 0);
