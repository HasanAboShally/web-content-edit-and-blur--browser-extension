# Content Edit & Blur

<p align="center">
  <img src="images/app-icon-128.png" alt="Content Edit & Blur" width="80">
</p>

<p align="center">
  <strong>Edit, blur, and hide content on any webpage</strong><br>
  <sub>Perfect for mockups, screenshots, screen shares, and privacy</sub>
</p>

<p align="center">
  <a href="https://chrome.google.com/webstore/detail/content-edit-blur/adgnogkndmhcblbonkhgfbbngeghpboh"><img src="https://img.shields.io/chrome-web-store/v/adgnogkndmhcblbonkhgfbbngeghpboh?label=Chrome&logo=googlechrome&logoColor=white" alt="Chrome"></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/content-edit-blur"><img src="https://img.shields.io/amo/v/content-edit-blur?label=Firefox&logo=firefox&logoColor=white" alt="Firefox"></a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/content-edit-blur/chlpcaigaedflhkfgmhkpknlcchkeodl"><img src="https://img.shields.io/badge/Edge-v2.0-blue?logo=microsoftedge&logoColor=white" alt="Edge"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/HasanAboShally/web-content-edit-and-blur--browser-extension" alt="License"></a>
</p>

<p align="center">
  <a href="https://hasanaboshally.github.io/web-content-edit-and-blur--browser-extension/">Website</a> · 
  <a href="#features">Features</a> · 
  <a href="#installation">Install</a> · 
  <a href="#keyboard-shortcuts">Shortcuts</a> · 
  <a href="#changelog">Changelog</a>
</p>

---

## Features

| Tool | Description |
|------|-------------|
| ✏️ **Edit** | Click any text to edit it. Use `Alt+R` to replace all occurrences. Double-click images to swap them. |
| 🔘 **Blur** | Click elements to blur them. Click again for stronger blur (3 levels). |
| 👁️ **Hide** | Completely hide any element with one click. |
| ⬛ **Redact** *(Pro)* | Cover an element with an irreversible solid block — nothing survives to be recovered. |
| ▢ **Draw** | Draw rectangles anywhere to create custom blur or solid regions. |
| 🖊️ **Annotate** | Mark up the page: arrows, circles, a highlighter and text notes — plus boxes, freehand pen and numbered steps in Pro. |
| 💾 **Auto-Save** | Changes persist automatically and restore on page reload. |
| 📸 **Screenshot** | Capture the page with all your edits applied. The toolbar hides itself first. |

### Simple and Pro

The toolbar starts in **Simple** mode — Edit, Blur, Hide, Draw, plus Undo, Screenshot
and Reset. That is everything most people need.

Switching to **Pro** (bottom-left of the toolbar) adds:

- **Redact** — a solid, irreversible block rather than a reversible blur
- **Redo**, alongside Undo
- **Scope** — apply a rule to just this page or to *every page on the domain*
- **Rules panel** — see every rule you have created, hover to locate it on the page,
  re-scope it, or delete it individually
- **Export / Import** — save your rules to a JSON file and load them elsewhere
- **Draw style** — choose whether drawn regions blur or block out
- **Annotate: box, pen and numbered steps** — a rectangle outline, a freehand pen and
  click-to-place numbered badges, on top of the arrow, circle, highlighter and text
  note available in Simple

Your choice is remembered.

### Annotating

Pick **Annotate** and choose a tool:

| Tool | How |
|------|-----|
| ➜ **Arrow** | Drag from the tail to the point you want to indicate. |
| ◯ **Circle** | Drag a box; the ellipse is drawn inside it. Better than freehand for circling things — hand-drawn circles look shaky. |
| ▰ **Highlighter** | Drag across text to highlight it. Unlike the pen it uses `mix-blend-mode: multiply`, so it behaves like real marker ink: the text underneath stays black and readable instead of washing out to grey. Chisel tip, its own pastel swatches. |
| **T Text** | Click, then type. `Enter` commits, `Shift+Enter` adds a line, `Esc` closes. Click an existing note to edit it. |
| ▭ **Box** *(Pro)* | Drag a rectangle outline. |
| ✎ **Pen** *(Pro)* | Freehand. The stroke is smoothed as you draw. |
| ➊ **Step** *(Pro)* | Click to drop a numbered badge. Numbers are assigned by position, so deleting badge 2 renumbers the rest instead of leaving a gap. |

Pick a colour from the swatches — the row changes with the tool, and the highlighter
keeps its own colour independently of the line colour.

**Moving and changing a mark.** In Annotate mode, hover a mark to reveal its handles.
Drag the middle to move it, or a handle to resize it. A click (rather than a drag)
removes a shape, or opens the editor on a text note. Hit testing follows the ink, not
the bounding box, so you can still draw *inside* a circle you have already drawn.

Outside Annotate mode marks are inert — they do not intercept clicks meant for the
page beneath them.

**Annotations are not saved by default.** Most marks exist to explain one screenshot,
so they disappear on reload rather than following you around. If you want them to stay,
turn on **Keep after reload** — that applies to every mark on the page and to new ones
you draw. Unlike blur and hide rules, annotations are always tied to the one page: an
arrow at a fixed position has no meaning on a different URL.

### Blur vs. Redact

Blur is reversible in principle: a determined viewer can sometimes recover the
underlying content from a blurred image. **Redact** is not — it renders the element as
a solid black block with `filter: brightness(0)` over an opaque background, which
flattens text, images, video and canvas alike. Use Redact when the content genuinely
must not leak.

## Installation

Install from your browser's extension store:

| Browser | Link |
|---------|------|
| Chrome | [Chrome Web Store](https://chrome.google.com/webstore/detail/content-edit-blur/adgnogkndmhcblbonkhgfbbngeghpboh) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/content-edit-blur) |
| Edge | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/content-edit-blur/chlpcaigaedflhkfgmhkpknlcchkeodl) |

## How to Use

1. **Click the extension icon** to open the floating toolbar
2. **Select a tool** — Edit, Blur, Hide, Draw, Annotate (or Redact in Pro)
3. **Hover** to see exactly what you are about to change
4. **Press ↑ / ↓** to grow or shrink the selection to the parent or child element
5. **Click** to apply, or press `Enter`
6. **Press Esc** to deactivate the current mode

The toolbar can be **dragged anywhere**, **collapsed**, or **closed**. Click the
extension icon again to re-open it.

### Selecting the right element

Hovering usually lands on the smallest element under the cursor — often a `<span>`
rather than the card you meant. A small readout shows what is currently selected;
press `↑` to walk up to the parent, `↓` to come back down. This is far quicker than
clicking and undoing until you hit the right node.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+E` | Toggle toolbar |
| `Alt+1` | Edit mode |
| `Alt+2` | Blur mode |
| `Alt+3` | Hide mode |
| `↑` / `↓` | Select parent / child element |
| `Enter` | Apply to the selected element |
| `Ctrl+Z` / `⌘Z` | Undo |
| `Ctrl+Shift+Z` / `⌘⇧Z` | Redo |
| `Esc` | Deactivate mode |
| `Alt+R` | Replace selected text (in Edit mode) |

Redact mode has no default shortcut — browsers cap extensions at four — but you can
assign one at `chrome://extensions/shortcuts`.

## Use Cases

- **Mockups** — Quickly modify live websites to show design changes
- **Screenshots** — Blur sensitive data before capturing
- **Screen shares** — Hide personal info during Zoom, Teams, or recordings
- **Privacy** — Remove distracting or unwanted elements

## Privacy

This extension:
- ✅ Works 100% offline
- ✅ Collects no data
- ✅ Sends nothing to external servers
- ✅ Is fully open source

### Permissions

| Permission | Why it's needed |
| --- | --- |
| `host_permissions: <all_urls>` | Re-apply your saved blur/hide changes when you reload a page. Without it the browser revokes access on every navigation and your changes disappear. |
| `scripting` | Inject the editing tools into the page when you activate a mode. |
| `storage` | Save your changes locally (`chrome.storage.local`). Never synced or uploaded. |
| `contextMenus` | Add the right-click "Blur / Hide this element" items. |
| `activeTab` | Capture the visible tab for the screenshot button. |

A ~20-line content script (`context-target.js`) runs on every page for the sole purpose of
remembering which element you last right-clicked, so the context menu knows what to act on.
It reads nothing else and sends nothing anywhere. The full editing script is only injected
once you actually activate a mode.

## Changelog

### v2.3.0 (2026)
- ✨ **New**: **Highlighter** — a marker pen that uses `mix-blend-mode: multiply`, so it
  tints the background without washing out the text underneath. Chisel tip, and its own
  colour kept separately from the line colour.
- ✨ **New**: **Numbered step badges** *(Pro)* — click to place ➊ ➋ ➌ for walkthroughs.
  Numbers come from position, so deleting one renumbers the rest instead of leaving a gap.
- ✨ **New**: **Move and resize** any mark. Hover it in Annotate mode for handles; drag
  the body to move, a handle to resize. Hit testing follows the ink rather than the
  bounding box, so you can still draw inside a circle you have already drawn.
- 🐛 **Fixed**: Annotations sat above the page and swallowed clicks meant for it — and
  because the old gesture was "click to remove", a mark over a link deleted itself
  instead of following the link. Marks are now inert outside Annotate mode.
- 🐛 **Fixed**: Abandoning a drag part-way — pressing `Esc`, or switching mode mid-drag —
  left the mark at its dragged position but recorded nothing in history, so the next
  undo discarded the move *and* the action before it, and a kept mark snapped back on
  reload. The mark now returns to where it started.
- 🐛 **Fixed**: Clicking a resize handle deleted the mark instead of doing nothing, even
  though the cursor over it promised a resize.
- 🐛 **Fixed**: A text note was grabbable across the full width of its wrap box rather
  than its actual words, so a short note stole drags that began well clear of it. A
  wrapped note is now also grabbable on every line, not just its first.
- 🐛 **Fixed**: Dragging a mark quietly restacked it above its neighbours, so what was
  drawn on top and what could be grabbed disagreed.
- 🐛 **Fixed**: A note placed but never typed into could be captured by an unrelated
  action's undo snapshot, which then resurrected it as an invisible empty mark — and
  could write it to storage under **Keep after reload**.

### v2.2.0 (2026)
- ✨ **New**: Annotate mode — arrows, circles and text notes, plus boxes and a smoothed
  freehand pen in Pro. Session-only by default, with a **Keep after reload** toggle.
- 🔧 **Improved**: Screenshots no longer capture the extension's own toolbar and
  overlays. They are hidden for the capture and restored afterwards.
- 🐛 **Fixed**: A page whose only content was a kept annotation was treated as empty by
  the background worker, which deleted the storage key instead of writing it.
- 🐛 **Fixed**: Starting a text note immediately lost focus to the page, so the note was
  discarded as empty before a character could be typed.
- 🐛 **Fixed**: Abandoning an empty text note pushed a duplicate history entry, which
  silently consumed the next undo.
- 🐛 **Fixed**: A long freehand stroke ate its own beginning while being drawn — the
  point buffer dropped the oldest samples once it filled. It is now thinned evenly, so
  the whole stroke survives at slightly lower resolution.
- 🐛 **Fixed**: Clicking an annotation in blur/hide mode targeted the extension's own
  overlay, saving a meaningless positional rule that would match unrelated content on
  the next visit.
- 🐛 **Fixed**: If the extension was reloaded or updated while a tab stayed open, taking
  a screenshot left the toolbar and overlays invisible until the page was reloaded.

### v2.1.0 (2026)
- ✨ **New**: Redact mode — an irreversible solid block, unlike reversible blur
- ✨ **New**: Smart element picker — hover to preview, `↑`/`↓` to select the parent or child
- ✨ **New**: Site-wide rules — apply a rule to every page on a domain, not just one URL
- ✨ **New**: Rules panel — review, re-scope, and delete individual rules
- ✨ **New**: Export / import rules as JSON
- ✨ **New**: Redo, alongside Undo
- ✨ **New**: Simple / Pro toolbar modes, so the extra power stays out of the way
- 🔧 **Improved**: Undo/redo now covers every action, not just text edits
- 🔧 **Improved**: "Reset page" is undoable and no longer wipes site-wide rules
- 🐛 **Fixed**: Site-wide rules could be silently deleted by a second tab on the same
  domain. Scopes are now synced live across tabs instead of overwritten.
- 🐛 **Fixed**: Rules applied inside an iframe were saved but never restored on reload
- 🐛 **Fixed**: On single-page apps, rules from one route leaked onto the next
- 🐛 **Fixed**: A rule applied immediately after page load could wipe saved rules
- 🐛 **Fixed**: Sandboxed frames (`about:blank`, `srcdoc`) have no real origin, so their
  rules were being written to a shared bucket visible to every site. They are now
  session-only — the effect still applies, it just isn't persisted.

### v2.0.0 (2026)
- 🎨 **New**: Unified floating toolbar UI (no more popup)
- ✨ **New**: Draw-to-blur mode
- ✨ **New**: Screenshot capture
- ✨ **New**: Auto-save blur/hide changes
- ✨ **New**: Dark mode support
- ✨ **New**: Undo for blur/hide actions
- 🔧 **Improved**: Better visual feedback
- 🔧 **Improved**: Context menu integration

### v1.4.0
- Migrated to Manifest V3

### v1.3.0
- Replace all text occurrences

### v1.2.0
- Replace images with local files

## Contributing

Contributions welcome! Feel free to open issues or submit PRs.

## License

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/HasanAboShally">Hasan Abo-Shally</a>
</p>
