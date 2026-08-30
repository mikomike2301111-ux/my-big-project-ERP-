/**
 * Charts + profile + email + reports (build-time)
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const rpcPath = path.join(root, 'api', 'rpc.js');
const mainPath = path.join(root, 'src', 'main.jsx');

function patchRpc() {
  if (!fs.existsSync(rpcPath)) return;
  let rpc = fs.readFileSync(rpcPath, 'utf8');
  rpc = rpc.replace(/const ERP_REPLY_TO = 'mikomike200@gmail\.com';/g,
    "const ERP_REPLY_TO = process.env.ERP_REPLY_TO || process.env.RESEND_REPLY_TO || 'noreply@staff.farmtrack.co.ke';");
  rpc = rpc.replace(/from \|\| 'mikomike200@gmail\.com'/g,
    "from || process.env.ERP_REPLY_TO || process.env.RESEND_REPLY_TO || 'noreply@staff.farmtrack.co.ke'");
  rpc = rpc.replace(/mikomike200@gmail\.com/g, 'noreply@staff.farmtrack.co.ke');

  rpc = rpc.replace(
    "const startDate = filters.startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);",
    "const startDate = filters.startDate || new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);"
  );
  rpc = rpc.replace(
    "const yearPrefix = '2026-';",
    "const yearPrefix = String((allInvoices[0] && (allInvoices[0].date || allInvoices[0].createdAt) || new Date().toISOString()).slice(0, 4)) + '-';"
  );
  rpc = rpc.replace(
    "{ label: 'Total Value', value: Math.round(totalValue), type: 'money' }",
    "{ label: 'Total Value', value: Math.round(totalValue || (d.invoices || []).reduce((s, r) => s + num(r.total), 0)), type: 'money' }"
  );

  if (rpc.includes('cash: cashPosition,\n        ar,\n        ap') && !rpc.includes('keysForTrend')) {
    rpc = rpc.replace(/cash: cashPosition,\n        ar,\n        ap/g, 'cash: mRev - mExp,\n        ar: 0,\n        ap: 0');
    console.log('[charts] flattened stock series neutralized');
  }
  rpc = rpc.replace(
    /profit: rev - exp,\n        cash: cashPosition,\n        ar,\n        ap/g,
    "profit: rev - exp,\n        cash: rev - exp,\n        ar: 0,\n        ap: 0,\n        month: `${wm}/${String(wd).padStart(2, '0')}`"
  );

  if (!rpc.includes('/* weekly-fallback-v1 */')) {
    rpc = rpc.replace(
      'const weekKeys = Object.keys(revByWeek).concat(Object.keys(expByWeek)).filter(Boolean).sort();',
      `const weekKeys = Object.keys(revByWeek).concat(Object.keys(expByWeek)).filter(Boolean).sort();
    /* weekly-fallback-v1 */
    if (!weekKeys.length) {
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d0 = new Date(now); d0.setDate(d0.getDate() - i * 7);
        const day = (d0.getDay() + 6) % 7; d0.setDate(d0.getDate() - day);
        const pad = n => String(n).padStart(2, '0');
        const k = d0.getFullYear() + '-' + pad(d0.getMonth() + 1) + '-' + pad(d0.getDate());
        if (!revByWeek[k]) revByWeek[k] = 0;
        if (!expByWeek[k]) expByWeek[k] = 0;
        weekKeys.push(k);
      }
    }`
    );
  }

  fs.writeFileSync(rpcPath, rpc);
  console.log('[charts-rpc] written', rpc.length);
}

function patchMain() {
  if (!fs.existsSync(mainPath)) { console.warn('[charts-ui] no main.jsx'); return; }
  let m = fs.readFileSync(mainPath, 'utf8');
  if (!m.includes("charts-profile.css") && m.includes("import './styles.css'")) {
    m = m.replace("import './styles.css';", "import './styles.css';\nimport './charts-profile.css';");
  }
  m = m.replace(
    "const movementMetrics = ['revenue', 'expenses', 'cash', 'ar', 'ap', 'profit'];",
    "const movementMetrics = ['revenue', 'expenses', 'profit', 'cash'];"
  );

  if (!m.includes('Primary flow metrics vs balance') && !m.includes("lineMetrics = flow.length")) {
    const re = /function MultiMetricTrendChart\(\{ data = \[\], metrics = \[\], compareData, compareLabel \}\) \{[\s\S]*?\n\}\n\nfunction TeamPerformanceChart/;
    const newMulti = `function MultiMetricTrendChart({ data = [], metrics = [], compareData, compareLabel }) {
  const colors = ['#0066cc', '#1d1d1f', '#b42318', '#0d9488', '#7f56d9', '#f79009'];
  const compareColors = ['#a0a0a0', '#88b4e8', '#d99e9e', '#a0a0a0', '#c8a8e8', '#f8c878'];
  const rows = Array.isArray(data) ? data : [];
  const usable = (metrics || []).filter(metric => rows.some(r => Math.abs(Number(r?.[metric] ?? 0)) > 0));
  const plotMetrics = usable.length ? usable : (metrics || []).slice(0, 3);
  const flow = plotMetrics.filter(x => ['revenue', 'expenses', 'profit', 'cash'].includes(x));
  const lineMetrics = flow.length ? flow : plotMetrics.slice(0, 4);
  return (
    <div className="sales-chart multi-metric-chart" style={{ minHeight: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ReLineChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid stroke="#f0f0f0" strokeDasharray="3 6" />
          <XAxis dataKey="month" tick={{ fill: '#7a7a7a', fontSize: 11 }} axisLine={{ stroke: '#e0e0e0' }} tickLine={false} />
          <YAxis tick={{ fill: '#7a7a7a', fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(0) + 'k' : String(v)} axisLine={false} tickLine={false} width={48} />
          <Tooltip formatter={(value, name) => [typeof value === 'number' ? currency(value) : value, label(name)]} contentStyle={{ borderRadius: 12, border: '1px solid #e0e0e0', boxShadow: 'none' }} />
          {lineMetrics.map((metric, index) => (
            <Line key={metric} type="monotone" dataKey={metric} name={metric} stroke={colors[index % colors.length]} strokeWidth={2.6} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
          ))}
          {compareData && compareLabel && lineMetrics.map((metric, index) => (
            <Line key={'c-' + metric} type="monotone" dataKey={'prev_' + metric} stroke={compareColors[index % compareColors.length]} strokeWidth={1.6} dot={false} strokeDasharray="5 5" isAnimationActive={false} />
          ))}
        </ReLineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TeamPerformanceChart`;
    if (re.test(m)) {
      m = m.replace(re, newMulti);
      console.log('[charts-ui] MultiMetric upgraded');
    } else console.warn('[charts-ui] MultiMetric not found');
  }

  if (!m.includes('Smooth cubic') && m.includes('function MiniTrendChart')) {
    const reMini = /function MiniTrendChart\(\{ data = \[\], height = 64, color = '#377dff', valueKey = 'value' \}\) \{[\s\S]*?\n\}\n\nfunction MiniBarChart/;
    const newMini = `function MiniTrendChart({ data = [], height = 64, color = '#377dff', valueKey = 'value' }) {
  const raw = (Array.isArray(data) ? data : []).slice(-20).map(d => Number(d?.[valueKey] ?? 0));
  const pts = raw.length ? raw : [0, 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = Math.max(1e-6, max - min);
  const w = 100;
  const pad = 3;
  const x = i => (pts.length > 1 ? (i / (pts.length - 1)) * w : w / 2);
  const y = v => height - pad - ((v - min) / span) * (height - pad * 2);
  let path = '';
  if (pts.length === 1) path = 'M' + x(0).toFixed(2) + ',' + y(pts[0]).toFixed(2);
  else {
    path = 'M' + x(0).toFixed(2) + ',' + y(pts[0]).toFixed(2);
    for (let i = 0; i < pts.length - 1; i++) {
      const x0 = x(i), y0 = y(pts[i]);
      const x1 = x(i + 1), y1 = y(pts[i + 1]);
      const cx = ((x0 + x1) / 2).toFixed(2);
      path += ' C' + cx + ',' + y0.toFixed(2) + ' ' + cx + ',' + y1.toFixed(2) + ' ' + x1.toFixed(2) + ',' + y1.toFixed(2);
    }
  }
  const area = path ? path + ' L' + x(pts.length - 1).toFixed(2) + ',' + height + ' L' + x(0).toFixed(2) + ',' + height + ' Z' : '';
  return (
    <svg viewBox={'0 0 ' + w + ' ' + height} preserveAspectRatio="none" style={{ width: '100%', height: height, display: 'block' }}>
      <path d={area} fill={color} opacity={0.10} />
      <path d={path} fill="none" stroke={color} strokeWidth={2.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function MiniBarChart`;
    if (reMini.test(m)) {
      m = m.replace(reMini, newMini);
      console.log('[charts-ui] MiniTrend smoothed');
    }
  }

  m = m.replace(
    '<section className="page-stack">\n      <div className="sales-hero">\n        <div>\n          <span>Account</span>\n          <h1>My Profile</h1>',
    '<section className="page-stack profile-workspace-v2 leave-workspace">\n      <div className="sales-hero">\n        <div>\n          <span>Account</span>\n          <h1>My Profile</h1>'
  );

  fs.writeFileSync(mainPath, m);
  console.log('[charts-ui] written', m.length);
}

patchRpc();
patchMain();
console.log('[charts-profile-perf] done');
