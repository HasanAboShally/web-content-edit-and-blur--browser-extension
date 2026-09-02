// Serves tests/fixtures on an ephemeral port and runs each suite against it, so the
// tests need no manually started server and cannot collide on a fixed port.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures');
const suites = ['core.test.mjs', 'context-menu.test.mjs', 'features.test.mjs', 'annotate.test.mjs', 'markup.test.mjs', 'privacy-editing.test.mjs', 'regression.test.mjs', 'publish.test.mjs', 'oauth-token.test.mjs'];

function selectedSuites() {
  const args = process.argv.slice(2);
  if (!args.length) {
    if (!process.env.CEB_ONLY) return suites;
    if (!suites.includes(process.env.CEB_ONLY)) {
      throw new Error(`Unknown CEB_ONLY suite: ${process.env.CEB_ONLY}`);
    }
    return [process.env.CEB_ONLY];
  }
  if (args.length !== 2 || args[0] !== '--suite') {
    throw new Error('Usage: npm test -- --suite <suite.test.mjs>');
  }
  if (!suites.includes(args[1])) {
    throw new Error(`Unknown suite: ${args[1]}. Choose one of: ${suites.join(', ')}`);
  }
  return [args[1]];
}

let only;
try {
  only = selectedSuites();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  const file = path.join(fixtures, rel || 'index.html');
  // Never serve outside the fixture directory.
  const fromFixtures = path.relative(fixtures, file);
  if (fromFixtures.startsWith('..') || path.isAbsolute(fromFixtures)) {
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

// CEB_ONLY remains supported for existing automation. `--suite` is portable across shells.
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
