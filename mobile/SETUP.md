# Visby Native Shell — Local Setup

The Capacitor config (`capacitor.config.ts`) and all plugin glue code are already
written. The steps below are things that can only be done on your local machine
(they require Xcode, Android Studio, and developer accounts).

## Prerequisites

- **Deployed web app** at `https://app.visby.me` (set `NEXT_PUBLIC_APP_URL` in
  your hosting env; the native shell loads this URL, so it must be live).
- **Apple Developer Program** ($99/year) — needed for iOS builds, TestFlight,
  and APNs push certificates.
- **Google Play Developer** account ($25 one-time) — needed for Android builds
  and the Play Store.
- **Xcode** (macOS only) installed from the App Store.
- **Android Studio** installed with an Android SDK.
- **Node ≥ 18** and the project's existing npm dependencies already installed.

## Steps

```bash
# 1. Add the iOS and Android targets (requires Xcode + Android Studio installed)
npx cap add ios
npx cap add android

# 2. Copy the web placeholder and sync all Capacitor plugins
npx cap sync

# 3. Open in Xcode to build + run on a simulator or device
npx cap open ios

# 4. Open in Android Studio to build + run on an emulator or device
npx cap open android
```

## Push notifications — additional config

### iOS (APNs)
1. In your Apple Developer account, create an **APNs Auth Key** (`.p8` file).
2. In Xcode, enable the **Push Notifications** capability on the app target.
3. Upload the `.p8` key to whichever service you use to send pushes (e.g.
   Firebase, OneSignal, or direct APNs).

### Android (FCM)
1. Create a Firebase project at <https://console.firebase.google.com>.
2. Add an Android app with bundle ID `me.visby.app`.
3. Download `google-services.json` and place it at `android/app/google-services.json`.
4. Follow the Capacitor Push Notifications guide for FCM:
   <https://capacitorjs.com/docs/apis/push-notifications>

## Universal links / deep links

- **iOS**: add `app.visby.me` to the Associated Domains entitlement
  (`applinks:app.visby.me`). Host `/.well-known/apple-app-site-association` on
  the web app (must return the correct JSON for your App ID).
- **Android**: add an `intent-filter` in `android/app/src/main/AndroidManifest.xml`
  for `https://app.visby.me`. Host
  `/.well-known/assetlinks.json` on the web app.

Both the `visby://` custom scheme and the `https://app.visby.me/...` universal
link scheme are already handled in `src/lib/native.ts`.

## Notes

- `npx cap add ios` / `npx cap add android` **cannot be run in CI** — they
  require Xcode and Android Studio to be installed locally.
- After any `npx cap sync`, open the native IDE to rebuild before running on a
  device.
- The push-token migration (`supabase/migration_push_tokens.sql`) must be run
  in the Supabase SQL editor before push registration will work in production.
