# Raahi — connected mobility starter

Raahi is an original Rapido-inspired implementation, not an affiliated Rapido product. It includes a responsive operations console, customer and captain HTML portals, a Go HTTP API, a transactional PostgreSQL/Supabase schema and two native Kotlin Android application flavors.

**Release status: functional starter, not a production-ready transport service.** The hosted preview runs in simulation mode. The supplied Supabase project/public key are configured. The database migration, a Vercel backend deployment and operational integrations still need setup. Read `docs/RELEASE_STATUS.md` before using real accounts or rides.

## Open the web portals

- `dist/index.html` / `dist/admin.html`: management console, approvals, ride management, reporting and audit view.
- `dist/user.html`: customer bookings, ride status, start code, cancellation and safety alert recording.
- `dist/rider.html`: captain availability, acceptance/rejection, arrival, start-code verification, completion, gross cash fares and one-time position sharing.

Serve over HTTP instead of opening files with `file://`. Simulation records are stored in localStorage and shared between tabs on the same origin/browser. Simulation does not synchronize across devices or native applications. Live mode uses the shared database through the Go API.

Fonts: Manrope headings, Inter interface text, Roboto status labels. Google Fonts requires connectivity; local fallback fonts are provided.

## Start locally

Install Go 1.23.6+:

```sh
go test -race ./...
go vet ./...
go run ./cmd/server
```

Visit `http://localhost:8080`. The Go API uses the configured public Supabase defaults. Environment variables can override them. The UI starts in simulation mode until you switch it; live rides require the app migration and backend deployment.

## Connect the real database and authentication

1. Open the configured Supabase project and run `database/001_schema.sql` once in its SQL editor. Raahi tables/functions use the `raahi_` prefix and do not alter unrelated `public.profiles` objects or their permissions. The script is transactional; do not rerun it against an already installed Raahi schema.
2. Enable email/password authentication, configure confirmation URLs and mail delivery. Register customer/captain accounts using their corresponding portals. Accounts created before this migration need explicit profile backfill.
3. The supplied public connection is embedded in the Go defaults and `vercel.json`; optionally override it with `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the Go process environment. The API forwards the signed-in user's bearer token to Supabase; RLS and RPC transactions authorize operations. **No service-role key is required for application traffic. Schema installation needs your Supabase SQL editor.**
4. Supabase is already configured in the web and APKs. Set `apiBase` in `config/connection.json` to your deployed Go API origin and run `python scripts/sync-connection.py`. An empty value means same-origin API hosting on Vercel. Public publishable keys belong in the `apikey` header, not in a bearer token. The signed-in user token remains the bearer credential.
5. Promote one verified account with the commented SQL at the bottom of the migration. Signup metadata cannot create administrators.
6. Sign into the matching portal, switch to live mode, approve the captain with an administrator account, and go online.
7. Create a customer booking, accept it as captain, arrive, show the customer's start code, verify it as captain, and complete the ride.

If the web frontend is hosted on another origin, set `ALLOWED_ORIGINS` to a comma-separated list of exact HTTPS origins. Do not use wildcards. Native clients do not need CORS.

## Deploy Go + HTML to Vercel

Import this repository into Vercel. Select **Other**, leave the build command empty, and use `dist` as the output directory. `api/index.go` exports the HTTP handler; `vercel.json` rewrites `/v1/*` to it. The two public Supabase values are prefilled in `vercel.json`. Rebuild/redeploy after changing connection settings.

Verify `/v1/health`, then the authenticated end-to-end workflow above. The separate private Sites preview hosts static assets only; it does **not** run the Go API. A Vercel account/deployment was not created by this deliverable.

Durable state lives in PostgreSQL, not Go globals or serverless memory. No WebSocket availability assumptions are required: the web UI polls every 5 seconds and the Android home screen every 7 seconds while visible. This is not guaranteed real-time or a measured scaling SLA.

## Native Android applications

Open `android/` in Android Studio, use JDK 17, SDK 35 and Gradle 8.9. Two flavors create separate package IDs:

- `customerDebug`: `in.raahi.mobility.customer` — **Raahi**
- `captainDebug`: `in.raahi.mobility.captain` — **Raahi Captain**

```sh
cd android
./gradlew :app:assembleCustomerDebug :app:assembleCaptainDebug \
  -PAPI_BASE=https://YOUR-VERCEL-APP.vercel.app \
  -PAUTH_URL=https://YOUR-PROJECT.supabase.co \
  -PANON_KEY=YOUR_PUBLIC_ANON_KEY
```

On Windows, use `gradlew.bat` instead of `./gradlew`.

These are native Kotlin Activities and HTTP clients, not WebView wrappers. Maps open OpenStreetMap in the device browser. The captain app shares a recent cached position only when the user presses the location button and grants permission. It does not run a background tracking service. The supplied Supabase URL/public key are embedded in both APK flavors. Tokens stay in process memory and refresh while the app is running; users sign in again after process death. Customer trip start codes are fetched through an owner-only RPC.

You can also set the HTTPS API origin, Supabase project URL and public anon key on the apps’ **Configure connection** screen. These public connection settings persist on the device; tokens do not. Android projects without configured endpoints deliberately refuse live network calls. Debug APKs, if included in `releases/`, are developer builds with Supabase preconfigured; use Configure connection to add your Go API URL after deployment. Release builds need your own signing key; keep keystores out of version control. A CI workflow is included to build both debug variants. No emulator/device testing has been performed.

## Tests

```sh
go test -race ./...
go vet ./...
npm install
npm run check
npm run test:database
```

The database tests use PGlite, a PostgreSQL runtime, with a small mock of Supabase's `auth.uid()` and auth-user trigger table. They cover the migration, customer-role restrictions, idempotent booking, captain approval, competing acceptance, row visibility, lifecycle transitions, invalid codes, SOS insertion, forbidden direct profile updates and admin audit access. They do not substitute for tests against your real Supabase tenant, PostgREST or production concurrency/load tests.

## Research

Public Rapido sources informed the customer/captain distinction, captain accept/reject flow, onboarding review and safety UX:

- https://www.rapido.bike/CustomerTerms
- https://rapido.bike/RapidoSafetyGuidelines.pdf
- https://play.google.com/store/apps/details?id=com.rapido.rider
- https://vercel.com/docs/functions/runtimes/go

No proprietary Rapido code, assets or internal architecture were used. Research checked 28 October 2026. Transport permissions and launch requirements depend on the service and jurisdiction; obtain a specific launch review before operating.

## Current Supabase integration

Project: `https://ppbhckgibiwamftgnjgy.supabase.co`. Public connection values are centralized in `config/connection.json` and generated into web, Go, Android and Vercel defaults by `scripts/sync-connection.py`. The field named `supabaseAnonKey` / `ANON_KEY` is retained for compatibility and contains the supplied `sb_publishable_` key. No privileged key is bundled. See `docs/SUPABASE_SETUP.md` for the remaining steps.
