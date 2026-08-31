const XAI_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';
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

let invokeRpc = null;
try {
  const rpc = require('./rpc.js');
  invokeRpc = rpc.invokeRpc || null;
} catch (e) {
  console.warn('[AI] rpc.js not loaded:', e.message);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

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
  executive: 'getAnalyticsData',
  email: 'getEmailLog',
  notifications: 'getNotificationCenterData',
  visits: 'getVisits',
};

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs || AI_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function askXai(messages) {
  if (!XAI_API_KEY) throw new Error('XAI_API_KEY not set');
  const res = await fetchWithTimeout('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + XAI_API_KEY,
    },
    body: JSON.stringify({
      model: 'grok-4.5',
      max_tokens: 2048,
      messages: messages.map(m => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content })),
    }),
  }, AI_TIMEOUT_MS);
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('xAI ' + res.status + ': ' + t.slice(0, 200));
  }
  const body = await res.json();
  return (body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content) || '';
}

async function askGemini(messages) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const res = await fetchWithTimeout(GEMINI_URL + '?key=' + encodeURIComponent(GEMINI_API_KEY), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 2048 } }),
  }, AI_TIMEOUT_MS);
  if (!res.ok) throw new Error('Gemini ' + res.status);
  const body = await res.json();
  return body.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
}

async function askOpenRouter(model, messages) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');
  const res = await fetchWithTimeout(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + OPENROUTER_API_KEY,
    },
    body: JSON.stringify({ model, messages, max_tokens: 2048 }),
  }, AI_TIMEOUT_MS);
  if (!res.ok) throw new Error('OpenRouter ' + res.status);
  const body = await res.json();
  return body.choices?.[0]?.message?.content || '';
}

async function askGroq(messages) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  const res = await fetchWithTimeout(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + GROQ_API_KEY,
    },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 2048 }),
  }, AI_TIMEOUT_MS);
  if (!res.ok) throw new Error('Groq ' + res.status);
  const body = await res.json();
  return body.choices?.[0]?.message?.content || '';
}

function cleanReply(text) {
  return String(text || '').trim().slice(0, 12000);
}

function generateFallback(query, module) {
  return 'Working in **' + module + '**. Ask a concrete question (stock, leave, invoice, production). Configure XAI_API_KEY on Vercel for full AI answers.';
}

function suggestedActions(module, query) {
  const actions = [];
  const q = String(query || '').toLowerCase();
  if (q.includes('hr') || q.includes('employee') || q.includes('payroll')) actions.push({ type: 'navigate', label: 'Go to HR', path: 'hr' });
  if (q.includes('report') || q.includes('kpi') || q.includes('analytics')) actions.push({ type: 'navigate', label: 'Executive Analytics', path: 'analytics' });
  if (q.includes('invoice') || q.includes('account')) actions.push({ type: 'navigate', label: 'Accounts', path: 'accounts' });
  if (!actions.length) actions.push({ type: 'navigate', label: 'Dashboard', path: 'dashboard' });
  return actions;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = await parseBody(req);
  const query = String(body.query || body.prompt || '').slice(0, 2000);
  const module = String(body.module || 'dashboard').toLowerCase();
  const stream = Boolean(body.stream);
  const user = body.user || null;
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const safeHistory = history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) }));

  let context = '';
  try {
    if (invokeRpc && MODULE_RPC_MAP[module]) {
      const data = await invokeRpc(MODULE_RPC_MAP[module], user ? [user] : []);
      context = JSON.stringify(data).slice(0, 6000);
    }
  } catch (e) {
    context = 'Context load failed: ' + e.message;
  }

  const messages = [
    { role: 'system', content: 'You are Farmtrack ERP assistant. Be concise. Use ERP context when present. For HR: Deactivate keeps the record; Delete permanently removes from directory.' },
    ...(context ? [{ role: 'system', content: 'ERP Context (' + module + '):\n' + context }] : []),
    ...safeHistory,
    { role: 'user', content: query || 'Summarize alerts and next actions on this page.' },
  ];

  let reply = '';
  let modelUsed = 'fallback';
  let fallbackUsed = true;
  const tried = [];

  try {
    if (XAI_API_KEY) {
      tried.push('xai/grok-4.5');
      reply = await askXai(messages);
      modelUsed = 'xai/grok-4.5';
      fallbackUsed = false;
    } else if (GROQ_API_KEY) {
      tried.push('groq/llama-3.3-70b');
      reply = await askGroq(messages);
      modelUsed = 'groq/llama-3.3-70b';
      fallbackUsed = false;
    } else if (GEMINI_API_KEY) {
      tried.push('gemini-2.0-flash');
      reply = await askGemini(messages);
      modelUsed = 'gemini-2.0-flash';
      fallbackUsed = false;
    } else {
      reply = generateFallback(query, module);
      modelUsed = 'fallback-generated';
    }
  } catch (primaryErr) {
    console.log('[AI] Primary failed:', primaryErr.message);
    let ok = false;
    for (const orModel of OR_MODELS) {
      if (!OPENROUTER_API_KEY) break;
      tried.push(orModel);
      try {
        reply = await askOpenRouter(orModel, messages);
        modelUsed = orModel;
        fallbackUsed = false;
        ok = true;
        break;
      } catch (e) {
        console.log('[AI] OpenRouter failed', orModel, e.message);
      }
    }
    if (!ok) {
      reply = generateFallback(query, module);
      modelUsed = 'fallback-generated';
      fallbackUsed = true;
    }
  }

  reply = cleanReply(reply);
  const actions = suggestedActions(module, query);
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
      if (w) res.write('data: ' + JSON.stringify({ chunk: w }) + '\n\n');
    }
    res.write('data: ' + JSON.stringify({ done: true, ...payload }) + '\n\n');
    res.end();
  } else {
    res.status(200).json(payload);
  }
};
