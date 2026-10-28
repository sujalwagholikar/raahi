# FreshCart — premium grocery storefront

A responsive grocery storefront and staff dashboard built with semantic HTML, modular CSS, native JavaScript ES modules, TypeScript contracts, Rust Vercel Functions, and Supabase Postgres/Auth.

## Included

- `index.html` — animated storefront, search, category filters, sorting, product details, cart drawer, checkout, order confirmation, newsletter showcase.
- `admin.html` — Supabase Auth sign-in, order stats, order status management, inventory/stock/price management.
- `assets/css/` — separate base, reusable component, storefront, modal/cart/checkout, and admin styles.
- `assets/js/` — separate configuration, product catalogue, API access, cart state, UI utilities, storefront entry point, admin entry point.
- `src/ts/` — shared TypeScript contracts for product, cart, checkout, order, and admin API payloads.
- `api/` + `src/lib.rs` — Rust serverless endpoints for health, product catalogue, order creation, admin orders and inventory.
- `supabase/migrations/001_init.sql` — tables, indexes, Row Level Security, order RPC, stock handling, and starter catalogue.

## Supabase already configured

The supplied project URL and publishable key are integrated in `assets/js/config.js` and `.env.example`:

- URL: `https://ppbhckgibiwamftgnjgy.supabase.co`
- Key type: `sb_publishable_...` (public/browser-safe, used with RLS)

A local `.env.local` is included for convenience and is Git/Vercel-upload ignored; configure the server variables in the Vercel dashboard as well. The public/publishable key is **not** an admin credential. The admin panel uses Supabase Auth session tokens, and Postgres RLS checks the `public.admin_users` allowlist. Do not add a Supabase secret/service-role key to browser files.

## Set up Supabase (required for shared/real orders)

1. Open the Supabase SQL Editor for project `ppbhckgibiwamftgnjgy`.
2. Run all of `supabase/migrations/001_init.sql`. This creates the product catalogue, order tables, RLS policies and the `create_store_order(payload jsonb)` RPC.
3. In Supabase **Authentication → Users**, create the staff account that should administer the store. Disable public staff sign-ups in Auth settings if the project will be used beyond a showcase.
4. Copy the exact staff email into the allowlist using the SQL Editor (replace the email):

   ```sql
   insert into public.admin_users (user_id, email)
   select id, email from auth.users
   where lower(email) = lower('admin@example.com')
   on conflict (user_id) do update
   set email = excluded.email, is_active = true;
   ```

   Sign in at `/admin.html` using that account. A normal customer account is not an admin unless its UUID is in `admin_users` and active.
5. Check Supabase **Project Settings → API Keys** to verify the provided publishable key belongs to the same project. Keep RLS enabled.

### What order creation does

The storefront sends product SKUs and quantities to `/api/orders`. Rust validates the request, then calls the database RPC. The RPC looks up live prices and stock inside Postgres, locks products, checks availability, calculates delivery (₹39 under ₹499; free from ₹499), creates the order and order-item rows, and decrements stock in one transaction. The browser cannot set a trusted total.

Checkout currently offers **cash on delivery / demo checkout only**. No card, UPI, or other payment is charged. Add a verified payment provider before accepting prepaid orders.

## Deploy to Vercel

1. Push this folder to a Git repository and import it into Vercel, or deploy with the Vercel CLI.
2. In Vercel → Project → Settings → Environment Variables, set these for Development, Preview, and Production:

   ```dotenv
   SUPABASE_URL=https://ppbhckgibiwamftgnjgy.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_fEQE4MyRW6Z-9-UeK69MWQ_ONdH6Wv6
   ```

   These are server-side runtime settings for the Rust functions. The same public key is okay here; it does not bypass RLS. No privileged Supabase secret is needed by this starter.
3. Redeploy after setting the environment variables.
4. Visit `/api/health`. It should return `ok: true` and `supabaseConfigured: true`.
5. Visit `/` for the storefront and `/admin.html` for the staff panel.

The official Vercel Rust Functions runtime is currently documented as beta; see Vercel's current Rust runtime guide before production use: https://vercel.com/docs/functions/runtimes/rust

## Run locally

Install Rust, Node.js, and the Vercel CLI, then:

```bash
npm install
vercel dev
```

Open the local URL printed by Vercel. `vercel dev` is recommended because it runs the Rust API routes; a static server can display the storefront but cannot run the Rust endpoints.

If the API is unreachable on localhost, checkout can save a **browser-local demo order** in `localStorage`. These local preview orders are not sent to Supabase and will not appear in the deployed admin panel. The storefront falls back to a curated sample catalogue if `/api/products` is unavailable.

## Useful commands

```bash
npm run typecheck
cargo check
npm run dev
npm run deploy
```

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Health + whether server env vars are present |
| `/api/products` | GET | Public active product catalogue |
| `/api/orders` | POST | Validated order creation via the database RPC |
| `/api/admin/orders` | GET | List recent orders (requires approved admin JWT) |
| `/api/admin/orders` | PATCH | Change order status (requires approved admin JWT) |
| `/api/admin/products` | GET | Read inventory (requires approved admin JWT) |
| `/api/admin/products` | PATCH | Update price, stock, and availability (requires approved admin JWT) |

## Security / production checklist

- Keep all table RLS policies enabled; do not expose any secret/service-role key.
- Only allow trusted staff UUIDs in `public.admin_users`; secure the Supabase Auth project and turn off public admin sign-up.
- The current checkout is COD/demo, not a payment integration. For paid orders, add a provider such as Razorpay/Stripe with verified server-side webhooks and idempotency.
- Add order rate limiting / bot protection before a public launch, and verify your privacy, delivery, cancellation and tax requirements.
- Product photography and Google Fonts are remote assets; replace with hosted assets for a fully self-contained deployment if desired.
