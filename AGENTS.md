# AGENTS.md

Guidance for AI agents (and humans) working in this repo. Read this before editing.

## What this is

A Manifest V3 browser extension for Chrome, Firefox and Edge. **No build step, framework
or TypeScript runtime source** — plain ES2020 ships exactly as written. Do not introduce a
bundler or runtime dependency without a strong reason. `playwright` drives browser tests;
`typescript` performs strict, no-emit JSDoc checks on a deliberately small source subset.

| Path | Role |
|---|---|
| `page/*.js` | UI and editing engine. Injected together in `page/modules.json` order; each stays below the reviewability ceiling. |
| `page/main.js` | Idempotent bootstrap and page event dispatch. Must load last. |
| `page/styles/*.css` | Page effects and extension UI. Injected together in `page/styles.json` order; each stays below the reviewability ceiling. |
| `background.js` | Service worker: storage, context menus, commands, screenshots and page injection. |
| `context-target.js` | Runs on every page. Remembers the last right-clicked element. Nothing else. |
| `scripts/check.mjs` | Fast cross-file and package-invariant checks; no browser. |
| `scripts/build.mjs` | `node scripts/build.mjs <chrome\|firefox\|edge> <version>` → `dist/*.zip`. |
| `scripts/publish.mjs` | Uploads to all three stores via their REST APIs. `--dry-run` verifies credentials without publishing. |
| `scripts/preflight.mjs` | Tag, `manifest.json`, `package.json` and `CHANGELOG.md` must agree before a release. |
| `scripts/verify-packages.mjs` | Asserts the built ZIPs contain exactly the expected files and the right manifest per browser. |
| `tests/` | Browser suites plus publishing and OAuth suites that stub external APIs. |
| `store-assets/` | Source icon, shared listing copy and store screenshots. Not packaged with the extension. |

## Golden rules

1. **The scripts under `page/` are one ordered classic-script program.** Their top-level
  declarations share an isolated-world lexical scope. Keep `page/modules.json`
  authoritative, keep `page/main.js` last, and put long-lived bootstrap side effects
  there only. **Always `grep` for the function name**, never navigate by a remembered
  line number.
2. **The styles under `page/styles/` are one ordered cascade.** Keep `page/styles.json`
  as the sole ordering authority and `page/styles/toolbar-system.css` last. Runtime loads
  the listed files directly; do not add `@import`, concatenation or generated CSS.
3. **Run all gates before claiming done:** `npm run typecheck`, `npm run check` and
  `npm test`. CI runs all three.
4. **State is the source of truth; the DOM is derived.** Mutate `state`, then call
   `renderState()`, which wipes and re-applies everything. This is what makes undo/redo,
   cross-tab sync and reload-restore work for free. Never hand-patch the DOM as a
   shortcut — it will desynchronise from history.

## Commands

```bash
npm run typecheck                      # strict no-emit JSDoc check of model + geometry
npm run check                          # fast static checks, no browser
npm test                               # all 9 suites (several minutes)
npm test -- --suite markup.test.mjs    # one suite, portable across shells
npm run validate                       # all required gates
npm run test:firefox                   # strict lint + real Firefox package install
npm run build:all                      # all three ZIPs, then verify their contents
npm run screenshots:store             # regenerate five reproducible store screenshots
npm run assets:release                 # store screenshots + website social card
npm run release:check                  # media, all gates, Firefox, packages, preflight
node scripts/build.mjs chrome 2.4.0    # → dist/content-edit-blur-chrome-2.4.0.zip
node scripts/publish.mjs all --dry-run # check store credentials, upload nothing
```

## Store release discipline

- Store metadata is not published by `scripts/publish.mjs`. Update the Chrome,
  Firefox and Edge listing drafts before tagging; `store-assets/` is the shared
  source of truth for copy and media.
- A Chrome package that adds permissions creates new required Privacy fields only
  after upload. If `:publish` fails, complete those fields and submit the existing
  uploaded draft; do not re-upload the version or create a replacement tag.
- Edge's Publish API submits the current Partner Center draft. Complete Store
  listings and Privacy first, and never click dashboard Publish in parallel with
  the API release.
- A workflow run stays red after a manual store recovery. Verify current state in
  the store dashboard instead of treating the historical conclusion as live state.
- Do not hammer `gh run view` in polling loops. One watcher is enough; repeated
  requests can trigger GitHub's secondary Actions API throttle.

## The static checks, and why they exist

`scripts/check.mjs` guards **cross-file drift** — the class of bug where two files each
look correct in isolation but disagree. Every one was added after such a bug shipped:

- manifest parses; every JS file parses; every build script in `scripts/` parses; every
  referenced file exists; every mode has both icon sizes; manifest version matches
  `package.json`.
- `page/modules.json` contains the exact page script set, has no duplicates, keeps
  `page/main.js` last, and every module stays below 900 lines. Non-main modules may not
  install long-lived listeners, timers or observers at top level.
- `jsconfig.typecheck.json` keeps strict JSDoc checking limited to `page/model.js` and
  `page/geometry.js`, treats them as classic scripts, emits nothing, and forbids
  `@ts-nocheck`. Expand that list only with a cleanly annotated runtime file.
- `page/styles.json` contains the exact CSS module set and preserves cascade order.
  Every style stays below 900 lines, `@import` is forbidden, the legacy root stylesheet
  stays absent, and the background injects the canonical list before page scripts.
- `package-lock.json` agrees with package metadata, and public contributor guidance links
  the architecture without using retired file names or UI terminology.
- **At most 4 commands declare a `suggested_key`.** Chrome silently rejects *the entire
  manifest* past four — the extension simply fails to load with no useful error.
- `restoreFromStorage` merges rather than overwrites state.
- `flushChanges` omits an unloaded site scope.
- **Both emptiness checks agree.** `background.js`'s `hasChanges()` and `page/model.js`'s
  `isEmptyPayload` are independent predicates over the same collections. When annotations
  were added, `hasChanges()` didn't know about them, so a page whose only content was a
  kept annotation was judged empty and its storage key was **deleted**.
- **Every post-bootstrap page-side runtime/storage operation goes through
  `callExtensionApi()`.** Runtime messages use `sendToBackground()` and storage uses
  `readStorage()` / `writeStorage()`. These operations can throw *synchronously* when the
  extension context is invalidated. Listener registration happens once in `page/main.js`
  during guarded bootstrap.
- The `ADVANCED_ANNOTATE_TOOLS` constant matches the `ceb-advanced-only` toolbar buttons.

**Adding a check?** Verify it by deliberately breaking the thing it guards and confirming
it fails, then restore. A check that has never gone red proves nothing.

## Test harness gotchas

These cost real debugging time. Ignore them and you will chase ghosts.

- **The extension only loads in a headed browser.** CI uses `xvfb-run`.
- **Viewport is 1280×720.** Coordinates beyond it silently do nothing. The toolbar occupies
  roughly `x > 1024` — clicks there hit the toolbar, not the page.
- **The first-run "Quick start" modal (`#ceb-panel`) renders dead-centre** and eats clicks
  near the middle of the viewport. After activating a mode, dismiss it:
  `document.getElementById('ceb-panel')?.remove()`. A real returning user never sees it.
  Re-dismiss after *every* re-entry into a mode.
- **Navigate with `waitUntil: 'load'`, not `'commit'`.** `'commit'` fires before
  `document_start` scripts are installed.
- **`chrome.runtime` is unreachable from `page.evaluate`** — the page is the main world,
  the extension is the isolated world.
- **Storage fixtures need `v: 2`** or they are discarded as a stale schema.
- **Target marks by `id`, never "the first arrow".** Drag operations reorder the array.
- Undo is driven in tests via `document.querySelector('#ceb-btn-undo')?.click()`.
- **A scratch diagnostic suite must live in `tests/`, not `/tmp`** — `playwright` won't
  resolve from outside the repo. Delete it when done.
- `.ceb-tb-row` is a CSS grid, so tool and swatch rows need an explicit `display: flex`.

## Debugging discipline that has paid off

When a test fails, check whether the **magnitude of the failure matches the action**. A
560px jump from an 80px drag is not a bad assertion — it is a second bug. Three separate
real bugs were found this way. Probe the behaviour in isolation first; if the fix works
there, the suite has surfaced something else. When "undo did nothing", instrumenting the
real suite showed undo removing one mark *and simultaneously restoring another* — a state
/ history divergence invisible from a bare count assertion.

**Do not adjust an assertion to make it pass until you understand why it failed.**

## Architecture notes worth knowing

- **History** snapshots the whole state. Every mutation ends in `commit()`. An action that
  commits a snapshot identical to the previous one silently eats the user's next undo.
- **Persistence is split from history on purpose.** History holds *every* annotation so
  undo works on session-only ones; storage receives only those with `persist: true`.
- **Empty text notes are dangerous.** A text note enters `state.annotations` the moment it
  is placed, before a character is typed. Any commit while an editor is open bakes an
  invisible empty note into the snapshot. Filtered in both `commit()` and `serializeScope()`.
- **Annotations use raw document coordinates**, so page reflow shifts them.
  Element-anchored offsets are a known unimplemented improvement.
- **Rendering order matters.** `renderAnnotation` appends to `document.body`, but
  `annotationAt` walks `state.annotations` in reverse to decide what is topmost. If a
  refresh re-appends, what is painted on top and what can be grabbed disagree.
- Sandboxed frames (`about:blank`, `srcdoc`) have no real origin, so their rules are
  session-only rather than written to a bucket every site can see.

## Conventions

- Comment only what needs clarification — the *why*, not the *what*.
- Update `CHANGELOG.md` and bump both `manifest.json` and `package.json` together (a static
  check enforces the pair).
- Commit messages: imperative mood, one logical change. Include:

  ```text
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```

- Don't commit `dist/` (gitignored) or test scratch files.
