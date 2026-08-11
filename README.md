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
| 💾 **Auto-Save** | Changes persist automatically and restore on page reload. |
| 📸 **Screenshot** | Capture the page with all your edits applied. |

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

Your choice is remembered.

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
2. **Select a tool** — Edit, Blur, Hide, Draw (or Redact in Pro)
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
