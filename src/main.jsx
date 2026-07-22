import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  Activity,
  Archive,
  ArrowRight,
  ArrowLeftRight,
  ArrowUpDown,
  BarChart3,
  Bell,
  Boxes,
  BriefcaseBusiness,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock,
  ClipboardCheck,
  Command,
  Download,
  Factory,
  FileText,
  Filter,
  FastForward,
  Gauge,
  Hourglass,
  Landmark,
  LineChart,
  Loader2,
  Map,
  MapPin,
  Menu,
  MoreVertical,
  Navigation,
  Package,
  Phone,
  PieChart as PieChartIcon,
  MessageSquare,
  Mail,
  QrCode,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Route,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Truck,
  Upload,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  X
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as ReLineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

// Global AI Assistant component
import AIAssistant from './components/AIAssistant/AIAssistant';
import PaySlip from './components/HR/PaySlip';
import { ExecutiveDashboardCharts } from './components/Reports/ReportsCharts';
import './styles.css';
import RawMaterialSetupModal from './components/Manufacturing/RawMaterialSetupModal';
import ReceiveMaterialModal from './components/Manufacturing/ReceiveMaterialModal';
import BOMSetupModal from './components/Manufacturing/BOMSetupModal';
import ProductionExecutionModal from './components/Manufacturing/ProductionExecutionModal';

const DEFAULT_USER = { email: 'miko@gmail.com', password: '1234567890' };
const num = value => Number.parseFloat(value || 0) || 0;
const currency = value => `Ksh${Number(value || 0).toLocaleString()}`;
const shortCurrency = value => {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1000000) return `Ksh${(n / 1000000).toFixed(n >= 10000000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1000) return `Ksh${Math.round(n / 1000)}K`;
  return `Ksh${Math.round(n).toLocaleString()}`;
};
const dateValue = row => String(row?.date || row?.createdAt || row?.created_at || row?.updatedAt || new Date().toISOString()).slice(0, 10);
function sortByDateDesc(rows, key = 'createdAt') {
  return [...(rows || [])].sort((a, b) => {
    const da = new Date(a?.[key] || a?.date || a?.created_at || a?.updatedAt || 0);
    const db = new Date(b?.[key] || b?.date || b?.created_at || b?.updatedAt || 0);
    return db - da;
  });
}
const REPORT_FORMATS = ['PDF', 'Excel', 'CSV', 'PowerPoint', 'Print', 'Email Package'];
const SERVER_CACHE_TTL = 5 * 60 * 1000;
const STALE_WHILE_REVALIDATE_TTL = 30 * 60 * 1000;
const serverCache = new globalThis.Map();
const serverInFlight = new globalThis.Map();

function rowSummary(row = {}) {
  return Object.entries(row)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 18)
    .map(([key, value]) => `${label(key)}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join('\n');
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const input = document.createElement('textarea');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

function printText(title, text) {
  const w = window.open('', '_blank', 'width=820,height=680');
  if (!w) return;
  w.document.write(`<html><head><title>${title}</title><style>body{font-family:Inter,Arial,sans-serif;padding:28px;line-height:1.5;color:#111827}pre{white-space:pre-wrap;border:1px solid #e5e7eb;border-radius:12px;padding:18px;background:#f9fafb}</style></head><body><h2>${title}</h2><pre>${text}</pre><script>window.print()</script></body></html>`);
  w.document.close();
}

function downloadRowsFile(name, rows = [], format = 'CSV') {
  const safeName = String(name || 'export').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const keys = Array.from(rows.reduce((set, row) => {
    Object.keys(row || {}).forEach(key => set.add(key));
    return set;
  }, new Set()));
  const csv = [
    keys.map(label).join(','),
    ...rows.map(row => keys.map(key => `"${String(row?.[key] ?? '').replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  const json = JSON.stringify(rows, null, 2);
  const text = format === 'JSON' ? json : csv;
  const blob = new Blob([text], { type: format === 'JSON' ? 'application/json' : 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.${format === 'JSON' ? 'json' : 'csv'}`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseExternalRecord(text = '') {
  const clean = String(text || '').trim();
  if (!clean) return {};
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) return parsed[0] || {};
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  const pairs = clean.split(/\r?\n|,/).map(part => part.trim()).filter(Boolean);
  const row = {};
  pairs.forEach((part, index) => {
    const match = part.match(/^([^:=\t]+)[:=\t](.+)$/);
    if (match) row[match[1].trim()] = match[2].trim();
    else if (index === 0) row.name = part;
    else if (index === 1) row.phone = part;
    else if (index === 2) row.email = part;
    else if (index === 3) row.city = part;
  });
  const aliases = {
    customer: 'name',
    customerName: 'customerName',
    mobile: 'phone',
    phoneNumber: 'phone',
    whatsappNumber: 'whatsapp',
    county: 'city',
    location: 'city',
    companyName: 'company',
    comment: 'comments',
    feedback: 'comments',
    followup: 'followUpDate',
    follow_up_date: 'followUpDate'
  };
  return Object.entries(row).reduce((acc, [key, value]) => {
    const compact = key.replace(/[^a-z0-9]/gi, '');
    const camel = compact.charAt(0).toLowerCase() + compact.slice(1);
    const mapped = aliases[key] || aliases[camel] || camel;
    acc[mapped] = value;
    return acc;
  }, {});
}
const mutatingRpc = fn => !/^get|^appHealth$|^globalSearch$|^generateReportExport$|^generateSpreadsheetExport$|^generateTaxInvoicePdf$/.test(fn);
const serverCacheKey = (user, fn, args = [], deps = []) => JSON.stringify({ fn, user: user?.id || user?.email || '', args, deps });
const defaultReportDates = () => ({
  startDate: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  endDate: new Date().toISOString().slice(0, 10)
});
const periodToReportDates = period => {
  const days = period === 'Day' ? 1 : period === 'Week' ? 7 : period === 'Quarter' ? 90 : period === 'Year' ? 365 : 30;
  return {
    startDate: new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    period
  };
};
const analyticsPeriodName = period => period === 'Day' ? 'Daily' : period === 'Week' ? 'Weekly' : period === 'Year' ? 'Yearly' : period === 'Quarter' ? 'Quarterly' : 'Monthly';
const businessDaysBetween = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate || startDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) days += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(days, 1);
};

async function rpc(fn, args = []) {
  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fn, args })
  });
  let body;
  try {
    body = await res.json();
  } catch {
    const text = await res.text().catch(() => '');
    const status = res.status ? `HTTP ${res.status}` : 'Network';
    throw new Error(text.includes('<') ? ` ${status}: server returned an HTML error page.` : text || ` ${status}: empty response from server.`);
  }
  if (body.error) throw new Error(body.error);
  if (mutatingRpc(fn)) {
    serverCache.clear();
    serverInFlight.clear();
    window.dispatchEvent(new CustomEvent('erp:data-mutated', { detail: { fn } }));
  }
  return body.result;
}

function cachedRpc(user, fn, args = [], deps = []) {
  const cacheKey = serverCacheKey(user, fn, args, deps);
  const hit = serverCache.get(cacheKey);
  const fresh = hit && Date.now() - hit.time < SERVER_CACHE_TTL;
  const stale = hit && Date.now() - hit.time < STALE_WHILE_REVALIDATE_TTL;
  if (fresh) return Promise.resolve(hit.data);
  if (serverInFlight.has(cacheKey)) return serverInFlight.get(cacheKey);
  const request = rpc(fn, [user, ...args])
    .then(data => {
      serverCache.set(cacheKey, { data, time: Date.now() });
      serverInFlight.delete(cacheKey);
      return data;
    })
    .catch(error => {
      serverInFlight.delete(cacheKey);
      if (stale) return hit.data;
      throw error;
    });
  serverInFlight.set(cacheKey, request);
  return request;
}

function downloadBase64File(file) {
  const bytes = Uint8Array.from(atob(file.content), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType || 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.fileName || 'report.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function openBase64File(file, shouldPrint = false) {
  const bytes = Uint8Array.from(atob(file.content), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType || 'application/pdf' }));
  const w = window.open(url, '_blank');
  if (!w) {
    downloadBase64File(file);
    URL.revokeObjectURL(url);
    return;
  }
  if (shouldPrint) setTimeout(() => {
    try { w.print(); } catch {}
  }, 700);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function htmlFromBase64(file) {
  return new TextDecoder().decode(Uint8Array.from(atob(file.content), c => c.charCodeAt(0)));
}

function openHtmlFile(file, shouldPrint = false) {
  const w = window.open('', '_blank');
  if (!w) {
    downloadBase64File(file);
    return;
  }
  w.document.write(htmlFromBase64(file));
  w.document.close();
  if (shouldPrint) setTimeout(() => w.print(), 300);
}

function handleGeneratedFile(file, format) {
  if (format === 'Print') {
    if (String(file.mimeType || '').includes('html')) openHtmlFile(file, true);
    else openBase64File(file, true);
    return;
  }
  downloadBase64File(file);
}

function ExportGlyph({ format, size = 16 }) {
  const Icon = format === 'Email Package' ? Mail : format === 'Print' ? Printer : format === 'PowerPoint' ? BarChart3 : format === 'PDF' ? FileText : Download;
  return <Icon size={size} />;
}

function ExportButton({ format = 'Export', onClick, disabled = false, primary = false, children }) {
  return (
    <button className={`export-button ${primary ? 'primary' : ''}`} onClick={onClick} disabled={disabled} type="button">
      <ExportGlyph format={format} />
      <span>{children || format}</span>
    </button>
  );
}

function ExportFormatStrip({ formats = REPORT_FORMATS, onExport, disabled = false, limit }) {
  const shown = limit ? formats.slice(0, limit) : formats;
  return (
    <div className="export-format-strip">
      {shown.map(format => (
        <ExportButton key={format} format={format} onClick={() => onExport(format)} disabled={disabled}>
          {format}
        </ExportButton>
      ))}
    </div>
  );
}

function useServer(user, fn, args = [], deps = []) {
  const cacheKey = useMemo(() => serverCacheKey(user, fn, args, deps), [fn, user?.id, user?.email, JSON.stringify(args), JSON.stringify(deps)]);
  const cached = serverCache.get(cacheKey);
  const [state, setState] = useState(() => cached ? { loading: false, data: cached.data, error: '', stale: false } : { loading: true, data: null, error: '', stale: false });
  useEffect(() => {
    let alive = true;
    const hit = serverCache.get(cacheKey);
    if (hit) {
      const isStale = Date.now() - hit.time >= SERVER_CACHE_TTL;
      setState({ loading: false, data: hit.data, error: '', stale: isStale });
      if (!isStale) return () => { alive = false; };
    } else {
      setState({ loading: true, data: null, error: '', stale: false });
    }
    cachedRpc(user, fn, args, deps)
      .then(data => {
        if (alive) setState({ loading: false, data, error: '', stale: false });
      })
      .catch(error => {
        if (alive) setState({ loading: false, data: hit?.data || null, error: error.message, stale: !!hit?.data });
      });
    return () => { alive = false; };
  }, [cacheKey]);
  return state;
}

const nav = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge },
  { id: 'analytics', label: 'Analytics', icon: LineChart },
  { id: 'sales', label: 'Sales', icon: ShoppingCart },
  { id: 'purchasing', label: 'Purchases', icon: ClipboardCheck },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'finance', label: 'Finance', icon: CircleDollarSign },
  { id: 'accounts', label: 'Accounts', icon: Landmark },
  { id: 'production', label: 'Manufacturing', icon: Factory },
  { id: 'customers', label: 'CRM', icon: Users },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'inputs', label: 'Inputs', icon: Command },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'email-admin', label: 'Email Admin', icon: ShieldCheck },
  { id: 'hr', label: 'HR', icon: UserCog },
  { id: 'leaves', label: 'Leaves', icon: CalendarClock },
  { id: 'requisitions', label: 'Requisitions', icon: ClipboardCheck },
  { id: 'settings', label: 'Settings', icon: Settings }
];
const routeAliases = { crm: 'customers', purchases: 'purchasing', manufacturing: 'production', emails: 'email-admin', leave: 'leaves' };
const pageAliases = { dashboard: true };
const routeForPage = id => id === 'customers' ? 'crm' : id === 'purchasing' ? 'purchases' : id === 'production' ? 'manufacturing' : id === 'emails' ? 'email-admin' : id === 'leave' ? 'leaves' : id;
const pageFromRoute = () => {
  const raw = window.location.hash.replace(/^#\/?/, '').split('/')[0] || 'dashboard';
  const page = routeAliases[raw] || raw;
  if (nav.some(item => item.id === page)) return page;
  if (raw && !pageAliases[raw]) return '__404__';
  return page;
};
const routeParts = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
const tabFromRoute = (tabs, fallback) => {
  const sub = routeParts()[1];
  return tabs.includes(sub) ? sub : fallback;
};

function useRouteTab(pageId, tabs, fallback) {
  const tabsKey = tabs.join('|');
  const [view, setViewState] = useState(() => tabFromRoute(tabs, fallback));
  useEffect(() => {
    const onHash = () => {
      if (pageFromRoute() === pageId) setViewState(tabFromRoute(tabs, fallback));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [pageId, tabsKey, fallback]);
  const setView = next => {
    setViewState(next);
    const route = routeForPage(pageId);
    if (window.location.hash !== `#/${route}/${next}`) window.location.hash = `/${route}/${next}`;
  };
  return [view, setView];
}

function App() {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('farmtrack-user');
    return raw ? JSON.parse(raw) : null;
  });
  const [page, setPageState] = useState(pageFromRoute);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('farmtrack-sidebar-collapsed') === 'true');
  const [inputOpen, setInputOpen] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [globalPeriod, setGlobalPeriod] = useState('Month');
  const setPage = next => {
    setPageState(next);
    const route = routeForPage(next);
    if (window.location.hash !== `#/${route}`) window.location.hash = `/${route}`;
  };
  useEffect(() => {
    const onHash = () => setPageState(pageFromRoute());
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) window.history.replaceState(null, '', `#/${routeForPage(page)}`);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    localStorage.setItem('farmtrack-sidebar-collapsed', sidebarCollapsed ? 'true' : 'false');
  }, [sidebarCollapsed]);
  useEffect(() => {
    const refresh = window.setInterval(() => {
      serverCache.clear();
      serverInFlight.clear();
      setDataVersion(v => v + 1);
    }, 60 * 60 * 1000);
    return () => window.clearInterval(refresh);
  }, []);
  useEffect(() => {
    const onMutation = () => setDataVersion(version => version + 1);
    window.addEventListener('erp:data-mutated', onMutation);
    return () => window.removeEventListener('erp:data-mutated', onMutation);
  }, []);
  useEffect(() => {
    if (!user) return undefined;
    const prefetchPlan = [
      ['getDashboardData', []],
      ['getAnalyticsData', []],
      ['getAnalyticsTabData', ['revenue', { ...defaultReportDates(), period: 'Monthly' }], ['revenue', JSON.stringify({ ...defaultReportDates(), period: 'Monthly' })]],
      ['getSalesWorkspaceData', []],
      ['getInventoryWorkspaceData', []],
      ['getProcurementWorkspaceData', []],
      ['getFinanceWorkspaceData', []],
      ['getCRMWorkspaceData', []],
      ['getManufacturingWorkspaceData', []],
      ['getReportCenterData', [defaultReportDates()], [JSON.stringify(defaultReportDates())]]
    ];
    const timers = prefetchPlan.map(([fn, args = [], deps = []], index) => window.setTimeout(() => {
      cachedRpc(user, fn, args, deps).catch(() => {});
    }, 600 + index * 450));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [user?.id]);

  if (!user) return <Login onLogin={u => {
    localStorage.setItem('farmtrack-user', JSON.stringify(u));
    setUser(u);
  }} />;

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar page={page} setPage={setPage} open={sidebarOpen} setOpen={setSidebarOpen} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} user={user} />
      <main className="main-shell">
        <Topbar user={user} setPage={setPage} period={globalPeriod} setPeriod={setGlobalPeriod} onMenu={() => setSidebarOpen(true)} onToggleSidebar={() => setSidebarCollapsed(v => !v)} sidebarCollapsed={sidebarCollapsed} onNew={() => setInputOpen(true)} onLogout={() => {
          localStorage.removeItem('farmtrack-user');
          setUser(null);
        }} />
        <div className="content-grid" key={`${page}-${dataVersion}`}>
          {page === 'dashboard' && <Dashboard user={user} setPage={setPage} globalPeriod={globalPeriod} setGlobalPeriod={setGlobalPeriod} />}
          {page === 'analytics' && <AnalyticsCenter user={user} setPage={setPage} globalPeriod={globalPeriod} />}
          {page === 'sales' && <SalesModule user={user} setPage={setPage} globalPeriod={globalPeriod} />}
          {page === 'purchasing' && <ProcurementWorkspace user={user} setPage={setPage} globalPeriod={globalPeriod} />}
          {page === 'inventory' && <InventoryWorkspace user={user} setPage={setPage} globalPeriod={globalPeriod} />}
          {page === 'finance' && <Finance user={user} setPage={setPage} globalPeriod={globalPeriod} />}
          {page === 'accounts' && <AccountsWorkspace user={user} setPage={setPage} globalPeriod={globalPeriod} />}
          {page === 'production' && <Manufacturing user={user} setPage={setPage} globalPeriod={globalPeriod} />}
          {page === 'customers' && <CRMWorkspace user={user} setPage={setPage} globalPeriod={globalPeriod} />}
          {page === 'reports' && <Reports user={user} setPage={setPage} title="Reports" globalPeriod={globalPeriod} />}
          {page === 'inputs' && <InputCenter user={user} setPage={setPage} />}
          {page === 'notifications' && <NotificationCenter user={user} setPage={setPage} />}
          {page === 'email' && <EmailWorkspace user={user} setPage={setPage} />}
          {page === 'email-admin' && <EmailAdminCenter user={user} setPage={setPage} />}
          {page === 'hr' && <HRWorkspace user={user} setPage={setPage} globalPeriod={globalPeriod} />}
          {page === 'leaves' && <LeaveWorkspace user={user} setPage={setPage} globalPeriod={globalPeriod} />}
          {page === 'requisitions' && <RequisitionsPage user={user} setPage={setPage} />}
{page === 'settings' && <SettingsPage user={user} />}
           {page === '__404__' && <ErrorState title="Page Not Found" error="The page you are looking for does not exist." statusCode={404} />}
         </div>
      </main>
      {inputOpen && <GlobalInputOverlay user={user} page={page} onClose={() => setInputOpen(false)} />}
        {/* Global AI Assistant – appears on every page */}
        <AIAssistant currentModule={page} user={user} onNavigate={setPage} />
    </div>
  );
}

function Login({ onLogin }) {
  const [form, setForm] = useState(DEFAULT_USER);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await rpc('loginUser', [form.email, form.password]);
      if (!result.success) throw new Error(result.message || 'Login failed');
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <section className="login-panel">
        <div className="brand-lockup">
          <div className="brand-mark"><img src="/erp-logo-black.png" alt="Farmtrack ERP logo" /></div>
          <div>
            <h1>Farmtrack Enterprise</h1>
            <p>Connected agriculture operating system</p>
          </div>
        </div>
        <form onSubmit={submit} className="login-form">
          {error && <div className="error-banner">{error}</div>}
          <label>Email<input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
          <label>Password<input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
          <button disabled={loading}>{loading ? <Loader2 className="spin" size={20} /> : 'Sign in'}</button>
          <span>Demo: miko@gmail.com / 1234567890</span>
        </form>
      </section>
    </div>
  );
}

function Sidebar({ page, setPage, open, setOpen, collapsed, setCollapsed, user }) {
  return (
    <>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <img src="/unity-erp-mark.png" alt="Unity ERP logo" />
          <button className="sidebar-collapse" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <ChevronDown size={17} />
          </button>
        </div>
        <nav>
          {nav.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => {
                setPage(item.id);
                setOpen(false);
              }}>
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <div className="avatar">{user.name?.[0] || 'U'}</div>
          <div>
            <strong>{user.name}</strong>
            <span>{user.role}</span>
          </div>
          <ChevronDown size={18} />
        </div>
      </aside>
      {open && <button className="mobile-scrim" onClick={() => setOpen(false)} aria-label="Close menu" />}
    </>
  );
}

function Topbar({ user, onMenu, onToggleSidebar, sidebarCollapsed, onNew, onLogout, setPage, period, setPeriod }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [bellData, setBellData] = useState({ unread: 0, critical: 0, recent: [] });
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeForm, setComposeForm] = useState({ to: '', cc: '', subject: '', body: '' });
  const [composeSending, setComposeSending] = useState(false);
  // Poll notification bell every 60s
  useEffect(() => {
    if (!user) return;
    const load = () => rpc('getNotificationsBell', [user]).then(d => setBellData(d)).catch(() => {});
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [user?.id, user?.email]);
  // Close bell on outside click
  useEffect(() => {
    if (!bellOpen) return;
    const close = e => { if (!e.target.closest('.notify-dropdown-wrap')) setBellOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [bellOpen]);
  const handleBellAction = async (notif, action) => {
    try {
      await rpc('resolveNotificationAction', [user, notif.id, action]);
      const refreshed = await rpc('getNotificationsBell', [user]);
      setBellData(refreshed);
    } catch (err) { console.error(err); }
  };
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    let alive = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      rpc('globalSearch', [user, q])
        .then(rows => {
          if (alive) setResults(rows || []);
        })
        .catch(() => {
          if (alive) setResults([]);
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, user?.id, user?.email]);
  const openResult = result => {
    const target = result.page || 'dashboard';
    const page = routeAliases[target] || target;
    setPage(page);
    setQuery('');
    setResults([]);
  };
  return (
    <header className="topbar">
      <button className="menu-button" onClick={onMenu}><Menu size={22} /></button>
      <button className="desktop-sidebar-toggle" onClick={onToggleSidebar}>{sidebarCollapsed ? 'Expand' : 'Retract'}</button>
      <div className="command-search">
        <Search size={18} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search customers, products, invoices, sales..." />
        <Command size={16} />
        {query.trim().length >= 2 && (
          <div className="search-results-panel">
            {searching && <div className="search-empty"><Loader2 className="spin" size={15} /> Searching...</div>}
            {!searching && results.length === 0 && <div className="search-empty">No matching records</div>}
            {!searching && results.map(result => (
              <button key={`${result.type}-${result.id}`} onClick={() => openResult(result)}>
                <strong>{result.label}</strong>
                <span>{result.type} · {result.sub || result.page}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="topbar-actions">
        <button><Sparkles size={20} /></button>
        <div className="notify-dropdown-wrap">
          <button className="notify" onClick={e => { e.stopPropagation(); setBellOpen(v => !v); }}>
            <Bell size={20} />
            {bellData.unread > 0 && <span>{bellData.unread}</span>}
          </button>
          {bellOpen && (
            <div className="notify-dropdown">
              <div className="notify-dropdown-header">
                <strong>Notifications</strong>
                {bellData.critical > 0 && <span className="notify-badge-critical">{bellData.critical} critical</span>}
              </div>
              <div className="notify-dropdown-list">
                {bellData.recent.length === 0 && <div className="notify-empty">No notifications</div>}
                {bellData.recent.map(n => (
                  <div key={n.id} className={`notify-item priority-${n.priority}`}>
                    <div className="notify-dot" />
                    <div className="notify-content">
                      <strong>{n.title}</strong>
                      <span>{n.message}</span>
                      <em>{timeAgoLabel(n.createdAt)}</em>
                    </div>
                    {n.sourceModule === 'leaves' && n.status === 'active' && (
                      <div className="notify-inline-actions">
                        <button onClick={() => handleBellAction(n, 'approve-leave')} className="btn-approve">Approve</button>
                        <button onClick={() => handleBellAction(n, 'reject-leave')} className="btn-reject">Reject</button>
                      </div>
                    )}
                    {n.sourceModule !== 'leaves' && n.status === 'active' && (
                      <button className="notify-ack" onClick={() => handleBellAction(n, 'acknowledge')}><CheckCircle2 size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
              <button className="notify-dropdown-footer" onClick={() => { setBellOpen(false); setPage('notifications'); }}>View All Notifications</button>
            </div>
          )}
        </div>
        <div className="date-chip topbar-period">
          <Calendar size={16} />
          {['Day', 'Week', 'Month', 'Quarter', 'Year'].map(item => <button key={item} className={period === item ? 'active' : ''} onClick={() => setPeriod(item)}>{item}</button>)}
        </div>
        <button className="new-button" onClick={onNew}><Plus size={18} /> New</button>
        <button className="topbar-email-btn" onClick={() => setComposeOpen(true)} title="Compose Email"><Mail size={18} /></button>
        <a className="spreadsheet-link" href="https://docs.google.com/spreadsheets/d/1ZGX71pFHkJPNA17s5LRCFT_T58eskby9zpj8RPHveYA/edit?gid=976100262#gid=976100262" target="_blank" rel="noopener noreferrer"><span className="spreadsheet-icon">📊</span> Sheets</a>
        <button className="logout" onClick={onLogout}>{user.name?.[0] || 'U'}</button>
      </div>
      {composeOpen && (
        <div className="modal-backdrop" onClick={() => setComposeOpen(false)}>
          <form className="modal-card" onClick={e => e.stopPropagation()} onSubmit={async e => {
            e.preventDefault();
            setComposeSending(true);
            try {
              const res = await rpc('sendComposedEmail', [user, composeForm]);
              if (res.error) alert(res.error);
              else { alert('Email sent successfully'); setComposeOpen(false); setComposeForm({ to: '', cc: '', subject: '', body: '' }); }
            } catch (err) { alert(err.message); }
            setComposeSending(false);
          }}>
            <header><h2>Compose Email</h2><button type="button" onClick={() => setComposeOpen(false)}><X size={18} /></button></header>
            <label>To<input type="email" value={composeForm.to} onChange={e => setComposeForm({ ...composeForm, to: e.target.value })} placeholder="recipient@email.com" required /></label>
            <label>CC<input type="email" value={composeForm.cc} onChange={e => setComposeForm({ ...composeForm, cc: e.target.value })} placeholder="Optional" /></label>
            <label>Subject<input value={composeForm.subject} onChange={e => setComposeForm({ ...composeForm, subject: e.target.value })} required /></label>
            <label>Message<textarea value={composeForm.body} onChange={e => setComposeForm({ ...composeForm, body: e.target.value })} rows={6} required /></label>
            <button className="primary-action" disabled={composeSending}>{composeSending ? 'Sending...' : <><Send size={14} /> Send Email</>}</button>
          </form>
        </div>
      )}
    </header>
  );
}

function timeAgoLabel(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function Dashboard({ user, setPage, globalPeriod = 'Month', setGlobalPeriod = () => {} }) {
  const { loading, data, error } = useServer(user, 'getDashboardData');
  const period = analyticsPeriodName(globalPeriod);
  if (loading) return <Loading title="Dashboard" />;
  if (error) return <ErrorState title="Dashboard" error={error} />;

  const s = data.stats;
  const chartRows = data.charts?.series?.[period] || data.charts?.series?.Monthly || [];
  const categories = data.charts.categorySales.slice(0, 5);
  const categoryTotal = categories.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const colors = ['#6d4aff', '#377dff', '#3cc76f', '#ffac33', '#f64e4e'];
  const command = data.commandCenter || {};

  return (
    <section className="page-stack dashboard-shell">
      <CommandHero command={command} />
      <div className="inline-actions"><CreateRequisitionButton user={user} module="dashboard" /></div>
      <div className="control-grid">
        <KpiCard icon={CircleDollarSign} label="Revenue" value={currency(s.totalRevenue)} change={s.revenueChange || 3.2} tone="green" />
        <KpiCard icon={LineChart} label="Profit" value={currency(s.netProfit)} change={s.profitChange || 2.4} tone="green" />
        <KpiCard icon={BriefcaseBusiness} label="Cash Position" value={currency(s.cashPosition)} change={8.4} tone="blue" />
        <KpiCard icon={Warehouse} label="Inventory Value" value={currency(s.inventoryValue)} change={-s.lowStockItems} tone={s.lowStockItems ? 'red' : 'green'} />
        <KpiCard icon={Users} label="Sales Pipeline" value={currency(s.salesPipeline)} change={12.4} tone="blue" />
        <KpiCard icon={Factory} label="Production" value={Number(s.productionOpen || 0).toLocaleString()} change={s.productionOpen ? -4 : 4} tone={s.productionOpen ? 'red' : 'green'} />
      </div>
      <CrossLinks setPage={setPage} links={[
        { id: 'sales', label: 'Sales Orders', desc: 'Manage orders & invoices', icon: ShoppingCart },
        { id: 'customers', label: 'CRM', desc: 'Customers & leads', icon: Users },
        { id: 'inventory', label: 'Inventory', desc: 'Stock & movements', icon: Package },
        { id: 'finance', label: 'Finance', desc: 'Journals & expenses', icon: Wallet },
        { id: 'purchasing', label: 'Purchasing', desc: 'Suppliers & POs', icon: Truck },
        { id: 'production', label: 'Production', desc: 'Manufacturing jobs', icon: Factory },
        { id: 'hr', label: 'HR', desc: 'Employees & attendance', icon: UserCog },
        { id: 'leaves', label: 'Leaves', desc: 'Apply & approve leave', icon: CalendarClock }
      ]} />
      <div className="dashboard-grid">
        <Panel className="span-7" title="Revenue Overview" action={
          <div className="chart-period-switch">
            <Filter size={14} />
            {['Week', 'Month', 'Year'].map(item => (
              <button key={item} type="button" className={globalPeriod === item ? 'active' : ''} onClick={() => setGlobalPeriod(item)}>
                {item}
              </button>
            ))}
          </div>
        }>
          <ResponsiveContainer width="100%" height={260}>
            <ReLineChart data={chartRows} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#667085', fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#667085', fontSize: 12 }} tickFormatter={v => `Ksh${Math.round(v / 1000)}K`} />
              <Tooltip formatter={v => currency(v)} />
              <Line type="monotone" dataKey="revenue" stroke="#050505" strokeWidth={3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="expenses" stroke="#a7afbd" strokeWidth={3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="profit" stroke="#101828" strokeWidth={3} dot={{ r: 4 }} />
            </ReLineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel className="span-5" title="Sales by Category">
          <div className="category-panel">
            <ResponsiveContainer width="45%" height={230}>
              <PieChart>
                <Pie data={categories} dataKey="total" innerRadius={62} outerRadius={104} paddingAngle={0}>
                  {categories.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="category-list">
              {categories.map((item, index) => (
                <div key={item.name}>
                  <span style={{ '--dot': colors[index % colors.length] }}>{item.name}</span>
                  <strong>{currency(item.total)}</strong>
                  <em>{Math.round((item.total / Math.max(1, categoryTotal)) * 100)}%</em>
                </div>
              ))}
            </div>
          </div>
        </Panel>
        <Panel className="span-4 attention-panel" title="Needs Attention">
          <AttentionList items={command.attention || []} onNavigate={setPage} />
        </Panel>
        <Panel className="span-4 action-panel" title="Recommended Actions">
          <ActionList items={command.actions || []} onNavigate={setPage} />
        </Panel>
        <Panel className="span-4 forecast-panel" title="Likely Next">
          <ForecastCard forecast={command.forecast} />
        </Panel>
        <Panel className="span-6" title="Recent Orders" action="View all">
          <SimpleTable rows={data.recentSales || []} columns={['saleNo', 'customerName', 'date', 'total', 'status']} />
        </Panel>
        <Panel className="span-6" title="Top Products" action="View all">
          <TopProducts categories={categories} />
        </Panel>
        <DashboardRequisitionWidget user={user} />
      </div>
    </section>
  );
}

function AnalyticsCenter({ user, setPage, globalPeriod = 'Month' }) {
  const { loading, data, error } = useServer(user, 'getAnalyticsData');
  const tabs = [
    ['revenue', 'Revenue Intelligence'],
    ['sales', 'Sales Intelligence'],
    ['inventory', 'Inventory Intelligence'],
    ['production', 'Production Intelligence'],
    ['procurement', 'Procurement Intelligence'],
    ['customer', 'Customer Intelligence'],
    ['financial', 'Financial Intelligence'],
    ['ai', 'AI Intelligence'],
    ['forecasting', 'Forecasting']
  ];
  const [activeTab, setActiveTab] = useRouteTab('analytics', tabs.map(([id]) => id), 'revenue');
  const [tabFilters, setTabFilters] = useState({ revenue: { ...periodToReportDates(globalPeriod), period: analyticsPeriodName(globalPeriod) } });
  const [compareTo, setCompareTo] = useState('');
  useEffect(() => {
    setTabFilters(prev => ({
      ...prev,
      [activeTab]: { ...(prev[activeTab] || {}), ...periodToReportDates(globalPeriod), period: analyticsPeriodName(globalPeriod) }
    }));
  }, [globalPeriod, activeTab]);
  const tabState = useServer(user, 'getAnalyticsTabData', [activeTab, tabFilters[activeTab] || {}], [activeTab, JSON.stringify(tabFilters[activeTab] || {})]);
  if (loading) return <Loading title="Analytics" />;
  if (error) return <ErrorState title="Analytics" error={error} />;
  if (tabState.error) return <ErrorState title="Analytics" error={tabState.error} />;
  const active = tabState.data;
  const currentFilters = tabFilters[activeTab] || {};
  const updateActiveFilter = patch => setTabFilters(prev => ({ ...prev, [activeTab]: { ...(prev[activeTab] || {}), ...patch } }));
  const activeTabLabel = tabs.find(([id]) => id === activeTab)?.[1] || 'Analytics';
  async function exportAnalyticsReport(report, format = 'PDF') {
    const file = await rpc('generateReportExport', [user, {
      ...currentFilters,
      module: active?.tabName || 'Analytics',
      reportName: report.name,
      startDate: active?.filters?.startDate || currentFilters.startDate,
      endDate: active?.filters?.endDate || currentFilters.endDate
    }, format]);
    handleGeneratedFile(file, format);
  }
  const exportCurrentAnalytics = format => exportAnalyticsReport({ name: active?.tabName || activeTabLabel }, format);
  const executiveActions = [
    { title: 'Review CRM follow-ups', detail: `${data.customerIntelligence?.filter(c => c.health !== 'Healthy').length || 0} customer risk signals`, page: 'customers', icon: Users },
    { title: 'Check inventory risk', detail: `${data.inventoryIntelligence?.low || 0} low stock items`, page: 'inventory', icon: Package },
    { title: 'Open finance reports', detail: `${data.financialIntelligence?.arRisk || 0} receivable risk items`, page: 'reports', icon: Wallet },
    { title: 'Procurement action', detail: `${data.procurementIntelligence?.length || 0} supplier scorecards`, page: 'purchasing', icon: Truck }
  ];
  const colors = ['#050505', '#6d4aff', '#377dff', '#101828', '#ffac33', '#f64e4e'];
  const comparisonMap = { 'Previous Month': 0.92, 'Previous Quarter': 0.85, 'Previous Year': 0.78, 'Company Average': 1.0, 'Department Average': 0.95, 'Target': 1.05 };
  function compareValue(value, label) {
    if (!compareTo || value === undefined || value === null || isNaN(Number(value))) return null;
    const multiplier = comparisonMap[compareTo] || 1;
    const hash = label.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const adjusted = multiplier + (hash % 10) / 100 - 0.05;
    const compared = Number(value) * adjusted;
    const diff = ((Number(value) - compared) / Math.max(1, compared)) * 100;
    const sign = diff >= 0 ? '+' : '';
    return `${sign}${diff.toFixed(1)}% vs ${compareTo}`;
  }
  return (
    <section className="page-stack analytics-page">
      <div className="inline-actions"><CreateRequisitionButton user={user} module="analytics" /></div>
      <section className="analytics-hero">
        <div>
          <span>Advanced Analytics Command Center</span>
          <h1>{data.hero.title}</h1>
          <p>{data.hero.subtitle}</p>
          {data.dataSource && (
            <div className={`data-source-badge ${data.dataSource.normalized ? 'live' : 'fallback'}`}>
              <CheckCircle2 size={15} />
              <div>
                <strong>{data.dataSource.mode}</strong>
                <em>{data.dataSource.message}</em>
              </div>
              <small>{(data.hero.dataSources || []).slice(0, 4).join(' + ')}</small>
            </div>
          )}
        </div>
        <div className="confidence-ring">
          <strong>{data.hero.confidence}%</strong>
          <span>Decision confidence</span>
        </div>
      </section>

      <div className="analytics-tabs">
        {tabs.map(([id, name]) => <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>{name}</button>)}
      </div>
      <label className="analytics-tab-select">View
        <select value={activeTab} onChange={e => setActiveTab(e.target.value)}>
          {tabs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>

      {active && (
        <>
          <div className="analytics-filter-bar">
            <div className="analytics-filter-row primary">
              <strong>Viewing {globalPeriod}: {currentFilters.startDate} to {currentFilters.endDate}</strong>
              {['Weekly', 'Monthly', 'Quarterly', 'Yearly'].map(period => <button key={period} className={currentFilters.period === period ? 'active' : ''} onClick={() => updateActiveFilter({ period })}>{period}</button>)}
              <label>From<input type="date" value={currentFilters.startDate || ''} onChange={e => updateActiveFilter({ startDate: e.target.value })} /></label>
              <label>To<input type="date" value={currentFilters.endDate || ''} onChange={e => updateActiveFilter({ endDate: e.target.value })} /></label>
              <label>Compare To
                <select value={compareTo} onChange={e => setCompareTo(e.target.value)}>
                  <option value="">None</option>
                  {['Previous Month', 'Previous Quarter', 'Previous Year', 'Company Average', 'Department Average', 'Target'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </label>
            </div>
            <div className="analytics-filter-row secondary">
              {['products', 'customers', 'regions', 'salesReps'].map(key => (
                <button key={key} onClick={() => updateActiveFilter({ [key]: active.filters[key] === 'All' ? 'Filtered' : 'All' })}>
                  {label(key)}: {active.filters[key]}
                </button>
              ))}
              <ExportFormatStrip formats={REPORT_FORMATS} onExport={exportCurrentAnalytics} />
              <span>{tabState.loading ? 'Refreshing...' : `Last refresh ${new Date(active.lastRefresh).toLocaleTimeString()}`}</span>
            </div>
          </div>
          <AnalyticsSourcePanel source={data.dataSource} hero={data.hero} />

          <div className="analytics-kpi-row">
            {active.kpis.map(kpi => {
              const cmp = compareValue(kpi.value, kpi.label);
              return (
                <article key={kpi.label}>
                  <span>{kpi.label}</span>
                  <strong>{kpi.type === 'money' ? currency(kpi.value) : `${kpi.value}${kpi.suffix || ''}`}</strong>
                  {cmp && <em style={{ color: cmp.startsWith('+') ? '#16a34a' : '#dc2626', fontSize: 12 }}>{cmp}</em>}
                </article>
              );
            })}
          </div>

          <div className="analytics-storyline">
            <article className="analytics-story-card primary">
              <span>Storyline</span>
              <strong>{active.storyline?.headline}</strong>
              <p>{active.storyline?.narrative}</p>
            </article>
            {(active.focusCards || []).map(card => (
              <article key={card.label} className="analytics-story-card">
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <p>{card.detail}</p>
              </article>
            ))}
          </div>
          <div className="analytics-action-cards">
            {executiveActions.map(action => {
              const Icon = action.icon;
              return (
                <button key={action.title} type="button" onClick={() => setPage(action.page)}>
                  <Icon size={18} />
                  <span>{action.title}</span>
                  <strong>{action.detail}</strong>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="dashboard-grid">
        {active && (
          <Panel className="span-12 sales-main-chart" title={active.tabName} action={<><ExportFormatStrip formats={REPORT_FORMATS} onExport={exportCurrentAnalytics} /><button onClick={() => setPage('sales')} style={{ marginLeft: 8 }}>Drill Down →</button></>}>
            <SalesTrendChart data={active.trend} metric={active.chartMetric} />
          </Panel>
        )}
        {active && (
          <>
            <Panel className="span-6" title={`${active.tabName} Drilldown`} action={<button onClick={() => setPage(activeTab === 'inventory' ? 'inventory' : activeTab === 'production' ? 'production' : activeTab === 'procurement' ? 'purchasing' : activeTab === 'customer' ? 'customers' : activeTab === 'financial' ? 'finance' : 'sales')}>Drill Down →</button>}>
              <SimpleTable rows={(active.breakdown || active.trend || []).map((row, index) => ({ id: index, ...row }))} columns={active.breakdown?.length ? ['name', 'value'] : ['month', active.chartMetric]} />
            </Panel>
            <Panel className="span-6" title={`${active.tabName} Reports`} action={<ExportFormatStrip formats={REPORT_FORMATS} onExport={exportCurrentAnalytics} />}>
              <div className="sales-report-grid compact-reports">
                {active.reports.map(report => (
                  <article key={report.name}>
                    <strong>{report.name}</strong>
                    <span>{report.dateRange} - {report.records} records</span>
                    <div>{report.exports.map(x => <button key={x} onClick={() => exportAnalyticsReport(report, x)}>{x}</button>)}</div>
                  </article>
                ))}
              </div>
            </Panel>
            <Panel className="span-6" title={`${active.tabName} Next Actions`}>
              <div className="analytics-action-list">
                {(active.nextActions || []).map(action => (
                  <article key={action.title}>
                    <strong>{action.title}</strong>
                    <span>{action.owner}</span>
                    <em>{action.impact}</em>
                  </article>
                ))}
              </div>
            </Panel>
            <Panel className="span-6" title={`${active.tabName} Source Tables`}>
              <div className="analytics-source-list">
                {(active.sourceTables || []).map(source => (
                  <article key={source.table}>
                    <strong>{source.table}</strong>
                    <span>{source.role}</span>
                    <em>{source.records} records</em>
                  </article>
                ))}
              </div>
            </Panel>
          </>
        )}
        <Panel className="span-7" title="Revenue Waterfall" action={<button onClick={() => setPage('sales')}>Drill Down →</button>}>
          <div className="waterfall">
            {data.revenueWaterfall.map((item, index) => (
              <div key={item.label} className={item.type}>
                <span>{item.label}</span>
                <strong>{currency(Math.abs(item.value))}</strong>
                {index < data.revenueWaterfall.length - 1 && <em>↓</em>}
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="span-5" title="Revenue Heatmap" action={globalPeriod}>
          <RevenueHeatmap cells={data.revenueHeatmap || []} summary={data.revenueHeatmapSummary} />
        </Panel>
        <Panel className="span-6" title="Revenue by Product" action={<button onClick={() => setPage('sales')}>Drill Down →</button>}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart3Compat data={data.revenueBreakdown} colors={colors} />
          </ResponsiveContainer>
        </Panel>
        <Panel className="span-6" title="Customer Intelligence" action={<button onClick={() => setPage('customers')}>Drill Down →</button>}>
          <div className="customer-intelligence-list">
            {data.customerIntelligence.map(customer => (
              <article key={customer.name}>
                <div>
                  <strong>{customer.name}</strong>
                  <span>{customer.health} · {customer.churnRisk}% churn risk</span>
                </div>
                <b>{currency(customer.lifetimeValue)}</b>
              </article>
            ))}
          </div>
        </Panel>
        <Panel className="span-4" title="Inventory Intelligence" action={<button onClick={() => setPage('inventory')}>Drill Down →</button>}>
          <MetricStack items={[
            ['Healthy', data.inventoryIntelligence.healthy],
            ['Low', data.inventoryIntelligence.low],
            ['Dead', data.inventoryIntelligence.dead],
            ['Fast Moving', data.inventoryIntelligence.fastMoving],
            ['Slow Moving', data.inventoryIntelligence.slowMoving],
            ['Turnover', `${data.inventoryIntelligence.turnover}x`]
          ]} />
        </Panel>
        <Panel className="span-4" title="Procurement Intelligence" action={<button onClick={() => setPage('purchasing')}>Drill Down →</button>}>
          <Scorecards items={data.procurementIntelligence} />
        </Panel>
        <Panel className="span-4" title="Production Intelligence" action={<button onClick={() => setPage('production')}>Drill Down →</button>}>
          <MetricStack items={[
            ['Planned Output', data.productionIntelligence.planned],
            ['Actual Output', data.productionIntelligence.completed],
            ['Delayed Jobs', data.productionIntelligence.delayed],
            ['Waste', data.productionIntelligence.waste]
          ]} />
        </Panel>
        <Panel className="span-6" title="Sales Funnel" action={<button onClick={() => setPage('sales')}>Drill Down →</button>}>
          <div className="funnel">
            {data.salesIntelligence.funnel.map((stage, index) => (
              <div key={stage.stage} style={{ width: `${100 - index * 10}%` }}>
                <span>{stage.stage}</span>
                <strong>{stage.count}</strong>
                <em>{currency(stage.value)}</em>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="span-6" title="Financial Intelligence" action={<button onClick={() => setPage('finance')}>Drill Down →</button>}>
          <MetricStack items={[
            ['Cash 30 Days', currency(data.financialIntelligence.cash30)],
            ['Cash 60 Days', currency(data.financialIntelligence.cash60)],
            ['Cash 90 Days', currency(data.financialIntelligence.cash90)],
            ['AR Risk Items', data.financialIntelligence.arRisk],
            ['Profitability', `${data.financialIntelligence.profitability}%`]
          ]} />
        </Panel>
        <Panel className="span-7" title="AI Business Intelligence" action={<ExportFormatStrip formats={REPORT_FORMATS} onExport={exportCurrentAnalytics} />}>
          <div className="ai-insights">
            <div className="analytics-storyline" style={{ marginBottom: 16 }}>
              <article className="analytics-story-card primary">
                <span>AI Summary</span>
                <strong>{(active?.insights || data.aiIntelligence || []).length} insights generated</strong>
                <p>{(active?.insights || data.aiIntelligence || []).filter(i => (i.confidence || '').toLowerCase() === 'high').length} high confidence, {(active?.insights || data.aiIntelligence || []).filter(i => i.action).length} require action</p>
              </article>
            </div>
            {(active?.insights || data.aiIntelligence).map(item => (
              <article key={item.question} style={{ marginBottom: 12, borderBottom: '1px solid #e5e7eb', paddingBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Sparkles size={16} style={{ color: '#6d4aff' }} />
                  <strong>{item.question}</strong>
                  <span style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px', borderRadius: 4, background: (item.confidence || 'Medium').toLowerCase() === 'high' ? '#dcfce7' : (item.confidence || 'Medium').toLowerCase() === 'low' ? '#fee2e2' : '#fef9c3', color: '#111827' }}>{item.confidence || 'Medium'} Confidence</span>
                </div>
                <p>{item.answer}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: '#667085' }}>Sources: {(item.records || []).join(', ')}</span>
                  <button onClick={() => item.actionPage && setPage(item.actionPage)} style={{ fontSize: 12 }}>{item.action || 'Investigate'}</button>
                </div>
              </article>
            ))}
          </div>
        </Panel>
        <Panel className="span-5" title="Executive War Room">
          <WarRoom warRoom={data.warRoom} />
        </Panel>
        <Panel className="span-12" title="Report Generation Center" action={<ExportFormatStrip formats={REPORT_FORMATS} onExport={exportCurrentAnalytics} />}>
          <div className="report-grid">
            {(active?.reports || data.reports.map(name => ({ name }))).map(report => <button key={report.name} onClick={() => exportAnalyticsReport(report, 'PDF')}><FileText size={20} />{report.name}</button>)}
          </div>
        </Panel>
      </div>
    </section>
  );
}


function AnalyticsSourcePanel({ source = {}, hero = {} }) {
  const tables = source.tables || hero.dataSources || [];
  return (
    <section className={`analytics-source-panel ${source.normalized ? 'live' : 'fallback'}`}>
      <div>
        <span>Data Source</span>
        <strong>{source.status || source.mode || 'Checking'}</strong>
        <p>{source.message || 'Analytics source status is being prepared.'}</p>
      </div>
      <div>
        <span>Records Loaded</span>
        <strong>{Number(source.recordsLoaded || 0).toLocaleString()}</strong>
        <p>Last sync {source.lastSync ? new Date(source.lastSync).toLocaleString() : 'not available'}</p>
      </div>
      <div>
        <span>Supabase Views</span>
        <strong>{tables.length}</strong>
        <p>{tables.slice(0, 3).join(', ')}{tables.length > 3 ? '...' : ''}</p>
      </div>
    </section>
  );
}

function RevenueHeatmap({ cells = [], summary = {} }) {
  const max = Math.max(...cells.map(cell => num(cell.value)), 1);
  const level = value => value <= 0 ? 0 : value / max > 0.75 ? 4 : value / max > 0.5 ? 3 : value / max > 0.25 ? 2 : 1;
  const weeks = [];
  cells.forEach((cell, index) => {
    const week = Math.floor(index / 7);
    (weeks[week] ||= []).push(cell);
  });
  return (
    <div className="revenue-heatmap">
      <div className="heatmap-summary">
        <article><span>Total</span><strong>{shortCurrency(summary.total || 0)}</strong></article>
        <article><span>Average Day</span><strong>{shortCurrency(summary.average || 0)}</strong></article>
        <article><span>Best Day</span><strong>{summary.bestDay?.date || '-'} / {shortCurrency(summary.bestDay?.value || 0)}</strong></article>
      </div>
      <div className="heatmap-weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="heatmap-calendar">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex}>
            {week.map(cell => (
              <button key={cell.date || `${weekIndex}-${cell.day}`} type="button" className={`heat-${level(num(cell.value))}`} title={`${cell.date}: ${currency(cell.value)} / ${cell.orders || 0} orders`}>
                <span>{cell.day}</span>
                <strong>{shortCurrency(cell.value).replace('Ksh', '').trim()}</strong>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="heatmap-legend"><span>Low</span><i className="heat-1" /><i className="heat-2" /><i className="heat-3" /><i className="heat-4" /><span>High</span></div>
    </div>
  );
}

function BarChart3Compat({ data, colors }) {
  return (
    <ReLineChart data={data} margin={{ top: 18, right: 20, bottom: 8, left: 0 }}>
      <CartesianGrid stroke="#eef0f3" vertical={false} />
      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#667085', fontSize: 11 }} />
      <YAxis tickLine={false} axisLine={false} tick={{ fill: '#667085', fontSize: 12 }} tickFormatter={v => `Ksh${Math.round(v / 1000)}K`} />
      <Tooltip formatter={v => currency(v)} />
      <Line type="monotone" dataKey="value" stroke={colors[1]} strokeWidth={3} dot={{ r: 5 }} />
    </ReLineChart>
  );
}

function MetricStack({ items }) {
  return (
    <div className="metric-stack">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function Scorecards({ items }) {
  return (
    <div className="scorecards">
      {items.slice(0, 4).map(item => (
        <article key={item.supplier}>
          <strong>{item.supplier}</strong>
          <span>Lead {item.leadTime}d · Quality {item.quality}%</span>
          <div><em style={{ width: `${item.deliveryAccuracy}%` }} /></div>
        </article>
      ))}
    </div>
  );
}

function WarRoom({ warRoom }) {
  return (
    <div className="war-room">
      <h3>Risk Center</h3>
      {warRoom.risks.map(item => <div key={item.label}><span>{item.label}</span><strong>{item.level}</strong><em>{item.value}</em></div>)}
      <h3>Opportunity Center</h3>
      {warRoom.opportunities.map(item => <div key={item.label}><span>{item.label}</span><strong>{currency(item.value)}</strong></div>)}
      <h3>Predictive Center</h3>
      {warRoom.forecasts.map(item => <div key={item.label}><span>{item.label}</span><strong>{typeof item.value === 'number' && item.value > 10000 ? currency(item.value) : item.value}</strong></div>)}
    </div>
  );
}

function CommandHero({ command }) {
  return (
    <section className="command-hero">
      <div>
        <span>{command.roleProfile || 'Executive Command Center'}</span>
        <h1>{command.greeting || 'Good Morning'}</h1>
        <p>{command.company || 'Farmtrack Bio Sciences Ltd'} · Business control center</p>
      </div>
      <div className="hero-pulse">
        <span />
        Live business signals
      </div>
    </section>
  );
}

const areaToPage = area => ({
  Inventory: 'inventory',
  Delivery: 'sales',
  Sales: 'sales',
  Approvals: 'sales',
  CRM: 'customers',
  Procurement: 'purchasing',
  Finance: 'finance',
  Production: 'production'
}[area] || 'dashboard');

function AttentionList({ items, onNavigate }) {
  if (!items.length) return <div className="quiet-state">No urgent business risks detected.</div>;
  return (
    <div className="attention-list">
      {items.map((item, index) => (
        <article key={index} className={item.severity}>
          <strong>{item.title}</strong>
          <p>{item.detail}</p>
          <span>{item.area}</span>
          <button onClick={() => onNavigate?.(areaToPage(item.area))}>{item.action}</button>
        </article>
      ))}
    </div>
  );
}

function ActionList({ items, onNavigate }) {
  return (
    <div className="action-list">
      {items.map((item, index) => (
        <button key={index} onClick={() => onNavigate?.(areaToPage(item.area))}>
          <span>{item.label}</span>
          <strong>{item.count}</strong>
          <em>{item.area}</em>
        </button>
      ))}
    </div>
  );
}

function ForecastCard({ forecast }) {
  if (!forecast) return <div className="quiet-state">Forecast unavailable.</div>;
  return (
    <div className="forecast-card">
      <div>
        <span>Next month revenue</span>
        <strong>{currency(forecast.revenueNextMonth)}</strong>
      </div>
      <div>
        <span>Expected cash</span>
        <strong>{currency(forecast.cashExpected)}</strong>
      </div>
      <div>
        <span>Risk level</span>
        <strong>{forecast.riskLevel}</strong>
      </div>
      <p>{forecast.summary}</p>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, change, tone }) {
  return (
    <article className="kpi-card">
      <div className="kpi-head">
        <span><Icon size={22} /></span>
        <strong>{label}</strong>
      </div>
      <h3>{value}</h3>
      <div className={`change ${change >= 0 ? 'up' : 'down'} ${tone}`}>{change >= 0 ? '+' : ''}{change}%</div>
      <small>vs last month</small>
      <Sparkline tone={tone} />
    </article>
  );
}

function Sparkline({ tone }) {
  const data = [12, 18, 16, 24, 19, 28, 22, 20, 29, 35].map((v, i) => ({ i, v }));
  const color = tone === 'red' ? '#ff2d2d' : tone === 'blue' ? '#2563eb' : '#1db954';
  return (
    <div className="sparkline">
      <ResponsiveContainer width="100%" height={44}>
        <AreaChart data={data}>
          <Area type="monotone" dataKey="v" stroke={color} fill="transparent" strokeWidth={2.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Panel({ title, action, className = '', children }) {
  return (
    <article className={`panel ${className}`}>
      <header>
        <h2>{title}</h2>
        {action && (typeof action === 'string'
          ? <button>{action}<ChevronDown size={14} /></button>
          : <div className="panel-action-node">{action}</div>)}
      </header>
      {children}
    </article>
  );
}

function PageTitle({ title, icon: Icon }) {
  return (
    <div className="page-title">
      {Icon && <Icon size={24} />}
      <h1>{title}</h1>
    </div>
  );
}

/* Cross-page quick links — shows related pages for interconnectivity */
function CrossLinks({ setPage, links = [] }) {
  if (!links.length) return null;
  return (
    <div className="cross-links">
      {links.map(l => (
        <button key={l.id} className="cross-link-chip" onClick={() => setPage(l.id)}>
          {l.icon && <l.icon size={14} />}
          <strong>{l.label}</strong>
          {l.desc && <span>{l.desc}</span>}
        </button>
      ))}
    </div>
  );
}

function DataPage({ user, title, icon, fn, columns }) {
  const { loading, data, error } = useServer(user, fn);
  if (loading) return <Loading title={title} />;
  if (error) return <ErrorState title={title} error={error} />;
  return (
    <section className="page-stack">
      <PageTitle title={title} icon={icon} />
      <Panel title={title} action="Export">
        <SimpleTable rows={data || []} columns={columns} />
      </Panel>
    </section>
  );
}

function CRMWorkspace({ user, setPage, globalPeriod = 'Month' }) {
  const tabs = ['overview', 'pipeline', 'customers', 'leads', 'calls', 'activities', 'reports', 'analytics'];
  const [refreshKey, setRefreshKey] = useState(0);
  const { loading, data, error } = useServer(user, 'getCRMWorkspaceData', [{ period: globalPeriod }], [refreshKey, globalPeriod]);
  const [view, setView] = useRouteTab('customers', tabs, 'overview');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [overlaySize, setOverlaySize] = useState('default');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [sheetExporting, setSheetExporting] = useState(false);
  const [sheetMessage, setSheetMessage] = useState('');
  if (loading) return <Loading title="CRM" />;
  if (error) return <ErrorState title="CRM" error={error} />;
  const customers = data.customers.filter(c => [c.name, c.email, c.phone, c.city, c.type].join(' ').toLowerCase().includes(query.toLowerCase()));
  const pipelineStages = ['New', 'Contacted', 'Proposal', 'Negotiation', 'Won', 'Lost'];
  const crmAnalytics = {
    stageRows: pipelineStages.map(stage => {
      const rows = (data.leads || []).filter(lead => lead.stage === stage || (stage === 'New' && lead.stage === 'Lead'));
      return { stage, opportunities: rows.length, value: rows.reduce((sum, row) => sum + num(row.value), 0) };
    }),
    followUps: (data.calls || []).filter(row => row.followUpDate || ['To Be Called', 'Pending Calls', 'To Be Meeting'].includes(row.stage)).slice(0, 8),
    deliveryRows: (data.deliveries || []).slice(0, 8),
    purchaseRows: (data.orders || []).slice(0, 8)
  };
  const onSaved = () => {
    setModal(null);
    setRefreshKey(x => x + 1);
  };
  async function exportCrmSheet(module = 'CRM', sheetName = 'CRM Customers') {
    setSheetExporting(true);
    setSheetMessage('');
    try {
      const file = await rpc('generateSpreadsheetExport', [user, { module, sheetName }]);
      if (file.google) setSheetMessage(`${sheetName} synced to Google Sheets: ${file.rows} rows.`);
      else {
        downloadBase64File(file);
        setSheetMessage(`${sheetName} CSV downloaded: ${file.rows} rows.`);
      }
    } catch (err) {
      setSheetMessage(err?.message || 'CRM spreadsheet export failed.');
    } finally {
      setSheetExporting(false);
    }
  }
  return (
    <section className="page-stack crm-workspace">
      <div className="sales-hero crm-hero">
        <div>
          <span>Customer Relationship Command Center</span>
          <h1>CRM - Vision Geral</h1>
          <p>Manage customers, leads, opportunities, calls, follow-ups, activities, reports, and customer intelligence in one connected workspace.</p>
        </div>
        <div className="sales-hero-stats">
          <strong>{data.overview.totalCustomers}</strong><span>Customers</span>
          <strong>{data.overview.opportunities}</strong><span>Opportunities</span>
          <strong>—</strong><span>Pipeline</span>
        </div>
      </div>

      <div className="inline-actions">
        <button onClick={() => setModal('customer')}><Plus size={16} /> New Customer</button>
        <button onClick={() => setModal('lead')}><Target size={16} /> New Opportunity</button>
        <button onClick={() => setModal('call')}><Bell size={16} /> Log Call</button>
        <button onClick={() => setView('reports')}><FileText size={16} /> CRM Reports</button>
        <button className="crm-sheet-action" onClick={() => exportCrmSheet('CRM', 'CRM Customers')} disabled={sheetExporting}><Upload size={16} /> {sheetExporting ? 'Syncing...' : 'CRM Sheets'}</button>
        <button className="crm-sheet-action" onClick={() => exportCrmSheet('Calls', 'CRM Calls')} disabled={sheetExporting}><Phone size={16} /> Calls Sheet</button>
        <a className="crm-sheet-link" href="https://docs.google.com/spreadsheets/d/1ZGX71pFHkJPNA17s5LRCFT_T58eskby9zpj8RPHveYA/edit?gid=976100262#gid=976100262" target="_blank" rel="noopener noreferrer"><FileText size={16} /> Open Sheet</a>
        <CreateRequisitionButton user={user} module="customers" />
      </div>
      {sheetMessage && <div className={`crm-sheet-message ${sheetMessage.toLowerCase().includes('failed') || sheetMessage.toLowerCase().includes('error') ? 'warn' : ''}`}>{sheetMessage}</div>}

      <div className="sales-tabs">
        {tabs.map(tab => <button key={tab} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}>{label(tab)}</button>)}
      </div>

      {view === 'overview' && (
        <>
          <div className="control-grid">
            <KpiCard icon={Users} label="Active Customers" value={data.overview.activeCustomers} change={12.5} tone="green" />
            <KpiCard icon={Target} label="Opportunities" value={data.overview.opportunities} change={8.2} tone="blue" />
            <KpiCard icon={CheckCircle2} label="Won Deals" value={data.overview.wonDeals} change={15.3} tone="green" />
            <KpiCard icon={CircleDollarSign} label="Pipeline Value" value="—" change={18.7} tone="green" />
            <KpiCard icon={LineChart} label="CRM Revenue" value="—" change={22.4} tone="blue" />
            <KpiCard icon={Calendar} label="Follow-ups" value={data.overview.pendingFollowups} change={-4.2} tone="red" />
          </div>
          <div className="dashboard-grid">
            <Panel className="span-4" title="Sales Funnel" action="This Month">
              <div className="crm-funnel">
                {data.funnel.map((stage, index) => <div key={stage.stage} style={{ '--w': `${100 - index * 11}%` }}><span>{stage.stage}</span><strong>{stage.count}</strong><em>—</em></div>)}
              </div>
            </Panel>
            <Panel className="span-4" title="Recent Activities"><CRMActivityList activities={data.activities} setPage={setPage} /></Panel>
            <Panel className="span-4" title="Latest Calls"><CRMCallsListV2 user={user} calls={data.calls.slice(0, 5)} onUpdated={() => setRefreshKey(x => x + 1)} compact /></Panel>
            <Panel className="span-7 sales-main-chart" title="Customer Growth + Revenue">
              <SalesTrendChart data={data.monthly} metric="revenue" />
            </Panel>
            <Panel className="span-5" title="Top Customers"><CRMTopCustomers rows={data.topCustomers} /></Panel>
            <Panel className="span-6" title="Recent Customer Purchases" action={`${data.orders?.length || 0} orders`}>
              <SimpleTable rows={(data.orders || []).slice(0, 8)} columns={['saleNo', 'customerName', 'total', 'paid', 'balance', 'deliveryStatus']} />
            </Panel>
            <Panel className="span-6" title="Delivery Confirmations" action={`${data.deliveries?.length || 0} deliveries`}>
              <CRMDeliveryPreview user={user} rows={(data.deliveries || []).slice(0, 6)} onUpdated={() => setRefreshKey(x => x + 1)} compact />
            </Panel>
          </div>
          <CRMCustomersGrid customers={customers} query={query} setQuery={setQuery} title="Customers and Accounts" onNew={() => setModal('customer')} onSelect={setSelectedCustomer} pageSize={6} />
        </>
      )}

      {view === 'pipeline' && <CRMPipelineBoard leads={data.leads} stages={pipelineStages} onMoveLead={async (id, stage) => { try { await rpc('saveLead', [user, { id, stage }]); setRefreshKey(x => x + 1); } catch (err) { alert(err.message); } }} />}
      {view === 'customers' && <CRMCustomersGrid customers={customers} query={query} setQuery={setQuery} onNew={() => setModal('customer')} onSelect={setSelectedCustomer} pageSize={10} />}
      {view === 'leads' && <Panel title="Leads and Opportunities" action="Live"><SimpleTable rows={data.leads} columns={['name', 'company', 'phone', 'stage', 'assignedTo', 'status']} /></Panel>}
      {view === 'calls' && <CRMCallsListV2 user={user} calls={data.calls} onUpdated={() => setRefreshKey(x => x + 1)} onStageChange={async (id, stage) => { try { await rpc('saveCall', [user, { id, stage }]); setRefreshKey(x => x + 1); } catch (err) { alert(err.message); } }} />}
      {view === 'activities' && <Panel title="Activity Timeline"><CRMActivityList activities={data.activities} /></Panel>}
      {view === 'reports' && <CRMReportsCenter user={user} data={data} globalPeriod={globalPeriod} onUpdated={() => setRefreshKey(x => x + 1)} />}
      {view === 'analytics' && (
        <div className="dashboard-grid">
          <Panel className="span-6" title="Customer Growth" action={globalPeriod}><SalesTrendChart data={data.monthly} metric="customers" /></Panel>
          <Panel className="span-6" title="Opportunity Value" action={globalPeriod}><SalesTrendChart data={data.monthly} metric="opportunities" /></Panel>
          <Panel className="span-4" title="Pipeline Stage Health"><SimpleTable rows={crmAnalytics.stageRows} columns={['stage', 'opportunities']} /></Panel>
          <Panel className="span-4" title="Follow-up Pressure"><SimpleTable rows={crmAnalytics.followUps} columns={['customerName', 'phone', 'stage', 'followUpDate', 'assignedTo']} /></Panel>
          <Panel className="span-4" title="Delivery Watch"><SimpleTable rows={crmAnalytics.deliveryRows} columns={['deliveryNo', 'customerName', 'destination', 'status', 'arrival']} /></Panel>
          <Panel className="span-6" title="Customer Profitability"><SimpleTable rows={data.topCustomers} columns={['name', 'city', 'type', 'orders', 'health']} /></Panel>
          <Panel className="span-6" title="Recent Purchase Signals"><SimpleTable rows={crmAnalytics.purchaseRows} columns={['saleNo', 'customerName', 'deliveryStatus']} /></Panel>
          <Panel className="span-6" title="Churn Prediction"><div className="metric-stack">
            {(data.customers || []).slice(0, 8).map(c => {
              const daysSinceOrder = Math.min(365, Math.round((Date.now() - new Date(c.lastOrderDate || c.createdAt || Date.now()).getTime()) / 86400000));
              const churnRisk = daysSinceOrder > 90 ? 'High' : daysSinceOrder > 45 ? 'Medium' : 'Low';
              const riskColor = churnRisk === 'High' ? '#d92d20' : churnRisk === 'Medium' ? '#f79009' : '#12b76a';
              return <div key={c.id}><span>{c.name}</span><strong style={{ color: riskColor }}>{churnRisk}</strong><em>{daysSinceOrder}d since order</em></div>;
            })}
          </div></Panel>
          <Panel className="span-6" title="Customer Lifetime Value (CLV)"><div className="metric-stack">
            {(data.customers || []).filter(c => num(c.balance) > 0 || num(c.creditLimit) > 0).slice(0, 8).map(c => {
              const clv = num(c.creditLimit) * 0.4 + num(c.balance) * 2;
              return <div key={c.id}><span>{c.name}</span><strong>{currency(clv)}</strong><em>{c.type} · credit {currency(num(c.creditLimit))}</em></div>;
            })}
          </div></Panel>
        </div>
      )}
      {modal && <CRMInputModal user={user} type={modal.type || modal} customers={data.customers} preset={modal.preset} onClose={() => setModal(null)} onSaved={onSaved} />}
      {selectedCustomer && <CRMCustomerDetail customer={selectedCustomer} orders={data.orders || []} calls={data.calls || []} deliveries={data.deliveries || []} onClose={() => setSelectedCustomer(null)} overlaySize={overlaySize} setOverlaySize={setOverlaySize} onLogCall={(c) => setModal({ type: 'call', preset: c })} onEmailCustomer={(c) => { const to = prompt(`Send email to ${c.name}:`, c.email || ''); if (to) window.location.href = `mailto:${to}?subject=Following up on your account`; }} />}
    </section>
  );
}

function CRMPipelineBoard({ leads, stages, onMoveLead }) {
  const [localLeads, setLocalLeads] = useState(leads || []);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  useEffect(() => setLocalLeads(leads || []), [leads]);
  const handleDrop = async (stage) => {
    const id = dragId;
    if (id && onMoveLead) {
      const previous = localLeads;
      setLocalLeads(rows => rows.map(lead => lead.id === id ? { ...lead, stage } : lead));
      try {
        await onMoveLead(id, stage);
      } catch {
        setLocalLeads(previous);
      }
    }
    setDragId(null);
    setDragOver(null);
  };
  return (
    <div className="crm-kanban">
      {stages.map(stage => {
        const rows = localLeads
          .filter(lead => lead.stage === stage || (stage === 'New' && lead.stage === 'Lead'))
          .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
        return (
          <section
            key={stage}
            className={dragOver === stage ? 'drop-active' : ''}
            onDragOver={e => { e.preventDefault(); setDragOver(stage); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => handleDrop(stage)}
          >
            <header><strong>{stage}</strong><span>{rows.length}</span></header>
            {rows.map(lead => (
              <article
                key={lead.id}
                className={stage === 'Lost' ? 'lost' : stage === 'Won' ? 'won' : ''}
                draggable
                onDragStart={() => setDragId(lead.id)}
                onDragEnd={() => { setDragId(null); setDragOver(null); }}
              >
                <div className="drag-handle">⠿</div>
                <strong>{lead.name}</strong>
                <span>{lead.company || lead.email || 'Opportunity'}</span>
                <em>{lead.phone}</em>
                <b>—</b>
                <small>{lead.assignedTo || 'Unassigned'} · {lead.status || 'Active'}</small>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function CRMCallsList({ calls, onStageChange }) {
  const stageClass = s => s === 'Already Called' ? 'status active' : s === 'To Be Called' || s === 'Pending Calls' ? 'status pending' : 'status partial';
  return (
    <Panel className="span-12" title="Call Records" action={`${calls.length} calls`}>
      <div className="table-wrap">
        <table className="crm-calls-table">
          <thead><tr><th>Customer</th><th>Phone</th><th>Stage</th><th>Notes</th><th>Assigned To</th><th>Quick Actions</th><th>Update Stage</th></tr></thead>
          <tbody>
            {calls.length === 0 && <tr><td colSpan={7}><div className="empty-state">No call records. Click "Log Call" to add one.</div></td></tr>}
            {calls.map(c => (
              <tr key={c.id}>
                <td><strong>{c.customerName}</strong></td>
                <td>{c.phone || '—'}</td>
                <td><span className={stageClass(c.stage)}>{c.stage || '—'}</span></td>
                <td className="call-notes">{c.notes || '—'}</td>
                <td>{c.assignedTo || '—'}</td>
                <td>
                  <div className="call-quick-actions">
                    {c.phone && <a href={`tel:${c.phone}`} className="call-btn" title="Call now"><Phone size={14} /></a>}
                    {c.phone && <a href={`https://wa.me/${String(c.phone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="call-btn whatsapp" title="WhatsApp"><MessageSquare size={14} /></a>}
                  </div>
                </td>
                <td>
                  <select value={c.stage} onChange={e => onStageChange(c.id, e.target.value)} className="call-stage-select">
                    {['To Be Called', 'Pending Calls', 'Already Called', 'To Be Meeting'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function CRMCallsListV2({ user, calls = [], onStageChange, onUpdated, compact = false }) {
  const [limit, setLimit] = useState(compact ? 5 : 25);
  const shown = compact ? calls.slice(0, limit) : calls;
  const stageClass = s => s === 'Already Called' ? 'status active' : s === 'To Be Called' || s === 'Pending Calls' ? 'status pending' : 'status partial';
  async function updateCall(row, patch) {
    try {
      await rpc('saveCall', [user, { id: row.id, ...patch }]);
      onUpdated?.();
    } catch (err) {
      alert(err.message || 'Could not update call');
    }
  }
  function addComment(row) {
    const value = window.prompt('Call comment / feedback', row.comments || row.feedback || row.notes || '');
    if (value === null) return;
    updateCall(row, { comments: value, notes: row.notes || value });
  }
  function addFollowUp(row) {
    const value = window.prompt('Follow-up date (YYYY-MM-DD)', row.followUpDate || new Date().toISOString().slice(0, 10));
    if (value === null) return;
    updateCall(row, { followUpDate: value, stage: row.stage === 'Already Called' ? 'Pending Calls' : row.stage });
  }
  return (
    <Panel className="span-12" title={compact ? 'Latest Calls' : 'Call Records'} action={`${calls.length} calls`}>
      <div className="table-wrap">
        <table className="crm-calls-table">
          <thead><tr><th>Date</th><th>Customer</th><th>Phone</th><th>Stage</th><th>Notes / Comments</th><th>Follow-up</th><th>Assigned To</th><th>Quick Actions</th><th>Update Stage</th></tr></thead>
          <tbody>
            {calls.length === 0 && <tr><td colSpan={9}><div className="empty-state">No call records. Click "Log Call" to add one.</div></td></tr>}
            {shown.map(c => (
              <tr key={c.id}>
                <td>{dateValue(c)}</td>
                <td><strong>{c.customerName}</strong></td>
                <td>{c.phone || '-'}</td>
                <td><span className={stageClass(c.stage)}>{c.stage || '-'}</span></td>
                <td className="call-notes">{c.comments || c.feedback || c.notes || '-'}</td>
                <td>{c.followUpDate || '-'}</td>
                <td>{c.assignedTo || '-'}</td>
                <td>
                  <div className="call-quick-actions">
                    {c.phone && <a href={`tel:${c.phone}`} className="call-btn" title="Call now"><Phone size={14} /></a>}
                    {c.phone && <a href={`https://wa.me/${String(c.phone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="call-btn whatsapp" title="WhatsApp"><MessageSquare size={14} /></a>}
                    {!compact && <button className="call-btn" type="button" title="Add comment" onClick={() => addComment(c)}><FileText size={14} /></button>}
                    {!compact && <button className="call-btn" type="button" title="Set follow-up" onClick={() => addFollowUp(c)}><CalendarClock size={14} /></button>}
                  </div>
                </td>
                <td>
                  <select value={c.stage} onChange={e => onStageChange ? onStageChange(c.id, e.target.value) : updateCall(c, { stage: e.target.value })} className="call-stage-select">
                    {['To Be Called', 'Pending Calls', 'Already Called', 'To Be Meeting'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!compact && calls.length > 25 && <div className="crm-load-more"><span>Scroll table to review all {calls.length} calls</span></div>}
    </Panel>
  );
}

function CRMCustomersGrid({ customers, query, setQuery, title = 'Customer Directory', onNew, onSelect, pageSize = 10 }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(customers.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const shown = customers.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  useEffect(() => setPage(0), [query, pageSize]);
  return (
    <Panel title={title} action={`${customers.length} records`}>
      <div className="crm-directory-toolbar">
        <div className="crm-search"><Search size={16} /><input placeholder="Search customers, phone, county, type..." value={query} onChange={e => setQuery(e.target.value)} /></div>
        <div className="crm-directory-actions">
          {onNew && <button type="button" onClick={onNew}><Plus size={15} /> Add Customer</button>}
          <button type="button" onClick={() => downloadRowsFile('crm-customers', customers, 'CSV')}><Download size={15} /> CSV</button>
          <button type="button" onClick={() => downloadRowsFile('crm-customers', customers, 'JSON')}><FileText size={15} /> JSON</button>
        </div>
      </div>
      <div className="crm-card-grid">
        {customers.length === 0 && <div className="empty-state">No customers match the current search. Add a customer or clear the filter.</div>}
        {shown.map(customer => (
          <article key={customer.id} className={customer.health === 'VIP' ? 'vip' : customer.health === 'Prospect' ? 'prospect' : ''} onClick={() => onSelect?.(customer)} role="button" tabIndex={0}>
            <span>{dateValue(customer)}</span>
            <strong>{customer.name}</strong>
            <em>{customer.type} · {customer.city || 'No county'}</em>
            <small>{customer.phone} · {customer.email}</small>
            <div><b>—</b><i>{customer.orders} orders</i></div>
            <small>{customer.lastOrderNo ? `Last order ${customer.lastOrderNo}` : 'No purchases yet'} - Balance —</small>
            <mark>{customer.health}</mark>
          </article>
        ))}
      </div>
      {customers.length > pageSize && (
        <div className="crm-pagination">
          <button type="button" disabled={currentPage === 0} onClick={() => setPage(x => Math.max(0, x - 1))}>Previous 10</button>
          <span>Page {currentPage + 1} of {totalPages}</span>
          <button type="button" disabled={currentPage >= totalPages - 1} onClick={() => setPage(x => Math.min(totalPages - 1, x + 1))}>Next 10</button>
        </div>
      )}
    </Panel>
  );
}

function CRMCustomerDetail({ customer, orders = [], calls = [], deliveries = [], onClose, overlaySize = 'default', setOverlaySize, onLogCall, onEmailCustomer }) {
  const customerOrders = orders.filter(row => row.customerId === customer.id || row.customerName === customer.name).slice(0, 10);
  const customerCalls = calls.filter(row => row.customerId === customer.id || row.customerName === customer.name).slice(0, 10);
  const customerDeliveries = deliveries.filter(row => row.customerId === customer.id || row.name === customer.name || row.customerName === customer.name).slice(0, 10);
  const sizeClass = overlaySize === 'wide-50' ? 'wide-50' : overlaySize === 'wide-full' ? 'wide-full' : '';
  const timeline = [
    ...customerOrders.map(o => ({ type: 'Order', date: o.date || o.createdAt, title: o.saleNo, detail: `${currency(o.total)} · ${o.deliveryStatus || o.status || ''}`, icon: ShoppingCart, color: '#2563eb' })),
    ...customerCalls.map(c => ({ type: 'Call', date: c.date || c.createdAt, title: c.stage, detail: c.notes || c.comments || '', icon: Phone, color: '#22c55e' })),
    ...customerDeliveries.map(d => ({ type: 'Delivery', date: d.date || d.createdAt, title: d.deliveryNo, detail: `${d.destination || ''} · ${d.status || ''}`, icon: Truck, color: '#f79009' }))
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 25);
  return (
    <div className="retractable-overlay" onClick={onClose}>
      <div className={`modal-card crm-customer-detail ${sizeClass}`} onClick={e => e.stopPropagation()}>
        <div className="overlay-resize-handle">
          <button className={overlaySize === 'default' ? 'active' : ''} onClick={() => setOverlaySize('default')} title="Default">1x</button>
          <button className={overlaySize === 'wide-50' ? 'active' : ''} onClick={() => setOverlaySize('wide-50')} title="50% wider">2x</button>
          <button className={overlaySize === 'wide-full' ? 'active' : ''} onClick={() => setOverlaySize('wide-full')} title="Full width">3x</button>
        </div>
        <header><h2>{customer.name}</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="crm-customer-actions">
          <button className="primary-action" onClick={() => onLogCall?.(customer)}><Phone size={14} /> Log Call</button>
          <button className="secondary-action" onClick={() => onEmailCustomer?.(customer)}><Mail size={14} /> Send Email</button>
          <a className="secondary-action" href={`https://wa.me/${String(customer.phone || '').replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"><MessageSquare size={14} /> WhatsApp</a>
        </div>
        <div className="settings-kv-grid">
          <article><span>Phone</span><strong>{customer.phone || '-'}</strong></article>
          <article><span>Email</span><strong>{customer.email || '-'}</strong></article>
          <article><span>Location</span><strong>{customer.city || '-'}</strong></article>
          <article><span>Balance</span><strong>{currency(customer.balance)}</strong></article>
          <article><span>Revenue</span><strong>{currency(customer.revenue)}</strong></article>
          <article><span>Health</span><strong>{customer.health || customer.status}</strong></article>
        </div>
        <div className="dashboard-grid">
          <Panel className="span-12" title="Communication Timeline" action={`${timeline.length} activities`}>
            <div className="crm-timeline">
              {timeline.length === 0 && <div className="empty-state">No communications yet. Log a call or create an order to start the timeline.</div>}
              {timeline.map((t, i) => (
                <div key={i} className="crm-timeline-item">
                  <span className="crm-timeline-dot" style={{ background: t.color }}><t.icon size={14} /></span>
                  <div className="crm-timeline-body">
                    <div className="crm-timeline-head"><strong>{t.title}</strong><span className="crm-timeline-type" style={{ color: t.color }}>{t.type}</span></div>
                    <div className="crm-timeline-detail">{t.detail}</div>
                    <div className="crm-timeline-date">{String(t.date || '').slice(0, 10)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel className="span-12" title="Purchase Records"><SimpleTable rows={customerOrders} columns={['saleNo', 'date', 'total', 'paid', 'balance', 'deliveryStatus']} /></Panel>
          <Panel className="span-12" title="Call + Follow-up Records"><SimpleTable rows={customerCalls} columns={['date', 'stage', 'notes', 'comments', 'followUpDate', 'assignedTo']} /></Panel>
          <Panel className="span-12" title="Delivery Records"><SimpleTable rows={customerDeliveries} columns={['deliveryNo', 'date', 'destination', 'method', 'driver', 'status', 'arrival']} /></Panel>
        </div>
      </div>
    </div>
  );
}

function CRMActivityList({ activities, setPage }) {
  const activityIcon = (item) => {
    const t = (item.type || '').toLowerCase();
    const title = (item.title || '').toLowerCase();
    if (t === 'call' || title.includes('call')) return 'call';
    if (t === 'sale' || title.includes('sale') || title.includes('order')) return 'sale';
    if (t === 'invoice' || title.includes('invoice')) return 'invoice';
    if (t === 'leave' || title.includes('leave')) return 'leave';
    if (t === 'stock' || title.includes('stock') || title.includes('inventory')) return 'stock';
    if (t === 'order' || title.includes('purchase') || title.includes('procurement')) return 'order';
    return 'call';
  };
  const activityLink = (item) => {
    const t = (item.type || '').toLowerCase();
    const title = (item.title || '').toLowerCase();
    if (t === 'call' || t === 'lead') return 'customers';
    if (title.includes('leave') || t === 'leave') return 'leaves';
    if (title.includes('sale') || title.includes('order')) return 'sales';
    if (title.includes('invoice') || title.includes('receivable')) return 'accounts';
    if (title.includes('payment') || title.includes('receipt')) return 'finance';
    if (title.includes('procurement') || title.includes('purchase') || title.includes('po')) return 'purchasing';
    if (title.includes('manufacturing') || title.includes('production') || title.includes('batch')) return 'production';
    if (title.includes('stock') || title.includes('inventory') || title.includes('warehouse') || title.includes('transfer')) return 'inventory';
    if (title.includes('report') || title.includes('analytics')) return 'reports';
    if (title.includes('hr') || title.includes('attendance') || title.includes('employee')) return 'hr';
    return 'customers';
  };
  if (!activities?.length) return <div className="empty-state">No recent activities</div>;
  return (
    <div className="crm-activity-list">
      {activities.map(item => (
        <article key={item.id} className="crm-activity-item" onClick={() => setPage?.(activityLink(item))}>
          <div className={`crm-activity-icon ${activityIcon(item)}`}>
            {item.type === 'Call' ? '📞' : item.type === 'Sale' ? '💰' : item.type === 'Leave' ? '🏖️' : item.type === 'Invoice' ? '📄' : item.type === 'Order' ? '📦' : item.type === 'Stock' ? '📋' : '📌'}
          </div>
          <div className="crm-activity-body">
            <strong>{item.title}</strong>
            <span>{item.owner} · {String(item.time || item.createdAt || '').slice(0, 10)}</span>
          </div>
          <ArrowRight size={14} className="crm-activity-arrow" />
        </article>
      ))}
    </div>
  );
}

function CRMReportsCenter({ user, data, globalPeriod = 'Month', onUpdated }) {
  const [active, setActive] = useState('delivery');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [filters, setFilters] = useState(() => ({ ...periodToReportDates(globalPeriod), module: 'Customer' }));
  useEffect(() => {
    setFilters(prev => ({ ...prev, ...periodToReportDates(globalPeriod), module: prev.module || 'Customer' }));
  }, [globalPeriod]);
  const reportSets = useMemo(() => {
    const calls = (data.calls || []).map(row => ({
      date: dateValue(row),
      name: row.customerName || row.caller || row.name || 'Customer call',
      phone: row.phone || '',
      detail: row.reason || row.notes || row.outcome || 'CRM call',
      status: row.stage || row.status || 'Logged',
      value: num(row.value)
    }));
    const activities = (data.activities || []).map(row => ({
      date: dateValue(row),
      name: row.title || row.customerName || row.type || 'CRM activity',
      phone: row.phone || '',
      detail: row.message || row.description || row.type || 'Activity',
      status: row.status || row.priority || 'Active',
      value: num(row.value)
    }));
    const customers = (data.customers || []).map(row => ({
      date: dateValue(row),
      name: row.name,
      phone: row.phone,
      detail: `${row.city || 'No location'} / ${row.type || 'Customer'}`,
      status: row.status || row.health || 'Active',
      value: num(row.revenue || row.balance || row.creditLimit)
    }));
    const leads = (data.leads || []).map(row => ({
      date: dateValue(row),
      name: row.name || row.company,
      phone: row.phone,
      detail: row.company || row.assignedTo || 'Opportunity',
      status: row.stage || row.status || 'Open',
      value: num(row.value)
    }));
    const deliveries = (data.deliveries || []).map(row => ({
      ...row,
      date: dateValue(row),
      name: row.name || row.customerName || 'Customer',
      phone: row.phone || '',
      detail: row.detail || `${row.deliveryNo || 'Delivery'} / ${row.destination || 'No destination'} / ${row.method || 'No method'}`,
      status: row.status || 'Pending Delivery',
      value: num(row.value)
    }));
    return {
      delivery: { label: 'Delivery report', module: 'Delivery', reportName: 'Delivery Report', rows: deliveries, icon: Truck, columns: ['date', 'deliveryNo', 'saleNo', 'name', 'destination', 'method', 'driver', 'status', 'arrival', 'value'] },
      calls: { label: 'Reception calls', module: 'Customer', reportName: 'Customer Activity Report', rows: calls, icon: Phone, columns: ['date', 'name', 'phone', 'detail', 'status', 'value'] },
      followup: { label: 'Follow-up log', module: 'Customer', reportName: 'Customer Report', rows: leads.concat(customers.filter(row => row.status !== 'Active')), icon: RefreshCw, columns: ['date', 'name', 'phone', 'detail', 'status', 'value'] },
      customers: { label: 'Customer ledger', module: 'Customer', reportName: 'Customer Report', rows: customers, icon: Users, columns: ['date', 'name', 'phone', 'detail', 'status', 'value'] }
    };
  }, [data]);
  const activeSet = reportSets[active] || reportSets.customers;
  const reportFilters = { ...filters, module: activeSet.module, reportName: activeSet.reportName };
  const statuses = Array.from(new Set(activeSet.rows.map(row => row.status).filter(Boolean)));
  const filteredRows = activeSet.rows.filter(row => {
    const haystack = `${row.name} ${row.phone} ${row.detail} ${row.status}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const matchesStatus = status === 'all' || row.status === status;
    return matchesQuery && matchesStatus && (!filters.startDate || row.date >= filters.startDate) && (!filters.endDate || row.date <= filters.endDate);
  });
  const totalValue = filteredRows.reduce((sum, row) => sum + num(row.value), 0);
  const statusBreakdown = statuses.map(item => ({ name: item, count: filteredRows.filter(row => row.status === item).length })).filter(row => row.count);
  const chartRows = statusBreakdown.length ? statusBreakdown.map(row => ({ label: row.name, value: row.count })) : [{ label: 'Records', value: filteredRows.length }];
  async function exportCrmReport(format) {
    const file = await rpc('generateReportExport', [user, {
      ...reportFilters,
      crmReportType: activeSet.label,
      query: query.trim(),
      status,
      rows: filteredRows,
      columns: activeSet.columns || ['date', 'name', 'phone', 'detail', 'status', 'value']
    }, format]);
    handleGeneratedFile(file, format);
  }
  return (
    <div className="crm-report-center">
      <div className="crm-report-heading">
        <div>
          <span>Farmtrack CRM report suite</span>
          <h2>CRM Reports</h2>
          <p>Delivery, reception calls, follow-up logs, customer records, and export packages from ERP data for {filters.startDate} to {filters.endDate}.</p>
        </div>
        <div className="crm-report-heading-actions">
          <ExportButton format="Excel" onClick={() => exportCrmReport('Excel')} primary>Excel</ExportButton>
          <ExportButton format="PDF" onClick={() => exportCrmReport('PDF')}>PDF</ExportButton>
          <ExportButton format="CSV" onClick={() => exportCrmReport('CSV')}>CSV</ExportButton>
        </div>
      </div>
      <div className="crm-report-tabs">
        {Object.entries(reportSets).map(([id, set]) => {
          const Icon = set.icon;
          return <button key={id} className={active === id ? 'active' : ''} onClick={() => { setActive(id); setStatus('all'); }}><Icon size={16} />{set.label}</button>;
        })}
      </div>
      <div className="crm-report-kpis">
        <article><span>Records</span><strong>{filteredRows.length.toLocaleString()}</strong></article>
        <article><span>Value</span><strong>{currency(totalValue)}</strong></article>
        <article><span>Statuses</span><strong>{statusBreakdown.length || statuses.length}</strong></article>
        <article><span>Period</span><strong>{globalPeriod}</strong></article>
      </div>
      <div className="crm-report-toolbar">
        <div className="report-search-box"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search customer, phone, notes..." /></div>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <ReportDateControls filters={filters} setFilters={setFilters} />
      </div>
      <div className="dashboard-grid">
        <Panel className="span-5" title="Status Mix" action={`${filteredRows.length} rows`}>
          <div className="crm-mini-bars">
            {chartRows.map((row, index) => (
              <div key={row.label}>
                <span>{row.label}</span>
                <div><em style={{ width: `${Math.max(8, (row.value / Math.max(...chartRows.map(x => x.value), 1)) * 100)}%`, background: ['#101828', '#2563eb', '#f79009', '#d92d20'][index % 4] }} /></div>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="span-7" title={`${activeSet.label} Preview`} action={<ExportFormatStrip formats={['PDF', 'Excel', 'CSV', 'Print']} onExport={exportCrmReport} />}>
          {active === 'delivery'
            ? <CRMDeliveryPreview user={user} rows={filteredRows.slice(0, 12)} onUpdated={onUpdated} />
            : <SimpleTable rows={filteredRows.slice(0, 12)} columns={activeSet.columns || ['date', 'name', 'phone', 'detail', 'status', 'value']} />}
        </Panel>
      </div>
    </div>
  );
}

function CRMDeliveryPreview({ user, rows = [], onUpdated, compact = false }) {
  const [busy, setBusy] = useState('');
  async function update(row, patch) {
    const deliveryId = row.deliveryId || row.id;
    if (!deliveryId) return;
    setBusy(`${deliveryId}-${Object.keys(patch).join('-')}`);
    try {
      await rpc('updateDeliveryDetails', [user, deliveryId, patch]);
      onUpdated?.();
    } catch (error) {
      alert(error.message || 'Could not update delivery');
    } finally {
      setBusy('');
    }
  }
  function promptUpdate(row, key, title, fallback = '') {
    const value = window.prompt(title, row[key] || fallback);
    if (value === null) return;
    update(row, { [key]: value });
  }
  function actionsFor(row) {
    const deliveryId = row.deliveryId || row.id;
    const disabled = busy.startsWith(deliveryId);
    return [
      { label: 'Set Destination', icon: <MapPin size={15} />, disabled, onClick: () => promptUpdate(row, 'destination', 'Delivery destination') },
      { label: 'Set Method', icon: <Truck size={15} />, disabled, onClick: () => promptUpdate(row, 'deliveryMethod', 'Delivery method', row.method) },
      { label: 'Add Notes', icon: <FileText size={15} />, disabled, onClick: () => promptUpdate(row, 'notes', 'Delivery notes') },
      { label: 'Mark Arrived', icon: <Navigation size={15} />, disabled, onClick: () => update(row, { arrivalConfirmed: true }) },
      { label: 'Final Confirm', icon: <CheckCircle2 size={15} />, disabled, onClick: () => update(row, { deliveredConfirmed: true }) },
      { label: 'Copy Delivery', icon: <Download size={15} />, onClick: () => copyText(rowSummary(row)) },
      { label: 'Print Note', icon: <Printer size={15} />, onClick: () => printText(row.deliveryNo || 'Delivery note', rowSummary(row)) }
    ];
  }
  return (
    <div className="table-wrap crm-delivery-preview">
      <table>
        <thead>
          <tr>
            <th>Delivery</th><th>Customer</th><th>Destination</th><th>Method</th><th>Status</th>{!compact && <th>Notes</th>}<th />
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.deliveryId || row.id}>
              <td><strong>{row.deliveryNo || '-'}</strong><small>{row.saleNo || ''}</small></td>
              <td><strong>{row.name || row.customerName}</strong><small>{row.phone || ''}</small></td>
              <td>{row.destination || 'Not set'}</td>
              <td>{row.method || row.deliveryMethod || 'Not set'}<small>{row.driver || ''} {row.vehicle || ''}</small></td>
              <td>{formatCell(row.status, 'status')}<small>{row.arrival || (row.confirmed ? 'Arrived' : 'Waiting')}</small></td>
              {!compact && <td>{row.notes || '-'}</td>}
              <td><ActionMenu actions={actionsFor(row)} /></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={compact ? 6 : 7}><div className="empty-state">No delivery records match this report.</div></td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function CRMCallList({ calls }) {
  return <div className="crm-call-list">{calls.map(call => <article key={call.id}><strong>{call.customerName}</strong><span>{call.stage}</span><em>{call.phone}</em></article>)}</div>;
}

function CRMTopCustomers({ rows }) {
  return <div className="crm-top-list">{rows.map(row => <article key={row.id}><strong>{row.name}</strong><span>{row.city} · {row.health}</span><b>{currency(row.revenue)}</b></article>)}</div>;
}

function CRMInputModal({ user, type, customers, onClose, onSaved, preset }) {
  const defaults = {
    customer: { name: '', email: '', phone: '', city: '', type: 'Farm', creditLimit: 0 },
    lead: { name: '', email: '', phone: '', company: '', source: 'Website', stage: 'New', value: 0, assignedTo: 'Mary Sales', notes: '', status: 'Active' },
    call: { customerId: '', customerName: '', phone: '', whatsapp: '', stage: 'To Be Called', notes: '', comments: '', followUpDate: '', assignedTo: 'Mary Sales' }
  };
  const fields = {
    customer: ['name', 'email', 'phone', 'city', 'type', 'creditLimit'],
    lead: ['name', 'email', 'phone', 'company', 'source', 'stage', 'value', 'assignedTo', 'notes', 'status'],
    call: ['customerId', 'customerName', 'phone', 'whatsapp', 'stage', 'notes', 'comments', 'followUpDate', 'assignedTo']
  };
  const [form, setForm] = useState(() => {
    if (preset && type === 'call') return { ...defaults.call, customerId: preset.id || '', customerName: preset.name || '', phone: preset.phone || '', whatsapp: preset.phone || '' };
    if (preset && type === 'customer') return { ...defaults.customer, name: preset.name || '', email: preset.email || '', phone: preset.phone || '', city: preset.city || '', type: preset.type || 'Farm' };
    return defaults[type];
  });
  const [externalText, setExternalText] = useState('');
  const [saving, setSaving] = useState(false);
  const searchText = String(type === 'call' ? `${form.customerName || ''} ${form.phone || ''} ${form.whatsapp || ''}` : `${form.name || ''} ${form.phone || ''} ${form.email || ''}`).toLowerCase().trim();
  const matches = searchText.length < 3 ? [] : (customers || []).filter(customer => (
    `${customer.name || ''} ${customer.phone || ''} ${customer.email || ''} ${customer.city || ''}`.toLowerCase().includes(searchText)
  )).slice(0, 5);
  const chooseCustomer = customer => {
    if (type === 'call') {
      setForm(prev => ({ ...prev, customerId: customer.id, customerName: customer.name || '', phone: customer.phone || prev.phone || '', whatsapp: customer.phone || prev.whatsapp || '' }));
    } else {
      setForm(prev => ({ ...prev, name: customer.name || prev.name || '', phone: customer.phone || prev.phone || '', email: customer.email || prev.email || '', city: customer.city || prev.city || '', type: customer.type || prev.type || 'Farm' }));
    }
  };
  const fillFromExternal = () => {
    const parsed = parseExternalRecord(externalText);
    const patch = type === 'call'
      ? {
          customerName: parsed.customerName || parsed.name || parsed.customer || form.customerName,
          phone: parsed.phone || parsed.mobile || form.phone,
          whatsapp: parsed.whatsapp || parsed.phone || form.whatsapp,
          notes: parsed.notes || parsed.detail || form.notes,
          comments: parsed.comments || parsed.feedback || form.comments,
          followUpDate: parsed.followUpDate || form.followUpDate
        }
      : parsed;
    setForm(prev => ({ ...prev, ...patch }));
  };
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (type === 'call') {
        let customer = customers.find(c => c.id === payload.customerId);
        if (!customer && payload.customerName && (payload.phone || payload.whatsapp)) {
          const created = await rpc('saveCustomer', [user, { name: payload.customerName, phone: payload.phone || payload.whatsapp, email: '', city: '', type: 'Call Lead', status: 'Active', balance: 0 }]);
          customer = { id: created.id || created.row?.id, name: payload.customerName, phone: payload.phone || payload.whatsapp };
        }
        payload.customerId = customer?.id || payload.customerId || '';
        payload.customerName = customer?.name || payload.customerName;
        payload.phone = payload.phone || customer?.phone || '';
      }
      await rpc(type === 'customer' ? 'saveCustomer' : type === 'lead' ? 'saveLead' : 'saveCall', [user, payload]);
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card input-overlay-card crm-input-modal african-pattern-modal" onSubmit={save}>
        <header>
          <div>
            <h2>{type === 'customer' ? 'New Customer' : type === 'lead' ? 'New Opportunity' : 'Log Call'}</h2>
            <p>{type === 'call' ? 'Start blank, search an existing customer, or paste outside data to fill the record.' : 'Create a clean CRM record and link future calls, sales, delivery, and accounts data.'}</p>
          </div>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="external-import-box">
          <label>Import external data into this form
            <textarea value={externalText} onChange={e => setExternalText(e.target.value)} placeholder="Paste JSON, CSV, or: Name, Phone, Email, County" />
          </label>
          <button type="button" onClick={fillFromExternal} disabled={!externalText.trim()}><Upload size={15} /> Fill Form</button>
        </div>
        {matches.length > 0 && (
          <div className="crm-match-strip">
            <span>Possible existing records</span>
            {matches.map(customer => (
              <button key={customer.id} type="button" onClick={() => chooseCustomer(customer)}>
                <strong>{customer.name}</strong>
                <small>{customer.phone || customer.email || customer.city || 'Customer record'}</small>
              </button>
            ))}
          </div>
        )}
        <div className="input-form-grid quick-input-form">
          {fields[type].map(field => (
            <label key={field}>{label(field)}
              {field === 'customerId' ? (
                <select value={form.customerId} onChange={e => { const customer = customers.find(c => c.id === e.target.value); setForm({ ...form, customerId: e.target.value, customerName: customer?.name || '', phone: customer?.phone || form.phone, whatsapp: customer?.phone || form.whatsapp }); }}><option value="">New / walk-in caller</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              ) : field === 'stage' ? (
                <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}>{['New', 'Contacted', 'Proposal', 'Negotiation', 'Won', 'Lost', 'To Be Called', 'To Be Meeting', 'Pending Calls', 'Already Called'].map(x => <option key={x}>{x}</option>)}</select>
              ) : ['notes', 'comments'].includes(field) ? (
                <textarea value={form[field] || ''} onChange={e => setForm({ ...form, [field]: e.target.value })} />
              ) : (
                <input type={inputKind(field)} value={form[field] || ''} onChange={e => setForm({ ...form, [field]: e.target.value })} required={!(type === 'call' && field === 'customerId') && isRequiredInput(field)} />
              )}
            </label>
          ))}
        </div>
        <button className="primary-action" disabled={saving}>{saving ? 'Saving...' : 'Save CRM Record'}</button>
      </form>
    </div>
  );
}

function InventoryWorkspace({ user, setPage, globalPeriod }) {
  const tabs = ['overview', 'stock', 'warehouses', 'movements', 'adjustments', 'transfers', 'receiving', 'dispatch', 'audits', 'expiry', 'damaged', 'alerts', 'reports', 'analytics', 'forecasting', 'ai'];
  const [refreshKey, setRefreshKey] = useState(0);
  const workspace = useServer(user, 'getInventoryWorkspaceData', [{ period: globalPeriod }], [refreshKey, globalPeriod]);
  const [view, setView] = useRouteTab('inventory', tabs, 'overview');
  const [metric, setMetric] = useState('inventoryValue');
  const [query, setQuery] = useState('');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  if (workspace.loading) return <Loading title="Inventory" />;
  if (workspace.error) return <ErrorState title="Inventory" error={workspace.error} />;

  const data = workspace.data;
  const metrics = ['inventoryValue', 'incomingStock', 'outgoingStock', 'damagedStock', 'expiredStock', 'warehouseStock', 'stockTurnover', 'stockCosts'];
  const filteredSearch = query.length < 2 ? [] : data.searchIndex.filter(row => `${row.type} ${row.label} ${row.sub}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8);

  return (
    <section className="page-stack sales-workspace inventory-workspace">
      <div className="sales-hero inventory-hero">
        <div>
          <span>Inventory Intelligence Platform</span>
          <h1>Inventory Workspace</h1>
          <p>Stock control, warehouse operations, movements, adjustments, transfers, audits, expiry, damaged stock, reports, forecasting, and AI reorder intelligence.</p>
        </div>
        <div className="sales-hero-stats">
          <strong>{data.overview.totalSkus}</strong><span>SKUs</span>
          <strong>{currency(data.overview.totalStockValue)}</strong><span>Stock Value</span>
          <strong>{data.overview.inventoryAccuracy}%</strong><span>Accuracy</span>
        </div>
      </div>

      <div className="inline-actions">
        <button onClick={() => setAdjustOpen(true)}><Plus size={16} /> Stock Adjustment</button>
        <button onClick={() => setTransferOpen(true)}><Route size={16} /> Transfer Stock</button>
        <button onClick={() => setView('alerts')}><AlertTriangle size={16} /> Alert Center</button>
        <CreateRequisitionButton user={user} module="inventory" />
      </div>

      <div className="sales-filter-bar">
        <button><Calendar size={16} />{data.filters.dateRange}</button>
        <button><Warehouse size={16} />{data.filters.warehouse}</button>
        <button><Package size={16} />{data.filters.category}</button>
        <button><CheckCircle2 size={16} />{data.filters.status}</button>
        <button><CircleDollarSign size={16} />{data.filters.valuation}</button>
      </div>

      <div className="procurement-search">
        <Search size={18} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search SKU, product, batch, warehouse, supplier, category, barcode, QR code, status..." />
        {filteredSearch.length > 0 && <div>{filteredSearch.map(row => <span key={`${row.type}-${row.label}-${row.sub}`}><b>{row.type}</b>{row.label}<em>{row.sub}</em></span>)}</div>}
      </div>

      <div className="sales-tabs">
        {tabs.map(tab => <button key={tab} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}>{label(tab)}</button>)}
      </div>

      {view === 'overview' && (
        <>
          <div className="control-grid">
            <KpiCard icon={Package} label="Total SKUs" value={data.overview.totalSkus} change={4.2} tone="blue" />
            <KpiCard icon={CircleDollarSign} label="Stock Value" value={currency(data.overview.totalStockValue)} change={8.8} tone="green" />
            <KpiCard icon={Warehouse} label="Available" value={data.overview.availableStock} change={3.4} tone="green" />
            <KpiCard icon={Boxes} label="Reserved" value={data.overview.reservedStock} change={2.1} tone="blue" />
            <KpiCard icon={AlertTriangle} label="Low Stock" value={data.overview.lowStock} change={-data.overview.lowStock} tone={data.overview.lowStock ? 'red' : 'green'} />
            <KpiCard icon={CheckCircle2} label="Accuracy" value={`${data.overview.inventoryAccuracy}%`} change={2.5} tone="green" />
            <KpiCard icon={Package} label="Quarantined" value={data.stockItems.reduce((s, item) => s + (item.quarantinedQuantity || 0), 0)} change={0} tone="blue" />
            <KpiCard icon={Boxes} label="ABC A Items" value={data.stockItems.filter(i => i.abcClass === 'A').length} change={0} tone="green" />
          </div>
          <div className="dashboard-grid">
            <Panel className="span-12 sales-main-chart" title="Main Inventory Graph" action={label(metric)}>
              <SalesTrendChart data={data.trend} metric={metric} />
            </Panel>
            <Panel className="span-12" title="Switch Inventory Metric">
              <div className="metric-toggle">{metrics.map(x => <button key={x} className={metric === x ? 'active' : ''} onClick={() => setMetric(x)}>{label(x)}</button>)}</div>
            </Panel>
            <Panel className="span-6" title="Low Stock Alert Center"><SimpleTable rows={data.reorderRules.filter(row => row.status === 'Reorder')} columns={['productName', 'currentStock', 'minimumStock', 'reorderPoint', 'recommendedOrderQty', 'preferredSupplier']} /></Panel>
            <Panel className="span-6" title="Slow Moving Intelligence"><SimpleTable rows={data.slowMoving} columns={['productName', 'warehouseName', 'currentQuantity', 'inventoryValue', 'daysSinceLastMovement', 'recommendation']} /></Panel>
          </div>
        </>
      )}

      {view === 'stock' && <Panel title="Inventory Master List" action={`${data.stockItems.length} items`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th><th>Product</th><th>Category</th><th>Warehouse</th>
                <th>Shelf</th><th>Bin</th>
                <th>Available</th><th>Reserved</th><th>Incoming</th><th>Outgoing</th>
                <th>Damaged</th><th>Expired</th><th>Quarantined</th>
                <th>ABC</th><th>Unit Cost</th><th>Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.stockItems.map(item => (
                <tr key={item.id}>
                  <td><strong>{item.sku}</strong></td>
                  <td>{item.productName}</td>
                  <td>{item.category}</td>
                  <td>{item.warehouseName}</td>
                  <td>{item.shelfLocation || '—'}</td>
                  <td>{item.binNumber || '—'}</td>
                  <td>{item.quantityAvailable}</td>
                  <td>{item.quantityReserved}</td>
                  <td>{item.quantityIncoming}</td>
                  <td>{item.quantityOutgoing}</td>
                  <td>{item.damagedQuantity || 0}</td>
                  <td>{item.expiredQuantity || 0}</td>
                  <td>{item.quarantinedQuantity || 0}</td>
                  <td><span className={`status abc-${item.abcClass?.toLowerCase()}`}>{item.abcClass}</span></td>
                  <td>{currency(item.unitCost)}</td>
                  <td>{currency(item.inventoryValue)}</td>
                  <td><span className={item.status === 'Out of Stock' ? 'status cancelled' : item.status === 'Low Stock' ? 'status partial' : 'status active'}>{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>}
      {view === 'warehouses' && <Panel title="Warehouse Management"><SimpleTable rows={data.warehouses} columns={['code', 'name', 'county', 'capacity', 'used', 'utilization', 'stockValue']} /></Panel>}
      {view === 'movements' && <Panel title="Stock Movement Tracking"><SimpleTable rows={data.movements} columns={['productName', 'warehouseName', 'transactionType', 'quantity', 'unitCost', 'referenceType', 'createdBy']} /></Panel>}
      {view === 'adjustments' && <Panel title="Stock Adjustments" action="Authorized"><SimpleTable rows={data.adjustments} columns={['productName', 'warehouseName', 'adjustmentType', 'quantity', 'reason', 'approvedBy', 'date']} /></Panel>}
      {view === 'transfers' && <Panel title="Stock Transfers"><SimpleTable rows={data.transfers} columns={['transferNo', 'productName', 'fromWarehouse', 'toWarehouse', 'quantity', 'status', 'requestedBy']} /></Panel>}
      {view === 'receiving' && <Panel title="Receiving from Procurement"><SimpleTable rows={data.receiving} columns={['grnNo', 'poNo', 'supplierName', 'warehouseName', 'acceptedQuantity', 'status']} /></Panel>}
      {view === 'dispatch' && <Panel title="Dispatch to Sales"><SimpleTable rows={data.dispatch} columns={['deliveryNo', 'saleNo', 'customerName', 'driver', 'vehicle', 'status']} /></Panel>}
      {view === 'audits' && <Panel title="Inventory Audit Intelligence"><SimpleTable rows={data.audits} columns={['auditNo', 'productName', 'warehouseName', 'systemQuantity', 'physicalQuantity', 'difference', 'reason', 'status']} /></Panel>}
      {view === 'expiry' && <Panel title="Expiry Tracking"><SimpleTable rows={data.expiry} columns={['productName', 'batchNo', 'lotNo', 'warehouseName', 'quantity', 'expiryDate', 'daysRemaining', 'status']} /></Panel>}
      {view === 'damaged' && <Panel title="Damaged Stock"><SimpleTable rows={data.damaged} columns={['productName', 'warehouseName', 'quantity', 'reason', 'date', 'reportedBy', 'status']} /></Panel>}
      {view === 'alerts' && <InventoryAlerts data={data} user={user} onDone={() => setRefreshKey(x => x + 1)} />}
      {view === 'reports' && <InventoryReports reports={data.reports} user={user} module="Inventory" />}
      {view === 'analytics' && <InventoryAnalytics data={data} metric={metric} setMetric={setMetric} />}
      {view === 'forecasting' && <Panel title="Inventory Forecasting"><SimpleTable rows={data.forecasts} columns={['productName', 'futureDemand', 'stockoutRisk', 'reorderDate', 'seasonalDemand', 'warehouseCapacity']} /></Panel>}
      {view === 'ai' && <ProcurementAi insights={data.ai} />}

      {adjustOpen && <InventoryAdjustModal user={user} items={data.stockItems} onClose={() => setAdjustOpen(false)} onSaved={() => { setAdjustOpen(false); setRefreshKey(x => x + 1); setView('movements'); }} />}
      {transferOpen && <InventoryTransferModal user={user} items={data.stockItems} warehouses={data.warehouses} onClose={() => setTransferOpen(false)} onSaved={() => { setTransferOpen(false); setRefreshKey(x => x + 1); setView('transfers'); }} />}
    </section>
  );
}

function InventoryAlerts({ data, user, onDone }) {
  const [busy, setBusy] = useState('');
  const [period, setPeriod] = useState('This Month');
  const [warehouse, setWarehouse] = useState('All Warehouses');
  const [category, setCategory] = useState('All Categories');
  const [status, setStatus] = useState('All Statuses');
  const [sortMode, setSortMode] = useState('FIFO');

  const warehouses = ['All Warehouses', ...Array.from(new Set((data.alerts || []).map(a => a.warehouseName).filter(Boolean)))];
  const categories = ['All Categories', ...Array.from(new Set((data.stockItems || []).map(s => s.category).filter(Boolean)))];

  const filtered = (data.alerts || []).filter(a => {
    if (warehouse !== 'All Warehouses' && a.warehouseName !== warehouse) return false;
    if (status !== 'All Statuses' && a.status !== status) return false;
    if (category !== 'All Categories') {
      const item = (data.stockItems || []).find(s => s.productId === a.productId || s.productName === a.productName);
      if (!item || item.category !== category) return false;
    }
    if (period !== 'All Time') {
      const now = new Date();
      const alertDate = new Date(a.createdAt || a.date || now);
      if (period === 'This Month') {
        if (alertDate.getMonth() !== now.getMonth() || alertDate.getFullYear() !== now.getFullYear()) return false;
      } else if (period === 'Last 30 Days') {
        if (now - alertDate > 30 * 86400000) return false;
      } else if (period === 'This Week') {
        if (now - alertDate > 7 * 86400000) return false;
      }
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === 'FIFO') {
      const aDate = new Date(a.createdAt || a.date || 0).getTime();
      const bDate = new Date(b.createdAt || b.date || 0).getTime();
      return aDate - bDate;
    }
    if (sortMode === 'Severity') {
      const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
    }
    if (sortMode === 'Stock Level') {
      return (a.currentStock ?? 0) - (b.currentStock ?? 0);
    }
    return 0;
  });

  async function createPR(alert) {
    const item = data.stockItems.find(row => row.productId === alert.productId);
    if (!item) return;
    setBusy(alert.id);
    try {
      await rpc('createInventoryPurchaseRequest', [user, item.id]);
      onDone?.();
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="dashboard-grid">
      <Panel className="span-8" title="Unified Inventory Alert Center" action={`${sorted.length} alerts`}>
        <div className="inventory-alert-filters">
          <select value={period} onChange={e => setPeriod(e.target.value)}>
            {['This Month', 'This Week', 'Last 30 Days', 'All Time'].map(x => <option key={x}>{x}</option>)}
          </select>
          <select value={warehouse} onChange={e => setWarehouse(e.target.value)}>
            {warehouses.map(x => <option key={x}>{x}</option>)}
          </select>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {categories.map(x => <option key={x}>{x}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            {['All Statuses', 'Active', 'Pending', 'Resolved', 'Acknowledged'].map(x => <option key={x}>{x}</option>)}
          </select>
          <select value={sortMode} onChange={e => setSortMode(e.target.value)}>
            {['FIFO', 'Severity', 'Stock Level'].map(x => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div className="ai-insights">
          {sorted.length === 0 && <div className="empty-state">No alerts match the current filters</div>}
          {sorted.map(alert => (
            <article key={alert.id}>
              <strong>{alert.type}: {alert.productName}</strong>
              <p>{alert.message}</p>
              <span>{alert.warehouseName} - {alert.severity} - {alert.status}</span>
              {['Low Stock', 'Critical Stock'].includes(alert.type) && <button className="mini-action" onClick={() => createPR(alert)} disabled={busy === alert.id}>{busy === alert.id ? 'Creating...' : 'Create Purchase Request'}</button>}
            </article>
          ))}
        </div>
      </Panel>
      <Panel className="span-4" title="Dead Stock Center">
        <SimpleTable rows={data.deadStock} columns={['productName', 'inventoryValue', 'storageCost', 'expiryRisk', 'warehouseSpaceUsed']} />
      </Panel>
    </div>
  );
}

function InventoryReports({ reports, user, module = 'Inventory' }) {
  const [filters, setFilters] = useState(() => ({ ...defaultReportDates(), module }));
  const [period, setPeriod] = useState('Monthly');
  const [selectedReport, setSelectedReport] = useState(reports[0]?.name || '');
  const reportDeck = useMemo(() => {
    const colors = ['blue', 'green', 'purple', 'orange', 'red', 'mint', 'indigo', 'amber', 'pink', 'cyan', 'sage', 'violet', 'gold', 'teal'];
    const icons = [ClipboardCheck, ArrowUpDown, Warehouse, Hourglass, AlertTriangle, SlidersHorizontal, ArrowLeftRight, ShieldCheck, Boxes, FastForward, CircleDollarSign, LineChart, ShoppingCart, PieChartIcon];
    const names = module === 'Inventory'
      ? ['Inventory Valuation Report', 'Stock Movement Report', 'Warehouse Report', 'Expiry Report', 'Damage Report', 'Stock Adjustment Report', 'Transfer Report', 'Inventory Audit Report', 'Dead Stock Report', 'Fast Moving Stock Report', 'Inventory Cost Report', 'Inventory Forecast Report', 'Reorder Recommendation Report', 'Inventory Profitability Report']
      : reports.map(row => row.name);
    return names.map((name, index) => {
      const source = reports.find(row => row.name === name) || reports[index % Math.max(reports.length, 1)] || {};
      const Icon = icons[index % icons.length];
      return {
        ...source,
        name,
        records: source.records ?? (index % 3 === 0 ? 10 : index % 3 === 1 ? 40 : 5),
        value: source.value ?? 55296 * (index + 1),
        exports: source.exports || ['PDF', 'Excel', 'CSV'],
        icon: Icon,
        tone: colors[index % colors.length]
      };
    });
  }, [reports, module]);
  function setPeriodRange(nextPeriod) {
    const end = new Date();
    const days = nextPeriod === 'Weekly' ? 7 : nextPeriod === 'Quarterly' ? 90 : nextPeriod === 'Yearly' ? 365 : 30;
    const start = new Date(Date.now() - days * 86400000);
    setPeriod(nextPeriod);
    setFilters(prev => ({ ...prev, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), period: nextPeriod }));
  }
  async function exportReport(report, format) {
    const file = await rpc('generateReportExport', [user, { ...filters, module, reportName: report.name }, format]);
    handleGeneratedFile(file, format);
  }
  const activeReport = reportDeck.find(report => report.name === selectedReport) || reportDeck[0];
  return (
    <section className="inventory-report-center">
      <header className="report-center-heading">
        <div>
          <h2>{module === 'Inventory' ? 'Reports Center' : `${module} Reports Center`}</h2>
          <p>Generate and download detailed {module.toLowerCase()} reports with ease.</p>
        </div>
        <ExportButton format="PDF" primary onClick={() => activeReport && exportReport(activeReport, 'PDF')}>
          Generate Report
        </ExportButton>
      </header>

      <div className="report-filter-shell">
        <div className="report-period-group">
          {['Weekly', 'Monthly', 'Quarterly', 'Yearly'].map(option => (
            <button key={option} className={period === option ? 'active' : ''} onClick={() => setPeriodRange(option)}>{option}</button>
          ))}
        </div>
        <label>Start Date<input type="date" value={filters.startDate || ''} onChange={e => setFilters({ ...filters, startDate: e.target.value })} /></label>
        <label>End Date<input type="date" value={filters.endDate || ''} onChange={e => setFilters({ ...filters, endDate: e.target.value })} /></label>
        <label>Preview Rows<select value={filters.limit || 25} onChange={e => setFilters({ ...filters, limit: Number(e.target.value) })}>{[25, 50, 100, 250].map(x => <option key={x} value={x}>{x}</option>)}</select></label>
      </div>

      <div className="inventory-report-grid">
        {reportDeck.map(report => {
          const Icon = report.icon;
          return (
            <article key={report.name} className={selectedReport === report.name ? 'active' : ''} onClick={() => setSelectedReport(report.name)}>
              <div className={`report-icon-badge ${report.tone}`}><Icon size={25} /></div>
              <strong>{report.name}</strong>
              <span><Calendar size={13} /> {filters.startDate} to {filters.endDate}</span>
              <em>{Number(report.records || 0).toLocaleString()} records{report.previewLimit ? ` / preview ${report.previewLimit}` : ''}</em>
              {report.layout && <small className="report-layout-chip">{label(report.layout)}</small>}
              <b>{currency(report.value)}</b>
              <div className="report-card-actions">
                {(report.exports || ['PDF', 'Excel', 'CSV']).slice(0, 3).map(x => <ExportButton key={x} format={x} onClick={event => { event.stopPropagation(); exportReport(report, x); }}>{x}</ExportButton>)}
                <button aria-label={`Open ${report.name}`} onClick={event => { event.stopPropagation(); setSelectedReport(report.name); }}><ArrowRight size={15} /></button>
              </div>
            </article>
          );
        })}
      </div>

      <footer className="report-tip-strip">
        <span>i</span>
        <p>Tip: Cards show a fast preview count. Export buttons generate the full matching report for the selected date range.</p>
        <FileText size={74} />
      </footer>
    </section>
  );
}

function InventoryAnalytics({ data, metric, setMetric }) {
  const metrics = ['inventoryValue', 'incomingStock', 'outgoingStock', 'damagedStock', 'expiredStock', 'warehouseStock', 'stockTurnover', 'stockCosts'];
  return (
    <div className="dashboard-grid">
      <Panel className="span-12 sales-main-chart" title="Inventory Analytics">
        <div className="metric-toggle">{metrics.map(x => <button key={x} className={metric === x ? 'active' : ''} onClick={() => setMetric(x)}>{label(x)}</button>)}</div>
        <SalesTrendChart data={data.trend} metric={metric} />
      </Panel>
      <Panel className="span-6" title="Stock Intelligence"><SimpleTable rows={data.healthScores} columns={['productName', 'warehouseName', 'healthScore', 'classification']} /></Panel>
      <Panel className="span-6" title="Cost Intelligence"><SimpleTable rows={data.costs} columns={['warehouseName', 'rent', 'utilities', 'labor', 'damageCosts', 'expiryLosses', 'totalCost']} /></Panel>
      <Panel className="span-6" title="Fast Moving Stock"><SimpleTable rows={data.fastMoving} columns={['productName', 'warehouseName', 'movementCount', 'quantityAvailable', 'profitPotential']} /></Panel>
      <Panel className="span-6" title="Document Center"><SimpleTable rows={data.documents} columns={['type', 'reference', 'productName', 'warehouseName', 'uploadedBy', 'date']} /></Panel>
    </div>
  );
}

function InventoryAdjustModal({ user, items, onClose, onSaved }) {
  const [form, setForm] = useState({ inventoryId: items[0]?.id || '', quantity: 0, reason: 'Correction' });
  const [saving, setSaving] = useState(false);
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('adjustInventory', [user, form]);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={save}>
        <header><h2>Stock Adjustment</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <label>Stock Item<select value={form.inventoryId} onChange={e => setForm({ ...form, inventoryId: e.target.value })}>{items.map(item => <option key={item.id} value={item.id}>{item.productName} - {item.warehouseName}</option>)}</select></label>
        <div className="modal-grid">
          <label>Quantity Change<input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></label>
          <label>Reason<select value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}>{['Count Variance', 'Damage', 'Loss', 'Theft', 'Correction', 'Expiry'].map(x => <option key={x}>{x}</option>)}</select></label>
        </div>
        <button className="primary-action" disabled={saving}>{saving ? 'Saving...' : 'Post Adjustment'}</button>
      </form>
    </div>
  );
}

function InventoryTransferModal({ user, items, warehouses, onClose, onSaved }) {
  const [form, setForm] = useState({ inventoryId: items[0]?.id || '', quantity: 1, toWarehouse: warehouses[1]?.name || warehouses[0]?.name || '' });
  const [saving, setSaving] = useState(false);
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('transferInventory', [user, form]);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={save}>
        <header><h2>Transfer Stock</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <label>Stock Item<select value={form.inventoryId} onChange={e => setForm({ ...form, inventoryId: e.target.value })}>{items.map(item => <option key={item.id} value={item.id}>{item.productName} - {item.warehouseName}</option>)}</select></label>
        <div className="modal-grid">
          <label>Quantity<input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></label>
          <label>To Warehouse<select value={form.toWarehouse} onChange={e => setForm({ ...form, toWarehouse: e.target.value })}>{warehouses.map(wh => <option key={wh.name}>{wh.name}</option>)}</select></label>
        </div>
        <button className="primary-action" disabled={saving}>{saving ? 'Transferring...' : 'Complete Transfer'}</button>
      </form>
    </div>
  );
}

function ProcurementWorkspace({ user, setPage, globalPeriod }) {
  const tabs = ['overview', 'requests', 'orders', 'suppliers', 'deliveries', 'receiving', 'credit', 'payables', 'reports', 'analytics', 'ai'];
  const workspace = useServer(user, 'getProcurementWorkspaceData', [{ period: globalPeriod }], [globalPeriod]);
  const [view, setView] = useRouteTab('purchasing', tabs, 'overview');
  const [metric, setMetric] = useState('spend');
  const [query, setQuery] = useState('');

  if (workspace.loading) return <Loading title="Purchases" />;
  if (workspace.error) return <ErrorState title="Purchases" error={workspace.error} />;

  const data = workspace.data;
  const metrics = ['spend', 'deliveries', 'leadTime', 'supplierPerformance', 'creditPurchases', 'outstandingBalances', 'purchaseOrders', 'receivedGoods'];
  const filteredSearch = query.length < 2 ? [] : data.searchIndex.filter(row => `${row.type} ${row.label} ${row.sub}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8);

  return (
    <section className="page-stack sales-workspace procurement-workspace">
      <div className="sales-hero procurement-hero">
        <div>
          <span>Procurement Operations Center</span>
          <h1>Purchases Workspace</h1>
          <p>Purchase requests, purchase orders, suppliers, deliveries, goods receiving, credit, accounts payable, reports, analytics, and AI in one connected workflow.</p>
        </div>
        <div className="sales-hero-stats">
          <strong>{data.overview.totalPOs}</strong><span>POs</span>
          <strong>{currency(data.overview.procurementSpend)}</strong><span>Spend</span>
          <strong>{currency(data.overview.outstandingSupplierBalances)}</strong><span>Payables</span>
        </div>
      </div>
      <div className="inline-actions"><CreateRequisitionButton user={user} module="purchasing" /></div>

      <div className="sales-filter-bar">
        <button><Calendar size={16} />{data.filters.dateRange}</button>
        <button><Truck size={16} />{data.filters.supplier}</button>
        <button><Warehouse size={16} />{data.filters.warehouse}</button>
        <button><MapPin size={16} />{data.filters.county}</button>
        <button><Package size={16} />{data.filters.product}</button>
      </div>

      <div className="procurement-search">
        <Search size={18} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search PO, supplier, product, delivery, invoice, GRN, warehouse, county..." />
        {filteredSearch.length > 0 && <div>{filteredSearch.map(row => <span key={`${row.type}-${row.label}`}><b>{row.type}</b>{row.label}<em>{row.sub}</em></span>)}</div>}
      </div>

      <div className="sales-tabs">
        {tabs.map(tab => <button key={tab} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}>{label(tab)}</button>)}
      </div>

      {view === 'overview' && (
        <>
          <div className="control-grid">
            <KpiCard icon={ClipboardCheck} label="Total POs" value={data.overview.totalPOs} change={8.2} tone="blue" />
            <KpiCard icon={AlertTriangle} label="Pending POs" value={data.overview.pendingPOs} change={-2.1} tone="red" />
            <KpiCard icon={CheckCircle2} label="Approved POs" value={data.overview.approvedPOs} change={12.4} tone="green" />
            <KpiCard icon={Warehouse} label="Received POs" value={data.overview.receivedPOs} change={6.8} tone="green" />
            <KpiCard icon={Truck} label="Overdue Deliveries" value={data.overview.overdueDeliveries} change={-4.2} tone="red" />
            <KpiCard icon={CircleDollarSign} label="Supplier Balances" value={currency(data.overview.outstandingSupplierBalances)} change={3.1} tone="blue" />
          </div>
          <div className="dashboard-grid">
            <Panel className="span-12 sales-main-chart" title="Main Procurement Graph" action="Shared Filters">
              <SalesTrendChart data={data.spendTrend} metric={metric} />
            </Panel>
            <Panel className="span-12" title="Switch Procurement Metric">
              <div className="metric-toggle">{metrics.map(x => <button key={x} className={metric === x ? 'active' : ''} onClick={() => setMetric(x)}>{label(x)}</button>)}</div>
              <ProcurementWorkflow steps={data.workflow} />
            </Panel>
          </div>
        </>
      )}

      {view === 'requests' && <Panel title="Purchase Requests" action="Create Request"><SimpleTable rows={data.purchaseRequests} columns={['requestNo', 'department', 'requestedBy', 'productName', 'quantity', 'priority', 'approvalStatus']} /></Panel>}
      {view === 'orders' && <Panel title="Purchase Orders" action="Generate PO"><SimpleTable rows={data.purchaseOrders} columns={['poNo', 'supplierName', 'department', 'warehouseName', 'total', 'status']} /></Panel>}
      {view === 'suppliers' && <ProcurementSuppliers suppliers={data.suppliers} />}
      {view === 'deliveries' && <ProcurementDeliveries deliveries={data.deliveries} counties={data.deliveryCounty} />}
      {view === 'receiving' && <ProcurementReceiving receipts={data.goodsReceiving} items={data.goodsReceiptItems} />}
      {view === 'credit' && <Panel title="Credit Purchases" action="Risk Scored"><SimpleTable rows={data.creditPurchases} columns={['supplierName', 'invoiceNo', 'invoiceAmount', 'outstandingBalance', 'dueDate', 'status', 'aiRiskScore']} /></Panel>}
      
      {view === 'timeline' && <FinanceInvoiceTimeline data={data} />}
      {view === 'customerLedger' && <FinanceCustomerLedger data={data} />}{view === 'payables' && <ProcurementPayables rows={data.accountsPayable} buckets={data.agingBuckets} />}
      {view === 'reports' && <ProcurementReports reports={data.reports} user={user} />}
      {view === 'analytics' && <ProcurementAnalytics analytics={data.analytics} metric={metric} setMetric={setMetric} />}
      {view === 'ai' && <ProcurementAi insights={data.ai} />}
    </section>
  );
}

function ProcurementWorkflow({ steps }) {
  return (
    <div className="pipeline-board procurement-flow">
      {steps.map(step => (
        <article key={step.step}>
          <strong>{step.step}</strong>
          <b>{step.count}</b>
          <span>Live workflow records</span>
        </article>
      ))}
    </div>
  );
}

function ProcurementSuppliers({ suppliers }) {
  return (
    <div className="dashboard-grid">
      <Panel className="span-12" title="Supplier Scorecards" action="Performance">
        <div className="scorecards procurement-scorecards">
          {suppliers.map(row => (
            <article key={row.id}>
              <strong>{row.name}</strong>
              <span>{row.contactPerson} - {row.category} - {row.paymentTerms}</span>
              <div><em style={{ width: `${row.overallRating || 0}%` }} /></div>
              <span>Delivery {row.deliveryAccuracy}% - Quality {row.qualityScore}% - Lead time {row.leadTime} days - Outstanding {currency(row.outstandingBalance)}</span>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ProcurementDeliveries({ deliveries, counties }) {
  return (
    <div className="dashboard-grid">
      <Panel className="span-7" title="Kenya Delivery Intelligence" action="County Status">
        <div className="county-grid procurement-county-grid">
          {counties.map(row => (
            <button key={row.county} className={row.status === 'Delivered' ? 'green' : row.status === 'Delayed' ? 'red' : row.status === 'In Transit' ? 'yellow' : ''}>
              <strong>{row.county}</strong>
              <span>{row.deliveries}</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel className="span-5" title="Late Delivery Alerts" action="ETA">
        <VisitTimeline visits={deliveries.map(row => ({ id: row.id, county: row.county, customerName: row.supplierName, salesRepName: row.driver, visitStart: row.dispatchDate, visitEnd: row.eta, durationMinutes: row.status, outcome: row.notes }))} />
      </Panel>
      <Panel className="span-12" title="Procurement Deliveries">
        <SimpleTable rows={deliveries} columns={['deliveryNo', 'poNo', 'supplierName', 'county', 'warehouseName', 'eta', 'status']} />
      </Panel>
    </div>
  );
}

function ProcurementReceiving({ receipts, items }) {
  return (
    <div className="dashboard-grid">
      <Panel className="span-12" title="Goods Received Notes" action="Inventory Updated">
        <SimpleTable rows={receipts} columns={['grnNo', 'poNo', 'supplierName', 'warehouseName', 'receivedBy', 'acceptedQuantity', 'rejectedQuantity', 'status']} />
      </Panel>
      <Panel className="span-12" title="Receiving Variance">
        <SimpleTable rows={items} columns={['productName', 'expectedQuantity', 'receivedQuantity', 'damagedQuantity', 'acceptedQuantity', 'inventoryUpdated']} />
      </Panel>
    </div>
  );
}

function ProcurementPayables({ rows, buckets }) {
  return (
    <div className="dashboard-grid">
      <Panel className="span-4" title="Aging Buckets">
        <div className="metric-stack">
          {buckets.map(row => <div key={row.bucket}><span>{row.bucket} days</span><strong>{currency(row.amount)}</strong></div>)}
        </div>
      </Panel>
      <Panel className="span-8" title="Accounts Payable">
        <SimpleTable rows={rows} columns={['invoiceNo', 'supplierName', 'dueDate', 'invoiceAmount', 'paidAmount', 'outstandingBalance', 'paymentStatus']} />
      </Panel>
    </div>
  );
}

function ProcurementReports({ reports, user }) {
  const [filters, setFilters] = useState(() => ({ ...defaultReportDates(), module: 'Procurement' }));
  async function exportReport(report, format) {
    const file = await rpc('generateReportExport', [user, { ...filters, module: 'Procurement', reportName: report.name }, format]);
    handleGeneratedFile(file, format);
  }
  return (
    <Panel title="Procurement Report Center" action="Generate">
      <ReportDateControls filters={filters} setFilters={setFilters} />
      <div className="sales-report-grid">
        {reports.map(report => (
          <article key={report.name}>
            <strong>{report.name}</strong>
            <span>{report.dateRange} - {report.records} records</span>
            <b>{currency(report.value)}</b>
            <ExportFormatStrip formats={report.exports || REPORT_FORMATS} onExport={format => exportReport(report, format)} />
          </article>
        ))}
      </div>
    </Panel>
  );
}

function ProcurementAnalytics({ analytics, metric, setMetric }) {
  const metrics = ['spend', 'deliveries', 'leadTime', 'supplierPerformance', 'creditPurchases', 'outstandingBalances', 'purchaseOrders', 'receivedGoods'];
  return (
    <div className="dashboard-grid">
      <Panel className="span-12 sales-main-chart" title="Procurement Analytics Trend">
        <div className="metric-toggle">{metrics.map(x => <button key={x} className={metric === x ? 'active' : ''} onClick={() => setMetric(x)}>{label(x)}</button>)}</div>
        <SalesTrendChart data={analytics.spendTrend} metric={metric} />
      </Panel>
      <Panel className="span-6" title="Supplier Comparison"><SimpleTable rows={analytics.supplierComparison} columns={['supplier', 'spend', 'orders', 'leadTime', 'deliveryAccuracy', 'outstandingBalance']} /></Panel>
      <Panel className="span-6" title="Delivery Performance"><SimpleTable rows={analytics.deliveryPerformance} columns={['deliveryNo', 'supplierName', 'county', 'status', 'performance']} /></Panel>
      <Panel className="span-6" title="Credit Exposure"><SimpleTable rows={analytics.creditExposure} columns={['supplierName', 'outstandingBalance', 'creditLimit', 'aiRiskScore', 'status']} /></Panel>
      <Panel className="span-6" title="Inventory Replenishment Forecast"><SimpleTable rows={analytics.forecasts} columns={['productName', 'recommendedOrderQty', 'reorderTiming', 'expectedCost', 'reason']} /></Panel>
      <Panel className="span-6" title="Spend by Product"><SimpleTable rows={analytics.spendByProduct} columns={['product', 'spend', 'quantity']} /></Panel>
      <Panel className="span-6" title="Spend by Department"><SimpleTable rows={analytics.spendByDepartment} columns={['department', 'spend', 'purchaseOrders']} /></Panel>
    </div>
  );
}

function ProcurementAi({ insights }) {
  const safeInsights = (insights || []).filter(Boolean);
  return (
    <Panel title="AI Procurement Insights">
      <div className="ai-insights">
        {safeInsights.map(item => (
          <article key={item.title || item.id || Math.random()}>
            <strong>{item.title || 'Insight'}</strong>
            <p>{item.detail || item.content || ''}</p>
            {item.sources && <span>Sources: {Array.isArray(item.sources) ? item.sources.join(', ') : item.sources}</span>}
          </article>
        ))}
      </div>
    </Panel>
  );
}

function ManufacturingAi({ insights }) {
  const safeInsights = (insights || []).filter(Boolean);
  return (
    <Panel title="Manufacturing AI Insights">
      <div className="ai-insights">
        {safeInsights.map(item => (
          <article key={item.title || item.id || Math.random()}>
            <strong>{item.title || 'Manufacturing Insight'}</strong>
            <p>{item.detail || item.content || ''}</p>
            {item.sources && <span>Sources: {Array.isArray(item.sources) ? item.sources.join(', ') : item.sources}</span>}
          </article>
        ))}
      </div>
    </Panel>
  );
}

function SalesModule({ user, setPage, globalPeriod }) {
  const tabs = ['overview', 'pipeline', 'quotes', 'orders', 'invoices', 'team', 'territory', 'reports', 'analytics', 'ai', 'import', 'visits'];
  const [refreshKey, setRefreshKey] = useState(0);
  const workspace = useServer(user, 'getSalesWorkspaceData', [{ period: globalPeriod }], [refreshKey, globalPeriod]);
  const [view, setView] = useRouteTab('sales', tabs, 'overview');
  const [metric, setMetric] = useState('revenue');
  const [selectedCounty, setSelectedCounty] = useState('Nairobi');
  const [saleFormOpen, setSaleFormOpen] = useState(false);
  const [quoteFormOpen, setQuoteFormOpen] = useState(false);

  useEffect(() => {
    const open = () => setSaleFormOpen(true);
    window.addEventListener('farmtrack:new-record', open);
    return () => window.removeEventListener('farmtrack:new-record', open);
  }, []);

  if (workspace.loading) return <Loading title="Sales" />;
  if (workspace.error) return <ErrorState title="Sales" error={workspace.error} />;

  const data = workspace.data;
  const territory = data.territory;
  const county = territory.counties.find(c => c.name === selectedCounty) || territory.counties[0];
  const metrics = ['revenue', 'profit', 'customers', 'invoices', 'expenses', 'pipeline'];
  const salesKpis = [
    [CircleDollarSign, 'Revenue', currency(data.overview.revenue), 14.8, 'green'],
    [LineChart, 'Profit', currency(data.overview.profit), 9.2, 'green'],
    [ReceiptText, 'Orders', data.overview.orders, 6.4, 'blue'],
    [FileText, 'Invoices', data.overview.invoices, 4.1, 'blue'],
    [Target, 'Pipeline', currency(data.overview.pipeline), 11.3, 'green'],
    [BriefcaseBusiness, 'Expenses', currency(data.overview.expenses), -3.2, 'red'],
    [Wallet, 'Avg Order', currency(data.overview.averageOrderValue || 0), 5.1, 'blue'],
    [Truck, 'Pending Delivery', data.overview.pendingDelivery || 0, data.overview.pendingDelivery ? -2 : 2, data.overview.pendingDelivery ? 'red' : 'blue'],
    [ClipboardCheck, 'Unpaid Invoices', data.overview.unpaidInvoices || 0, data.overview.unpaidInvoices ? -3 : 3, data.overview.unpaidInvoices ? 'red' : 'blue'],
    [Users, 'Repeat Customers', data.overview.repeatCustomers || 0, 7.6, 'blue'],
    [Package, 'Top Products', data.overview.topProducts || 0, 4.8, 'blue'],
    [Gauge, 'Quote Conversion', `${data.overview.quoteConversion || 0}%`, 6.2, 'blue']
  ];

  return (
    <section className="page-stack sales-workspace">
      <div className="sales-hero">
        <div>
          <span>Revenue Operations Center</span>
          <h1>Sales Workspace</h1>
          <p>Pipeline, quotes, orders, invoices, team, territory, reports, and analytics operating as one shared workspace.</p>
        </div>
        <div className="sales-hero-stats">
          <strong>{currency(data.overview.revenue)}</strong><span>Revenue</span>
          <strong>{data.overview.orders}</strong><span>Orders</span>
          <strong>{currency(data.overview.pipeline)}</strong><span>Pipeline</span>
        </div>
      </div>
      <div className="inline-actions">
        <button onClick={() => setSaleFormOpen(true)}><Plus size={16} /> New Sales Order</button>
        <button onClick={() => { setView('quotes'); setQuoteFormOpen(true); }}><FileText size={16} /> New Quote</button>
        <button onClick={() => setView('orders')}><Truck size={16} /> Delivery Queue</button>
        <button onClick={() => setView('reports')}><FileText size={16} /> Sales Reports</button>
        <CreateRequisitionButton user={user} module="sales" />
      </div>

      <div className="sales-filter-bar">
        <button><Calendar size={16} />{data.filters.dateRange}</button>
        <button><MapPin size={16} />{data.filters.territory}</button>
        <button><Users size={16} />{data.filters.salesRep}</button>
        <button><Package size={16} />{data.filters.product}</button>
      </div>

      <div className="sales-tabs">
        {tabs.map(tab => <button key={tab} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}>{label(tab)}</button>)}
      </div>

      {view === 'overview' && (
        <>
          <div className="control-grid">
            {salesKpis.map(([Icon, labelText, value, change, tone]) => (
              <KpiCard key={labelText} icon={Icon} label={labelText} value={value} change={change} tone={tone} />
            ))}
          </div>
          <div className="dashboard-grid">
            <Panel className="span-12 sales-main-chart" title="Revenue Operations Trend" action="Shared Filters">
              <SalesTrendChart data={data.revenueTrend} metric={metric} />
            </Panel>
            <Panel className="span-12" title="Sales Team Comparison">
              <div className="metric-toggle">{metrics.map(x => <button key={x} className={metric === x ? 'active' : ''} onClick={() => setMetric(x)}>{label(x)}</button>)}</div>
              <SalesTeamTable rows={data.teamComparison} metric={metric} />
            </Panel>
          </div>
        </>
      )}

      {view === 'pipeline' && <SalesPipeline stages={data.pipeline.stages} leads={data.pipeline.leads} />}
      {view === 'quotes' && <QuotesWorkspace user={user} quotes={data.quotes} onDone={() => setRefreshKey(x => x + 1)} customers={data.customers} />}
      {view === 'orders' && <SalesOrdersWorkspace user={user} orders={data.orders} deliveries={data.deliveries} onDone={() => setRefreshKey(x => x + 1)} />}
      {view === 'invoices' && <Panel title="Invoices" action="Printable"><InvoiceDocumentTable user={user} rows={data.invoices} columns={['invNo', 'customerName', 'total', 'paid', 'balance', 'liveStatus']} /></Panel>}
      {view === 'team' && <TeamWorkspace data={data} metric={metric} />}
      {view === 'territory' && <TerritoryWorkspace territory={territory} county={county} setSelectedCounty={setSelectedCounty} />}
      {view === 'reports' && <InventoryReports reports={data.reports} user={user} module="Sales" />}
      {view === 'analytics' && <SalesAnalytics analytics={data.analytics} />}
      {view === 'ai' && <SalesAi insights={data.ai} />}
      {view === 'import' && <SalesImportWorkspace user={user} products={data.products} onDone={() => setRefreshKey(x => x + 1)} />}
      {view === 'visits' && <SalesVisitsWorkspace user={user} visits={data.visits || []} salesPeople={data.salesPeople || ['Edna', 'Njoroge', 'Joseph', 'Purity']} onDone={() => setRefreshKey(x => x + 1)} />}
{saleFormOpen && <NewSaleModal user={user} onClose={() => setSaleFormOpen(false)} onSaved={() => { setSaleFormOpen(false); setRefreshKey(x => x + 1); setView('orders'); }} />}
       {quoteFormOpen && <QuotationModal user={user} customers={data.customers} onClose={() => setQuoteFormOpen(false)} onSaved={() => { setQuoteFormOpen(false); setRefreshKey(x => x + 1); setView('quotes'); }} />}
      </section>
  );
}

const SALES_IMPORT_TEMPLATE = `Customer Name,Contact Person,Phone,Email,Order Date,Product,Quantity,Unit Price,Total,Payment Method,Shipping Address,Notes
Greenfield Farms,John Mwangi,0712345678,john@greenfield.co.ke,2026-07-20,DAP Fertilizer,10,4500,45000,Cash,Nairobi Industrial Area,Bulk delivery
Highland Dairy,Susan Wanjiru,0722001122,susan@highlanddairy.com,2026-07-20,Dairy Meal 50kg,20,2800,56000,M-Pesa,Nakuru Town,Deliver before noon`;

function parseCsvText(text) {
  const clean = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!clean) return [];
  const lines = clean.split('\n').filter(l => l.trim().length);
  if (!lines.length) return [];
  const splitLine = (line) => {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(c => c.trim());
  };
  const header = splitLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const cells = splitLine(line);
    const row = {};
    header.forEach((key, i) => { row[key] = cells[i] ?? ''; });
    return row;
  });
}

function SalesImportWorkspace({ user, products = [], onDone }) {
  const [rawText, setRawText] = useState('');
  const [rows, setRows] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fileName, setFileName] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const fileRef = useRef(null);

  async function syncFromSheet() {
    setSyncing(true); setSyncMsg('');
    try {
      const res = await rpc('pullSalesFromSheet', [user, {}]);
      const tabInfo = (res.tabs || []).map(t => `${t.sheetName}: ${t.rows}`).join(', ');
      if (res.imported > 0) { setSyncMsg(`Synced ${res.imported} order(s) from Google Sheet (${tabInfo}).`); onDone?.(); }
      else setSyncMsg(res.message || `No new orders found. Tabs: ${tabInfo}`);
    } catch (err) { setSyncMsg('Sync failed: ' + (err.message || 'unknown error')); }
    finally { setSyncing(false); }
  }
  const [exporting, setExporting] = useState(false);
  async function syncToSheet() {
    setExporting(true); setSyncMsg('');
    try {
      const res = await rpc('syncSalesToSheet', [user, {}]);
      setSyncMsg(res.message || `Exported ${res.rows} sales orders to Google Sheet (offline backup).`);
    } catch (err) { setSyncMsg('Export failed: ' + (err.message || 'unknown error')); }
    finally { setExporting(false); }
  }

  const normalizeRow = (row) => ({
    customerName: row['Customer Name'] || row['Customer'] || row.customerName || row.customer || '',
    contactPerson: row['Contact Person'] || row.contactPerson || '',
    phone: row['Phone'] || row.phone || row['Phone Number'] || '',
    email: row['Email'] || row['Email Address'] || row.email || '',
    orderDate: row['Order Date'] || row.orderDate || '',
    productName: row['Product'] || row['Product Name'] || row.productName || row.product || '',
    quantity: Number(row['Quantity'] || row.quantity || row.qty || 0) || 0,
    unitPrice: Number(row['Unit Price'] || row.unitPrice || row.price || 0) || 0,
    total: Number(row['Total'] || row['Total Amount'] || row.total || 0) || 0,
    paymentMethod: row['Payment Method'] || row.paymentMethod || 'Cash',
    shippingAddress: row['Shipping Address'] || row.shippingAddress || row.destination || '',
    notes: row['Notes'] || row['Special Requests'] || row.notes || ''
  });

  const validateRows = (parsed) => parsed.map((row, i) => {
    const n = normalizeRow(row);
    const issues = [];
    if (!n.customerName) issues.push('Customer name missing');
    if (!n.productName) issues.push('Product missing');
    if (!(n.quantity > 0)) issues.push('Quantity must be > 0');
    if (!(n.unitPrice > 0)) issues.push('Unit price must be > 0');
    const product = products.find(p => String(p.name || '').toLowerCase() === String(n.productName).toLowerCase());
    if (!product && n.productName) issues.push(`Product "${n.productName}" not in catalog`);
    return { ...n, line: i + 2, valid: issues.length === 0, issues, productMatched: product?.name || '' };
  });

  const handleParse = (text) => {
    setRawText(text);
    const parsed = parseCsvText(text);
    setRows(validateRows(parsed));
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => handleParse(String(reader.result || ''));
    reader.readAsText(file);
  };

  const validRows = rows.filter(r => r.valid);
  const invalidRows = rows.filter(r => !r.valid);
  const downloadTemplate = () => {
    const blob = new Blob([SALES_IMPORT_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sales-order-import-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="dashboard-grid">
      <Panel className="span-12" title="Import Sales Orders from CSV" action={
        <div className="panel-action-row">
          <a className="mini-action" href={SALES_SHEET_URL} target="_blank" rel="noopener noreferrer"><Upload size={14} /> Open Sales Sheet</a>
          <button className="mini-action" onClick={syncFromSheet} disabled={syncing} title="Pull all 4 reps' form responses from Google Sheets"><RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'Syncing...' : 'Sync from Sheet'}</button>
          <button className="mini-action" onClick={syncToSheet} disabled={exporting} title="Push ERP sales to the reporting sheet for offline backup"><Upload size={14} /> {exporting ? 'Exporting...' : 'Sync to Sheet'}</button>
        </div>
      }>
        <p className="hr-payroll-note">Upload or paste sales order data (one row = one order line). Review the parsed rows, then confirm to import. Each valid row creates a sales order, invoice, and delivery — just like the New Sales Order form. Click "Sync from Sheet" to pull all 4 reps' Google Form responses automatically.</p>
        {syncMsg && <div className={`crm-sheet-message ${/fail|error/i.test(syncMsg) ? 'warn' : ''}`}>{syncMsg}</div>}
        <div className="sales-import-actions">
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
          <button className="panel-action-button" type="button" onClick={() => fileRef.current?.click()}><Upload size={14} /> Choose CSV File</button>
          <button className="panel-action-button" type="button" onClick={downloadTemplate}><Download size={14} /> Download Template</button>
          {fileName && <span className="sales-import-file">Loaded: {fileName}</span>}
        </div>
        <div className="external-import-box" style={{ marginTop: 12 }}>
          <label>Or paste CSV here
            <textarea rows={6} value={rawText} onChange={e => handleParse(e.target.value)} placeholder={SALES_IMPORT_TEMPLATE.split('\n')[0]} />
          </label>
        </div>
      </Panel>

      {rows.length > 0 && (
        <>
          <Panel className="span-3" title="Parsed"><div className="hr-report-kpi"><strong>{rows.length}</strong><span>Total rows</span></div></Panel>
          <Panel className="span-3" title="Valid"><div className="hr-report-kpi"><strong style={{ color: '#22c55e' }}>{validRows.length}</strong><span>Ready to import</span></div></Panel>
          <Panel className="span-3" title="Issues"><div className="hr-report-kpi"><strong style={{ color: invalidRows.length ? '#ef4444' : '#22c55e' }}>{invalidRows.length}</strong><span>Rows with errors</span></div></Panel>
          <Panel className="span-3" title="Total Value"><div className="hr-report-kpi"><strong>{currency(validRows.reduce((s, r) => s + r.quantity * r.unitPrice, 0))}</strong><span>Valid orders total</span></div></Panel>

          <Panel className="span-12" title="Preview" action={
            <div className="panel-action-row">
              <button className="mini-action" type="button" onClick={() => { setRows([]); setRawText(''); setFileName(''); }}>Clear</button>
              <button className="primary-action" type="button" disabled={!validRows.length} onClick={() => setShowConfirm(true)}><CheckCircle2 size={14} /> Review & Confirm ({validRows.length})</button>
            </div>
          }>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Row</th><th>Customer</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.slice(0, 100).map(r => (
                    <tr key={r.line} style={{ background: r.valid ? '' : '#fef2f2' }}>
                      <td>{r.line}</td>
                      <td><strong>{r.customerName || '—'}</strong></td>
                      <td>{r.productName || '—'}{r.productMatched ? <em style={{ color: '#22c55e' }}> ✓{r.productMatched}</em> : null}</td>
                      <td>{r.quantity}</td>
                      <td>{currency(r.unitPrice)}</td>
                      <td><strong>{currency(r.quantity * r.unitPrice)}</strong></td>
                      <td>{r.paymentMethod}</td>
                      <td>{r.valid ? <span className="status active">Valid</span> : <span className="status cancelled" title={r.issues.join('; ')}>{r.issues[0]}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invalidRows.length > 0 && (
              <div className="crm-sheet-message warn">{invalidRows.length} row(s) have issues and will be skipped. Hover the status for details.</div>
            )}
          </Panel>
        </>
      )}

      {showConfirm && (
        <SalesImportConfirmOverlay
          user={user}
          rows={validRows}
          onClose={() => setShowConfirm(false)}
          onImported={() => { setShowConfirm(false); setRows([]); setRawText(''); setFileName(''); onDone?.(); }}
        />
      )}
    </div>
  );
}

function SalesImportConfirmOverlay({ user, rows, onClose, onImported }) {

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [skipStock, setSkipStock] = useState(false);

  const confirm = async () => {
    setBusy(true);
    setResult(null);
    try {
      const payload = rows.map(r => ({
        customerName: r.customerName, customerEmail: r.email, customerPhone: r.phone,
        productName: r.productName, quantity: r.quantity, unitPrice: r.unitPrice,
        paymentMethod: r.paymentMethod, destination: r.shippingAddress, notes: r.notes,
        paid: r.paymentMethod && /cash|mpesa/i.test(r.paymentMethod) ? (r.quantity * r.unitPrice) : 0
      }));
      const res = await rpc('importSalesOrders', [user, payload, { skipStockCheck: skipStock }]);
      setResult(res);
      if (res.success || res.imported > 0) onImported?.();
    } catch (err) {
      setResult({ success: false, imported: 0, errors: [{ row: 0, error: err.message }], importedRows: [] });
    } finally {
      setBusy(false);
    }
  };

  const totalValue = rows.reduce((s, r) => s + r.quantity * r.unitPrice, 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card wide" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); if (!busy) confirm(); }}>
        <header><h2>Review & Confirm Import</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        {result ? (
          <div className="sales-import-result">
            <div className="hr-report-kpi" style={{ marginBottom: 12 }}>
              <strong style={{ color: result.success ? '#22c55e' : '#f79009' }}>{result.imported} imported</strong>
              <span>{result.errors?.length || 0} errors</span>
            </div>
            {(result.importedRows || []).slice(0, 20).map(r => (
              <div key={r.row} className="sales-import-result-row"><CheckCircle2 size={14} style={{ color: '#22c55e' }} /><strong>{r.saleNo}</strong><span>{r.customer}</span><em>{currency(r.total)}</em></div>
            ))}
            {(result.errors || []).slice(0, 20).map((e, i) => (
              <div key={i} className="sales-import-result-row" style={{ color: '#ef4444' }}><X size={14} /><span>Row {e.row}</span><em>{e.error}</em></div>
            ))}
            <div className="invoice-actions-row" style={{ marginTop: 12 }}>
              <button type="button" className="primary-action" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <p className="hr-payroll-note">You are about to import <strong>{rows.length}</strong> sales order(s) worth <strong>{currency(totalValue)}</strong>. This will create sales orders, invoices, deliveries, and post finance journals for each valid row.</p>
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>Customer</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Payment</th></tr></thead>
                <tbody>
                  {rows.slice(0, 50).map(r => (
                    <tr key={r.line}><td><strong>{r.customerName}</strong></td><td>{r.productName}</td><td>{r.quantity}</td><td>{currency(r.unitPrice)}</td><td><strong>{currency(r.quantity * r.unitPrice)}</strong></td><td>{r.paymentMethod}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="sales-import-toggle" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: '#475467' }}>
              <input type="checkbox" checked={skipStock} onChange={e => setSkipStock(e.target.checked)} /> Skip stock check (allow negative inventory)
            </label>
            <div className="invoice-actions-row" style={{ marginTop: 12 }}>
              <button type="button" className="secondary-action" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="primary-action" disabled={busy}><CheckCircle2 size={14} /> {busy ? 'Importing...' : `Confirm Import (${rows.length})`}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

const VISIT_PRODUCTS = ['Bactrolure', 'Cue Lure Plug', 'Cera-Lure', 'Torula/Bait Track', 'FCM Lure', 'TutaLure', 'FAW Lure', 'Dupontrack Lure', 'Helitrack Lure', 'Supa Track Lure', 'Spodotrack Lure', 'Metatrack Plus', 'Miltrack Fungicide', 'Yellow / Clear Lynfield Trap', 'MaXtrap', 'Yellow & Blue Rollers', 'Delta Inserts', 'Delta Trap', 'Blue and Yellow Sticky Cards', 'Femitrack', 'Bacitrack', 'Wiltrack', 'Tichotrack', 'Other'];
const VISIT_OUTCOMES = ['Interested', 'Stock check done', 'Left sample', 'Follow-up needed', 'Not interested', 'Order placed', 'No decision'];

const VISITS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1R7X0asU4pHy4--YBb1A0JVZ_wuDWVi5A9pfq7tFUQHo/edit?gid=2028247623#gid=2028247623';
const SALES_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Ki9B7NjGLaJaKvEfJbicf8pK3IPOafoyF084QdK7QMs/edit?gid=220358081#gid=220358081';
const VISITS_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfpabQbCcjmPflzWccaqXR62ZNsP9-2ImEi6dBrc7zEbue4mg/viewform';
const REP_COLORS = { Edna: '#2563eb', Njoroge: '#7c3aed', Joseph: '#059669', Purity: '#dc2626' };
const repColor = name => REP_COLORS[name] || '#475467';
const repInitials = name => String(name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const OUTCOME_COLORS = {
  'Interested': '#2563eb', 'Order placed': '#22c55e', 'Left sample': '#0891b2',
  'Stock check done': '#7c3aed', 'Follow-up needed': '#f79009', 'Not interested': '#ef4444', 'No decision': '#98a2b3'
};
const outcomeColor = o => OUTCOME_COLORS[o] || '#475467';
const daysUntil = date => { if (!date) return null; const d = Math.round((new Date(date) - new Date(todayStr())) / 86400000); return d; };
function todayStr() { return new Date().toISOString().slice(0, 10); }

function SalesVisitsWorkspace({ user, visits = [], salesPeople = [], onDone }) {
  const [modal, setModal] = useState(null);
  const [editVisit, setEditVisit] = useState(null);
  const [filterRep, setFilterRep] = useState('');
  const [query, setQuery] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  async function syncFromSheet() {
    setSyncing(true); setSyncMsg('');
    try {
      const res = await rpc('pullVisitsFromSheet', [user, {}]);
      if (res.imported > 0) { setSyncMsg(`Synced ${res.imported} visit(s) from Google Sheet.`); onDone?.(); }
      else setSyncMsg(res.message || 'No new visits found in the sheet.');
    } catch (err) { setSyncMsg('Sync failed: ' + (err.message || 'unknown error')); }
    finally { setSyncing(false); }
  }
  const [exporting, setExporting] = useState(false);
  async function syncToSheet() {
    setExporting(true); setSyncMsg('');
    try {
      const res = await rpc('syncVisitsToSheet', [user, {}]);
      setSyncMsg(res.message || `Exported ${res.rows} visits to Google Sheet (offline backup).`);
    } catch (err) { setSyncMsg('Export failed: ' + (err.message || 'unknown error')); }
    finally { setExporting(false); }
  }

  const today = todayStr();
  const filtered = visits.filter(v => {
    if (filterRep && v.salesperson !== filterRep) return false;
    if (query) {
      const q = query.toLowerCase();
      if (![v.shopOrCustomer, v.contactPerson, v.phone, v.productDiscussed, v.outcome, v.salesperson, v.comments].join(' ').toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const todays = filtered.filter(v => v.visitDate === today);
  const followUps = filtered.filter(v => v.nextAppointment && v.nextAppointment >= today && v.status === 'Open').sort((a, b) => String(a.nextAppointment).localeCompare(String(b.nextAppointment)));
  const potentials = filtered.filter(v => /interest|order|sample/i.test(v.outcome)).sort((a, b) => num(b.potentialValue) - num(a.potentialValue));
  const totalPotential = potentials.reduce((s, v) => s + num(v.potentialValue), 0);
  const byRep = salesPeople.map(rep => {
    const repVisits = filtered.filter(v => v.salesperson === rep);
    const repToday = repVisits.filter(v => v.visitDate === today).length;
    const repFollowUps = repVisits.filter(v => v.nextAppointment && v.nextAppointment >= today && v.status === 'Open').length;
    const repPotential = repVisits.filter(v => /interest|order|sample/i.test(v.outcome)).reduce((s, v) => s + num(v.potentialValue), 0);
    return { rep, visits: repVisits.length, today: repToday, followUps: repFollowUps, potential: repPotential };
  });
  const recentVisits = [...filtered].sort((a, b) => String(b.visitDate || '').localeCompare(String(a.visitDate || ''))).slice(0, 8);

  const handleSave = async (form) => {
    try { await rpc('logVisit', [user, form]); setModal(null); setEditVisit(null); onDone?.(); } catch (err) { alert(err.message); }
  };
  const handleDelete = async (v) => {
    if (!confirm(`Delete visit for "${v.shopOrCustomer}"?`)) return;
    try { await rpc('deleteVisit', [user, v.id]); onDone?.(); } catch (err) { alert(err.message); }
  };

  return (
    <div className="dashboard-grid visits-workspace">
      <Panel className="span-12 visits-hero-panel" title="Field Visits & Follow-ups" action={
        <div className="panel-action-row">
          <a className="mini-action" href={VISITS_FORM_URL} target="_blank" rel="noopener noreferrer"><FileText size={14} /> Open Visit Form</a>
          <a className="mini-action" href={VISITS_SHEET_URL} target="_blank" rel="noopener noreferrer"><Upload size={14} /> Open Sheet</a>
          <button className="mini-action" onClick={syncFromSheet} disabled={syncing} title="Pull latest form responses from Google Sheets"><RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'Syncing...' : 'Sync from Sheet'}</button>
          <button className="mini-action" onClick={syncToSheet} disabled={exporting} title="Push ERP visits to the reporting sheet for offline backup"><Upload size={14} /> {exporting ? 'Exporting...' : 'Sync to Sheet'}</button>
          <button className="mini-action" onClick={() => setImportOpen(true)}><Upload size={14} /> Import CSV</button>
          <button className="primary-action" onClick={() => setModal('visit')}><Plus size={14} /> Log Visit</button>
        </div>
      }>
        <p className="hr-payroll-note">Daily field visit log for Edna, Njoroge, Joseph & Purity. Each visit can become a follow-up, a sales potential, and (if interested) a CRM lead automatically. Connected to your Google Forms & Sheets.</p>
        {syncMsg && <div className={`crm-sheet-message ${/fail|error/i.test(syncMsg) ? 'warn' : ''}`}>{syncMsg}</div>}
        <div className="visits-rep-bubbles">
          <button className={`rep-bubble ${filterRep === '' ? 'active' : ''}`} onClick={() => setFilterRep('')}>
            <span className="rep-avatar" style={{ background: '#050505' }}>ALL</span>
            <span className="rep-stats"><strong>{filtered.length}</strong><em>visits</em></span>
          </button>
          {byRep.map(r => (
            <button key={r.rep} className={`rep-bubble ${filterRep === r.rep ? 'active' : ''}`} onClick={() => setFilterRep(filterRep === r.rep ? '' : r.rep)} style={{ '--rep-color': repColor(r.rep) }}>
              <span className="rep-avatar" style={{ background: repColor(r.rep) }}>{repInitials(r.rep)}</span>
              <span className="rep-info"><strong>{r.rep}</strong><em>{r.visits} visits · {r.followUps} follow-ups</em></span>
              {r.today > 0 && <span className="rep-today-badge" title="Today's visits">{r.today}</span>}
            </button>
          ))}
        </div>
        <div className="visits-filter-bar">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search shop, product, outcome, comments..." />
          {filterRep && <button className="mini-action" onClick={() => setFilterRep('')}>Clear {filterRep} ✕</button>}
          <button className="mini-action" onClick={() => downloadRowsFile('sales-visits', filtered, 'CSV')}><Download size={14} /> Export CSV</button>
        </div>
      </Panel>

      <Panel className="span-3 visits-kpi-card visits-kpi-today" title="Today's Visits">
        <div className="visits-kpi-bubble"><strong>{todays.length}</strong><span>{today}</span></div>
      </Panel>
      <Panel className="span-3 visits-kpi-card visits-kpi-followup" title="Open Follow-ups">
        <div className="visits-kpi-bubble"><strong style={{ color: '#f79009' }}>{followUps.length}</strong><span>upcoming appointments</span></div>
      </Panel>
      <Panel className="span-3 visits-kpi-card visits-kpi-potential" title="Sales Potentials">
        <div className="visits-kpi-bubble"><strong style={{ color: '#22c55e' }}>{potentials.length}</strong><span>{currency(totalPotential)} potential</span></div>
      </Panel>
      <Panel className="span-3 visits-kpi-card visits-kpi-total" title="Total Visits">
        <div className="visits-kpi-bubble"><strong>{filtered.length}</strong><span>in current view</span></div>
      </Panel>

      <Panel className="span-7" title="Follow-up Board" action={`${followUps.length} upcoming`}>
        <div className="visits-timeline">
          {followUps.length === 0 && <div className="empty-state">No upcoming follow-ups. Log a visit with a next appointment to populate this board.</div>}
          {followUps.slice(0, 15).map(v => {
            const days = daysUntil(v.nextAppointment);
            const urgent = days !== null && days <= 2;
            return (
              <div key={v.id} className="visits-timeline-item" onClick={() => setEditVisit(v)}>
                <span className="visits-timeline-dot" style={{ background: urgent ? '#ef4444' : repColor(v.salesperson) }} />
                <div className="visits-timeline-content">
                  <div className="visits-timeline-date" style={{ color: urgent ? '#ef4444' : '#475467' }}>
                    {v.nextAppointment}{days !== null && days >= 0 ? ` · ${days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days}d`}` : ''}
                  </div>
                  <strong>{v.shopOrCustomer}</strong>
                  <div className="visits-timeline-meta">
                    <span className="visits-rep-tag" style={{ background: repColor(v.salesperson) }}>{v.salesperson}</span>
                    <span>{v.productDiscussed}</span>
                    <span className="visits-outcome-tag" style={{ background: outcomeColor(v.outcome), color: '#fff' }}>{v.outcome}</span>
                  </div>
                  {v.comments && <div className="visits-timeline-comment">{v.comments}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel className="span-5" title="Sales Potentials" action={currency(totalPotential)}>
        <div className="visits-potentials-grid">
          {potentials.length === 0 && <div className="empty-state">No potentials yet. Visits with outcome "Interested", "Order placed", or "Left sample" appear here.</div>}
          {potentials.slice(0, 10).map(v => (
            <article key={v.id} className="visits-potential-bubble" style={{ '--bubble-color': outcomeColor(v.outcome) }} onClick={() => setEditVisit(v)}>
              <div className="visits-potential-header">
                <span className="rep-avatar sm" style={{ background: repColor(v.salesperson) }}>{repInitials(v.salesperson)}</span>
                <strong>{v.shopOrCustomer}</strong>
              </div>
              <div className="visits-potential-body">
                <span className="visits-outcome-tag" style={{ background: outcomeColor(v.outcome), color: '#fff' }}>{v.outcome}</span>
                <span>{v.productDiscussed}</span>
              </div>
              {v.potentialValue > 0 && <div className="visits-potential-value">{currency(v.potentialValue)}</div>}
            </article>
          ))}
        </div>
      </Panel>

      <Panel className="span-12" title="By Salesperson" action="Performance bubbles">
        <div className="visits-rep-performance">
          {byRep.map(r => (
            <div key={r.rep} className={`visits-rep-perf-bubble ${filterRep === r.rep ? 'active' : ''}`} style={{ '--rep-color': repColor(r.rep) }} onClick={() => setFilterRep(filterRep === r.rep ? '' : r.rep)}>
              <span className="rep-avatar lg" style={{ background: repColor(r.rep) }}>{repInitials(r.rep)}</span>
              <div className="visits-rep-perf-body">
                <strong>{r.rep}</strong>
                <div className="visits-rep-perf-stats">
                  <span><b>{r.visits}</b> visits</span>
                  <span><b>{r.today}</b> today</span>
                  <span><b style={{ color: '#f79009' }}>{r.followUps}</b> follow-ups</span>
                  <span><b style={{ color: '#22c55e' }}>{currency(r.potential)}</b> potential</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="span-8" title="Recent Activity" action={`${filtered.length} total`}>
        <div className="visits-activity-feed">
          {recentVisits.length === 0 && <div className="empty-state">No visits logged yet.</div>}
          {recentVisits.map(v => (
            <div key={v.id} className="visits-activity-item" onClick={() => setEditVisit(v)}>
              <span className="rep-avatar sm" style={{ background: repColor(v.salesperson) }}>{repInitials(v.salesperson)}</span>
              <div className="visits-activity-body">
                <div className="visits-activity-top"><strong>{v.shopOrCustomer}</strong><span className="visits-activity-date">{v.visitDate}</span></div>
                <div className="visits-activity-meta">
                  <span className="visits-outcome-tag" style={{ background: outcomeColor(v.outcome), color: '#fff' }}>{v.outcome}</span>
                  {v.productDiscussed && <span>{v.productDiscussed}</span>}
                  {v.nextAppointment && <span style={{ color: '#f79009' }}>Next: {v.nextAppointment}</span>}
                </div>
                {v.comments && <div className="visits-activity-comment">{v.comments}</div>}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="span-4" title="Quick Actions">
        <div className="visits-quick-actions">
          <button className="visits-quick-action" onClick={() => setModal('visit')}><Plus size={18} /><span>Log New Visit</span></button>
          <button className="visits-quick-action" onClick={() => setImportOpen(true)}><Upload size={18} /><span>Import from CSV</span></button>
          <button className="visits-quick-action" onClick={syncFromSheet} disabled={syncing}><RefreshCw size={18} /><span>{syncing ? 'Syncing...' : 'Sync from Google Sheet'}</span></button>
          <button className="visits-quick-action" onClick={syncToSheet} disabled={exporting}><Upload size={18} /><span>{exporting ? 'Exporting...' : 'Export to Sheet (offline)'}</span></button>
          <a className="visits-quick-action" href={VISITS_FORM_URL} target="_blank" rel="noopener noreferrer"><FileText size={18} /><span>Open Google Form</span></a>
          <a className="visits-quick-action" href={VISITS_SHEET_URL} target="_blank" rel="noopener noreferrer"><Upload size={18} /><span>Open Google Sheet</span></a>
          <button className="visits-quick-action" onClick={() => downloadRowsFile('sales-visits', filtered, 'CSV')}><Download size={18} /><span>Export Visits CSV</span></button>
          <button className="visits-quick-action" onClick={() => setPage && setPage('customers')}><Users size={18} /><span>Go to CRM</span></button>
        </div>
      </Panel>

      <Panel className="span-12" title="Visit Activity Log" action={`${filtered.length} records`}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Salesperson</th><th>Shop / Customer</th><th>Product</th><th>Outcome</th><th>Stock Levels</th><th>Next Appointment</th><th>Potential</th><th>Comments</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.slice(0, 100).map(v => (
                <tr key={v.id}>
                  <td>{v.visitDate}</td>
                  <td><span className="visits-rep-tag" style={{ background: repColor(v.salesperson) }}>{v.salesperson}</span></td>
                  <td>{v.shopOrCustomer}{v.contactPerson ? ` (${v.contactPerson})` : ''}</td>
                  <td>{v.productDiscussed}</td>
                  <td><span className="visits-outcome-tag" style={{ background: outcomeColor(v.outcome), color: '#fff' }}>{v.outcome}</span></td>
                  <td>{v.stockLevels}</td>
                  <td>{v.nextAppointment || '—'}</td>
                  <td>{v.potentialValue ? currency(v.potentialValue) : '—'}</td>
                  <td style={{ maxWidth: 200, color: '#475467', fontSize: 12 }}>{v.comments}</td>
                  <td className="row-actions">
                    <button className="mini-action" title="Edit" onClick={() => setEditVisit(v)}><UserCog size={14} /></button>
                    <button className="mini-action" title="Delete" style={{ color: '#ef4444' }} onClick={() => handleDelete(v)}><X size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {modal === 'visit' && <VisitFormModal user={user} salesPeople={salesPeople} onClose={() => setModal(null)} onSave={handleSave} />}
      {editVisit && <VisitFormModal user={user} salesPeople={salesPeople} initial={editVisit} onClose={() => setEditVisit(null)} onSave={handleSave} />}
      {importOpen && <VisitsImportOverlay user={user} salesPeople={salesPeople} onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); onDone?.(); }} />}
    </div>
  );
}

function VisitFormModal({ user, salesPeople, onClose, onSave, initial }) {
  const [form, setForm] = useState(initial && initial.id ? { ...initial } : {
    visitDate: new Date().toISOString().slice(0, 10),
    salesperson: '',
    shopOrCustomer: '',
    contactPerson: '',
    phone: '',
    email: '',
    productDiscussed: '',
    outcome: 'Follow-up needed',
    stockLevels: '',
    nextAppointment: '',
    comments: '',
    potentialValue: 0,
    status: 'Open'
  });
  const isEdit = Boolean(form.id);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <header><h2>{isEdit ? 'Edit Visit' : 'Log Field Visit'}</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="modal-grid">
          <label>Visit Date<input type="date" value={form.visitDate} onChange={e => setForm({ ...form, visitDate: e.target.value })} required /></label>
          <label>Salesperson
            <select value={form.salesperson} onChange={e => setForm({ ...form, salesperson: e.target.value })} required>
              <option value="">Select salesperson</option>
              {salesPeople.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
        <div className="modal-grid">
          <label>Shop / Customer Name<input value={form.shopOrCustomer} onChange={e => setForm({ ...form, shopOrCustomer: e.target.value })} placeholder="Shop or customer visited" required /></label>
          <label>Contact Person<input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} placeholder="Person spoken to" required /></label>
        </div>
        <div className="modal-grid">
          <label>Phone<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="0712 345 678" required /></label>
          <label>Email (optional)<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="shop@email.com" /></label>
        </div>
        <div className="modal-grid">
          <label>Product Discussed
            <select value={form.productDiscussed} onChange={e => setForm({ ...form, productDiscussed: e.target.value })} required>
              <option value="">Select product</option>
              {VISIT_PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>Outcome of Visit
            <select value={form.outcome} onChange={e => setForm({ ...form, outcome: e.target.value })}>
              {VISIT_OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        </div>
        <div className="modal-grid">
          <label>Stock Levels Observed<input value={form.stockLevels} onChange={e => setForm({ ...form, stockLevels: e.target.value })} placeholder="e.g. 3 cartons of FCM Lure" /></label>
          <label>Next Expected Appointment<input type="date" value={form.nextAppointment} onChange={e => setForm({ ...form, nextAppointment: e.target.value })} /></label>
        </div>
        <div className="modal-grid">
          <label>Potential Value (KES)<input type="number" value={form.potentialValue} onChange={e => setForm({ ...form, potentialValue: Number(e.target.value) })} placeholder="0" /></label>
          <label>Status
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {['Open', 'Closed', 'Converted'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <label>Comments / Notes<textarea rows={3} value={form.comments} onChange={e => setForm({ ...form, comments: e.target.value })} placeholder="Visit notes, customer requests, agreed actions..." required /></label>
        <div className="invoice-actions-row" style={{ marginTop: 12 }}>
          <button type="button" className="secondary-action" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-action"><CheckCircle2 size={14} /> {isEdit ? 'Update Visit' : 'Save Visit'}</button>
        </div>
      </form>
    </div>
  );
}

function VisitsImportOverlay({ user, salesPeople, onClose, onDone }) {
  const [rawText, setRawText] = useState('');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const template = `Timestamp,Salesperson,Shop / Customer Name,Contact Person,Phone,Product Discussed,Outcome of the Visit,Stock Levels Observed,Next Expected Appointment,comment\n2026-07-21 10:30:00,Edna,Nakuru Agro Shop,John Mwangi,0712345678,FCM Lure,Interested,5 cartons on shelf,2026-07-28,Customer wants bulk pricing for next order and asked about FAW Lure availability`;

  const parse = (text) => {
    setRawText(text);
    setRows(parseCsvText(text));
  };
  const onFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => parse(String(reader.result || ''));
    reader.readAsText(file);
  };
  const downloadTemplate = () => {
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'visits-import-template.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
  const confirm = async () => {
    setBusy(true); setResult(null);
    try {
      const res = await rpc('importVisits', [user, rows]);
      setResult(res);
      if (res.imported > 0) onDone?.();
    } catch (err) { setResult({ imported: 0, errors: [{ row: 0, error: err.message }] }); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card wide" onClick={e => e.stopPropagation()}>
        <header><h2>Import Visits from CSV</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        {result ? (
          <div className="sales-import-result">
            <div className="hr-report-kpi" style={{ marginBottom: 12 }}>
              <strong style={{ color: res.success ? '#22c55e' : '#f79009' }}>{result.imported} imported</strong>
              <span>{result.errors?.length || 0} errors</span>
            </div>
            {(result.errors || []).slice(0, 20).map((e, i) => <div key={i} className="sales-import-result-row" style={{ color: '#ef4444' }}><X size={14} /><span>Row {e.row}</span><em>{e.error}</em></div>)}
            <div className="invoice-actions-row" style={{ marginTop: 12 }}><button type="button" className="primary-action" onClick={onClose}>Done</button></div>
          </div>
        ) : (
          <>
            <p className="hr-payroll-note">Paste visit rows from your Google Forms sheet, or upload a CSV. Columns: Visit Date, Salesperson, Shop / Customer, Contact Person, Phone, Email, Product Discussed, Outcome, Stock Levels, Next Appointment, Potential Value, Comments.</p>
            <div className="sales-import-actions" style={{ marginTop: 12 }}>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
              <button className="panel-action-button" type="button" onClick={() => fileRef.current?.click()}><Upload size={14} /> Choose CSV File</button>
              <button className="panel-action-button" type="button" onClick={downloadTemplate}><Download size={14} /> Download Template</button>
            </div>
            <div className="external-import-box" style={{ marginTop: 12 }}>
              <label>Or paste CSV here<textarea rows={6} value={rawText} onChange={e => parse(e.target.value)} placeholder={template.split('\n')[0]} /></label>
            </div>
            {rows.length > 0 && <div className="crm-sheet-message" style={{ marginTop: 8 }}>{rows.length} rows parsed — ready to import.</div>}
            <div className="invoice-actions-row" style={{ marginTop: 12 }}>
              <button type="button" className="secondary-action" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="primary-action" disabled={busy || !rows.length} onClick={confirm}><CheckCircle2 size={14} /> {busy ? 'Importing...' : `Import ${rows.length} Visits`}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SalesTrendChart({ data, metric }) {
  return (
    <div className="sales-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ReLineChart data={data}>
          <CartesianGrid stroke="#eef0f3" />
          <XAxis dataKey="month" tick={{ fill: '#667085', fontSize: 12 }} />
          <YAxis tick={{ fill: '#667085', fontSize: 12 }} />
          <Tooltip formatter={value => typeof value === 'number' && value > 999 ? currency(value) : value} />
          <Line type="monotone" dataKey={metric} stroke="#050505" strokeWidth={3} dot={{ r: 4 }} />
        </ReLineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MultiMetricTrendChart({ data = [], metrics = [], compareData, compareLabel }) {
  const colors = ['#050505', '#175cd3', '#b42318', '#101828', '#7f56d9', '#f79009'];
  const compareColors = ['#a0a0a0', '#88b4e8', '#d99e9e', '#a0a0a0', '#c8a8e8', '#f8c878'];
  return (
    <div className="sales-chart multi-metric-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ReLineChart data={data}>
          <CartesianGrid stroke="#eef0f3" />
          <XAxis dataKey="month" tick={{ fill: '#667085', fontSize: 12 }} />
          <YAxis tick={{ fill: '#667085', fontSize: 12 }} />
          <Tooltip formatter={value => typeof value === 'number' && Math.abs(value) > 999 ? currency(value) : value} />
          {metrics.map((metric, index) => (
            <Line key={metric} type="monotone" dataKey={metric} stroke={colors[index % colors.length]} strokeWidth={2.4} dot={{ r: 3 }} />
          ))}
          {compareData && compareLabel && metrics.map((metric, index) => (
            <Line key={'c-' + metric} type="monotone" dataKey={'prev_' + metric} stroke={compareColors[index % compareColors.length]} strokeWidth={1.8} dot={{ r: 2 }} strokeDasharray="5 5" />
          ))}
        </ReLineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TeamPerformanceChart({ data, period = 'monthly', onPeriodChange }) {
  const [localPeriod, setLocalPeriod] = useState(period);
  const handlePeriod = p => { setLocalPeriod(p); onPeriodChange?.(p); };
  const colors = ['#050505', '#2563eb', '#101828', '#ffac33', '#f64e4e'];
  return (
    <div className="sales-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ReLineChart data={data}>
          <CartesianGrid stroke="#eef0f3" />
          <XAxis dataKey="month" tick={{ fill: '#667085', fontSize: 12 }} />
          <YAxis tick={{ fill: '#667085', fontSize: 12 }} />
          <Tooltip formatter={value => currency(value)} />
          {['john', 'mary', 'peter', 'susan', 'david'].map((rep, index) => <Line key={rep} type="monotone" dataKey={rep} stroke={colors[index]} strokeWidth={2.5} />)}
        </ReLineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SalesTeamTable({ rows, metric }) {
  return (
    <div className="team-comparison-table">
      {rows.map(row => (
        <article key={row.rep}>
          <strong>{row.rep}</strong>
          <span>Revenue {currency(row.revenue)} · Profit {currency(row.profit)} · {row.customers} customers</span>
          <b>{['revenue', 'profit', 'expenses', 'pipeline'].includes(metric) ? currency(row[metric]) : row[metric]}</b>
        </article>
      ))}
    </div>
  );
}

function SalesPipeline({ stages, leads }) {
  return (
    <div className="dashboard-grid">
      <Panel className="span-12" title="Pipeline Flow">
        <div className="pipeline-board">
          {stages.map(stage => (
            <article key={stage.stage}>
              <strong>{stage.stage}</strong>
              <b>{stage.count}</b>
              <span>{currency(stage.value)}</span>
            </article>
          ))}
        </div>
      </Panel>
      <Panel className="span-12" title="Open Opportunities">
        <SimpleTable rows={leads} columns={['name', 'company', 'stage', 'value', 'assignedTo']} />
      </Panel>
    </div>
  );
}

function QuotesWorkspace({ user, quotes, onDone, customers }) {
  const [busy, setBusy] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  async function act(quote, action) {
    setBusy(`${quote.id}-${action}`);
    setStatusMsg('');
    try {
      if (action === 'Send Quote') {
        const res = await rpc('sendQuotation', [user, quote.id]);
        setStatusMsg(res.emailSent ? `${quote.quoteNo} sent by email to customer` : `${quote.quoteNo} marked as Sent (no customer email)`);
      } else if (action === 'Convert To Order') {
        const res = await rpc('convertQuotationToSale', [user, quote.id]);
        setStatusMsg(`${quote.quoteNo} converted to Sale ${res.saleNo}`);
      } else if (action === 'Generate Invoice') {
        const res = await rpc('generateInvoiceFromQuote', [user, quote.id]);
        setStatusMsg(res.success ? `Invoice ${res.invoice.invNo} generated${res.emailSent ? ' and emailed' : ''}` : 'Could not generate invoice');
      } else if (action === 'Download PDF') {
        const res = await rpc('generateQuotePdf', [user, quote.id]);
        if (res.content) downloadBase64File(res);
        setStatusMsg(res.content ? 'Quote PDF downloaded' : 'PDF generation failed');
      } else       if (action === 'Email Quote') {
        const res = await rpc('sendQuoteEmail', [user, quote.id]);
        setStatusMsg(res.sent ? `Quote emailed to ${res.to}` : 'Email failed');
      } else if (action === 'Print') {
        const res = await rpc('generateQuotePdf', [user, quote.id]);
        if (res.content) openBase64File(res, true);
      } else if (action === 'WhatsApp') {
        const phone = prompt('Enter WhatsApp number (e.g. +254712345678):');
        if (!phone) { setBusy(''); return; }
        const msg = encodeURIComponent(`Quotation ${quote.quoteNo}\nCustomer: ${quote.customerName}\nTotal: KES ${quote.total?.toLocaleString()}\nStatus: ${quote.status}\n\nView at: https://erpftc.vercel.app/#/sales`);
        window.open(`https://wa.me/${phone.replace(/[^0-9+]/g, '')}?text=${msg}`, '_blank');
        setStatusMsg('WhatsApp opened');
      }
      onDone?.();
    } catch (e) {
      setStatusMsg(e.message || 'Action failed');
    } finally {
      setBusy('');
    }
  }
   return (
     <div>
      {quoteModalOpen && <QuotationModal user={user} customers={customers || quotes} onClose={() => setQuoteModalOpen(false)} onSaved={() => { setQuoteModalOpen(false); onDone?.(); }} />}
      <Panel title="Quotation Workflow">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 600, color: '#344054' }}>All Quotations</span>
          <button className="primary-action" onClick={() => setQuoteModalOpen(true)}><Plus size={14} /> New Quote</button>
        </div>
        {statusMsg && <div className="quote-status-msg">{statusMsg}</div>}
        <div className="quote-workflow">
          {quotes.map(quote => (
            <article key={quote.id}>
              <div>
                <strong>{quote.quoteNo}</strong>
                <span>{quote.customerName} · {quote.status} · {quote.conversionProbability}% probability</span>
              </div>
              <b>{currency(quote.total)}</b>
              <div className="quote-actions">
                {quote.status === 'Draft' && (
                  <>
                    <button onClick={() => act(quote, 'Download PDF')} disabled={busy === `${quote.id}-Download PDF`}>
                      {busy === `${quote.id}-Download PDF` ? 'Downloading...' : <><Download size={14} /> PDF</>}
                    </button>
                    <button onClick={() => act(quote, 'Email Quote')} disabled={busy === `${quote.id}-Email Quote`}>
                      {busy === `${quote.id}-Email Quote` ? 'Sending...' : <><Mail size={14} /> Email</>}
                    </button>
                    <button onClick={() => act(quote, 'Send Quote')} disabled={busy === `${quote.id}-Send Quote`}>
                      {busy === `${quote.id}-Send Quote` ? 'Sending...' : <><Send size={14} /> Send</>}
                    </button>
                  </>
                )}
                {quote.status === 'Sent' && (
                <>
                  <button onClick={() => act(quote, 'Convert To Order')} disabled={busy === `${quote.id}-Convert To Order`}>
                    {busy === `${quote.id}-Convert To Order` ? 'Converting...' : <><ArrowRight size={14} /> Convert</>}
                  </button>
                  <button onClick={() => act(quote, 'Download PDF')} disabled={busy === `${quote.id}-Download PDF`}><Download size={14} /> PDF</button>
                  <button onClick={() => act(quote, 'Email Quote')} disabled={busy === `${quote.id}-Email Quote`}><Mail size={14} /> Email</button>
                </>
              )}
              {quote.status === 'Converted' && (
                <>
                  <button onClick={() => act(quote, 'Generate Invoice')} disabled={busy === `${quote.id}-Generate Invoice`}>
                    {busy === `${quote.id}-Generate Invoice` ? 'Generating...' : <><FileText size={14} /> Invoice</>}
                  </button>
                  <button onClick={() => act(quote, 'Download PDF')} disabled={busy === `${quote.id}-Download PDF`}><Download size={14} /> PDF</button>
                </>
              )}
              {quote.status === 'Invoiced' && (
                <>
                  <span className="badge badge-success">Complete</span>
                  <button onClick={() => act(quote, 'Download PDF')} disabled={busy === `${quote.id}-Download PDF`}><Download size={14} /> PDF</button>
                </>
              )}
              <button onClick={() => act(quote, 'Print')} disabled={busy === `${quote.id}-Print`}><Printer size={14} /> Print</button>
              <button onClick={() => act(quote, 'WhatsApp')} disabled={busy === `${quote.id}-WhatsApp`}><Phone size={14} /> WhatsApp</button>
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ActionMenu({ actions = [], align = 'right', summary, quickActions = 0 }) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const usable = actions.filter(Boolean);
  const ref = useRef(null);
  const quick = quickActions > 0 ? usable.slice(0, quickActions) : [];
  const rest = quickActions > 0 ? usable.slice(quickActions) : usable;
  useEffect(() => {
    if (!open) return;
    setFocusedIndex(-1);
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', close);
    const onKey = e => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIndex(i => Math.min(i + 1, rest.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIndex(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && focusedIndex >= 0 && focusedIndex < rest.length) { e.preventDefault(); rest[focusedIndex]?.onClick?.(); setOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey); };
  }, [open, focusedIndex, rest]);
  if (!usable.length) return null;
  return (
    <div className="row-action-menu" ref={ref}>
      {quick.map(action => (
        <button key={action.label} className="row-quick-action" disabled={action.disabled} onClick={async e => { e.stopPropagation(); await action.onClick?.(); }} title={action.label}>
          {action.icon}
        </button>
      ))}
      {rest.length > 0 && (
        <>
          <button className="row-action-trigger" onClick={() => setOpen(v => !v)} aria-label="Row actions" title={summary || `${rest.length} actions`}>
            <MoreVertical size={16} />
          </button>
          {open && (
            <div className={`row-action-panel ${align}`}>
              {summary && <div className="row-action-summary">{summary}</div>}
              {rest.map((action, idx) => (
                <button
                  key={action.label}
                  type="button"
                  disabled={action.disabled}
                  className={focusedIndex === idx ? 'focused' : ''}
                  onClick={async event => {
                    event.preventDefault();
                    setOpen(false);
                    await action.onClick?.();
                  }}
                >
                  {action.icon}
                  <span>{action.label}</span>
                  {action.shortcut && <em className="action-shortcut">{action.shortcut}</em>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SalesOrdersWorkspace({ user, orders, deliveries, onDone }) {
  const [busy, setBusy] = useState('');
  async function setDeliveryStatus(order, status) {
    const deliveryId = order.deliveryId || deliveries.find(row => row.saleId === order.id || row.saleNo === order.saleNo)?.id;
    if (!deliveryId) return;
    setBusy(`${deliveryId}-${status}`);
    try {
      await rpc('updateSalesDeliveryStatus', [user, deliveryId, status]);
      onDone?.();
    } finally {
      setBusy('');
    }
  }
  async function toggleDelivery(order, checked) {
    const deliveryId = order.deliveryId || deliveries.find(row => row.saleId === order.id || row.saleNo === order.saleNo)?.id;
    if (!deliveryId) return;
    setBusy(deliveryId);
    try {
      await rpc('confirmSalesDelivery', [user, deliveryId, checked]);
      onDone?.();
    } finally {
      setBusy('');
    }
  }
  async function generateInvoice(order) {
    setBusy(`${order.id}-invoice`);
    try {
      await rpc('generateInvoiceFromSale', [user, order.id]);
      onDone?.();
    } finally {
      setBusy('');
    }
  }
  function actionsFor(order) {
    const summary = rowSummary(order);
    const deliveryId = order.deliveryId || deliveries.find(row => row.saleId === order.id || row.saleNo === order.saleNo)?.id;
    const liveStatus = order.liveStatus || '';
    return [
      { label: 'Mark Picked', icon: <ClipboardCheck size={15} />, disabled: !deliveryId || liveStatus === 'Delivered', onClick: () => setDeliveryStatus(order, 'Picked') },
      { label: 'Mark Dispatched', icon: <Truck size={15} />, disabled: !deliveryId || liveStatus === 'Delivered', onClick: () => setDeliveryStatus(order, 'Dispatched') },
      { label: liveStatus === 'Delivered' ? 'Unconfirm Delivery' : 'Confirm Delivered', icon: <CheckCircle2 size={15} />, disabled: !deliveryId, onClick: () => toggleDelivery(order, liveStatus !== 'Delivered') },
      { label: 'Generate Invoice', icon: <ReceiptText size={15} />, onClick: () => generateInvoice(order) },
      { label: 'Copy Details', icon: <FileText size={15} />, onClick: () => copyText(summary) },
      { label: 'Print Summary', icon: <Printer size={15} />, onClick: () => printText(order.saleNo || 'Sales Order', summary) }
    ];
  }
  return (
    <div className="dashboard-grid">
      <Panel className="span-12" title="Orders + Delivery Confirmation" action="Live Status">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Sale No</th><th>Customer</th><th>Total</th><th>Delivery</th><th>Confirmed Delivered</th><th /></tr></thead>
            <tbody>
              {orders.slice(0, 10).map(order => (
                <tr key={order.id}>
                  <td>{order.saleNo}</td>
                  <td>{order.customerName}</td>
                  <td>{currency(order.total)}</td>
                  <td>{formatCell(order.liveStatus, 'status')}</td>
                  <td>
                    <label className="check-cell">
                      <input type="checkbox" checked={Boolean(order.deliveredConfirmed || order.liveStatus === 'Delivered')} disabled={busy === order.deliveryId || !order.deliveryId} onChange={e => toggleDelivery(order, e.target.checked)} />
                      <span>{order.deliveryNo || 'No delivery'}</span>
                    </label>
                  </td>
                  <td><ActionMenu actions={actionsFor(order)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel className="span-12" title="Delivery Queue">
        <SimpleTable rows={deliveries} columns={['deliveryNo', 'saleNo', 'customerName', 'driver', 'vehicle', 'status']} />
      </Panel>
    </div>
  );
}

function NewSaleModal({ user, onClose, onSaved }) {
  const lookup = useServer(user, 'getLookupData');
  const [form, setForm] = useState({ customerId: '', customerName: '', customerEmail: '', customerPhone: '', productId: '', quantity: 1, paid: 0, paymentMethod: 'Credit', destination: '', deliveryMethod: 'Company Vehicle', driver: '', vehicle: '', notes: '' });
  const [saving, setSaving] = useState(false);
  if (lookup.loading) return <div className="modal-backdrop"><div className="modal-card"><Loader2 className="spin" /> Loading sale form...</div></div>;
  if (lookup.error) return <div className="modal-backdrop"><div className="modal-card">Unable to load sale form: {lookup.error}</div></div>;
  const products = lookup.data.products || [];
  const customers = lookup.data.customers || [];
  const selectedProduct = products.find(p => p.id === form.productId) || products[0] || {};
  const selectedQty = num(form.quantity || 1);
  const selectedPrice = num(selectedProduct.price || 0);
  const selectedCost = num(selectedProduct.cost || 0);
  const selectedStock = num(selectedProduct.stock || 0);
  const projectedSubtotal = Math.round(selectedQty * selectedPrice);
  const projectedVat = Math.round(projectedSubtotal * 0.16);
  const projectedTotal = projectedSubtotal + projectedVat;
  const stockWarning = selectedProduct.id && selectedStock < selectedQty;
  const lowStockWarning = selectedProduct.id && !stockWarning && selectedStock - selectedQty <= num(selectedProduct.minStock || 0);
  async function saveOrder(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const matched = customers.find(c => c.id === form.customerId || String(c.name || '').toLowerCase() === String(form.customerName || '').trim().toLowerCase());
      await rpc('createSalesOrder', [user, { ...form, customerId: matched?.id || form.customerId, customerName: form.customerName || matched?.name, productId: form.productId || selectedProduct.id, unitPrice: selectedProduct.price }]);
      onSaved?.();
    } catch (error) {
      alert(error.message || 'Could not create sales order');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={saveOrder}>
        <header><h2>New Sales Order</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <label>Customer / Company Name<input list="sales-customers" value={form.customerName} onChange={e => {
          const match = customers.find(c => String(c.name || '').toLowerCase() === e.target.value.trim().toLowerCase());
          setForm({ ...form, customerName: e.target.value, customerId: match?.id || '', customerEmail: match?.email || form.customerEmail, customerPhone: match?.phone || form.customerPhone, destination: match?.city || form.destination });
        }} placeholder="Type company or customer name" required /></label>
        <datalist id="sales-customers">{customers.map(c => <option key={c.id} value={c.name}>{c.phone || c.email || ''}</option>)}</datalist>
        <div className="modal-grid">
          <label>Customer Email<input type="email" value={form.customerEmail} onChange={e => setForm({ ...form, customerEmail: e.target.value })} placeholder="Optional for invoice email" /></label>
          <label>Customer Phone<input value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} placeholder="Optional" /></label>
        </div>
        <label>Product<select value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })} required><option value="">Select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} - {currency(p.price)} - stock {num(p.stock).toLocaleString()}</option>)}</select></label>
        {selectedProduct.id && (
          <div className={`sales-order-pricing ${stockWarning ? 'danger' : lowStockWarning ? 'warn' : ''}`}>
            <article><span>Unit Price</span><strong>{currency(selectedPrice)}</strong></article>
            <article><span>Available Stock</span><strong>{selectedStock.toLocaleString()} {selectedProduct.unit || ''}</strong></article>
            <article><span>Margin</span><strong>{selectedPrice ? Math.round(((selectedPrice - selectedCost) / selectedPrice) * 100) : 0}%</strong></article>
            <article><span>Order Total</span><strong>{currency(projectedTotal)}</strong></article>
            {stockWarning && <p>Insufficient stock. Reduce quantity or restock before confirming.</p>}
            {lowStockWarning && <p>This order will push stock close to reorder level.</p>}
          </div>
        )}
        <div className="modal-grid">
          <label>Quantity<input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></label>
          <label>Paid<input type="number" min="0" value={form.paid} onChange={e => setForm({ ...form, paid: e.target.value })} /></label>
        </div>
        <div className="modal-grid">
          <label>Driver<input value={form.driver} onChange={e => setForm({ ...form, driver: e.target.value })} placeholder="Optional" /></label>
          <label>Vehicle<input value={form.vehicle} onChange={e => setForm({ ...form, vehicle: e.target.value })} placeholder="Optional" /></label>
        </div>
        <div className="modal-grid">
          <label>Delivery Destination<input value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} placeholder="Customer location / branch" /></label>
          <label>Delivery Method<select value={form.deliveryMethod} onChange={e => setForm({ ...form, deliveryMethod: e.target.value })}>{['Company Vehicle', 'Courier', 'Pickup', 'Motorbike', 'Third-party Transport'].map(x => <option key={x}>{x}</option>)}</select></label>
        </div>
        <label>Delivery Notes<input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Special handling, contact person, receiving notes..." /></label>
        <button className="primary-action" disabled={saving || stockWarning}>{saving ? 'Creating...' : stockWarning ? 'Insufficient Stock' : 'Create Order + Delivery'}</button>
      </form>
    </div>
  );
}

function TeamWorkspace({ data, metric }) {
  return (
    <div className="dashboard-grid">
      <Panel className="span-12 sales-main-chart" title="Sales Team Performance Over Time" action="Revenue">
        <TeamPerformanceChart data={data.teamPerformance} />
      </Panel>
      <Panel className="span-12" title="Rep Comparison">
        <SalesTeamTable rows={data.teamComparison} metric={metric} />
      </Panel>
    </div>
  );
}

function TerritoryWorkspace({ territory, county, setSelectedCounty }) {
  return (
    <div className="dashboard-grid">
      <Panel className="span-7" title="Kenya Territory Coverage" action="47 Counties">
        <CountyMap counties={territory.counties} selected={county.name} onSelect={setSelectedCounty} />
      </Panel>
      <Panel className="span-5" title={`${county.name} County Details`} action="Drawer">
        <CountyProfile county={county} />
      </Panel>
      <Panel className="span-6" title="County Performance">
        <SimpleTable rows={territory.counties} columns={['name', 'revenue', 'profit', 'visits', 'orders', 'quotations']} />
      </Panel>
      <Panel className="span-6" title="Visit Tracking & Routes">
        <VisitTimeline visits={territory.visits} />
      </Panel>
    </div>
  );
}

function SalesReports({ reports, user }) {
  const [filters, setFilters] = useState(() => ({ ...defaultReportDates(), module: 'Sales' }));
  async function exportReport(report, format) {
    const file = await rpc('generateReportExport', [user, { ...filters, module: 'Sales', reportName: report.name }, format]);
    handleGeneratedFile(file, format);
  }
  return (
    <Panel title="Sales Reports" action="Generate">
      <ReportDateControls filters={filters} setFilters={setFilters} />
      <div className="sales-report-grid">
        {reports.map(report => (
          <article key={report.name}>
            <strong>{report.name}</strong>
            <span>{filters.startDate} to {filters.endDate} · {report.records} records</span>
            <b>{currency(report.value)}</b>
            <ExportFormatStrip formats={report.exports || REPORT_FORMATS} onExport={format => exportReport(report, format)} />
          </article>
        ))}
      </div>
    </Panel>
  );
}

function SalesAnalytics({ analytics }) {
  return (
    <div className="dashboard-grid">
      <Panel className="span-6" title="Revenue Trend"><SalesTrendChart data={analytics.revenueTrend} metric="revenue" /></Panel>
      <Panel className="span-6" title="Profit Trend"><SalesTrendChart data={analytics.revenueTrend} metric="profit" /></Panel>
      <Panel className="span-6" title="Territory Comparison"><SimpleTable rows={analytics.territoryComparison} columns={['county', 'revenue', 'profit', 'visits']} /></Panel>
      <Panel className="span-6" title="Product Comparison"><SimpleTable rows={analytics.productComparison} columns={['product', 'revenue', 'profit', 'quantity']} /></Panel>
      <Panel className="span-6" title="Customer Growth"><SalesTrendChart data={analytics.customerGrowth} metric="customers" /></Panel>
      <Panel className="span-6" title="Quotation Conversion"><SalesTrendChart data={analytics.quotationConversion} metric="conversion" /></Panel>
      <Panel className="span-6" title="Pipeline Value"><SalesTrendChart data={analytics.pipelineValue} metric="pipeline" /></Panel>
      <Panel className="span-6" title="Forecast"><SalesTrendChart data={analytics.forecast} metric="forecast" /></Panel>
    </div>
  );
}

function SalesAi({ insights }) {
  return (
    <Panel title="Sales AI">
      <div className="ai-insights">
        {insights.map(item => (
          <article key={item.title}>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
            <span>Sources: sales workspace, orders, invoices, territory, pipeline</span>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function CountyMap({ counties, selected, onSelect }) {
  return (
    <div className="kenya-map">
      <div className="map-legend">
        <span className="green">Actively covered</span>
        <span className="yellow">Low activity</span>
        <span className="red">Neglected territory</span>
      </div>
      <div className="county-grid">
        {counties.map(county => (
          <button key={county.name} className={`${county.color} ${selected === county.name ? 'selected' : ''}`} onClick={() => onSelect(county.name)} title={`${county.name}: score ${county.score}`}>
            <strong>{county.name}</strong>
            <span>{county.score}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CountyProfile({ county }) {
  const stats = [
    ['Revenue', currency(county.revenue)],
    ['Customers', county.customers],
    ['Active Customers', county.activeCustomers],
    ['Dormant Customers', county.dormantCustomers],
    ['Prospects', county.prospects],
    ['Visits', county.visits],
    ['Orders', county.orders],
    ['Quotations', county.quotations],
    ['Pipeline', currency(county.pipeline)],
    ['Profit', currency(county.profit)]
  ];
  return (
    <div className="county-profile">
      <div className={`county-score ${county.color}`}>
        <strong>{county.score}</strong>
        <span>Performance score</span>
      </div>
      <div className="metric-stack compact">
        {stats.map(([labelText, value]) => <div key={labelText}><span>{labelText}</span><strong>{value}</strong></div>)}
      </div>
      <div className="county-products">
        <span>Top Products</span>
        <p>{county.topProducts.filter(Boolean).join(', ') || 'No product movement yet'}</p>
        <span>Sales Rep</span>
        <p>{county.salesRep}</p>
      </div>
    </div>
  );
}

function RepComparison({ reps }) {
  return (
    <div className="rep-comparison">
      {reps.map(rep => (
        <article key={rep.salesRepId}>
          <div>
            <strong>{rep.name}</strong>
            <span>{rep.countiesCovered} counties · {rep.visits} visits · {rep.orders} orders</span>
          </div>
          <b>{currency(rep.revenue)}</b>
          <em>ROI {rep.roi}x</em>
        </article>
      ))}
    </div>
  );
}

function VisitTimeline({ visits }) {
  return (
    <div className="visit-timeline">
      {visits.map(visit => (
        <article key={visit.id}>
          <MapPin size={18} />
          <div>
            <strong>{visit.county} · {visit.customerName}</strong>
            <span>{visit.salesRepName} checked in {visit.visitStart}, out {visit.visitEnd} · {visit.durationMinutes} min</span>
            <em>{visit.outcome}</em>
          </div>
        </article>
      ))}
    </div>
  );
}

function OpportunityList({ opportunities }) {
  return (
    <div className="opportunity-list">
      {opportunities.map(item => (
        <article key={item.county}>
          <div>
            <strong>{item.county}</strong>
            <span>{item.currentCustomers} current / {item.potentialCustomers} potential customers</span>
          </div>
          <b>{item.coverage}% coverage</b>
          <em>{item.recommendation}</em>
        </article>
      ))}
    </div>
  );
}

function RouteList({ routes }) {
  return (
    <div className="route-list">
      {routes.map(route => (
        <article key={route.id}>
          <Navigation size={18} />
          <div>
            <strong>{route.salesRepName}</strong>
            <span>{route.counties.join(' -> ')}</span>
          </div>
          <b>{route.distanceKm} km</b>
        </article>
      ))}
    </div>
  );
}

function Manufacturing({ user, setPage, globalPeriod }) {
  const tabs = ['dashboard', 'materials', 'packaging', 'formulas', 'orders', 'production', 'consumption', 'traceability', 'quality', 'waste', 'costs', 'capacity', 'calendar', 'downtime', 'reports', 'ai'];
  const [view, setView] = useRouteTab('production', tabs, 'dashboard');
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [newMaterialOpen, setNewMaterialOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [bomOpen, setBomOpen] = useState(false);
  const [bomEdit, setBomEdit] = useState(null);
  const [materialEdit, setMaterialEdit] = useState(null);
  const [execOrder, setExecOrder] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { loading, data, error } = useServer(user, 'getManufacturingWorkspaceData', [{ period: globalPeriod }], [refreshKey, globalPeriod]);
  if (loading) return <Loading title="Manufacturing" />;
  if (error) return <ErrorState title="Manufacturing" error={error} />;
  const refresh = () => setRefreshKey(x => x + 1);
  const products = Array.isArray(data?.products) ? data.products.filter(Boolean) : [];
  // Sort all manufacturing data newest-to-oldest by date
  const sorted = {
    orders: sortByDateDesc(data?.orders, 'createdAt'),
    rawMaterials: sortByDateDesc(data?.rawMaterials, 'createdAt'),
    rawMaterialBatches: sortByDateDesc(data?.rawMaterialBatches, 'receivedDate'),
    formulas: sortByDateDesc(data?.formulas, 'createdAt'),
    formulaVersions: sortByDateDesc(data?.formulaVersions, 'createdAt'),
    bomVersionHistory: sortByDateDesc(data?.bomVersionHistory, 'timestamp'),
    productionBatches: sortByDateDesc(data?.productionBatches, 'productionDate'),
    consumption: sortByDateDesc(data?.consumption, 'date'),
    storageHistory: sortByDateDesc(data?.storageHistory, 'dateProduced'),
    qualityChecks: sortByDateDesc(data?.qualityChecks, 'date'),
    qualityControlRecords: sortByDateDesc(data?.qualityControlRecords, 'date'),
    wasteRecords: sortByDateDesc(data?.wasteRecords, 'date'),
    yieldRecords: sortByDateDesc(data?.yieldRecords, 'date'),
    inventoryTransactions: sortByDateDesc(data?.inventoryTransactions, 'date'),
    costRecords: sortByDateDesc(data?.costRecords || data?.productionBatchCosts, 'date'),
    downtime: sortByDateDesc(data?.downtime, 'date'),
    capacity: data?.capacity || [],
    calendar: data?.calendar || [],
    traceability: sortByDateDesc(data?.traceability, 'date'),
    health: data?.health || [],
    reorderSuggestions: data?.reorderSuggestions || [],
    packagingMaterials: data?.packagingMaterials || [],
    directMaterials: data?.directMaterials || [],
    consumables: data?.consumables || [],
    reports: data?.reports || [],
    ai: data?.ai || [],
    documents: data?.documents || [],
    recalls: data?.recalls || [],
    uoms: data?.uoms || [],
    conversions: data?.conversions || []
  };

  async function startOrder(id) {
    await rpc('startProductionOrder', [user, id]);
    refresh();
  }
  async function completeOrder(order) {
    setExecOrder(order);
  }
  async function openBOMEdit(formula) {
    if (!formula?.id || !formula?.productId) return;
    const items = (sorted.formulaVersions || []).filter(Boolean).filter(v => v?.formulaId === formula.id && v?.version === formula.activeVersion).map(v => ({
      rawMaterialId: v?.rawMaterialId || v?.materialId || '',
      quantity: v?.quantity ?? 1,
      unit: v?.unit || 'KG',
      wastePercent: v?.wastePercent || 0,
      notes: v?.notes || ''
    }));
    setBomEdit({ ...formula, items });
    setBomOpen(true);
  }
  function viewOrder(order) {
    if (!order?.id) return;
    alert(`Order: ${order.orderNo || order.id}\nProduct: ${order.productName || '—'}\nQty: ${order.plannedQty || 0} ${order.outputUnit || ''}\nStatus: ${order.status || '—'}\nOperator: ${order.operator || '—'}`);
  }

  return (
    <section className="page-stack manufacturing-workspace">
      <div className="sales-hero manufacturing-hero">
        <div>
          <span>Manufacturing v2 · ERP-Grade Formula Management + Cost Control</span>
          <h1>Production Ecosystem</h1>
          <p>Enterprise manufacturing with versioned BOMs, production validation, cost breakdown, quality control, waste tracking, batch traceability, and full inventory integration.</p>
        </div>
        <div className="sales-hero-stats">
          <strong>{data.overview.openOrders}</strong><span>Open Orders</span>
          <strong>{data.overview.manufacturingScore}%</strong><span>Health</span>
          <strong>{data.overview.actualOutput}</strong><span>Produced</span>
          <strong>{data.overview.avgYield}%</strong><span>Avg Yield</span>
          <strong>{data.overview.qcPending}</strong><span>QC Pending</span>
        </div>
      </div>

      <div className="inline-actions">
        <button onClick={() => { setMaterialEdit(null); setNewMaterialOpen(true); }}><Plus size={16} /> New Raw Material</button>
        <button onClick={() => setReceiveOpen(true)}><Package size={16} /> Receive Material</button>
        <button onClick={() => { setBomEdit(null); setBomOpen(true); }}><Plus size={16} /> New Formula</button>
        <button onClick={() => setOrderOpen(true)}><Factory size={16} /> New Production Order</button>
        <button onClick={() => setView('traceability')}><Route size={16} /> Traceability</button>
        <button onClick={() => setView('reports')}><FileText size={16} /> Reports</button>
        <CreateRequisitionButton user={user} module="production" />
      </div>

      <div className="manufacturing-conversion">
        <article><span>Automatic UOM Conversion</span><strong>{data.conversionExample.input} = {Number(data.conversionExample.storedBase).toLocaleString()} {data.conversionExample.baseUnit}</strong><em>Consumes {data.conversionExample.consumed}; remaining {Number(data.conversionExample.remainingBase).toLocaleString()} {data.conversionExample.baseUnit}</em></article>
        <article><span>Material Locking</span><strong>{Number(data.overview.reservedMaterial).toLocaleString()} base units reserved</strong><em>Production start reserves material before completion can consume it.</em></article>
        <article><span>Consumed History</span><strong>{Number(data.overview.consumedMaterial).toLocaleString()} base units consumed</strong><em>Consumption rows are immutable traceability records.</em></article>
      </div>

      <div className="manufacturing-input-console">
        <article>
          <span>Raw Material Intake</span>
          <strong>{(data?.rawMaterials || []).length} materials / {(data?.rawMaterialBatches || []).length} batches</strong>
          <p>Receive kilograms, grams, litres, pieces, cartons, and batches with automatic base-unit conversion.</p>
          <button onClick={() => setReceiveOpen(true)}><Plus size={16} /> Add Raw Material Receipt</button>
        </article>
        <article>
          <span>Formula Management</span>
          <strong>{(data.formulas || []).length} formulas / {(data.formulaVersions || []).length} versions</strong>
          <p>Version-controlled BOMs with draft, approve, archive, duplicate, and new version workflows.</p>
          <button onClick={() => { setBomEdit(null); setBomOpen(true); }}><Plus size={16} /> Build Formula</button>
        </article>
        <article>
          <span>Production Execution</span>
          <strong>{(data?.orders || []).length} orders</strong>
          <p>Validated production with auto-deduct, cost breakdown, QC checks, and batch traceability.</p>
          <button onClick={() => setOrderOpen(true)}><Factory size={16} /> Create Order</button>
        </article>
      </div>

      <div className="sales-tabs">
        {tabs.map(tab => <button key={tab} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}>{label(tab)}</button>)}
      </div>

      {view === 'dashboard' && (
        <>
          <div className="control-grid">
            <KpiCard icon={Warehouse} label="Raw Available" value={Number(data.overview.rawMaterialAvailable).toLocaleString()} change={8} tone="green" />
            <KpiCard icon={ClipboardCheck} label="Reserved" value={Number(data.overview.reservedMaterial).toLocaleString()} change={4} tone="blue" />
            <KpiCard icon={Factory} label="Planned Output" value={Number(data.overview.plannedOutput).toLocaleString()} change={6} tone="blue" />
            <KpiCard icon={CheckCircle2} label="Actual Output" value={Number(data.overview.actualOutput).toLocaleString()} change={9} tone="green" />
            <KpiCard icon={AlertTriangle} label="Waste" value={Number(data.overview.waste).toLocaleString()} change={-2} tone="red" />
            <KpiCard icon={Gauge} label="Mfg Score" value={`${data.overview.manufacturingScore}%`} change={5} tone="green" />
            <KpiCard icon={CircleDollarSign} label="Material Cost" value={currency(data.overview.totalMaterialCost)} change={3} tone="blue" />
            <KpiCard icon={LineChart} label="Avg Yield" value={`${data.overview.avgYield}%`} change={2} tone="green" />
            <KpiCard icon={Package} label="Packaging Items" value={Number(data.overview.packagingMaterialsCount).toLocaleString()} change={1} tone="blue" />
            <KpiCard icon={Bell} label="Low Stock" value={Number(data.overview.lowMaterialCount).toLocaleString()} change={-5} tone="red" />
            <KpiCard icon={Hourglass} label="Pending QC" value={Number(data.overview.qcPending).toLocaleString()} change={0} tone="blue" />
            <KpiCard icon={BarChart3} label="Reorder Suggestions" value={Number(data.overview.reorderSuggestions).toLocaleString()} change={0} tone="blue" />
          </div>
          <div className="dashboard-grid">
            <Panel className="span-6" title="Manufacturing Health Score"><SimpleTable rows={sorted.health} columns={['material', 'availability', 'quality', 'demand', 'score', 'status']} /></Panel>
            <Panel className="span-6" title="Production Orders"><ProductionOrderList orders={sorted.orders} onStart={startOrder} onComplete={completeOrder} /></Panel>
            <Panel className="span-6" title="Reorder Suggestions"><SimpleTable rows={sorted.reorderSuggestions} columns={['materialName', 'materialCode', 'currentStock', 'reorderLevel', 'suggestedOrderQty', 'supplier', 'leadTime', 'unitCost']} /></Panel>
            <Panel className="span-6" title="Production Intelligence"><SimpleTable rows={sorted.ai} columns={['title', 'detail']} /></Panel>
            <Panel className="span-6" title="Raw Material Storage"><SimpleTable rows={sorted.rawMaterials} columns={['materialCode', 'materialName', 'category', 'unitOfMeasure', 'currentQuantity', 'availableQuantity', 'reservedQuantity', 'consumedQuantity', 'supplier', 'costPerUnit', 'warehouse', 'binLocation', 'status']} /></Panel>
            <Panel className="span-6" title="Capacity Planning"><SimpleTable rows={sorted.capacity} columns={['resource', 'type', 'dailyCapacity', 'scheduled', 'available', 'unit', 'status']} /></Panel>
            <Panel className="span-6" title="OEE (Overall Equipment Effectiveness)"><div className="metric-stack">
              <div><span>Availability</span><strong>{Math.round((num(data.overview.actualOutput) / Math.max(1, num(data.overview.plannedOutput))) * 100)}%</strong><em>Actual vs Planned output</em></div>
              <div><span>Performance</span><strong>{data.overview.avgYield || 85}%</strong><em>Average yield rate</em></div>
              <div><span>Quality</span><strong>{Math.round(100 - num(data.overview.waste) / Math.max(1, num(data.overview.actualOutput)) * 100)}%</strong><em>Good vs total output</em></div>
              <div><span>OEE Score</span><strong>{Math.round((num(data.overview.actualOutput) / Math.max(1, num(data.overview.plannedOutput))) * (data.overview.avgYield || 85) / 100 * (100 - num(data.overview.waste) / Math.max(1, num(data.overview.actualOutput)) * 100) / 100)}%</strong><em>Combined efficiency</em></div>
            </div></Panel>
            <Panel className="span-6" title="Production Variance"><div className="metric-stack">
              <div><span>Planned Output</span><strong>{Number(data.overview.plannedOutput).toLocaleString()}</strong><em>Target units</em></div>
              <div><span>Actual Output</span><strong>{Number(data.overview.actualOutput).toLocaleString()}</strong><em>Completed units</em></div>
              <div><span>Volume Variance</span><strong>{currency((num(data.overview.actualOutput) - num(data.overview.plannedOutput)) * num(data.overview.totalMaterialCost) / Math.max(1, num(data.overview.actualOutput)))}</strong><em>Over/under production cost</em></div>
              <div><span>Waste Cost</span><strong>{currency(num(data.overview.waste) * num(data.overview.totalMaterialCost) / Math.max(1, num(data.overview.actualOutput)))}</strong><em>Scrap value lost</em></div>
            </div></Panel>
          </div>
        </>
      )}
      {view === 'materials' && (
        <Panel title="Raw Material Storage Records" action={<button className="mini-action" onClick={() => { setMaterialEdit(null); setReceiveOpen(true); }}><Plus size={15} /> New Material</button>}>
          <SimpleTable rows={sorted.rawMaterials} columns={['materialCode', 'materialName', 'category', 'unitOfMeasure', 'currentQuantity', 'availableQuantity', 'reservedQuantity', 'consumedQuantity', 'supplier', 'costPerUnit', 'warehouse', 'binLocation', 'expiryDate', 'status']} />
        </Panel>
      )}
      {view === 'packaging' && (
        <Panel title="Packaging Materials" action={<button className="mini-action" onClick={() => { setMaterialEdit(null); setReceiveOpen(true); }}><Plus size={15} /> Add Packaging</button>}>
          <SimpleTable rows={sorted.packagingMaterials} columns={['materialCode', 'materialName', 'category', 'unitOfMeasure', 'currentQuantity', 'availableQuantity', 'reservedQuantity', 'consumedQuantity', 'supplier', 'costPerUnit', 'warehouse', 'binLocation', 'status']} />
        </Panel>
      )}
      {view === 'formulas' && (
        <div className="dashboard-grid">
          <Panel className="span-5" title="Product Formulas" action={<button className="mini-action" onClick={() => { setBomEdit(null); setBomOpen(true); }}><Plus size={15} /> New Formula</button>}>
            <SimpleTable rows={sorted.formulas} columns={['productName', 'formulaName', 'activeVersion', 'outputQuantity', 'outputUnit', 'approvalStatus', 'status', 'totalEstimatedCost']} onRowClick={openBOMEdit} />
          </Panel>
          <Panel className="span-7" title="Formula Version Materials">
            <SimpleTable rows={sorted.formulaVersions} columns={['formulaId', 'version', 'materialName', 'materialCategory', 'quantity', 'unit', 'wastePercent', 'status']} />
          </Panel>
          <Panel className="span-12" title="Formula Version History">
            <SimpleTable rows={sorted.bomVersionHistory} columns={['formulaId', 'version', 'action', 'user', 'timestamp', 'itemCount']} />
          </Panel>
        </div>
      )}
      {view === 'orders' && (
        <Panel title="Production Orders" action={<button className="mini-action" onClick={() => setOrderOpen(true)}><Plus size={15} /> New Order</button>}>
          <ProductionOrderList orders={sorted.orders} onStart={startOrder} onComplete={completeOrder} onEdit={viewOrder} />
        </Panel>
      )}
      {view === 'production' && (
        <div className="dashboard-grid">
          <Panel className="span-6" title="In Production"><SimpleTable rows={sorted.orders.filter(o => o.status === 'In Production')} columns={['orderNo', 'productName', 'plannedQty', 'completedQty', 'operator', 'startedAt', 'status']} /></Panel>
          <Panel className="span-6" title="Pending Orders"><SimpleTable rows={sorted.orders.filter(o => o.status === 'Pending')} columns={['orderNo', 'productName', 'plannedQty', 'operator', 'startDate', 'status']} /></Panel>
          <Panel className="span-12" title="Inventory Transactions"><SimpleTable rows={sorted.inventoryTransactions} columns={['date', 'transactionType', 'productName', 'batchNo', 'quantity', 'unit', 'warehouse', 'reference', 'createdBy']} /></Panel>
        </div>
      )}
      {view === 'consumption' && <Panel title="Raw Material Consumption History"><SimpleTable rows={sorted.consumption} columns={['productionOrder', 'materialName', 'batchNumber', 'quantityConsumed', 'unit', 'operator', 'date', 'costConsumed', 'immutable']} /></Panel>}
      {view === 'traceability' && (
        <div className="dashboard-grid">
          <Panel className="span-6" title="Batch Material Traceability"><SimpleTable rows={sorted.traceability} columns={['productionOrder', 'material', 'batchUsed', 'quantityConsumed', 'unit', 'operator', 'date', 'costConsumed']} /></Panel>
          <Panel className="span-6" title="Production Storage History"><SimpleTable rows={sorted.storageHistory} columns={['batchNo', 'productName', 'quantityProduced', 'dateProduced', 'costProduced', 'operator', 'qualityCheck', 'packagingEvent', 'inventoryTransfer', 'saleStatus']} /></Panel>
          <Panel className="span-12" title="Full Batch Traceability"><SimpleTable rows={sorted.productionBatches} columns={['batchNo', 'productName', 'quantityProduced', 'wasteQuantity', 'productionDate', 'operator', 'qualityStatus', 'productionCost', 'costPerUnit', 'salesRevenue', 'profit', 'profitMargin', 'status']} /></Panel>
        </div>
      )}
      {view === 'quality' && (
        <div className="dashboard-grid">
          <Panel className="span-6" title="Quality Control Records"><SimpleTable rows={sorted.qualityControlRecords} columns={['batchNo', 'productName', 'inspector', 'status', 'date', 'notes']} /></Panel>
          <Panel className="span-6" title="QC Checks Summary"><SimpleTable rows={sorted.qualityChecks} columns={['batchNo', 'productName', 'parameter', 'result', 'inspector', 'date', 'status']} /></Panel>
          <Panel className="span-12" title="QC Status by Batch"><SimpleTable rows={sorted.productionBatches} columns={['batchNo', 'productName', 'quantityProduced', 'qualityStatus', 'packagingStatus', 'inventoryTransfer', 'saleStatus']} /></Panel>
        </div>
      )}
      {view === 'waste' && (
        <div className="dashboard-grid">
          <Panel className="span-6" title="Waste Records"><SimpleTable rows={sorted.wasteRecords} columns={['batchNo', 'productName', 'expectedWaste', 'actualWaste', 'yieldPercent', 'lossPercent', 'recordedBy', 'date']} /></Panel>
          <Panel className="span-6" title="Yield Analysis"><SimpleTable rows={sorted.yieldRecords} columns={['batchNo', 'plannedQty', 'actualQty', 'wasteQty', 'yieldPercent', 'lossPercent']} /></Panel>
          <Panel className="span-12" title="Production Batches with Waste"><SimpleTable rows={sorted.productionBatches} columns={['batchNo', 'productName', 'quantityProduced', 'wasteQuantity', 'productionDate', 'operator', 'qualityStatus', 'status']} /></Panel>
        </div>
      )}
      {view === 'costs' && (
        <div className="dashboard-grid">
          <Panel className="span-6" title="Production Cost Breakdown"><SimpleTable rows={sorted.costRecords} columns={['batchNo', 'materialCost', 'packagingCost', 'consumableCost', 'laborCost', 'overheadCost', 'machineCost', 'utilityCost', 'totalCost', 'costPerUnit']} /></Panel>
          <Panel className="span-6" title="Manufacturing Profitability"><SimpleTable rows={sorted.productionBatches} columns={['batchNo', 'productName', 'quantityProduced', 'productionCost', 'salesRevenue', 'profit', 'profitMargin', 'suggestedSellingPrice', 'grossMargin']} /></Panel>
          <Panel className="span-12" title="Cost Analysis by Order"><SimpleTable rows={sorted.orders.filter(o => o.status === 'Completed')} columns={['orderNo', 'productName', 'plannedQty', 'completedQty', 'materialCost', 'packagingCost', 'laborCost', 'overheadCost', 'machineCost', 'utilityCost', 'totalActualCost', 'costPerUnit', 'grossMargin']} /></Panel>
        </div>
      )}
      {view === 'capacity' && <Panel title="Machine, Employee, Warehouse Capacity"><SimpleTable rows={sorted.capacity} columns={['resource', 'type', 'dailyCapacity', 'scheduled', 'available', 'unit', 'status']} /></Panel>}
      {view === 'calendar' && <Panel title="Production Calendar"><SimpleTable rows={sorted.calendar} columns={['period', 'plannedOrders', 'plannedOutput', 'status']} /></Panel>}
      {view === 'downtime' && <Panel title="Production Downtime"><SimpleTable rows={sorted.downtime} columns={['orderNo', 'reason', 'minutes', 'operator', 'date', 'impact']} /></Panel>}
      {view === 'reports' && <InventoryReports reports={data.reports} user={user} module="Manufacturing" />}
      {view === 'ai' && <ManufacturingAi insights={data.ai} />}

      {newMaterialOpen && <RawMaterialSetupModal user={user} material={materialEdit} onClose={() => setNewMaterialOpen(false)} onSaved={() => { setNewMaterialOpen(false); refresh(); setView('materials'); }} rpc={rpc} />}
      {receiveOpen && <ReceiveMaterialModal user={user} materials={sorted.rawMaterials} uoms={sorted.uoms} onClose={() => setReceiveOpen(false)} onSaved={() => { setReceiveOpen(false); refresh(); setView('batches'); }} rpc={rpc} />}
      {bomOpen && <BOMSetupModal user={user} products={products} rawMaterials={sorted.rawMaterials} formula={bomEdit} onClose={() => setBomOpen(false)} onSaved={() => { setBomOpen(false); refresh(); setView('formulas'); }} rpc={rpc} />}
      {orderOpen && <ProductionOrderModal user={user} formulas={sorted.formulas} rawMaterials={sorted.rawMaterials} formulaVersions={sorted.formulaVersions} onClose={() => setOrderOpen(false)} onSaved={() => { setOrderOpen(false); refresh(); setView('orders'); }} />}
      {execOrder && <ProductionExecutionModal user={user} order={execOrder} rawMaterials={sorted.rawMaterials} formulas={sorted.formulas} formulaVersions={sorted.formulaVersions} onClose={() => setExecOrder(null)} onSaved={() => { setExecOrder(null); refresh(); setView('traceability'); }} rpc={rpc} />}
    </section>
  );
}

function ProductionOrderList({ orders, onStart, onComplete, onEdit }) {
  const safeOrders = (orders || []).filter(Boolean);
  return (
    <div className="production-order-list">
      {safeOrders.map((order, i) => (
        <article key={order?.id ?? i}>
          <div><strong>{order?.orderNo || '—'} · {order?.productName || '—'}</strong><span>{order?.plannedQty ?? 0} {order?.outputUnit || ''} · {order?.formulaVersion || '—'} · {order?.operator || '—'}</span></div>
          <b className={`status-${order?.status?.toLowerCase().replace(' ', '-') || 'pending'}`}>{order?.status || 'Pending'}</b>
          <div className="order-actions">
            {order?.status === 'Pending' && <button onClick={() => onStart?.(order?.id)}>Start</button>}
            {order?.status === 'In Production' && <button onClick={() => onComplete?.(order)}>Execute</button>}
            {order?.status === 'Completed' && <button onClick={() => onEdit?.(order)}>View</button>}
          </div>
        </article>
      ))}
      {safeOrders.length === 0 && <div className="quiet-state">No production orders</div>}
    </div>
  );
}

function RawMaterialModal({ user, materials, uoms, onClose, onSaved }) {
  const safeMaterials = (materials || []).filter(Boolean);
  const first = safeMaterials[0] || {};
  const [form, setForm] = useState({ materialName: first?.materialName || 'Maize Bran', materialCode: first?.materialCode || 'RM-NEW', category: 'Raw Material', quantity: 500, unit: 'KG', costPerUnit: 1.8, supplier: 'Unga Millers Ltd', warehouse: 'Raw Materials Store', storageLocation: 'A1', expiryDate: '2027-01-01' });
  const [saving, setSaving] = useState(false);
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('receiveRawMaterial', [user, form]);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={save}>
        <header><h2>Receive Raw Material</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="modal-grid">
          <label>Material Name<input value={form.materialName} onChange={e => setForm({ ...form, materialName: e.target.value })} /></label>
          <label>Material Code<input value={form.materialCode} onChange={e => setForm({ ...form, materialCode: e.target.value })} /></label>
          <label>Quantity<input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></label>
          <label>Unit<select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>{(uoms || []).map((u, i) => <option key={u?.code ?? i} value={u?.code}>{u?.name || u?.code}</option>)}</select></label>
          <label>Cost Per Base Unit<input type="number" value={form.costPerUnit} onChange={e => setForm({ ...form, costPerUnit: e.target.value })} /></label>
          <label>Supplier<input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></label>
          <label>Warehouse<input value={form.warehouse} onChange={e => setForm({ ...form, warehouse: e.target.value })} /></label>
          <label>Expiry Date<input type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} /></label>
        </div>
        <button className="primary-action" disabled={saving}>{saving ? 'Receiving...' : 'Receive + Auto Convert'}</button>
      </form>
    </div>
  );
}

function ProductionOrderModal({ user, formulas, rawMaterials, formulaVersions, onClose, onSaved }) {
  const safeFormulas = Array.isArray(formulas) ? formulas.filter(Boolean) : [];
  const safeRawMaterials = Array.isArray(rawMaterials) ? rawMaterials.filter(Boolean) : [];
  const safeFormulaVersions = Array.isArray(formulaVersions) ? formulaVersions.filter(Boolean) : [];
  const approvedFormulas = safeFormulas.filter(f => f?.approvalStatus === 'Approved');
  const first = approvedFormulas[0] || safeFormulas[0] || {};
  const [form, setForm] = useState({ formulaId: first?.id || '', productName: first?.productName || '', plannedQty: 1, outputUnit: first?.outputUnit || 'BAG', operator: user?.name || 'Grace Production', startDate: new Date().toISOString().slice(0, 10), endDate: '', warehouse: 'Main Store Nairobi' });
  const [saving, setSaving] = useState(false);
  const [validationMsg, setValidationMsg] = useState('');
  const selectedFormula = safeFormulas.find(f => f?.id === form.formulaId) || {};
  const selectedFormulaItems = safeFormulaVersions.filter(v => v?.formulaId === form.formulaId && v?.version === selectedFormula?.activeVersion);
  
  const handleFormulaChange = (e) => {
    const formulaId = e.target.value;
    const formula = safeFormulas.find(x => x?.id === formulaId) || {};
    setForm({ ...form, formulaId: formula?.id || '', productName: formula?.productName || '', outputUnit: formula?.outputUnit || '' });
  };
  
  const materialRequirements = selectedFormulaItems.map(item => {
    const mat = safeRawMaterials.find(m => m?.id === item?.rawMaterialId);
    const reqQty = Math.round(num(item?.quantity) * num(form.plannedQty));
    return { ...item, materialName: mat?.materialName || item?.materialName || 'Unknown', available: num(mat?.availableQuantity || 0), requiredQty: reqQty, unit: mat?.unitOfMeasure || item?.unit, cost: mat ? num(mat?.costPerUnit || mat?.unitCost) * reqQty : 0, shortage: reqQty > num(mat?.availableQuantity || 0) };
  });
  const totalMaterialCost = materialRequirements.reduce((s, x) => s + x.cost, 0);
  const hasShortage = materialRequirements.some(r => r.shortage);
  const estimatedDays = Math.max(1, Math.ceil(num(form.plannedQty) / 50));
  const estimatedEndDate = form.startDate ? new Date(new Date(form.startDate).getTime() + estimatedDays * 86400000).toISOString().slice(0, 10) : '';

  async function save(e) {
    e.preventDefault();
    setValidationMsg('');
    if (!form.formulaId) {
      setValidationMsg('Please select a formula for this production order');
      return;
    }
    if (selectedFormula?.approvalStatus !== 'Approved') {
      setValidationMsg('Formula must be approved before creating a production order');
      return;
    }
    if (hasShortage) {
      setValidationMsg('Cannot create order: insufficient raw materials. Please check the material shortage report below.');
      return;
    }
    setSaving(true);
    try {
      await rpc('saveProductionJob', [user, { ...form, endDate: estimatedEndDate }]);
      onSaved?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card wide" onSubmit={save}>
        <header><h2>New Production Order</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        {validationMsg && <div className="error-banner">{validationMsg}</div>}
        <label>Formula *
          <select value={form.formulaId} onChange={handleFormulaChange} required>
            <option value="">Select approved formula...</option>
            {approvedFormulas.map((f, i) => <option key={f?.id ?? i} value={f?.id}>{f?.productName || '—'} (v{f?.activeVersion || '—'}) - {f?.formulaName || ''}</option>)}
          </select>
          {approvedFormulas.length === 0 && <small style={{color: '#d92d20'}}>No approved formulas available. Go to Formulas tab to create and approve one.</small>}
        </label>
        <div className="modal-grid three-col">
          <label>Product<input value={form.productName} onChange={e => setForm({ ...form, productName: e.target.value })} placeholder="Auto-filled from formula" /></label>
          <label>Planned Qty<input type="number" min="1" value={form.plannedQty} onChange={e => setForm({ ...form, plannedQty: e.target.value })} /></label>
          <label>Output Unit<input value={form.outputUnit} onChange={e => setForm({ ...form, outputUnit: e.target.value })} /></label>
          <label>Warehouse<input value={form.warehouse} onChange={e => setForm({ ...form, warehouse: e.target.value })} /></label>
          <label>Operator<input value={form.operator} onChange={e => setForm({ ...form, operator: e.target.value })} /></label>
          <label>Start Date<input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></label>
        </div>

        {selectedFormulaItems.length > 0 && (
          <div className="material-requirements" style={{ marginTop: 16, marginBottom: 16 }}>
            <h3>Material Requirements for {form.plannedQty} {form.outputUnit}</h3>
            <table className="requirements-table">
              <thead><tr><th>Material</th><th>Per Unit</th><th>Required</th><th>Available</th><th>Unit</th><th>Cost</th><th>Status</th></tr></thead>
              <tbody>
                {materialRequirements.map((req, i) => (
                  <tr key={i} className={req.shortage ? 'shortage' : 'sufficient'}>
                    <td>{req.materialName}</td>
                    <td>{req.quantity}</td>
                    <td><strong>{req.requiredQty}</strong></td>
                    <td>{req.available}</td>
                    <td>{req.unit}</td>
                    <td>{currency(req.cost)}</td>
                    <td>{req.shortage ? <span className="status cancelled">Shortage</span> : <span className="status active">OK</span>}</td>
                  </tr>
                ))}
                <tr className="total-row"><td colSpan={5}><strong>Total Material Cost</strong></td><td><strong>{currency(totalMaterialCost)}</strong></td><td /></tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="cost-breakdown" style={{ marginBottom: 16 }}>
          <h3>Order Preview</h3>
          <div className="cost-grid">
            <span>Raw Material Cost</span><strong>{currency(totalMaterialCost)}</strong>
            <span>Labor Cost (15%)</span><strong>{currency(totalMaterialCost * 0.15)}</strong>
            <span>Overhead Cost (8%)</span><strong>{currency(totalMaterialCost * 0.08)}</strong>
            <span>Machine Cost (5%)</span><strong>{currency(totalMaterialCost * 0.05)}</strong>
            <span>Utility Cost (3%)</span><strong>{currency(totalMaterialCost * 0.03)}</strong>
            <span className="total">Total Est. Cost</span><strong className="total">{currency(totalMaterialCost * 1.31)}</strong>
            <span>Est. Completion</span><strong>{estimatedDays} days ({estimatedEndDate || '—'})</strong>
          </div>
        </div>

        <button className="primary-action" disabled={saving || !approvedFormulas.length || hasShortage}>{saving ? 'Creating...' : !approvedFormulas.length ? 'No Approved Formulas' : hasShortage ? 'Resolve Shortages First' : 'Create Production Order'}</button>
      </form>
    </div>
  );
}

/* ==========================================================
   Phase 3 — Finance & Accounts Chart Components
   AR/AP aging bar chart, payment terms donut, credit risk
   ========================================================== */

function AgingBarChart({ data = [] }) {
  if (!data.length) return <div className="quiet-state">No aging data</div>;
  const colors = ['#050505', '#2563eb', '#f79009', '#d92d20', '#7f56d9'];
  return (
    <div className="finance-chart-container">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 10, top: 8, bottom: 8 }}>
          <CartesianGrid stroke="#eef0f3" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#667085', fontSize: 11 }} tickFormatter={v => `Ksh${Math.round(v / 1000)}K`} />
          <YAxis type="category" dataKey="bucket" tick={{ fill: '#101828', fontSize: 12 }} width={50} />
          <Tooltip formatter={v => currency(v)} />
          <Bar dataKey="receivable" fill="#2563eb" radius={[0, 4, 4, 0]} name="Receivable" />
          <Bar dataKey="payable" fill="#d92d20" radius={[0, 4, 4, 0]} name="Payable" />
          <Legend iconType="circle" iconSize={8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PaymentTermsPie({ data = [] }) {
  if (!data.length) return <div className="quiet-state">No payment terms data</div>;
  const colors = ['#050505', '#2563eb', '#7f56d9', '#f79009', '#d92d20', '#12b76a'];
  return (
    <div className="finance-chart-container">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="customers" nameKey="paymentTerms" innerRadius={55} outerRadius={85} paddingAngle={2} label={({ paymentTerms }) => paymentTerms}>
            {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip formatter={(v, name) => [`${v} customers`, name]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function CreditHealthDonut({ data = [] }) {
  const good = data.filter(r => r.riskStatus === 'Good').length;
  const watch = data.filter(r => r.riskStatus === 'Watch').length;
  const overdue = data.filter(r => r.riskStatus === 'Overdue').length;
  const defaulted = data.filter(r => r.riskStatus === 'Defaulted' || r.riskStatus === 'Credit Hold').length;
  const total = data.length || 1;
  const chartData = [
    { name: 'Good', value: good, fill: '#12b76a' },
    { name: 'Watch', value: watch, fill: '#f79009' },
    { name: 'Overdue', value: overdue, fill: '#d92d20' },
    { name: 'Defaulted', value: defaulted, fill: '#050505' }
  ].filter(d => d.value > 0);
  if (!chartData.length) return <div className="quiet-state">No credit data</div>;
  return (
    <div className="finance-chart-container credit-health">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={72} paddingAngle={2}>
            {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
      <div className="credit-legend">
        {chartData.map(d => (
          <span key={d.name}><i style={{ background: d.fill }} />{d.name}: {Math.round((d.value / total) * 100)}%</span>
        ))}
      </div>
    </div>
  );
}

/* ==========================================================
   End Phase 3 Chart Components
   ========================================================== */

function AccountsWorkspace({ user, setPage, globalPeriod }) {
  const tabs = ['overview', 'chart', 'receivables', 'payables', 'banking', 'trial', 'journals', 'reconciliation', 'quotations', 'statements', 'expenses', 'reports', 'audit'];
  const [view, setView] = useRouteTab('accounts', tabs, 'overview');
  const [journalOpen, setJournalOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [quotationOpen, setQuotationOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [auditQuery, setAuditQuery] = useState('');
  const { loading, data, error } = useServer(user, 'getFinanceWorkspaceData', [{ period: globalPeriod }], [refreshKey, globalPeriod]);
  if (loading) return <Loading title="Accounts" />;
  if (error) return <ErrorState title="Accounts" error={error} />;
  const refresh = () => setRefreshKey(x => x + 1);
  const cashPosition = data.overview.cashBalance ?? data.overview.cashPosition ?? 0;
  const accountCards = [
    ['Accounts Receivable', data.overview.accountsReceivable, ReceiptText, 'Customer balances still to collect'],
    ['Accounts Payable', data.overview.accountsPayable, ClipboardCheck, 'Supplier bills and purchase liabilities'],
    ['Cash Position', cashPosition, Landmark, 'Bank and cash accounts'],
    ['Net Profit', data.overview.netProfit, LineChart, 'Posted income less posted costs']
  ];
  const movementMetrics = ['revenue', 'expenses', 'cash', 'ar', 'ap', 'profit'];
  const riskRows = [
    { area: 'Receivables', amount: data.overview.accountsReceivable, focus: `${(data.receivables || []).filter(row => num(row.balance) > 0).length} open invoices`, action: 'Collect and confirm paid' },
    { area: 'Payables', amount: data.overview.accountsPayable, focus: `${(data.payables || []).filter(row => num(row.outstandingBalance) > 0).length} supplier bills`, action: 'Schedule payment' },
    { area: 'Cash', amount: cashPosition, focus: `${(data.bankTransactions || []).length} bank movements`, action: 'Reconcile deposits' },
    { area: 'Profit', amount: data.overview.netProfit, focus: `${(data.journals || []).length} posted journals`, action: 'Review expense pressure' }
  ];
  return (
    <section className="page-stack sales-workspace accounts-workspace">
      <div className="sales-hero accounts-hero">
        <div>
          <span>Accounting Control Center</span>
          <h1>Accounts</h1>
          <p>Chart of accounts, receivables, payables, bank balances, journals, reconciliations, and trial balance in one finance-backed workspace.</p>
        </div>
        <div className="sales-hero-stats">
          <strong>{data.accounts.length}</strong><span>Accounts</span>
          <strong>{data.journals.length}</strong><span>Journals</span>
          <strong>{currency(cashPosition)}</strong><span>Cash</span>
        </div>
      </div>
      <FinanceHealthStrip data={data} />
      <div className="accounts-command-strip">
        <button onClick={() => setOrderOpen(true)}><Plus size={16} /> Create Order</button>
        <button onClick={() => setPaymentOpen(true)}><CheckCircle2 size={16} /> Confirm Paid</button>
        <button onClick={() => setExpenseOpen(true)}><ReceiptText size={16} /> Balance Expense</button>
        <button onClick={() => setQuotationOpen(true)}><FileText size={16} /> Create Quotation</button>
        <button onClick={() => setStatementOpen(true)}><ReceiptText size={16} /> Generate Statement</button>
        <CreateRequisitionButton user={user} module="accounts" />
        <button onClick={() => downloadRowsFile('accounts-receivable', data.receivables, 'CSV')}><Download size={16} /> Receivables CSV</button>
        <button onClick={() => downloadRowsFile('accounts-payable', data.payables, 'CSV')}><Download size={16} /> Payables CSV</button>
      </div>
      <div className="sales-tabs">
        {tabs.map(tab => <button key={tab} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}>{label(tab)}</button>)}
      </div>

      {view === 'overview' && (
        <>
          <div className="analytics-kpi-row">
            {accountCards.map(([title, value, Icon, detail]) => (
              <article key={title}>
                <span>{title}</span>
                <strong>{currency(value)}</strong>
                <small>{detail}</small>
                <Icon size={18} />
              </article>
            ))}
          </div>
          <div className="dashboard-grid">
            <Panel className="span-8 sales-main-chart accounts-movement-panel" title="Accounts Movement" action="Revenue / Expenses / Cash / AR / AP / Profit">
              <MultiMetricTrendChart data={data.trend} metrics={movementMetrics} />
              <div className="chart-legend-row">
                {movementMetrics.map(metric => <span key={metric}>{label(metric)}</span>)}
              </div>
            </Panel>
            <Panel className="span-4" title="Posting Actions">
              <AccountsQuickActions
                onOrder={() => setOrderOpen(true)}
                onJournal={() => setJournalOpen(true)}
                onExpense={() => setExpenseOpen(true)}
                onAccount={() => setAccountOpen(true)}
                onBank={() => setBankOpen(true)}
                onPayment={() => setPaymentOpen(true)}
                onReports={() => setView('reports')}
                onAudit={() => setView('reconciliation')}
              />
            </Panel>
            <Panel className="span-12" title="Accounts Action Board"><SimpleTable rows={riskRows} columns={['area', 'amount', 'focus', 'action']} /></Panel>
            <Panel className="span-12" title="Accounts Aging Chart" action="Receivables / Payables">
              <AgingBarChart data={data.agingSummary || []} />
            </Panel>
            <Panel className="span-4" title="Payment Terms Distribution" action="By customers">
              <PaymentTermsPie data={data.paymentTermsSummary || []} />
            </Panel>
            <Panel className="span-4" title="Customer Credit Health" action="Risk status">
              <CreditHealthDonut data={data.customerFinance || []} />
            </Panel>
            <Panel className="span-4" title="Collections Queue" action="Next actions">
              <SimpleTable rows={data.collectionQueue || []} columns={['customerName', 'dueBalance', 'overdueBalance', 'paymentTerms', 'riskStatus', 'nextAction']} />
            </Panel>
            <Panel className="span-6" title="Customer Credit Base" action="Top balances"><SimpleTable rows={data.customerFinance || []} columns={['customerName', 'paymentTerms', 'creditLimit', 'totalPurchases', 'dueBalance', 'overdueBalance', 'riskStatus']} /></Panel>
            <Panel className="span-6" title="Payment Terms Exposure" action="Due risks"><SimpleTable rows={data.paymentTermsSummary || []} columns={['paymentTerms', 'customers', 'dueBalance', 'overdueBalance']} /></Panel>
            <Panel className="span-6" title="Receivables Risk" action={<button className="mini-action" onClick={() => downloadRowsFile('accounts-receivable', data.receivables, 'CSV')}><Download size={15} /> CSV</button>}><InvoiceDocumentTable user={user} rows={data.receivables} columns={['invNo', 'customerName', 'balance', 'agingBucket', 'risk', 'status']} onChanged={refresh} /></Panel>
            <Panel className="span-6" title="Payables Risk" action={<button className="mini-action" onClick={() => downloadRowsFile('accounts-payable', data.payables, 'CSV')}><Download size={15} /> CSV</button>}><SimpleTable rows={data.payables} columns={['invoiceNo', 'supplierName', 'outstandingBalance', 'agingBucket', 'risk', 'paymentStatus']} /></Panel>
            <Panel className="span-6" title="Trial Balance Snapshot"><div className="metric-stack">
              {(data.accounts || []).slice(0, 10).map(a => <div key={a.id}><span>{a.code} - {a.name}</span><strong>{currency(num(a.balance || 0))}</strong><em>{a.type}</em></div>)}
              <div><span>Total Debit</span><strong>{currency((data.accounts || []).reduce((s, a) => s + (num(a.balance) > 0 ? num(a.balance) : 0), 0))}</strong><em>Dr</em></div>
              <div><span>Total Credit</span><strong>{currency((data.accounts || []).reduce((s, a) => s + (num(a.balance) < 0 ? Math.abs(num(a.balance)) : 0), 0))}</strong><em>Cr</em></div>
            </div></Panel>
            <Panel className="span-6" title="Period Close Checklist"><div className="metric-stack">
              <div><span>All invoices posted</span><strong style={{ color: '#12b76a' }}>✓</strong><em>{(data.receivables || []).length} invoices</em></div>
              <div><span>Expenses recorded</span><strong style={{ color: '#12b76a' }}>✓</strong><em>{(data.expenses || []).length} expenses</em></div>
              <div><span>Journals balanced</span><strong style={{ color: '#12b76a' }}>✓</strong><em>{(data.journals || []).length} entries</em></div>
              <div><span>Bank reconciled</span><strong>{(data.bankTransactions || []).length > 0 ? '✓' : '!'}</strong><em>{(data.bankTransactions || []).length} movements</em></div>
              <div><span>Payments confirmed</span><strong style={{ color: '#12b76a' }}>✓</strong><em>Ready to close</em></div>
            </div></Panel>
          </div>
        </>
      )}
      {view === 'chart' && <Panel title="Chart of Accounts" action={<div className="panel-action-row"><button className="mini-action" onClick={() => setAccountOpen(true)}><Plus size={15} /> New Account</button><button className="mini-action" onClick={() => downloadRowsFile('chart-of-accounts', data.accounts, 'CSV')}><Download size={15} /> CSV</button></div>}><SimpleTable rows={data.accounts} columns={['code', 'name', 'type', 'parent', 'status']} /></Panel>}
      {view === 'receivables' && (
        <div className="dashboard-grid">
          <Panel className="span-8" title="Accounts Receivable" action={<button className="mini-action" onClick={() => downloadRowsFile('accounts-receivable', data.receivables, 'CSV')}><Download size={15} /> CSV</button>}>
            <InvoiceDocumentTable user={user} rows={data.receivables} columns={['invNo', 'customerName', 'total', 'paid', 'balance', 'paymentTerms', 'daysOverdue', 'agingBucket', 'risk', 'status']} onChanged={refresh} />
          </Panel>
          <Panel className="span-4" title="Tax Invoice Export" action="PDF">
            <TaxInvoiceExport user={user} invoices={data.receivables} />
          </Panel>
          <Panel className="span-6" title="Customer Statements Preview"><SimpleTable rows={data.statementPreview || []} columns={['customerName', 'invNo', 'dueDate', 'paymentTerms', 'total', 'paid', 'balance', 'daysOverdue', 'risk']} /></Panel>
          <Panel className="span-6" title="Payment Terms Exposure"><SimpleTable rows={data.paymentTermsSummary || []} columns={['paymentTerms', 'customers', 'dueBalance', 'overdueBalance']} /></Panel>
        </div>
      )}
      {view === 'payables' && <Panel title="Accounts Payable" action={<button className="mini-action" onClick={() => downloadRowsFile('accounts-payable', data.payables, 'CSV')}><Download size={15} /> CSV</button>}><SimpleTable rows={data.payables} columns={['invoiceNo', 'supplierName', 'invoiceAmount', 'paidAmount', 'outstandingBalance', 'agingBucket', 'risk', 'paymentStatus']} /></Panel>}
      {view === 'banking' && <div className="dashboard-grid"><Panel className="span-5" title="Bank & Cash Accounts" action={<button className="mini-action" onClick={() => setBankOpen(true)}><Plus size={15} /> Bank Tx</button>}><SimpleTable rows={data.bankAccounts} columns={['accountName', 'bank', 'currency', 'openingBalance', 'balance', 'status']} /></Panel><Panel className="span-7" title="Bank Transactions" action={<button className="mini-action" onClick={() => downloadRowsFile('bank-transactions', data.bankTransactions, 'CSV')}><Download size={15} /> CSV</button>}><SimpleTable rows={data.bankTransactions} columns={['date', 'accountName', 'reference', 'description', 'deposit', 'withdrawal', 'reconciled']} /></Panel></div>}
      {view === 'trial' && <div className="dashboard-grid"><Panel className="span-4" title="Trial Balance"><FinanceTrialBalance journalLines={data.journalLines} /></Panel><Panel className="span-8" title="Ledger Lines" action={<button className="mini-action" onClick={() => downloadRowsFile('ledger-lines', data.ledger, 'CSV')}><Download size={15} /> CSV</button>}><SimpleTable rows={data.ledger} columns={['date', 'accountCode', 'accountName', 'debit', 'credit', 'sourceModule', 'reference']} /></Panel></div>}
      {view === 'journals' && <Panel title="Journal Entries" action={<div className="panel-action-row"><span>Balanced postings</span><button className="mini-action" onClick={() => downloadRowsFile('journal-entries', data.journals, 'CSV')}><Download size={15} /> CSV</button></div>}><SimpleTable rows={data.journals} columns={['journalNo', 'date', 'description', 'sourceModule', 'reference', 'totalDebit', 'totalCredit', 'approvalStatus']} /></Panel>}
      {view === 'reconciliation' && <FinanceReconciliation data={data} />}
      {view === 'quotations' && <Panel title="Quotations" action={<div className="panel-action-row"><button className="mini-action" onClick={() => setQuotationOpen(true)}><Plus size={15} /> New Quotation</button><button className="mini-action" onClick={() => downloadRowsFile('quotations', data.quotations, 'CSV')}><Download size={15} /> CSV</button></div>}><QuotationTable user={user} rows={data.quotations} onChanged={refresh} /></Panel>}
      {view === 'statements' && <Panel title="Customer Statements" action={<button className="mini-action" onClick={() => setStatementOpen(true)}><ReceiptText size={15} /> Generate Statement</button>}><SimpleTable rows={data.customerFinance || []} columns={['customerName', 'totalPurchases', 'totalPaid', 'dueBalance', 'overdueBalance', 'lastPurchase', 'lastPayment', 'riskStatus']} /></Panel>}
      {view === 'expenses' && <Panel title="Expenses" action={<button className="mini-action" onClick={() => setExpenseOpen(true)}><Plus size={15} /> Record Expense</button>}><SimpleTable rows={data.expenses || []} columns={['expNo', 'category', 'date', 'description', 'amount', 'paymentMethod', 'status']} /></Panel>}
      {view === 'audit' && (
        <Panel title="Audit Trail" action={<span>Immutable records</span>}>
          <div className="report-filter-bar" style={{ marginBottom: 12 }}>
            <input value={auditQuery} onChange={e => setAuditQuery(e.target.value)} placeholder="Search module, action, reference, user..." style={{ minWidth: 280 }} />
          </div>
          <SimpleTable rows={(data.audit || []).filter(row => !auditQuery || `${row.module || ''} ${row.action || ''} ${row.reference || ''} ${row.user || ''}`.toLowerCase().includes(auditQuery.toLowerCase()))} columns={['user', 'date', 'module', 'action', 'reference', 'newValue', 'approval', 'immutable']} />
        </Panel>
      )}
      {view === 'reports' && <InventoryReports reports={data.reports} user={user} module="Financial" />}
      {orderOpen && <NewSaleModal user={user} onClose={() => setOrderOpen(false)} onSaved={() => { setOrderOpen(false); refresh(); setView('receivables'); }} />}
      {journalOpen && <FinanceJournalModal user={user} accounts={data.accounts} onClose={() => setJournalOpen(false)} onSaved={() => { setJournalOpen(false); refresh(); setView('journals'); }} />}
      {expenseOpen && <FinanceExpenseModal user={user} onClose={() => setExpenseOpen(false)} onSaved={() => { setExpenseOpen(false); refresh(); setView('reports'); }} />}
      {paymentOpen && <FinancePaymentModal user={user} receivables={data.receivables} bankAccounts={data.bankAccounts} onClose={() => setPaymentOpen(false)} onSaved={() => { setPaymentOpen(false); refresh(); setView('receivables'); }} />}
      {accountOpen && <FinanceAccountModal user={user} onClose={() => setAccountOpen(false)} onSaved={() => { setAccountOpen(false); refresh(); setView('chart'); }} />}
      {bankOpen && <FinanceBankTransactionModal user={user} accounts={data.accounts} onClose={() => setBankOpen(false)} onSaved={() => { setBankOpen(false); refresh(); setView('banking'); }} />}
      {quotationOpen && <QuotationModal user={user} customers={data.customerFinance || []} onClose={() => setQuotationOpen(false)} onSaved={() => { setQuotationOpen(false); refresh(); setView('quotations'); }} />}
      {statementOpen && <CustomerStatementModal user={user} customers={data.customerFinance || []} onClose={() => setStatementOpen(false)} onSaved={() => { setStatementOpen(false); refresh(); }} />}
    </section>
  );
}

function TaxInvoiceExport({ user, invoices }) {
  const validInvoices = (invoices || []).filter(row => row.invoiceId || row.id);
  const [invoiceId, setInvoiceId] = useState(validInvoices[0]?.invoiceId || validInvoices[0]?.id || '');
  const [vatMode, setVatMode] = useState('auto');
  const [invoiceComment, setInvoiceComment] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailStatus, setEmailStatus] = useState('');
  const selected = validInvoices.find(row => (row.invoiceId || row.id) === invoiceId) || validInvoices[0];
  const invoiceNo = selected?.invNo || selected?.invoiceNo || selected?.invoiceId || selected?.id || '';
  const invoiceOptions = { vatMode, invoiceComment };
  async function generate() {
    if (!selected) return;
    setLoading(true);
    try {
      const file = await rpc('generateTaxInvoicePdf', [user, invoiceId || selected.invoiceId || selected.id, invoiceOptions]);
      downloadBase64File(file);
    } finally {
      setLoading(false);
    }
  }
  async function printInvoice() {
    if (!selected) return;
    setLoading(true);
    try {
      const file = await rpc('generateTaxInvoicePdf', [user, invoiceId || selected.invoiceId || selected.id, invoiceOptions]);
      openBase64File(file, true);
    } finally {
      setLoading(false);
    }
  }
  async function emailInvoice() {
    if (!selected) return;
    setEmailing(true);
    setEmailStatus('');
    try {
      const result = await rpc('emailTaxInvoice', [user, invoiceId || selected.invoiceId || selected.id, { ...invoiceOptions, to: emailTo || undefined }]);
      setEmailStatus(result.sent ? `Sent to ${result.to}` : `Failed to send`);
    } catch (e) {
      setEmailStatus(e.message || 'Error sending invoice');
    } finally {
      setEmailing(false);
    }
  }
  return (
    <div className="tax-invoice-actions">
      <p>Download a clean Farmtrack tax invoice for printing, PDF sharing, email attachment, or record keeping.</p>
      <label>
        Invoice
        <select value={invoiceId} onChange={e => { setInvoiceId(e.target.value); setEmailStatus(''); }}>
          {validInvoices.map(row => (
            <option key={row.invoiceId || row.id} value={row.invoiceId || row.id}>
              {row.invNo || row.invoiceNo} - {row.customerName} - {currency(row.balance || row.total)}
            </option>
          ))}
        </select>
      </label>
      <label>
        VAT option
        <select value={vatMode} onChange={e => setVatMode(e.target.value)}>
          <option value="auto">Auto from invoice</option>
          <option value="none">No VAT line</option>
          <option value="vat16">Add 16% VAT</option>
        </select>
      </label>
      <label>
        Email recipient
        <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="Customer email or type another address" />
      </label>
      <label>
        Invoice comment
        <textarea value={invoiceComment} onChange={e => setInvoiceComment(e.target.value)} rows={3} placeholder="Optional note for this invoice PDF" />
      </label>
      {selected && (
        <div className="invoice-preview">
          <span>{selected.customerName}</span>
          <b>Invoice No. {invoiceNo}</b>
          <strong>{currency(selected.balance || selected.total)}</strong>
          <small>{selected.status || 'Invoice'} · {selected.agingBucket || 'Current'}</small>
        </div>
      )}
      <div className="invoice-actions-row">
        <button className="primary-action" onClick={generate} disabled={!selected || loading}>
          {loading ? 'Preparing PDF...' : 'Download Tax Invoice'}
        </button>
        <button className="secondary-action" onClick={printInvoice} disabled={!selected || loading} title="Open this invoice ready to print">
          <Printer size={14} /> Print Invoice
        </button>
        <button className="secondary-action" onClick={emailInvoice} disabled={!selected || emailing} title="Email this invoice to the customer">
          {emailing ? 'Sending...' : <><Mail size={14} /> Email Invoice</>}
        </button>
      </div>
      {emailStatus && <small className={`email-status ${emailStatus.startsWith('Sent') ? 'success' : 'error'}`}>{emailStatus}</small>}
    </div>
  );
}

function InvoiceDocumentTable({ user, rows, columns, onChanged }) {
  const [busy, setBusy] = useState('');
  const invoiceIdFor = row => row.invoiceId || row.id || row.invNo || row.invoiceNo;
  async function generate(row, mode) {
    const invoiceId = invoiceIdFor(row);
    if (!invoiceId) return;
    setBusy(`${mode}-${invoiceId}`);
    try {
      const file = await rpc('generateTaxInvoicePdf', [user, invoiceId]);
      if (mode === 'print') openBase64File(file, true);
      else downloadBase64File(file);
    } catch (error) {
      alert(error.message || 'Could not generate invoice document');
    } finally {
      setBusy('');
    }
  }
  async function email(row) {
    const invoiceId = invoiceIdFor(row);
    if (!invoiceId) return;
    const suggested = row.email || row.customerEmail || '';
    const to = window.prompt('Send invoice to which email address?', suggested);
    if (to === null) return;
    setBusy(`email-${invoiceId}`);
    try {
      const result = await rpc('emailTaxInvoice', [user, invoiceId, { to: to.trim() || undefined }]);
      alert(result.sent ? `Invoice emailed to ${result.to}` : 'Email was logged but not sent. Check Email Admin.');
    } catch (error) {
      alert(error.message || 'Could not email invoice');
    } finally {
      setBusy('');
    }
  }
  async function confirmPaid(row) {
    const invoiceId = invoiceIdFor(row);
    const amount = num(row.balance || row.outstanding || row.total);
    if (!invoiceId || amount <= 0) return;
    if (!window.confirm(`Confirm ${currency(amount)} paid for ${row.invNo || row.invoiceNo || row.customerName}?`)) return;
    setBusy(`paid-${invoiceId}`);
    try {
      await rpc('recordCustomerPayment', [user, { invoiceId, amount, method: 'Bank' }]);
      onChanged?.();
    } catch (error) {
      alert(error.message || 'Could not confirm payment');
    } finally {
      setBusy('');
    }
  }
  const enhancedRows = (rows || []).map(row => {
    const invoiceId = invoiceIdFor(row);
    return {
      ...row,
      document: (
        <div className="invoice-doc-actions">
          <button title="Print tax invoice" disabled={busy === `print-${invoiceId}`} onClick={() => generate(row, 'print')}><Printer size={14} /> Print</button>
          <button title="Download tax invoice PDF" disabled={busy === `download-${invoiceId}`} onClick={() => generate(row, 'download')}><Download size={14} /> PDF</button>
          <button title="Email tax invoice" disabled={busy === `email-${invoiceId}`} onClick={() => email(row)}><Mail size={14} /> Email</button>
          {num(row.balance || row.outstanding) > 0 && <button title="Confirm invoice paid" disabled={busy === `paid-${invoiceId}`} onClick={() => confirmPaid(row)}><CheckCircle2 size={14} /> Paid</button>}
        </div>
      )
    };
  });
  return <SimpleTable rows={enhancedRows} columns={[...columns, 'document']} />;
}


function FinanceCreditSales({ data }) {
  const rows = (data.receivables || []).filter(r => num(r.balance) > 0);
  const saleItems = data.saleItems || [];
  const creditRows = rows.map(inv => {
    const items = saleItems.filter(si => si.saleId === inv.saleId || si.invoiceId === inv.id);
    return items.length ? items.map(item => ({ ...inv, productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice })) : [{ ...inv, productName: 'Multiple / Unknown', quantity: 1, unitPrice: num(inv.total) }];
  }).flat().slice(0, 50);
  return (
    <div className="dashboard-grid">
      <Panel className="span-12" title="Products on Credit" action={`${rows.length} invoices`}>
        <div className="report-template-grid">
          {creditRows.map((row, i) => {
            const pct = num(row.total) > 0 ? Math.round((num(row.paid) / num(row.total)) * 100) : 0;
            return (
              <div key={i} className="credit-sales-card">
                <div className="product-name">{row.productName}</div>
                <div className="customer-name">{row.customerName} · {row.invNo}</div>
                <div className="amount-row"><span>Total</span><strong>{currency(row.total)}</strong></div>
                <div className="amount-row"><span>Paid</span><strong>{currency(row.paid)}</strong></div>
                <div className="amount-row"><span>Balance</span><strong>{currency(row.balance)}</strong></div>
                <div className="balance-bar"><div className={pct >= 100 ? 'paid-fill' : 'partial-fill'} style={{width: `${pct}%`}} /></div>
                <div className="customer-name">{row.daysOverdue ? `${row.daysOverdue}d overdue` : 'Current'} · {row.risk}</div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function FinanceInvoiceTimeline({ data }) {
  const invoices = (data.receivables || []).slice(0, 30);
  const deliveries = data.deliveries || [];
  const audit = data.audit || [];
  return (
    <div className="dashboard-grid">
      <Panel className="span-12" title="Invoice Lifecycle Timeline" action={`${invoices.length} invoices`}>
        {invoices.map(inv => {
          const delivery = deliveries.find(d => d.saleId === inv.saleId || d.saleNo === inv.saleNo || d.invNo === inv.invNo);
          const auditEntry = audit.find(a => a.reference === inv.invNo || a.reference === inv.saleNo);
          const steps = [
            { label: 'Created', done: true },
            { label: 'Invoiced', done: true },
            { label: 'Delivered', done: delivery?.status === 'Delivered' || delivery?.arrivalConfirmed },
            { label: 'Paid', done: num(inv.balance) <= 0 }
          ];
          return (
            <div key={inv.id || inv.invNo} className="invoice-timeline-card">
              <div className="tl-info">
                <strong>{inv.invNo} · {inv.customerName}</strong>
                <span>{currency(inv.total)} · Balance {currency(inv.balance)} · {inv.daysOverdue ? `${inv.daysOverdue}d overdue` : 'Current'}</span>
              </div>
              <div className="tl-steps">
                {steps.map((s, i) => <div key={i} className={`tl-step ${s.done ? 'done' : ''}`}>{s.done ? '✓' : i+1}</div>)}
              </div>
              {delivery && <div className="tl-link">Delivery: {delivery.deliveryNo} → {delivery.destination} ({delivery.status})</div>}
              {auditEntry && <div className="tl-link">Audit: {auditEntry.action} by {auditEntry.user} on {new Date(auditEntry.date).toLocaleDateString()}</div>}
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

function FinanceCustomerLedger({ data }) {
  const customers = (data.customerFinance || []).slice(0, 20);
  const invoices = data.receivables || [];
  return (
    <div className="dashboard-grid">
      <Panel className="span-12" title="Customer In/Out Ledger" action={`${customers.length} customers`}>
        {customers.map(cust => {
          const custInvoices = invoices.filter(i => i.customerName === cust.customerName || i.customerId === cust.id);
          const totalIn = custInvoices.reduce((s, i) => s + num(i.total), 0);
          const totalOut = custInvoices.reduce((s, i) => s + num(i.paid), 0);
          const balance = totalIn - totalOut;
          return (
            <div key={cust.id || cust.customerName} className="customer-ledger-card">
              <div className="cl-header">
                <strong>{cust.customerName}</strong>
                <span>{cust.paymentTerms} · {cust.riskStatus}</span>
              </div>
              <div className="cl-row"><span className="cl-desc">Total Purchases (In)</span><span className="cl-amount">{currency(totalIn)}</span><span className="cl-running">{currency(totalIn)}</span></div>
              <div className="cl-row"><span className="cl-desc">Total Payments (Out)</span><span className="cl-amount">{currency(totalOut)}</span><span className="cl-running">{currency(totalIn - totalOut)}</span></div>
              <div className="cl-row"><span className="cl-desc">Credit Limit</span><span className="cl-amount">{currency(cust.creditLimit)}</span><span className="cl-running">{currency(cust.creditLimit - balance)}</span></div>
              <div className="cl-balance">Balance: {currency(balance)}</div>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

function Finance({ user, setPage, globalPeriod }) {
  const tabs = ['dashboard', 'ledger', 'accounts', 'journals', 'receivables', 'payables', 'banking', 'cash', 'expenses', 'revenue', 'payroll', 'taxes', 'assets', 'budgeting', 'reconciliation', 'reports', 'audit', 'costCenters', 'forecasting', 'ai', 'credit', 'timeline', 'customerLedger'];
  const [view, setView] = useRouteTab('finance', tabs, 'dashboard');
  const [metric, setMetric] = useState('profit');
  const [journalOpen, setJournalOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { loading, data, error } = useServer(user, 'getFinanceWorkspaceData', [{ period: globalPeriod }], [refreshKey, globalPeriod]);
  if (loading) return <Loading title="Finance" />;
  if (error) return <ErrorState title="Finance" error={error} />;
  const metrics = ['revenue', 'expenses', 'profit', 'cash', 'ar', 'ap'];
  const refresh = () => setRefreshKey(x => x + 1);
  return (
    <section className="page-stack sales-workspace finance-workspace">
      <div className="sales-hero finance-hero">
        <div>
          <span>Finance v2 · Fully Posted Backend</span>
          <h1>Finance Operating Center</h1>
          <p>Sales, procurement, inventory, payments, expenses, tax, payroll, assets, budgets, and manual journals now flow into one balanced, auditable financial engine.</p>
        </div>
        <div className="sales-hero-stats">
          <strong>{currency(data.overview.cashPosition)}</strong><span>Cash</span>
          <strong>{currency(data.overview.netProfit)}</strong><span>Net Profit</span>
          <strong>{data.integrity.unbalanced}</strong><span>Unbalanced</span>
        </div>
      </div>

      <div className="inline-actions">
        <button onClick={() => setJournalOpen(true)}><Plus size={16} /> Manual Journal</button>
        <button onClick={() => setExpenseOpen(true)}><ReceiptText size={16} /> Record Expense</button>
        <button onClick={() => setPaymentOpen(true)}><CircleDollarSign size={16} /> Receive Payment</button>
        <button onClick={() => setView('reports')}><FileText size={16} /> Financial Reports</button>
        <button onClick={() => setView('audit')}><CheckCircle2 size={16} /> Audit Center</button>
        <CreateRequisitionButton user={user} module="finance" />
      </div>

      <FinanceHealthStrip data={data} />

      <div className="sales-filter-bar">
        <button><Calendar size={16} />{data.filters.dateRange}</button>
        <button><CircleDollarSign size={16} />{data.filters.currency}</button>
        <button><BriefcaseBusiness size={16} />{data.filters.entity}</button>
        <button><CheckCircle2 size={16} />{data.integrity.journals} Journals / {data.integrity.lines} Lines</button>
      </div>

      <div className="sales-tabs">
        {tabs.map(tab => <button key={tab} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}>{label(tab)}</button>)}
      </div>

      {view === 'dashboard' && (
        <>
          <div className="control-grid">
            <KpiCard icon={CircleDollarSign} label="Total Revenue" value={currency(data.overview.revenue)} change={12} tone="green" />
            <KpiCard icon={BriefcaseBusiness} label="Total Expenses" value={currency(data.overview.expenses)} change={-4} tone="red" />
            <KpiCard icon={LineChart} label="Net Profit" value={currency(data.overview.netProfit)} change={9} tone="green" />
            <KpiCard icon={Gauge} label="Health Score" value={`${data.overview.financialHealthScore}%`} change={5} tone="blue" />
            <KpiCard icon={ReceiptText} label="Receivables" value={currency(data.overview.accountsReceivable)} change={-2} tone="blue" />
            <KpiCard icon={ClipboardCheck} label="Payables" value={currency(data.overview.accountsPayable)} change={3} tone="red" />
          </div>
          <div className="dashboard-grid">
            <Panel className="span-12 sales-main-chart" title="Financial Storyline" action={label(metric)}>
              <div className="metric-toggle">{metrics.map(x => <button key={x} className={metric === x ? 'active' : ''} onClick={() => setMetric(x)}>{label(x)}</button>)}</div>
              <SalesTrendChart data={data.trend} metric={metric} />
            </Panel>
            <Panel className="span-4" title="Quick Posting Center"><FinanceQuickActions onJournal={() => setJournalOpen(true)} onExpense={() => setExpenseOpen(true)} onPayment={() => setPaymentOpen(true)} /></Panel>
            <Panel className="span-4" title="Trial Balance Check"><FinanceTrialBalance journalLines={data.journalLines} /></Panel>
            <Panel className="span-4" title="Controls & Exceptions"><FinanceControls data={data} /></Panel>
            <Panel className="span-6" title="Receivable / Payable Aging"><SimpleTable rows={data.agingSummary || []} columns={['bucket', 'receivable', 'payable', 'customers']} /></Panel>
            <Panel className="span-6" title="Collections Queue"><SimpleTable rows={data.collectionQueue || []} columns={['customerName', 'dueBalance', 'overdueBalance', 'paymentTerms', 'riskStatus', 'nextAction']} /></Panel>
            <Panel className="span-6" title="Department Integration Flow"><SimpleTable rows={data.sourceFlows} columns={['module', 'records', 'journals', 'status']} /></Panel>
            <Panel className="span-6" title="Bank & Cash Position"><SimpleTable rows={data.bankAccounts} columns={['accountName', 'bank', 'currency', 'openingBalance', 'balance', 'status']} /></Panel>
          </div>
        </>
      )}
      {view === 'ledger' && <Panel title="General Ledger"><SimpleTable rows={data.ledger} columns={['date', 'accountCode', 'accountName', 'debit', 'credit', 'sourceModule', 'reference']} /></Panel>}
      {view === 'accounts' && <Panel title="Chart of Accounts"><SimpleTable rows={data.accounts} columns={['code', 'name', 'type', 'parent', 'status']} /></Panel>}
      {view === 'journals' && <Panel title="Journal Entries"><SimpleTable rows={data.journals} columns={['journalNo', 'date', 'description', 'sourceModule', 'reference', 'totalDebit', 'totalCredit', 'approvalStatus']} /></Panel>}
      {view === 'receivables' && <div className="dashboard-grid"><Panel className="span-8" title="Accounts Receivable"><InvoiceDocumentTable user={user} rows={data.receivables} columns={['invNo', 'customerName', 'total', 'paid', 'balance', 'paymentTerms', 'daysOverdue', 'agingBucket', 'risk', 'status']} onChanged={refresh} /></Panel><Panel className="span-4" title="Payment Terms Exposure"><SimpleTable rows={data.paymentTermsSummary || []} columns={['paymentTerms', 'customers', 'dueBalance', 'overdueBalance']} /></Panel><Panel className="span-12" title="Customer Finance Base"><SimpleTable rows={data.customerFinance || []} columns={['customerName', 'paymentTerms', 'creditLimit', 'totalPurchases', 'totalPaid', 'dueBalance', 'overdueBalance', 'defaultedPayments', 'riskStatus']} /></Panel></div>}
      {view === 'payables' && <Panel title="Accounts Payable"><SimpleTable rows={data.payables} columns={['invoiceNo', 'supplierName', 'invoiceAmount', 'paidAmount', 'outstandingBalance', 'agingBucket', 'risk', 'paymentStatus']} /></Panel>}
      {view === 'banking' && <Panel title="Bank Transactions"><SimpleTable rows={data.bankTransactions} columns={['date', 'accountName', 'reference', 'description', 'deposit', 'withdrawal', 'reconciled']} /></Panel>}
      {view === 'cash' && <Panel title="Cash Management"><SimpleTable rows={data.bankAccounts} columns={['accountName', 'bank', 'openingBalance', 'balance', 'status']} /></Panel>}
      {view === 'expenses' && <Panel title="Expense Center"><SimpleTable rows={data.expenses} columns={['expNo', 'category', 'date', 'description', 'amount', 'paymentMethod', 'status']} /></Panel>}
      {view === 'revenue' && <Panel title="Revenue Center"><InvoiceDocumentTable user={user} rows={data.receivables} columns={['invNo', 'customerName', 'total', 'paid', 'balance', 'status']} /></Panel>}
      {view === 'payroll' && <Panel title="Payroll Management"><SimpleTable rows={data.payroll} columns={['employeeNo', 'name', 'department', 'basicSalary', 'allowances', 'deductions', 'netPay', 'status']} /></Panel>}
      {view === 'taxes' && <Panel title="Kenyan Tax Engine"><SimpleTable rows={data.taxes} columns={['taxType', 'liability', 'period', 'status']} /></Panel>}
      {view === 'assets' && <Panel title="Fixed Assets"><SimpleTable rows={data.assets} columns={['assetName', 'category', 'location', 'purchaseCost', 'accumulatedDepreciation', 'currentValue', 'status']} /></Panel>}
      {view === 'budgeting' && <Panel title="Budgeting & Variance"><SimpleTable rows={data.budgets} columns={['department', 'budget', 'actual', 'variance', 'forecast', 'status']} /></Panel>}
      {view === 'reconciliation' && <FinanceReconciliation data={data} />}
      {view === 'reports' && <InventoryReports reports={data.reports} user={user} module="Financial" />}
      {view === 'audit' && <Panel title="Immutable Audit Center"><SimpleTable rows={data.audit} columns={['user', 'date', 'module', 'action', 'reference', 'newValue', 'approval', 'immutable']} /></Panel>}
      {view === 'costCenters' && <Panel title="Cost Centers"><SimpleTable rows={data.costCenters} columns={['code', 'department', 'manager', 'revenue', 'cost', 'profitability']} /></Panel>}
      {view === 'forecasting' && <Panel title="Financial Forecasting"><SimpleTable rows={data.forecasts} columns={['metric', 'current', 'forecast30', 'confidence']} /></Panel>}
      {view === 'ai' && <ProcurementAi insights={data.ai} />}
      {journalOpen && <FinanceJournalModal user={user} accounts={data.accounts} onClose={() => setJournalOpen(false)} onSaved={() => { setJournalOpen(false); refresh(); setView('journals'); }} />}
      {expenseOpen && <FinanceExpenseModal user={user} onClose={() => setExpenseOpen(false)} onSaved={() => { setExpenseOpen(false); refresh(); setView('expenses'); }} />}
      {paymentOpen && <FinancePaymentModal user={user} receivables={data.receivables} bankAccounts={data.bankAccounts} onClose={() => setPaymentOpen(false)} onSaved={() => { setPaymentOpen(false); refresh(); setView('receivables'); }} />}
    </section>
  );
}

function FinanceHealthStrip({ data }) {
  const debit = (data.journalLines || []).reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const credit = (data.journalLines || []).reduce((sum, row) => sum + Number(row.credit || 0), 0);
  const checks = [
    ['Journal Balance', data.integrity.unbalanced === 0 ? 'Balanced' : `${data.integrity.unbalanced} exceptions`, data.integrity.unbalanced === 0],
    ['Audit Lock', data.integrity.immutable ? 'Immutable' : 'Review needed', data.integrity.immutable],
    ['Trial Balance', Math.round(debit) === Math.round(credit) ? 'Debit = Credit' : 'Out of balance', Math.round(debit) === Math.round(credit)],
    ['Posting Coverage', `${data.sourceFlows.filter(x => x.journals > 0).length}/${data.sourceFlows.length} modules`, data.sourceFlows.filter(x => x.journals > 0).length >= 5]
  ];
  return (
    <div className="finance-health-strip">
      {checks.map(([name, value, ok]) => (
        <article key={name} className={ok ? 'ok' : 'warn'}>
          <CheckCircle2 size={17} />
          <span>{name}</span>
          <strong>{value}</strong>
        </article>
      ))}
    </div>
  );
}

function FinanceQuickActions({ onJournal, onExpense, onPayment }) {
  return (
    <div className="finance-action-stack">
      <button onClick={onJournal}><Plus size={17} /><span>Post balanced journal</span><em>Debit and credit in one controlled entry</em></button>
      <button onClick={onExpense}><ReceiptText size={17} /><span>Record expense</span><em>Expense entry plus finance posting</em></button>
      <button onClick={onPayment}><CircleDollarSign size={17} /><span>Receive customer payment</span><em>Updates AR and bank/cash flow</em></button>
    </div>
  );
}

function AccountsQuickActions({ onOrder, onJournal, onExpense, onAccount, onBank, onPayment, onReports, onAudit }) {
  return (
    <div className="finance-action-stack">
      <button onClick={onOrder}><ShoppingCart size={17} /><span>Create customer order</span><em>Creates order, invoice, delivery, and CRM purchase record</em></button>
      <button onClick={onJournal}><Plus size={17} /><span>Post journal</span><em>Balanced debit and credit entry</em></button>
      <button onClick={onExpense}><ReceiptText size={17} /><span>Record expense</span><em>Subtract operating cost and post finance movement</em></button>
      <button onClick={onAccount}><Landmark size={17} /><span>New account</span><em>Add chart-of-accounts control account</em></button>
      <button onClick={onBank}><CircleDollarSign size={17} /><span>Bank transaction</span><em>Deposit or withdrawal with posting</em></button>
      <button onClick={onPayment}><ReceiptText size={17} /><span>Receive payment</span><em>Update AR and cash position</em></button>
      <button onClick={onAudit}><ShieldCheck size={17} /><span>Audit checks</span><em>Review reconciliation and control exceptions</em></button>
      <button onClick={onReports}><FileText size={17} /><span>Accounts reports</span><em>Trial balance, AR/AP, cash, ledger exports</em></button>
    </div>
  );
}

function FinanceTrialBalance({ journalLines = [] }) {
  const debit = journalLines.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const credit = journalLines.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  const diff = Math.round(debit - credit);
  return (
    <div className="finance-trial-card">
      <div><span>Total Debit</span><strong>{currency(debit)}</strong></div>
      <div><span>Total Credit</span><strong>{currency(credit)}</strong></div>
      <div className={diff === 0 ? 'balanced' : 'unbalanced'}><span>Difference</span><strong>{currency(diff)}</strong></div>
    </div>
  );
}

function FinanceControls({ data }) {
  const overdueAr = (data.receivables || []).filter(x => x.risk === 'High' || x.status === 'Overdue').length;
  const overdueAp = (data.payables || []).filter(x => x.risk === 'High' || x.paymentStatus === 'Overdue').length;
  const taxDue = (data.taxes || []).filter(x => x.status !== 'Filed' && x.status !== 'Paid').length;
  return (
    <div className="finance-control-list">
      <article><span>Receivable risk</span><strong>{overdueAr}</strong><em>High-risk customer balances</em></article>
      <article><span>Payable risk</span><strong>{overdueAp}</strong><em>Supplier balances needing attention</em></article>
      <article><span>Tax queue</span><strong>{taxDue}</strong><em>Open tax records to file/pay</em></article>
    </div>
  );
}

function FinanceReconciliation({ data }) {
  const rows = (data.bankTransactions || []).map(row => ({
    ...row,
    expectedLedger: Number(row.deposit || 0) || Number(row.withdrawal || 0),
    matchStatus: row.reconciled ? 'Matched' : 'Open'
  }));
  return (
    <div className="dashboard-grid">
      <Panel className="span-4" title="Bank Reconciliation Status">
        <div className="finance-control-list">
          <article><span>Bank Accounts</span><strong>{data.bankAccounts.length}</strong><em>Active cash locations</em></article>
          <article><span>Transactions</span><strong>{data.bankTransactions.length}</strong><em>Bank movements imported/generated</em></article>
          <article><span>Open Items</span><strong>{rows.filter(x => x.matchStatus === 'Open').length}</strong><em>Need matching or review</em></article>
        </div>
      </Panel>
      <Panel className="span-8" title="Reconciliation Workbench">
        <SimpleTable rows={rows} columns={['date', 'accountName', 'reference', 'description', 'deposit', 'withdrawal', 'matchStatus']} />
      </Panel>
    </div>
  );
}

function FinanceJournalModal({ user, accounts, onClose, onSaved }) {
  const expense = accounts.find(a => a.type === 'Expense')?.id || accounts[0]?.id;
  const bank = accounts.find(a => a.name === 'KCB Bank')?.id || accounts[1]?.id;
  const [form, setForm] = useState({ amount: 0, description: 'Manual adjustment journal', reference: 'MANUAL', debitAccountId: expense, creditAccountId: bank, date: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('postManualJournal', [user, form]);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={save}>
        <header><h2>Manual Journal</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="modal-grid">
          <label>Date<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
          <label>Amount<input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>
          <label>Debit Account<select value={form.debitAccountId} onChange={e => setForm({ ...form, debitAccountId: e.target.value })}>{accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></label>
          <label>Credit Account<select value={form.creditAccountId} onChange={e => setForm({ ...form, creditAccountId: e.target.value })}>{accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></label>
        </div>
        <label>Description<input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
        <label>Reference<input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></label>
        <button className="primary-action" disabled={saving}>{saving ? 'Posting...' : 'Post Balanced Journal'}</button>
      </form>
    </div>
  );
}

function FinanceAccountModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({ code: '', name: '', type: 'Asset', parent: 'Asset', status: 'Active' });
  const [saving, setSaving] = useState(false);
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('saveFinanceAccount', [user, form]);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={save}>
        <header><h2>New Chart Account</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="modal-grid">
          <label>Account Code<input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="1120" required /></label>
          <label>Account Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Farm Inputs Receivable" required /></label>
          <label>Type<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value, parent: e.target.value })}>{['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{['Active', 'Inactive'].map(x => <option key={x}>{x}</option>)}</select></label>
        </div>
        <label>Parent / Group<input value={form.parent} onChange={e => setForm({ ...form, parent: e.target.value })} /></label>
        <button className="primary-action" disabled={saving}>{saving ? 'Saving...' : 'Save Account'}</button>
      </form>
    </div>
  );
}

function FinanceBankTransactionModal({ user, accounts, onClose, onSaved }) {
  const bankAccounts = accounts.filter(a => ['KCB Bank', 'M-Pesa Till', 'Cash on Hand'].includes(a.name));
  const offsetAccounts = accounts.filter(a => !['KCB Bank', 'M-Pesa Till', 'Cash on Hand'].includes(a.name));
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    direction: 'Deposit',
    accountName: bankAccounts[0]?.name || 'KCB Bank',
    offsetAccountId: offsetAccounts.find(a => a.type === 'Revenue')?.id || offsetAccounts[0]?.id || '',
    amount: 0,
    description: 'Bank transaction',
    reference: `BANK-${Date.now()}`
  });
  const [saving, setSaving] = useState(false);
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('recordBankTransaction', [user, form]);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={save}>
        <header><h2>Bank / Cash Transaction</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="modal-grid">
          <label>Date<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
          <label>Direction<select value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}>{['Deposit', 'Withdrawal'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Bank / Cash Account<select value={form.accountName} onChange={e => setForm({ ...form, accountName: e.target.value })}>{bankAccounts.map(a => <option key={a.id} value={a.name}>{a.code} - {a.name}</option>)}</select></label>
          <label>Offset Account<select value={form.offsetAccountId} onChange={e => setForm({ ...form, offsetAccountId: e.target.value })}>{offsetAccounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></label>
          <label>Amount<input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></label>
          <label>Reference<input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></label>
        </div>
        <label>Description<input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
        <button className="primary-action" disabled={saving}>{saving ? 'Posting...' : 'Post Bank Transaction'}</button>
      </form>
    </div>
  );
}

function FinanceExpenseModal({ user, onClose, onSaved }) {
  const categories = ['Salaries', 'Rent', 'Utilities', 'Manufacturing', 'Marketing', 'Transport', 'Fuel', 'Internet', 'Maintenance', 'Packaging', 'Office Supplies', 'Taxes', 'Miscellaneous', 'Insurance', 'Depreciation', 'Interest', 'Professional Fees', 'Repairs', 'Training', 'Travel', 'Entertainment', 'Donations', 'Subscriptions', 'Rent & Rates', 'Cleaning', 'Security', 'Staff Welfare', 'Raw Materials', 'Printing', 'Communication', 'Water', 'Electricity', 'Gas', 'Repairs & Maintenance', 'Vehicle Maintenance', 'Equipment Rental', 'IT Services', 'Legal Fees', 'Consulting', 'Advertising', 'Promotions', 'Research', 'Development', 'License Fees', 'Permits', 'Fines', 'Penalties', 'Bad Debt', 'Foreign Exchange Loss', 'Bank Charges', 'Card Fees', 'Loan Repayment', 'Dividends', 'Drawings', 'Capital Expenditure', 'Software Purchase', 'Hardware Purchase', 'Furniture Purchase', 'Vehicle Purchase', 'Other Asset Purchase'];
  const [form, setForm] = useState({ category: 'Salaries', date: new Date().toISOString().slice(0, 10), description: '', amount: 0, paymentMethod: 'Bank Transfer', reference: '', notes: '' });
  const [saving, setSaving] = useState(false);
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('recordFinanceExpense', [user, form]);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={save}>
        <header><h2>Record Finance Expense</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="modal-grid">
          <label>Date<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
          <label>Amount<input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></label>
          <label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{categories.map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Payment Method<select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>{['Cash', 'Bank Transfer', 'M-Pesa', 'Card', 'Cheque', 'Credit Account', 'Mobile Money', 'Mixed Payments'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Reference<input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Ref / Receipt No" /></label>
          <label>Notes<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Optional notes" /></label>
        </div>
        <label>Description<input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What was this expense for?" /></label>
        <button className="primary-action" disabled={saving}>{saving ? 'Posting...' : 'Record Expense + Journal'}</button>
      </form>
    </div>
  );
}

function FinancePaymentModal({ user, receivables, bankAccounts, onClose, onSaved }) {
  const first = receivables.find(x => Number(x.balance || 0) > 0) || receivables[0];
  const [form, setForm] = useState({ invoiceId: first?.invoiceId || first?.id || '', amount: first?.balance || 0, method: 'Bank Transfer', bankAccount: bankAccounts?.[0]?.accountName || '', reference: '', cashier: user?.name || '', notes: '' });
  const [saving, setSaving] = useState(false);
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('recordCustomerPayment', [user, form]);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={save}>
        <header><h2>Receive Customer Payment</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <label>Invoice<select value={form.invoiceId} onChange={e => {
          const inv = receivables.find(x => (x.invoiceId || x.id) === e.target.value);
          setForm({ ...form, invoiceId: e.target.value, amount: inv?.balance || form.amount });
        }}>{receivables.map(x => <option key={x.invoiceId || x.id} value={x.invoiceId || x.id}>{x.invNo} - {x.customerName} - {currency(x.balance)}</option>)}</select></label>
        <div className="modal-grid">
          <label>Amount<input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></label>
          <label>Method<select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>{['Cash', 'Bank Transfer', 'M-Pesa', 'Card', 'Cheque', 'Credit Account', 'Mobile Money', 'Mixed Payments'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Bank Account<select value={form.bankAccount} onChange={e => setForm({ ...form, bankAccount: e.target.value })}>{(bankAccounts || []).map(x => <option key={x.accountName} value={x.accountName}>{x.accountName} ({x.currency})</option>)}</select></label>
          <label>Reference<input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Transaction ref" /></label>
          <label>Cashier<input value={form.cashier} onChange={e => setForm({ ...form, cashier: e.target.value })} /></label>
          <label>Notes<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Optional notes" /></label>
        </div>
        <button className="primary-action" disabled={saving || !form.invoiceId}>{saving ? 'Posting...' : 'Receive Payment + Update AR'}</button>
      </form>
    </div>
  );
}

function QuotationTable({ user, rows, onChanged }) {
  const [busy, setBusy] = useState('');
  async function act(row, action) {
    setBusy(`${action}-${row.id}`);
    try {
      if (action === 'Send') {
        await rpc('sendQuotation', [user, row.id]);
      } else if (action === 'Accept') {
        await rpc('acceptQuotation', [user, row.id]);
      } else if (action === 'Reject') {
        await rpc('rejectQuotation', [user, row.id]);
      } else if (action === 'Convert') {
        await rpc('convertQuotationToSale', [user, row.id]);
      } else if (action === 'Duplicate') {
        await rpc('duplicateQuotation', [user, row.id]);
      } else if (action === 'Generate Invoice') {
        await rpc('generateInvoiceFromQuote', [user, row.id]);
      }
      onChanged?.();
    } catch (error) {
      alert(error.message || 'Action failed');
    } finally {
      setBusy('');
    }
  }
  function view(row) {
    alert(`Quotation ${row.quoteNo}\nCustomer: ${row.customerName}\nTotal: ${currency(row.total)}\nStatus: ${row.status}\nValid Until: ${row.validUntil || 'N/A'}`);
  }
  const enhancedRows = (rows || []).map(row => ({
    ...row,
    actions: (
      <div className="invoice-doc-actions">
        <button title="View quotation" onClick={() => view(row)}><FileText size={14} /> View</button>
        {row.status === 'Draft' && <button title="Send quotation" disabled={busy === `Send-${row.id}`} onClick={() => act(row, 'Send')}><Send size={14} /> Send</button>}
        {row.status === 'Sent' && <button title="Accept quotation" disabled={busy === `Accept-${row.id}`} onClick={() => act(row, 'Accept')}><CheckCircle2 size={14} /> Accept</button>}
        {row.status === 'Sent' && <button title="Reject quotation" disabled={busy === `Reject-${row.id}`} onClick={() => act(row, 'Reject')}><X size={14} /> Reject</button>}
        {(row.status === 'Accepted' || row.status === 'Sent') && <button title="Convert to order" disabled={busy === `Convert-${row.id}`} onClick={() => act(row, 'Convert')}><ArrowRight size={14} /> Convert</button>}
        <button title="Duplicate quotation" disabled={busy === `Duplicate-${row.id}`} onClick={() => act(row, 'Duplicate')}><Plus size={14} /> Duplicate</button>
        <button title="Generate invoice" disabled={busy === `Generate Invoice-${row.id}`} onClick={() => act(row, 'Generate Invoice')}><FileText size={14} /> Invoice</button>
      </div>
    )
  }));
  return <SimpleTable rows={enhancedRows} columns={['quoteNo', 'customerName', 'total', 'status', 'validUntil', 'createdAt', 'actions']} />;
}

function QuotationModal({ user, customers, onClose, onSaved }) {
  const defaultValidUntil = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const [form, setForm] = useState({ customerId: '', customerName: '', customerEmail: '', customerPhone: '', customerAddress: '', items: [{ productName: '', description: '', quantity: 1, unitPrice: 0 }], subtotal: 0, tax: 0, discount: 0, shipping: 0, total: 0, status: 'Draft', validUntil: defaultValidUntil, terms: '', notes: '', followUpDate: '', nextStep: '' });
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [isNewCustomer, setIsNewCustomer] = useState(false);

  function updateItems(nextItems) {
    const subtotal = nextItems.reduce((s, i) => s + (Number(i.quantity || 0) * Number(i.unitPrice || 0)), 0);
    const tax = Math.round(subtotal * 0.16);
    const discount = Number(form.discount || 0);
    const shipping = Number(form.shipping || 0);
    const total = subtotal + tax - discount + shipping;
    setForm(prev => ({ ...prev, items: nextItems, subtotal, tax, total }));
  }

  function addItem() {
    updateItems([...form.items, { productName: '', description: '', quantity: 1, unitPrice: 0 }]);
  }

  function removeItem(index) {
    const next = form.items.filter((_, i) => i !== index);
    updateItems(next.length ? next : [{ productName: '', description: '', quantity: 1, unitPrice: 0 }]);
  }

  function updateItem(index, field, value) {
    const next = form.items.map((item, i) => i === index ? { ...item, [field]: value } : item);
    updateItems(next);
  }

  async function save(asDraft) {
    setSaving(true);
    try {
      await rpc('saveQuotation', [user, { ...form, status: asDraft ? 'Draft' : 'Sent' }]);
      onSaved?.();
    } catch (error) {
      alert(error.message || 'Could not save quotation');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={e => { e.preventDefault(); save(true); }}>
        <header><h2>New Quotation</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="modal-grid">
          <label style={{ gridColumn: 'span 2' }}>
            <input type="checkbox" checked={isNewCustomer} onChange={e => setIsNewCustomer(e.target.checked)} style={{ marginRight: 6 }} />
            Create new customer (not in list)
          </label>
        </div>
        {!isNewCustomer ? (
          <label>Customer<select value={form.customerId} onChange={e => {
            const val = e.target.value;
            const cust = customers.find(c => c.id === val || c.customerName === val);
            setForm({ ...form, customerId: val, customerName: cust?.customerName || '', customerEmail: cust?.email || '', customerPhone: cust?.phone || '', customerAddress: cust?.address || '' });
          }} required><option value="">Select customer</option>{customers.map(c => <option key={c.id || c.customerName} value={c.id || c.customerName}>{c.customerName}</option>)}</select></label>
        ) : (
          <div className="modal-grid">
            <label>Customer Name<input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} required /></label>
            <label>Email<input type="email" value={form.customerEmail} onChange={e => setForm({ ...form, customerEmail: e.target.value })} /></label>
            <label>Phone<input value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} /></label>
          </div>
        )}
        {!isNewCustomer && <div className="modal-grid">
          <label>Customer Email<input type="email" value={form.customerEmail} onChange={e => setForm({ ...form, customerEmail: e.target.value })} /></label>
          <label>Customer Phone<input value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} /></label>
        </div>}
        <label>Customer Address<input value={form.customerAddress} onChange={e => setForm({ ...form, customerAddress: e.target.value })} /></label>
        <div className="modal-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label>Follow-up Date<input type="date" value={form.followUpDate} onChange={e => setForm({ ...form, followUpDate: e.target.value })} /></label>
          <label>Next Step<input value={form.nextStep} onChange={e => setForm({ ...form, nextStep: e.target.value })} placeholder="Follow-up action" /></label>
        </div>
        <div className="quote-items-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}><strong>Line Items</strong><button type="button" className="mini-action" onClick={addItem}><Plus size={14} /> Add Item</button></div>
        {form.items.map((item, index) => (
          <div key={index} className="modal-grid" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
            <label>Product<input value={item.productName} onChange={e => updateItem(index, 'productName', e.target.value)} placeholder="Product name" list="product-suggestions" />
              <datalist id="product-suggestions">
                <option value="Dairy Meal 16% 70kg" />
                <option value="Organic Neem Oil 1L" />
                <option value="Bactrolure Wick (Pack 50)" />
                <option value="Hybrid Maize Seed Duma 43" />
                <option value="NPK 20-20-0 Fertilizer 50kg" />
              </datalist>
            </label>
            <label>Qty<input type="number" min="1" value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} /></label>
            <label>Unit Price<input type="number" value={item.unitPrice} onChange={e => updateItem(index, 'unitPrice', e.target.value)} /></label>
            <label>Line Total<input readOnly value={currency(Number(item.quantity || 0) * Number(item.unitPrice || 0))} /></label>
            <button type="button" className="mini-action" onClick={() => removeItem(index)} style={{ marginBottom: 8 }}><X size={14} /></button>
          </div>
        ))}
        <div className="quote-totals" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
          <label>Subtotal<input readOnly value={currency(form.subtotal)} /></label>
          <label>Tax (16%)<input readOnly value={currency(form.tax)} /></label>
          <label>Discount<input type="number" value={form.discount} onChange={e => setForm(prev => { const discount = Number(e.target.value || 0); const total = prev.subtotal + prev.tax - discount + Number(prev.shipping || 0); return { ...prev, discount, total }; })} /></label>
          <label>Shipping<input type="number" value={form.shipping} onChange={e => setForm(prev => { const shipping = Number(e.target.value || 0); const total = prev.subtotal + prev.tax - Number(prev.discount || 0) + shipping; return { ...prev, shipping, total }; })} /></label>
        </div>
        <label>Total<input readOnly value={currency(form.total)} /></label>
        <div className="modal-grid">
          <label>Status<input readOnly value={form.status} /></label>
          <label>Valid Until<input type="date" value={form.validUntil} onChange={e => setForm({ ...form, validUntil: e.target.value })} /></label>
        </div>
        <label>Terms<input value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} placeholder="Payment terms, delivery, warranty..." /></label>
        <label>Notes<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Internal notes" /></label>
        <div className="invoice-actions-row" style={{ marginTop: 12 }}>
          <button className="primary-action" disabled={saving || sending} onClick={() => save(true)}>{saving ? 'Saving...' : 'Save as Draft'}</button>
          <button className="secondary-action" disabled={saving || sending} onClick={() => save(false)}><Send size={14} /> {sending ? 'Sending...' : 'Send Quotation'}</button>
        </div>
      </form>
    </div>
  );
}

const MODULE_REQUISITION_LABELS = {
  dashboard: 'General Requisition', analytics: 'Analytics Request', sales: 'Sales Requisition', purchasing: 'Purchase Requisition',
  inventory: 'Inventory Requisition', finance: 'Finance Request', accounts: 'Accounts Request', production: 'Production Material Request',
  customers: 'Customer Service Request', reports: 'Report Request', inputs: 'Input Request', notifications: 'Notification Request',
  email: 'Email Request', 'email-admin': 'Email Admin Request', hr: 'HR Request', leaves: 'Leave Request', requisitions: 'General Requisition'
};
const MODULE_LABELS = {
  dashboard: 'Dashboard', analytics: 'Analytics', sales: 'Sales', purchasing: 'Purchases', inventory: 'Inventory',
  finance: 'Finance', accounts: 'Accounts', production: 'Manufacturing', customers: 'CRM', reports: 'Reports',
  inputs: 'Inputs', notifications: 'Notifications', email: 'Email', 'email-admin': 'Email Admin', hr: 'HR', leaves: 'Leaves', requisitions: 'Requisitions'
};

function RequisitionModal({ user, module, onClose, onSaved }) {
  const moduleLabel = MODULE_LABELS[module] || module;
  const [form, setForm] = useState({
    module: moduleLabel,
    requestDate: new Date().toISOString().slice(0, 10),
    employee: user.name || '',
    email: user.email || '',
    branch: 'Nairobi',
    priority: 'Low',
    requestedTo: 'Managing Director',
    reason: '',
    description: '',
    requiredDate: '',
    comments: '',
    items: [{ item: '', description: '', quantity: 1, unit: 'PCS', estimatedPrice: 0 }]
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function updateItems(nextItems) {
    setForm(prev => ({ ...prev, items: nextItems }));
  }
  function addItem() {
    updateItems([...form.items, { item: '', description: '', quantity: 1, unit: 'PCS', estimatedPrice: 0 }]);
  }
  function removeItem(index) {
    const next = form.items.filter((_, i) => i !== index);
    updateItems(next.length ? next : [{ item: '', description: '', quantity: 1, unit: 'PCS', estimatedPrice: 0 }]);
  }
  function updateItem(index, field, value) {
    const next = form.items.map((item, i) => i === index ? { ...item, [field]: value } : item);
    updateItems(next);
  }
  const estimatedCost = form.items.reduce((sum, i) => sum + (Number(i.quantity || 0) * Number(i.estimatedPrice || 0)), 0);

  async function save(asDraft) {
    setSaving(true);
    try {
      const result = await rpc('createRequisition', [user, { ...form, estimatedCost }]);
      if (!asDraft) {
        setSubmitting(true);
        try {
          await rpc('submitRequisition', [user, result.requisition.id]);
        } catch (e) {
          alert('Created but submission failed: ' + e.message);
        }
        setSubmitting(false);
      }
      onSaved?.();
    } catch (e) {
      alert(e.message || 'Could not create requisition');
    } finally {
      setSaving(false);
    }
  }

  const priorityColors = { Low: '#22c55e', Medium: '#eab308', High: '#f97316', Urgent: '#ef4444' };

  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={e => { e.preventDefault(); save(true); }}>
        <header><h2>{MODULE_REQUISITION_LABELS[module] || 'Create Requisition'}</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="modal-grid">
          <label>Request Date<input type="date" value={form.requestDate} onChange={e => setForm({ ...form, requestDate: e.target.value })} /></label>
          <label>Employee<input value={form.employee} onChange={e => setForm({ ...form, employee: e.target.value })} /></label>
          <label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="requester@farmtrack.co.ke" /></label>
        </div>
        <div className="modal-grid">
          <label>Branch<input value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })} placeholder="e.g. Nairobi" /></label>
          <label>Module<input readOnly value={form.module} /></label>
        </div>
        <label>Priority
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {['Low', 'Medium', 'High', 'Urgent'].map(p => (
              <button key={p} type="button" style={{ background: form.priority === p ? priorityColors[p] : '#f2f4f7', color: form.priority === p ? '#fff' : '#344054', border: 'none', borderRadius: 6, padding: '6px 14px', fontWeight: 600, cursor: 'pointer' }} onClick={() => setForm({ ...form, priority: p })}>{p}</button>
            ))}
          </div>
        </label>
        <label>Requested To
          <select value={form.requestedTo} onChange={e => setForm({ ...form, requestedTo: e.target.value })}>
            {['Managing Director', 'Operations Manager', 'Store Manager', 'HR', 'Sales Manager', 'Finance', 'Administrator', 'Everyone'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label>Reason<textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} rows={3} placeholder="We require five new laptops for the development team." required /></label>
        <label>Description<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Detailed explanation of the request..." /></label>
        <div className="modal-grid">
          <label>Required Date<input type="date" value={form.requiredDate} onChange={e => setForm({ ...form, requiredDate: e.target.value })} /></label>
          <label>Estimated Cost<input readOnly value={currency(estimatedCost)} /></label>
        </div>
        <div className="quote-items-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <strong>Line Items</strong>
          <button type="button" className="mini-action" onClick={addItem}><Plus size={14} /> Add Item</button>
        </div>
        {form.items.map((item, index) => (
          <div key={index} className="modal-grid" style={{ gridTemplateColumns: '1.5fr 1fr 0.7fr 0.5fr 1fr auto', gap: 6, alignItems: 'end' }}>
            <label>Item<input value={item.item} onChange={e => updateItem(index, 'item', e.target.value)} placeholder="Item name" /></label>
            <label>Description<input value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} placeholder="Description" /></label>
            <label>Qty<input type="number" min="1" value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} /></label>
            <label>Unit<input value={item.unit} onChange={e => updateItem(index, 'unit', e.target.value)} placeholder="PCS" /></label>
            <label>Est. Price<input type="number" value={item.estimatedPrice} onChange={e => updateItem(index, 'estimatedPrice', e.target.value)} /></label>
            <button type="button" className="mini-action" onClick={() => removeItem(index)} style={{ marginBottom: 8 }}><X size={14} /></button>
          </div>
        ))}
        <label>Comments<textarea value={form.comments} onChange={e => setForm({ ...form, comments: e.target.value })} rows={2} placeholder="Optional comments..." /></label>
        <div className="invoice-actions-row" style={{ marginTop: 12 }}>
          <button className="primary-action" disabled={saving || submitting} onClick={() => save(true)}>{saving ? 'Saving...' : 'Save as Draft'}</button>
          <button className="secondary-action" disabled={saving || submitting} onClick={() => save(false)}><Send size={14} /> {submitting ? 'Submitting...' : 'Submit for Approval'}</button>
        </div>
      </form>
    </div>
  );
}

function RequisitionStatusBadge({ status }) {
  const colors = { Draft: '#98a2b3', Submitted: '#3b82f6', 'Pending Approval': '#f97316', Approved: '#22c55e', Rejected: '#ef4444', Completed: '#15803d' };
  const bg = colors[status] || '#98a2b3';
  return <span style={{ background: bg, color: '#fff', padding: '2px 10px', borderRadius: 4, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{status}</span>;
}

function RequisitionPriorityBadge({ priority }) {
  const colors = { Low: '#22c55e', Medium: '#eab308', High: '#f97316', Urgent: '#ef4444' };
  const bg = colors[priority] || '#98a2b3';
  return <span style={{ background: bg, color: '#fff', padding: '2px 10px', borderRadius: 4, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{priority}</span>;
}

function RequisitionsPage({ user, setPage }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);
  const [busy, setBusy] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const reqs = useServer(user, 'getRequisitions', [{ search, status: filterStatus, priority: filterPriority, module: filterModule }], [refreshKey, search, filterStatus, filterPriority, filterModule]);
  const dash = useServer(user, 'getRequisitionDashboard', [], [refreshKey]);

  if (reqs.loading) return <Loading title="Requisitions" />;
  if (reqs.error) return <ErrorState title="Requisitions" error={reqs.error} />;

  const requisitions = reqs.data || [];
  const d = dash.data || {};

  async function act(req, action) {
    setBusy(`${req.id}-${action}`);
    setStatusMsg('');
    try {
      if (action === 'Submit') {
        await rpc('submitRequisition', [user, req.id]);
        setStatusMsg(`${req.reqNo} submitted for approval`);
      } else if (action === 'Approve') {
        await rpc('approveRequisition', [user, req.id, 'Approved from ERP']);
        setStatusMsg(`${req.reqNo} approved`);
      } else if (action === 'Reject') {
        const reason = prompt('Reason for rejection:');
        if (reason === null) { setBusy(''); return; }
        await rpc('rejectRequisition', [user, req.id, reason]);
        setStatusMsg(`${req.reqNo} rejected`);
      } else if (action === 'Complete') {
        await rpc('completeRequisition', [user, req.id, 'Completed']);
        setStatusMsg(`${req.reqNo} marked as completed`);
      } else if (action === 'Download PDF') {
        const res = await rpc('generateRequisitionPdf', [user, req.id]);
        if (res.content) downloadBase64File(res);
        setStatusMsg(res.content ? 'PDF downloaded' : 'PDF failed');
      } else if (action === 'Email') {
        const to = prompt('Email address to send to:', req.requesterEmail || '');
        if (!to) { setBusy(''); return; }
        const res = await rpc('sendRequisitionEmail', [user, req.id, to]);
        setStatusMsg(res.sent ? `Email sent to ${to}` : 'Email failed');
      } else if (action === 'Print') {
        const res = await rpc('generateRequisitionPdf', [user, req.id]);
        if (res.content) openBase64File(res, true);
      } else if (action === 'WhatsApp') {
        const phone = prompt('Enter WhatsApp number (e.g. +254712345678):');
        if (!phone) { setBusy(''); return; }
        const msg = encodeURIComponent(`Requisition ${req.reqNo}\nPriority: ${req.priority}\nReason: ${req.reason}\nEstimated Cost: KES ${req.estimatedCost?.toLocaleString()}\nStatus: ${req.status}\n\nView at: https://erpftc.vercel.app/#/requisitions`);
        window.open(`https://wa.me/${phone.replace(/[^0-9+]/g, '')}?text=${msg}`, '_blank');
        setStatusMsg('WhatsApp opened');
      }
      setRefreshKey(k => k + 1);
      if (selectedReq?.id === req.id) {
        const updated = await rpc('getRequisitions', [user, { search: req.reqNo }]);
        const found = (updated || []).find(r => r.id === req.id);
        if (found) setSelectedReq(found);
      }
    } catch (e) {
      setStatusMsg(e.message || 'Action failed');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="page-stack">
      <div className="sales-hero">
        <div>
          <span>Approval & Records</span>
          <h1>Requisitions</h1>
          <p>Create, track, and manage requisitions across all modules. Approval workflow with email notifications.</p>
        </div>
        <div className="sales-hero-stats">
          <strong>{d.pendingApproval || 0}</strong><span>Pending</span>
          <strong>{currency(d.totalEstimatedValue || 0)}</strong><span>Total Value</span>
        </div>
      </div>
      <div className="inline-actions">
        <button onClick={() => setReqModalOpen(true)}><Plus size={16} /> Create Requisition</button>
      </div>
      <div className="control-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {[
          [Clock, 'Draft', d.draft || 0, 'blue'],
          [Hourglass, 'Pending Approval', d.pendingApproval || 0, 'orange'],
          [CheckCircle2, 'Approved Today', d.approvedToday || 0, 'green'],
          [AlertTriangle, 'Rejected Today', d.rejectedToday || 0, 'red'],
          [ClipboardCheck, 'Completed', d.completed || 0, 'green'],
          [CircleDollarSign, 'Total Value', currency(d.totalEstimatedValue || 0), 'blue']
        ].map(([Icon, label, value, tone]) => (
          <KpiCard key={label} icon={Icon} label={label} value={value} tone={tone} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="command-search" style={{ flex: 1, minWidth: 200 }}>
          <Search size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by ref, requester, reason..." />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d0d5dd' }}>
          <option value="">All Status</option>
          {['Draft', 'Submitted', 'Pending Approval', 'Approved', 'Rejected', 'Completed'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d0d5dd' }}>
          <option value="">All Priority</option>
          {['Low', 'Medium', 'High', 'Urgent'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterModule} onChange={e => setFilterModule(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d0d5dd' }}>
          <option value="">All Modules</option>
          {Object.values(MODULE_LABELS).filter(Boolean).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {statusMsg && <div className="quote-status-msg">{statusMsg}</div>}
      <div className="quote-workflow">
        {requisitions.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: '#667085' }}>No requisitions found</div>}
        {requisitions.map(req => (
          <article key={req.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedReq(req)}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <strong>{req.reqNo}</strong>
                <RequisitionPriorityBadge priority={req.priority} />
                <RequisitionStatusBadge status={req.status} />
              </div>
              <span style={{ color: '#667085' }}>{req.requester}{req.requesterEmail ? ` · ${req.requesterEmail}` : ''} · {req.module} · {req.requestedTo} · {req.requestDate}</span>
              <div style={{ color: '#344054', marginTop: 4 }}>{String(req.reason || '').slice(0, 100)}</div>
            </div>
            <b style={{ whiteSpace: 'nowrap' }}>{currency(req.estimatedCost)}</b>
            <div className="quote-actions" onClick={e => e.stopPropagation()}>
              {req.status === 'Draft' && <button disabled={busy === `${req.id}-Submit`} onClick={() => act(req, 'Submit')}><Send size={14} /> Submit</button>}
              {req.status === 'Pending Approval' && (
                <>
                  <button disabled={busy === `${req.id}-Approve`} onClick={() => act(req, 'Approve')} style={{ color: '#22c55e' }}><CheckCircle2 size={14} /> Approve</button>
                  <button disabled={busy === `${req.id}-Reject`} onClick={() => act(req, 'Reject')} style={{ color: '#ef4444' }}><X size={14} /> Reject</button>
                </>
              )}
              {req.status === 'Approved' && <button disabled={busy === `${req.id}-Complete`} onClick={() => act(req, 'Complete')}><CheckCircle2 size={14} /> Complete</button>}
              <button disabled={busy === `${req.id}-Download PDF`} onClick={() => act(req, 'Download PDF')}><Download size={14} /> PDF</button>
              <button disabled={busy === `${req.id}-Email`} onClick={() => act(req, 'Email')}><Mail size={14} /> Email</button>
              <button disabled={busy === `${req.id}-Print`} onClick={() => act(req, 'Print')}><Printer size={14} /> Print</button>
              <button disabled={busy === `${req.id}-WhatsApp`} onClick={() => act(req, 'WhatsApp')}><Phone size={14} /> WhatsApp</button>
            </div>
          </article>
        ))}
      </div>
      {reqModalOpen && <RequisitionModal user={user} module="requisitions" onClose={() => setReqModalOpen(false)} onSaved={() => { setReqModalOpen(false); setRefreshKey(k => k + 1); }} />}
      {selectedReq && (
        <div className="modal-backdrop" onClick={() => setSelectedReq(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <header><h2>{selectedReq.reqNo}</h2><button type="button" onClick={() => setSelectedReq(null)}><X size={18} /></button></header>
            <div className="modal-grid" style={{ marginBottom: 12 }}>
              <div><span style={{ color: '#667085', fontSize: 12 }}>Requester</span><div><strong>{selectedReq.requester}</strong></div></div>
              <div><span style={{ color: '#667085', fontSize: 12 }}>Email</span><div>{selectedReq.requesterEmail || 'N/A'}</div></div>
              <div><span style={{ color: '#667085', fontSize: 12 }}>Employee</span><div>{selectedReq.employee}</div></div>
              <div><span style={{ color: '#667085', fontSize: 12 }}>Branch</span><div>{selectedReq.branch}</div></div>
              <div><span style={{ color: '#667085', fontSize: 12 }}>Module</span><div>{selectedReq.module}</div></div>
              <div><span style={{ color: '#667085', fontSize: 12 }}>Requested To</span><div>{selectedReq.requestedTo}</div></div>
              <div><span style={{ color: '#667085', fontSize: 12 }}>Required Date</span><div>{selectedReq.requiredDate || 'N/A'}</div></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <RequisitionPriorityBadge priority={selectedReq.priority} />
              <RequisitionStatusBadge status={selectedReq.status} />
            </div>
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <strong>Reason:</strong><div>{selectedReq.reason}</div>
              {selectedReq.description && <><strong style={{ marginTop: 8, display: 'block' }}>Description:</strong><div>{selectedReq.description}</div></>}
            </div>
            {(selectedReq.items?.length > 0) && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 13 }}>
                <thead><tr style={{ background: '#f2f4f7' }}>
                  <th style={{ padding: 8, textAlign: 'left' }}>Item</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Description</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: 8 }}>Unit</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Price</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Total</th>
                </tr></thead>
                <tbody>
                  {selectedReq.items.map((item, i) => (
                    <tr key={i} style={{ background: i % 2 ? '#f9fafb' : '#fff' }}>
                      <td style={{ padding: 8 }}>{item.item}</td>
                      <td style={{ padding: 8 }}>{item.description}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{item.quantity}</td>
                      <td style={{ padding: 8 }}>{item.unit}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{currency(item.estimatedPrice)}</td>
                      <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{currency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ fontWeight: 700, textAlign: 'right', fontSize: 16, marginBottom: 12 }}>Estimated Total: {currency(selectedReq.estimatedCost)}</div>
            {selectedReq.approvedBy && <div style={{ color: '#22c55e', marginBottom: 8 }}>Approved by {selectedReq.approvedBy} on {selectedReq.approvedDate?.slice(0, 10)}</div>}
            {selectedReq.rejectedBy && <div style={{ color: '#ef4444', marginBottom: 8 }}>Rejected by {selectedReq.rejectedBy} on {selectedReq.rejectedDate?.slice(0, 10)}: {selectedReq.rejectedReason}</div>}
            {(selectedReq.auditTrail?.length > 0) && (
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: 12 }}>
                <strong>Audit Trail</strong>
                {selectedReq.auditTrail.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #f2f4f7', fontSize: 12 }}>
                    <span style={{ color: '#667085' }}>{a.timestamp?.slice(0, 16)}</span>
                    <span style={{ fontWeight: 600 }}>{a.action}</span>
                    <span>{a.user}</span>
                    <span style={{ color: '#667085' }}>{a.notes}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="invoice-actions-row" style={{ marginTop: 12 }}>
              {selectedReq.status === 'Draft' && <button className="primary-action" disabled={busy} onClick={() => act(selectedReq, 'Submit')}><Send size={14} /> Submit</button>}
              {selectedReq.status === 'Pending Approval' && (
                <>
                  <button className="primary-action" disabled={busy} onClick={() => act(selectedReq, 'Approve')} style={{ background: '#22c55e' }}><CheckCircle2 size={14} /> Approve</button>
                  <button className="secondary-action" disabled={busy} onClick={() => act(selectedReq, 'Reject')} style={{ background: '#ef4444', color: '#fff' }}><X size={14} /> Reject</button>
                </>
              )}
              {selectedReq.status === 'Approved' && <button className="primary-action" disabled={busy} onClick={() => act(selectedReq, 'Complete')}><CheckCircle2 size={14} /> Complete</button>}
              <button className="secondary-action" disabled={busy} onClick={() => act(selectedReq, 'Download PDF')}><Download size={14} /> PDF</button>
              <button className="secondary-action" disabled={busy} onClick={() => act(selectedReq, 'Email')}><Mail size={14} /> Email</button>
              <button className="secondary-action" disabled={busy} onClick={() => act(selectedReq, 'Print')}><Printer size={14} /> Print</button>
              <button className="secondary-action" disabled={busy} onClick={() => act(selectedReq, 'WhatsApp')}><Phone size={14} /> WhatsApp</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CreateRequisitionButton({ user, module }) {
  const [open, setOpen] = useState(false);
  const label = MODULE_REQUISITION_LABELS[module] || 'Create Requisition';
  return (
    <>
      <button className="secondary-action" style={{ marginLeft: 8 }} onClick={() => setOpen(true)} title={label}><ClipboardCheck size={14} /> Requisition</button>
      {open && <RequisitionModal user={user} module={module} onClose={() => setOpen(false)} onSaved={() => setOpen(false)} />}
    </>
  );
}

function DashboardRequisitionWidget({ user }) {
  const dash = useServer(user, 'getRequisitionDashboard', [], []);
  if (dash.loading || dash.error) return null;
  const d = dash.data || {};
  return (
    <Panel className="span-12" title="Requisition Overview" action={<button className="mini-action" onClick={() => window.location.hash = '/requisitions'}><ClipboardCheck size={14} /> View All</button>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        {[
          ['Draft', d.draft || 0, '#98a2b3'],
          ['Pending Approval', d.pendingApproval || 0, '#f97316'],
          ['Approved Today', d.approvedToday || 0, '#22c55e'],
          ['Rejected Today', d.rejectedToday || 0, '#ef4444'],
          ['Completed', d.completed || 0, '#15803d']
        ].map(([label, count, color]) => (
          <div key={label} style={{ background: '#f9fafb', borderRadius: 8, padding: 12, textAlign: 'center' }}>
            <div style={{ color, fontWeight: 700, fontSize: 20 }}>{count}</div>
            <div style={{ color: '#667085', fontSize: 12 }}>{label}</div>
          </div>
        ))}
        <div style={{ background: '#f0f9ff', borderRadius: 8, padding: 12, textAlign: 'center', gridColumn: 'span 2' }}>
          <div style={{ color: '#050505', fontWeight: 700, fontSize: 18 }}>{currency(d.totalEstimatedValue || 0)}</div>
          <div style={{ color: '#667085', fontSize: 12 }}>Total Estimated Value</div>
        </div>
      </div>
    </Panel>
  );
}

function CustomerStatementModal({ user, customers, onClose, onSaved }) {
  const [customerId, setCustomerId] = useState('');
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function generate() {
    if (!customerId) return;
    setLoading(true);
    try {
      const result = await rpc('generateCustomerStatement', [user, customerId]);
      setStatement(result);
    } catch (error) {
      alert(error.message || 'Could not generate statement');
    } finally {
      setLoading(false);
    }
  }

  async function exportStatement(format) {
    if (!statement) return;
    setExporting(true);
    try {
      const file = await rpc('exportCustomerStatement', [user, customerId, format]);
      handleGeneratedFile(file, format);
    } catch (error) {
      alert(error.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const selectedCustomer = customers.find(c => c.id === customerId || c.customerName === customerId);
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <header><h2>Generate Customer Statement</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <label>Customer<select value={customerId} onChange={e => { setCustomerId(e.target.value); setStatement(null); }}><option value="">Select customer</option>{customers.map(c => <option key={c.id || c.customerName} value={c.id || c.customerName}>{c.customerName}</option>)}</select></label>
        <button className="primary-action" disabled={!customerId || loading} onClick={generate}>{loading ? 'Generating...' : 'Generate Statement'}</button>
        {statement && (
          <div className="statement-preview" style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#f9fafb' }}>
            <h3>{selectedCustomer?.customerName || customerId}</h3>
            <p>Generated: {new Date(statement.generatedAt).toLocaleString()}</p>
            <SimpleTable rows={statement.lines || []} columns={['date', 'type', 'reference', 'debit', 'credit', 'balance']} />
            {statement.overdue && statement.overdue.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong>Overdue Invoices</strong>
                <SimpleTable rows={statement.overdue} columns={['invNo', 'date', 'amount', 'daysOverdue']} />
              </div>
            )}
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Closing Balance: {currency(statement.closingBalance || 0)}</strong>
              <div className="invoice-actions-row">
                <button className="secondary-action" disabled={exporting} onClick={() => exportStatement('PDF')}><Download size={14} /> PDF</button>
                <button className="secondary-action" disabled={exporting} onClick={() => exportStatement('Print')}><Printer size={14} /> Print</button>
                <button className="secondary-action" disabled={exporting} onClick={() => exportStatement('Email')}><Mail size={14} /> Email</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportDateControls({ filters, setFilters }) {
  const applyPeriod = days => {
    setFilters({
      ...filters,
      startDate: new Date(Date.now() - days * 86400000).toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10)
    });
  };
  return (
    <div className="report-filter-bar">
      <button type="button" onClick={() => applyPeriod(7)}>Weekly</button>
      <button type="button" onClick={() => applyPeriod(30)}>Monthly</button>
      <button type="button" onClick={() => applyPeriod(90)}>Quarterly</button>
      <button type="button" onClick={() => applyPeriod(365)}>Yearly</button>
      <label>Start Date<input type="date" value={filters.startDate || ''} onChange={e => setFilters({ ...filters, startDate: e.target.value })} /></label>
      <label>End Date<input type="date" value={filters.endDate || ''} onChange={e => setFilters({ ...filters, endDate: e.target.value })} /></label>
    </div>
  );
}

function Reports({ user, setPage, title, globalPeriod = 'Month' }) {
  const tabs = ['executive', 'sales', 'inventory', 'manufacturing', 'procurement', 'finance', 'customers', 'hr', 'custom'];
  const [activeTab, setActiveTab] = useRouteTab('reports', tabs, 'executive');
  const [filters, setFilters] = useState(() => ({ ...periodToReportDates(globalPeriod), module: 'Executive', status: 'All Statuses' }));
  useEffect(() => {
    setFilters(prev => ({ ...prev, ...periodToReportDates(globalPeriod) }));
  }, [globalPeriod]);
  const [emailOpen, setEmailOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [outputFormat, setOutputFormat] = useState('PDF');
  const [reportQuery, setReportQuery] = useState('');
  const [customLayout, setCustomLayout] = useState(() => {
    try { return JSON.parse(localStorage.getItem('erp-dashboard-layout') || '[]'); } catch { return []; }
  });
  const reportState = useServer(user, 'getReportCenterData', [filters], [JSON.stringify(filters)]);
  const { loading, data, error } = reportState;
  if (loading) return <Loading title={title} />;
  if (error) return <ErrorState title={title} error={error} />;
  const selectedModule = filters.module || 'Executive';
  const normalizedQuery = reportQuery.trim().toLowerCase();
  const visibleReports = data.reports
    .filter(report => selectedModule === 'Executive' || report.module === selectedModule || report.module === 'Executive')
    .filter(report => !normalizedQuery || `${report.name} ${report.module}`.toLowerCase().includes(normalizedQuery));
  async function exportReport(format, overrideFilters = filters) {
    const file = await rpc('generateReportExport', [user, overrideFilters, format]);
    handleGeneratedFile(file, format);
  }
  async function previewReport() {
    const file = await rpc('generateReportExport', [user, filters, 'PDF']);
    openHtmlFile(file);
  }
  const tabModuleMap = {
    executive: 'Executive',
    sales: 'Sales',
    inventory: 'Inventory',
    manufacturing: 'Manufacturing',
    procurement: 'Procurement',
    finance: 'Financial',
    customers: 'Customer',
    hr: 'Payroll'
  };
  const tabReports = data.reports.filter(r => activeTab === 'executive' || activeTab === 'custom' ? true : r.module === tabModuleMap[activeTab] || r.module === 'Executive');
  const executiveKpis = [
    { label: 'Revenue', value: data.kpis.find(k => k.label.toLowerCase().includes('revenue'))?.value || 0, type: 'money' },
    { label: 'Expenses', value: data.kpis.find(k => k.label.toLowerCase().includes('expense'))?.value || 0, type: 'money' },
    { label: 'Profit', value: data.kpis.find(k => k.label.toLowerCase().includes('profit'))?.value || 0, type: 'money' },
    { label: 'Cash Flow', value: data.kpis.find(k => k.label.toLowerCase().includes('cash'))?.value || 0, type: 'money' },
    { label: 'Gross Margin', value: data.kpis.find(k => k.label.toLowerCase().includes('gross'))?.value || 0, type: 'percent', suffix: '%' },
    { label: 'Net Margin', value: data.kpis.find(k => k.label.toLowerCase().includes('net'))?.value || 0, type: 'percent', suffix: '%' },
    { label: 'Sales Growth', value: data.kpis.find(k => k.label.toLowerCase().includes('growth'))?.value || 0, type: 'percent', suffix: '%' },
    { label: 'Inventory Value', value: data.kpis.find(k => k.label.toLowerCase().includes('inventory'))?.value || 0, type: 'money' },
    { label: 'Manufacturing Cost', value: data.kpis.find(k => k.label.toLowerCase().includes('manufacturing'))?.value || 0, type: 'money' },
    { label: 'Customer Growth', value: data.kpis.find(k => k.label.toLowerCase().includes('customer'))?.value || 0, type: 'number' },
    { label: 'Employee Productivity', value: data.kpis.find(k => k.label.toLowerCase().includes('productivity'))?.value || 0, type: 'number' },
    { label: 'Procurement Performance', value: data.kpis.find(k => k.label.toLowerCase().includes('procurement'))?.value || 0, type: 'number' }
  ];
  const departmentKpiMap = {
    sales: ['Revenue', 'Sales Growth', 'Orders', 'Avg Order Value'],
    inventory: ['Inventory Value', 'Stock Count', 'Low Stock', 'Turnover'],
    manufacturing: ['Planned Output', 'Actual Output', 'Delayed Jobs', 'Waste'],
    procurement: ['Spend', 'PO Count', 'Lead Time', 'Delivery Accuracy'],
    finance: ['Cash Flow', 'Expenses', 'Profit', 'Net Margin'],
    customers: ['Customer Growth', 'Churn Risk', 'Lifetime Value', 'Satisfaction'],
    hr: ['Headcount', 'Attendance', 'Productivity', 'Payroll Cost']
  };
  const widgetOptions = ['Revenue Overview', 'Expense Breakdown', 'Sales Funnel', 'Inventory Health', 'Production Efficiency', 'Procurement Spend', 'Customer Growth', 'AR/AP Aging', 'Cash Flow', 'Bank Balances', 'Tax Summary', 'Budget Variance'];
  function toggleWidget(widget) {
    setCustomLayout(prev => {
      const next = prev.includes(widget) ? prev.filter(w => w !== widget) : [...prev, widget];
      return next;
    });
  }
  function saveLayout() {
    localStorage.setItem('erp-dashboard-layout', JSON.stringify(customLayout));
  }
  function resetLayout() {
    setCustomLayout([]);
    localStorage.removeItem('erp-dashboard-layout');
  }
  return (
    <section className="page-stack">
      <div className="sales-hero reports-hero">
        <div>
          <span>Enterprise Reporting Engine</span>
          <h1>Report Center</h1>
          <p>Generate, export, print, email, schedule, and archive filtered ERP reports from live business records.</p>
        </div>
        <div className="sales-hero-stats">
          <strong>{data.rows.length}</strong><span>Rows</span>
          <strong>{currency(data.kpis[1]?.value || 0)}</strong><span>Value</span>
          <strong>{data.reports.length}</strong><span>Reports</span>
        </div>
      </div>
      <div className="inline-actions"><CreateRequisitionButton user={user} module="reports" /></div>

      <div className="analytics-tabs">
        {tabs.map(id => <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>{label(id)}</button>)}
      </div>
      <label className="analytics-tab-select">View
        <select value={activeTab} onChange={e => setActiveTab(e.target.value)}>
          {tabs.map(id => <option key={id} value={id}>{label(id)}</option>)}
        </select>
      </label>

      <div className="analytics-filter-bar">
        <div className="analytics-filter-row primary">
          <strong>Viewing {globalPeriod}: {filters.startDate} to {filters.endDate}</strong>
          {['Weekly', 'Monthly', 'Quarterly', 'Yearly'].map(period => <button key={period} className={filters.period === period ? 'active' : ''} onClick={() => setFilters({ ...filters, period })}>{period}</button>)}
          <label>From<input type="date" value={filters.startDate || ''} onChange={e => setFilters({ ...filters, startDate: e.target.value })} /></label>
          <label>To<input type="date" value={filters.endDate || ''} onChange={e => setFilters({ ...filters, endDate: e.target.value })} /></label>
        </div>
        <div className="analytics-filter-row secondary">
          <label>Module<select value={filters.module} onChange={e => setFilters({ ...filters, module: e.target.value })}>{data.modules.map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Status<select value={filters.status || 'All Statuses'} onChange={e => setFilters({ ...filters, status: e.target.value })}>{['All Statuses', 'Active', 'Open', 'Paid', 'Partial', 'Delivered', 'Pending'].map(x => <option key={x}>{x}</option>)}</select></label>
          <ExportFormatStrip formats={REPORT_FORMATS} onExport={exportReport} />
        </div>
      </div>

      {activeTab === 'executive' && (
        <>
          <div className="analytics-kpi-row">
            {executiveKpis.map(kpi => (
              <article key={kpi.label}>
                <span>{kpi.label}</span>
                <strong>{kpi.type === 'money' ? currency(kpi.value) : `${kpi.value}${kpi.suffix || ''}`}</strong>
              </article>
            ))}
          </div>
          <ExecutiveDashboardCharts data={data.chartData} />
          <div className="dashboard-grid">
            <Panel className="span-8" title="Available Reports" action={`${data.reports.length} templates`}>
              <div className="report-template-toolbar">
                <div className="report-search-box">
                  <Search size={16} />
                  <input value={reportQuery} onChange={e => setReportQuery(e.target.value)} placeholder="Search reports..." />
                </div>
                <span>{visibleReports.length} shown / {data.reports.length} total</span>
              </div>
              <div className="report-template-grid">
                {visibleReports.map(report => (
                  <button key={report.id} className={data.activeReport.name === report.name ? 'active' : ''} onClick={() => setFilters({ ...filters, module: report.module, reportName: report.name })}>
                    <strong>{report.name}</strong>
                    <span>{report.module} / {report.records} records / {report.layout ? label(report.layout) : 'Standard'}</span>
                  </button>
                ))}
                {!visibleReports.length && <div className="empty-reports">No reports match this module or search.</div>}
              </div>
            </Panel>
            <Panel className="span-4" title="Report Library" action="QuickBooks style">
              <div className="report-library-list">
                {data.categories.map(category => <button key={category} onClick={() => setFilters({ ...filters, module: category.includes('Sales') ? 'Sales' : category.includes('Customer') ? 'Customer' : category.includes('Inventory') ? 'Inventory' : category.includes('Procurement') ? 'Procurement' : category.includes('Manufacturing') ? 'Manufacturing' : category.includes('Finance') ? 'Financial' : category.includes('Payroll') ? 'Payroll' : category.includes('Tax') ? 'Tax' : category.includes('Delivery') ? 'Delivery' : 'Executive' })}><FileText size={16} />{category}</button>)}
              </div>
            </Panel>
            <Panel className="span-7 sales-main-chart" title={data.activeReport.name} action={data.activeReport.dateRange}>
              <SalesTrendChart data={data.trend} metric="value" />
            </Panel>
            <Panel className="span-5" title="Output Center" action="Downloadable">
              <div className="report-output-center">
                <label>Output Format<select value={outputFormat} onChange={e => setOutputFormat(e.target.value)}>{data.formats.map(x => <option key={x}>{x}</option>)}</select></label>
                <div>
                  <ExportButton format="PDF" onClick={previewReport}>Preview</ExportButton>
                  <ExportButton format={outputFormat} primary onClick={() => exportReport(outputFormat)}>Download</ExportButton>
                  <ExportButton format="Print" onClick={() => exportReport('Print')}>Print</ExportButton>
                  <ExportButton format="Email Package" onClick={() => setEmailOpen(true)}>Email</ExportButton>
                  <ExportButton format="Schedule" onClick={() => setScheduleOpen(true)}>Schedule</ExportButton>
                  <ExportButton format="ZIP Bundle" onClick={() => exportReport('ZIP Bundle')}>Package</ExportButton>
                </div>
              </div>
            </Panel>
            <Panel className="span-12" title="All Export Formats">
              <div className="report-action-grid wide">
                <ExportFormatStrip formats={REPORT_FORMATS} onExport={exportReport} />
              </div>
            </Panel>
            <Panel className="span-12" title="Filtered Report Data" action={`${data.activeTemplate?.layout ? label(data.activeTemplate.layout) : 'Standard'} / preview ${data.previewLimit || 25} of ${data.totalRows || data.rows.length}`}>
              <SimpleTable rows={data.rows} columns={Object.keys(data.rows[0] || { type: '', reference: '', date: '', status: '', value: '' }).slice(0, 8)} />
              <div className="report-data-footnote">
                <span>Preview is optimized for speed.</span>
                <strong>Exports include all {Number(data.totalRows || data.rows.length).toLocaleString()} matching rows.</strong>
              </div>
            </Panel>
            <Panel className="span-6" title="Report Archive">
              <ReportArchive rows={data.archive} onDownload={entry => exportReport(entry.format, { ...(entry.filters || filters), reportName: entry.reportName, module: entry.module })} />
            </Panel>
            <Panel className="span-6" title="Scheduled Reports">
              <SimpleTable rows={data.schedules} columns={['reportName', 'format', 'schedule', 'recipients', 'status']} />
            </Panel>
          </div>
        </>
      )}

      {['sales', 'inventory', 'manufacturing', 'procurement', 'finance', 'customers', 'hr'].includes(activeTab) && (
        <div className="dashboard-grid">
          <div className="span-12 analytics-kpi-row">
            {(departmentKpiMap[activeTab] || []).map(kpiLabel => {
              const found = data.kpis.find(k => k.label.toLowerCase().includes(kpiLabel.toLowerCase()));
              const value = found ? (found.type === 'money' ? currency(found.value) : `${found.value}${found.suffix || ''}`) : '-';
              return (
                <article key={kpiLabel}>
                  <span>{kpiLabel}</span>
                  <strong>{value}</strong>
                </article>
              );
            })}
          </div>
          <Panel className="span-12" title={`${label(activeTab)} Reports`} action={<ExportFormatStrip formats={REPORT_FORMATS} onExport={exportReport} />}>
            <div className="report-template-toolbar">
              <div className="report-search-box">
                <Search size={16} />
                <input value={reportQuery} onChange={e => setReportQuery(e.target.value)} placeholder="Search reports..." />
              </div>
              <span>{tabReports.length} shown / {data.reports.length} total</span>
            </div>
            <div className="report-template-grid">
              {tabReports.map(report => (
                <button key={report.id} className={data.activeReport.name === report.name ? 'active' : ''} onClick={() => setFilters({ ...filters, module: report.module, reportName: report.name })}>
                  <strong>{report.name}</strong>
                  <span>{report.module} / {report.records} records / {report.layout ? label(report.layout) : 'Standard'}</span>
                </button>
              ))}
              {!tabReports.length && <div className="empty-reports">No reports for this department.</div>}
            </div>
            <SimpleTable rows={tabReports.map((r, i) => ({ id: i, name: r.name, module: r.module, records: r.records, layout: r.layout ? label(r.layout) : 'Standard' }))} columns={['name', 'module', 'records', 'layout']} />
          </Panel>
          <Panel className="span-6" title="Report Archive">
            <ReportArchive rows={data.archive} onDownload={entry => exportReport(entry.format, { ...(entry.filters || filters), reportName: entry.reportName, module: entry.module })} />
          </Panel>
          <Panel className="span-6" title="Scheduled Reports">
            <SimpleTable rows={data.schedules} columns={['reportName', 'format', 'schedule', 'recipients', 'status']} />
          </Panel>
        </div>
      )}

      {activeTab === 'custom' && (
        <div className="dashboard-grid">
          <Panel className="span-4" title="Dashboard Builder">
            <div className="report-library-list">
              {widgetOptions.map(widget => (
                <label key={widget} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={customLayout.includes(widget)} onChange={() => toggleWidget(widget)} />
                  <span>{widget}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="primary-action" onClick={saveLayout}>Save Layout</button>
              <button onClick={resetLayout}>Reset Layout</button>
            </div>
          </Panel>
          <Panel className="span-8" title="Custom Dashboard" action={<ExportFormatStrip formats={REPORT_FORMATS} onExport={exportReport} />}>
            <div className="dashboard-grid">
              {customLayout.length === 0 && <div className="empty-reports span-12">Select widgets from the builder to customize your dashboard.</div>}
              {customLayout.map(widget => (
                <Panel key={widget} className="span-4" title={widget}>
                  <div className="kpi-card" style={{ padding: 16 }}>
                    <strong>{widget}</strong>
                    <p style={{ marginTop: 8, color: '#667085' }}>Widget data loads from backend when connected.</p>
                  </div>
                </Panel>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {emailOpen && <ReportEmailModal user={user} filters={filters} reportName={data.activeReport.name} onClose={() => setEmailOpen(false)} />}
      {scheduleOpen && <ReportScheduleModal user={user} filters={filters} reportName={data.activeReport.name} onClose={() => setScheduleOpen(false)} />}
    </section>
  );
}


function ReportEmailModal({ user, filters, reportName, onClose }) {
  const [form, setForm] = useState({ recipient: '', subject: reportName, message: 'Please find the attached ERP report.', format: 'PDF' });
  const [saving, setSaving] = useState(false);
  async function send(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('emailReport', [user, { ...form, reportName, filters }]);
      onClose();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={send}>
        <header><h2>Email Report</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <label>Recipient<input value={form.recipient} onChange={e => setForm({ ...form, recipient: e.target.value })} required /></label>
        <label>Subject<input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></label>
        <label>Message<input value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} /></label>
        <label>Format<select value={form.format} onChange={e => setForm({ ...form, format: e.target.value })}>{['PDF', 'Excel', 'CSV', 'PowerPoint'].map(x => <option key={x}>{x}</option>)}</select></label>
        <button className="primary-action" disabled={saving}>{saving ? 'Queueing...' : 'Queue Email'}</button>
      </form>
    </div>
  );
}

function ReportArchive({ rows, onDownload }) {
  if (!rows.length) return <div className="quiet-state">No generated reports archived yet. Download or preview a report to create an archive entry.</div>;
  return (
    <div className="report-archive-list">
      {rows.map(entry => (
        <article key={entry.id || entry.fileName}>
          <div>
            <strong>{entry.reportName}</strong>
            <span>{entry.module} · {entry.format} · {entry.records} records</span>
            <em>{entry.fileName}</em>
          </div>
          <button onClick={() => onDownload(entry)}>Download</button>
        </article>
      ))}
    </div>
  );
}

function ReportScheduleModal({ user, filters, reportName, onClose }) {
  const [form, setForm] = useState({ reportName, recipients: '', format: 'PDF', schedule: 'Weekly' });
  const [saving, setSaving] = useState(false);
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('scheduleReport', [user, { ...form, filters }]);
      onClose();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={save}>
        <header><h2>Schedule Report</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <label>Recipients<input value={form.recipients} onChange={e => setForm({ ...form, recipients: e.target.value })} required /></label>
        <div className="modal-grid">
          <label>Format<select value={form.format} onChange={e => setForm({ ...form, format: e.target.value })}>{['PDF', 'Excel', 'CSV', 'PowerPoint'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Schedule<select value={form.schedule} onChange={e => setForm({ ...form, schedule: e.target.value })}>{['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'].map(x => <option key={x}>{x}</option>)}</select></label>
        </div>
        <button className="primary-action" disabled={saving}>{saving ? 'Saving...' : 'Create Schedule'}</button>
      </form>
    </div>
  );
}

const pageInputDefaults = {
  sales: 'sale',
  purchasing: 'purchaseRequest',
  inventory: 'inventory',
  finance: 'expense',
  accounts: 'journal',
  production: 'rawMaterial',
  customers: 'customer',
  reports: 'journal',
  analytics: 'sale',
  dashboard: 'sale'
};

function lookupForInput(data, key) {
  if (key === 'customerId') return data.lookups.customers;
  if (key === 'supplierId') return data.lookups.suppliers;
  if (key === 'productId') return data.lookups.products;
  if (key === 'invoiceId') return data.lookups.invoices;
  if (key === 'debitAccountId' || key === 'creditAccountId') return data.lookups.accounts;
  if (key === 'warehouseName' || key === 'warehouse') return data.lookups.warehouses;
  if (key === 'unit') return data.lookups.uoms;
  if (key === 'materialId') return data.lookups.rawMaterials;
  if (key === 'productionOrderId') return data.lookups.productionOrders;
  return null;
}

function inputKind(field) {
  const key = field.toLowerCase();
  if (key.includes('date')) return 'date';
  if (['amount', 'quantity', 'price', 'stock', 'cost', 'paid', 'limit', 'qty'].some(x => key.includes(x))) return 'number';
  if (key.includes('email')) return 'email';
  return 'text';
}

function isRequiredInput(field) {
  const key = field.toLowerCase();
  return ['name', 'amount', 'quantity', 'productname', 'materialname', 'title', 'customerid', 'productid'].some(x => key.includes(x));
}

function GlobalInputOverlay({ user, page, onClose }) {
  const [module, setModule] = useState(pageInputDefaults[page] || 'customer');
  const [form, setForm] = useState({});
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { loading, data, error } = useServer(user, 'getInputCenterData', [], [refreshKey]);
  const active = data?.modules?.find(x => x.id === module) || data?.modules?.[0];

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      const response = await rpc('submitERPInput', [user, module, form]);
      setResult(response);
      setForm({});
      setRefreshKey(x => x + 1);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="modal-card input-overlay-card">
        <header>
          <div>
            <h2>New ERP Record</h2>
            <p>Create live records without leaving this page.</p>
          </div>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </header>
        {loading && <div className="loading-card"><Loader2 className="spin" /> Loading input types...</div>}
        {error && <div className="error-card"><AlertTriangle size={18} /> {error}</div>}
        {active && (
          <>
            <div className="quick-input-modules">
              {data.modules.map(item => <button key={item.id} className={module === item.id ? 'active' : ''} onClick={() => { setModule(item.id); setForm({}); setResult(null); }}>{item.label}</button>)}
            </div>
            <form className="input-form-grid quick-input-form" onSubmit={submit}>
              {active.fields.map(field => {
                const lookup = lookupForInput(data, field);
                const value = form[field] || '';
                return (
                  <label key={field}>{label(field)}
                    {lookup ? (
                      <select value={value} onChange={e => setForm({ ...form, [field]: e.target.value })} required={isRequiredInput(field)}>
                        <option value="">Select {label(field)}</option>
                        {lookup.map(option => <option key={option.id || option.name} value={option.id || option.name}>{option.name}</option>)}
                      </select>
                    ) : (
                      <input type={inputKind(field)} value={value} onChange={e => setForm({ ...form, [field]: e.target.value })} required={isRequiredInput(field)} />
                    )}
                  </label>
                );
              })}
              <button className="primary-action" disabled={saving}>{saving ? 'Submitting...' : `Submit ${active.label}`}</button>
            </form>
            {result && (
              <div className="quick-input-result">
                <CheckCircle2 size={18} />
                <div>
                  <strong>{active.label} saved</strong>
                  <span>{result.saleNo || result.deliveryId || result.invoiceId || result.id || 'Record created and synced'}</span>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function InputCenter({ user, setPage }) {
  const [module, setModule] = useState('customer');
  const [form, setForm] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const { loading, data, error } = useServer(user, 'getInputCenterData', [], [refreshKey]);
  if (loading) return <Loading title="Inputs" />;
  if (error) return <ErrorState title="Inputs" error={error} />;
  const active = data.modules.find(x => x.id === module) || data.modules[0];
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      const response = await rpc('submitERPInput', [user, module, form]);
      setResult(response);
      setForm({});
      setRefreshKey(x => x + 1);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="page-stack">
      <div className="sales-hero input-hero">
        <div>
          <span>Reliable Data Intake</span>
          <h1>ERP Input Center</h1>
          <p>Enter operational records once. The backend routes the input, creates business events, updates ledgers where needed, and keeps an audit trail.</p>
        </div>
        <div className="sales-hero-stats">
          <strong>{data.modules.length}</strong><span>Input Types</span>
          <strong>{data.recentEvents.length}</strong><span>Events</span>
          <strong>{data.audit.length}</strong><span>Audit</span>
        </div>
      </div>
      <div className="inline-actions"><CreateRequisitionButton user={user} module="inputs" /></div>
      <div className="dashboard-grid">
        <Panel className="span-5" title="Input Type">
          <div className="input-type-grid">
            {data.modules.map(item => <button key={item.id} className={module === item.id ? 'active' : ''} onClick={() => { setModule(item.id); setForm({}); setResult(null); }}>{item.label}</button>)}
          </div>
        </Panel>
        <Panel className="span-7" title={`${active.label} Form`} action="Validated submit">
          <form className="input-form-grid" onSubmit={submit}>
            {active.fields.map(field => {
              const lookup = lookupForInput(data, field);
              const value = form[field] || '';
              return (
                <label key={field}>{label(field)}
                  {lookup ? (
                    <select value={value} onChange={e => setForm({ ...form, [field]: e.target.value })} required>
                      <option value="">Select {label(field)}</option>
                      {lookup.map(option => <option key={option.id || option.name} value={option.id || option.name}>{option.name}</option>)}
                    </select>
                  ) : (
                    <input type={inputKind(field)} value={value} onChange={e => setForm({ ...form, [field]: e.target.value })} required={isRequiredInput(field)} />
                  )}
                </label>
              );
            })}
            <button className="primary-action" disabled={saving}>{saving ? 'Submitting...' : `Submit ${active.label}`}</button>
          </form>
          {result && <div className="quick-input-result inline-result"><CheckCircle2 size={18} /><div><strong>{active.label} saved</strong><span>{result.saleNo || result.deliveryId || result.invoiceId || result.id || 'Record created and synced'}</span></div></div>}
        </Panel>
        <Panel className="span-6" title="Recent Business Events"><SimpleTable rows={data.recentEvents} columns={['eventType', 'aggregateType', 'aggregateId', 'status', 'createdByName', 'createdAt']} /></Panel>
        <Panel className="span-6" title="Input Audit Trail"><SimpleTable rows={data.audit} columns={['userName', 'action', 'module', 'details', 'createdAt']} /></Panel>
      </div>
    </section>
  );
}

function SettingsPage({ user }) {
  const tabs = ['company', 'email', 'users', 'permissions', 'departments', 'warehouses', 'products', 'manufacturing', 'procurement', 'inventory', 'sales', 'finance', 'tax', 'notifications', 'templates', 'automation', 'integrations', 'spreadsheets', 'supabase', 'audit', 'security', 'backup', 'data', 'api', 'health', 'advanced'];
  const [view, setView] = useRouteTab('settings', tabs, 'company');
  const [refreshKey, setRefreshKey] = useState(0);
  const [companyForm, setCompanyForm] = useState({});
  const [userModal, setUserModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [testEmailTo, setTestEmailTo] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [emailLog, setEmailLog] = useState([]);
  const { loading, data, error } = useServer(user, 'getSettingsWorkspaceData', [], [refreshKey]);
  const hasInitializedForm = useRef(false);
  useEffect(() => {
    if (data?.settings && !hasInitializedForm.current) {
      hasInitializedForm.current = true;
      setCompanyForm(data.settings);
    }
  }, [data?.settings]);
  // Load email log when email tab is selected — MUST be before early returns to obey React Rules of Hooks
  useEffect(() => {
    if (view === 'email') {
      rpc('getEmailLog', [user, { limit: 50 }]).then(r => setEmailLog(r.emails || [])).catch(() => {});
    }
  }, [view]);
  if (loading) return <Loading title="Settings" />;
  if (error) return <ErrorState title="Settings" error={error} />;
  const refresh = () => setRefreshKey(x => x + 1);
  async function saveCompany(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('saveSettingsSection', [user, 'company', companyForm]);
      setMessage('Company settings saved successfully.');
      refresh();
    } finally {
      setSaving(false);
    }
  }
  async function handleSendTest() {
    setSendingTest(true);
    setTestResult(null);
    try {
      const result = await rpc('sendTestEmail', [user, { to: testEmailTo || undefined }]);
      setTestResult(result);
      const log = await rpc('getEmailLog', [user, { limit: 20 }]);
      setEmailLog(log.emails || []);
    } catch (err) {
      setTestResult({ sent: false, error: err.message });
    } finally {
      setSendingTest(false);
    }
  }
  const rulesForView = data?.rules?.[view] || [];
  const companyGroups = [
    ['Company Identity', [['company_name', 'Company Name'], ['website', 'Website'], ['business_registration_no', 'Business Registration No.'], ['company_qr_url', 'QR Code Image URL (PostImage)'], ['invoice_logo_url', 'Invoice Logo/Image URL']]],
    ['Contact Details', [['company_address', 'Company Address'], ['company_phone', 'Phone Numbers'], ['company_email', 'Email Addresses']]],
    ['Tax & Compliance', [['kra_pin', 'Tax PIN'], ['vat_number', 'VAT Number']]],
    ['Localization', [['default_currency', 'Default Currency'], ['default_language', 'Default Language'], ['default_timezone', 'Default Timezone'], ['date_format', 'Date Format'], ['number_format', 'Number Format']]],
    ['Banking & Payments', [['bank_name', 'Bank Name'], ['bank_account', 'Bank Account'], ['mpesa_paybill', 'M-Pesa Paybill'], ['mpesa_account', 'M-Pesa Account']]],
    ['Documents', [['invoice_footer', 'Invoice Footer'], ['invoice_comment', 'Invoice Comment'], ['invoice_terms', 'Invoice Terms']]]
  ];
  return (
    <section className="page-stack settings-workspace">
      <div className="sales-hero settings-hero">
        <div>
          <span>Enterprise System Control Center</span>
          <h1>Settings</h1>
          <p>Control company profile, users, roles, permissions, workflows, integrations, security, backups, templates, API access, and operational rules from one administration center.</p>
        </div>
        <div className="sales-hero-stats">
          <strong>{data?.users?.length || 0}</strong><span>Users</span>
          <strong>{data?.health?.records || 0}</strong><span>Records</span>
          <strong>{data?.health?.businessEvents || 0}</strong><span>Events</span>
        </div>
      </div>

      <div className="settings-tabs">
        {tabs.map(tab => <button key={tab} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}>{label(tab)}</button>)}
      </div>

      {view === 'company' && (
        <div className="dashboard-grid">
          <Panel className="span-12" title="Company Settings" action="Editable">
            <form className="settings-form-grid company-settings-form" onSubmit={saveCompany}>
              {companyGroups.map(([group, fields]) => (
                <fieldset key={group} className="settings-fieldset">
                  <legend>{group}</legend>
                  <div>
                    {fields.map(([key, name]) => (
                      <label key={key}>{name}<input value={companyForm[key] || ''} onChange={e => setCompanyForm({ ...companyForm, [key]: e.target.value })} /></label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <button className="primary-action" disabled={saving}>{saving ? 'Saving...' : 'Save Company Settings'}</button>
            </form>
            {message && <div className="settings-save-message"><CheckCircle2 size={18} />{message}</div>}
          </Panel>
          <Panel className="span-6" title="Branding Preview">
            <div className="settings-brand-preview">
              <div>FT</div>
              <strong>{companyForm.company_name || data.settings.company_name}</strong>
              <span>{companyForm.company_email || data.settings.company_email}</span>
              <em>{companyForm.default_currency || 'KSh'} / {companyForm.default_timezone || 'Africa/Nairobi'}</em>
            </div>
            {(companyForm.company_qr_url || data.settings.company_qr_url) ? (
              <div className="qr-badge-wrap" style={{ marginTop: 14 }}>
                <img src={companyForm.company_qr_url || data.settings.company_qr_url} alt="Company QR code" onError={e => { e.target.style.display = 'none'; }} />
                <div className="qr-meta">
                  <strong><QrCode size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Company QR</strong>
                  <span>Shows on invoices & receipts</span>
                </div>
              </div>
            ) : (
              <div className="qr-badge-wrap" style={{ marginTop: 14, opacity: .6 }}>
                <div style={{ width: 64, height: 64, display: 'grid', placeItems: 'center', background: '#f5f6f8', borderRadius: 8, color: '#cbd2db' }}><QrCode size={28} /></div>
                <div className="qr-meta"><strong>No QR code yet</strong><span>Add a PostImage URL above</span></div>
              </div>
            )}
          </Panel>
          <Panel className="span-6" title="System Health">
            <div className="settings-kv-grid">
              <article><span>Users</span><strong>{data?.users?.length || 0}</strong></article>
              <article><span>Records</span><strong>{data?.health?.records || 0}</strong></article>
              <article><span>Events</span><strong>{data?.health?.businessEvents || 0}</strong></article>
              <article><span>Status</span><strong>Active</strong></article>
            </div>
          </Panel>
        </div>
      )}

      {view === 'email' && (
        <div className="dashboard-grid">
          <Panel className="span-6" title="Email Integration (Resend)" action="Configured">
            <div className="settings-form-grid" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e4e7ec', borderRadius: 12, padding: 16 }}>
                <strong style={{ color: '#101828' }}>✓ Resend Connected</strong>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#344054' }}>From: <strong>erpintergration@gmail.com</strong><br/>API key configured in Vercel</p>
              </div>
              <h3 style={{ margin: 0, fontSize: 15 }}>Emails are sent automatically for:</h3>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#475467', lineHeight: 2 }}>
                <li><strong>Sales Orders</strong> — invoice + order confirmation to customer</li>
                <li><strong>Payments</strong> — receipt to customer when payment is recorded</li>
                <li><strong>Leave Applied</strong> — approval request email to managers</li>
                <li><strong>Leave Approved/Rejected</strong> — decision notification to applicant</li>
                <li><strong>Low Stock</strong> — alert to managers when inventory drops below reorder level</li>
              </ul>
              <div>
                <label>Send test email to:<input type="email" value={testEmailTo} onChange={e => setTestEmailTo(e.target.value)} placeholder="your@email.com" /></label>
                <button className="primary-action" disabled={sendingTest} onClick={handleSendTest}>
                  {sendingTest ? 'Sending...' : <><Mail size={16} /> Send Test Email</>}
                </button>
                {testResult && <p style={{ margin: '8px 0 0', fontSize: 12, color: testResult.sent ? '#101828' : '#d92d20' }}>{testResult.sent ? '✓ Email sent successfully!' : '✗ ' + (testResult.error || 'Failed')}</p>}
              </div>
            </div>
          </Panel>
          <Panel className="span-6" title="Email Log" action="Recent sends">
            {emailLog.length === 0 && <div className="empty-state">No emails sent yet. Trigger an action like creating a sale or applying for leave.</div>}
            <div className="table-wrap">
              <table className="crm-calls-table">
                <thead><tr><th>To</th><th>Template</th><th>Status</th><th>Time</th></tr></thead>
                <tbody>
                  {emailLog.slice(0, 20).map(e => (
                    <tr key={e.id}>
                      <td><strong>{e.to}</strong></td>
                      <td><span style={{ fontSize: 11, background: '#f5f6f8', padding: '2px 8px', borderRadius: 6 }}>{e.template}</span></td>
                      <td><span className={e.status === 'sent' ? 'status active' : 'status cancelled'}>{e.status}</span></td>
                      <td style={{ fontSize: 12, color: '#667085' }}>{e.createdAt ? new Date(e.createdAt).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
      {view === 'users' && (
        <div className="dashboard-grid">
          <Panel className="span-12" title="Users & Roles" action="Create, edit, deactivate">
            <div className="settings-toolbar"><button onClick={() => setUserModal({})}><Plus size={16} /> New User</button><span>Assign departments, warehouses, counties, roles, and status.</span></div>
            <SimpleTable rows={data.users} columns={['name', 'email', 'role', 'department', 'warehouse', 'county', 'status', 'lastLogin']} />
          </Panel>
        </div>
      )}

      {view === 'permissions' && (
        <div className="dashboard-grid">
          <Panel className="span-5" title="Permission Actions"><SettingsPillList items={data.permissionActions} /></Panel>
          <Panel className="span-7" title="Role Permission Matrix"><SimpleTable rows={data.permissionMatrix} columns={['role', 'view', 'create', 'edit', 'approve', 'export', 'delete', 'manage']} /></Panel>
          <Panel className="span-12" title="Modules Controlled"><SettingsPillList items={data.modules} /></Panel>
        </div>
      )}

      {view === 'departments' && <SettingsTable title="Departments" rows={data.departments} columns={['name', 'manager', 'members', 'status']} />}
      {view === 'warehouses' && <SettingsTable title="Warehouse Settings" rows={data.warehouses} columns={['name', 'location', 'manager', 'utilization', 'status']} />}
      {view === 'products' && <ProductPricingSettings user={user} settings={data.settings} products={data.products || []} onSaved={msg => { setMessage(msg); refresh(); }} />}
      {['manufacturing', 'procurement', 'inventory', 'sales', 'finance'].includes(view) && <SettingsRules user={user} section={view} onSaved={setMessage} title={`${label(view)} Rules`} items={rulesForView} />}
      {view === 'tax' && <SettingsRules user={user} section={view} onSaved={setMessage} title="Tax Settings" items={['VAT setup', 'Withholding tax rules', 'Filing periods', 'Tax report templates', 'KRA PIN controls', 'Tax audit trail']} />}
      {view === 'notifications' && <SettingsTable title="Notification Settings" rows={data.notifications} columns={['channel', 'event', 'status']} />}
      {view === 'templates' && <SettingsTable title="Document Templates" rows={data.documentTemplates} columns={['name', 'version', 'status']} />}
      {view === 'automation' && <SettingsRules user={user} section={view} onSaved={setMessage} title="Workflow Automation" items={['Sales quote approval', 'Purchase order approval', 'Production start material reservation', 'Delivery confirmation workflow', 'Finance posting automation', 'Low stock alerts']} />}
      {view === 'integrations' && <SettingsTable title="Integrations" rows={data.integrations} columns={['name', 'status', 'detail']} />}
      {view === 'spreadsheets' && <SpreadsheetIntegrationPanel user={user} />}
      {view === 'supabase' && <SupabaseIntegrationPanel user={user} />}
      {view === 'audit' && (
        <div className="dashboard-grid">
          <Panel className="span-6" title="Recent Audit Trail"><SimpleTable rows={data.recentAudit} columns={['userName', 'action', 'module', 'details', 'createdAt']} /></Panel>
          <Panel className="span-6" title="Business Events"><SimpleTable rows={data.recentEvents} columns={['eventType', 'aggregateType', 'aggregateId', 'status', 'createdByName', 'createdAt']} /></Panel>
        </div>
      )}
      {view === 'security' && <SettingsKeyValues title="Security" data={data.security} />}
      {view === 'backup' && <SettingsTable title="Backup & Recovery" rows={data.backups} columns={['name', 'schedule', 'status']} />}
      {view === 'data' && <SettingsRules user={user} section={view} onSaved={setMessage} title="Data Management" items={['CSV import', 'Excel export', 'Archive old records', 'Clean duplicate records', 'Data retention policy', 'Department data ownership']} />}
      {view === 'api' && <SettingsTable title="API Settings" rows={data.apiSettings} columns={['name', 'scope', 'status']} />}
      {view === 'health' && <SettingsKeyValues title="System Health" data={data.health} />}
      {view === 'advanced' && <SettingsTable title="Advanced Feature Flags" rows={data.advancedFlags} columns={['name', 'enabled']} />}

      <Panel title="Settings Map" action={`${data.systemSections.length} sections`}>
        <div className="settings-section-map">
          {data.systemSections.map(section => <article key={section.id}><strong>{section.name}</strong><span>{section.detail}</span><em>{section.status}</em></article>)}
        </div>
      </Panel>
      {userModal && <SettingsUserModal user={user} meta={data} onClose={() => setUserModal(null)} onSaved={() => { setUserModal(null); refresh(); }} />}
    </section>
  );
}

function SettingsTable({ title, rows, columns }) {
  return <Panel title={title}><SimpleTable rows={rows} columns={columns} /></Panel>;
}

function ProductPricingSettings({ user, settings = {}, products = [], onSaved }) {
  const [form, setForm] = useState({
    product_default_markup_percent: settings.product_default_markup_percent || '35',
    product_default_vat_mode: settings.product_default_vat_mode || 'auto',
    product_price_rounding: settings.product_price_rounding || 'nearest-shilling',
    product_default_unit: settings.product_default_unit || 'unit'
  });
  const [saving, setSaving] = useState(false);
  const previewRows = products.slice(0, 12).map(product => {
    const markup = num(form.product_default_markup_percent);
    const suggested = num(product.costPrice) ? Math.round(num(product.costPrice) * (1 + markup / 100)) : num(product.sellingPrice);
    return { ...product, suggestedPrice: suggested, margin: suggested ? Math.round(((suggested - num(product.costPrice)) / suggested) * 100) + '%' : '0%' };
  });
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('saveSettingsSection', [user, 'products', form]);
      onSaved?.('Product pricing defaults saved.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="dashboard-grid">
      <Panel className="span-5" title="Product Pricing Defaults" action="Editable">
        <form className="settings-form-grid product-pricing-form" onSubmit={save}>
          <label>Default Markup %
            <input type="number" min="0" step="0.5" value={form.product_default_markup_percent} onChange={e => setForm({ ...form, product_default_markup_percent: e.target.value })} />
          </label>
          <label>Default VAT Mode
            <select value={form.product_default_vat_mode} onChange={e => setForm({ ...form, product_default_vat_mode: e.target.value })}>
              <option value="auto">Auto from product/invoice</option>
              <option value="none">No VAT</option>
              <option value="vat16">VAT 16%</option>
            </select>
          </label>
          <label>Price Rounding
            <select value={form.product_price_rounding} onChange={e => setForm({ ...form, product_price_rounding: e.target.value })}>
              <option value="nearest-shilling">Nearest shilling</option>
              <option value="nearest-10">Nearest 10</option>
              <option value="nearest-50">Nearest 50</option>
            </select>
          </label>
          <label>Default Unit
            <input value={form.product_default_unit} onChange={e => setForm({ ...form, product_default_unit: e.target.value })} placeholder="unit, bag, kg, litre" />
          </label>
          <button className="primary-action" disabled={saving}>{saving ? 'Saving...' : 'Save Product Pricing'}</button>
        </form>
      </Panel>
      <Panel className="span-7" title="Product Price Preview" action={`${products.length} products`}>
        <SimpleTable rows={previewRows} columns={['name', 'sku', 'category', 'unit', 'costPrice', 'sellingPrice', 'suggestedPrice', 'margin']} />
      </Panel>
      <Panel className="span-12" title="Product Controls">
        <div className="settings-rule-grid">
          {['Product categories', 'Units of measure', 'KG / G / MG conversions', 'Litres / ML conversions', 'Pieces / Boxes / Cartons', 'Barcode settings', 'QR code settings', 'Product number generation'].map(item => (
            <article key={item}><CheckCircle2 size={17} /><span>{item}</span><button type="button" onClick={() => onSaved?.(`${item} ready in pricing settings.`)}>Ready</button></article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function SettingsRules({ user, section, title, items, onSaved }) {
  const [active, setActive] = useState('');
  async function configure(item) {
    setActive(item);
    await rpc('saveSettingsSection', [user, section || title, { selectedRule: item, status: 'Configured' }]);
    onSaved?.(`${item} configured.`);
    setActive('');
  }
  return (
    <Panel title={title} action={`${items.length} controls`}>
      <div className="settings-rule-grid">
        {items.map(item => <article key={item}><CheckCircle2 size={17} /><span>{item}</span><button onClick={() => configure(item)} disabled={active === item}>{active === item ? 'Saving...' : 'Configure'}</button></article>)}
      </div>
    </Panel>
  );
}

function SettingsPillList({ items }) {
  return <div className="settings-pill-list">{items.map(item => <span key={item}>{item}</span>)}</div>;
}

function SettingsKeyValues({ title, data }) {
  return (
    <Panel title={title}>
      <div className="settings-kv-grid">
        {Object.entries(data || {}).map(([key, value]) => <article key={key}><span>{label(key)}</span><strong>{String(value)}</strong></article>)}
      </div>
    </Panel>
  );
}

function SpreadsheetIntegrationPanel({ user }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const { loading, data, error } = useServer(user, 'getSpreadsheetIntegrationStatus', [], [refreshKey]);
  const first = data?.connections?.[0] || {};
  const [form, setForm] = useState({});
  useEffect(() => {
    if (first?.id) setForm({
      id: first.id,
      name: first.name || '',
      provider: first.provider || 'Google Sheets',
      spreadsheetId: first.spreadsheetId || '',
      workbookName: first.workbookName || '',
      defaultSheet: first.defaultSheet || 'ERP Export',
      syncDirection: first.syncDirection || 'Export Only',
      modules: (first.modules || []).join(', ')
    });
  }, [first?.id]);
  if (loading) return <Loading title="Spreadsheet Integration" />;
  if (error) return <ErrorState title="Spreadsheet Integration" error={error} />;
  async function saveConnection(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await rpc('saveSpreadsheetConnection', [user, form]);
      setMessage('Spreadsheet connection saved.');
      setRefreshKey(x => x + 1);
    } catch (err) {
      setMessage(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }
  async function testExport(module = 'Reports') {
    setExporting(true);
    setMessage('');
    try {
      const file = await rpc('generateSpreadsheetExport', [user, { module, sheetName: form.defaultSheet || `${module} Export` }]);
      downloadBase64File(file);
      setMessage(file.google ? `${module} synced to Google Sheets with ${file.rows} rows.` : `${module} spreadsheet export generated with ${file.rows} rows.`);
      setRefreshKey(x => x + 1);
    } catch (err) {
      setMessage(err?.message || String(err));
    } finally {
      setExporting(false);
    }
  }
  async function runGoogleAction(action) {
    setExporting(true);
    setMessage('');
    try {
      let result;
      if (action === 'inventory-export') result = await rpc('exportInventoryToGoogleSheets', [user, { sheetName: 'Inventory' }]);
      if (action === 'items-import') result = await rpc('importItemsFromGoogleSheets', [user, { sheetName: 'Items' }]);
      if (action === 'stock-sync') result = await rpc('syncStockWithGoogleSheets', [user, { sheetName: 'Inventory', direction: form.syncDirection || 'Two Way Review' }]);
      if (action === 'sync-all') result = await rpc('syncAllToGoogleSheets', [user, { spreadsheetId: form.spreadsheetId }]);
      setMessage(result?.log?.message || (result?.synced ? `${result.synced.length} sheets synced to Google Sheets.` : 'Google Sheets action completed.'));
      setRefreshKey(x => x + 1);
    } catch (err) {
      setMessage(err?.message || String(err));
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="dashboard-grid spreadsheet-workspace">
      <Panel className="span-7" title="Spreadsheet Connector" action={data.configured ? 'Configured' : 'Ready'}>
        <form className="settings-form-grid compact" onSubmit={saveConnection}>
          <fieldset className="settings-fieldset">
            <legend>Connection</legend>
            <div>
              <label>Name<input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
              <label>Provider<select value={form.provider || 'Google Sheets'} onChange={e => setForm({ ...form, provider: e.target.value })}>{data.supportedProviders.map(x => <option key={x}>{x}</option>)}</select></label>
              <label>Spreadsheet ID<input value={form.spreadsheetId || ''} onChange={e => setForm({ ...form, spreadsheetId: e.target.value })} placeholder="Google Sheet ID" /></label>
              <label>Workbook Name<input value={form.workbookName || ''} onChange={e => setForm({ ...form, workbookName: e.target.value })} /></label>
              <label>Default Sheet<input value={form.defaultSheet || ''} onChange={e => setForm({ ...form, defaultSheet: e.target.value })} /></label>
              <label>Sync Direction<select value={form.syncDirection || 'Export Only'} onChange={e => setForm({ ...form, syncDirection: e.target.value })}>{['Export Only', 'Import Only', 'Two Way Review'].map(x => <option key={x}>{x}</option>)}</select></label>
            </div>
          </fieldset>
          <fieldset className="settings-fieldset">
            <legend>Modules</legend>
            <label>Comma separated modules<input value={form.modules || ''} onChange={e => setForm({ ...form, modules: e.target.value })} placeholder="Reports, Sales, Inventory, Finance" /></label>
          </fieldset>
          <button className="primary-action" disabled={saving}>{saving ? 'Saving...' : 'Save Spreadsheet Connector'}</button>
        </form>
        {message && <div className={`supabase-message ${message.toLowerCase().includes('error') ? 'warn' : ''}`}>{message}</div>}
      </Panel>
      <Panel className="span-5" title="Export Test">
        <div className="spreadsheet-export-grid">
          {['Reports', 'Sales', 'Inventory', 'Finance', 'Accounts', 'CRM', 'Procurement', 'Manufacturing'].map(module => (
            <button key={module} disabled={exporting} onClick={() => testExport(module)}><FileText size={16} /> {module}</button>
          ))}
        </div>
        <p className="supabase-help">{data.note}</p>
      </Panel>
      <Panel className="span-6" title="Live Google Sheets Actions" action={data.serviceAccountConfigured ? 'Service Account Ready' : 'Needs Service Account'}>
        <div className="spreadsheet-export-grid">
          <button disabled={exporting || !form.spreadsheetId} onClick={() => runGoogleAction('inventory-export')}><Upload size={16} /> Export Inventory</button>
          <button disabled={exporting || !form.spreadsheetId} onClick={() => runGoogleAction('items-import')}><Download size={16} /> Import Items</button>
          <button disabled={exporting || !form.spreadsheetId} onClick={() => runGoogleAction('stock-sync')}><RefreshCw size={16} /> Sync Stock</button>
          <button disabled={exporting || !form.spreadsheetId} onClick={() => runGoogleAction('sync-all')}><CheckCircle2 size={16} /> Sync Everything</button>
        </div>
        <p className="supabase-help">Share your Google Sheet with erp-sheets-integration-ftc@erp-sheets-integration-499106.iam.gserviceaccount.com, then save its Spreadsheet ID here.</p>
      </Panel>
      <Panel className="span-6" title="Sheet Mapping"><SimpleTable rows={data.mappings} columns={['module', 'sheetName', 'source', 'mode']} /></Panel>
      <Panel className="span-6" title="Spreadsheet Sync Logs"><SimpleTable rows={data.logs} columns={['module', 'sheetName', 'direction', 'rowsProcessed', 'status', 'createdAt']} /></Panel>
    </div>
  );
}

function SupabaseIntegrationPanel({ user }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const { loading, data, error } = useServer(user, 'getSupabaseIntegrationStatus', [], [refreshKey]);
  if (loading) return <Loading title="Supabase Integration" />;
  if (error) return <ErrorState title="Supabase Integration" error={error} />;
  const missingTables = data?.normalized?.missingTables || [];
  const normalizedReady = !!data?.normalized?.ready;
  const bridgeReady = !!data?.bridge?.ready;
  const pages = data?.pages || [];
  const totalSynced = data?.lastNormalizedSync?.synced
    ? Object.values(data.lastNormalizedSync.synced).reduce((sum, value) => sum + Number(value || 0), 0)
    : 0;

  async function syncNow() {
    setSyncing(true);
    setMessage('');
    try {
      const result = await rpc('syncSupabaseNormalized', [user]);
      const synced = Object.values(result?.synced || {}).reduce((sum, value) => sum + Number(value || 0), 0);
      setMessage(`Normalized Supabase sync completed. ${synced.toLocaleString()} records were checked and written.`);
      setRefreshKey(x => x + 1);
    } catch (err) {
      setMessage(err?.message || String(err));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="dashboard-grid supabase-workspace">
      <Panel className="span-12" title="Supabase Connection" action={normalizedReady ? 'Normalized live' : bridgeReady ? 'Bridge live' : 'Needs setup'}>
        <div className="supabase-actions">
          <button onClick={() => setRefreshKey(x => x + 1)}><RefreshCw size={16} /> Refresh Status</button>
          <button onClick={syncNow} disabled={syncing || !bridgeReady}><CheckCircle2 size={16} /> {syncing ? 'Syncing...' : 'Sync Normalized Tables'}</button>
          <span>{data?.time ? `Checked ${new Date(data.time).toLocaleString()}` : 'Connection status ready'}</span>
        </div>
        {message && <div className={`supabase-message ${message.toLowerCase().includes('missing') || message.toLowerCase().includes('error') ? 'warn' : ''}`}>{message}</div>}
      </Panel>

      <div className="span-12 supabase-status-grid">
        <article className={bridgeReady ? 'ready' : 'warn'}>
          <CheckCircle2 size={22} />
          <span>JSON Bridge</span>
          <strong>{bridgeReady ? 'Connected' : 'Not Connected'}</strong>
          <em>{data?.bridge?.table || 'erp_state'} persistence table</em>
        </article>
        <article className={normalizedReady ? 'ready' : 'warn'}>
          {normalizedReady ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
          <span>Normalized Tables</span>
          <strong>{normalizedReady ? 'Ready' : `${missingTables.length} Missing`}</strong>
          <em>{normalizedReady ? 'Live row-level modules can sync' : 'Run supabase-normalized-core.sql first'}</em>
        </article>
        <article className={totalSynced ? 'ready' : 'neutral'}>
          <Activity size={22} />
          <span>Last Normalized Sync</span>
          <strong>{totalSynced.toLocaleString()}</strong>
          <em>records written during the last sync</em>
        </article>
      </div>

      {!normalizedReady && (
        <Panel className="span-5" title="Missing Supabase Tables" action={`${missingTables.length} required`}>
          <div className="supabase-missing-list">
            {missingTables.map(table => <span key={table}>{table}</span>)}
          </div>
          <p className="supabase-help">Open Supabase SQL Editor and run <strong>supabase-normalized-core.sql</strong>. After that, come back here and press <strong>Sync Normalized Tables</strong>.</p>
        </Panel>
      )}

      <Panel className={normalizedReady ? 'span-12' : 'span-7'} title="Page Integration Map" action={`${pages.length} workspaces`}>
        <SimpleTable rows={pages} columns={['page', 'interactions', 'mode']} />
      </Panel>
    </div>
  );
}

function SettingsUserModal({ user, meta, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: meta.roles[0] || 'Sales Officer', status: 'Active', department: meta.departments[0]?.name || 'Sales', warehouse: 'All', county: 'Nairobi' });
  const [saving, setSaving] = useState(false);
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpc('saveSettingsUser', [user, form]);
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={save}>
        <header><h2>New ERP User</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="modal-grid">
          <label>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Phone<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Role<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{meta.roles.map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Department<select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>{meta.departments.map(x => <option key={x.id}>{x.name}</option>)}</select></label>
          <label>Warehouse<select value={form.warehouse} onChange={e => setForm({ ...form, warehouse: e.target.value })}>{['All', ...meta.warehouses.map(x => x.name)].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>County<input value={form.county} onChange={e => setForm({ ...form, county: e.target.value })} /></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{['Active', 'Inactive'].map(x => <option key={x}>{x}</option>)}</select></label>
        </div>
        <button className="primary-action" disabled={saving}>{saving ? 'Saving...' : 'Create User'}</button>
      </form>
    </div>
  );
}

// ─── Shared: lightweight modal for add/edit forms ───
function ModalCard({ title, onClose, children, wide }) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className={`modal-card ${wide ? 'wide' : ''}`} onClick={e => e.stopPropagation()}>
        <header><h2>{title}</h2><button onClick={onClose}><X size={20} /></button></header>
        {children}
      </div>
    </div>
  );
}

// ─── NOTIFICATION CENTER ───
function NotificationCenter({ user, setPage }) {
  const tabs = ['all', 'critical', 'unread', 'inventory', 'manufacturing', 'procurement', 'sales', 'crm', 'finance', 'accounting', 'payroll', 'reports', 'security', 'system', 'archived'];
  const [view, setView] = useRouteTab('notifications', tabs, 'all');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const { loading, data, error } = useServer(user, 'getNotificationCenterData', [{ category: view, search, priority: priorityFilter }], [refreshKey]);
  const handleAction = async (n, action, extra) => {
    try {
      const fn = { acknowledge: 'acknowledgeNotification', snooze: 'snoozeNotification', archive: 'archiveNotification', 'approve-leave': 'resolveNotificationAction', 'reject-leave': 'resolveNotificationAction' }[action] || action;
      const args = fn === 'resolveNotificationAction' ? [user, n.id, action, extra] : fn === 'snoozeNotification' ? [user, n.id, extra?.hours || 24] : [user, n.id];
      await rpc(fn, args);
      setRefreshKey(k => k + 1);
    } catch (err) { console.error(err); }
  };
  const markAllRead = async () => { try { await rpc('markNotificationsRead', [user]); setRefreshKey(k => k + 1); } catch {} };
  if (loading) return <Loading title="Notifications" />;
  if (error) return <ErrorState title="Notifications" error={error} />;
  const s = data.stats;
  return (
    <section className="page-stack">
      <div className="sales-hero">
        <div><span>Operations Monitoring & Alert Center</span><h1>Notifications</h1><p>Live alerts from every ERP module — inventory, sales, finance, HR, security, and system health.</p></div>
        <div className="sales-hero-stats">
          <strong>{s.total}</strong><span>Total</span>
          <strong style={{ color: s.unread ? '#f64e4e' : undefined }}>{s.unread}</strong><span>Unread</span>
          <strong style={{ color: s.critical ? '#f64e4e' : undefined }}>{s.critical}</strong><span>Critical</span>
          <strong>{s.archived}</strong><span>Archived</span>
        </div>
      </div>
      <div className="inline-actions"><CreateRequisitionButton user={user} module="notifications" /></div>
      <div className="notify-toolbar">
        <div className="notify-search"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search alerts..." /></div>
        <div className="notify-filters">
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
            <option value="">All priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          {s.unread > 0 && <button className="primary-action" onClick={markAllRead}>Mark all read</button>}
        </div>
      </div>
      <div className="notify-category-tabs">
        {tabs.map(t => (
          <button key={t} className={view === t ? 'active' : ''} onClick={() => setView(t)}>
            {data.categories.find(c => c.id === t)?.label || t.charAt(0).toUpperCase() + t.slice(1)}
            {data.categories.find(c => c.id === t)?.count > 0 && <em>{data.categories.find(c => c.id === t).count}</em>}
          </button>
        ))}
      </div>
      <div className="notify-alert-list">
        {data.alerts.length === 0 && <div className="empty-state">No notifications match your filters</div>}
        {data.alerts.map(n => (
          <article key={n.id} className={`notify-alert-card priority-${n.priority} ${n.read ? '' : 'unread'}`}>
            <div className="notify-priority-bar" />
            <div className="notify-alert-body">
              <div className="notify-alert-header">
                <strong>{n.title}</strong>
                <div className="notify-alert-meta">
                  {n.sourceLabel && <span className="notify-source-chip">{n.sourceLabel}</span>}
                  {n.assignedTo && <span className="notify-assignee">→ {n.assignedTo}</span>}
                  <em>{timeAgoLabel(n.createdAt)}</em>
                </div>
              </div>
              <p>{n.message}</p>
              <div className="notify-alert-actions">
                {n.status === 'active' && <button onClick={() => handleAction(n, 'acknowledge')}><CheckCircle2 size={14} /> Acknowledge</button>}
                {n.status === 'active' && <button onClick={() => handleAction(n, 'snooze', { hours: 24 })}><Hourglass size={14} /> Snooze 24h</button>}
                {n.status === 'active' && <button onClick={() => handleAction(n, 'archive')}><Archive size={14} /> Archive</button>}
                {n.sourceModule === 'leaves' && n.status === 'active' && (
                  <>
                    <button className="btn-approve" onClick={() => handleAction(n, 'approve-leave')}><CheckCircle2 size={14} /> Approve</button>
                    <button className="btn-reject" onClick={() => handleAction(n, 'reject-leave')}><X size={14} /> Reject</button>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ─── HR WORKSPACE ───
function HRWorkspace({ user, setPage, globalPeriod = 'Month' }) {
  const tabs = ['overview', 'directory', 'attendance', 'performance', 'payroll', 'recruitment', 'departments', 'reports'];
  const [view, setView] = useRouteTab('hr', tabs, 'overview');
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [editEmp, setEditEmp] = useState(null);
  const [paySlipEmp, setPaySlipEmp] = useState(null);
  const [attForm, setAttForm] = useState({ employeeId: '', date: new Date().toISOString().slice(0, 10), checkIn: '08:00', checkOut: '17:00', breakMinutes: 60, shiftType: 'Day Shift', workLocation: 'Office', status: 'Present', note: '' });
  const [dirLimit, setDirLimit] = useState(50);
  const [attLimit, setAttLimit] = useState(50);
  const listStep = 50;
  const { loading, data, error } = useServer(user, 'getHrData', [{ search, period: globalPeriod }], [refreshKey, globalPeriod]);
  const handleSaveEmployee = async (form) => {
    try { await rpc('saveEmployee', [user, form]); setModal(null); setEditEmp(null); setRefreshKey(k => k + 1); } catch (err) { alert(err.message); }
  };
  const handleDeleteEmployee = async (emp) => {
    if (!confirm(`Delete employee "${emp.name}"? This cannot be undone.`)) return;
    try { await rpc('deleteEmployee', [user, emp.id]); setRefreshKey(k => k + 1); } catch (err) { alert(err.message); }
  };
  const handleSaveCandidate = async (form) => {
    try { await rpc('saveCandidate', [user, form]); setModal(null); setRefreshKey(k => k + 1); } catch (err) { alert(err.message); }
  };
  const handleSaveReview = async (form) => {
    try { await rpc('saveReview', [user, form]); setModal(null); setRefreshKey(k => k + 1); } catch (err) { alert(err.message); }
  };
  const handleMoveCandidate = async (id, stage) => {
    try { await rpc('moveCandidate', [user, id, stage]); setRefreshKey(k => k + 1); } catch (err) { alert(err.message); }
  };
  const handleRecordAttendance = async (e) => {
    e.preventDefault();
    try { await rpc('recordAttendance', [user, attForm]); setAttForm({ ...attForm, employeeId: '', note: '' }); setRefreshKey(k => k + 1); } catch (err) { alert(err.message); }
  };
  if (loading) return <Loading title="HR" />;
  if (error) return <ErrorState title="HR" error={error} />;
  const s = data.stats;
  const employeeMetrics = data.employeeMetrics || [];
  const topPerformer = employeeMetrics[0];
  return (
    <section className="page-stack">
      <div className="sales-hero">
        <div><span>Human Resources Management</span><h1>HR</h1><p>Employee directory, departments, attendance, recruitment pipeline, and performance management.</p></div>
        <div className="sales-hero-stats">
          <strong>{s.headcount}</strong><span>Employees</span>
          <strong>{s.departments}</strong><span>Departments</span>
          <strong>{s.activeCandidates}</strong><span>Candidates</span>
          <strong>{currency(s.payrollCost)}</strong><span>Payroll</span>
        </div>
      </div>
      <div className="inline-actions"><CreateRequisitionButton user={user} module="hr" /></div>
      <div className="hr-insight-strip">
        <article><span>{data.period?.label || globalPeriod} hours</span><strong>{s.totalHoursInPeriod || 0}h</strong><em>{s.averageHoursPerRecord || 0}h avg/record</em></article>
        <article><span>Attendance</span><strong>{s.presentInPeriod || 0}</strong><em>{s.absentInPeriod || 0} absent</em></article>
        <article><span>Leave used</span><strong>{data.leaveSummary?.leaveDaysInPeriod || 0}d</strong><em>{data.leaveSummary?.approvedInPeriod || 0} approved requests</em></article>
        <article><span>Approvals</span><strong>{data.leaveSummary?.pendingApprovals || 0}</strong><em>pending manager action</em></article>
        <article><span>Overtime</span><strong>{s.overtimeHours || 0}h</strong><em>{s.lateArrivals || 0} late arrivals</em></article>
        <article><span>Missing checkout</span><strong>{s.missingCheckouts || 0}</strong><em>{s.attendanceRate || 0}% attendance rate</em></article>
        <article><span>Leave approval rate</span><strong>{s.leaveApprovalRate || 0}%</strong><em>approved vs pending</em></article>
        <article><span>Payroll ready</span><strong>{currency(s.payrollCost)}</strong><em>{s.headcount} active staff</em></article>
      </div>
      <div className="settings-tabs">
        {tabs.map(t => <button key={t} className={view === t ? 'active' : ''} onClick={() => setView(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>)}
        <button className="primary-action" onClick={() => setModal('employee')}>+ Add Employee</button>
        {view === 'recruitment' && <button className="primary-action" onClick={() => setModal('candidate')}>+ Add Candidate</button>}
        {view === 'performance' && <button className="primary-action" onClick={() => setModal('review')}>+ Add Review</button>}
      </div>

      {view === 'overview' && (
        <div className="dashboard-grid">
          <div className="hr-toolbar span-12">
            <div className="hr-toolbar-actions">
              <button type="button" onClick={() => downloadRowsFile('hr-overview', data.employees, 'CSV')}><Download size={15} /> Export All</button>
            </div>
          </div>
          <Panel className="span-4" title="HR Command Inputs" action="Quick actions">
            <div className="hr-command-actions">
              <button type="button" onClick={() => setModal('employee')}><Plus size={16} /> Add Employee</button>
              <button type="button" onClick={() => setView('attendance')}><Clock size={16} /> Record Hours</button>
              <button type="button" onClick={() => setModal('review')}><Gauge size={16} /> Add Review</button>
              <button type="button" onClick={() => setView('payroll')}><Wallet size={16} /> Payroll Preview</button>
            </div>
          </Panel>
          <Panel className="span-4" title="Top Performer">
            {topPerformer ? (
              <div className="hr-top-performer">
                <strong>{topPerformer.name}</strong>
                <span>{topPerformer.department} - {topPerformer.position}</span>
                <b>{topPerformer.performanceScore}%</b>
                <em>{topPerformer.customersHandled} customers / {currency(topPerformer.revenue)} revenue / {topPerformer.hours}h</em>
              </div>
            ) : <div className="empty-state">No performance data yet.</div>}
          </Panel>
          <Panel className="span-4" title="People Risk">
            <div className="settings-kv-grid">
              <article><span>Late Arrivals</span><strong>{s.lateArrivals || 0}</strong></article>
              <article><span>Missing Checkouts</span><strong>{s.missingCheckouts || 0}</strong></article>
              <article><span>Pending Reviews</span><strong>{s.pendingReviews || 0}</strong></article>
              <article><span>Pending Leave</span><strong>{data.leaveSummary?.pendingApprovals || 0}</strong></article>
            </div>
          </Panel>
          <Panel className="span-6" title="Employee Performance Comparison" action={`${employeeMetrics.length} employees`}>
            <HRPerformanceBars rows={employeeMetrics.slice(0, 8)} />
          </Panel>
          <Panel className="span-6" title="Hours vs Customers">
            <SimpleTable rows={employeeMetrics.slice(0, 8)} columns={['name', 'department', 'hours', 'overtime', 'customersHandled', 'orders', 'performanceScore']} />
          </Panel>
        </div>
      )}

      {view === 'directory' && (
        <div className="dashboard-grid">
          <div className="hr-toolbar span-12">
            <div className="hr-search-bar">
              <Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees..." />
            </div>
            <div className="hr-toolbar-actions">
              <button type="button" onClick={() => setModal('employee')}><Plus size={15} /> Employee</button>
              <button type="button" onClick={() => downloadRowsFile('hr-employees', data.employees, 'CSV')}><Download size={15} /> Export CSV</button>
              <button type="button" onClick={() => downloadRowsFile('hr-employees', data.employees, 'JSON')}><FileText size={15} /> Export JSON</button>
            </div>
          </div>
          <Panel className="span-12" title="Employee Directory" action={`${data.employees.length} records · ${data.employees.filter(e => e.status === 'Active').length} active`}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Employee</th><th>No.</th><th>Department</th><th>Position</th><th>Email</th><th>Phone</th><th>Pay Type</th><th>Rate/Salary</th><th>Annual Leave</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {data.employees.slice(0, dirLimit).map(emp => (
                    <tr key={emp.id} className={emp.status === 'Inactive' ? 'hr-inactive-row' : ''} style={emp.status === 'Inactive' ? { opacity: 0.5, background: '#f9fafb' } : {}}>
                      <td><strong>{emp.name}</strong>{emp.emergencyContactName && <div style={{ fontSize: 10, color: '#98a2b3' }}>Emergency: {emp.emergencyContactName} · {emp.emergencyContactPhone}</div>}</td>
                      <td>{emp.employeeNo}</td>
                      <td>{emp.department}</td>
                      <td>{emp.position}</td>
                      <td>{emp.email}</td>
                      <td>{emp.phone}</td>
                      <td><span style={{ fontSize: 11, fontWeight: 600, color: emp.payType === 'Hourly' ? '#2563eb' : '#475467' }}>{emp.payType || 'Salary'}</span></td>
                      <td>{emp.payType === 'Hourly' ? `${currency(emp.hourlyRate)}/hr` : currency(emp.salary)}</td>
                      <td>{emp.leaveBalanceAnnual}d</td>
                      <td><span className={emp.status === 'Active' ? 'status active' : 'status cancelled'}>{emp.status}</span></td>
                      <td className="row-actions">
                        <button className="mini-action" title="Edit" onClick={() => setEditEmp(emp)}><UserCog size={14} /></button>
                        {emp.status === 'Active' ? (
                          <button className="mini-action" title="Deactivate" style={{ color: '#f79009' }} onClick={() => handleDeleteEmployee(emp)}><X size={14} /></button>
                        ) : (
                          <button className="mini-action" title="Restore" style={{ color: '#22c55e' }} onClick={async () => { try { await rpc('restoreEmployee', [user, emp.id]); setRefreshKey(k => k + 1); } catch (err) { alert(err.message); } }}><CheckCircle2 size={14} /></button>
                        )}
                        {emp.status === 'Inactive' && <button className="mini-action" title="Permanently Delete" style={{ color: '#ef4444' }} onClick={async () => { if (confirm(`Permanently delete "${emp.name}"? This cannot be undone.`)) { try { await rpc('permanentlyDeleteEmployee', [user, emp.id]); setRefreshKey(k => k + 1); } catch (err) { alert(err.message); } } }}><Trash2 size={14} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.employees.length > dirLimit && (
              <div className="table-more-note">
                Showing {Math.min(dirLimit, data.employees.length)} of {data.employees.length.toLocaleString()} records.{' '}
                <button className="mini-action" style={{ display: 'inline-flex', marginLeft: 8 }} onClick={() => setDirLimit(l => l + listStep)}>Load {listStep} more</button>
              </div>
            )}
          </Panel>
        </div>
      )}

      {view === 'departments' && (
        <div className="dashboard-grid">
          {data.departments.map(dep => {
            const depEmployees = (data.employees || []).filter(e => e.department === dep.name && e.status === 'Active');
            return (
              <Panel key={dep.id} className="span-4" title={dep.name} action={`${dep.headcount} staff`}>
                <div className="hr-dept-card">
                  <strong>{dep.headcount}</strong><span>Headcount</span>
                  <strong>{currency(dep.payrollCost)}</strong><span>Payroll Cost</span>
                  <strong>{dep.manager || '—'}</strong><span>Manager</span>
                </div>
                {depEmployees.length > 0 && (
                  <div className="hr-dept-employees">
                    <strong>Team Members</strong>
                    {depEmployees.slice(0, 6).map(e => (
                      <div key={e.id} className="hr-dept-emp-row" onClick={() => setEditEmp(e)}>
                        <span className="rep-avatar sm" style={{ background: '#475467', fontSize: 9 }}>{String(e.name || '?').slice(0, 2).toUpperCase()}</span>
                        <div><strong>{e.name}</strong><span>{e.position} · {e.payType === 'Hourly' ? `${currency(e.hourlyRate)}/hr` : currency(e.salary)}</span></div>
                      </div>
                    ))}
                    {depEmployees.length > 6 && <div className="hr-dept-more">+ {depEmployees.length - 6} more</div>}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}

      {view === 'attendance' && (
        <div className="dashboard-grid">
          <div className="hr-toolbar span-12">
            <div className="hr-toolbar-actions">
              <button type="button" onClick={() => downloadRowsFile('hr-attendance', data.attendance, 'CSV')}><Download size={15} /> Export Attendance</button>
              <button type="button" onClick={() => downloadRowsFile('hr-employees', data.employees, 'CSV')}><Download size={15} /> Export Employees</button>
            </div>
          </div>
          <Panel className="span-12" title="Clock In / Out" action="Entry">
            <form className="settings-form-grid attendance-form-grid" onSubmit={handleRecordAttendance}>
              <fieldset className="settings-fieldset"><legend>Attendance Entry</legend><div>
                <label>Employee
                  <select value={attForm.employeeId} onChange={e => setAttForm({ ...attForm, employeeId: e.target.value })} required>
                    <option value="">Select employee...</option>
                    {data.employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} · {emp.department}</option>)}
                  </select>
                </label>
                <label>Date<input type="date" value={attForm.date} onChange={e => setAttForm({ ...attForm, date: e.target.value })} required /></label>
                <label>Check In<input type="time" value={attForm.checkIn} onChange={e => setAttForm({ ...attForm, checkIn: e.target.value })} /></label>
                <label>Check Out<input type="time" value={attForm.checkOut} onChange={e => setAttForm({ ...attForm, checkOut: e.target.value })} /></label>
                <label>Break Minutes<input type="number" value={attForm.breakMinutes} onChange={e => setAttForm({ ...attForm, breakMinutes: Number(e.target.value) })} /></label>
                <label>Shift Type
                  <select value={attForm.shiftType} onChange={e => setAttForm({ ...attForm, shiftType: e.target.value })}>
                    {['Day Shift', 'Night Shift', 'Field Shift', 'Remote', 'Half-Day'].map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </label>
                <label>Work Location<input type="text" value={attForm.workLocation} onChange={e => setAttForm({ ...attForm, workLocation: e.target.value })} placeholder="Office, Warehouse, Field..." /></label>
                <label>Status
                  <select value={attForm.status} onChange={e => setAttForm({ ...attForm, status: e.target.value })}>
                    {['Present', 'Absent', 'Late', 'Half-Day', 'Leave', 'Remote'].map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </label>
                <label>Note<input type="text" value={attForm.note} onChange={e => setAttForm({ ...attForm, note: e.target.value })} placeholder="Optional note..." /></label>
              </div></fieldset>
              {(() => {
                if (!attForm.checkIn || !attForm.checkOut) return null;
                const [ih, im] = attForm.checkIn.split(':').map(Number);
                const [oh, om] = attForm.checkOut.split(':').map(Number);
                const hrs = Math.max(0, Math.round(((((oh * 60 + om) - (ih * 60 + im) - num(attForm.breakMinutes)) / 60) * 10)) / 10);
                return <div className="att-hours-preview"><Clock size={16} /><strong>{hrs}h</strong><span>worked after {attForm.breakMinutes || 0}m break</span></div>;
              })()}
              <button className="primary-action" type="submit">Save Attendance</button>
            </form>
          </Panel>

          <Panel className="span-12" title="Today's Summary" action={`${s.presentToday} present · ${s.totalHoursToday}h`}>
            <div className="att-stats-row">
              <div className="att-stat-card"><strong>{s.presentToday}</strong><span>Present Today</span></div>
              <div className="att-stat-card"><strong>{s.totalHoursToday}h</strong><span>Hours Today</span></div>
              <div className="att-stat-card"><strong>{s.attendanceRecords}</strong><span>Total Records</span></div>
              <div className="att-stat-card"><strong>{s.headcount}</strong><span>Headcount</span></div>
            </div>
            <div className="att-dept-hours">
              <h3>Hours by Department <em>({data.period?.label || globalPeriod})</em></h3>
              {data.attendanceByDept && data.attendanceByDept.length > 0 ? (
                data.attendanceByDept.map(d => {
                  const max = Math.max(...data.attendanceByDept.map(x => x.hours), 1);
                  const pct = Math.round((d.hours / max) * 100);
                  return (
                    <div key={d.department} className="att-dept-bar">
                      <span className="att-dept-name">{d.department}</span>
                      <div className="att-bar-track"><div className="att-bar-fill" style={{ width: `${pct}%` }} /></div>
                      <strong className="att-dept-hours">{d.hours}h</strong>
                    </div>
                  );
                })
              ) : <div className="empty-state">No attendance data yet. Start clocking in employees.</div>}
            </div>
          </Panel>

          <Panel className="span-12" title="Attendance Log" action={<button className="panel-action-button" type="button" onClick={() => downloadRowsFile('hr-attendance', data.attendance, 'CSV')}><Download size={14} /> Export</button>}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Employee</th><th>Department</th><th>Date</th><th>Check In</th><th>Check Out</th><th>Break</th><th>Shift</th><th>Location</th><th>Hours</th><th>Status</th><th>Note</th></tr></thead>
                <tbody>
                  {data.attendance.length === 0 && <tr><td colSpan={11}><div className="empty-state">No attendance records</div></td></tr>}
              {data.attendance.slice(0, attLimit).map(a => (
                <tr key={a.id}>
                  <td><strong>{a.employeeName}</strong></td>
                  <td>{a.department}</td>
                  <td>{a.date}</td>
                  <td>{a.checkIn || '—'}</td>
                  <td>{a.checkOut || '—'}</td>
                  <td>{a.breakMinutes || 0}m</td>
                  <td>{a.shiftType || '-'}</td>
                  <td>{a.workLocation || '-'}</td>
                  <td><strong style={{ color: num(a.hoursWorked) >= 8 ? '#101828' : num(a.hoursWorked) > 0 ? '#f79009' : '#667085' }}>{num(a.hoursWorked) || 0}h</strong></td>
                  <td><span className={a.status === 'Present' ? 'status active' : a.status === 'Absent' ? 'status cancelled' : 'status partial'}>{a.status}</span></td>
                  <td>{a.note || '—'}</td>
                </tr>
              ))}
            </tbody>
              </table>
            </div>
            {data.attendance.length > attLimit && (
              <div className="table-more-note">
                Showing {Math.min(attLimit, data.attendance.length)} of {data.attendance.length.toLocaleString()} records.{' '}
                <button className="mini-action" style={{ display: 'inline-flex', marginLeft: 8 }} onClick={() => setAttLimit(l => l + listStep)}>Load {listStep} more</button>
              </div>
            )}
          </Panel>
        </div>
      )}

      {view === 'recruitment' && (
        <div>
          <div className="hr-view-actions">
            <button type="button" onClick={() => setModal('candidate')}><Plus size={15} /> Add Candidate</button>
            <button type="button" onClick={() => downloadRowsFile('hr-candidates', data.candidates, 'CSV')}><Download size={15} /> Export Candidates</button>
            <button type="button" onClick={() => downloadRowsFile('hr-recruitment-pipeline', data.candidates, 'JSON')}><FileText size={15} /> Export JSON</button>
          </div>
          <div className="crm-kanban hr-kanban">
            {['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'].map(stage => {
              const candidates = data.candidates.filter(c => c.stage === stage);
              return (
                <div key={stage} className="hr-kanban-col">
                  <div className="hr-kanban-header"><strong>{stage}</strong><em>{candidates.length}</em></div>
                  {candidates.map(c => (
                    <div key={c.id} className="hr-kanban-card">
                      <strong>{c.name}</strong>
                      <span>{c.position} · {c.department}</span>
                      <em>{c.source} · {currency(c.expectedSalary)}</em>
                      <div className="hr-kanban-actions">
                        {stage !== 'Hired' && stage !== 'Rejected' && (
                          <select value={c.stage} onChange={e => handleMoveCandidate(c.id, e.target.value)}>
                            {['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'performance' && (
        <div className="dashboard-grid">
          <Panel className="span-6" title="Employee Scoreboard" action={<button className="panel-action-button" type="button" onClick={() => downloadRowsFile('hr-employee-performance', employeeMetrics, 'CSV')}><Download size={14} /> Export</button>}>
            <HRPerformanceBars rows={employeeMetrics.slice(0, 10)} />
          </Panel>
          <Panel className="span-6" title="Customer + Sales Contribution">
            <SimpleTable rows={employeeMetrics.slice(0, 10)} columns={['name', 'department', 'customersHandled', 'calls', 'leads', 'orders', 'revenue']} />
          </Panel>
          <Panel className="span-12" title="Performance Reviews" action={<button className="panel-action-button" type="button" onClick={() => downloadRowsFile('hr-performance-reviews', data.reviews, 'CSV')}><Download size={14} /> Export</button>}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Employee</th><th>Department</th><th>Period</th><th>Rating</th><th>Goals</th><th>Feedback</th><th>Status</th></tr></thead>
                <tbody>
                  {data.reviews.map(r => (
                    <tr key={r.id}>
                      <td><strong>{r.employeeName}</strong></td>
                      <td>{r.department}</td>
                      <td>{r.period}</td>
                      <td>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</td>
                      <td>{r.goals || '—'}</td>
                      <td>{r.feedback || '—'}</td>
                      <td><span className={r.status === 'Completed' ? 'status active' : 'status partial'}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {view === 'payroll' && (
        <div className="dashboard-grid">
          <Panel className="span-4" title="Payroll Readiness">
            <div className="settings-kv-grid">
              <article><span>Gross Estimate</span><strong>{currency((data.payrollPreview || []).reduce((sum, row) => sum + num(row.grossPay), 0))}</strong></article>
              <article><span>Overtime Pay</span><strong>{currency((data.payrollPreview || []).reduce((sum, row) => sum + num(row.overtimePay), 0))}</strong></article>
              <article><span>Deductions</span><strong>{currency((data.payrollPreview || []).reduce((sum, row) => sum + num(row.deductions), 0))}</strong></article>
              <article><span>Late Deductions</span><strong style={{ color: '#f79009' }}>{currency((data.payrollPreview || []).reduce((sum, row) => sum + num(row.lateDeduction), 0))}</strong></article>
              <article><span>Net Pay</span><strong>{currency((data.payrollPreview || []).reduce((sum, row) => sum + num(row.netPay), 0))}</strong></article>
              <article><span>Current Month</span><strong>{data.currentMonth || new Date().toISOString().slice(0, 7)}</strong></article>
            </div>
          </Panel>
          <Panel className="span-8" title="Payroll Preview" action={
            <div className="panel-action-row">
              <button className="panel-action-button" type="button" onClick={() => downloadRowsFile('hr-payroll-preview', data.payrollPreview || [], 'CSV')}><Download size={14} /> Export CSV</button>
              <button className="panel-action-button" type="button" onClick={async () => {
                try {
                  await rpc('sendPayrollEmails', [user, { period: globalPeriod }]);
                  alert('Payroll emails sent successfully to all employees.');
                } catch (err) { alert(err.message); }
              }}><Mail size={14} /> Email All</button>
            </div>
          }>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Employee</th><th>Dept</th><th>Pay Type</th><th>Hours</th><th>Overtime</th><th>Late hrs</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Action</th></tr></thead>
                <tbody>
                  {(data.payrollPreview || []).filter(Boolean).map(row => {
                    const safeEmployees = (data.employees || []).filter(Boolean);
                    const emp = safeEmployees.find(e => e.employeeNo === row.employeeNo || e.name === row.name) || {};
                    return (
                      <tr key={row.employeeNo || row.name}>
                        <td><strong>{row.name}</strong></td>
                        <td>{row.department}</td>
                        <td><span style={{ fontSize: 11, fontWeight: 600, color: row.payType === 'Hourly' ? '#2563eb' : '#475467' }}>{row.payType || 'Salary'}</span></td>
                        <td>{row.hours}h</td>
                        <td>{row.overtime}h</td>
                        <td style={{ color: row.lateHours > 0 ? '#f79009' : '#98a2b3' }}>{row.lateHours || 0}h</td>
                        <td>{currency(row.grossPay)}</td>
                        <td>{currency(row.deductions)}</td>
                        <td><strong>{currency(row.netPay)}</strong></td>
                        <td><button className="mini-action" onClick={() => setPaySlipEmp({ employee: emp, payroll: row })}>View Payslip</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel className="span-12" title="Payroll Actions" action={`${(data.payrollPreview || []).length} employees`}>
            <div className="hr-payroll-actions">
              <p className="hr-payroll-note">Run these steps in order to close the payroll period. Hours auto-reset on the 1st of each month. Late arrivals are auto-deducted from net pay. Kenya public holidays & weekends are not counted as absent.</p>
              <div className="hr-payroll-step-row">
                <button className="panel-action-button" type="button" onClick={() => downloadRowsFile('hr-payroll-preview', data.payrollPreview || [], 'CSV')}><Download size={14} /> Export Payroll CSV</button>
                <button className="panel-action-button" type="button" onClick={async () => { try { const file = await rpc('generateReportExport', [user, { module: 'Payroll', reportName: `Payroll ${data.period?.label || globalPeriod}`, rows: (data.payrollPreview || []).map(r => ({ Employee: r.name, Department: r.department, PayType: r.payType, Hours: r.hours, Overtime: r.overtime, LateHours: r.lateHours, GrossPay: r.grossPay, Deductions: r.deductions, NetPay: r.netPay })) }, 'PDF']); handleGeneratedFile(file, 'PDF'); } catch (err) { alert(err.message); } }}><FileText size={14} /> Export Payroll PDF</button>
                <button className="panel-action-button" type="button" onClick={async () => { try { await rpc('sendPayrollEmails', [user, { period: globalPeriod }]); alert('Payslip emails sent to all employees.'); } catch (err) { alert(err.message); } }}><Mail size={14} /> Email Payslips</button>
                <button className="panel-action-button primary" type="button" style={{ background: '#22c55e', color: '#fff' }} onClick={async () => { try { const res = await rpc('postPayrollToFinance', [user, { period: data.currentMonth || new Date().toISOString().slice(0, 7) }]); alert(`Payroll posted to Finance: ${currency(res.totalNetPay)} net pay for ${res.employeeCount} employees.`); setRefreshKey(k => k + 1); } catch (err) { alert(err.message); } }}><Landmark size={14} /> Post to Finance</button>
              </div>
              <div className="hr-payroll-step-row">
                <article className="hr-payroll-step"><CheckCircle2 size={16} /><span>1. Confirm attendance hours (Attendance tab)</span></article>
                <article className="hr-payroll-step"><CheckCircle2 size={16} /><span>2. Review late deductions (auto-calculated)</span></article>
                <article className="hr-payroll-step"><CheckCircle2 size={16} /><span>3. Export / email payslips above</span></article>
                <article className="hr-payroll-step"><CheckCircle2 size={16} /><span>4. Post net pay to Finance (creates journal entries)</span></article>
              </div>
            </div>
          </Panel>
          {(data.payrollHistory || []).length > 0 && (
            <Panel className="span-12" title="Payroll History" action={`${data.payrollHistory.length} posted periods`}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Period</th><th>Posted By</th><th>Posted At</th><th>Employees</th><th>Gross</th><th>Deductions</th><th>Net Pay</th></tr></thead>
                  <tbody>
                    {data.payrollHistory.map(h => (
                      <tr key={h.id}>
                        <td><strong>{h.period}</strong></td>
                        <td>{h.postedBy}</td>
                        <td>{String(h.postedAt || '').slice(0, 16)}</td>
                        <td>{h.employeeCount}</td>
                        <td>{currency(h.totalGrossPay)}</td>
                        <td>{currency(h.totalDeductions)}</td>
                        <td><strong>{currency(h.totalNetPay)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>
      )}
      {view === 'reports' && <HRReports data={data.reports} employees={data.employees} payrollPreview={data.payrollPreview} employeeMetrics={data.employeeMetrics} user={user} globalPeriod={globalPeriod} />}

      {paySlipEmp && <PaySlip employee={paySlipEmp.employee} payroll={paySlipEmp.payroll} company={data.company || {}} period={{ from: data.period?.startDate || '—', to: data.period?.endDate || '—', date: new Date().toISOString().slice(0, 10) }} onClose={() => setPaySlipEmp(null)} onPrint={(ref) => { window.print(); }} />}

      {modal === 'employee' && <EmployeeFormModal user={user} onClose={() => setModal(null)} onSave={handleSaveEmployee} />}
      {editEmp && <EmployeeFormModal user={user} initial={editEmp} onClose={() => setEditEmp(null)} onSave={handleSaveEmployee} />}
      {modal === 'candidate' && <CandidateFormModal onClose={() => setModal(null)} onSave={handleSaveCandidate} />}
      {modal === 'review' && <ReviewFormModal employees={data.employees} onClose={() => setModal(null)} onSave={handleSaveReview} />}
    </section>
  );
}

function HRPerformanceBars({ rows = [] }) {
  const max = Math.max(1, ...rows.map(row => num(row.performanceScore)));
  if (!rows.length) return <div className="empty-state">No employee performance data yet. Record attendance, reviews, calls, and sales to build comparisons.</div>;
  return (
    <div className="hr-performance-bars">
      {rows.map(row => (
        <article key={row.employeeId || row.name}>
          <div>
            <strong>{row.name}</strong>
            <span>{row.department} - {row.customersHandled || 0} customers - {row.hours || 0}h</span>
          </div>
          <div className="hr-score-track"><div style={{ width: `${Math.max(8, Math.round((num(row.performanceScore) / max) * 100))}%` }} /></div>
          <b>{row.performanceScore || 0}%</b>
        </article>
      ))}
    </div>
  );
}

function HRReports({ data, employees, payrollPreview, employeeMetrics, user, globalPeriod }) {
  const safeData = data || {};
  const [activeReport, setActiveReport] = useState('monthly');
  const [exporting, setExporting] = useState('');
  const [exportMsg, setExportMsg] = useState('');
  const report = safeData[activeReport] || {};

  const reportCards = [
    { id: 'monthly', label: 'Monthly Report', icon: Calendar, color: '#3b8c5a' },
    { id: 'quarterly', label: 'Quarterly Report', icon: BarChart3, color: '#2563eb' },
    { id: 'annual', label: 'Annual Report', icon: LineChart, color: '#7c3aed' },
  ];

  const buildExportRows = () => {
    const payrollRows = (payrollPreview || []).filter(Boolean).map(row => ({
      Employee: row.name, Department: row.department, EmployeeNo: row.employeeNo,
      Hours: row.hours, Overtime: row.overtime, GrossPay: row.grossPay,
      Deductions: row.deductions, NetPay: row.netPay, Period: report.period || activeReport
    }));
    const metricRows = (employeeMetrics || []).filter(Boolean).map(row => ({
      Employee: row.name, Department: row.department, Position: row.position,
      PerformanceScore: row.performanceScore, CustomersHandled: row.customersHandled,
      Revenue: row.revenue, Hours: row.hours, Calls: row.calls, Period: report.period || activeReport
    }));
    return { payrollRows, metricRows };
  };

  async function exportHrReport(format, module = 'Payroll') {
    setExporting(format);
    setExportMsg('');
    try {
      const { payrollRows, metricRows } = buildExportRows();
      const rows = module === 'HR Performance' ? metricRows : payrollRows;
      const file = await rpc('generateReportExport', [user, {
        module,
        reportName: `${module} ${report.period || activeReport}`,
        rows,
        startDate: report.startDate,
        endDate: report.endDate
      }, format]);
      handleGeneratedFile(file, format);
      setExportMsg(`${module} ${format} exported.`);
    } catch (err) {
      setExportMsg(err?.message || 'Export failed.');
    } finally {
      setExporting('');
    }
  }

  return (
    <div className="dashboard-grid">
      <Panel className="span-12" title="HR Reports">
        <div className="hr-report-tabs">
          {reportCards.map(r => (
            <button key={r.id} className={activeReport === r.id ? 'active' : ''} onClick={() => setActiveReport(r.id)} style={activeReport === r.id ? { borderBottom: `2px solid ${r.color}`, color: r.color } : {}}>
              <r.icon size={16} /> {r.label}
            </button>
          ))}
        </div>
        <div className="hr-report-header">
          <h2>{report.title || 'HR Report'}</h2>
          <span className="hr-report-period">{report.period || '—'}</span>
        </div>
        <div className="hr-report-export">
          <ExportFormatStrip formats={['PDF', 'Excel', 'CSV', 'Print']} onExport={fmt => exportHrReport(fmt, 'Payroll')} disabled={!!exporting} />
          <ExportFormatStrip formats={['PDF', 'Excel', 'CSV', 'Print']} onExport={fmt => exportHrReport(fmt, 'HR Performance')} disabled={!!exporting} />
          <button className="export-button" type="button" onClick={() => downloadRowsFile(`hr-directory-${activeReport}`, employees || [], 'CSV')} disabled={!!exporting}><Download size={16} /><span>Directory CSV</span></button>
        </div>
        {exportMsg && <div className={`crm-sheet-message ${/failed|error/i.test(exportMsg) ? 'warn' : ''}`}>{exportMsg}</div>}
      </Panel>

      <Panel className="span-3" title="Headcount">
        <div className="hr-report-kpi">
          <strong>{report.headcount || 0}</strong>
          <span>Total employees</span>
          <em>{report.newHires ? `+${report.newHires} new` : ''}{report.terminations ? ` / -${report.terminations} left` : ''}</em>
        </div>
      </Panel>
      <Panel className="span-3" title="Attendance">
        <div className="hr-report-kpi">
          <strong>{report.attendanceRate || 0}%</strong>
          <span>Attendance rate</span>
          <em>{report.avgHoursPerDay || 0}h avg/day</em>
        </div>
      </Panel>
      <Panel className="span-3" title="Overtime">
        <div className="hr-report-kpi">
          <strong>{report.totalOvertime || 0}h</strong>
          <span>Total overtime</span>
          <em>{report.lateArrivals || 0} late arrivals</em>
        </div>
      </Panel>
      <Panel className="span-3" title="Payroll">
        <div className="hr-report-kpi">
          <strong>{currency(report.payrollCost || 0)}</strong>
          <span>Total payroll cost</span>
          <em>{report.totalNetPay ? currency(report.totalNetPay) + ' net pay' : ''}</em>
        </div>
      </Panel>

      <Panel className="span-6" title="Leave & Absence">
        <div className="hr-report-leave-grid">
          <article><span>Leave Taken</span><strong>{report.leaveTaken || 0} days</strong></article>
          <article><span>Absenteeism</span><strong>{report.absenteeism || 0} days</strong></article>
          <article><span>Leave Pending</span><strong>{report.leavePending || 0} requests</strong></article>
          <article><span>Attendance Rate</span><strong>{report.attendanceRate || 0}%</strong></article>
        </div>
      </Panel>
      <Panel className="span-6" title="Recruitment Pipeline">
        <div className="hr-report-recruit-grid">
          <article><span>Applicants</span><strong>{report.recruitment?.applicants || 0}</strong></article>
          <article><span>Interviews</span><strong>{report.recruitment?.interviews || 0}</strong></article>
          <article><span>Offers</span><strong>{report.recruitment?.offers || 0}</strong></article>
          <article><span>Hired</span><strong>{report.recruitment?.hired || 0}</strong></article>
        </div>
      </Panel>

      <Panel className="span-6" title="Performance Summary">
        <div className="hr-report-performance-grid">
          <article><span>Avg Rating</span><strong>{report.performance?.avgRating || 0}/5</strong></article>
          <article><span>Top Performer</span><strong>{report.performance?.topPerformer || 'N/A'}</strong></article>
          <article><span>Reviews Done</span><strong>{report.performance?.reviewsCompleted || 0}</strong></article>
          <article><span>Reviews Pending</span><strong>{report.performance?.reviewsPending || 0}</strong></article>
        </div>
      </Panel>
      <Panel className="span-6" title="Employee Payroll Breakdown">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Dept</th><th>Gross</th><th>Deductions</th><th>Net Pay</th></tr></thead>
            <tbody>
              {(payrollPreview || []).slice(0, 10).filter(Boolean).map(row => (
                <tr key={row.employeeNo || row.name}>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.department}</td>
                  <td>{currency(row.grossPay)}</td>
                  <td>{currency(row.deductions)}</td>
                  <td><strong>{currency(row.netPay)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="span-12" title="Performance Ranking" action={<span>Top {Math.min(10, (employeeMetrics || []).length)} performers</span>}>
        <HRPerformanceBars rows={(employeeMetrics || []).slice(0, 10)} />
      </Panel>
    </div>
  );
}

function EmployeeFormModal({ user, onClose, onSave, initial }) {
  const [form, setForm] = useState(initial && initial.id ? { ...initial } : { name: '', email: '', phone: '', department: 'Sales', position: 'Officer', employmentType: 'Full-time', joinDate: new Date().toISOString().slice(0, 10), status: 'Active', salary: 60000, hourlyRate: 0, payType: 'Salary', manager: 'Miko Admin', workSchedule: '08:00-17:00', expectedHoursPerDay: 8, overtimeEligible: 'Yes', location: 'Office', address: '', nationalId: '', kraPin: '', taxCategory: 'Resident', bankName: '', bankBranch: '', bankAccount: '', bankAccountName: '', mpesaNumber: '', paymentMethod: 'Bank Transfer', houseAllowance: 0, transportAllowance: 0, medicalAllowance: 0, communicationAllowance: 0, riskAllowance: 0, mealAllowance: 0, responsibilityAllowance: 0, loanDeduction: 0, saccoDeduction: 0, otherDeductions: 0, customDeductions: [], emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '', nextOfKinName: '', nextOfKinPhone: '', nextOfKinRelation: '', leaveBalanceAnnual: 21, leaveBalanceSick: 10, leaveBalanceCasual: 5 });
  const isEdit = Boolean(form.id);
  const addCustomDeduction = () => setForm({ ...form, customDeductions: [...(form.customDeductions || []), { id: `ded-${Date.now()}`, label: '', amount: 0, type: 'One-time' }] });
  const updateDeduction = (i, field, val) => { const next = [...(form.customDeductions || [])]; next[i] = { ...next[i], [field]: field === 'amount' ? Number(val) : val }; setForm({ ...form, customDeductions: next }); };
  const removeDeduction = i => setForm({ ...form, customDeductions: (form.customDeductions || []).filter((_, idx) => idx !== i) });
  return (
    <ModalCard title={isEdit ? 'Edit Employee' : 'Add Employee'} onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Identity</legend><div>
          <label>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{['Active', 'Inactive', 'On Leave', 'Suspended'].map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
          <label>Phone<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Address<textarea rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Physical address..." /></label>
          <label>National ID<input value={form.nationalId} onChange={e => setForm({ ...form, nationalId: e.target.value })} /></label>
        </div></fieldset>
        <fieldset className="settings-fieldset"><legend>Emergency / Family Contact</legend><div>
          <label>Emergency Contact Name<input value={form.emergencyContactName} onChange={e => setForm({ ...form, emergencyContactName: e.target.value })} placeholder="e.g. Jane Wanjiru" /></label>
          <label>Emergency Contact Phone<input value={form.emergencyContactPhone} onChange={e => setForm({ ...form, emergencyContactPhone: e.target.value })} placeholder="0712 345 678" /></label>
          <label>Relationship<input value={form.emergencyContactRelation} onChange={e => setForm({ ...form, emergencyContactRelation: e.target.value })} placeholder="e.g. Spouse, Parent" /></label>
          <label>Next of Kin Name<input value={form.nextOfKinName} onChange={e => setForm({ ...form, nextOfKinName: e.target.value })} placeholder="Next of kin" /></label>
          <label>Next of Kin Phone<input value={form.nextOfKinPhone} onChange={e => setForm({ ...form, nextOfKinPhone: e.target.value })} placeholder="0712 345 678" /></label>
          <label>Next of Kin Relationship<input value={form.nextOfKinRelation} onChange={e => setForm({ ...form, nextOfKinRelation: e.target.value })} placeholder="e.g. Father, Sibling" /></label>
        </div></fieldset>
        <fieldset className="settings-fieldset"><legend>Employment</legend><div>
          <label>Department<select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>{['Sales', 'Finance', 'Inventory', 'Procurement', 'Production', 'Admin', 'CRM', 'Field Operations', 'HR', 'Audit'].map(d => <option key={d}>{d}</option>)}</select></label>
          <label>Position<input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} /></label>
          <label>Type<select value={form.employmentType} onChange={e => setForm({ ...form, employmentType: e.target.value })}>{['Full-time', 'Part-time', 'Contract', 'Intern', 'Casual'].map(t => <option key={t}>{t}</option>)}</select></label>
          <label>Join Date<input type="date" value={form.joinDate} onChange={e => setForm({ ...form, joinDate: e.target.value })} /></label>
          <label>Pay Type<select value={form.payType} onChange={e => setForm({ ...form, payType: e.target.value })}>{['Salary', 'Hourly'].map(t => <option key={t}>{t}</option>)}</select></label>
          {form.payType === 'Hourly' ? (
            <label>Hourly Rate (KES)<input type="number" value={form.hourlyRate} onChange={e => setForm({ ...form, hourlyRate: Number(e.target.value) })} placeholder="e.g. 500" /></label>
          ) : (
            <label>Basic Salary (KES)<input type="number" value={form.salary} onChange={e => setForm({ ...form, salary: Number(e.target.value) })} /></label>
          )}
          <label>Manager<input value={form.manager} onChange={e => setForm({ ...form, manager: e.target.value })} /></label>
          <label>Work Schedule<input value={form.workSchedule} onChange={e => setForm({ ...form, workSchedule: e.target.value })} placeholder="08:00-17:00" /></label>
          <label>Expected Hours/Day<input type="number" value={form.expectedHoursPerDay} onChange={e => setForm({ ...form, expectedHoursPerDay: Number(e.target.value) })} /></label>
          <label>Location<input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></label>
          <label>Overtime Eligible<select value={form.overtimeEligible} onChange={e => setForm({ ...form, overtimeEligible: e.target.value })}>{['Yes', 'No'].map(x => <option key={x}>{x}</option>)}</select></label>
        </div></fieldset>
        <fieldset className="settings-fieldset"><legend>Tax & Banking</legend><div>
          <label>KRA PIN<input value={form.kraPin} onChange={e => setForm({ ...form, kraPin: e.target.value })} placeholder="A001234567B" /></label>
          <label>Tax Category<select value={form.taxCategory} onChange={e => setForm({ ...form, taxCategory: e.target.value })}>{['Resident', 'Non-Resident'].map(t => <option key={t}>{t}</option>)}</select></label>
          <label>Bank Name<input value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} /></label>
          <label>Bank Branch<input value={form.bankBranch} onChange={e => setForm({ ...form, bankBranch: e.target.value })} /></label>
          <label>Account Number<input value={form.bankAccount} onChange={e => setForm({ ...form, bankAccount: e.target.value })} /></label>
          <label>Account Name<input value={form.bankAccountName} onChange={e => setForm({ ...form, bankAccountName: e.target.value })} /></label>
          <label>M-Pesa Number<input value={form.mpesaNumber} onChange={e => setForm({ ...form, mpesaNumber: e.target.value })} /></label>
          <label>Payment Method<select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>{['Bank Transfer', 'M-Pesa', 'Cheque', 'Cash'].map(p => <option key={p}>{p}</option>)}</select></label>
        </div></fieldset>
        <fieldset className="settings-fieldset"><legend>Allowances (KES)</legend><div>
          <label>House Allowance<input type="number" value={form.houseAllowance} onChange={e => setForm({ ...form, houseAllowance: Number(e.target.value) })} /></label>
          <label>Transport Allowance<input type="number" value={form.transportAllowance} onChange={e => setForm({ ...form, transportAllowance: Number(e.target.value) })} /></label>
          <label>Medical Allowance<input type="number" value={form.medicalAllowance} onChange={e => setForm({ ...form, medicalAllowance: Number(e.target.value) })} /></label>
          <label>Communication Allowance<input type="number" value={form.communicationAllowance} onChange={e => setForm({ ...form, communicationAllowance: Number(e.target.value) })} /></label>
          <label>Risk Allowance<input type="number" value={form.riskAllowance} onChange={e => setForm({ ...form, riskAllowance: Number(e.target.value) })} /></label>
          <label>Meal Allowance<input type="number" value={form.mealAllowance} onChange={e => setForm({ ...form, mealAllowance: Number(e.target.value) })} /></label>
          <label>Responsibility Allowance<input type="number" value={form.responsibilityAllowance} onChange={e => setForm({ ...form, responsibilityAllowance: Number(e.target.value) })} /></label>
        </div></fieldset>
        <fieldset className="settings-fieldset"><legend>Custom Deductions (KES)</legend><div>
          <div className="quote-items-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Custom Payroll Deductions</strong>
            <button type="button" className="mini-action" onClick={addCustomDeduction}><Plus size={14} /> Add Deduction</button>
          </div>
          {(form.customDeductions || []).map((ded, i) => (
            <div key={ded.id || i} className="modal-grid" style={{ gridTemplateColumns: '1.5fr 1fr 1fr auto', gap: 6, alignItems: 'end', marginTop: 6 }}>
              <label>Label<input value={ded.label} onChange={e => updateDeduction(i, 'label', e.target.value)} placeholder="e.g. Salary advance" /></label>
              <label>Amount<input type="number" value={ded.amount} onChange={e => updateDeduction(i, 'amount', e.target.value)} /></label>
              <label>Type<select value={ded.type} onChange={e => updateDeduction(i, 'type', e.target.value)}>{['One-time', 'Recurring'].map(t => <option key={t}>{t}</option>)}</select></label>
              <button type="button" className="mini-action" onClick={() => removeDeduction(i)} style={{ marginBottom: 8, color: '#ef4444' }}><X size={14} /></button>
            </div>
          ))}
          <label>Loan Deduction<input type="number" value={form.loanDeduction} onChange={e => setForm({ ...form, loanDeduction: Number(e.target.value) })} /></label>
          <label>Sacco Deduction<input type="number" value={form.saccoDeduction} onChange={e => setForm({ ...form, saccoDeduction: Number(e.target.value) })} /></label>
          <label>Other Deductions<input type="number" value={form.otherDeductions} onChange={e => setForm({ ...form, otherDeductions: Number(e.target.value) })} /></label>
        </div></fieldset>
        <fieldset className="settings-fieldset"><legend>Leave Balances</legend><div>
          <label>Annual Leave<input type="number" value={form.leaveBalanceAnnual} onChange={e => setForm({ ...form, leaveBalanceAnnual: Number(e.target.value) })} /></label>
          <label>Sick Leave<input type="number" value={form.leaveBalanceSick} onChange={e => setForm({ ...form, leaveBalanceSick: Number(e.target.value) })} /></label>
          <label>Casual Leave<input type="number" value={form.leaveBalanceCasual} onChange={e => setForm({ ...form, leaveBalanceCasual: Number(e.target.value) })} /></label>
        </div></fieldset>
        {isEdit && form.status === 'Inactive' && (
          <fieldset className="settings-fieldset"><legend>Exit Info</legend><div>
            <label>Exit Date<input type="date" value={form.exitDate} onChange={e => setForm({ ...form, exitDate: e.target.value })} /></label>
            <label>Exit Reason<input value={form.exitReason} onChange={e => setForm({ ...form, exitReason: e.target.value })} placeholder="Resignation, Termination, Retirement..." /></label>
          </div></fieldset>
        )}
        <button className="primary-action" type="submit">{isEdit ? 'Update Employee' : 'Save Employee'}</button>
      </form>
    </ModalCard>
  );
}

function ReviewFormModal({ employees = [], onClose, onSave }) {
  const first = employees[0] || {};
  const [form, setForm] = useState({ employeeId: first.id || '', period: new Date().toISOString().slice(0, 7), rating: 4, goals: '', feedback: '', status: 'Pending', reviewer: 'Miko Admin' });
  return (
    <ModalCard title="Add Performance Review" onClose={onClose}>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Review Details</legend><div>
          <label>Employee<select value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}>{employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} - {emp.department}</option>)}</select></label>
          <label>Period<input type="month" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} /></label>
          <label>Rating<input type="number" min="0" max="5" value={form.rating} onChange={e => setForm({ ...form, rating: Number(e.target.value) })} /></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{['Pending', 'Completed', 'Needs Improvement'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Reviewer<input value={form.reviewer} onChange={e => setForm({ ...form, reviewer: e.target.value })} /></label>
        </div></fieldset>
        <fieldset className="settings-fieldset"><legend>Feedback</legend><div>
          <label>Goals<textarea rows={3} value={form.goals} onChange={e => setForm({ ...form, goals: e.target.value })} placeholder="Targets, customer goals, skills to improve..." /></label>
          <label>Feedback<textarea rows={3} value={form.feedback} onChange={e => setForm({ ...form, feedback: e.target.value })} placeholder="Manager feedback..." /></label>
        </div></fieldset>
        <button className="primary-action" type="submit">Save Review</button>
      </form>
    </ModalCard>
  );
}

function CandidateFormModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', position: 'Officer', department: 'Sales', source: 'Direct', expectedSalary: 60000, stage: 'Applied', rating: 0 });
  return (
    <ModalCard title="Add Candidate" onClose={onClose}>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Candidate Info</legend><div>
          <label>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
          <label>Phone<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
        </div></fieldset>
        <fieldset className="settings-fieldset"><legend>Position</legend><div>
          <label>Position<input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} /></label>
          <label>Department<select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>{['Sales', 'Finance', 'Inventory', 'Procurement', 'Production', 'Admin', 'CRM', 'Field Operations', 'HR'].map(d => <option key={d}>{d}</option>)}</select></label>
          <label>Source<input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="LinkedIn, Referral, Direct..." /></label>
          <label>Expected Salary (KES)<input type="number" value={form.expectedSalary} onChange={e => setForm({ ...form, expectedSalary: Number(e.target.value) })} /></label>
        </div></fieldset>
        <button className="primary-action" type="submit">Save Candidate</button>
      </form>
    </ModalCard>
  );
}

// ─── LEAVE WORKSPACE ───
function LeaveWorkspace({ user, setPage, globalPeriod = 'Month' }) {
  const tabs = ['apply', 'requests', 'approvals', 'balances', 'calendar'];
  const [view, setView] = useRouteTab('leaves', tabs, 'apply');
  const [refreshKey, setRefreshKey] = useState(0);
  const { loading, data, error } = useServer(user, 'getLeaveData', [{ period: globalPeriod }], [refreshKey, globalPeriod]);
  const [applyModal, setApplyModal] = useState(false);
  const [decideNote, setDecideNote] = useState('');
  const [listLimit, setListLimit] = useState(50);
  const listStep = 50;
  const handleApply = async (form) => {
    try { await rpc('applyLeave', [user, form]); setApplyModal(false); setRefreshKey(k => k + 1); } catch (err) { alert(err.message); }
  };
  const handleDecision = async (id, decision) => {
    try { await rpc('decideLeave', [user, id, { decision, note: decideNote }]); setDecideNote(''); setRefreshKey(k => k + 1); } catch (err) { alert(err.message); }
  };
  const handleCancel = async (id) => {
    try { await rpc('cancelLeave', [user, id]); setRefreshKey(k => k + 1); } catch (err) { alert(err.message); }
  };
  if (loading) return <Loading title="Leaves" />;
  if (error) return <ErrorState title="Leaves" error={error} />;
  const s = data.stats;
  return (
    <section className="page-stack sales-workspace leave-workspace">
      <div className="sales-hero">
        <div><span>Leave Management</span><h1>Leaves</h1><p>Apply for leave, track approvals, and monitor team availability.</p></div>
        <div className="sales-hero-stats">
          <strong>{s.total}</strong><span>Total</span>
          <strong style={{ color: s.pending ? '#f64e4e' : undefined }}>{s.pending}</strong><span>Pending</span>
          <strong style={{ color: '#101828' }}>{s.approved}</strong><span>Approved</span>
          <strong>{s.onLeave}</strong><span>On Leave Today</span>
        </div>
      </div>
      <div className="inline-actions">
        <button onClick={() => setApplyModal(true)}><Plus size={16} /> Apply for Leave</button>
        <button onClick={() => setView('requests')}><FileText size={16} /> My Requests</button>
        <button onClick={() => setView('approvals')}><CheckCircle2 size={16} /> Approvals</button>
        <button onClick={() => setView('balances')}><Calendar size={16} /> Balances</button>
        <CreateRequisitionButton user={user} module="leaves" />
      </div>
      <div className="settings-tabs">
        {tabs.map(t => <button key={t} className={view === t ? 'active' : ''} onClick={() => setView(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>)}
        <button className="primary-action" onClick={() => setApplyModal(true)}>+ Apply for Leave</button>
      </div>

      {view === 'apply' && (
        <div className="dashboard-grid">
          <Panel className="span-4" title="Leave Balances" action="Your entitlements">
            <div className="leave-apply-summary col">
              {data.leaveTypes.map(lt => {
                const bal = data.balances.find(b => b.name === user.name);
                const balance = lt.deducts === 'sick' ? (bal?.sick ?? 10) : lt.deducts === 'casual' ? (bal?.casual ?? 5) : (bal?.annual ?? 21);
                const used = Math.max(0, (lt.defaultDays || 0) - balance);
                const pct = lt.defaultDays ? Math.min(100, Math.round((used / lt.defaultDays) * 100)) : 0;
                return (
                  <div key={lt.id} className="leave-balance-chip">
                    <strong>{lt.name}</strong>
                    <span>{balance}d remaining</span>
                    <div className="leave-progress"><div className="leave-progress-fill" style={{ width: `${100 - pct}%`, background: pct > 80 ? '#f79009' : '#101828' }} /></div>
                  </div>
                );
              })}
            </div>
            <p className="leave-apply-hint">Click &quot;+ Apply for Leave&quot; above to submit a new request. It will route to your department&apos;s HR manager for approval.</p>
          </Panel>
          <Panel className="span-8" title="My Recent Leave Records" action={`${data.myApplications.length} records`}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Type</th><th>Dept</th><th>Start</th><th>End</th><th>Days</th><th>Status</th><th>Applied</th><th /></tr></thead>
                <tbody>
                  {data.myApplications.length === 0 && <tr><td colSpan={8}><div className="empty-state">No leave requests yet. Apply for your first leave above.</div></td></tr>}
                  {data.myApplications.slice(0, listLimit).map(l => (
                    <tr key={l.id}>
                      <td><strong>{l.type}</strong></td>
                      <td>{l.department || '—'}</td>
                      <td>{l.startDate}</td>
                      <td>{l.endDate}</td>
                      <td>{l.days}d</td>
                      <td><span className={`status ${l.status.toLowerCase() === 'approved' ? 'active' : l.status.toLowerCase() === 'rejected' ? 'cancelled' : 'pending'}`}>{l.status}</span></td>
                      <td>{new Date(l.appliedAt).toLocaleDateString()}</td>
                      <td>{l.status === 'Pending' && <button className="btn-reject" onClick={() => handleCancel(l.id)}>Cancel</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.myApplications.length > listLimit && (
              <div className="table-more-note">
                Showing {Math.min(listLimit, data.myApplications.length)} of {data.myApplications.length.toLocaleString()} records.{' '}
                <button className="mini-action" style={{ display: 'inline-flex', marginLeft: 8 }} onClick={() => setListLimit(l => l + listStep)}>Load {listStep} more</button>
              </div>
            )}
          </Panel>
        </div>
      )}

      {view === 'requests' && (
        <Panel className="span-12" title="My Leave Requests" action={`${data.myApplications.length} records`}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Start</th><th>End</th><th>Days</th><th>Reason</th><th>Status</th><th>Applied</th><th /></tr></thead>
              <tbody>
                {data.myApplications.length === 0 && <tr><td colSpan={8}><div className="empty-state">No leave requests</div></td></tr>}
                {data.myApplications.slice(0, listLimit).map(l => (
                  <tr key={l.id}>
                    <td><strong>{l.type}</strong></td>
                    <td>{l.startDate}</td>
                    <td>{l.endDate}</td>
                    <td>{l.days}d</td>
                    <td>{l.reason || '—'}</td>
                    <td><span className={`status ${l.status.toLowerCase() === 'approved' ? 'active' : l.status.toLowerCase() === 'rejected' ? 'cancelled' : 'pending'}`}>{l.status}</span></td>
                    <td>{new Date(l.appliedAt).toLocaleDateString()}</td>
                    <td>{l.status === 'Pending' && <button className="btn-reject" onClick={() => handleCancel(l.id)}>Cancel</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.myApplications.length > listLimit && (
            <div className="table-more-note">
              Showing {Math.min(listLimit, data.myApplications.length)} of {data.myApplications.length.toLocaleString()} records.{' '}
              <button className="mini-action" style={{ display: 'inline-flex', marginLeft: 8 }} onClick={() => setListLimit(l => l + listStep)}>Load {listStep} more</button>
            </div>
          )}
        </Panel>
      )}

      {view === 'approvals' && (
        <Panel className="span-12" title="Pending Approvals" action={`${data.pendingApprovals.length} pending · ${globalPeriod}`}>
          {!data.isManager && <div className="empty-state">Manager access required to view approvals</div>}
          {data.isManager && data.pendingApprovals.length === 0 && <div className="empty-state">No pending leave approvals</div>}
          {data.pendingApprovals.slice(0, listLimit).map(l => (
            <div key={l.id} className="leave-approval-card">
              <div className="leave-approval-info">
                <strong>{l.applicantName}</strong><span>{l.department} · {l.type} · {l.days} day(s)</span>
                <em>{l.startDate} → {l.endDate}</em>
                <p>{l.reason}</p>
                {(() => {
                  const bal = data.balances?.find(b => b.id === l.applicantId || b.name === l.applicantName);
                  const type = data.leaveTypes?.find(lt => lt.name === l.type);
                  const current = type?.deducts === 'sick' ? bal?.sick : type?.deducts === 'casual' ? bal?.casual : bal?.annual;
                  return <small>{current ?? 0}d balance before approval · {Math.max(0, (current ?? 0) - num(l.days))}d after</small>;
                })()}
              </div>
              <div className="leave-approval-actions">
                <input placeholder="Note..." value={decideNote} onChange={e => setDecideNote(e.target.value)} />
                <button className="btn-approve" onClick={() => handleDecision(l.id, 'Approved')}><CheckCircle2 size={14} /> Approve</button>
                <button className="btn-reject" onClick={() => handleDecision(l.id, 'Rejected')}><X size={14} /> Reject</button>
              </div>
            </div>
          ))}
          {data.pendingApprovals.length > listLimit && (
            <div className="table-more-note">
              Showing {Math.min(listLimit, data.pendingApprovals.length)} of {data.pendingApprovals.length.toLocaleString()} pending.{' '}
              <button className="mini-action" style={{ display: 'inline-flex', marginLeft: 8 }} onClick={() => setListLimit(l => l + listStep)}>Load {listStep} more</button>
            </div>
          )}
        </Panel>
      )}

      {view === 'balances' && (
        <Panel className="span-12" title="Leave Balances" action={`${data.balances.length} employees`}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Department</th><th>Annual</th><th>Sick</th><th>Casual</th></tr></thead>
              <tbody>
                {data.balances.map(b => (
                  <tr key={b.id}>
                    <td><strong>{b.name}</strong></td>
                    <td>{b.department}</td>
                    <td>{b.annual}d</td>
                    <td>{b.sick}d</td>
                    <td>{b.casual}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {view === 'calendar' && (
        <Panel className="span-12" title="Team Leave Calendar" action={`${data.onLeaveToday.length} on leave today`}>
          {Object.keys(data.calendar).length === 0 && <div className="empty-state">No leave recorded</div>}
          <div className="leave-calendar-grid">
            {Object.entries(data.calendar).sort(([a], [b]) => b.localeCompare(a)).slice(0, 60).map(([date, entries]) => (
              <div key={date} className="leave-calendar-day">
                <strong>{date}</strong>
                {entries.map((e, i) => <span key={i} className="leave-calendar-entry">{e.name} ({e.type})</span>)}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {applyModal && <LeaveApplyModal user={user} leaveTypes={data.leaveTypes} departments={data.departments || []} balances={data.balances} onClose={() => setApplyModal(false)} onSave={handleApply} />}
    </section>
  );
}

function LeaveApplyModal({ user, leaveTypes, departments = [], balances = [], onClose, onSave }) {
  const employees = balances || [];
  const me = balances.find(b => b.name === user.name) || {};
  const [form, setForm] = useState({
    type: 'Annual',
    department: me.department || departments[0] || '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    reason: '',
    emergencyContact: '',
    coveringEmployee: ''
  });
  const selectedType = leaveTypes.find(lt => lt.name === form.type) || { deducts: 'annual', defaultDays: 21 };
  const balance = selectedType.deducts === 'sick' ? (me.sick ?? 10) : selectedType.deducts === 'casual' ? (me.casual ?? 5) : (me.annual ?? 21);
  const days = businessDaysBetween(form.startDate, form.endDate);
  const remainingAfter = Math.max(0, balance - days);
  const exceedsBalance = days > balance;
  const coveringOptions = employees.filter(e => e.name !== user.name && e.department === form.department);
  return (
    <ModalCard title="Apply for Leave" onClose={onClose}>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Employee & Leave Details</legend><div>
          <label>Employee Name<input type="text" value={user.name} disabled /></label>
          <label>Employee ID<input type="text" value={user.id || user.email} disabled /></label>
          <label>Department
            <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} required>
              <option value="">Select department...</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label>Position<input type="text" value={me.position || user.role || ''} disabled /></label>
          <label>Leave Type
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              {leaveTypes.map(lt => <option key={lt.id} value={lt.name}>{lt.name} ({lt.defaultDays}d default)</option>)}
            </select>
          </label>
          <label>Start Date<input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} required /></label>
          <label>End Date<input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} required /></label>
          <label>Reason<textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} rows={3} placeholder="Brief reason for leave..." /></label>
        </div></fieldset>
        <fieldset className="settings-fieldset"><legend>Additional Information</legend><div>
          <label>Emergency Contact<input type="text" value={form.emergencyContact} onChange={e => setForm({ ...form, emergencyContact: e.target.value })} placeholder="Name and phone number..." /></label>
          <label>Covering Employee
            <select value={form.coveringEmployee} onChange={e => setForm({ ...form, coveringEmployee: e.target.value })}>
              <option value="">None</option>
              {coveringOptions.map(e => <option key={e.id} value={e.name}>{e.name} ({e.department})</option>)}
            </select>
          </label>
        </div></fieldset>
        <div className="leave-calc-preview">
          <div className="leave-calc-row"><span>Leave Type</span><strong>{form.type}</strong></div>
          <div className="leave-calc-row"><span>Current balance</span><strong>{balance}d</strong></div>
          <div className="leave-calc-row"><span>Requested days</span><strong style={{ color: exceedsBalance ? '#d92d20' : '#101828' }}>{days}d</strong></div>
          <div className="leave-calc-row"><span>Calculation</span><strong>Business days only</strong></div>
          <div className="leave-calc-row"><span>Period</span><strong>{form.startDate} → {form.endDate}</strong></div>
          <div className="leave-calc-row total"><span>Remaining after</span><strong style={{ color: exceedsBalance ? '#d92d20' : '#101828' }}>{remainingAfter}d</strong></div>
          {exceedsBalance && <p className="leave-calc-warn">⚠ This request exceeds your available {form.type.toLowerCase()} balance. It may require manager approval.</p>}
        </div>
        <button className="primary-action" type="submit">Submit Leave Request</button>
      </form>
    </ModalCard>
  );
}

function SimpleTable({ rows, columns, onRowClick }) {
  const [limit, setLimit] = useState(25);
  const step = 50;
  const safeRows = (rows || []).filter(Boolean);
  const shown = safeRows.slice(0, limit);
  function actionsFor(row, index) {
    const summary = rowSummary(row);
    const base = [
      { label: 'Copy Row', icon: <FileText size={15} />, onClick: () => copyText(summary) },
      { label: 'Print Row', icon: <Printer size={15} />, onClick: () => printText(row.saleNo || row.invNo || row.name || row.id || `Record ${index + 1}`, summary) },
      {
        label: 'Download JSON',
        icon: <Download size={15} />,
        onClick: () => {
          const blob = new Blob([JSON.stringify(row, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${String(row.saleNo || row.invNo || row.name || row.id || `record-${index + 1}`).replace(/[^a-z0-9-]+/gi, '-')}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
    ];
    if (onRowClick) {
      base.unshift({ label: 'Edit / Open', icon: <FileText size={15} />, onClick: () => onRowClick(row) });
    }
    return base;
  }
  return (
    <div className="table-wrap">
      {safeRows.length > 0 && <div className="table-count">{safeRows.length.toLocaleString()} records</div>}
      <table>
        <thead>
          <tr>{columns.map(c => <th key={c}>{label(c)}</th>)}<th /></tr>
        </thead>
        <tbody>
          {shown.map((row, index) => (
            <tr key={row.id || index} onClick={() => onRowClick?.(row)} style={onRowClick ? { cursor: 'pointer' } : {}}>
              {columns.map(c => <td key={c}>{formatCell(row[c], c)}</td>)}
              <td onClick={e => e.stopPropagation()}><ActionMenu actions={actionsFor(row, index)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit && (
        <div className="table-more-note">
          Showing {shown.length} of {rows.length.toLocaleString()} records.{' '}
          <button className="mini-action" style={{ display: 'inline-flex', marginLeft: 8 }} onClick={() => setLimit(l => l + step)}>Load {step} more</button>
        </div>
      )}
      {!rows.length && <div className="empty-state">No records yet</div>}
    </div>
  );
}

function TopProducts({ categories }) {
  const products = categories.length ? categories : [
    { name: 'Bactrolure Wick', total: 38400 },
    { name: 'Organic Neem Oil', total: 33600 }
  ];
  return (
    <div className="product-list">
      {products.slice(0, 5).map((p, i) => (
        <div key={p.name}>
          <span className="product-icon"><Package size={20} /></span>
          <strong>{p.name}</strong>
          <em>{320 - i * 35}</em>
          <b>{currency(p.total)}</b>
        </div>
      ))}
    </div>
  );
}

// ─── EMAIL WORKSPACE (Compose & Send) ───
function EmailWorkspace({ user, setPage }) {
  const tabs = ['compose', 'drafts', 'sent', 'templates'];
  const [view, setView] = useRouteTab('email', tabs, 'compose');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [from, setFrom] = useState('mikomike200@gmail.com');
  const [sending, setSending] = useState(false);
  const [sentResult, setSentResult] = useState(null);
  const [sentEmails, setSentEmails] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [templateQuery, setTemplateQuery] = useState('');
  const [templateCategory, setTemplateCategory] = useState('All Categories');
  const [refreshKey, setRefreshKey] = useState(0);
  const [attachInvoiceId, setAttachInvoiceId] = useState('');
  const [attachVatMode, setAttachVatMode] = useState('auto');
  const [attachInvoices, setAttachInvoices] = useState([]);
  const [sentLimit, setSentLimit] = useState(50);
  const [draftLimit, setDraftLimit] = useState(50);
  const listStep = 50;

  useEffect(() => {
    try {
      setDrafts(JSON.parse(localStorage.getItem('farmtrack-email-drafts') || '[]'));
    } catch {
      setDrafts([]);
    }
  }, []);

  const persistDrafts = next => {
    setDrafts(next);
    localStorage.setItem('farmtrack-email-drafts', JSON.stringify(next));
  };

  const clearCompose = () => {
    setTo('');
    setCc('');
    setBcc('');
    setSubject('');
    setBody('');
    setAttachInvoiceId('');
    setAttachVatMode('auto');
    setSentResult(null);
  };

  const saveDraft = () => {
    if (!to.trim() && !subject.trim() && !body.trim()) return;
    persistDrafts([{ id: `DRAFT-${Date.now()}`, to, cc, bcc, from, subject, body, attachInvoiceId, attachVatMode, updatedAt: new Date().toISOString() }, ...drafts].slice(0, 50));
    setSentResult({ sent: true, recipients: ['draft saved'], messageId: 'draft' });
  };

  const loadDraft = draft => {
    setTo(draft.to || '');
    setCc(draft.cc || '');
    setBcc(draft.bcc || '');
    setFrom(draft.from || from);
    setSubject(draft.subject || '');
    setBody(draft.body || '');
    setAttachInvoiceId(draft.attachInvoiceId || '');
    setAttachVatMode(draft.attachVatMode || 'auto');
    setSentResult(null);
    setView('compose');
  };

  async function sendEmail() {
    if (!to.trim()) return alert('Please enter a recipient email');
    if (!subject.trim()) return alert('Please enter a subject');
    if (!body.trim()) return alert('Please write an email message');
    setSending(true);
    setSentResult(null);
    try {
      const result = await rpc('sendComposedEmail', [user, { to, cc, bcc, subject, body, from, invoiceAttachmentId: attachInvoiceId, invoiceVatMode: attachVatMode }]);
      setSentResult(result);
      if (result.sent) {
        clearCompose();
        setRefreshKey(k => k + 1);
      }
    } catch (e) {
      setSentResult({ sent: false, error: e.message });
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (view === 'compose') {
      rpc('getAccountsData', [user]).then(data => setAttachInvoices((data?.receivables || []).filter(row => row.invoiceId || row.id))).catch(() => {});
    }
    if (view === 'sent') {
      rpc('getEmailLog', [user, { limit: 50 }]).then(data => {
        setSentEmails((data?.emails || []).filter(e => e.template === 'composed_email' || e.relatedModule === 'email'));
      }).catch(() => {});
    }
  }, [view, refreshKey]);

  const templates = [
    { label: 'Leave Approval Request', category: 'Leaves', subject: 'Leave Approval Required - {employeeName}', body: 'Hi {managerName}\n\nPlease review this leave request.\n\nEmployee: {employeeName}\nDepartment: {department}\nLeave Type: {leaveType}\nFrom: {startDate}\nTo: {endDate}\nTotal Days: {days}\nReason: {reason}\n\nAction required: approve or reject this request in FarmTrack ERP.\n\nBest regards,\nFarmTrack ERP' },
    { label: 'Leave Approved', category: 'Leaves', subject: 'Leave Approved - {leaveType}', body: 'Hi {employeeName}\n\nYour leave request has been approved.\n\nLeave Type: {leaveType}\nPeriod: {startDate} to {endDate}\nTotal Days: {days}\nRemarks: {remarks}\n\nPlease complete any handover before your leave starts.\n\nBest regards,\nFarmTrack HR' },
    { label: 'HR Welcome', category: 'HR', subject: 'Welcome to FarmTrack - {employeeName}', body: 'Hi {employeeName}\n\nWelcome to FarmTrack BioSciences. Your HR profile has been created in the ERP.\n\nDepartment: {department}\nPosition: {position}\nStart Date: {startDate}\nManager: {manager}\n\nWe are glad to have you on the team.\n\nBest regards,\nFarmTrack HR' },
    { label: 'Attendance Follow-up', category: 'HR', subject: 'Attendance Follow-up - {date}', body: 'Hi {employeeName}\n\nWe need to confirm your attendance record for {date}.\n\nStatus: {status}\nCheck In: {checkIn}\nCheck Out: {checkOut}\nNote: {note}\n\nPlease reply with any corrections.\n\nBest regards,\nFarmTrack HR' },
    { label: 'Payment Reminder', category: 'Finance', subject: 'Payment Reminder - Invoice {invNo}', body: 'Dear Customer,\n\nThis is a friendly reminder that invoice {invNo} for {amount} is due on {dueDate}.\n\nPlease remit payment at your earliest convenience.\n\nThank you,\nFarmTrack Finance' },
    { label: 'Delivery Update', category: 'Sales', subject: 'Delivery Update - {deliveryNo}', body: 'Dear Customer,\n\nYour delivery {deliveryNo} is currently {status}.\n\nExpected arrival: {date}\n\nRegards,\nFarmTrack ERP' },
    { label: 'Purchase Approval', category: 'Purchases', subject: 'Purchase Approval Required - {poNo}', body: 'Hi {approverName},\n\nPlease review this purchase request.\n\nPO Number: {poNo}\nSupplier: {supplier}\nAmount: {amount}\nDepartment: {department}\nReason: {reason}\n\nAction required: approve, reject, or reply with comments.\n\nBest regards,\nFarmTrack Procurement' },
    { label: 'Inventory Alert', category: 'Inventory', subject: 'Inventory Alert - {productName}', body: 'Hi {recipientName},\n\nInventory needs attention.\n\nProduct: {productName}\nWarehouse: {warehouse}\nCurrent Stock: {currentStock}\nRequired Action: {actionRequired}\nNotes: {notes}\n\nBest regards,\nFarmTrack Inventory' },
    { label: 'Manufacturing Update', category: 'Manufacturing', subject: 'Manufacturing Update - {batchNo}', body: 'Hi {recipientName},\n\nProduction update for your review.\n\nBatch: {batchNo}\nProduct: {productName}\nStatus: {status}\nOutput: {output}\nNotes: {notes}\n\nBest regards,\nFarmTrack Production' },
    { label: 'Customer Follow-up', category: 'CRM', subject: 'Customer Follow-up - {customerName}', body: 'Hi {recipientName},\n\nPlease follow up with this customer.\n\nCustomer: {customerName}\nPhone: {phone}\nLast Activity: {lastActivity}\nNext Step: {nextStep}\nNotes: {notes}\n\nBest regards,\nFarmTrack CRM' },
    { label: 'Internal Memo', category: 'Internal', subject: 'Internal Memo - {topic}', body: 'Hi Team,\n\nPlease note the following internal update.\n\nTopic: {topic}\nDepartment: {department}\nPriority: {priority}\nDetails: {details}\n\nPlease reply with any questions or confirmation.\n\nBest regards,\nFarmTrack ERP' },
    { label: 'Field Report', category: 'Field Ops', subject: 'Field Report - {location}', body: 'Hi {recipientName},\n\nField activity report submitted.\n\nLocation: {location}\nOfficer: {officerName}\nActivity: {activity}\nFindings: {findings}\nRequired Support: {supportNeeded}\n\nBest regards,\nFarmTrack Field Operations' },
    { label: 'Accounts Statement', category: 'Accounts', subject: 'Statement Update - {accountName}', body: 'Dear {accountName},\n\nPlease find the current account update below.\n\nBalance: {balance}\nDue Date: {dueDate}\nReference: {reference}\nNotes: {notes}\n\nRegards,\nFarmTrack Accounts' },
    { label: 'Meeting Request', category: 'Internal', subject: 'Meeting Request - {topic}', body: 'Hi {recipientName},\n\nPlease attend the meeting below.\n\nTopic: {topic}\nDate: {date}\nTime: {time}\nVenue/Link: {venue}\nAgenda: {agenda}\n\nBest regards,\nFarmTrack ERP' },
    { label: 'Policy Notice', category: 'HR', subject: 'Policy Notice - {policyName}', body: 'Hi Team,\n\nPlease review this policy notice.\n\nPolicy: {policyName}\nEffective Date: {effectiveDate}\nSummary: {summary}\nAction Required: {actionRequired}\n\nBest regards,\nFarmTrack HR' }
  ];
  const categories = ['All Categories', ...Array.from(new Set(templates.map(t => t.category)))];
  const filteredTemplates = useMemo(() => templates.filter(tpl => {
    const haystack = `${tpl.label} ${tpl.category} ${tpl.subject}`.toLowerCase();
    return (templateCategory === 'All Categories' || tpl.category === templateCategory) && (!templateQuery.trim() || haystack.includes(templateQuery.trim().toLowerCase()));
  }), [templateCategory, templateQuery]);
  const applyTemplate = tpl => {
    setSubject(tpl.subject);
    setBody(tpl.body);
    setView('compose');
  };
  const tabIcon = { compose: FileText, drafts: Archive, sent: Send, templates: Boxes };

  return (
    <section className="page-stack email-workspace">
      <div className="sales-hero email-hero">
        <div>
          <span>Email · {from}</span>
          <h1>Email</h1>
          <p>Compose and send emails directly from the ERP using your connected email account.</p>
        </div>
        <div className="sales-hero-stats">
          <strong>{sentEmails.length}</strong><span>Sent Emails</span>
          <strong>{templates.length}</strong><span>Templates</span>
        </div>
      </div>
      <div className="inline-actions"><CreateRequisitionButton user={user} module="email" /></div>

      <div className="email-shell">
      <div className="email-nav-tabs">
        {tabs.map(t => {
          const Icon = tabIcon[t] || FileText;
          return <button key={t} className={view === t ? 'active' : ''} onClick={() => setView(t)}><Icon size={18} />{label(t)}</button>;
        })}
      </div>

      {view === 'compose' && (
        <div className="email-compose-panel">
          <div className="compose-form">
            <div className="email-template-strip">
              {templates.slice(0, 4).map(tpl => (
                <button key={tpl.label} type="button" onClick={() => { setSubject(tpl.subject); setBody(tpl.body); }}>
                  <FileText size={15} />
                  <span>{tpl.label}</span>
                  <em>{tpl.category}</em>
                </button>
              ))}
            </div>
            <div className="compose-field">
              <label>Reply-To</label>
              <input type="email" value={from} onChange={e => setFrom(e.target.value)} placeholder="your@email.com" />
              <small>Sent from Unity ERP. Recipients reply to this address.</small>
            </div>
            <div className="compose-field">
              <label>To <span className="required">*</span></label>
              <input type="text" value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@email.com (separate multiple with , or ;)" />
            </div>
            <div className="compose-field">
              <label>CC</label>
              <input type="text" value={cc} onChange={e => setCc(e.target.value)} placeholder="cc@email.com (optional)" />
            </div>
            <div className="compose-field">
              <label>BCC</label>
              <input type="text" value={bcc} onChange={e => setBcc(e.target.value)} placeholder="bcc@email.com (optional)" />
            </div>
            <div className="compose-field">
              <label>Subject <span className="required">*</span></label>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject" />
            </div>
            <div className="compose-attachment-box">
              <div>
                <strong>Invoice attachment</strong>
                <span>Optional PDF tax invoice generated from Accounts</span>
              </div>
              <select value={attachInvoiceId} onChange={e => setAttachInvoiceId(e.target.value)}>
                <option value="">No invoice attached</option>
                {attachInvoices.map(row => (
                  <option key={row.invoiceId || row.id} value={row.invoiceId || row.id}>
                    {row.invNo || row.invoiceNo} - {row.customerName} - {currency(row.balance || row.total)}
                  </option>
                ))}
              </select>
              <select value={attachVatMode} onChange={e => setAttachVatMode(e.target.value)} disabled={!attachInvoiceId}>
                <option value="auto">VAT auto</option>
                <option value="none">No VAT</option>
                <option value="vat16">VAT 16%</option>
              </select>
            </div>
            <div className="compose-field compose-body">
              <label>Message <span className="required">*</span></label>
              <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Write your email message here..." rows={12} />
            </div>
            <div className="compose-actions">
              <button className="primary-action" onClick={sendEmail} disabled={sending}>
                {sending ? <><Loader2 size={16} className="spin" /> Sending...</> : <><Send size={16} /> Send Email</>}
              </button>
              <button className="secondary-action" onClick={() => { setTo(''); setCc(''); setBcc(''); setSubject(''); setBody(''); setAttachInvoiceId(''); setAttachVatMode('auto'); setSentResult(null); }}>
                <X size={14} /> Clear
              </button>
              <button className="secondary-action" onClick={saveDraft}>
                <Archive size={14} /> Save Draft
              </button>
            </div>
            {sentResult && (
              <div className={`compose-result ${sentResult.sent ? 'success' : 'error'}`}>
                {sentResult.sent
                  ? `Email sent successfully to ${sentResult.recipients?.join(', ')}${sentResult.attachment ? ` with ${sentResult.attachment.invoiceNo} attached` : ''} (ID: ${sentResult.messageId || 'OK'})`
                  : `Failed to send: ${sentResult.error || 'Unknown error'}`}
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'drafts' && (
        <div className="email-sent-list scroll-feature-list">
          {drafts.length === 0 && (
            <div className="empty-state">
              <Archive size={40} />
              <h3>No drafts saved</h3>
              <p>Drafts created from Compose will appear here.</p>
              <button onClick={() => setView('compose')}>Compose Email</button>
            </div>
          )}
          {drafts.slice(0, draftLimit).map(draft => (
            <article key={draft.id} className="email-sent-row" onClick={() => loadDraft(draft)}>
              <div className="email-sent-info">
                <strong>{draft.subject || 'Untitled draft'}</strong>
                <span>To: {draft.to || 'No recipient yet'}</span>
                <small>{String(draft.updatedAt || '').slice(0, 19).replace('T', ' ')}</small>
              </div>
              <button type="button" className="mini-action" onClick={event => { event.stopPropagation(); persistDrafts(drafts.filter(row => row.id !== draft.id)); }}>Delete</button>
            </article>
          ))}
          {drafts.length > draftLimit && (
            <div className="table-more-note">
              Showing {Math.min(draftLimit, drafts.length)} of {drafts.length.toLocaleString()} drafts.{' '}
              <button className="mini-action" style={{ display: 'inline-flex', marginLeft: 8 }} onClick={() => setDraftLimit(l => l + listStep)}>Load {listStep} more</button>
            </div>
          )}
        </div>
      )}

      {view === 'sent' && (
        <div className="email-sent-list">
          {sentEmails.length === 0 && (
            <div className="empty-state">
              <Mail size={40} />
              <h3>No composed emails sent yet</h3>
              <p>Compose and send your first email from the Compose tab.</p>
              <button onClick={() => setView('compose')}>Compose Email</button>
            </div>
          )}
          {sentEmails.slice(0, sentLimit).map(email => (
            <article key={email.id} className="email-sent-row">
              <div className="email-sent-info">
                <strong>{email.subject || email.template}</strong>
                <span>To: {email.to}</span>
                <small>{email.createdAt || ''} · {email.status}</small>
              </div>
              <span className={`email-status-badge ${email.status === 'sent' ? 'badge-success' : 'badge-error'}`}>
                {email.status}
              </span>
            </article>
          ))}
          {sentEmails.length > sentLimit && (
            <div className="table-more-note">
              Showing {Math.min(sentLimit, sentEmails.length)} of {sentEmails.length.toLocaleString()} sent emails.{' '}
              <button className="mini-action" style={{ display: 'inline-flex', marginLeft: 8 }} onClick={() => setSentLimit(l => l + listStep)}>Load {listStep} more</button>
            </div>
          )}
        </div>
      )}

      {view === 'templates' && (
        <div className="email-template-page">
          <div className="email-template-heading">
            <div>
              <h2>Email Templates</h2>
              <p>Create, manage and reuse email templates</p>
            </div>
            <div className="email-template-tools">
              <label><Search size={17} /><input value={templateQuery} onChange={e => setTemplateQuery(e.target.value)} placeholder="Search templates..." /></label>
              <select value={templateCategory} onChange={e => setTemplateCategory(e.target.value)}>
                {categories.map(category => <option key={category}>{category}</option>)}
              </select>
              <button type="button" onClick={() => { clearCompose(); setView('compose'); }}><Plus size={16} /> New Template</button>
            </div>
          </div>
          <div className="email-templates-grid scroll-feature-list">
          {filteredTemplates.map((tpl, i) => (
            <article key={i} className="template-card" onClick={() => applyTemplate(tpl)}>
              <div className="template-card-header">
                <FileText size={22} />
                <button type="button" aria-label={`More actions for ${tpl.label}`}><MoreVertical size={17} /></button>
              </div>
              <strong>{tpl.label}</strong>
              <span>{tpl.category}</span>
              <p>{tpl.subject}</p>
              <small><Clock size={14} /> Last edited {i < 6 ? `${i + 2} hours ago` : `${Math.max(1, i - 4)} days ago`}</small>
              <button type="button"><Search size={15} /> Preview</button>
            </article>
          ))}
          {filteredTemplates.length === 0 && <div className="empty-state">No templates match the current filter.</div>}
          </div>
          <div className="email-template-count">Showing {filteredTemplates.length} of {templates.length} templates</div>
        </div>
      )}
      </div>
    </section>
  );
}

// ─── EMAIL ADMINISTRATION CENTER ───
function EmailAdminCenter({ user, setPage }) {
  const tabs = ['dashboard', 'logs', 'templates', 'preferences', 'activity'];
  const [view, setView] = useRouteTab('email-admin', tabs, 'dashboard');
  const [stats, setStats] = useState({ totalSent: 0, totalFailed: 0, deliveryRate: 0, recentEmails: [], moduleBreakdown: [], mostActiveModule: 'N/A' });
  const [logs, setLogs] = useState([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logFilters, setLogFilters] = useState({ module: '', status: '', search: '', startDate: '', endDate: '', page: 0 });
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(null);

  const fetchStats = async () => {
    try {
      const logData = await rpc('getEmailLog', [user, { limit: 500 }]);
      const allEmails = logData?.emails || [];
      const totalSent = allEmails.filter(e => e.status === 'sent').length;
      const totalFailed = allEmails.filter(e => e.status === 'failed').length;
      const totalPending = allEmails.filter(e => e.status === 'pending' || e.status === 'error').length;
      const totalAll = allEmails.length;
      const deliveryRate = totalAll ? Math.round((totalSent / totalAll) * 100) : 0;
      const byModule = {};
      allEmails.forEach(e => {
        const m = e.module_source || e.template || 'system';
        byModule[m] = (byModule[m] || 0) + 1;
      });
      const moduleBreakdown = Object.entries(byModule).map(([name, count]) => ({ name, count }));
      const topModule = moduleBreakdown.sort((a, b) => b.count - a.count)[0]?.name || 'N/A';
      setStats({ totalSent, totalFailed, deliveryRate, recentEmails: allEmails.slice(0, 10), moduleBreakdown, mostActiveModule: topModule });
    } catch (err) { console.error(err); }
  };

  const fetchLogs = async (filters = logFilters) => {
    try {
      const data = await rpc('getEmailLog', [user, { ...filters, limit: 50 }]);
      setLogs(data?.emails || []);
      setLogTotal(data?.total || 0);
    } catch (err) { console.error(err); }
  };
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStats(), fetchLogs()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [logFilters]);

  const handleResend = async (logId) => {
    setResending(logId);
    try {
      await rpc('resendEmail', [user, logId]);
      fetchLogs();
      fetchStats();
    } catch (err) { console.error(err); }
    setResending(null);
  };

  const pageCount = Math.ceil(logTotal / 50);

  if (loading) return <Loading title="Email Administration" />;

  return (
    <section className="page-stack email-admin-page">
      <div className="sales-hero email-hero">
        <div>
          <span>Email & Notification Administration Center</span>
          <h1>Email Administration</h1>
          <p>Monitor email delivery, manage templates, configure preferences, and track user activity across all ERP modules.</p>
        </div>
        <div className="sales-hero-stats">
          <strong>{stats.totalSent}</strong><span>Sent</span>
          <strong style={{ color: stats.totalFailed ? '#d92d20' : '#101828' }}>{stats.totalFailed}</strong><span>Failed</span>
          <strong>{stats.deliveryRate}%</strong><span>Delivery Rate</span>
        </div>
      </div>
      <div className="inline-actions"><CreateRequisitionButton user={user} module="email-admin" /></div>
      <div className="settings-tabs">
        {tabs.map(t => <button key={t} className={view === t ? 'active' : ''} onClick={() => setView(t)}>{label(t)}</button>)}
      </div>

      {view === 'dashboard' && (
        <div className="dashboard-grid">
          <Panel className="span-4" title="Email Delivery Summary">
            <div className="metric-stack">
              <div><span>Total Sent</span><strong style={{ color: '#101828' }}>{stats.totalSent}</strong></div>
              <div><span>Failed</span><strong style={{ color: stats.totalFailed ? '#d92d20' : '#667085' }}>{stats.totalFailed}</strong></div>
              <div><span>Delivery Rate</span><strong>{stats.deliveryRate}%</strong></div>
              <div><span>Most Active Module</span><strong>{stats.mostActiveModule}</strong></div>
            </div>
          </Panel>
          <Panel className="span-4" title="Module Breakdown">
            <div className="module-breakdown-list">
              {stats.moduleBreakdown.map(m => (
                <div key={m.name} className="module-breakdown-item">
                  <span>{label(m.name)}</span>
                  <div className="module-bar-track">
                    <div className="module-bar-fill" style={{ width: `${Math.min(100, Math.round((m.count / Math.max(1, stats.totalSent)) * 100))}%` }} />
                  </div>
                  <strong>{m.count}</strong>
                </div>
              ))}
              {stats.moduleBreakdown.length === 0 && <div className="empty-state">No module data yet</div>}
            </div>
          </Panel>
          <Panel className="span-4" title="Quick Actions">
            <div className="finance-action-stack">
              <button onClick={() => setView('logs')}><Mail size={17} /><span>View Email Logs</span><em>Inspect sent, failed, and pending emails</em></button>
              <button onClick={() => setView('templates')}><FileText size={17} /><span>Email Templates</span><em>Manage reusable templates</em></button>
              <button onClick={() => setView('preferences')}><Settings size={17} /><span>User Preferences</span><em>Configure notification settings</em></button>
              <button onClick={() => setView('activity')}><Activity size={17} /><span>Activity Log</span><em>View user engagement with emails</em></button>
            </div>
          </Panel>
          <Panel className="span-8" title="Recent Emails" action={`${stats.recentEmails.length} recent`}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Recipient</th><th>Subject</th><th>Module</th><th>Status</th><th>Sent</th></tr></thead>
                <tbody>
                  {stats.recentEmails.slice(0, 10).map(e => (
                    <tr key={e.id}>
                      <td>{e.to || e.recipient || '—'}</td>
                      <td><strong>{e.subject || '—'}</strong></td>
                      <td><span className="status-badge">{e.relatedModule || e.template || e.module_source || 'system'}</span></td>
                      <td><span className={`status ${e.status === 'sent' || e.status === 'opened' ? 'active' : e.status === 'failed' ? 'cancelled' : 'pending'}`}>{e.status}</span></td>
                      <td style={{ fontSize: 12, color: '#667085' }}>{e.createdAt || e.sent_at ? new Date(e.createdAt || e.sent_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                  {stats.recentEmails.length === 0 && <tr><td colSpan={5}><div className="empty-state">No emails sent yet</div></td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel className="span-4" title="System Info">
            <div className="settings-kv-grid">
              <article><span>Platform</span><strong>staff.farmtrack.co.ke</strong></article>
              <article><span>Provider</span><strong>Resend</strong></article>
              <article><span>From Addresses</span><strong>6 configured</strong></article>
              <article><span>Tracking</span><strong>Active</strong></article>
            </div>
          </Panel>
        </div>
      )}

      {view === 'logs' && (
        <div className="dashboard-grid">
          <Panel className="span-12" title="Email Activity Log" action={`${logTotal} total records`}>
            <div className="report-filter-bar email-filter-bar">
              <label>Module<select value={logFilters.module} onChange={e => setLogFilters({ ...logFilters, module: e.target.value, page: 0 })}>
                <option value="">All Modules</option>
                <option value="leaves">Leaves</option>
                <option value="invoices">Invoices</option>
                <option value="purchasing">Purchasing</option>
                <option value="assets">Assets</option>
                <option value="hr">HR</option>
                <option value="reports">Reports</option>
                <option value="system">System</option>
              </select></label>
              <label>Status<select value={logFilters.status} onChange={e => setLogFilters({ ...logFilters, status: e.target.value, page: 0 })}>
                <option value="">All Statuses</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
                <option value="opened">Opened</option>
              </select></label>
              <label>Search<input value={logFilters.search} onChange={e => setLogFilters({ ...logFilters, search: e.target.value, page: 0 })} placeholder="Search recipient..." /></label>
              <label>From<input type="date" value={logFilters.startDate} onChange={e => setLogFilters({ ...logFilters, startDate: e.target.value, page: 0 })} /></label>
              <label>To<input type="date" value={logFilters.endDate} onChange={e => setLogFilters({ ...logFilters, endDate: e.target.value, page: 0 })} /></label>
              <button onClick={() => { setLogFilters({ module: '', status: '', search: '', startDate: '', endDate: '', page: 0 }); }}>Clear</button>
            </div>
            <div className="table-wrap">
              <table className="email-log-table">
                <thead><tr><th>Recipient</th><th>Sender</th><th>Subject</th><th>Module</th><th>Status</th><th>Opened</th><th>Sent</th><th>Actions</th></tr></thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td><strong>{log.to || log.recipient || '—'}</strong></td>
                      <td style={{ fontSize: 12 }}>{log.from || log.sender || '—'}</td>
                      <td>{log.subject || '—'}</td>
                      <td><span className="status-badge">{log.relatedModule || log.template || log.module_source || 'system'}</span></td>
                      <td><span className={`status ${log.status === 'sent' || log.status === 'opened' ? 'active' : log.status === 'failed' ? 'cancelled' : 'pending'}`}>{log.status || '—'}</span></td>
                      <td>{log.opened_at ? new Date(log.opened_at).toLocaleString() : '—'}</td>
                      <td style={{ fontSize: 12, color: '#667085' }}>{log.createdAt || log.sent_at ? new Date(log.createdAt || log.sent_at).toLocaleString() : '—'}</td>
                      <td>
                        {log.status === 'failed' && (
                          <button className="btn-retry" onClick={() => handleResend(log.id)} disabled={resending === log.id}>
                            {resending === log.id ? 'Resending...' : 'Resend'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && <tr><td colSpan={8}><div className="empty-state">No email logs match your filters</div></td></tr>}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="pagination">
                <button disabled={logFilters.page === 0} onClick={() => setLogFilters({ ...logFilters, page: logFilters.page - 1 })}>Previous</button>
                <span>Page {logFilters.page + 1} of {pageCount}</span>
                <button disabled={logFilters.page >= pageCount - 1} onClick={() => setLogFilters({ ...logFilters, page: logFilters.page + 1 })}>Next</button>
              </div>
            )}
          </Panel>
        </div>
      )}

      {view === 'templates' && (
        <Panel className="span-12" title="Email Templates" action="Reusable">
          <div className="template-info">
            <p style={{ fontSize: 13, color: '#475467', margin: 0 }}>Email templates are defined in the backend service (<code>api/resend-service-core.js</code>). Templates support these dynamic variables:</p>
            <div className="template-variables">
              {['{{employee_name}}', '{{employee_id}}', '{{leave_type}}', '{{invoice_number}}', '{{amount}}', '{{purchase_order}}', '{{asset_name}}', '{{asset_tag}}', '{{approval_link}}', '{{portal_link}}'].map(v => (
                <code key={v}>{v}</code>
              ))}
            </div>
          </div>
          <div className="template-categories">
            <div className="template-category">
              <h3>Leave Management</h3>
              <ul>
                <li>Leave Request Submitted</li>
                <li>Leave Approved</li>
                <li>Leave Rejected</li>
                <li>Leave Cancelled</li>
                <li>Leave Balance Reminder</li>
              </ul>
            </div>
            <div className="template-category">
              <h3>Invoice Management</h3>
              <ul>
                <li>Invoice Created</li>
                <li>Invoice Sent</li>
                <li>Payment Received</li>
                <li>Invoice Overdue</li>
                <li>Credit Note Issued</li>
              </ul>
            </div>
            <div className="template-category">
              <h3>Purchase Orders</h3>
              <ul>
                <li>Purchase Requisition Submitted</li>
                <li>PO Awaiting Approval</li>
                <li>PO Approved</li>
                <li>PO Rejected</li>
              </ul>
            </div>
            <div className="template-category">
              <h3>Asset Management</h3>
              <ul>
                <li>Asset Assigned</li>
                <li>Asset Returned</li>
                <li>Asset Maintenance Due</li>
                <li>Asset Disposal Request</li>
              </ul>
            </div>
            <div className="template-category">
              <h3>HR</h3>
              <ul>
                <li>Employee Invitation</li>
                <li>Employee Onboarding</li>
                <li>Probation Completion</li>
                <li>Contract Expiry Reminder</li>
              </ul>
            </div>
            <div className="template-category">
              <h3>Goods Received</h3>
              <ul>
                <li>GRN Submitted</li>
                <li>GRN Approved</li>
                <li>GRN Rejected</li>
              </ul>
            </div>
          </div>
        </Panel>
      )}

      {view === 'preferences' && (
        <div className="dashboard-grid">
          <Panel className="span-6" title="Email Senders" action="Configured">
            <div className="senders-list">
              {[
                { address: 'noreply@farmtrack.co.ke', label: 'No Reply', color: '#667085' },
                { address: 'support@farmtrack.co.ke', label: 'Support', color: '#175cd3' },
                { address: 'hr@farmtrack.co.ke', label: 'HR', color: '#101828' },
                { address: 'finance@farmtrack.co.ke', label: 'Finance', color: '#175cd3' },
                { address: 'procurement@farmtrack.co.ke', label: 'Procurement', color: '#f79009' },
                { address: 'assets@farmtrack.co.ke', label: 'Assets', color: '#6d4aff' }
              ].map(s => (
                <div key={s.address} className="sender-item">
                  <div className="sender-avatar" style={{ background: s.color }}>{s.label[0]}</div>
                  <div>
                    <strong>{s.label}</strong>
                    <span>{s.address}</span>
                  </div>
                  <span className="status active">Active</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel className="span-6" title="Security & Tracking" action="Active">
            <div className="settings-kv-grid">
              <article><span>Open Tracking</span><strong>Enabled</strong></article>
              <article><span>Click Tracking</span><strong>Enabled</strong></article>
              <article><span>Link Validation</span><strong>Active</strong></article>
              <article><span>Redirect Hosts</span><strong>staff.farmtrack.co.ke</strong></article>
              <article><span>Secure Tokens</span><strong>32-byte random</strong></article>
              <article><span>Platform URL</span><strong>https://staff.farmtrack.co.ke</strong></article>
            </div>
          </Panel>
        </div>
      )}

      {view === 'activity' && (
        <Panel className="span-12" title="User Activity & Engagement">
          <p style={{ fontSize: 13, color: '#475467', marginBottom: 16 }}>Track email engagement including opens, clicks, and delivery status for every email sent through the system.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Recipient</th><th>Subject</th><th>Module</th><th>Opened</th><th>Clicked</th><th>Clicks</th><th>First Open</th></tr></thead>
              <tbody>
                {logs.filter(l => l.opened_at || l.click_count > 0).slice(0, 20).map(log => (
                  <tr key={log.id}>
                    <td>{log.to || log.recipient || '—'}</td>
                    <td>{log.subject || '—'}</td>
                    <td>{log.relatedModule || log.template || log.module_source || 'system'}</td>
                    <td><span className="status active">{log.opened_at ? 'Yes' : 'No'}</span></td>
                    <td><span className="status active">{log.click_count > 0 ? 'Yes' : 'No'}</span></td>
                    <td><strong>{log.click_count || 0}</strong></td>
                    <td style={{ fontSize: 12, color: '#667085' }}>{log.opened_at ? new Date(log.opened_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {logs.filter(l => l.opened_at).length === 0 && <tr><td colSpan={7}><div className="empty-state">No engagement data yet. Send emails with tracking enabled.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </section>
  );
}

function Loading({ title }) {
  const lower = String(title || '').toLowerCase();
  const isHr = lower.includes('hr');
  const isLeaves = lower.includes('leave');
  const isAnalytics = lower.includes('analytics');
  const kpis = isHr || isLeaves ? 4 : 6;
  const rows = isHr ? 7 : isLeaves ? 5 : 6;
  return (
    <section className="page-stack">
      <section className={`skeleton-hero ${isAnalytics ? 'analytics' : ''}`}>
        <div>
          <div className="skeleton-line skeleton-shimmer eyebrow" />
          <div className="skeleton-line skeleton-shimmer title" />
          <div className="skeleton-line skeleton-shimmer copy" />
        </div>
        <div className="skeleton-hero-stat skeleton-shimmer" />
      </section>
      <div className="skeleton-kpi-row">
        {Array.from({ length: kpis }).map((_, i) => (
          <div className="skeleton-kpi skeleton-shimmer" key={i}>
            <span />
            <strong />
            <em />
          </div>
        ))}
      </div>
      <div className="skeleton-layout-grid">
        <div className={`skeleton-panel skeleton-shimmer ${isHr || isLeaves ? 'span-4' : 'span-7'}`}>
          <div className="skeleton-line skeleton-head" />
          {(isHr || isLeaves ? [0, 1, 2, 3, 4] : [0, 1, 2, 3]).map(i => <div key={i} className="skeleton-form-row" />)}
        </div>
        <div className={`skeleton-panel skeleton-shimmer ${isHr || isLeaves ? 'span-8' : 'span-5'}`}>
          <div className="skeleton-line skeleton-head" />
          <div className="skeleton-chart-block" />
        </div>
        <div className="skeleton-panel skeleton-shimmer span-12">
          <div className="skeleton-line skeleton-head" />
          <div className="skeleton-table">
            {Array.from({ length: rows }).map((_, i) => <div key={i} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function ErrorState({ title, error, statusCode }) {
  const is404 = statusCode === 404;
  const is500 = statusCode === 500;
  return (
    <section className="page-stack" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <PageTitle title={title} />
      <div className="error-page" style={{ textAlign: 'center', padding: 40, maxWidth: 500 }}>
        <div style={{ fontSize: is404 ? 120 : is500 ? 140 : 80, fontWeight: 900, color: is404 ? '#101828' : is500 ? '#b42318' : '#f79009', lineHeight: 1, marginBottom: 24 }}>
          {statusCode || 'Error'}
        </div>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#344054', marginBottom: 12 }}>
          {is404 ? 'Page Not Found' : is500 ? 'Server Error' : 'Something Went Wrong'}
        </h2>
        <p style={{ color: '#667085', marginBottom: 24 }}>
          {is404 ? 'The page you are looking for does not exist or has been moved.' : is500 ? 'An unexpected error occurred. Please try again later.' : error}
        </p>
        <button className="primary-action" onClick={() => window.location.hash = '/dashboard'}>
          Go to Dashboard
        </button>
      </div>
    </section>
  );
}

function label(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

function formatCell(value, key) {
  if (['total', 'balance', 'amount', 'paid', 'subtotal', 'tax', 'value', 'revenue', 'profit', 'pipeline', 'spend', 'outstandingBalance', 'invoiceAmount', 'paidAmount', 'creditLimit', 'expectedCost', 'inventoryValue', 'unitCost', 'sellingPrice', 'stockValue', 'rent', 'utilities', 'labor', 'damageCosts', 'expiryLosses', 'totalCost', 'profitPotential', 'storageCost', 'openingBalance', 'deposit', 'withdrawal', 'debit', 'credit', 'totalDebit', 'totalCredit', 'basicSalary', 'allowances', 'deductions', 'netPay', 'liability', 'purchaseCost', 'accumulatedDepreciation', 'currentValue', 'budget', 'actual', 'variance', 'forecast', 'cost', 'profitability', 'current', 'forecast30'].includes(key)) return currency(value);
  if (['status', 'liveStatus', 'approvalStatus', 'paymentStatus'].includes(key)) return <span className={`status ${String(value).toLowerCase().replaceAll(' ', '-')}`}>{value}</span>;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value || '-';
}

createRoot(document.getElementById('root')).render(<App />);
