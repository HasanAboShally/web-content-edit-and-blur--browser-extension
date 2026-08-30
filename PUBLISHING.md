# Publishing

Releases are automated. Tag a version and the workflow verifies, builds, and
publishes to all three stores.

```bash
git tag v2.4.0 && git push origin v2.4.0
```

Everything below is one-time setup, plus how to check it works without shipping
anything.

## Before you start

Each store must have the extension published **manually once**. None of the APIs
can create a listing or edit store metadata (description, screenshots,
categories) — they only push new versions of something that already exists.

You need accounts on:

- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
- [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/)
- [Microsoft Partner Center](https://partner.microsoft.com/dashboard/)

## Secrets

Add these under **Settings → Secrets and variables → Actions**.

### Chrome — 5 secrets

| Secret | Where it comes from |
|---|---|
| `CHROME_EXTENSION_ID` | `adgnogkndmhcblbonkhgfbbngeghpboh` (the id in the store URL) — ✅ set |
| `CHROME_PUBLISHER_ID` | Developer Dashboard → Account → Publisher ID — ✅ set |
| `CHROME_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials |
| `CHROME_CLIENT_SECRET` | Same credential |
| `CHROME_REFRESH_TOKEN` | Minted by `npm run auth:chrome` |

In [Google Cloud Console](https://console.cloud.google.com):

1. **APIs & Services → Library** → enable **Chrome Web Store API**.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
3. Under **Authorised redirect URIs** add exactly `http://localhost:8976`.
4. **OAuth consent screen → publishing status → In production.** See the warning
   below; this step is not optional.

Then mint the token and store all three secrets in one step:

```bash
npm run auth:chrome
```

This opens your real browser for the consent click, receives the callback on
`localhost`, exchanges it, and pipes the values straight into `gh secret set`.
Nothing is printed, so no credential lands in your scrollback or shell history.
Add `--print` if you would rather handle the values yourself, or `--no-browser`
when running over SSH.

> [!WARNING]
> **Leave the consent screen in "Testing" and releases break after 7 days.**
> Google issues a refresh token that **expires in 7 days** for any external
> OAuth app in "Testing" status, unless the only scopes are name/email/profile —
> which excludes `chromewebstore`. The token works today, so the setup looks
> finished, and then a release fails a week later with a bare `invalid_grant`.
> Set the publishing status to **In production**. An "unverified app" warning on
> the consent screen is expected for a private app: choose **Advanced →
> Continue**. On a Workspace account, an **Internal** user type avoids both the
> expiry and the warning.

`CHROME_PUBLISHER_ID` is new. The Chrome Web Store API moved to v2 in October
2025, and v2 puts the publisher in the request path
(`/v2/publishers/{publisher}/items/{item}`). v1 has no announced shutdown date,
but its documentation is archived, so this repo targets v2.

### Firefox — 2 secrets

| Secret | Where it comes from |
|---|---|
| `FIREFOX_API_KEY` | [Developer Hub → API Keys](https://addons.mozilla.org/developers/addon/api/key/), the "JWT issuer" |
| `FIREFOX_API_SECRET` | Same page, the "JWT secret" — shown once |

The add-on id is *not* a secret and is not configured here. AMO identifies an
add-on by the GUID in its manifest, so `publish.mjs` reads it from the package it
is about to upload — the two cannot drift apart. `FIREFOX_ADDON_ID` is honoured
if set, but only to assert the expected value; a disagreement fails the run.

That GUID is `{ae036afb-d846-4f79-a308-13c6e8191129}`, in
`FIREFOX_GECKO_ID` in `scripts/build.mjs`. AMO generated it when v1.3.0 was
uploaded without an explicit id, and every installed copy is keyed to it.
Changing it would orphan existing users rather than update them.

### Edge — 3 secrets

| Secret | Where it comes from |
|---|---|
| `EDGE_PRODUCT_ID` | Partner Center → your extension → Extension overview |
| `EDGE_CLIENT_ID` | Partner Center → Publish API → API credentials |
| `EDGE_API_KEY` | Same page |

`EDGE_PRODUCT_ID` is **not** the id in the store URL. That URL carries the
extension id (`chlpcaigaedflhkfgmhkpknlcchkeodl`); the API wants the Product ID
from Partner Center, which is a GUID.

Edge's original API stopped working on **31 December 2024**. The current scheme
sends the key directly as `Authorization: ApiKey …` alongside an `X-ClientID`
header, with no token exchange. Both ids must be GUIDs; the publish script
rejects anything else before calling the API, because Partner Center's own error
for a malformed id is an unexplained `400`.

## Check it without publishing

The dry run resolves credentials, verifies the built package really contains the
version it claims, and makes one authenticated read-only call per store. Nothing
is uploaded.

```bash
npm run build:all
node scripts/publish.mjs all --dry-run
```

From GitHub: **Actions → Release → Run workflow**, leave *dry run* ticked.

Missing credentials are reported all at once, per store, rather than one failure
at a time:

```
  [chrome] missing 5 credentials for chrome: CHROME_CLIENT_ID, …
```

## Release-day order

The package APIs and the listing dashboards are separate systems. A tag uploads
code, but it does not write descriptions, screenshots, search terms or privacy
answers. Use this order so the package and its listing enter review together:

1. Update `manifest.json`, `package.json` and `CHANGELOG.md`, then run
   `node scripts/preflight.mjs vX.Y.Z`, `npm test`, `npm run check` and
   `npm run build:all`.
2. Update each store's listing draft. Keep the reusable copy, source icon and
   screenshots in `store-assets/` so the three stores do not drift.
3. Run the GitHub **Release** workflow manually with `dry_run=true` and
   `stores=all`. Do not tag until all three credential probes pass.
4. If the manifest adds permissions, see the Chrome two-phase note below before
   tagging.
5. Commit and push the release state, then create and push the version tag.
6. Verify the result in each store dashboard. The workflow result is evidence,
   but the dashboard is the source of truth for `Pending review`, `In review`,
   `Approved` and live versions.

### Chrome permission changes are two-phase

Chrome does not expose justification fields for new manifest permissions until
the package containing those permissions has been uploaded. That means a tag run
can successfully upload a new version and then fail at `:publish` because the new
Privacy fields are blank.

If that happens:

1. Open **Package** and confirm the intended version is present as the draft.
2. Open **Privacy** and complete every newly displayed permission justification.
   Save the draft and confirm there are no invalid fields.
3. Submit the existing draft for review from the dashboard. Do **not** upload the
   same version again or create another tag.
4. A broad-host-permission warning is expected when `<all_urls>` is intentional;
   confirm it only after verifying the justification matches the implementation.

The original Actions run remains red after a manual recovery because workflow
conclusions are immutable. A red historical run does not mean the repaired store
submission is still failing; check the Chrome item status directly.

### Store dashboard details learned from 2.3.0

- **Chrome:** title and summary come from the package. Description, screenshots,
  links and privacy answers come from the saved dashboard draft.
- **Firefox:** listing metadata is independent of version upload. Preserve the
  generated add-on GUID. A listed version may be approved immediately even while
  Chrome and Edge remain in review.
- **Edge:** complete both **Store listings** and **Privacy** before submission.
  The Publish API submits the current Partner Center draft with the package, so
  do not also click the dashboard's top-level Publish button.
- **Edge legacy media:** migrated screenshot records may have inert delete
  controls. Prefer the UI, but Partner Center's own authenticated operation is
  `DELETE .../listings/Assets/{assetId}`. Identify the exact record from
  `GET .../listings/Assets?summaryId=...`, delete one record at a time, and
  refetch after every mutation. Never guess or bulk-delete asset IDs.
- **Dashboard automation:** Chrome and Edge use animated custom controls. If a
  visible control never becomes "stable", invoke the actual host element once
  and verify the resulting network request or server state before continuing.
- **GitHub monitoring:** use one `gh run watch` process or the public Actions
  page. Repeated polling loops can trigger GitHub's secondary Actions API limit
  even when the core API quota still appears healthy.

## What a release does

```
verify ──┐
         ├──→ build ──→ publish (chrome │ firefox │ edge)
test ────┘
```

1. **verify** — `scripts/preflight.mjs` requires the tag, `manifest.json`,
   `package.json`, and a `CHANGELOG.md` heading to agree; then static checks.
2. **test** — the Playwright suites, in a real browser.
3. **build** — three ZIPs, `scripts/verify-packages.mjs` confirms their contents,
   then a GitHub Release with the ZIPs attached.
4. **publish** — one job per store, so a single store can be re-run on its own
   without republishing to the others.

Publishing cannot start unless the tests pass, and a store rejecting an upload
fails the run. There is no `continue-on-error` anywhere in the release workflow.

### The version comes from the repo, not the tag

`scripts/build.mjs` writes the version it is given into the packaged manifest, so
a mistyped tag would otherwise ship a package claiming a version nothing in the
repo has. Preflight makes the tag agree with the committed files instead.

To release: bump `manifest.json` and `package.json`, add the `CHANGELOG.md`
section, commit, then tag. Check it first:

```bash
node scripts/preflight.mjs v2.4.0
```

## Publishing by hand

```bash
node scripts/publish.mjs chrome --version 2.4.0
node scripts/publish.mjs all --upload-only         # upload, don't submit
node scripts/publish.mjs edge --notes "Fixes ..."  # notes for reviewers
```

The same script runs in CI, so a failing release can be reproduced locally.

## Review times

Chrome and Edge go live automatically once review passes. Firefox may approve a
listed version immediately or send it to human review. `--upload-only` uploads
without submitting, which is useful if you want to check the listing before it
goes out.

## Troubleshooting

**`Unknown JWT iss (issuer)`** — `FIREFOX_API_KEY` is wrong. It looks like
`user:12345:67`, not a bare number.

**Firefox `409`** — AMO already has that version. Bump and re-tag; a version
number cannot be reused even if the previous upload was rejected.

**Chrome `invalid_grant`** — the refresh token expired, was revoked, or was
minted against a different client. Nine times out of ten the consent screen is
still in **Testing** status, which expires refresh tokens after 7 days. Set it to
**In production**, then re-run `npm run auth:chrome`.

**Chrome `invalid_client`** — the OAuth client was deleted, or the refresh token
was minted against a different client. Re-run `npm run auth:chrome`.

**Chrome `redirect_uri_mismatch` while minting** — `http://localhost:8976` is not
in the OAuth client's authorised redirect URIs. It must match exactly, with no
trailing slash.

**`npm run auth:chrome` returns an access token but no refresh token** — the
account has already granted this client access. Revoke it at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions) and
run it again.

**Chrome 404 on publish** — `CHROME_PUBLISHER_ID` is missing, or belongs to a
different account than the extension.

**Chrome publish refused after a dashboard change** — the API always publishes
with the *existing* visibility settings. If you changed visibility in the
Developer Dashboard, you have to publish manually once before the API will work
again.

**Chrome upload rejected without a clear reason** — the version has to be higher
than the one already in the store. The API will not overwrite a published
version.

**Chrome package uploaded but publish failed** — open **Package** first. If the
new version is already the draft, do not upload it again. Check **Privacy** for
blank justification fields introduced by new permissions, save them, then submit
that existing draft.

**The tag workflow is red but the store says Pending review** — a failed Actions
run keeps its original conclusion after manual recovery. Trust the store's
current status and record the recovery; do not create a replacement version just
to make the old workflow green.

**Edge `403`** — the API key is wrong or expired. Keys are shown once, and
Partner Center allows two at a time so you can rotate without downtime.

**Edge listing says a step is incomplete** — package credentials are unrelated
to listing completeness. Open the draft and complete **Store listings** and
**Privacy** before submitting the package.

**`version mismatch: … contains manifest version X, expected Y`** — `dist/` is
stale. Rebuild.

## The website

`docs/` deploys to GitHub Pages through `.github/workflows/pages.yml` on every
push to `master` that touches `docs/`, `images/`, or that workflow. It is a
GitHub Actions deployment, not "deploy from a branch", so **Settings → Pages →
Source** must be set to **GitHub Actions**.

<https://hasanaboshally.github.io/web-content-edit-and-blur--browser-extension/>
