# Automated Publishing Setup Guide

This guide helps you set up automated publishing to Chrome Web Store, Firefox Add-ons, and Edge Add-ons.

## Prerequisites

1. Developer accounts for each store:
   - [Chrome Web Store Developer](https://chrome.google.com/webstore/devconsole/)
   - [Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/)
   - [Microsoft Partner Center](https://partner.microsoft.com/dashboard/)

2. Your extension must be manually published at least once to each store to get the required IDs.

## GitHub Secrets Required

Go to your repository → Settings → Secrets and variables → Actions → New repository secret

### Chrome Web Store

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `CHROME_EXTENSION_ID` | Your extension ID | From Chrome Web Store URL (e.g., `adgnogkndmhcblbonkhgfbbngeghpboh`) |
| `CHROME_CLIENT_ID` | OAuth2 Client ID | [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials |
| `CHROME_CLIENT_SECRET` | OAuth2 Client Secret | Same as above |
| `CHROME_REFRESH_TOKEN` | OAuth2 Refresh Token | See instructions below |

#### Getting Chrome Refresh Token

1. Create OAuth2 credentials in Google Cloud Console
2. Enable Chrome Web Store API
3. Use [chrome-webstore-upload](https://github.com/nicobytes/chrome-webstore-upload) to get refresh token:
   ```bash
   npx chrome-webstore-upload-keys
   ```

### Firefox Add-ons

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `FIREFOX_API_KEY` | JWT Issuer | [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/addon/api/key/) |
| `FIREFOX_API_SECRET` | JWT Secret | Same page as above |

### Edge Add-ons (Manual for now)

Edge Add-ons uses a more complex API. Currently, you can:
1. Build the extension locally or via GitHub Actions
2. Manually upload to [Partner Center](https://partner.microsoft.com/dashboard/)

For automated Edge publishing, consider using [publish-browser-extension](https://www.npmjs.com/package/publish-browser-extension).

## Usage

### Automatic Release

Push a tag to trigger automatic release:
```bash
git tag v2.0.0
git push origin v2.0.0
```

### Manual Release

1. Go to Actions → Build and Release Extension
2. Click "Run workflow"
3. Enter version number (e.g., `2.0.0`)

## GitHub Pages

The website at `docs/` is automatically deployed to GitHub Pages when you push to `main`.

Enable GitHub Pages:
1. Go to Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main`, folder: `/docs`

Your site will be available at:
`https://hasanaboshally.github.io/web-content-edit-and-blur--browser-extension/`

## Troubleshooting

### Chrome upload fails
- Check that your OAuth credentials are correct
- Ensure Chrome Web Store API is enabled
- Verify the extension ID matches

### Firefox upload fails
- JWT credentials expire - regenerate if needed
- Ensure your add-on GUID matches the one in the workflow

### Build fails
- Check that all required files exist
- Verify manifest.json is valid JSON
