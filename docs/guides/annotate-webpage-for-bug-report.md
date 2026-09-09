# How to annotate a webpage for a useful bug report

Canonical guide: https://hasanaboshally.github.io/web-content-edit-and-blur--browser-extension/guides/annotate-webpage-for-bug-report.html

> Show the whole relevant region, mark one primary problem, and attach reproduction details that an image cannot contain.

A circle, box or arrow removes ambiguity about the failing control. A highlight identifies incorrect copy. Numbered Steps explain a short order of operations. Annotations are session-only by default unless Save annotations too is enabled.

## Workflow

1. Reproduce the failure and keep the viewport, zoom, account role and relevant filters unchanged.
2. Choose one primary mark: a circle or box for a region, an arrow for a target, or the highlighter for copy.
3. Use numbered Steps in Advanced only when the order matters, and explain those numbers in the written reproduction steps.
4. Blur only non-sensitive values that should recede visually. Use Redact for customer details, credentials or any other sensitive information.
5. Use Screenshot to capture the visible viewport without the toolbar, picker, editing handles or transient controls. Finished annotations and privacy effects remain.

## Context to attach separately

Content Edit & Blur does not collect console output, network requests or environment details. Add these when relevant:

- expected and actual behavior
- minimal reproduction steps
- page URL or route with secrets removed
- browser and extension versions
- viewport or device class
- console or network evidence

Use Edit only to construct a proposed fix or separate explanation. Preserve an untouched capture of the actual failure when fidelity matters.

## Install

Content Edit & Blur is free, with no paid features or account. Optional sponsorship unlocks nothing.

- [Chrome](https://chrome.google.com/webstore/detail/content-edit-blur/adgnogkndmhcblbonkhgfbbngeghpboh)
- [Firefox](https://addons.mozilla.org/en-US/firefox/addon/content-edit-blur)
- [Edge](https://microsoftedge.microsoft.com/addons/detail/content-edit-blur/chlpcaigaedflhkfgmhkpknlcchkeodl)
- [Source](https://github.com/HasanAboShally/web-content-edit-and-blur--browser-extension)
