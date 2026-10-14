'use strict';

/**
 * Legacy import compatibility only.
 * This project is Cloudflare D1-only. No hosted-database SDK or network fallback
 * is loaded from this module; callers must use server/d1Client.js.
 */
module.exports = {
  SUPABASE_URL: '',
  SUPABASE_SECRET: '',
  SUPABASE_PUBLISHABLE: '',
  SUPABASE_JWKS_URL: '',
  getServiceClient() { throw new Error('This ERP is D1-only. Use Cloudflare D1.'); },
  getAnonClient() { throw new Error('This ERP is D1-only. Use Cloudflare D1.'); },
  async probeSupabase() { return { ok: false, disabled: true, mode: 'cloudflare-d1-only' }; },
  supabaseEnabled: () => false
};
