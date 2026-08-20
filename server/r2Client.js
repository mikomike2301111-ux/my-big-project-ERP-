/**
 * Cloudflare R2 storage via Account API (Bearer token).
 * Env:
 *   R2_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN (or R2_API_TOKEN)
 *   R2_BUCKET_NAME (default farmtrack-erp)
 * Optional: R2_PUBLIC_BASE for public CDN/custom domain URLs
 */
const ACCOUNT_ID = () => process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '';
const TOKEN = () => process.env.CLOUDFLARE_API_TOKEN || process.env.R2_API_TOKEN || '';
const BUCKET = () => process.env.R2_BUCKET_NAME || 'farmtrack-erp';

function configured() {
  return Boolean(ACCOUNT_ID() && TOKEN() && BUCKET());
}

function objectUrl(key) {
  const enc = String(key).split('/').map(encodeURIComponent).join('%2F');
  return `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID()}/r2/buckets/${BUCKET()}/objects/${enc}`;
}

async function putObject({ key, body, contentType = 'application/octet-stream' }) {
  if (!configured()) {
    throw new Error('R2 not configured. Set CLOUDFLARE_API_TOKEN, R2_ACCOUNT_ID, R2_BUCKET_NAME.');
  }
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const res = await fetch(objectUrl(key), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${TOKEN()}`,
      'Content-Type': contentType,
    },
    body: buffer,
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || json.success === false) {
    throw new Error(`R2 upload failed (${res.status}): ${JSON.stringify(json.errors || text).slice(0, 240)}`);
  }
  const publicBase = (process.env.R2_PUBLIC_BASE || '').replace(/\/$/, '');
  return {
    key,
    bucket: BUCKET(),
    size: buffer.length,
    contentType,
    etag: json.result?.etag || '',
    url: publicBase ? `${publicBase}/${key}` : `/api/r2-file?key=${encodeURIComponent(key)}`,
    storage: 'r2',
  };
}

async function getObject(key) {
  if (!configured()) throw new Error('R2 not configured');
  const res = await fetch(objectUrl(key), {
    method: 'GET',
    headers: { Authorization: `Bearer ${TOKEN()}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`R2 get failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType, key };
}

async function deleteObject(key) {
  if (!configured()) throw new Error('R2 not configured');
  const res = await fetch(objectUrl(key), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${TOKEN()}` },
  });
  return { ok: res.ok, status: res.status };
}

module.exports = { configured, putObject, getObject, deleteObject, bucketName: BUCKET };
