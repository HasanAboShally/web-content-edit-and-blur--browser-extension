# Organic growth checklist

Code, content and media in this repository are complete when their boxes are checked below. Store dashboards and launch platforms require the publisher's authenticated account and remain manual by design.

## Implemented in version 2.5.0 source

- [x] Neutral, non-modal review request after the third successful screenshot
- [x] Permanent local dismissal and no sentiment gating or requested star value
- [x] Browser-specific review destinations
- [x] Corrected Edit-mode first store screenshot
- [x] Five reproducible 1280×800 store screenshots
- [x] Reproducible 440×280 and 1400×560 promotional tiles
- [x] Reproducible captioned 1280×720 H.264 demo video source
- [x] Four canonical task guides with real product images
- [x] Sitemap, llms.txt and Markdown product index updated for every guide
- [x] Homepage guide links and README live-demo conversion path
- [x] GitHub description and discovery topics expanded
- [x] IndexNow key and post-deploy notification automation
- [x] Product Hunt, Show HN, social, press, outreach and curation drafts
- [x] Automated checks for review behavior, guide metadata, mobile reflow and media dimensions

## Before tagging version 2.5.0

- [ ] Review the review-prompt wording in a real unpacked Chrome, Firefox and Edge install
- [ ] Upload the latest listing copy and media drafts to all three store dashboards
- [ ] Change the Firefox listing license from MPL 2.0 to MIT, or document an intentional dual license
- [ ] Confirm Chrome and Edge visibility includes all intended markets
- [ ] Verify the GitHub Pages site in Google Search Console
- [ ] Select the verified website as Chrome's Official URL
- [ ] Complete Chrome publisher identity verification if still pending
- [ ] Upload `video/content-edit-blur-demo.mp4` to YouTube with advertisements disabled
- [ ] Add the resulting YouTube URL to Chrome and Edge listing drafts
- [ ] Upload `promo/small-promo-tile.png` and `promo/marquee-promo-tile.png`
- [ ] Run `npm run release:check`
- [ ] Run the authenticated all-store credential dry-run

## After all stores publish version 2.5.0

- [ ] Change the website's structured `softwareVersion` and smoke-test `storeVersion` from 2.4.0 to 2.5.0
- [ ] Change the homepage release badge from “Next” to the published release link
- [ ] Update llms.txt and index.md to call 2.5.0 the current store release
- [ ] Submit `sitemap.xml` in Google Search Console and Bing Webmaster Tools
- [ ] Submit the Chrome Featured nomination in `launch/curation-nominations.md`
- [ ] Email the Firefox Recommended nomination only after the license metadata is aligned
- [ ] Publish Product Hunt or Show HN from the maintainer's account, not both on the same day
- [ ] Use one task-specific social post and answer every substantive response
- [ ] Contact a small, individually researched set of relevant publications using `launch/outreach.md`

## Four-week measurement

Export Chrome Web Store metrics before each major listing change and compare equivalent four-week windows:

- impressions
- daily installs and uninstalls
- impression-to-install conversion
- retained installed users
- rating count and average
- country and language distribution
- store rank for: `blur webpage`, `redact screenshot`, `edit webpage`, `annotate webpage`, `webpage mockup`, `screen share privacy`, `visual bug report`

Change one major listing variable at a time. Do not add product analytics merely to measure this plan.
