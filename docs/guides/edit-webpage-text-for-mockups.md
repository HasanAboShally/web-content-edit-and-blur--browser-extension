# How to edit webpage text for realistic product mockups

Canonical guide: https://hasanaboshally.github.io/web-content-edit-and-blur--browser-extension/guides/edit-webpage-text-for-mockups.html

> Edit a supported webpage when the question is about copy, hierarchy or a nearby UI state—not when the concept requires a new interaction model.

A screenshot mockup lets a product manager, designer, writer or support lead show one focused change quickly. Existing typography, spacing and responsive behavior remain while the content changes.

The extension changes the rendered DOM and does not intentionally submit those edits to the site. The underlying site remains connected and its scripts may observe changes, so use a staging environment, demo account or trusted page for mockups and local image replacement.

## Workflow

1. Open the route, viewport and data state closest to the concept. Prefer fictional or approved demonstration data.
2. Choose Edit and click text to change it directly.
3. Select text and press `Alt+R` to replace every matching occurrence on the page.
4. While Edit is active, double-click a page image to choose a file from your device. It is loaded into the DOM, so use a staging or trusted page because site scripts may observe or transmit DOM changes.
5. Use Hide for distracting elements and Blur only for non-sensitive supporting data that should recede visually.
6. Add a restrained arrow, box, highlight, text note or numbered sequence when explanation is needed.
7. Use Screenshot to save the visible viewport. Transient extension controls hide; finished annotations stay in the image.

## Quality checklist

- Keep replacement copy close to realistic production length.
- Use internally consistent dates, totals and units.
- Clearly label fictional data when context allows.
- State that the image is a proposal when it could be mistaken for shipped behavior.
- Do not use edited pages to impersonate real records or misrepresent transactions.

## Install

Content Edit & Blur is free, with no paid features or account. Optional sponsorship unlocks nothing.

- [Chrome](https://chrome.google.com/webstore/detail/content-edit-blur/adgnogkndmhcblbonkhgfbbngeghpboh)
- [Firefox](https://addons.mozilla.org/en-US/firefox/addon/content-edit-blur)
- [Edge](https://microsoftedge.microsoft.com/addons/detail/content-edit-blur/chlpcaigaedflhkfgmhkpknlcchkeodl)
- [Source](https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension)
