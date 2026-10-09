#!/usr/bin/env node
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const p=path.join(__dirname,'..','api','rpc.js'),mark='/* dashboard-accuracy-v1 */';
let s=fs.readFileSync(p,'utf8');
if(!s||s.trim()==='PLACEHOLDER'||s.length<50000) throw new Error('rpc.js not restored');
// The legacy chart patch can emit an undefined mRev/mExp reference in Finance. Prefer real cashPosition when available.
s=s.replace(/cash:\\s*mRev\\s*-\\s*mExp/g, 'cash: (typeof cashPosition !== "undefined" ? cashPosition : (typeof rev !== "undefined" ? rev : 0) - (typeof exp !== "undefined" ? exp : 0))');
s=s.replace(/const\\s*\\(typeof rev[^)]+\\)\\s*=/g, 'const mRev =');
s=s.replace(/const\\s*\\(typeof exp[^)]+\\)\\s*=/g, 'const mExp =');
if(!s.includes(mark)){
 const a=s.indexOf('  getDashboardData(user) {'),b=s.indexOf('\n  async getAnalyticsData(user)',a);
 if(a<0||b<0) throw new Error('getDashboardData not found');
 let f=s.slice(a,b).replace('  getDashboardData(user) {','  getDashboardData(user, filters = {}) {\n    /* dashboard-accuracy-v1 */');
 f=f.replace("const byYear = y => d.sales.filter(s => new Date(s.createdAt).getFullYear() === y);","const rowDate = row => { const raw = row && (row.date || row.createdAt || row.created_at || row.invoiceDate || row.invoice_date); const dt = raw ? new Date(raw) : null; return dt && Number.isFinite(dt.getTime()) ? dt : null; };\n    const byYear = y => d.sales.filter(s => { const dt = rowDate(s); return dt && dt.getFullYear() === y; });");
 f=f.replace("const expY = y => d.expenses.filter(e => new Date(e.createdAt).getFullYear() === y).reduce((s, x) => s + num(x.amount), 0);","const expY = y => d.expenses.filter(e => { const dt = rowDate(e); return dt && dt.getFullYear() === y; }).reduce((s, x) => s + num(x.amount), 0);");
 f=f.replace("const monthTotals = rows => rows.reduce((a, s) => { a[new Date(s.createdAt).getMonth()] += num(s.total); return a; }, Array(12).fill(0));","const monthTotals = rows => rows.reduce((a, s) => { const dt = rowDate(s); if (dt) a[dt.getMonth()] += num(s.total); return a; }, Array(12).fill(0));");
 f=f.replace("const revenue = tY.filter(s => new Date(s.createdAt).getMonth() === index).reduce((sum, row) => sum + num(row.total), 0);\n      const expenses = d.expenses.filter(e => new Date(e.createdAt).getFullYear() === cy && new Date(e.createdAt).getMonth() === index).reduce((sum, row) => sum + num(row.amount), 0);","const revenue = tY.filter(s => { const dt = rowDate(s); return dt && dt.getMonth() === index; }).reduce((sum, row) => sum + num(row.total), 0);\n      const expenses = d.expenses.filter(e => { const dt = rowDate(e); return dt && dt.getFullYear() === cy && dt.getMonth() === index; }).reduce((sum, row) => sum + num(row.amount), 0);");
 f=f.replace("const revenue = d.sales.filter(s => new Date(s.createdAt).getFullYear() === year).reduce((sum, row) => sum + num(row.total), 0);\n      const expenses = d.expenses.filter(e => new Date(e.createdAt).getFullYear() === year).reduce((sum, row) => sum + num(row.amount), 0);","const revenue = d.sales.filter(s => { const dt = rowDate(s); return dt && dt.getFullYear() === year; }).reduce((sum, row) => sum + num(row.total), 0);\n      const expenses = d.expenses.filter(e => { const dt = rowDate(e); return dt && dt.getFullYear() === year; }).reduce((sum, row) => sum + num(row.amount), 0);");
 f=f.replace("const revenue = d.sales.filter(s => { const dt = new Date(s.createdAt); return dt >= qStart && dt <= qEndDate; }).reduce((sum, row) => sum + num(row.total), 0);\n      const expenses = d.expenses.filter(e => { const dt = new Date(e.createdAt); return dt >= qStart && dt <= qEndDate; }).reduce((sum, row) => sum + num(row.amount), 0);","const revenue = d.sales.filter(s => { const dt = rowDate(s); return dt && dt >= qStart && dt <= qEndDate; }).reduce((sum, row) => sum + num(row.total), 0);\n      const expenses = d.expenses.filter(e => { const dt = rowDate(e); return dt && dt >= qStart && dt <= qEndDate; }).reduce((sum, row) => sum + num(row.amount), 0);");
 f=f.replace("const pct = (c, p) => p > 0 ? Math.round((c - p) / p * 100) : 0;","const pct = (c, p) => p > 0 ? Math.round((c - p) / p * 100) : null;");
 f=f.replace("cashChange: pct(cashCollected, Math.max(1, cashCollected * 0.92)),\n        inventoryChange: pct(inventoryValue, Math.max(1, inventoryValue * 0.95)),\n        pipelineChange: pct(pipelineValue, Math.max(1, pipelineValue * 0.9)),\n        productionChange: pendingProduction.length ? -Math.min(20, pendingProduction.length * 2) : 4,\n","");
 f=f.replace("cashSeries: (weeklySeries || []).map(r => Number(r.revenue || 0) * 0.7),\n        inventorySeries: (weeklySeries || []).map((r, i) => Math.max(0, inventoryValue * (0.85 + i * 0.008))),\n        pipelineSeries: (weeklySeries || []).map(r => Number(r.revenue || 0) * 0.4 + pipelineValue * 0.05),\n        productionSeries: (weeklySeries || []).map((_, i) => Math.max(0, pendingProduction.length + (i % 4) - 1))\n","");
 f=f.replace("revenueNextMonth: Math.round(tRev / Math.max(1, new Date().getMonth() + 1) * 1.08),","revenueNextMonth: Math.round(tRev / Math.max(1, new Date().getMonth() + 1)),");
 f=f.replace("cashExpected: Math.round(cashOutstanding),","cashExpected: Math.round(cashOutstanding),\n          forecastBasis: 'Run-rate estimate using current-year average monthly sales; not a guaranteed forecast.',");
 if(!f.includes(mark)) throw new Error('Dashboard marker missing after patch');
 s=s.slice(0,a)+f+s.slice(b);fs.writeFileSync(p,s);
}
const ck=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
if(ck.status!==0) throw new Error(ck.stderr||ck.stdout);
console.log('[dashboard-accuracy] date-safe dashboard data; synthetic KPI deltas and series removed');
