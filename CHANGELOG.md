# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/).

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
