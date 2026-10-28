# Android build result — v0.1.1 (version code 2)

Both debug APKs built successfully on 28 October 2026 using Gradle 8.9, Android Gradle Plugin 8.7.3, Kotlin 2.0.21, SDK 35 and a full JDK 17.

- `Raahi-Customer-debug.apk`: package `in.raahi.mobility.customer`
- `Raahi-Captain-debug.apk`: package `in.raahi.mobility.captain`

Both signatures verified using Android SDK `apksigner verify`. Minimum Android version: 8.0 (API 26). Target: API 35. SHA-256 checksums are in `SHA256SUMS`.

These are installable development APKs signed with a debug certificate. No device/emulator run or Play Store submission was performed. The supplied Supabase URL and publishable key are embedded in both flavors. Use **Configure connection** to add the HTTPS Go API origin after deploying the backend. Existing saved device settings take precedence over APK defaults. No real accounts or backend are bundled. Tokens remain in process memory; public connection settings persist.

For store distribution, configure your release signing credentials, complete device testing, provide privacy disclosures and build a release APK/AAB. Do not distribute debug builds as a production release.

Rebuilt with the supplied project configuration. The Raahi schema is not installed remotely; the last read-only `raahi_rides` probe returned PGRST205 (missing table). Install the supplied migration before real account/ride testing.
