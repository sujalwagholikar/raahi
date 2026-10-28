# Supabase connection — configured project

The customer and captain APKs, all HTML panels, Go defaults and Vercel environment defaults now point to:

`https://ppbhckgibiwamftgnjgy.supabase.co`

The supplied publishable key is included in generated configuration. It is a public client key, not a database-owner credential. Do not replace it with a service-role/secret key in any web or Android file.

## Still required to enable real rides

1. Open this project in Supabase Dashboard → SQL Editor and run `database/001_schema.sql` once. It creates only `raahi_` application objects and scopes permissions to them. It does not reuse or revoke permissions on your existing `public.profiles` table.
2. Keep email/password Auth enabled. The live settings check showed email signup enabled, phone signup disabled and email confirmation required. Configure your email delivery/redirect settings as appropriate.
3. Sign up through the customer and captain portals after installing the schema. New accounts receive separate Raahi profiles. Existing Auth users need a deliberate Raahi profile insertion by the database owner; the migration does not import them automatically.
4. Promote the intended administrator using the commented `public.raahi_profiles` update in the migration after verifying that account's Auth UUID. Approval cannot be granted using signup metadata or the public key.
5. Deploy the repository to Vercel with the included configuration. The Go API uses the configured Supabase defaults; it still needs a deployed HTTPS origin.
6. For the static private preview, put that Vercel origin into `config/connection.json` → `apiBase`, run `python scripts/sync-connection.py`, and redeploy the web assets. When web and Go API are deployed together on Vercel, leave `apiBase` empty for same-origin requests.
7. In each APK, open Configure connection. Supabase URL and public key are prefilled. Enter your deployed Go API origin and save. Existing saved connection settings take precedence over updated APK defaults; use Configure connection to replace old saved values if necessary.
8. Approve the captain, go online, book as customer and validate acceptance → arrival → start code → completion using two real accounts.

The hosted preview remains a simulation by default. The public key cannot create SQL tables, install functions, promote administrators or deploy the Go API. No service-role key is needed in the client apps.

## Regenerate configuration

Edit `config/connection.json`, then run:

```sh
python scripts/sync-connection.py
```

This updates `dist/config.js`, `android/connection.properties`, `internal/config/public.go`, `.env.example` and the public connection environment entries in `vercel.json`. Gradle `-P` properties and Go environment variables remain supported overrides.
