# Release status and implementation boundaries

## Implemented

| Component | Behavior |
|---|---|
| Web | Dedicated HTML entries; responsive CSS; customer, captain and admin workspaces; simulation and live modes |
| Authentication | Supabase email/password registration and login, confirmation response handling and refresh |
| Authorization | Database roles, RLS reads, owner-only start-code access, admin-only captain reviews; mutations restricted to RPCs |
| Dispatch | Approved online captains see a shared request queue; manual acceptance locks the ride row; unique active-trip constraints prevent double assignment |
| Ride flow | Request → acceptance → arrival → code verification → in progress → completion; pre-trip cancellation; per-captain rejection |
| Fares | Server-calculated cash fare using approximate distance; bike/auto/cab rates in SQL |
| Operations | Approve/reject/suspend captains, reason logging, ride filters/search, CSV export, audit activity, gross-fare reports |
| Position | Explicit one-time captain location update; trip-scoped retrieval; web map shows last shared position |
| Safety | Trip-scoped SOS database record and audit event; explicitly no emergency dispatch |
| Android | Native customer/captain flavors, authentication, bookings, availability, ride actions, code verification, cash totals, browser map, one-time captain location |
| Deployment | Vercel Go function entrypoint and rewrites; local Go server; Android build workflow |

## Must be completed before a real launch

- The public Supabase connection is configured; Raahi schema installation, Vercel deployment, real-account acceptance testing, migrations/rollback, backup/restore drills and database monitoring.
- Phone OTP, account recovery UX, abuse detection, WAF/rate limits and start-code attempt throttling. The current 4-digit start code has no failed-attempt lockout.
- Verified KYC/document storage, access control for documents, background checks, onboarding review workflow and vehicle registration management. Approval buttons currently change an account flag; no identity verification is performed.
- Geocoding/search, authoritative road routes and ETA, city/geofence rules, nearby captain matching with PostGIS, availability heartbeat/expiry and dispatch offer expiry. Current dispatch is a global queue for online approved captains, not a nearest-driver optimizer.
- Customer identities and coordinates are visible to eligible online captains in available requests; reduce pre-acceptance data exposure and introduce minimal scoped offers before launch.
- Background navigation/tracking, live fleet markers, reliable delivery, FCM notifications and reconnect/offline behavior. The current map is illustrative until the street-map view is opened; there is no background location stream.
- Payments, commissions, refunds, tax documents, wallet/ledger, settlement reconciliation and payout operations. Gross cash fares are not an accounting ledger.
- A staffed safety operation, real escalation/notification delivery, support/ticketing and safety-alert resolution. Recording an SOS row does not summon help.
- Device/emulator tests, accessibility audit, Android release signing, privacy disclosures and app store submission. Native UI uses the Android system font; the requested three-font mix is applied to web.
- Cursor pagination (current web/API reads latest 100 rides), database query analysis, load tests, metrics/traces, SLOs, alerts and capacity planning. No throughput/latency claim has been benchmarked.
- Android uses preset Pune locations and opens maps externally. No arbitrary address search or embedded native map SDK.

The starter is useful for development and demonstrations. It is not represented as a finished ride-hailing business, audited financial system, emergency service or launch-approved production system.
