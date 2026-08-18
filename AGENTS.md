# AGENTS.md

Guidance for AI agents (and humans) working in this repo. Read this before editing.

## What this is

A Manifest V3 browser extension for Chrome, Firefox and Edge. **No build step, no
framework, no TypeScript** — plain ES2020 that ships exactly as written. Do not introduce
a bundler or a dependency without a strong reason; `playwright` is the only devDependency
and it exists purely for tests.

| File | Lines | Role |
|---|---|---|
| `page-code.js` | ~3,800 | The entire UI and editing engine. Injected on demand. |
| `background.js` | ~450 | Service worker: storage, context menus, commands, screenshots. |
| `context-target.js` | ~24 | Runs on every page. Remembers the last right-clicked element. Nothing else. |
| `page-style.css` | ~90 | Styles for injected UI. |
| `scripts/check.mjs` | | 12 static checks. Fast, no browser. |
| `scripts/build.mjs` | | `node scripts/build.mjs <chrome\|firefox\|edge> <version>` → `dist/*.zip`. |
| `scripts/publish.mjs` | | Uploads to all three stores via their REST APIs. `--dry-run` verifies credentials without publishing. |
| `scripts/preflight.mjs` | | Tag, `manifest.json`, `package.json` and `CHANGELOG.md` must agree before a release. |
| `scripts/verify-packages.mjs` | | Asserts the built ZIPs contain exactly the expected files and the right manifest per browser. |
| `tests/` | | 7 suites, 157 assertions. 6 drive real headed Chromium; `publish.test.mjs` stubs the store APIs. |

## Golden rules

1. **`page-code.js` is a single ~3,800-line IIFE.** Line numbers in any note, summary or
   plan go stale immediately. **Always `grep` for the function name**, never navigate by
   remembered line number.
2. **Run both gates before claiming done:** `npm run check` (12 static checks) and
   `npm test` (143 assertions). CI runs both.
3. **State is the source of truth; the DOM is derived.** Mutate `state`, then call
   `renderState()`, which wipes and re-applies everything. This is what makes undo/redo,
   cross-tab sync and reload-restore work for free. Never hand-patch the DOM as a
   shortcut — it will desynchronise from history.

## Commands

```bash
npm run check                          # 12 static checks, ~1s, no browser
npm test                               # all 7 suites (several minutes)
CEB_ONLY=markup.test.mjs npm test      # one suite while developing
npm run build:all                      # all three ZIPs, then verify their contents
node scripts/build.mjs chrome 2.3.0    # → dist/content-edit-blur-chrome-2.3.0.zip
node scripts/publish.mjs all --dry-run # check store credentials, upload nothing
```

## The static checks, and why they exist

`scripts/check.mjs` guards **cross-file drift** — the class of bug where two files each
look correct in isolation but disagree. Every one was added after such a bug shipped:

- manifest parses; every JS file parses; every build script in `scripts/` parses; every
  referenced file exists; every mode has both icon sizes; manifest version matches
  `package.json`.
- **At most 4 commands declare a `suggested_key`.** Chrome silently rejects *the entire
  manifest* past four — the extension simply fails to load with no useful error.
- `restoreFromStorage` merges rather than overwrites state.
- `flushChanges` omits an unloaded site scope.
- **Both emptiness checks agree.** `background.js`'s `hasChanges()` and `page-code.js`'s
  `isEmptyPayload` are independent predicates over the same collections. When annotations
  were added, `hasChanges()` didn't know about them, so a page whose only content was a
  kept annotation was judged empty and its storage key was **deleted**.
- **Every background message goes through `sendToBackground()`.** `chrome.runtime.sendMessage`
  throws *synchronously* when the extension context is invalidated (reload/update with a
  tab still open), which killed unrelated code paths.
- The `PRO_ANNOTATE_TOOLS` constant matches the `ceb-pro-only` toolbar buttons.

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
  ```
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```
- Don't commit `dist/` (gitignored) or test scratch files.
