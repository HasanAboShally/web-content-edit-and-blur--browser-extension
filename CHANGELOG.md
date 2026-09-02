# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [2.4.0]

### Added

- **Stroke width control** for arrows, circles, boxes and freehand lines. The selected
  width is remembered and existing saved annotations remain backward-compatible.
- **Contextual annotation editing** — click a mark to select it, then change its colour
  or width, move it with the arrow keys, or remove it with an explicit Delete action.
- **Contextual privacy editing** — select an effected element or rectangular Area to
  change its effect, choose Soft or Strong blur, or remove it explicitly. Areas can also
  be moved, resized and keyboard-nudged.

### Changed

- Split the page editing engine from one 5,300-line script into focused, ordered modules.
  The extension remains build-free plain JavaScript; canonical script and style manifests,
  idempotent bootstrap and serialized injection protect load order and reinjection.
- Expanded contributor guidance with a public architecture document, current issue and PR
  templates, code ownership, deterministic CI installs, workflow timeouts, and lockfile
  and contributor-configuration drift checks.
- Split injected styles into an explicitly ordered cascade and added strict incremental
  JSDoc typechecking for the state model and pure geometry layer.
- Consolidated browser-suite setup in a shared Playwright harness and added a portable
  focused-suite command for faster contributor feedback.
- Rebuilt the toolbar around an always-light, tokenized UI system with consistent type,
  spacing, control sizes, radii, focus states and responsive internal scrolling.
- Simplified active states to one blue interaction color while retaining red only for
  destructive actions and annotation colors only for drawn content.
- Onboarding, keyboard shortcuts, toasts and the closed-toolbar mode badge now share the
  same light visual language as the main toolbar.
- Annotation tools now include short text labels instead of relying on unfamiliar icons
  and browser tooltips alone.
- Reorganized the toolbar into **Content** and **Privacy** groups. Area is now the
  **Element / Area** target choice for Blur and Redact instead of appearing as a peer
  tool. Freehand drawing remains under **Annotate → Pen**.
- Replaced the misleading **Simple / Pro** split with **Essentials / Advanced**. Redo,
  Box and freehand Pen are now Essentials; Advanced is reserved for Redact, site scope,
  rule management, import/export and numbered Steps.
- Renamed **Auto-save** to **Remember changes** and **Keep after reload** to
  **Save annotations too**, clarifying that remembered data stays in local browser storage
  and that annotation persistence depends on the master setting.
- Blur strength is now an explicit **Soft / Strong** choice instead of an undiscoverable
  click cycle.

### Fixed

- The full-page Annotate and Area input layers sat above the toolbar, so pointer clicks
  could not select a shape or another control after entering either mode. Extension UI
  now owns a higher interaction layer and is excluded from page targeting.
- The floating mode badge covered the toolbar header. It now appears only when the
  toolbar itself is closed.
- Shortcut and onboarding dialog buttons were intercepted by the active-mode page click
  handler, making the dialogs impossible to dismiss in some modes.
- Long helper text crowded or clipped compact toolbar controls.
- Clicking a non-text annotation deleted it immediately. Selection is now non-destructive,
  with a visible outline and contextual editing controls.
- Rectangular privacy Areas intercepted page clicks and were deleted by a single click.
  They are now inert outside Area editing and use explicit selection and removal.
- The draggable toolbar could be moved partly off-screen or stranded after resizing the
  viewport. All four edges are now clamped after drag, resize and layout changes.
- Toolbar controls left open across an extension reload no longer report uncaught
  `Extension context invalidated` errors. Runtime and storage calls now fail safely and
  ask the user to refresh the page to reconnect.
- Firefox packages now explicitly declare that the extension collects and transmits no
  user data, matching Mozilla's built-in install consent requirements.

## [2.3.0]

### Added

- **Highlighter** — a marker pen that uses `mix-blend-mode: multiply`, so it tints the
  background without washing out the text underneath. Chisel tip, and its own colour
  kept separately from the line colour.
- **Numbered step badges** *(Pro)* — click to place ➊ ➋ ➌ for walkthroughs. Numbers come
  from position, so deleting one renumbers the rest instead of leaving a gap.
- **Move and resize** any mark. Hover it in Annotate mode for handles; drag the body to
  move, a handle to resize. Hit testing follows the ink rather than the bounding box, so
  you can still draw inside a circle you have already drawn.

### Changed

- Refreshed the extension icon with a clearer content-to-blur mark that remains
  recognizable at browser and store sizes.

### Fixed

- Annotations sat above the page and swallowed clicks meant for it — and because the old
  gesture was "click to remove", a mark over a link deleted itself instead of following
  the link. Marks are now inert outside Annotate mode.
- Abandoning a drag part-way — pressing `Esc`, or switching mode mid-drag — left the mark
  at its dragged position but recorded nothing in history, so the next undo discarded the
  move *and* the action before it, and a kept mark snapped back on reload. The mark now
  returns to where it started.
- Clicking a resize handle deleted the mark instead of doing nothing, even though the
  cursor over it promised a resize.
- A text note was grabbable across the full width of its wrap box rather than its actual
  words, so a short note stole drags that began well clear of it. A wrapped note is now
  also grabbable on every line, not just its first.
- Dragging a mark quietly restacked it above its neighbours, so what was drawn on top and
  what could be grabbed disagreed.
- A note placed but never typed into could be captured by an unrelated action's undo
  snapshot, which then resurrected it as an invisible empty mark — and could write it to
  storage under **Keep after reload**.

## [2.2.0]

### Added

- **Annotate mode** — arrows, circles and text notes, plus boxes and a smoothed freehand
  pen in Pro. Session-only by default, with a **Keep after reload** toggle.

### Changed

- Screenshots no longer capture the extension's own toolbar and overlays. They are hidden
  for the capture and restored afterwards.

### Fixed

- A page whose only content was a kept annotation was treated as empty by the background
  worker, which deleted the storage key instead of writing it.
- Starting a text note immediately lost focus to the page, so the note was discarded as
  empty before a character could be typed.
- Abandoning an empty text note pushed a duplicate history entry, which silently consumed
  the next undo.
- A long freehand stroke ate its own beginning while being drawn — the point buffer
  dropped the oldest samples once it filled. It is now thinned evenly, so the whole stroke
  survives at slightly lower resolution.
- Clicking an annotation in blur/hide mode targeted the extension's own overlay, saving a
  meaningless positional rule that would match unrelated content on the next visit.
- If the extension was reloaded or updated while a tab stayed open, taking a screenshot
  left the toolbar and overlays invisible until the page was reloaded.

## [2.1.0]

### Added

- **Redact mode** — an irreversible solid block, unlike reversible blur.
- **Smart element picker** — hover to preview, `↑`/`↓` to select the parent or child.
- **Site-wide rules** — apply a rule to every page on a domain, not just one URL.
- **Rules panel** — review, re-scope, and delete individual rules.
- **Export / import** rules as JSON.
- **Redo**, alongside Undo.
- **Simple / Pro toolbar modes**, so the extra power stays out of the way.

### Changed

- Undo/redo now covers every action, not just text edits.
- "Reset page" is undoable and no longer wipes site-wide rules.

### Fixed

- Site-wide rules could be silently deleted by a second tab on the same domain. Scopes are
  now synced live across tabs instead of overwritten.
- Rules applied inside an iframe were saved but never restored on reload.
- On single-page apps, rules from one route leaked onto the next.
- A rule applied immediately after page load could wipe saved rules.
- Sandboxed frames (`about:blank`, `srcdoc`) have no real origin, so their rules were being
  written to a shared bucket visible to every site. They are now session-only — the effect
  still applies, it just isn't persisted.

## [2.0.0]

### Added

- Unified floating toolbar UI (no more popup).
- Draw-to-blur mode.
- Screenshot capture.
- Auto-save for blur/hide changes.
- Dark mode support.
- Undo for blur/hide actions.

### Changed

- Better visual feedback.
- Context menu integration.

## [1.4.0]

### Changed

- Migrated to Manifest V3.

## [1.3.0]

### Added

- Replace all text occurrences.

## [1.2.0]

### Added

- Replace images with local files.
