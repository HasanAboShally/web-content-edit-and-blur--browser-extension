# Store listing copy

## Title

Content Edit & Blur

## Short summary

Edit webpages for mockups and bug reports. Redact sensitive data, de-emphasize distractions and capture clean screenshots.

Chrome takes its summary from `manifest.json`, so the current package summary remains authoritative there.

## Description

Content Edit & Blur turns supported webpages into an editable workspace for product mockups, visual bug reports, screenshots, demos and screen shares.

Edit a headline, swap an image, soften a non-sensitive distraction, cover private values with an opaque redaction or annotate a walkthrough without leaving the page.

WHAT YOU CAN DO

- Edit text directly and replace every matching occurrence
- Replace page images with files from your computer
- Blur or hide non-sensitive elements, or redact private ones
- Draw blur areas for de-emphasis or solid blocks over private regions
- Annotate with arrows, circles, boxes, highlighter, freehand pen, text notes and numbered steps
- Move and resize annotations, and optionally keep new marks anchored through page reflow
- Use the smart picker to select parent or child elements precisely
- Undo and redo changes
- Save rules for one page or an entire site
- Review, rescope, delete, export and import rules
- Capture the visible viewport without the toolbar, picker, editing handles or transient controls; finished effects and annotations remain

BUILT FOR REAL WORK

Use it to prepare product mockups, communicate design changes, hide names or account data before sharing, mark up bug reports, create step-by-step guides and clean up pages for presentations.

Blur is useful for visual de-emphasis. For sensitive screenshots, use Redact, which paints an opaque block over the rendered content.

Essentials includes the everyday workflow, including Redact, Redo, boxes and freehand drawing. Advanced adds numbered Steps, site-wide scope, the rules panel and export/import. Everything is free, with no paid features or account; optional sponsorship unlocks nothing.

PRIVACY BY DESIGN

The extension has no backend and does not collect data, use analytics or transmit page content. Remembered changes remain in local browser storage. The underlying website remains connected and may observe DOM changes, so use staging or trusted pages for mockups. Annotations are session-only by default unless you enable Keep annotations after reload.

Open source:
https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension

Documentation and downloads:
https://hasanaboshally.github.io/web-content-edit-and-blur--browser-extension/

## Links

- Homepage: https://hasanaboshally.github.io/web-content-edit-and-blur--browser-extension/
- Support: https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension/issues
- Privacy: https://hasanaboshally.github.io/web-content-edit-and-blur--browser-extension/#privacy

## Icon

- Source artwork: `new-icon.png`
- Packaged/store icon: `../images/app-icon-128.png`

## Screenshots

1. `screenshots/01-edit-and-smart-pick.png`
   Caption: Edit webpage text for realistic mockups
2. `screenshots/02-blur-and-redact.png`
   Caption: Redact sensitive details or soften distractions before sharing
3. `screenshots/03-draw-to-blur.png`
   Caption: Draw, move and resize precise privacy areas
4. `screenshots/04-annotate-and-highlight.png`
   Caption: Highlight, explain and number each step
5. `screenshots/05-rules-and-site-scope.png`
   Caption: Save and manage page or site rules locally

## Promotional assets

- Small promotional tile: `promo/small-promo-tile.png` (440×280)
- Marquee promotional tile: `promo/marquee-promo-tile.png` (1400×560)
- Design philosophy and source: `promo-design.md`, `promo-card.html`

## Promo video

- Primary launch/explainer: `video/content-edit-blur-launch.mp4` (1920×1080, 47.25s, captioned, licensed music and SFX)
- Music-free master: `video/content-edit-blur-launch-no-bgm.mp4` (identical picture and SFX, no BGM)
- Editable Remotion source, storyboard, licenses and QA: `../videos/content-edit-blur-launch/`
- Functional fallback: `video/content-edit-blur-demo.mp4` (1280×720, captioned, no audio)
- Generate the launch film with: `npm run video:launch`
- Generate the functional fallback with: `npm run video:store`
- Upload to YouTube with advertisements disabled, then add its URL to Chrome and Edge listings.

## Launch assets

- Product Hunt thumbnail: `launch/assets/product-hunt-thumbnail.png` (240×240)
- Social profile image: `launch/assets/social-profile.png` (400×400)
- Product Hunt, Show HN, social, press, curation and outreach drafts: `launch/`

## Edge search terms

- edit webpage
- blur webpage
- redact screenshot
- annotate webpage
- product mockup
- visual bug report
- screen share privacy

## Categories

- Chrome: Workflow & Planning
- Edge: Productivity
- Firefox: Web Development, Appearance

## Draft version 2.5.0 highlights

- Optional element anchors keep saved annotations aligned through page reflow
- Clearer Keep annotations after reload setting and safe persistence resume
- Redact is now available in Essentials, with a reminder to use it for sensitive data
- One-time, neutral request for an honest review after three successful screenshots
- New practical guides for redaction, screen sharing, product mockups and bug reports
- Corrected Edit-mode store preview plus new promotional tiles and captioned video source

## Version 2.4.0 highlights

- Redesigned always-light toolbar with clearer Content and Privacy groups
- Direct Soft and Strong blur controls for elements and Areas
- Select, move, resize, restyle or explicitly remove privacy Areas and annotations
- Essentials and Advanced views replace the misleading Simple and Pro labels
- More reliable toolbar positioning, persistence controls and extension-reload recovery
