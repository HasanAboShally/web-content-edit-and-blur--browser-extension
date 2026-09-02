# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub Security Advisories:
[**Report a vulnerability**](https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension/security/advisories/new)

Please include what an attacker could achieve, the steps to reproduce it, and the browser
and extension version. You'll get an initial response within a week. Fixes ship as a patch
release, and you'll be credited in the advisory unless you'd rather not be.

We aim to assess a confirmed report within 14 days and release an agreed fix as soon as it
is safe to do so. Timing depends on severity and browser-store review. Coordinated public
disclosure should wait until fixed versions are available to users.

## Supported versions

Only the latest release receives fixes. Browser stores auto-update, so users are generally
on the current version already.

## Local data and deletion

Rules, replacements and opted-in annotations are stored in the current browser profile's
extension-local storage. They remain until the user removes them, clears the extension's
site data, deletes the browser profile, or uninstalls the extension. Browser uninstall
normally removes that extension-local data. Content Edit & Blur has no server-side copy
and therefore cannot retain or recover it.

Users can remove page changes from the toolbar. To erase everything, use the browser's
extension settings to clear this extension's stored data or uninstall the extension.

## Threat model

This extension has broad privileges — `<all_urls>` host access, `scripting`, and the
ability to read and rewrite page content. That is inherent to what it does. It is also why
the following properties matter, and why a break in any of them is a genuine vulnerability:

| Property | What it means |
|---|---|
| **No network egress** | The extension makes no external requests of any kind. There is no telemetry, no analytics, no update ping. Any outbound request would be a vulnerability. |
| **Local storage only** | Everything lives in `chrome.storage.local`. Nothing is synced or uploaded. |
| **Origin isolation** | Rules for one origin must never be readable or applicable on another. Sandboxed frames (`about:blank`, `srcdoc`) have no real origin, so their rules are deliberately session-only rather than written to a bucket every site could see. |
| **Minimal always-on surface** | Only `context-target.js` (~24 lines) runs on every page, solely to remember the last right-clicked element. The full editing engine is injected only when you activate a mode. |
| **Redaction is irreversible** | Redact must genuinely destroy the visual content, not merely obscure it. A redaction that could be recovered from a screenshot is a vulnerability, not a cosmetic bug. |

### Particularly interesting to us

- Anything that lets a **page** detect, read, or drive the extension's state.
- Stored rules leaking across origins.
- Injected UI that a page can impersonate or manipulate.
- Content surviving a redaction or a screenshot capture.

### Out of scope

- Blur being reversible from an image. This is a documented property of blurring, which is
  precisely why **Redact** exists. Use Redact when content must not leak.
- Annotations shifting position when a page reflows. Known limitation — they use document
  coordinates.
- Requiring physical access to an already-unlocked browser profile.
