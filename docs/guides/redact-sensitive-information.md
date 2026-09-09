# How to redact sensitive information before taking a screenshot

Canonical guide: https://hasanaboshally.github.io/web-content-edit-and-blur--browser-extension/guides/redact-sensitive-information.html

> Use Redact for secrets, identifiers and personal information. Blur changes how details look; redaction replaces the captured pixels with an opaque block.

## Blur and redaction are different

A blur preserves source pixels and spreads them across nearby pixels. It is useful for non-sensitive visual de-emphasis, but it is not secure removal.

Content Edit & Blur paints an opaque block over a selected element or rectangular area. The redaction remains undoable on the live page. In the final screenshot, the covered region contains replacement pixels rather than a blurred source.

## Workflow

1. Scan the visible page for names, email addresses, account numbers, financial values, internal URLs, tokens and API keys.
2. Open the toolbar, switch to Advanced and choose Redact.
3. Use Element for a clean page element or Area for a fixed rectangle over mixed content, images, charts or canvas.
4. Click or drag to apply each redaction. Existing privacy effects can be selected, changed or removed; Areas can be moved and resized.
5. Use Screenshot to capture the visible viewport. The toolbar, picker, editing handles and transient controls hide; finished privacy effects and annotations remain.
6. Open the saved PNG and inspect every edge before sending it.

## Scope and reload limits

A page rule follows the URL origin and path; query strings and fragments are ignored. A site rule follows one origin, not its subdomains. Query-based routes can therefore share one page scope.

Saved rules are a convenience, not a confidentiality control. Original content may appear before restoration completes. Pause sharing during reloads or navigation and verify every effect again. Sandboxed or opaque-origin frames remain session-only.

## Install

Content Edit & Blur is free, with no paid features or account. Optional sponsorship unlocks nothing.

- [Chrome](https://chrome.google.com/webstore/detail/content-edit-blur/adgnogkndmhcblbonkhgfbbngeghpboh)
- [Firefox](https://addons.mozilla.org/en-US/firefox/addon/content-edit-blur)
- [Edge](https://microsoftedge.microsoft.com/addons/detail/content-edit-blur/chlpcaigaedflhkfgmhkpknlcchkeodl)
- [Source](https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension)
