# Contributing

Thanks for taking the time. This is a small, dependency-light project — you should be able
to go from clone to running extension in about a minute.

Before changing runtime behavior, read [ARCHITECTURE.md](ARCHITECTURE.md). It explains the
ordered page modules, state and history invariants, extension lifecycle, and package split.

## Choosing work

- Bug fixes with clear reproduction steps and focused tests are ideal first contributions.
- Use an issue or GitHub Discussion before starting a new mode, permission, dependency,
  storage schema, or broad UI redesign. These choices affect every browser package.
- Keep refactors separate from behavior changes where practical. Small, single-purpose
  pull requests are easier to validate and safer to release across three stores.
- Never include credentials, real private-page content, browser profiles, or generated
  packages in an issue or pull request.

## Running it locally

There is **no build step**. The repository root *is* the extension.
Development and CI use Node.js 20 or newer.

```bash
git clone https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension.git
cd web-content-edit-and-blur--browser-extension
npm install          # development checks and tests only
```

**Chrome / Edge** — go to `chrome://extensions`, enable **Developer mode**, click
**Load unpacked**, and select the repository folder.

**Firefox** — go to `about:debugging#/runtime/this-firefox`, click **Load Temporary
Add-on**, and select `manifest.json`.

After editing a file, hit reload on the extension card, then reload any page you are
testing on. Changes under `page/` also need the page reloaded, because those scripts and
styles are injected per activation.

## Before you open a PR

All three gates must be green. CI runs them on every PR.

```bash
npm run typecheck # strict JSDoc check for the model/geometry subset; emits nothing
npm run check    # fast static checks, no browser needed
npm test         # all suites, a few minutes
```

While developing, run a single suite:

```bash
npm test -- --suite annotate.test.mjs
```

`CEB_ONLY=annotate.test.mjs npm test` remains available for existing automation. Use
`npm run test:core` for the fastest browser smoke test, or `npm run validate` for all
required gates.

Before a release, also run `npm run test:firefox`. It builds the Firefox package, treats
Mozilla lint warnings as errors, and installs the package in a real headless Firefox
runtime. CI runs this as a separate job so ordinary Chromium feedback stays fast.

Maintainers can run the complete local release sequence with `npm run release:check`.
Store credentials are intentionally separate; follow with the documented all-store dry
run in [PUBLISHING.md](PUBLISHING.md).

`npm run test:website` verifies social metadata, the theme toggle, runtime errors and
375px reflow on the GitHub Pages site.

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
| `privacy-editing.test.mjs` | Direct editing of element and Area privacy effects |
| `regression.test.mjs` | Specific past bugs, so they stay fixed |
| `publish.test.mjs` | Store publishing: rejections fail the run (no browser) |
| `oauth-token.test.mjs` | Chrome OAuth helper validation (no browser) |

Register new suites in the list at the top of `tests/run.mjs`.
Chromium suites use `tests/harness.mjs` for extension launch, early error capture and
profile cleanup. Extend that harness instead of copying browser setup into a new suite.

Browser-test gotchas (viewport size, the first-run modal eating clicks, and more) are
documented in [AGENTS.md](AGENTS.md#test-harness-gotchas). Read that section before
writing browser tests — it will save you an afternoon.

### Add a page module

The files under `page/` are classic scripts injected together, not independent ES modules.
To add one safely:

1. Put it under `page/` and add it to `page/modules.json` after every declaration it uses.
2. Keep long-lived listeners, timers and startup calls in `page/main.js` only.
3. Do not use `import` or `export`; there is intentionally no build or transform step.
4. Keep the file focused and below the line ceiling enforced by `npm run check`.
5. If it joins the checked model/geometry subset, keep strict JSDoc clean without
  `@ts-nocheck` and add it to `jsconfig.typecheck.json`.
6. Run `npm run test:core` to catch load-order and duplicate-bootstrap failures quickly.

### Add a page style module

Styles under `page/styles/` are source files loaded directly by the extension. To add one
safely:

1. Put it under `page/styles/` and add its full path to `page/styles.json` at the exact
  point where its rules belong in the cascade.
2. Keep `page/styles/toolbar-system.css` last; it is the authoritative override layer for
  the toolbar.
3. Do not use `@import` or generate an aggregate stylesheet. There is no runtime or build
  concatenation step.
4. Keep the file focused and below the line ceiling enforced by `npm run check`.
5. Run the focused browser suites for every interface the style affects.

## Code style

- Plain ES2020 runtime source. No bundler, framework, or TypeScript source files.
- `npm run typecheck` applies strict, no-emit TypeScript checking only to the JSDoc-typed
  files listed in `jsconfig.typecheck.json`; do not broaden it with an unchecked file.
- Page behavior is split across classic scripts under `page/`. Their order is centralized
  in `page/modules.json`; keep `page/main.js` last and put bootstrap side effects there only.
- Page styling is split across source files under `page/styles/`. Their cascade order is
  centralized only in `page/styles.json`; keep the final toolbar system layer last.
- Mutate `state`, then call `renderState()`. Never hand-patch the DOM — it desynchronises
  from undo history.
- Route page-side runtime and storage calls through the guarded helpers in
  `page/extension-api.js`.
- Keep modules below the reviewability ceiling enforced by `npm run check`. If a module
  approaches that ceiling, split by responsibility rather than compressing the code.
- Comment the *why*, not the *what*.

Use two spaces in service-worker and Node scripts, four spaces in page modules, semicolons,
single quotes in page modules, and double quotes only where that is the established local
style. Avoid drive-by reformatting: keep pull requests focused and easy to review.

## Commits and PRs

- Imperative mood, one logical change per commit: `Fix text note hit region`.
- If an AI agent co-authored the change, keep the trailer:

  ```text
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
3. Check it holds together: `npm run preflight -- v2.4.0`.
4. Tag and push: `git tag v2.4.0 && git push origin v2.4.0`.

The release workflow re-runs all three gates, builds and verifies all three store packages,
attaches them to a GitHub Release, and publishes to all three stores. The tag has to match
the committed version — it cannot introduce one. Store credentials and a dry-run mode are
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

Fonts in `docs/fonts/` are committed on purpose. They are the latin subsets of Instrument
Serif, Instrument Sans and JetBrains Mono (all SIL OFL), ~118 KB total. Linking a font CDN
instead would be smaller to store and worse to ship: the page makes a privacy claim, and it
should be able to make it without any third-party request. Keep it that way.

## Store screenshots

The screenshots in `store-assets/screenshots/` are generated from the fictional,
offline-only dashboard in `store-assets/showcase.html`. After a visible toolbar change,
regenerate all five with:

```bash
npm run screenshots:store
```

`npm run assets:release` also regenerates the website's 1200×630 social sharing image
from `store-assets/og-card.html`.

Review every image at full size before a release. Keep the fixture obviously fictional;
never capture a real account, customer, credential, or private webpage for store media.

## Reporting bugs

Open an [issue](https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension/issues)
with your browser and version, the site it happened on if you can share it, and what you
expected instead. For anything security-related, see [SECURITY.md](SECURITY.md) — please
don't open a public issue.
