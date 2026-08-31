// Export the ERP bridge document (erp_state) from Supabase into stdout as JSON.
// Usage:
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
//   node cloudflare/export-erp-state.js > erp-state.json
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

(async () => {
  if (!url) { console.error('SUPABASE_URL is required'); process.exit(1); }
  if (!key) { console.error('SUPABASE_SERVICE_ROLE_KEY is required'); process.exit(1); }
  const env = await fetch(`${url}/rest/v1/erp_state?select=data&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Accept-Profile': 'public' }
  }).catch(e => { console.error('fetch failed:', e.message); process.exit(1); });
  if (!env.ok) { console.error('Supabase returned', env.status); const body = await env.text(); console.error(body.slice(0, 400)); process.exit(1); }
  const rows = await env.json();
  if (!rows || !rows.length || !rows[0].data) { console.error('No erp_state row found'); process.exit(1); }
  process.stdout.write(JSON.stringify(rows[0].data));
})();
