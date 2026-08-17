# Contributing

Thanks for taking the time. This is a small, dependency-light project — you should be able
to go from clone to running extension in about a minute.

## Running it locally

There is **no build step**. The repository root *is* the extension.

```bash
git clone https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension.git
cd web-content-edit-and-blur--browser-extension
npm install          # only needed to run the tests
```

**Chrome / Edge** — go to `chrome://extensions`, enable **Developer mode**, click
**Load unpacked**, and select the repository folder.

**Firefox** — go to `about:debugging#/runtime/this-firefox`, click **Load Temporary
Add-on**, and select `manifest.json`.

After editing a file, hit reload on the extension card, then reload any page you are
testing on. Changes to `page-code.js` also need the page reloaded, because the script is
injected per-activation.

## Before you open a PR

Both gates must be green. CI runs both on every PR.

```bash
npm run check    # 11 static checks, ~1s, no browser needed
npm test         # 6 Playwright suites, 143 assertions, a few minutes
```

While developing, run a single suite:

```bash
CEB_ONLY=annotate.test.mjs npm test
```

The tests drive a real headed Chromium with the extension loaded — they are slow but they
catch the things unit tests cannot, like the extension failing to load at all.

### Add a test

Any behaviour change should come with a test. Suites live in `tests/`:

| Suite | Covers |
|---|---|
| `core.test.mjs` | Toolbar, modes, element picker, persistence |
| `context-menu.test.mjs` | Right-click integration |
| `features.test.mjs` | Redact, scope, rules panel, export/import |
| `annotate.test.mjs` | Arrows, shapes, pen, text notes |
| `markup.test.mjs` | Highlighter, step badges, move/resize |
| `regression.test.mjs` | Specific past bugs, so they stay fixed |

Register new suites in the list at the top of `tests/run.mjs`.

`tests/AGENTS.md`-worthy gotchas (viewport size, the first-run modal eating clicks, and
more) are documented in [AGENTS.md](AGENTS.md#test-harness-gotchas). Read that section
before writing browser tests — it will save you an afternoon.

## Code style

- Plain ES2020. No bundler, no framework, no TypeScript. Please keep it that way.
- `page-code.js` is a single large IIFE. **Grep for function names** rather than relying on
  line numbers.
- Mutate `state`, then call `renderState()`. Never hand-patch the DOM — it desynchronises
  from undo history.
- Comment the *why*, not the *what*.

There is deliberately no linter config. Match the surrounding style.

## Commits and PRs

- Imperative mood, one logical change per commit: `Fix text note hit region`.
- If an AI agent co-authored the change, keep the trailer:
  ```
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```
- Describe **what changed and why** in the PR. If it fixes a bug, say what the user saw.
- Update [CHANGELOG.md](CHANGELOG.md) under an `## [Unreleased]` heading for anything
  user-visible.

## Releasing

Maintainers only:

1. Bump the version in **both** `manifest.json` and `package.json` — `npm run check`
   enforces that they match.
2. Move `## [Unreleased]` in `CHANGELOG.md` to the new version number.
3. Tag and push: `git tag v2.4.0 && git push origin v2.4.0`.

The release workflow builds and verifies all three store packages, attaches them to a
GitHub Release, and publishes to the Chrome and Firefox stores. Store credentials are
documented in [PUBLISHING.md](PUBLISHING.md).

## The website

`docs/index.html` is the whole site — one self-contained file, deployed to GitHub Pages by
`.github/workflows/pages.yml`. There is no static site generator.

The workflow copies `images/` into `docs/` at build time, so paths in the HTML are relative
to `docs/` being the site root. To preview locally exactly as it deploys:

```bash
cp -R images docs/images        # gitignored
python3 -m http.server -d docs 8000
```

## Reporting bugs

Open an [issue](https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension/issues)
with your browser and version, the site it happened on if you can share it, and what you
expected instead. For anything security-related, see [SECURITY.md](SECURITY.md) — please
don't open a public issue.
