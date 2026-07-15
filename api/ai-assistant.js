const { invokeRpc } = require('./rpc.js');

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ─── Comprehensive ERP Knowledge Base ───────────────────────────────
const ERP_KNOWLEDGE = `
## FARMTRACK ERP (UNITY ERP) — COMPLETE SYSTEM GUIDE

### Modules & Navigation Paths

**Dashboard** — Main landing page. KPIs: revenue, expenses, profit, cash flow, inventory value, manufacturing output, pending orders, overdue invoices, low stock alerts. Navigate via sidebar.

**Sales** — Quotations → Orders → Invoices → Payments → Delivery. Path: Sales tab. Create quotations, convert to orders, generate invoices, record payments, schedule deliveries.

**Inventory** — Products, stock levels, warehouses, transfers, reorder points, expiry tracking, stock counts. Path: Inventory tab. View stock by warehouse, transfer between locations, set reorder levels.

**Manufacturing** — BOMs (Bill of Materials), production orders, formula management, raw materials, packaging, quality control, batch traceability, cost breakdown. Path: Manufacturing tab. Create formulas, approve BOMs, start production, complete jobs, QC checks.

**Procurement** — Purchase requests, purchase orders, suppliers, GRN (Goods Received Note), supplier payments, supplier evaluation. Path: Procurement tab. Create POs, receive goods, record supplier payments.

**Finance / Accounts** — Chart of accounts, journals, receivables, payables, bank reconciliation, trial balance, financial statements. Path: Finance or Accounts tab. Post journals, reconcile bank, view aging reports.

**CRM** — Customers, leads, opportunities, calls, meetings, follow-ups, customer statements. Path: CRM tab. Track leads through funnel, log calls, view customer history.

**HR** — Employees, attendance, leave management, payroll, performance reviews, recruitment. Path: HR tab. Record attendance, apply for leave, run payroll, conduct appraisals.

**Reports** — Executive dashboard, sales reports, inventory reports, manufacturing reports, finance reports, custom reports. Path: Reports tab. Filter by date, module, export to PDF/Excel.

**Settings** — Company profile, users, roles, permissions, departments, warehouses, products, tax, notifications, integrations, backups. Path: Settings tab. Configure company details, manage users, set rules.

**Analytics** — Trends, comparisons, forecasts, department performance. Path: Analytics tab. View charts, compare periods, drill down.

**Email** — Compose, templates, sent log, email administration. Path: Email tab. Send emails, view delivery status.

### Core Workflows

**Quotation to Payment:**
1. Create Quotation (Accounts → Quotations or Sales → Quotations)
2. Send to customer (email from ERP)
3. Customer accepts → Convert to Invoice
4. Invoice creates receivable
5. Record Payment → Updates cash position, customer balance, general ledger
6. Receipt sent to customer automatically

**Purchase to Inventory:**
1. Create Purchase Request (Procurement)
2. Approve → Convert to Purchase Order
3. Send PO to supplier
4. Goods arrive → Create GRN (Goods Received Note)
5. GRN updates inventory, creates payable
6. Record Supplier Payment → Updates cash, payables, ledger

**Production Workflow:**
1. Create BOM/Formula (Manufacturing → Formulas)
2. Approve BOM
3. Create Production Order
4. System validates: materials available? packaging available? formula approved?
5. Start Production → Reserves materials
6. Complete Production → Deducts materials, creates finished goods batch, records cost
7. QC Check → Pass/Fail
8. Batch available for sales

**Inventory Management:**
1. Set reorder points per product
2. Low stock alert triggers
3. Create Purchase Request or Production Order
4. Receive goods → Update stock
5. Transfer between warehouses if needed
6. Periodic stock counts for accuracy

**HR Workflow:**
1. Add Employee (HR → Directory)
2. Record Attendance (daily check-in/out)
3. Apply for Leave (self-service or HR)
4. Manager approves/rejects
5. Payroll run (monthly)
6. Performance review (quarterly/annually)

### Common ERP Terminology

- **BOM**: Bill of Materials — list of raw materials needed to produce one unit
- **GRN**: Goods Received Note — document confirming receipt of purchased goods
- **UOM**: Unit of Measure — kg, g, L, ml, pieces, boxes, cartons
- **FIFO**: First In First Out — inventory valuation method
- **Aging Report**: Shows how long invoices have been outstanding
- **Reconciliation**: Matching bank transactions with ledger entries
- **Journal Entry**: Double-entry bookkeeping record (debit = credit)
- **COGS**: Cost of Goods Sold — direct costs of products sold
- **Gross Margin**: (Revenue - COGS) / Revenue × 100%
- **Net Margin**: Net Profit / Revenue × 100%
- **EBITDA**: Earnings Before Interest, Tax, Depreciation, Amortization
- **Reorder Point**: Stock level that triggers a purchase order
- **Safety Stock**: Buffer inventory to prevent stockouts
- **Lead Time**: Days between ordering and receiving goods
- **Batch/Lot**: Group of products produced together, traceable
- **SKU**: Stock Keeping Unit — unique product identifier
- **GL**: General Ledger — master record of all financial transactions
- **AR**: Accounts Receivable — money customers owe you
- **AP**: Accounts Payable — money you owe suppliers
- **WIP**: Work In Progress — unfinished production
- **QC**: Quality Control — inspection of finished goods
- **KPI**: Key Performance Indicator — measurable business metric

### Troubleshooting Common Issues

**"Production blocked"** — Usually means: raw materials insufficient, packaging missing, formula not approved, or materials expired. Check the validation panel for exact shortages.

**"Negative inventory"** — Can happen if sales are recorded before receipts. Check inventory transactions, ensure all POs are received, verify stock counts.

**"Invoice not showing in receivables"** — Invoice may be in Draft status. Only posted/approved invoices appear in AR. Check invoice status.

**"Can't reconcile bank"** — Missing transactions, duplicate entries, or wrong amounts. Check transaction dates, amounts, and references match bank statement.

**"Leave balance wrong"** — Leave taken may not have been deducted. Check leave transactions, ensure approvals were processed, verify leave type mappings.

**"Payroll calculation incorrect"** — Check basic salary, allowances, deductions, tax brackets, NHIF/NSSF contributions (Kenya), and ensure attendance data is complete.

**"Report shows no data"** — Check date range filters, module selection, and status filters. Ensure data exists in the selected period.

**"Email not sending"** — Check Resend API configuration in Settings → Email. Verify from email address is verified. Check email logs for delivery status.

**"Can't approve quotation"** — Check user permissions (Admin/Manager role required). Ensure quotation is in "Sent" status before approval.

**"Stock transfer failed"** — Verify source warehouse has sufficient stock. Check unit conversions if UOMs differ. Ensure both warehouses are active.

**"Formula cost too high"** — Review raw material costs, wastage percentages, and labor/overhead allocations. Check if recent price increases are reflected.

### Report & KPI Interpretation

**Revenue Trend** — Upward trend is healthy. Sudden drops may indicate lost customers, seasonal demand, or pricing issues.

**Inventory Turnover** — Higher is better (sells faster). Low turnover = overstocking or slow-moving products. Ideal varies by industry.

**Gross Margin** — Should be stable or improving. Declining margin = rising costs or pricing pressure. Compare with industry benchmarks.

**Days Sales Outstanding (DSO)** — Average days to collect payment. Lower is better. >60 days indicates collection issues.

**Manufacturing Yield** — Actual output vs planned. <90% = waste, machine downtime, or material quality issues.

**Reorder Suggestions** — System calculates when stock will run out based on average consumption. Review before auto-generating POs.

**Cash Flow** — Positive = healthy. Negative = may need financing or faster collections. Track operating, investing, financing separately.

**Employee Productivity** — Revenue or output per employee. Compare across departments and time periods.

### Role-Based Guidance

**Sales Officer** — Focus on: quotations, orders, customer follow-ups, pipeline value, conversion rates, overdue invoices.

**Warehouse Staff** — Focus on: stock counts, transfers, GRN processing, picking lists, inventory accuracy, expiry management.

**Production Supervisor** — Focus on: BOMs, production schedules, material availability, QC checks, yield rates, waste tracking.

**Procurement Officer** — Focus on: POs, supplier performance, lead times, price comparisons, GRN accuracy, payment terms.

**Accountant** — Focus on: journals, bank reconciliation, receivables aging, payables, financial statements, tax compliance.

**HR Manager** — Focus on: headcount, attendance, leave balances, payroll accuracy, recruitment pipeline, performance reviews.

**Manager/Executive** — Focus on: dashboard KPIs, executive reports, department comparisons, cash flow, profitability, growth trends.
`;

const COPILOT_SYSTEM_PROMPT = `You are the Enterprise ERP Copilot for FarmTrack ERP (Unity ERP). You are a knowledgeable business consultant, ERP trainer, data analyst, navigation assistant, and troubleshooting expert. You help users understand, navigate, and optimize their ERP system.

YOUR PRIMARY ROLE:
- Explain ERP modules, workflows, buttons, charts, reports, and settings
- Navigate users to the right page for their task
- Analyze business data and provide insights
- Interpret reports and KPIs with context
- Recommend improvements without making changes
- Teach ERP concepts, terminology, and best practices
- Troubleshoot errors by explaining causes and solutions
- Guide users through multi-step tasks with checklists
- Answer "what if" scenarios using available data
- Provide role-specific guidance

CRITICAL RULES — NEVER VIOLATE:
1. You are ADVISORY ONLY. You NEVER create, edit, delete, approve, post, or execute any business transaction directly. You only EXPLAIN how to do it or RECOMMEND that the user does it.
2. If asked to perform an action ("create an invoice", "delete a customer", "approve a leave", "post a journal"), ALWAYS explain the correct navigation path and steps, but NEVER claim you performed it. Say: "I can guide you through creating an invoice. Navigate to Sales → Invoices and click New. Here are the steps..."
3. If a user pastes data and asks you to import it, explain the import process but do not process the data yourself.
4. Use the ERP data context provided to give accurate, specific answers. If data is missing, say so clearly.
5. Format numbers clearly: currency as KSh X,XXX, percentages as X%, counts as whole numbers.
6. Be concise but thorough. Use bullet points, numbered steps, and short paragraphs.
7. When explaining workflows, always show the navigation path (e.g., "Go to Manufacturing → Formulas → New Formula").
8. Today's date is ${new Date().toISOString().slice(0, 10)}.

RESPONSE FORMATS:

For navigation questions:
"To [task], navigate to [Module] → [Page] → [Button]. From there you can [actions]."

For data analysis:
"Based on your [module] data: [insight]. This is [trend direction] compared to [previous period]. The likely cause is [reason]. I recommend [action]."

For report interpretation:
"This [chart/report] shows [what it means]. A healthy range is [range]. Your current value is [value], which is [assessment]. [Recommendation]."

For troubleshooting:
"This error usually means [cause]. To fix it: 1) [step 1] 2) [step 2] 3) [step 3]. If the issue persists, check [additional area]."

For guided tasks:
"Here's how to [task]:\n\n1. [Step 1]\n2. [Step 2]\n3. [Step 3]\n\nAfter completing, you should see [expected outcome]."

For "what if" questions:
"If you [scenario], based on current data: [calculation]. The impact would be [impact]. I recommend [consideration]."

For learning questions:
"[Concept] in ERP means [definition]. In FarmTrack ERP, you can find it at [location]. Here's how it works: [explanation]."

${ERP_KNOWLEDGE}

If you are unsure about something, say "I don't have enough information to answer that. Please check [relevant module] or provide more details." rather than guessing.`;

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
    // Truncate large arrays to prevent context overflow
    const truncated = JSON.parse(JSON.stringify(data));
    ['users', 'products', 'customers', 'suppliers', 'inventory', 'sales', 'invoices', 'employees',
     'journals', 'journalLines', 'ledger', 'receivables', 'payables', 'rawMaterials', 'orders',
     'productionBatches', 'consumption', 'leads', 'calls', 'deliveries', 'expenses', 'activities'].forEach(key => {
      if (Array.isArray(truncated[key]) && truncated[key].length > 50) {
        truncated[key] = truncated[key].slice(0, 50);
        truncated[key]._truncated = true;
        truncated[key]._total = data[key].length;
      }
    });
    return JSON.stringify(truncated, null, 2).slice(0, 12000);
  } catch (err) {
    return `ERP context unavailable for module "${module}": ${err.message}`;
  }
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function generateSuggestedActions(module, query, reply) {
  const actions = [];
  const m = String(module).toLowerCase();
  const q = String(query).toLowerCase();
  const r = String(reply).toLowerCase();

  // Navigation suggestions
  if (q.includes('where') || q.includes('how do i') || q.includes('navigate') || q.includes('find')) {
    if (m === 'sales' || q.includes('sale') || q.includes('quotation') || q.includes('invoice')) {
      actions.push({ type: 'navigate', label: 'Go to Sales', path: 'sales', icon: 'ShoppingCart' });
    }
    if (m === 'inventory' || q.includes('stock') || q.includes('inventory') || q.includes('product')) {
      actions.push({ type: 'navigate', label: 'Go to Inventory', path: 'inventory', icon: 'Boxes' });
    }
    if (m === 'manufacturing' || q.includes('production') || q.includes('manufacturing') || q.includes('bom') || q.includes('formula')) {
      actions.push({ type: 'navigate', label: 'Go to Manufacturing', path: 'production', icon: 'Factory' });
    }
    if (m === 'finance' || m === 'accounts' || q.includes('finance') || q.includes('journal') || q.includes('ledger') || q.includes('balance')) {
      actions.push({ type: 'navigate', label: 'Go to Finance', path: 'finance', icon: 'CircleDollarSign' });
    }
    if (m === 'procurement' || q.includes('purchase') || q.includes('supplier') || q.includes('po')) {
      actions.push({ type: 'navigate', label: 'Go to Procurement', path: 'purchasing', icon: 'ClipboardCheck' });
    }
    if (m === 'crm' || q.includes('customer') || q.includes('lead') || q.includes('follow')) {
      actions.push({ type: 'navigate', label: 'Go to CRM', path: 'customers', icon: 'Users' });
    }
    if (m === 'hr' || q.includes('employee') || q.includes('leave') || q.includes('attendance') || q.includes('payroll')) {
      actions.push({ type: 'navigate', label: 'Go to HR', path: 'hr', icon: 'UserCog' });
    }
    if (m === 'reports' || q.includes('report') || q.includes('chart') || q.includes('kpi')) {
      actions.push({ type: 'navigate', label: 'Go to Reports', path: 'reports', icon: 'FileText' });
    }
    if (m === 'settings' || q.includes('setting') || q.includes('company') || q.includes('config') || q.includes('user')) {
      actions.push({ type: 'navigate', label: 'Go to Settings', path: 'settings', icon: 'Settings' });
    }
  }

  // Checklist / workflow suggestions
  if (q.includes('how to') || q.includes('steps') || q.includes('create') || q.includes('process')) {
    if (q.includes('production order') || q.includes('manufacturing')) {
      actions.push({ type: 'checklist', label: 'Production Order Checklist', steps: ['Select Product', 'Choose Formula/BOM', 'Verify Raw Materials', 'Check Packaging', 'Review Cost', 'Submit for Approval'] });
    }
    if (q.includes('quotation') || q.includes('quote')) {
      actions.push({ type: 'checklist', label: 'Quotation Checklist', steps: ['Select Customer', 'Add Products', 'Set Prices & Discounts', 'Add Tax', 'Set Expiry Date', 'Send to Customer'] });
    }
    if (q.includes('purchase order') || q.includes('po')) {
      actions.push({ type: 'checklist', label: 'Purchase Order Checklist', steps: ['Select Supplier', 'Add Items', 'Set Quantities', 'Review Prices', 'Set Delivery Date', 'Submit for Approval'] });
    }
    if (q.includes('invoice') || q.includes('bill')) {
      actions.push({ type: 'checklist', label: 'Invoice Checklist', steps: ['Select Customer', 'Add Items/Services', 'Set Prices', 'Apply Tax', 'Set Due Date', 'Send to Customer'] });
    }
    if (q.includes('payroll') || q.includes('salary')) {
      actions.push({ type: 'checklist', label: 'Payroll Checklist', steps: ['Verify Attendance', 'Calculate Allowances', 'Apply Deductions', 'Calculate Tax', 'Review Net Pay', 'Process Payment'] });
    }
    if (q.includes('leave') || q.includes('vacation')) {
      actions.push({ type: 'checklist', label: 'Leave Application Checklist', steps: ['Check Leave Balance', 'Select Leave Type', 'Set Dates', 'Add Reason', 'Submit for Approval', 'Wait for Manager Decision'] });
    }
  }

  // Insight / analysis suggestions
  if (r.includes('increase') || r.includes('higher') || r.includes('rise') || r.includes('growth')) {
    actions.push({ type: 'insight', label: 'View Trend Analysis', path: 'analytics', icon: 'LineChart' });
  }
  if (r.includes('decrease') || r.includes('lower') || r.includes('drop') || r.includes('decline') || r.includes('fall')) {
    actions.push({ type: 'insight', label: 'Investigate Decline', path: 'reports', icon: 'BarChart3' });
  }
  if (r.includes('reorder') || r.includes('low stock') || r.includes('out of stock')) {
    actions.push({ type: 'insight', label: 'View Reorder Suggestions', path: 'inventory', icon: 'AlertTriangle' });
  }
  if (r.includes('overdue') || r.includes('outstanding') || r.includes('receivable')) {
    actions.push({ type: 'insight', label: 'View Aging Report', path: 'accounts', icon: 'ReceiptText' });
  }
  if (r.includes('waste') || r.includes('yield') || r.includes('efficiency')) {
    actions.push({ type: 'insight', label: 'View Manufacturing Report', path: 'production', icon: 'Factory' });
  }

  // Default fallback
  if (actions.length === 0) {
    actions.push({ type: 'navigate', label: 'View Dashboard', path: 'dashboard', icon: 'Gauge' });
    actions.push({ type: 'navigate', label: 'Explore Reports', path: 'reports', icon: 'FileText' });
  }

  return actions.slice(0, 4);
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
      { role: 'system', content: COPILOT_SYSTEM_PROMPT },
      { role: 'system', content: `ERP CONTEXT (Module: ${module}):\n${erpContext}\n---\nUse the above context to answer accurately. If the context is empty or insufficient, say so clearly rather than making up data.` },
      ...(Array.isArray(history) ? history : []).filter(msg => msg && msg.role && msg.content),
      { role: 'user', content: query },
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
              res.write(`data: ${JSON.stringify({ chunk: deltaContent }) }\n\n`);
            }
          } catch {
            // Ignore malformed JSON lines from the stream
          }
        }
      }

      const suggestedActions = generateSuggestedActions(module, query, fullReply);
      const finalPayload = {
        done: true,
        reply: fullReply,
        suggestedActions,
        dataSource: module,
        timestamp: new Date().toISOString(),
      };

      res.write(`data: ${JSON.stringify(finalPayload) }\n\n`);
      res.end();
    } else {
      const groqJson = await groqRes.json();
      const reply = groqJson.choices?.[0]?.message?.content || 'No response from AI.';
      const suggestedActions = generateSuggestedActions(module, query, reply);

      res.status(200).json({
        reply,
        suggestedActions,
        dataSource: module,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('AI Copilot Error:', error);
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
