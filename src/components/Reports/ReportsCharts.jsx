import React from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart
} from 'recharts';

const currency = v => `KSh ${Number(v || 0).toLocaleString()}`;
const COLORS = ['#0066ff', '#0d9488', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#ef4444', '#22c55e'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 8, padding: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 13 }}>
      <strong style={{ color: '#101828', fontSize: 13 }}>{label}</strong>
      {payload.map((entry, i) => (
        <div key={i} style={{ color: entry.color, marginTop: 4, fontSize: 12 }}>
          {entry.name}: {entry.dataKey?.includes('Year') || entry.dataKey?.includes('year') || entry.name?.toLowerCase().includes('value') ? currency(entry.value) : Number(entry.value).toLocaleString()}
        </div>
      ))}
    </div>
  );
};

export function YoYComparisonCards({ data }) {
  if (!data) return null;
  const items = [
    { label: 'Revenue', key: 'revenue', icon: 'REV' },
    { label: 'Expenses', key: 'expenses', icon: 'EXP' },
    { label: 'Profit', key: 'profit', icon: 'PFT' },
    { label: 'Customers', key: 'customers', icon: 'CUS' },
    { label: 'Orders', key: 'orders', icon: 'ORD' },
    { label: 'Inventory', key: 'inventory', icon: 'INV' }
  ];
  return (
    <div className="report-yoy-cards">
      {items.map(item => {
        const d = data[item.key];
        if (!d) return null;
        const isUp = d.change > 0;
        return (
          <div key={item.key} className={`report-yoy-card ${isUp ? 'up' : 'down'}`}>
            <div className="report-yoy-icon">{item.icon}</div>
            <div className="report-yoy-info">
              <span className="report-yoy-label">{item.label}</span>
              <strong className="report-yoy-current">{currency(d.current)}</strong>
              <div className="report-yoy-meta">
                <span className="report-yoy-prev">vs {currency(d.previous)}</span>
                <span className={`report-yoy-change ${isUp ? 'up' : 'down'}`}>{isUp ? '+' : ''}{d.change}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MonthlyTrendChart({ data }) {
  if (!data?.length) return <div className="empty-chart">No trend data</div>;
  return (
    <div className="report-chart-wrapper">
      <h4 className="report-chart-title">Monthly Performance — Current vs Previous Year</h4>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} tickFormatter={v => `KSh ${(v/1000).toFixed(0)}K`} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="previousYear" name="Previous Year" fill="#e4e7ec" radius={[4, 4, 0, 0]} barSize={20} />
          <Bar dataKey="currentYear" name="Current Year" fill="#0066ff" radius={[4, 4, 0, 0]} barSize={20} />
          <Line type="monotone" dataKey="target" name="Target" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RevenueExpenseChart({ data }) {
  if (!data?.length) return <div className="empty-chart">No revenue data</div>;
  return (
    <div className="report-chart-wrapper">
      <h4 className="report-chart-title">Revenue vs Expenses vs Profit</h4>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} tickFormatter={v => `KSh ${(v/1000).toFixed(0)}K`} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="revenue" name="Revenue" stackId="1" stroke="#0066ff" fill="rgba(0,102,255,0.1)" strokeWidth={2} />
          <Area type="monotone" dataKey="expenses" name="Expenses" stackId="2" stroke="#ef4444" fill="rgba(239,68,68,0.1)" strokeWidth={2} />
          <Area type="monotone" dataKey="profit" name="Profit" stackId="3" stroke="#0d9488" fill="rgba(13,148,136,0.1)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DepartmentBreakdownChart({ data }) {
  if (!data?.length) return <div className="empty-chart">No department data</div>;
  return (
    <div className="report-chart-wrapper">
      <h4 className="report-chart-title">Department Performance Breakdown</h4>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis type="number" tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} tickFormatter={v => `KSh ${(v/1000).toFixed(0)}K`} />
          <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} width={100} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="value" name="Value" radius={[0, 4, 4, 0]} barSize={24}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color || COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryDistributionChart({ data }) {
  if (!data?.length) return <div className="empty-chart">No category data</div>;
  return (
    <div className="report-chart-wrapper">
      <h4 className="report-chart-title">Value Distribution by Category</h4>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={60} paddingAngle={3} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`} labelStyle={{ fontSize: 11, fill: '#475467' }}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color || COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="report-pie-legend">
        {data.map((entry, i) => (
          <div key={i} className="report-pie-legend-item">
            <span className="report-pie-dot" style={{ background: entry.color || COLORS[i % COLORS.length] }} />
            <span>{entry.name}</span>
            <strong>{currency(entry.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function QuarterlyComparisonChart({ data }) {
  if (!data?.length) return <div className="empty-chart">No quarterly data</div>;
  return (
    <div className="report-chart-wrapper">
      <h4 className="report-chart-title">Quarterly Comparison — Current vs Previous Year</h4>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="quarter" tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} tickFormatter={v => `KSh ${(v/1000).toFixed(0)}K`} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="previous" name="Previous Year" fill="#e4e7ec" radius={[4, 4, 0, 0]} barSize={32} />
          <Bar dataKey="current" name="Current Year" fill="#0066ff" radius={[4, 4, 0, 0]} barSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyTrendChart({ data }) {
  if (!data?.length) return <div className="empty-chart">No weekly data</div>;
  return (
    <div className="report-chart-wrapper">
      <h4 className="report-chart-title">Weekly Trend — Actual vs Target</h4>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} tickFormatter={v => `KSh ${(v/1000).toFixed(0)}K`} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="value" name="Actual" fill="#0d9488" radius={[4, 4, 0, 0]} barSize={16} />
          <Line type="monotone" dataKey="target" name="Target" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExecutiveDashboardCharts({ data }) {
  if (!data) return <div className="empty-chart">No chart data available</div>;
  return (
    <div className="report-charts-grid">
      <div className="report-chart-panel span-12">
        <YoYComparisonCards data={data.yoyComparison} />
      </div>
      <div className="report-chart-panel span-8">
        <MonthlyTrendChart data={data.monthlyTrend} />
      </div>
      <div className="report-chart-panel span-4">
        <CategoryDistributionChart data={data.categoryDistribution} />
      </div>
      <div className="report-chart-panel span-6">
        <RevenueExpenseChart data={data.revenueExpenseTrend} />
      </div>
      <div className="report-chart-panel span-6">
        <DepartmentBreakdownChart data={data.departmentBreakdown} />
      </div>
      <div className="report-chart-panel span-6">
        <QuarterlyComparisonChart data={data.quarterlyComparison} />
      </div>
      <div className="report-chart-panel span-6">
        <WeeklyTrendChart data={data.weeklyTrend} />
      </div>
    </div>
  );
}
