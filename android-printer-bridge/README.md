# PDK MP58-16 Direct QR Printer

Android companion app for Pattaya Dinosaur Kingdom Customer Visits. It receives a `pdkprinter://print` deep link from the existing Owner website and sends a compact ESC/POS receipt with a native printer QR command over Bluetooth Classic SPP.

## Current integration

- Android package: `com.pattayadinosaur.printerbridge`
- Deep link: `pdkprinter://print?payload=PDKCV%3A<record-uuid>&group=14&people=2&entry=15%20NOV%202026%2011%3A28%20PM`
- Default paired printer address: `DC:0D:51:FB:1B:C2` (MP58-16 supplied by the owner)
- Bluetooth transport: RFCOMM SPP UUID `00001101-0000-1000-8000-00805F9B34FB`
- Paper: 58mm, ESC/POS
- QR: printer-native QR command, Model 2, module size 6, error correction M

## Receipt layout

- Centered bold title: PATTAYA DINOSAUR KINGDOM
- CUSTOMER VISIT PASS
- Large Group Number
- Centered native QR
- Visitor count
- Entry date/time (wrapped only if needed)
- SCAN QR AT EXIT
- THANK YOU

The receipt uses printer-native text and QR commands instead of browser PDF rendering, to avoid the letter spacing, clipping, and scaling shown by the old browser print flow.

## Pairing and first setup

1. Pair MP58-16 in Android Bluetooth settings.
2. Install the APK built by the GitHub Actions workflow.
3. Open PDK QR Printer once and grant Nearby devices / Bluetooth permission.
4. Select MP58-16 and tap Save selected printer once.
5. The Owner Customer Visits page can then launch the app using the deep link after Check-in & Save.

## Build

The workflow `Build PDK Printer Bridge APK` builds `app-debug.apk` and uploads it as a workflow artifact. This feature branch is isolated from production; do not merge or deploy until the APK builds and a real MP58-16 print test succeeds.

## Safety

- This app does not write to Supabase or change ticket/customer data.
- It only prints the payload and visit details passed from the existing website.
- It does not auto-check-out a group.
- Confirm that the QR scans correctly before using it with customers.
