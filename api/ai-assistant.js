const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

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

async function getERPContext(module, user) {
  if (!invokeRpc) return '';
  try {
    const fn = MODULE_RPC_MAP[String(module).toLowerCase()] || 'getDashboardData';
    const data = await invokeRpc(fn, user ? [user] : []);
    const copy = JSON.parse(JSON.stringify(data));
    ['users', 'products', 'customers', 'inventory', 'sales', 'invoices', 'employees', 'rawMaterials', 'orders'].forEach(k => {
      if (Array.isArray(copy[k]) && copy[k].length > 50) {
        copy[k] = copy[k].slice(0, 50);
        copy[k]._truncated = true;
      }
    });
    return JSON.stringify(copy, null, 2).slice(0, 10000);
  } catch (e) {
    return `ERP context unavailable: ${e.message}`;
  }
}

// ─── System Prompt ────────────────────────────────────────────────────
function systemPrompt() {
  return `You are the FarmTrack ERP Copilot. You help users navigate, understand, and optimize their ERP. You are advisory only — you never create, edit, delete, or approve records. You explain workflows, interpret data, troubleshoot errors, and provide navigation guidance. Today's date is ${new Date().toISOString().slice(0, 10)}.

IMPORTANT: Always provide thorough, complete, and detailed responses. Never truncate or summarize prematurely. When explaining workflows, provide full step-by-step instructions with all substeps and variations. When analyzing data, give comprehensive breakdowns with context, interpretation, and actionable insights. When troubleshooting, list ALL possible causes, diagnostic steps, and solutions with detailed explanations. Use markdown formatting (bold, lists, headers) to organize long responses clearly. Aim for comprehensive responses with:
- Minimum 10-15 paragraphs or bullet point sections per topic
- Include all relevant context, exceptions, and edge cases
- Provide code examples, formulas, or calculations where applicable
- Explain both the "what" and the "why" behind every recommendation
- Include step-by-step procedures with substeps for complex workflows
- Offer multiple approaches or alternatives when available
- Always conclude with actionable next steps or recommendations
- You have access to the full ERP context - use it comprehensively`;
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
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 32768 } }),
  }, 60000);
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
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 32768 }),
  }, 60000);
  if (!res.ok) throw new Error(`OR ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

// ─── Fallback Response (never fails) ──────────────────────────────────
function generateFallback(query, module) {
  const q = String(query).toLowerCase();
  const m = String(module).toLowerCase();
  if (q.includes('sales') || q.includes('revenue') || q.includes('invoice') || q.includes('payment')) {
    return 'For sales and invoicing, go to **Sales → Invoices** or **Finance → Receivables**. I can guide you through creating quotes, orders, invoices, and recording payments. What would you like to do?';
  }
  if (q.includes('inventory') || q.includes('stock') || q.includes('product')) {
    return 'Inventory is in **Inventory → Products**. You can check stock levels, set reorder points, and view low-stock alerts. For incoming goods, use **Receive Material** in the Manufacturing module. How can I help?';
  }
  if (q.includes('manufacturing') || q.includes('production') || q.includes('bom') || q.includes('formula')) {
    return 'Manufacturing workflows are in **Manufacturing → Formulas** (BOMs) and **Manufacturing → Orders**. To start: 1) Create a formula, 2) Approve it, 3) Create a production order, 4) Validate materials, 5) Start and complete production. What step do you need help with?';
  }
  if (q.includes('payroll') || q.includes('salary') || q.includes('employee') || q.includes('hr')) {
    return 'HR and payroll are in **HR → Directory** and **HR → Payroll**. To run payroll: verify attendance, check leave balances, then go to Payroll → Run Payroll. For employee questions, open their profile in the Directory. What do you need?';
  }
  if (q.includes('report') || q.includes('kpi') || q.includes('dashboard')) {
    return 'Reports are available in every module and in the central **Reports** tab. For executive summaries, use **Analytics → Executive Dashboard**. I can explain KPIs, compare periods, or help build custom reports. Which report are you looking at?';
  }
  if (q.includes('leave') || q.includes('attendance')) {
    return 'Leave and attendance are in **HR → Attendance** and **HR → Leave**. Employees apply for leave; managers approve in the same panel. Attendance is recorded daily. For leave balance questions, check the employee profile. What do you need?';
  }
  if (q.includes('purchase') || q.includes('supplier') || q.includes('procurement')) {
    return 'Procurement: **Procurement → Purchase Requests** → convert to PO → send to supplier → receive with GRN → record payment. Supplier performance is tracked in Procurement → Suppliers. What would you like to do?';
  }
  if (q.includes('error') || q.includes('bug') || q.includes('problem') || q.includes('failed') || q.includes('cannot')) {
    return 'I can help troubleshoot errors. Tell me: 1) Which module/page, 2) The exact error message, 3) What you clicked before the error. Common fixes: check permissions (Admin/Manager role), fill required fields, and ensure data is saved before proceeding. What error are you seeing?';
  }
  if (q.includes('how to') || q.includes('steps') || q.includes('how do i')) {
    return 'I can guide you through any ERP workflow. Tell me which task you need help with — e.g., "create an invoice", "run payroll", "approve a production order". I will show the navigation path and a step-by-step checklist.';
  }
  return `I am your FarmTrack ERP assistant. I can help you navigate modules, explain workflows, analyze data, and troubleshoot issues. I am currently in advisory mode — I can guide you but cannot directly modify records.\n\n**What would you like help with?**\n- Navigation ("Where is the payroll page?")\n- Workflows ("How do I create a production order?")\n- Data analysis ("What does this report mean?")\n- Troubleshooting ("Why is this invoice not showing?")`;
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

  // Build messages
  let context = '';
  try { context = await getERPContext(module, user); } catch (e) { context = ''; }
  const messages = [
    { role: 'system', content: systemPrompt() },
    ...(context ? [{ role: 'system', content: `ERP Context (${module}):\n${context}` }] : []),
    ...(Array.isArray(history) ? history.filter(m => m && m.role && m.content).slice(-10) : []),
    { role: 'user', content: query },
  ];

  // ── Try Gemini ──
  let reply = '';
  let modelUsed = 'fallback';
  let fallbackUsed = true;
  let tried = [];

  try {
    tried.push('gemini-flash-latest');
    reply = await askGemini(messages);
    modelUsed = 'gemini-flash-latest';
    fallbackUsed = false;
  } catch (geminiErr) {
    console.log('[AI] Gemini failed:', geminiErr.message);

    // ── Try OpenRouter ──
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

    // ── All AI failed, use generated fallback ──
    if (!orSuccess) {
      reply = generateFallback(query, module);
      modelUsed = 'fallback-generated';
      fallbackUsed = true;
    }
  }

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
