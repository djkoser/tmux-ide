# Releasing tmux-ide Desktop

`electron-builder.yml` is configured for Developer ID signing, hardened runtime, Apple notarization through App Store Connect API keys, GitHub Release publishing, and `electron-updater` metadata. Pre-1.0 desktop releases are currently marked as GitHub prereleases; switch `publish.releaseType` to `release` for v1.0.0 and later.

One-time setup:

1. Apple Developer Account ($99/yr) — assumed already in place
2. Generate a **Developer ID Application** signing cert in Xcode (Apple ID → Manage Certificates → +). Export as `.p12` from Keychain Access (right-click cert + key → Export 2 items). Pick a strong password.
3. base64-encode the .p12: `base64 -i tmux-ide.p12 | pbcopy`. Paste as GitHub secret `CSC_LINK`. Add the password as `CSC_KEY_PASSWORD`.
4. Generate an **App Store Connect API key** at `appstoreconnect.apple.com` → Users and Access → Integrations → Team Keys → +. Role: Developer (or higher). Download the .p8 file. Note the Key ID and Issuer ID.
5. base64-encode the .p8: `base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy`. Paste as GitHub secret `APPLE_API_KEY_BASE64`. Add the Key ID as `APPLE_API_KEY_ID` and Issuer ID as `APPLE_API_ISSUER`.
6. Create an npm automation token at `https://www.npmjs.com/settings/<user>/tokens` (Type: "Automation"). Paste it as GitHub secret `NPM_TOKEN`; automation tokens skip 2FA prompts in CI.
7. Cut a release: `git tag v0.1.0 && git push --tags`. Workflow runs, signs, notarizes, uploads to a draft GitHub Release, and publishes npm packages. Promote the release in the GitHub UI when ready.

Local notarized smoke:

Create `app-electron/.env.notarize` with the same values used in GitHub secrets:

```sh
CSC_LINK=...
CSC_KEY_PASSWORD=...
APPLE_API_KEY_BASE64=...
APPLE_API_KEY_ID=...
APPLE_API_ISSUER=...
```

Then run:

```sh
node app-electron/scripts/notarize-local.mjs
```

The local script builds the dashboard static export, builds the Electron main/preload bundle, then runs `electron-builder --mac --publish never`. If signing/notarization variables are missing, electron-builder falls back to the local keychain identity or unsigned local packaging behavior.
