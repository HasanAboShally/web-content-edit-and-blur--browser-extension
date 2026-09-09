# Content Edit & Blur

> A free, open-source browser extension to edit text and images, blur or redact sensitive information, annotate webpages, and capture clean screenshots.

Canonical website: https://hasanaboshally.github.io/web-content-edit-and-blur--browser-extension/

Content Edit & Blur runs locally in Google Chrome, Mozilla Firefox, and Microsoft Edge. It is built for product mockups, bug reports, documentation, presentations, screenshots, demos, and screen shares.

## What it does

- Edit webpage text directly and replace every matching occurrence.
- Replace webpage images with local files.
- Blur or hide page elements and precise rectangular areas.
- Redact sensitive rendered content with an opaque block.
- Annotate pages with arrows, circles, boxes, highlighter, freehand pen, text notes, and numbered steps.
- Undo and redo changes.
- Save rules for one page or an entire site in local browser storage.
- Review, rescope, delete, export, and import saved rules.
- Capture the visible page without extension controls in the screenshot.

## Blur and redaction are different

Blur is for visual de-emphasis. A blur preserves the source pixels and spreads them across neighboring pixels, so it should not be treated as secure removal.

Redact is for sensitive screenshots. It replaces the rendered content with an opaque block, leaving no source pixels in the captured area to reconstruct.

## Privacy

The extension has no account, analytics, telemetry, or external requests. Page content is not uploaded. Remembered changes stay in `chrome.storage.local` on the user's device and are never synced by the extension.

A small content script runs at page start only to remember the last element that was right-clicked. The full editing engine loads on demand or when locally saved rules need to be restored.

## How to use it

1. Install the extension from an official browser store.
2. Open the floating toolbar from the extension icon.
3. Choose Edit, Blur, Hide, Redact, Annotate, or an Area target.
4. Hover to confirm the target, then click or drag to apply the change.
5. Capture a screenshot; the extension controls hide themselves first.

## Browser support and installation

- [Install for Google Chrome](https://chrome.google.com/webstore/detail/content-edit-blur/adgnogkndmhcblbonkhgfbbngeghpboh)
- [Install for Mozilla Firefox](https://addons.mozilla.org/en-US/firefox/addon/content-edit-blur)
- [Install for Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/content-edit-blur/chlpcaigaedflhkfgmhkpknlcchkeodl)

All features are free. The [source code](https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension) is public under the [MIT license](https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension/blob/master/LICENSE).

## Current release

Version 2.4.0 was released in September 2026. It introduced clearer Content and Privacy groups, direct Soft and Strong blur controls, contextual editing for privacy effects and annotations, Essentials and Advanced toolbar views, and stronger persistence reliability.

See the [v2.4.0 release](https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension/releases/tag/v2.4.0) and [full changelog](https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension/blob/master/CHANGELOG.md).

## Adoption and reviews

Public store figures checked on September 9, 2026:

- Chrome Web Store: 6,000 users and 4.5 out of 5 from 20 ratings.
- Firefox Add-ons: 86 average daily users and 4.0 out of 5 from 4 ratings.
- Microsoft Edge Add-ons: 3,712 users and 5.0 out of 5 from 4 ratings.

That is more than 9,700 users across the three browser listings and a weighted average of 4.5 out of 5 from 28 ratings. Counts and ratings change over time; use the official store links above for current values.

## Maintainer and support

Content Edit & Blur is maintained by [Hasan Abo-Shally](https://github.com/HasanAboShally). Report bugs or request features in the [public issue tracker](https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension/issues).
