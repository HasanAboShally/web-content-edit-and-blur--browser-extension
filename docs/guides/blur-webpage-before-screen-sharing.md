# How to blur a webpage before screen sharing

Canonical guide: https://hasanaboshally.github.io/web-content-edit-and-blur--browser-extension/guides/blur-webpage-before-screen-sharing.html

> Use Blur only for non-sensitive visual de-emphasis. Use Redact for private information, verify the exact surface being shared, and pause sharing during every reload or navigation.

## Prepare first

Content Edit & Blur changes the webpage in your browser. It does not detect when Zoom, Google Meet, Microsoft Teams or a recorder begins sharing. Prepare the page before the audience can see it.

Saved page or site rules can restore a setup after reload, but original content may appear before restoration completes. Treat saved rules as a convenience rather than a confidentiality control.

## Workflow

1. Open the exact route, account state, filters and viewport that the audience will see.
2. Use Blur for non-sensitive content that should recede visually. Choose Soft or Strong and target an Element or Area.
3. Use Redact for customer data, credentials or any other sensitive information, regardless of whether the audience is internal or external.
4. In Advanced, use This page for an origin-and-path-specific rule. Use Whole site only when the same element should be affected across one origin.
5. Open menus, scroll and trigger every state you plan to demonstrate.
6. Share the prepared tab or window rather than the entire desktop when possible.

## Important limits

Redaction protects the captured visual; it does not delete the source value from the underlying webpage. Webpage effects also cannot cover the browser address bar, tab title, bookmarks, password-manager overlays or operating-system notifications.

## Install

Content Edit & Blur is free, with no paid features or account. Optional sponsorship unlocks nothing.

- [Chrome](https://chrome.google.com/webstore/detail/content-edit-blur/adgnogkndmhcblbonkhgfbbngeghpboh)
- [Firefox](https://addons.mozilla.org/en-US/firefox/addon/content-edit-blur)
- [Edge](https://microsoftedge.microsoft.com/addons/detail/content-edit-blur/chlpcaigaedflhkfgmhkpknlcchkeodl)
- [Source](https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension)
