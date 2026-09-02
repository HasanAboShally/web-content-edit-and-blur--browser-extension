# Architecture

Content Edit & Blur is a dependency-light Manifest V3 browser extension for Chrome,
Firefox and Edge. The repository is the runnable extension: there is no compilation,
bundler or framework, and the JavaScript and CSS under `page/` ship as written.

## Runtime overview

The extension has three runtime surfaces:

| Surface | Responsibility | Lifetime |
|---|---|---|
| `background.js` | Context menus, commands, page injection, screenshots and storage writes | MV3 service worker; may stop after idle |
| `context-target.js` | Remembers the most recently right-clicked element in each frame | Always-on content script |
| `page/*.js` | Editing engine, overlays, annotations, toolbar and persistence client | Injected on first use or when saved rules must be restored |
| `page/styles/*.css` | Page effects and extension-owned interface styles | Injected with the page scripts |

Before touching a frame, the service worker resolves both runtime manifests. It inserts
every file in `page/styles.json` with one `chrome.scripting.insertCSS()` call, then injects
every file in `page/modules.json` with one `chrome.scripting.executeScript()` call. The
styles retain manifest order, and the classic scripts form one lexical program in the
extension's isolated world. Script order is an API contract:

1. Foundations and state are declared first.
2. Feature modules add behavior without starting long-lived work.
3. `page/main.js` loads last and performs the single idempotent bootstrap.

Never add a page module without adding it to `page/modules.json`. Static checks enforce
that the list has no duplicates, every listed file exists, `page/main.js` is last, and no
other module installs long-lived listeners or timers at top level.

## Page modules

| Module | Owns |
|---|---|
| `page/model.js` | Constants, settings, schema validation/migration, selectors and state serialization |
| `page/geometry.js` | Pure annotation and privacy-area bounds, paths, hit distances and resize calculations |
| `page/extension-api.js` | Guarded runtime messaging and local-storage operations |
| `page/effects-privacy.js` | Element effects, privacy selection and the state-derived render orchestrator |
| `page/areas.js` | Rectangular blur/redact creation, hit testing, moving and resizing |
| `page/annotation-rendering.js` | Annotation SVG construction, DOM rendering and hit testing |
| `page/annotation-interactions.js` | Annotation selection, drawing, dragging, resizing and text editing |
| `page/content-tools.js` | Screenshot, text/image editing, notifications and import/export |
| `page/persistence-history.js` | Storage restore/save, SPA route isolation, cross-tab sync and undo/redo |
| `page/picker.js` | Hover target selection and ancestor traversal |
| `page/toolbar-template.js` | Toolbar markup only |
| `page/toolbar-controller.js` | Toolbar lifecycle, event wiring, rules UI and controls |
| `page/toolbar-state.js` | State-derived toolbar visibility, values, labels and hints |
| `page/main.js` | Global event dispatch and idempotent bootstrap |

This is intentionally not a collection of independent ES modules. Functions may refer to
earlier top-level declarations, so moving a function can change the dependency order.
Treat `page/modules.json` as the topological order and run the browser suites after every
boundary change.

## Incremental JSDoc typecheck

`npm run typecheck` runs TypeScript with `allowJs`, `checkJs`, `noEmit` and `strict`
enabled. The scope is intentionally limited to `page/model.js` and `page/geometry.js` in
`jsconfig.typecheck.json`. They are configured as classic scripts with browser DOM types;
Chrome API types are not included. The command emits nothing and is not a build step.

Expand the file list only when the added runtime source passes cleanly. Do not use
`@ts-nocheck` or weaken the strict options to admit another file.

## Page styles

`page/styles.json` is the sole CSS ordering authority. The service worker injects these
source files directly at runtime; there is no generated aggregate stylesheet and no
build-time concatenation step.

| Style | Owns |
|---|---|
| `page/styles/effects.css` | Page modes, blur/hide/redact effects and picker overlays |
| `page/styles/detached-ui.css` | Quick-start panel, toast and mode badge |
| `page/styles/toolbar-base.css` | Toolbar defaults and component rules retained in their original cascade position |
| `page/styles/toolbar-system.css` | Final always-light tokens and authoritative toolbar overrides |

Keep `page/styles/toolbar-system.css` last: it intentionally overrides earlier toolbar
defaults. New style modules must be listed in `page/styles.json`, remain below the
reviewability ceiling, and must not use `@import`. Static and package checks enforce that
the style directory contains exactly the files named by the manifest.

## State and rendering

`state` is the source of truth. It has four collections:

- `rules`: element blur, hide and redact rules
- `areas`: document-coordinate blur and redact rectangles
- `replacements`: text substitutions
- `annotations`: arrows, shapes, marks, notes and step badges

A mutation updates `state`, then ends in `commit()`. A commit records a complete snapshot,
calls `renderState()`, updates history and schedules persistence. `renderState()` clears
and reapplies effects from state. Direct DOM changes that are not represented in state
will disappear on the next render and can corrupt undo/redo behavior.

Transient UI state, such as the selected annotation, selected privacy item and active drag,
is deliberately not persisted. History includes session-only annotations so undo remains
correct; storage filters annotations unless the user enables annotation persistence.

## Persistence and isolation

Page-scoped data is keyed by normalized URL. Site-scoped data is keyed by origin. A frame
must load the site scope before it may write one, otherwise its empty local view could
delete rules created by another tab. Sandboxed and opaque-origin frames are session-only
because they have no safe origin bucket.

All page-side runtime and storage operations after bootstrap go through
`callExtensionApi()` via `readStorage()`, `writeStorage()` or `sendToBackground()`.
Listener registration occurs once in the guarded `page/main.js` bootstrap. Chrome APIs
can throw synchronously when an extension is reloaded while a page still contains the old
injected UI. The adapter turns that lifecycle event into a settled promise and asks the
user to refresh the page.

The service worker is disposable. `ensureInitialized()` probes the top-frame page listener
instead of trusting in-memory tab state, and it serializes concurrent initialization.
Dynamic iframes are initialized separately when a context-menu message finds no receiver.

## History invariants

- Every durable state mutation ends in one `commit()`.
- Do not commit a snapshot identical to the previous snapshot; it consumes the next undo.
- An active drag mutates state for live rendering but commits only on successful release.
- Cancelling a drag restores its last committed geometry.
- Empty text notes are removed before snapshots and serialization.
- Render order and reverse hit-test order must continue to agree.

## Browser and package boundaries

Chrome and Edge use `background.service_worker`. The build script transforms that field to
`background.scripts` for Firefox and adds the Firefox add-on identity and data-collection
declaration. No source transpilation occurs.

`npm run build:all` stages only the explicitly allowed root files, manifest-listed page
scripts and styles, and `images/`. The removed root `page-style.css` is neither generated
nor packaged. `verify-packages.mjs` compares every ZIP against those manifests and validates
the browser-specific manifest shape. Store listing content under `store-assets/` is not
packaged.

`npm run test:firefox` adds a runtime boundary check: it rebuilds the Firefox artifact,
runs Mozilla lint with warnings treated as errors, and installs the package as a temporary
add-on in a real Firefox process. Chromium remains the full behavioral test target.

## Making a change

1. Find the owning module in the table above.
2. Preserve manifest order, state-derived rendering and the guarded Chrome API boundary.
3. Add or update a focused browser regression.
4. Run the focused suite while developing.
5. Run `npm run typecheck`, `npm run check` and `npm test` before opening a pull request.
6. For release-sensitive changes, run `npm run build:all` as well.

See `CONTRIBUTING.md` for setup and pull-request guidance. `AGENTS.md` contains additional
implementation pitfalls discovered while debugging past regressions.
