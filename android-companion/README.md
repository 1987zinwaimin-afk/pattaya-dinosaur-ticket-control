# PDK Emergency Alarm Companion (Android)

This is a separate Android companion module. It does not replace or migrate the existing website, Supabase database, Firebase project, or production URLs.

## Safety boundaries
- Existing website and database are not modified by this module.
- Only authenticated Owner and active Normal Staff sessions may register for alarms.
- Event Staff must never receive or send emergency alarms.
- No existing ticket, payroll, attendance, visitor, or other operational data is copied into this app.
- The default alarm melody is recreated from the existing browser tone sequence (triangle waveform, 880/1175/1568 Hz); Android audio policy can still mute or restrict playback.

## Current foundation status
- Native Android project structure and Firebase Messaging receiver are scaffolded.
- The receiver ignores messages not marked `emergency_alarm` and checks the locally established role.
- Authenticated Supabase sign-in, server-side device-token registration, FCM server delivery, and signed release APK are intentionally not enabled until the server-side integration and Firebase app configuration are completed.

## Required integration before production use
1. Register a new Android app in the existing Firebase project `pattaya-dinosaur-ticket-desk` with package `com.pattayadinosaur.alarm`; download `google-services.json` into `app/` (never commit private service-account credentials).
2. Add a separate FCM device-token table and restrictive RLS policies in the existing Supabase project. Do not alter existing subscription tables.
3. Extend the existing authenticated Edge Function with explicit Android-token registration and FCM delivery. Preserve its Owner/Normal Staff allowlist and Event Staff exclusion.
4. Store Firebase Admin credentials only as Supabase Edge Function secrets, never in Android code or Git.
5. Complete account sign-in, token registration, device-role verification, and test delivery before publishing an APK.

## Build
Open this directory in Android Studio after adding the Firebase app configuration. A production APK must not be distributed until the server integration and real-device tests are complete.
