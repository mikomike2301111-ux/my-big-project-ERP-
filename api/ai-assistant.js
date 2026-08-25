const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || '12000', 10);

const OR_MODELS = [
  'deepseek/deepseek-v4-flash',
  'qwen/qwen3.5-27b',
  'deepseek/deepseek-chat',
];

// ─── Optional RPC import ───────────────────────────────────────────────
let invokeRpc = null;
try {
  const rpc = require('./rpc.js');
  invokeRpc = rpc.invokeRpc || null;
} catch (e) {
  console.warn('[AI] rpc.js not loaded:', e.message);
}

// ─── CORS helper ──────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ─── Body parser ───────────────────────────────────────────────────────
async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

// ─── ERP Context ──────────────────────────────────────────────────────
const MODULE_RPC_MAP = {
  dashboard: 'getDashboardData',
  sales: 'getSalesWorkspaceData',
  inventory: 'getInventoryWorkspaceData',
  manufacturing: 'getManufacturingWorkspaceData',
  production: 'getManufacturingWorkspaceData',
  finance: 'getFinanceWorkspaceData',
  accounts: 'getFinanceWorkspaceData',
  crm: 'getCRMWorkspaceData',
  procurement: 'getProcurementWorkspaceData',
  hr: 'getHRWorkspaceData',
  human_resources: 'getHRWorkspaceData',
  settings: 'getSettingsWorkspaceData',
  reports: 'getReportCenterData',
  analytics: 'getAnalyticsData',
  email: 'getEmailLog',
  notifications: 'getNotificationCenterData',
  visits: 'getVisits',
};

async function getNotificationsBrief(user) {
  if (!invokeRpc) return '';
  try {
    const data = await invokeRpc('getNotificationCenterData', user ? [user, { category: 'all' }] : [{ category: 'all' }]);
    const alerts = Array.isArray(data?.alerts) ? data.alerts.slice(0, 12) : [];
    const stats = data?.stats || {};
    const lines = alerts.map(a => `- [${a.priority || 'medium'}] ${a.title}: ${(a.message || '').slice(0, 120)} (${a.sourceModule || a.category || 'ops'})`);
    return [
      `Notification stats: total=${stats.total || alerts.length}, unread=${stats.unread || 0}, critical=${stats.critical || 0}.`,
      lines.length ? `Active alerts:\n${lines.join('\n')}` : 'No active alerts.'
    ].join('\n');
  } catch (e) {
    return `Notifications unavailable: ${e.message}`;
  }
}

async function searchErpEntities(user, query) {
  if (!invokeRpc || !query || query.length < 2) return '';
  const q = String(query).toLowerCase();
  const tokens = q.split(/\s+/).filter(t => t.length > 2).slice(0, 6);
  if (!tokens.length) return '';
  try {
    const crm = await invokeRpc('getCRMWorkspaceData', user ? [user, {}] : [{}]);
    const customers = Array.isArray(crm?.customers) ? crm.customers : [];
    const leads = Array.isArray(crm?.leads) ? crm.leads : [];
    const calls = Array.isArray(crm?.calls) ? crm.calls : [];
    const match = (row) => {
      const hay = `${row.name || ''} ${row.customerName || ''} ${row.phone || ''} ${row.email || ''} ${row.company || ''} ${row.salesOwner || ''} ${row.salesPerson || ''}`.toLowerCase();
      return tokens.some(t => hay.includes(t));
    };
    const hitCustomers = customers.filter(match).slice(0, 8).map(c => ({
      name: c.name, phone: c.phone, type: c.type, city: c.city,
      salesOwner: c.salesOwner || c.salesPerson, status: c.status, orders: c.orders, balance: c.balance
    }));
    const hitLeads = leads.filter(match).slice(0, 5).map(l => ({
      name: l.name, company: l.company, stage: l.stage, value: l.value, assignedTo: l.assignedTo
    }));
    const hitCalls = calls.filter(match).slice(0, 5).map(c => ({
      name: c.customerName, stage: c.stage, date: c.date || c.followUpDate, comments: (c.comments || c.notes || '').slice(0, 80)
    }));
    if (!hitCustomers.length && !hitLeads.length && !hitCalls.length) return 'Search: no customer/lead/call matches for the query tokens.';
    return [
      hitCustomers.length ? `Matched customers:\n${JSON.stringify(hitCustomers, null, 2)}` : '',
      hitLeads.length ? `Matched leads:\n${JSON.stringify(hitLeads, null, 2)}` : '',
      hitCalls.length ? `Matched calls/follow-ups:\n${JSON.stringify(hitCalls, null, 2)}` : ''
    ].filter(Boolean).join('\n');
  } catch (e) {
    return `Search unavailable: ${e.message}`;
  }
}

async function getERPContext(module, user, query = '') {
  if (!invokeRpc) return '';
  try {
    const mod = String(module || 'dashboard').toLowerCase();
    const fn = MODULE_RPC_MAP[mod] || 'getDashboardData';
    const role = (user && (user.role || user.Role)) || 'Viewer';
    const [data, notifBrief, searchHits] = await Promise.all([
      invokeRpc(fn, user ? [user] : []),
      getNotificationsBrief(user),
      searchErpEntities(user, query)
    ]);
    const copy = JSON.parse(JSON.stringify(data || {}));
    ['users', 'products', 'customers', 'inventory', 'sales', 'invoices', 'employees', 'rawMaterials', 'orders', 'leads', 'calls'].forEach(k => {
      if (Array.isArray(copy[k]) && copy[k].length > 40) {
        copy[k] = copy[k].slice(0, 40);
        copy[k]._truncated = true;
      }
    });
    const body = JSON.stringify(copy, null, 2).slice(0, 6000);
    return [
      `CURRENT PAGE MODULE: ${mod}`,
      `USER ROLE: ${role}`,
      `PAGE DATA (read-only):\n${body}`,
      `--- NOTIFICATIONS (full access for guidance; actions only allowed on notifications page) ---`,
      notifBrief,
      searchHits ? `--- SEARCH RESULTS ---\n${searchHits}` : ''
    ].filter(Boolean).join('\n\n');
  } catch (e) {
    return `ERP context unavailable: ${e.message}`;
  }
}

// ─── System Prompt ────────────────────────────────────────────────────
function systemPrompt() {
  return `You are the FarmTrack ERP Guide Assistant for Farmtrack Biosciences Ltd.
Today's date is ${new Date().toISOString().slice(0, 10)}.

YOUR ROLE — GUIDE ONLY
- You explain, search, and guide. You do not perform ERP work on behalf of the user.
- You never create, edit, delete, approve, post, import, or send records — except when the user is on the Notifications page, where you may guide how to acknowledge, snooze, or prioritise alerts, and you may interpret alert content with full access to notification data.
- Outside Notifications you only describe steps the human should take in the UI.

HOW MANUFACTURING WORKS AT FARMTRACK (explain this clearly when asked)
1) Raw materials & packaging live under Manufacturing → Materials / Packaging. Stock is received into Njiru Store and raw stores. Receiving creates batches with lot/expiry.
2) Production order: Manufacturing → Orders → New Production Order. Enter product + planned qty. Status flows: Planned → In Progress → Completed (or Cancelled).
3) Before or during production, staff can Request from Inventory. Inventory issues stock; quantities are subtracted and linked to the order (consumption records).
4) On the shop floor: start order, record output (good qty), waste/scrap, and quality checks. Waste goes to Waste tab and can raise a notification.
5) Completed output should increase finished-goods inventory so Sales can sell it. Traceability links batch → materials used → QC → finished goods.
6) Costs: material + labour + overhead + machine + utilities roll into batch cost and cost per unit. Capacity/calendar/downtime track machine availability.
7) Typical path to teach a new operator: Materials stocked → Create order → Request materials → Produce → QC → Complete → Finished stock available.
Always use real numbers from PAGE DATA when explaining status (orders, available materials, waste). If arrays are empty, say manufacturing has no live orders/materials yet and guide them to add data.

PAGE-AWARE ANSWERS
- Always answer for the CURRENT PAGE MODULE in the ERP context.
- Prefer data from that module. If the user asks about another module, say which page to open and what they will see there.
- Do not invent numbers. If data is missing or empty, say so clearly.

DATABASE / SEARCH
- You may use page data and search results (customers, leads, calls, stock, invoices, employees) that appear in the ERP context.
- When the user asks for a customer or name, use SEARCH RESULTS and page data. If nothing matches, say no match was found.

ROLE-BASED ACCESS
- Respect USER ROLE in the context. Do not expose admin-only settings guidance to lower roles beyond what their page allows.
- Never claim access to systems outside this ERP.

TRUTH RULES
- Speak the truth. If you do not know, say you do not know.
- Never invent balances, stock, or employee records.
- Never use filler greetings when the user already asked a question.

STYLE
- Plain professional language. No emojis.
- No markdown headers (# ## ###) and no horizontal rules (---).
- Prefer 1–3 short paragraphs. Use short bullet lists only when listing clear steps.
- Be direct and practical.`;
}

// ─── Reply cleanup: strip emojis, excessive markdown, horizontal rules ─
function cleanReply(text) {
  if (!text) return '';
  let t = String(text);
  t = t.replace(/[\u{1F000}-\u{1FAFF}]/gu, '');
  t = t.replace(/[\u{2600}-\u{27BF}]/gu, '');
  t = t.replace(/[\u{2190}-\u{21FF}]/gu, '');
  t = t.replace(/[\u{2B00}-\u{2BFF}]/gu, '');
  t = t.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '');
  t = t.replace(/^\s*([-_*~])\1{2,}\s*$/gm, '');
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/\n{3,}/g, '\n\n');
  t = t.split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
  return t.trim();
}

// ─── Fetch with timeout ──────────────────────────────────────────────
async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  }
}

// ─── Gemini Call ──────────────────────────────────────────────────────
async function askGemini(messages) {
  const contents = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));
  const res = await fetchWithTimeout(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 2048 } }),
  }, AI_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

// ─── OpenRouter Call ─────────────────────────────────────────────────
async function askOpenRouter(model, messages) {
  const res = await fetchWithTimeout(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.VERCEL_URL || 'https://erpftc.vercel.app',
      'X-Title': 'FarmTrack ERP AI',
    },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 2048 }),
  }, AI_TIMEOUT_MS);
  if (!res.ok) throw new Error(`OR ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

// ─── Groq Call (OpenAI-compatible) ───────────────────────────────────
async function askGroq(messages) {
  const res = await fetchWithTimeout(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, temperature: 0.7, max_tokens: 2048 }),
  }, AI_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

// ─── Fallback Response (never fails) ──────────────────────────────────
function generateFallback(query, module, history = []) {
  const q = String(query || '').toLowerCase().trim();
  const m = String(module || 'dashboard').toLowerCase();
  const hasHistory = Array.isArray(history) && history.some(h => h && h.role === 'user');

  if (!q || /^(hi|hello|hey|good morning|good afternoon|thanks|thank you)\b/.test(q)) {
    if (hasHistory) {
      return 'Still here. Tell me the page or task — for example low stock, overdue invoices, leave approvals, or how to post a sale — and I will give concrete steps.';
    }
    return `You are on **${m}**. Ask a specific task: check stock, create a sale, approve leave, or explain an alert. I use live module data and the notification center when available.`;
  }

  if (q.includes('notif') || q.includes('alert') || q.includes('unread')) {
    return 'Open **Notifications** for the full alert list. Critical items usually cover out-of-stock, overdue invoices, pending leave, and delayed POs. Acknowledge or snooze from the row menu, or open the related module from the action. Ask me about a specific alert title if you want next steps.';
  }
  if (q.includes('sales') || q.includes('revenue') || q.includes('invoice') || q.includes('payment')) {
    return 'Sales path: **Sales** for orders, then invoice from the order, then payment under Accounts. Overdue balances also appear in Notifications. Say whether you need create, collect, or report.';
  }
  if (q.includes('inventory') || q.includes('stock') || q.includes('product')) {
    return 'Use **Inventory** for stock and receive/adjust. Low and out-of-stock items raise automatic alerts. For production draw, use Manufacturing material requests so stock is deducted with a transaction trail.';
  }
  if (q.includes('manufacturing') || q.includes('production') || q.includes('bom') || q.includes('formula')) {
    return 'Manufacturing: create a production order, start it, then complete so materials consume and finished goods post to inventory. Traceability is under Manufacturing → Traceability.';
  }
  if (q.includes('manufactur') || q.includes('production') || q.includes('formula') || q.includes('bom') || q.includes('raw material') || q.includes('batch')) {
    return 'Manufacturing flow: receive raw materials and packaging, create a production order, request stock from inventory, run production, record waste and QC, then complete so finished goods enter inventory. Open Manufacturing and use Materials, Orders, Production, Waste, and Traceability tabs. Ask on that page for live counts from your data.';
  }
  if (q.includes('payroll') || q.includes('salary') || q.includes('employee') || q.includes('hr')) {
    return 'HR Directory holds employees. Attendance and leave feed payroll preview. Pending leave approvals show in Notifications and Leaves → Approvals.';
  }
  if (q.includes('leave') || q.includes('attendance')) {
    return 'Leaves: apply under **Leaves**, managers approve there or from a leave notification. Balances sit on the employee record in HR.';
  }
  if (q.includes('purchase') || q.includes('supplier') || q.includes('procurement')) {
    return 'Procurement: create PO, receive goods into inventory, then supplier invoice in Accounts (including Non-PO when needed).';
  }
  if (q.includes('error') || q.includes('bug') || q.includes('problem') || q.includes('failed') || q.includes('cannot')) {
    return 'Share the page name and the exact error text. Most fixes are missing required fields, role permissions, or a failed save — retry after the network settles and check Notifications for related system alerts.';
  }
  if (q.includes('how to') || q.includes('steps') || q.includes('how do i')) {
    return `Describe the outcome you want on **${m}** (one sentence). I will answer with at most three short steps and the exact menu path.`;
  }
  return `Working in **${m}**. Ask for a concrete action — for example "why is stock low", "how do I approve leave", or "where are overdue invoices" — and I will answer with steps and the right page.`;
}

// ─── Suggested Actions ────────────────────────────────────────────────
function suggestedActions(module, query, reply) {
  const actions = [];
  const q = String(query).toLowerCase();
  const r = String(reply).toLowerCase();
  if (q.includes('where') || q.includes('how do i') || q.includes('navigate')) {
    if (q.includes('sale') || q.includes('invoice')) actions.push({ type: 'navigate', label: 'Go to Sales', path: 'sales' });
    if (q.includes('inventory') || q.includes('stock')) actions.push({ type: 'navigate', label: 'Go to Inventory', path: 'inventory' });
    if (q.includes('manufacturing') || q.includes('production') || q.includes('bom')) actions.push({ type: 'navigate', label: 'Go to Manufacturing', path: 'production' });
    if (q.includes('finance') || q.includes('journal') || q.includes('ledger')) actions.push({ type: 'navigate', label: 'Go to Finance', path: 'finance' });
    if (q.includes('purchase') || q.includes('supplier')) actions.push({ type: 'navigate', label: 'Go to Procurement', path: 'purchasing' });
    if (q.includes('employee') || q.includes('payroll') || q.includes('leave')) actions.push({ type: 'navigate', label: 'Go to HR', path: 'hr' });
    if (q.includes('report') || q.includes('kpi')) actions.push({ type: 'navigate', label: 'Go to Reports', path: 'reports' });
  }
  if (r.includes('increase') || r.includes('higher') || r.includes('growth')) actions.push({ type: 'insight', label: 'View Trend Analysis', path: 'analytics' });
  if (r.includes('decrease') || r.includes('lower') || r.includes('drop')) actions.push({ type: 'insight', label: 'Investigate Decline', path: 'reports' });
  if (r.includes('reorder') || r.includes('low stock')) actions.push({ type: 'insight', label: 'View Reorder Suggestions', path: 'inventory' });
  if (r.includes('overdue') || r.includes('receivable')) actions.push({ type: 'insight', label: 'View Aging Report', path: 'accounts' });
  if (actions.length === 0) {
    actions.push({ type: 'navigate', label: 'View Dashboard', path: 'dashboard' });
    actions.push({ type: 'navigate', label: 'Explore Reports', path: 'reports' });
  }
  return actions.slice(0, 4);
}

// ─── Main Handler ─────────────────────────────────────────────────────
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = {};
  try { body = await parseBody(req); } catch (e) { /* ignore */ }
  const { query = '', module = 'dashboard', history = [], stream = false, user } = body;

  let context = '';
  try { context = await getERPContext(module, user, query); } catch (e) { context = ''; }
  const safeHistory = Array.isArray(history) ? history.filter(m => m && m.role && m.content).slice(-8) : [];
  const messages = [
    { role: 'system', content: systemPrompt() + '\nGuide only. Full notification data access. Write/change actions only when CURRENT PAGE MODULE is notifications. Search customers/leads from context. Answer for the current page. Speak the truth. Role-limited.' },
    ...(context ? [{ role: 'system', content: `ERP Context (${module}):\n${context}` }] : []),
    ...safeHistory,
    { role: 'user', content: query || 'Summarize current alerts and what I should do next on this page.' },
  ];

  let reply = '';
  let modelUsed = 'fallback';
  let fallbackUsed = true;
  let tried = [];

  try {
    // Provider fallback order: Groq → Gemini → OpenRouter models → local fallback
    if (GROQ_API_KEY) {
      tried.push('groq/llama-3.3-70b');
      reply = await askGroq(messages);
      modelUsed = 'groq/llama-3.3-70b';
      fallbackUsed = false;
    } else {
      tried.push('gemini-2.0-flash');
      reply = await askGemini(messages);
      modelUsed = 'gemini-2.0-flash';
      fallbackUsed = false;
    }
  } catch (primaryErr) {
    console.log('[AI] Primary provider failed:', primaryErr.message);

    let orSuccess = false;
    for (const orModel of OR_MODELS) {
      tried.push(orModel);
      try {
        reply = await askOpenRouter(orModel, messages);
        modelUsed = orModel;
        fallbackUsed = false;
        orSuccess = true;
        break;
      } catch (orErr) {
        console.log(`[AI] OpenRouter ${orModel} failed:`, orErr.message);
      }
    }

    if (!orSuccess && !fallbackUsed && GROQ_API_KEY && !tried.includes('gemini-2.0-flash')) {
      try {
        tried.push('gemini-2.0-flash');
        reply = await askGemini(messages);
        modelUsed = 'gemini-2.0-flash';
        fallbackUsed = false;
        orSuccess = true;
      } catch (gemErr) {
        console.log('[AI] Gemini retry failed:', gemErr.message);
      }
    }

    if (!orSuccess && modelUsed === 'fallback') {
      reply = generateFallback(query, module, safeHistory);
      modelUsed = 'fallback-generated';
      fallbackUsed = true;
    }
  }

  reply = cleanReply(reply);

  const actions = suggestedActions(module, query, reply);
  const payload = {
    reply,
    suggestedActions: actions,
    dataSource: module,
    model: modelUsed,
    fallbackUsed,
    triedModels: tried,
    timestamp: new Date().toISOString(),
  };

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const words = reply.split(/(\s+)/);
    for (const w of words) {
      if (w) res.write(`data: ${JSON.stringify({ chunk: w }) }\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true, ...payload }) }\n\n`);
    res.end();
  } else {
    res.status(200).json(payload);
  }
};
