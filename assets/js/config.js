/**
 * Public browser configuration. Supabase publishable keys are designed to be exposed.
 * Protect all tables with RLS; never put a Supabase secret/service-role key here.
 */
export const CONFIG = Object.freeze({
  supabaseUrl: 'https://ppbhckgibiwamftgnjgy.supabase.co',
  supabasePublishableKey: 'sb_publishable_fEQE4MyRW6Z-9-UeK69MWQ_ONdH6Wv6',
  apiBase: '/api',
  storeName: 'FreshCart',
  freeShippingThreshold: 499,
  shippingFee: 39,
});
