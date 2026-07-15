const { invokeRpc } = require('./rpc.js');

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `You are the AI Assistant for FarmTrack ERP (also known as Unity ERP), an enterprise resource planning system used for managing sales, inventory, manufacturing, finance, CRM, procurement, HR, settings, reports, analytics, and email logs.

CRITICAL RULES — YOU MUST FOLLOW THESE:
1. STRICTLY READ-ONLY: You can ONLY query, summarize, explain, and analyze data. You are NEVER allowed to create, update, delete, modify, approve, reject, or change any record, transaction, invoice, payment, stock entry, employee record, or setting.
2. If the user asks you to modify, create, delete, or change any data (e.g., "create an invoice", "delete a customer", "update stock", "approve a leave request", "post a journal entry"), you MUST politely refuse and explain that you are a read-only assistant and that the user should use the FarmTrack ERP interface to perform that action.
3. Use the ERP context provided in the conversation to answer accurately. If the context is insufficient, state that clearly rather than making up data.
4. Be concise but thorough. Use bullet points and numbers when helpful. When presenting numbers, format them clearly (e.g., currency, percentages, counts).
5. Respect data confidentiality: do not expose sensitive details like passwords, API keys, or private employee information beyond what is already in the provided context.
6. You support the following ERP modules: Dashboard, Sales, Inventory, Manufacturing, Finance/Accounts, CRM, Procurement, HR, Settings, Reports, Analytics, and Email.
7. When the user asks for insights or trends, base them strictly on the data provided in the context.
8. Today's date is ${new Date().toISOString().slice(0, 10)}.
9. Your role is to help users understand their ERP data, find insights, navigate the system, and answer questions. You are NOT an actor that can perform actions on the ERP.

If you are unsure about something, say "I don't have enough information to answer that." rather than guessing.`;

const MODULE_RPC_MAP = {
  dashboard: 'getDashboardData',
  sales: 'getSalesWorkspaceData',
  inventory: 'getInventoryWorkspaceData',
  manufacturing: 'getManufacturingWorkspaceData',
  finance: 'getFinanceWorkspaceData',
  accounts: 'getFinanceWorkspaceData',
  accounting: 'getFinanceWorkspaceData',
  crm: 'getCRMWorkspaceData',
  procurement: 'getProcurementWorkspaceData',
  purchase: 'getProcurementWorkspaceData',
  purchasing: 'getProcurementWorkspaceData',
  hr: 'getHRWorkspaceData',
  human_resources: 'getHRWorkspaceData',
  settings: 'getSettingsWorkspaceData',
  reports: 'getReportCenterData',
  analytics: 'getAnalyticsData',
  email: 'getEmailLog',
  emails: 'getEmailLog',
};

async function getERPContext(module, user) {
  const rpc = MODULE_RPC_MAP[String(module).toLowerCase()] || 'getDashboardData';
  try {
    const data = await invokeRpc(rpc, user ? [user] : []);
    return JSON.stringify(data, null, 2);
  } catch (err) {
    return `ERP context unavailable for module "${module}": ${err.message}`;
  }
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function generateSuggestedActions(module, query) {
  const actions = [];
  const m = String(module).toLowerCase();
  const q = String(query).toLowerCase();

  if (m === 'sales' || q.includes('sale') || q.includes('invoice') || q.includes('revenue')) {
    actions.push('View Sales Report', 'Check Invoice Register');
  }
  if (m === 'inventory' || q.includes('stock') || q.includes('inventory') || q.includes('product') || q.includes('warehouse')) {
    actions.push('Check Stock Levels', 'View Inventory Movements');
  }
  if (m === 'manufacturing' || q.includes('production') || q.includes('manufacturing') || q.includes('batch') || q.includes('job')) {
    actions.push('View Production Orders', 'Check Material Availability');
  }
  if (m === 'finance' || m === 'accounts' || q.includes('finance') || q.includes('profit') || q.includes('balance') || q.includes('cash') || q.includes('ledger')) {
    actions.push('View Profit & Loss', 'View Balance Sheet');
  }
  if (m === 'crm' || q.includes('customer') || q.includes('lead') || q.includes('follow') || q.includes('opportunity')) {
    actions.push('View Customer List', 'Check Follow-ups');
  }
  if (m === 'procurement' || q.includes('purchase') || q.includes('supplier') || q.includes('vendor') || q.includes('po')) {
    actions.push('View Purchase Orders', 'Check Supplier Payments');
  }
  if (m === 'hr' || q.includes('employee') || q.includes('leave') || q.includes('attendance') || q.includes('payroll') || q.includes('staff')) {
    actions.push('View HR Directory', 'Check Leave Balances');
  }
  if (m === 'reports' || q.includes('report') || q.includes('export') || q.includes('pdf') || q.includes('excel')) {
    actions.push('Run Custom Report', 'Export to Excel');
  }
  if (m === 'analytics' || q.includes('analytic') || q.includes('dashboard') || q.includes('kpi') || q.includes('trend')) {
    actions.push('View Analytics Dashboard', 'Compare Periods');
  }
  if (m === 'email' || q.includes('email') || q.includes('mail') || q.includes('delivery') || q.includes('sent')) {
    actions.push('View Email Log', 'Check Delivery Status');
  }
  if (m === 'settings' || q.includes('setting') || q.includes('company') || q.includes('config')) {
    actions.push('Open Settings', 'View Company Profile');
  }

  if (actions.length === 0) {
    actions.push('View Dashboard', 'Explore Reports');
  }

  return [...new Set(actions)].slice(0, 2);
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const body = await parseBody(req);
    const { query, module = 'dashboard', history = [], stream = false, user } = body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "query" field.' });
    }

    const erpContext = await getERPContext(module, user);

    const messages = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'system',
        content: `ERP CONTEXT (Module: ${module}):\n${erpContext}\n---\nUse the above context to answer the user's query. If the context is empty or insufficient, say so clearly rather than making up data.`,
      },
      ...(Array.isArray(history) ? history : []).filter(
        msg => msg && msg.role && msg.content
      ),
      {
        role: 'user',
        content: query,
      },
    ];

    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: Boolean(stream),
      }),
    });

    if (!groqRes.ok) {
      const errorText = await groqRes.text();
      throw new Error(`Groq API error ${groqRes.status}: ${errorText}`);
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let fullReply = '';
      const reader = groqRes.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          const dataPart = trimmed.replace(/^data:\s*/, '');
          if (dataPart === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataPart);
            const deltaContent = parsed.choices?.[0]?.delta?.content;
            if (deltaContent) {
              fullReply += deltaContent;
              res.write(`data: ${JSON.stringify({ chunk: deltaContent })}\n\n`);
            }
          } catch {
            // Ignore malformed JSON lines from the stream
          }
        }
      }

      const suggestedActions = generateSuggestedActions(module, query);
      const finalPayload = {
        done: true,
        reply: fullReply,
        suggestedActions,
        dataSource: module,
        timestamp: new Date().toISOString(),
      };

      res.write(`data: ${JSON.stringify(finalPayload)}\n\n`);
      res.end();
    } else {
      const groqJson = await groqRes.json();
      const reply = groqJson.choices?.[0]?.message?.content || 'No response from AI.';
      const suggestedActions = generateSuggestedActions(module, query);

      res.status(200).json({
        reply,
        suggestedActions,
        dataSource: module,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('AI Assistant Error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error.message || 'Internal server error',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.end();
    }
  }
};
