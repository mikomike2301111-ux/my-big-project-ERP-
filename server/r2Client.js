/**
 * Cloudflare R2 S3-compatible object client.
 *
 * Required Vercel environment:
 *   R2_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID)
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME
 *
 * CLOUDFLARE_API_TOKEN is an account-management token, NOT an R2 S3 secret.
 * Do not use it to sign object operations. Object uploads/downloads use AWS
 * Signature V4 against the account's S3-compatible R2 endpoint.
 */
const crypto = require('crypto');

const ACCOUNT_ID = () => String(process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const ACCESS_KEY_ID = () => String(process.env.R2_ACCESS_KEY_ID || '').trim();
const SECRET_ACCESS_KEY = () => String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
const BUCKET = () => String(process.env.R2_BUCKET_NAME || 'farmtrack-erp').trim();
const REGION = 'auto';
const SERVICE = 's3';

function configured() {
  return Boolean(ACCOUNT_ID() && ACCESS_KEY_ID() && SECRET_ACCESS_KEY() && BUCKET());
}
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}
function awsEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
function canonicalPath(key) {
  return '/' + [BUCKET(), ...String(key).split('/')].map(awsEncode).join('/');
}
function objectUrl(key) {
  const host = ACCOUNT_ID() + '.r2.cloudflarestorage.com';
  return { host, url: 'https://' + host + canonicalPath(key), path: canonicalPath(key) };
}
function signingKey(secret, date) {
  const dateKey = hmac('AWS4' + secret, date);
  const regionKey = hmac(dateKey, REGION);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, 'aws4_request');
}
async function signedRequest(method, key, body, contentType) {
  if (!configured()) {
    throw new Error('R2 S3 credentials missing. Configure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME in Vercel.');
  }
  const payload = body == null ? Buffer.alloc(0) : (Buffer.isBuffer(body) ? body : Buffer.from(body));
  const { host, url, path } = objectUrl(key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256(payload);
  const headers = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(k => k + ':' + String(headers[k]).trim() + '\n').join('');
  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = date + '/' + REGION + '/' + SERVICE + '/aws4_request';
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(SECRET_ACCESS_KEY(), date), stringToSign, 'hex');
  const authorization = 'AWS4-HMAC-SHA256 Credential=' + ACCESS_KEY_ID() + '/' + scope +
    ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  const response = await fetch(url, {
    method,
    headers: { ...headers, Authorization: authorization },
    body: method === 'GET' || method === 'HEAD' ? undefined : payload,
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error('R2 ' + method + ' failed (' + response.status + '): ' + message.slice(0, 220));
  }
  return response;
}
async function putObject({ key, body, contentType = 'application/octet-stream' }) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const response = await signedRequest('PUT', key, buffer, contentType);
  const publicBase = String(process.env.R2_PUBLIC_BASE || '').replace(/\/$/, '');
  return {
    key,
    bucket: BUCKET(),
    size: buffer.length,
    contentType,
    etag: String(response.headers.get('etag') || '').replace(/"/g, ''),
    url: publicBase ? publicBase + '/' + String(key).split('/').map(awsEncode).join('/') : '/api/r2-file?key=' + encodeURIComponent(key),
    storage: 'r2',
  };
}
async function getObject(key) {
  const response = await signedRequest('GET', key, null);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
    key,
  };
}
async function deleteObject(key) {
  await signedRequest('DELETE', key, null);
  return { ok: true, status: 204 };
}
module.exports = { configured, putObject, getObject, deleteObject, bucketName: BUCKET };
