# Content Edit & Blur

<p align="center">
  <img src="images/app-icon-128.png" alt="Content Edit & Blur" width="72">
</p>

<p align="center">
  <strong>Edit, blur, redact and annotate any webpage — for mockups, screenshots and screen shares.</strong>
</p>

<p align="center">
  <a href="https://chrome.google.com/webstore/detail/content-edit-blur/adgnogkndmhcblbonkhgfbbngeghpboh"><img src="https://img.shields.io/chrome-web-store/v/adgnogkndmhcblbonkhgfbbngeghpboh?label=Chrome&logo=googlechrome&logoColor=white" alt="Chrome"></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/content-edit-blur"><img src="https://img.shields.io/amo/v/content-edit-blur?label=Firefox&logo=firefox&logoColor=white" alt="Firefox"></a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/content-edit-blur/chlpcaigaedflhkfgmhkpknlcchkeodl"><img src="https://img.shields.io/badge/Edge-listed-blue?logo=microsoftedge&logoColor=white" alt="Edge"></a>
  <a href="https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension/actions/workflows/ci.yml"><img src="https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/HasanAboShally/web-content-edit-and-blur--browser-extension" alt="License"></a>
</p>

<p align="center">
  <a href="https://hasanaboshally.github.io/web-content-edit-and-blur--browser-extension/">Website</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="ARCHITECTURE.md">Architecture</a> ·
  <a href="https://github.com/sponsors/HasanAboShally">Sponsor</a>
</p>

## Install

[Chrome](https://chrome.google.com/webstore/detail/content-edit-blur/adgnogkndmhcblbonkhgfbbngeghpboh) ·
[Firefox](https://addons.mozilla.org/en-US/firefox/addon/content-edit-blur) ·
[Edge](https://microsoftedge.microsoft.com/addons/detail/content-edit-blur/chlpcaigaedflhkfgmhkpknlcchkeodl)

Or load it unpacked — see [CONTRIBUTING.md](CONTRIBUTING.md#running-it-locally).

## Tools

| | |
|---|---|
| **Edit** | Click any text to rewrite it. `Alt+R` replaces every occurrence. Double-click an image to swap it. |
| **Blur** | Blur a whole element, or switch Target to Area and drag a precise rectangle. Choose Soft or Strong directly. |
| **Hide** | Click an element to remove it entirely. |
| **Annotate** | Arrows, circles, boxes, highlighter, text notes and a freehand Pen. |
| **Screenshot** | Capture the page with your edits applied; the toolbar hides itself first. |
| **Redact** *(Advanced)* | Cover a whole element, or switch Target to Area and drag a precise solid block. Blur can sometimes be reversed from an image — redaction cannot. |

**Remember changes** is on by default. Eligible changes are stored only in your browser
and return after reload; turn it off for a session-only workflow.

Blur and Redact share a **Target** control: **Element** clicks an existing page item;
**Area** drags a fixed rectangle. Freehand drawing is under **Annotate → Pen**.
Click an existing privacy effect to select it, then change its effect or blur strength,
or remove it explicitly. Selected Areas can also be moved, resized and keyboard-nudged.

### Essentials and Advanced

The toolbar opens in **Essentials**, which includes the everyday editing, privacy and
annotation workflow — including Undo, Redo, boxes and freehand Pen. Switching to
**Advanced** (bottom-left) adds the higher-risk or administrative tools: Redact,
per-site rule **scope**, the **rules panel**, JSON **export/import**, and numbered
**step** badges. Your choice is remembered.

## Using it

1. Click the extension icon to open the floating toolbar.
2. Pick a tool, then **hover** — a readout shows exactly what you are about to change.
3. Press `↑`/`↓` to widen or narrow the selection to the parent or child element. Hovering
   usually lands on a `<span>` rather than the card you meant; this is faster than clicking
   and undoing until you hit the right node.
4. Click to apply. `Esc` leaves the mode.

The toolbar can be dragged, collapsed or closed. Click the icon again to bring it back.

### Annotating

Drag to draw. In Annotate mode, hover a mark for handles — drag the body to move it, a
handle to resize. Hit testing follows the ink, not the bounding box, so you can still draw
inside a circle you already drew. Outside Annotate mode marks are inert and never
intercept clicks meant for the page.

Text notes: click, type, `Enter` to commit, `Shift+Enter` for a new line. The highlighter
uses `mix-blend-mode: multiply`, so text underneath stays black and readable instead of
washing out to grey.

Annotations are **not saved by default** — most exist to explain one screenshot. Turn on
**Save annotations too** to include them in Remember changes. They are always tied to a
single page; an arrow at a fixed position means nothing on another URL.

## Shortcuts

| | |
|---|---|
| `Alt+Shift+E` | Toggle toolbar |
| `Alt+1` / `Alt+2` / `Alt+3` | Edit / Blur / Hide |
| `↑` / `↓` | Select parent / child |
| `Enter` | Apply to selection |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `Alt+R` | Replace all occurrences (Edit mode) |
| `Esc` | Leave mode |

Browsers cap extensions at four assignable shortcuts, so the rest are unbound — add your
own at `chrome://extensions/shortcuts`.

## Privacy

Works entirely offline. No data collection, no telemetry, no external requests.

| Permission | Why |
|---|---|
| `<all_urls>` | Re-apply your saved changes after a reload. Without it the browser revokes access on every navigation. |
| `scripting` | Inject the editing tools when you activate a mode. |
| `storage` | Save changes to `chrome.storage.local`. Never synced or uploaded. |
| `contextMenus` | The right-click "Blur / Hide this element" items. |
| `activeTab` | Capture the visible tab for the screenshot button. |

One ~20-line content script (`context-target.js`) runs on every page, solely to remember
which element you last right-clicked. It reads nothing else. The full editing engine is
injected on first activation, or when saved rules need to be restored after navigation.

## Support

Content Edit & Blur stays free, open source, and free of tracking. If it has saved you
time, you can [support ongoing maintenance through GitHub Sponsors](https://github.com/sponsors/HasanAboShally)
with a one-time or monthly contribution. There are no locked features or in-extension
prompts attached to sponsorship.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Working on this with an AI agent? Read
[AGENTS.md](AGENTS.md) first. The runtime boundaries and state invariants are documented
in [ARCHITECTURE.md](ARCHITECTURE.md).

## License

[MIT](LICENSE) © Hasan Abo-Shally
