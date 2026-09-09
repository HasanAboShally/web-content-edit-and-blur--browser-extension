# Show HN draft

## Title

Show HN: Content Edit & Blur – edit, redact and annotate webpages locally

## Post

I maintain Content Edit & Blur, a free and open-source browser extension for preparing webpages for screenshots, mockups, bug reports and screen shares.

The workflow happens directly on the rendered page:

- edit text and replace images
- blur or hide elements, and blur or redact arbitrary rectangular areas
- annotate with arrows, shapes, highlights, freehand lines, notes and numbered steps
- save page-specific or site-wide rules in local browser storage
- capture the visible viewport after the extension hides transient controls

The distinction between blur and redaction became important as the project evolved. Blur is useful for visual de-emphasis, but it preserves source pixels. Redact replaces the captured region with an opaque block.

There is no account, analytics, remote code, backend or server processing. The extension does not transmit page content; the underlying website remains connected and may observe DOM changes. It is Manifest V3, ships as plain JavaScript without a bundler, and supports desktop Chrome, Firefox and Edge from one source tree. The test suite covers extension reloads, frames, rule persistence, annotation geometry and package differences across browsers.

It has been maintained since 2020. Public figures checked September 9, 2026 show 6,000 Chrome users, 3,712 Edge users and 86 Firefox average daily users. These figures can overlap across browsers.

Live demo and installs:
https://hasanaboshally.github.io/web-content-edit-and-blur--browser-extension/

Source:
https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension

I would especially appreciate feedback on the permissions model, the blur-versus-redact UX, and which visual communication workflow is still missing.

## Before posting

- Recheck the public store figures and remove them if stale.
- Link directly to the source near the top if the submission title or URL points to the website.
- Be available to answer technical questions for the rest of the day.
- Do not ask for upvotes.
