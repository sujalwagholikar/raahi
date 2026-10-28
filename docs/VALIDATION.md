# Validation record — 28 October 2026

- JavaScript syntax: passed with Node.
- Go: `go test -race ./...` and `go vet ./...` passed. Handler tests cover liveness, missing configuration, missing authorization, disallowed methods/origins, allowed preflight and malformed JSON.
- PostgreSQL/PGlite: schema applied and lifecycle/authorization tests passed. See `tests/database.mjs` for the reproducible suite.
- Browser: visually inspected management and customer/captain pages; corrected SVG namespace and insecure-context UUID compatibility; verified cross-tab booking, captain acceptance, arrival customer start-code verification, trip completion and captain approval.
- Native Android: both customer and captain debug APKs built successfully; signatures and package identities verified. See `releases/BUILD_STATUS.md`. Device behavior was not tested.
- Supabase public connection was supplied and its Auth settings endpoint returned 200; email signup is enabled and confirmation is required. The original project exposes a `profiles` table but lacks the old `rides` table; the app now uses isolated `raahi_` tables/functions. The Go backend has not been deployed to Vercel and no authenticated live ride was exercised. Full network integration, payment, KYC, notification delivery, background tracking, device behavior and load capacity are unverified.

Supabase integration update: URL/public key accepted by Auth settings; email confirmation is required. `public.raahi_rides` is missing remotely. Local tests verify the prefixed migration, preservation of existing unrelated `profiles`/function permissions, and unchanged ride authorization. Both v0.1.1 APKs rebuilt and their signatures verified. Generated connection values match across all clients and server defaults.
