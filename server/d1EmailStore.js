'use strict';

/**
 * D1-only persistence for email logs, click/open tracking, and preferences.
 * This module deliberately has no hosted-database fallback.
 */
const { d1Query, d1All, d1First } = require('./d1Client');

const SCHEMAS = [
  `CREATE TABLE IF NOT EXISTS email_logs (
    id TEXT PRIMARY KEY, recipient TEXT, sender TEXT, subject TEXT, module_source TEXT,
    reference_type TEXT, reference_id TEXT, status TEXT, tracking_id TEXT, error_message TEXT,
    sent_at TEXT, template TEXT, result TEXT, related_module TEXT, related_id TEXT,
    created_by TEXT, created_at TEXT, metadata TEXT, html_content TEXT,
    retry_count INTEGER DEFAULT 0, last_retry_at TEXT, sender_name TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS email_tracking (
    id TEXT PRIMARY KEY, recipient TEXT, sender TEXT, subject TEXT, module_source TEXT,
    reference_type TEXT, reference_id TEXT, metadata TEXT, sent_at TEXT,
    open_count INTEGER NOT NULL DEFAULT 0, click_count INTEGER NOT NULL DEFAULT 0,
    opened_at TEXT, last_clicked_at TEXT, delivered_at TEXT, failed_at TEXT,
    resend_id TEXT, error_message TEXT, status TEXT, updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS email_activities (
    id TEXT PRIMARY KEY, tracking_id TEXT, activity_type TEXT, ip_address TEXT,
    user_agent TEXT, link_url TEXT, timestamp TEXT, metadata TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS email_preferences (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, preferences TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`
];
let schemaPromise;
async function ensureSchema() {
  if (!schemaPromise) schemaPromise = (async () => {
    for (const sql of SCHEMAS) await d1Query(sql);
  })().catch(e => { schemaPromise = null; throw e; });
  return schemaPromise;
}

const TABLES = new Set(['email_logs', 'email_tracking', 'email_activities', 'email_preferences']);
const qi = s => {
  const value = String(s || '');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error('Invalid D1 email column');
  return '"' + value + '"';
};
const parseValue = value => decodeURIComponent(String(value || '').replace(/\+/g, ' '));
const jsonColumns = new Set(['metadata', 'preferences', 'result']);
function encodeValue(key, value) {
  if (value !== null && typeof value === 'object' && jsonColumns.has(key)) return JSON.stringify(value);
  if (value === undefined) return null;
  return value;
}
function parseResource(resource) {
  const raw = String(resource || '');
  const i = raw.indexOf('?');
  const table = (i < 0 ? raw : raw.slice(0, i)).replace(/^\/+/, '');
  if (!TABLES.has(table)) throw new Error('Unsupported D1 email table');
  return { table, params: new URLSearchParams(i < 0 ? '' : raw.slice(i + 1)) };
}
function whereFrom(params) {
  const clauses = [], values = [];
  for (const [key, raw] of params.entries()) {
    if (['select','order','limit','offset'].includes(key)) continue;
    const col = qi(key);
    const match = String(raw).match(/^(eq|gte|lte|gt|lt|ilike|is)\.(.*)$/s);
    if (!match) continue;
    const op = match[1], value = parseValue(match[2]);
    if (op === 'eq') { clauses.push(col + ' = ?'); values.push(value); }
    else if (op === 'gte') { clauses.push(col + ' >= ?'); values.push(value); }
    else if (op === 'lte') { clauses.push(col + ' <= ?'); values.push(value); }
    else if (op === 'gt') { clauses.push(col + ' > ?'); values.push(value); }
    else if (op === 'lt') { clauses.push(col + ' < ?'); values.push(value); }
    else if (op === 'is' && value === 'null') clauses.push(col + ' IS NULL');
    else if (op === 'ilike') { clauses.push('LOWER(' + col + ') LIKE LOWER(?)'); values.push(value.replace(/\*/g, '%')); }
  }
  return { sql: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', values };
}
async function d1EmailQuery(method, resource, body = null) {
  await ensureSchema();
  const { table, params } = parseResource(resource);
  const verb = String(method || 'GET').toUpperCase();
  if (verb === 'GET') {
    const selectRaw = params.get('select') || '*';
    const cols = selectRaw === '*' ? '*' : selectRaw.split(',').map(s => qi(s.trim())).join(', ');
    const where = whereFrom(params);
    let sql = 'SELECT ' + cols + ' FROM ' + qi(table) + where.sql;
    const order = params.get('order');
    if (order) {
      const m = order.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\.(asc|desc))?$/i);
      if (m) sql += ' ORDER BY ' + qi(m[1]) + (String(m[2] || 'asc').toLowerCase() === 'desc' ? ' DESC' : ' ASC');
    }
    const limit = Number(params.get('limit'));
    const offset = Number(params.get('offset'));
    if (Number.isFinite(limit) && limit >= 0) sql += ' LIMIT ' + Math.min(5000, Math.floor(limit));
    else if (Number.isFinite(offset) && offset > 0) sql += ' LIMIT 5000';
    if (Number.isFinite(offset) && offset > 0) sql += ' OFFSET ' + Math.floor(offset);
    const rows = await d1All(sql, where.values);
    return rows.map(row => {
      const copy = { ...row };
      for (const key of jsonColumns) if (typeof copy[key] === 'string') { try { copy[key] = JSON.parse(copy[key]); } catch {} }
      return copy;
    });
  }
  if (verb === 'POST') {
    const records = Array.isArray(body) ? body : [body || {}];
    for (const record of records) {
      const row = { ...record };
      if (!row.id) row.id = require('crypto').randomUUID();
      const cols = Object.keys(row).filter(k => row[k] !== undefined);
      if (!cols.length) continue;
      await d1Query('INSERT OR IGNORE INTO ' + qi(table) + ' (' + cols.map(qi).join(', ') + ') VALUES (' + cols.map(() => '?').join(', ') + ')',
        cols.map(k => encodeValue(k, row[k])));
    }
    return records;
  }
  if (verb === 'PATCH') {
    const row = body || {};
    const cols = Object.keys(row).filter(k => row[k] !== undefined);
    if (!cols.length) return [];
    const where = whereFrom(params);
    if (!where.sql) throw new Error('Refusing unfiltered D1 email update');
    await d1Query('UPDATE ' + qi(table) + ' SET ' + cols.map(k => qi(k) + ' = ?').join(', ') + where.sql,
      [...cols.map(k => encodeValue(k, row[k])), ...where.values]);
    return [];
  }
  if (verb === 'DELETE') {
    const where = whereFrom(params);
    if (!where.sql) throw new Error('Refusing unfiltered D1 email delete');
    await d1Query('DELETE FROM ' + qi(table) + where.sql, where.values);
    return [];
  }
  throw new Error('Unsupported D1 email operation');
}

async function upsertEmailPreference(email, preferences) {
  await ensureSchema();
  const id = String(email).trim().toLowerCase();
  await d1Query(
    'INSERT INTO email_preferences (id, email, preferences, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET preferences=excluded.preferences, updated_at=excluded.updated_at',
    [id, id, JSON.stringify(preferences || {}), new Date().toISOString()]
  );
  return { success: true };
}

module.exports = { d1EmailQuery, ensureEmailSchema: ensureSchema, upsertEmailPreference };
