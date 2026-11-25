# Pattaya Dinosaur Kingdom — Native App Shell

This is a separate Capacitor project. It intentionally does not replace or modify the existing root Android QR Printer Bridge project.

## App flow

- Launch screen offers Owner and Staff entry points.
- Owner opens the existing Owner web app.
- Staff opens the existing Staff web app.
- Authentication, roles, Supabase and ticket records remain on the existing production backend.
- The app can be built against the Preview deployment or the Production domain.

## Build locally

Requirements: Node.js 22+, Android Studio/Android SDK for Android, and macOS with Xcode + CocoaPods for iOS.

```sh
cd native-app
npm install
npm run configure:preview
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```

For iOS, on macOS:

```sh
cd native-app
npm install
npm run configure:preview
npx cap add ios
npx cap sync ios
npx cap open ios
```

## GitHub Actions

Run **Build Native App Preview** manually. Select Preview to build against the current Preview URL. Production is available only as a deliberate workflow input and does not deploy the website.

The Android debug APK is unsigned for testing. A Play Store release needs a protected Android signing key.

The iOS workflow produces an unsigned Simulator build for technical validation. Installing on a physical iPhone or distributing through TestFlight/App Store requires an Apple Developer account, signing certificate, provisioning profile, and protected CI secrets.

## Important limitations for this first native wrapper

The Owner and Staff screens are loaded from the existing secure HTTPS web app so the database and login are not copied into a second app. Internet is required for sign-in and live data.

Existing browser Web Push is not automatically converted into native APNs/FCM push inside a Capacitor WebView. Native push support must be added and tested separately with Firebase/APNs credentials before relying on closed-app notifications in the native apps.
