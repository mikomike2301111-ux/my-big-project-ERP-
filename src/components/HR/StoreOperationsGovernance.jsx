import React, { useState, useMemo } from 'react';
import {
  X, Users, Shield, Package, ClipboardCheck, Truck, QrCode, MapPin, Clock,
  CheckCircle2, AlertTriangle, FileText, Download, Printer, Calendar,
  UserCog, BarChart3, DollarSign, RefreshCw, Search, Eye, Activity,
  Settings, Lock, KeyRound, UserCheck, ScanLine, Boxes, Warehouse,
  TrendingUp, Target, Award, AlertCircle, ChevronDown, Filter
} from 'lucide-react';

// ============================================================
// FARMTRACK ERP - STORE OPERATIONS GOVERNANCE CENTER
// Implements: INV-SOP-001 (Inventory) + HR-SOP-002 (Staff Governance)
// For: 100 SKUs · 7 Team Members · Dual-Control Accountability
// ============================================================

const currency = v => `Ksh${Number(v || 0).toLocaleString()}`;

// ─── 7-User Role Definitions (RBAC) ───
const STORE_ROLES = [
  {
    id: 1, name: 'Store Manager / System Admin', short: 'Store Mgr',
    department: 'Store Operations', shift: 'A (07:00-16:00)',
    permissions: {
      masterData: true, varianceSignoff: true, grnApproval: true,
      stockTransfer: true, adjustments: 'all', writeoffs: true,
      userManagement: true, reports: true, dispatchRelease: true,
      cycleCount: true, reorderApproval: true, audit: true
    },
    kpi: { ira: 100, picking: 100, receiving: 100, damage: 0 }
  },
  {
    id: 2, name: 'Senior Inventory Controller', short: 'Inv Controller',
    department: 'Store Operations', shift: 'A (07:00-16:00)',
    permissions: {
      masterData: false, varianceSignoff: true, grnApproval: true,
      stockTransfer: true, adjustments: 'tier1', writeoffs: false,
      userManagement: false, reports: true, dispatchRelease: false,
      cycleCount: true, reorderApproval: false, audit: true
    },
    kpi: { ira: 98, picking: 99, receiving: 99, damage: 0.05 }
  },
  {
    id: 3, name: 'Warehouse Receiving Officer A', short: 'Receiving A',
    department: 'Store Operations', shift: 'A (07:00-16:00)',
    permissions: {
      masterData: false, varianceSignoff: false, grnApproval: false,
      stockTransfer: false, adjustments: 'none', writeoffs: false,
      userManagement: false, reports: false, dispatchRelease: false,
      cycleCount: false, reorderApproval: false, audit: false,
      grnCreation: true, qrTagging: true, putaway: true
    },
    kpi: { ira: 95, picking: 0, receiving: 97, damage: 0.1 }
  },
  {
    id: 4, name: 'Warehouse Receiving Officer B', short: 'Receiving B',
    department: 'Store Operations', shift: 'B (09:00-18:00)',
    permissions: {
      masterData: false, varianceSignoff: false, grnApproval: false,
      stockTransfer: false, adjustments: 'none', writeoffs: false,
      userManagement: false, reports: false, dispatchRelease: false,
      cycleCount: false, reorderApproval: false, audit: false,
      grnCreation: true, qrTagging: true, putaway: true
    },
    kpi: { ira: 95, picking: 0, receiving: 97, damage: 0.1 }
  },
  {
    id: 5, name: 'Order Fulfillment & Dispatch Officer A', short: 'Dispatch A',
    department: 'Store Operations', shift: 'A (07:00-16:00)',
    permissions: {
      masterData: false, varianceSignoff: false, grnApproval: false,
      stockTransfer: false, adjustments: 'none', writeoffs: false,
      userManagement: false, reports: false, dispatchRelease: true,
      cycleCount: false, reorderApproval: false, audit: false,
      picking: true, packing: true, gdnStaging: true
    },
    kpi: { ira: 96, picking: 99.5, receiving: 0, damage: 0.08 }
  },
  {
    id: 6, name: 'Order Fulfillment & Dispatch Officer B', short: 'Dispatch B',
    department: 'Store Operations', shift: 'B (09:00-18:00)',
    permissions: {
      masterData: false, varianceSignoff: false, grnApproval: false,
      stockTransfer: false, adjustments: 'none', writeoffs: false,
      userManagement: false, reports: false, dispatchRelease: true,
      cycleCount: false, reorderApproval: false, audit: false,
      picking: true, packing: true, gdnStaging: true
    },
    kpi: { ira: 96, picking: 99.5, receiving: 0, damage: 0.08 }
  },
  {
    id: 7, name: 'Quality Control & Audit Specialist', short: 'QC Specialist',
    department: 'Store Operations', shift: 'A (07:00-16:00)',
    permissions: {
      masterData: false, varianceSignoff: false, grnApproval: false,
      stockTransfer: false, adjustments: 'none', writeoffs: false,
      userManagement: false, reports: true, dispatchRelease: false,
      cycleCount: true, reorderApproval: false, audit: true,
      quarantine: true, damageInspection: true, qcHold: true
    },
    kpi: { ira: 99, picking: 0, receiving: 0, damage: 0.02 }
  }
];

// ─── RACI Matrix Data ───
const RACI_TASKS = [
  { task: 'Purchase Order Creation', mgr: 'A', ctrl: 'R', recv: 'I', disp: 'I', qc: 'C' },
  { task: 'Goods Receiving & GRN Entry', mgr: 'I', ctrl: 'A', recv: 'R', disp: 'I', qc: 'C' },
  { task: 'QC Inspection & Quarantine Hold', mgr: 'I', ctrl: 'A', recv: 'I', disp: 'I', qc: 'R' },
  { task: 'Bin Location Putaway', mgr: 'I', ctrl: 'A', recv: 'R', disp: 'I', qc: 'I' },
  { task: 'Daily 5-SKU Blind Cycle Count', mgr: 'A', ctrl: 'R', recv: 'C', disp: 'C', qc: 'R' },
  { task: 'Sales Order Picking & Staging', mgr: 'I', ctrl: 'A', recv: 'I', disp: 'R', qc: 'I' },
  { task: 'Goods Dispatch Note (GDN) Release', mgr: 'A', ctrl: 'C', recv: 'I', disp: 'R', qc: 'I' },
  { task: 'Inventory Adjustment Sign-off', mgr: 'A', ctrl: 'R', recv: 'I', disp: 'I', qc: 'I' },
  { task: 'Damaged Stock Write-off Request', mgr: 'A', ctrl: 'C', recv: 'I', disp: 'I', qc: 'R' },
];

// ─── 17 Out-of-Stock SKUs for Replenishment ───
const OOS_SKUS = [
  { sku: 'FT-BP-001', name: 'Broiler Feed 50kg', onHand: 0, reorder: 50, safety: 20, cost: 3200, supplier: 'Mombasa Feeds Ltd', leadTime: 5, dailyUsage: 8 },
  { sku: 'FT-BP-002', name: 'Layer Mash 50kg', onHand: 0, reorder: 40, safety: 15, cost: 3100, supplier: 'Mombasa Feeds Ltd', leadTime: 5, dailyUsage: 6 },
  { sku: 'FT-BP-003', name: 'Chick Starter 25kg', onHand: 0, reorder: 30, safety: 12, cost: 2800, supplier: 'Unga Farm Care', leadTime: 7, dailyUsage: 4 },
  { sku: 'FT-BP-004', name: 'Growers Pellets 50kg', onHand: 0, reorder: 35, safety: 14, cost: 3000, supplier: 'Mombasa Feeds Ltd', leadTime: 5, dailyUsage: 5 },
  { sku: 'FT-VM-001', name: 'Newcastle Vaccine 1000d', onHand: 0, reorder: 20, safety: 8, cost: 4500, supplier: 'Coopers Kenya', leadTime: 3, dailyUsage: 2 },
  { sku: 'FT-VM-002', name: 'Gumboro Vaccine 1000d', onHand: 0, reorder: 20, safety: 8, cost: 4200, supplier: 'Coopers Kenya', leadTime: 3, dailyUsage: 2 },
  { sku: 'FT-VM-003', name: 'Fowl Pox Vaccine', onHand: 0, reorder: 15, safety: 6, cost: 3800, supplier: 'Coopers Kenya', leadTime: 3, dailyUsage: 1 },
  { sku: 'FT-MD-001', name: 'Amprolium 100g', onHand: 0, reorder: 25, safety: 10, cost: 1200, supplier: 'Twiga Chemicals', leadTime: 4, dailyUsage: 3 },
  { sku: 'FT-MD-002', name: 'Tylosin Tartrate 100g', onHand: 0, reorder: 20, safety: 8, cost: 2400, supplier: 'Twiga Chemicals', leadTime: 4, dailyUsage: 2 },
  { sku: 'FT-MD-003', name: 'Doxycycline 100g', onHand: 0, reorder: 20, safety: 8, cost: 2100, supplier: 'Twiga Chemicals', leadTime: 4, dailyUsage: 2 },
  { sku: 'FT-MD-004', name: 'Vitamin AD3E 1L', onHand: 0, reorder: 15, safety: 6, cost: 1800, supplier: 'Norbrook Kenya', leadTime: 4, dailyUsage: 2 },
  { sku: 'FT-MD-005', name: 'Electrolytes 250g', onHand: 0, reorder: 30, safety: 12, cost: 900, supplier: 'Norbrook Kenya', leadTime: 4, dailyUsage: 4 },
  { sku: 'FT-EQ-001', name: 'Drinkers (Bell Type)', onHand: 0, reorder: 50, safety: 20, cost: 350, supplier: 'Biggy Poultry', leadTime: 6, dailyUsage: 5 },
  { sku: 'FT-EQ-002', name: 'Feeders (Tube Type)', onHand: 0, reorder: 50, safety: 20, cost: 420, supplier: 'Biggy Poultry', leadTime: 6, dailyUsage: 5 },
  { sku: 'FT-EQ-003', name: 'Heat Lamps 250W', onHand: 0, reorder: 30, safety: 12, cost: 850, supplier: 'Biggy Poultry', leadTime: 6, dailyUsage: 3 },
  { sku: 'FT-EQ-004', name: 'Brooder Guards 5m', onHand: 0, reorder: 20, safety: 8, cost: 1200, supplier: 'Biggy Poultry', leadTime: 6, dailyUsage: 2 },
  { sku: 'FT-BP-005', name: 'Breeder Feed 50kg', onHand: 0, reorder: 25, safety: 10, cost: 3500, supplier: 'Unga Farm Care', leadTime: 7, dailyUsage: 3 },
];

// ─── Cycle Count Sheet Generator ───
const generateCycleCountSheet = (stockItems) => {
  const today = new Date().toISOString().slice(0, 10);
  const dayNum = Math.floor(Date.now() / 86400000);
  const startIdx = (dayNum * 5) % Math.max(1, (stockItems || []).length);
  const selected = [];
  for (let i = 0; i < 5; i++) {
    const idx = (startIdx + i) % Math.max(1, (stockItems || []).length);
    if (stockItems && stockItems[idx]) selected.push(stockItems[idx]);
  }
  return {
    sheetId: `CC-${today}`,
    date: today,
    warehouse: 'Main Store Nairobi',
    counter: '_________________',
    verifier: '_________________',
    items: selected.map((s, i) => ({
      lineNo: i + 1,
      sku: s.sku || `SKU-${String(i + 1).padStart(3, '0')}`,
      productName: s.productName || `Product ${i + 1}`,
      binLocation: s.shelfLocation || s.binNumber || `A${i + 1}-01`,
      systemQty: '_______', // BLIND - not shown to counter
      physicalQty: '',
      variance: '',
      notes: ''
    }))
  };
};

// ─── Shift Handover Form Template ───
const SHIFT_HANDOVER_TEMPLATE = {
  date: new Date().toISOString().slice(0, 10),
  outgoingShift: 'A (07:00-16:00)',
  incomingShift: 'B (09:00-18:00)',
  outgoingLead: '_________________',
  incomingLead: '_________________',
  checklist: [
    { id: 1, item: 'Open Purchase Orders in receiving bay', status: 'pending', count: '___', notes: '' },
    { id: 2, item: 'Outgoing orders staged in dispatch lane', status: 'pending', count: '___', notes: '' },
    { id: 3, item: 'Quarantined stock entries logged during shift', status: 'pending', count: '___', notes: '' },
    { id: 4, item: 'Damaged stock entries logged during shift', status: 'pending', count: '___', notes: '' },
    { id: 5, item: 'Handheld scanner unit inventory and battery health', status: 'pending', count: '___', notes: '' },
    { id: 6, item: 'Pending GRN entries awaiting posting', status: 'pending', count: '___', notes: '' },
    { id: 7, item: 'Cycle count variances awaiting sign-off', status: 'pending', count: '___', notes: '' },
    { id: 8, item: 'Reorder alerts triggered during shift', status: 'pending', count: '___', notes: '' },
  ],
  outgoingSignature: '_________________',
  incomingSignature: '_________________',
  handoverTime: '_____ : _____'
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export function StoreOperationsGovernance({ user, stockItems, onClose }) {
  const [activeTab, setActiveTab] = useState('rbac');
  const [selectedRole, setSelectedRole] = useState(null);
  const [cycleSheet, setCycleSheet] = useState(() => generateCycleCountSheet(stockItems));
  const [handover, setHandover] = useState(SHIFT_HANDOVER_TEMPLATE);
  const [poFilter, setPoFilter] = useState('all');

  const tabs = [
    { id: 'rbac', label: 'User Security & RBAC', icon: Shield },
    { id: 'replenish', label: 'OOS Replenishment POs', icon: Truck },
    { id: 'cyclecount', label: 'Cycle Count Sheet', icon: ClipboardCheck },
    { id: 'handover', label: 'Shift Handover Form', icon: Clock },
    { id: 'raci', label: 'RACI Matrix', icon: Users },
    { id: 'kpi', label: 'HR KPI Dashboard', icon: Award },
  ];

  // Calculate PO totals
  const poTotals = useMemo(() => {
    const filtered = poFilter === 'all' ? OOS_SKUS : OOS_SKUS.filter(s => s.supplier === poFilter);
    const total = filtered.reduce((sum, s) => sum + (s.reorder + s.safety) * s.cost, 0);
    const units = filtered.reduce((sum, s) => sum + s.reorder + s.safety, 0);
    return { total, units, count: filtered.length };
  }, [poFilter]);

  const suppliers = [...new Set(OOS_SKUS.map(s => s.supplier))];

  return (
    <div className="dashboard-grid">
      {/* Header */}
      <div className="span-12" style={{ background: 'linear-gradient(135deg, #050505, #1e293b)', borderRadius: 16, padding: 24, color: '#fff', marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24 }}>Store Operations Governance Center</h2>
            <p style={{ margin: '8px 0 0', opacity: 0.8 }}>
              INV-SOP-001 · HR-SOP-002 · 100 SKUs · 7 Team Members · Dual-Control Accountability
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '8px 16px' }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>7</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>Users</div>
            </div>
            <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '8px 16px' }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>100</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>SKUs</div>
            </div>
            <div style={{ textAlign: 'center', background: 'rgba(239,68,68,0.2)', borderRadius: 12, padding: '8px 16px' }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>17</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>OOS</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="span-12" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {tabs.map(tab => (
          <button key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
              borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: activeTab === tab.id ? '#050505' : '#f2f4f7',
              color: activeTab === tab.id ? '#fff' : '#667085',
              transition: 'all 0.2s'
            }}>
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── TAB: RBAC / User Security ─── */}
      {activeTab === 'rbac' && (
        <>
          <div className="span-12">
            <div className="panel-header">
              <h3><Shield size={18} /> Option A: User Security Permission Configurations</h3>
              <span style={{ fontSize: 12, color: '#667085' }}>7 users · 4 security groups · Exact permission checkboxes</span>
            </div>
            <div style={{ fontSize: 13, color: '#667085', marginBottom: 12, padding: 12, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
              <strong>Directive HR-SOP-002 §1:</strong> Shared user accounts are strictly forbidden. System auto-logs out after 5 minutes of inactivity.
              Every transaction MUST record: Operator User ID, Timestamp, Terminal ID, Source Bin, Destination Bin.
            </div>
          </div>

          {/* Role Cards */}
          <div className="span-12" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {STORE_ROLES.map(role => (
              <div key={role.id}
                onClick={() => setSelectedRole(selectedRole === role.id ? null : role.id)}
                style={{
                  border: `2px solid ${selectedRole === role.id ? '#2563eb' : '#e5e7eb'}`,
                  borderRadius: 12, padding: 16, cursor: 'pointer',
                  background: selectedRole === role.id ? '#f0f9ff' : '#fff',
                  transition: 'all 0.2s'
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#050505', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                        {role.id}
                      </div>
                      <div>
                        <strong style={{ fontSize: 13 }}>{role.name}</strong>
                        <div style={{ fontSize: 11, color: '#667085' }}>{role.department} · {role.shift}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {selectedRole === role.id && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#2563eb' }}>Permission Checkboxes:</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
                      {Object.entries(role.permissions).map(([key, val]) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="checkbox" checked={val === true || val === 'all' || val === 'tier1'} readOnly style={{ margin: 0 }} />
                          <span style={{ color: val === true || val === 'all' ? '#22c55e' : val === 'tier1' ? '#f79009' : '#d0d5dd' }}>
                            {key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}
                            {val === 'all' && ' (All)'}
                            {val === 'tier1' && ' (Tier 1)'}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, marginBottom: 4, color: '#2563eb' }}>KPI Targets:</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
                      <span>IRA: <strong>{role.kpi.ira}%</strong></span>
                      <span>Picking: <strong>{role.kpi.picking}%</strong></span>
                      <span>Receiving: <strong>{role.kpi.receiving}%</strong></span>
                      <span>Damage: <strong>{role.kpi.damage}%</strong></span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Security Configuration Steps */}
          <div className="span-12">
            <div className="panel-header"><h3>Implementation Steps</h3></div>
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                { step: 1, task: 'Go to FarmTrack ERP > User Management > Security Roles', done: false },
                { step: 2, task: 'Create 4 Security Groups: Store Mgr, Inv Controller, Receiving, Dispatch, QC Specialist', done: false },
                { step: 3, task: 'Link each of the 7 Employee Profiles to their designated Security Group', done: false },
                { step: 4, task: 'Revoke generic/admin permissions from non-management personnel (Users 3-7)', done: false },
                { step: 5, task: 'Enable 5-minute auto-logout and mandatory biometric/geo-pin clock-in', done: false },
                { step: 6, task: 'Enable audit trail logging: Operator ID, Timestamp, Terminal ID, Bin movements', done: false },
              ].map(s => (
                <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: '#050505', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                    {s.step}
                  </div>
                  <span style={{ fontSize: 13 }}>{s.task}</span>
                  <input type="checkbox" style={{ marginLeft: 'auto' }} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ─── TAB: OOS Replenishment ─── */}
      {activeTab === 'replenish' && (
        <>
          <div className="span-12">
            <div className="panel-header">
              <h3><Truck size={18} /> Option B: Purchase Order Parameters for 17 Out-of-Stock SKUs</h3>
              <span style={{ fontSize: 12, color: '#667085' }}>Auto-calculated reorder quantities with safety stock</span>
            </div>
            <div style={{ fontSize: 13, color: '#667085', marginBottom: 12, padding: 12, background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
              <strong>Directive INV-SOP-001 §4:</strong> Safety Stock = (Max Daily Usage × Max Lead Time) - (Avg Daily Usage × Avg Lead Time).
              Order Qty = Reorder Point + Safety Stock. Auto-generate Draft Purchase Requisition when Available ≤ Reorder Point.
            </div>
          </div>

          {/* PO Summary KPIs */}
          <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#ef4444' }}>{poTotals.count}</strong><span>SKUs to Reorder</span></div></div>
          <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#2563eb' }}>{poTotals.units.toLocaleString()}</strong><span>Total Units</span></div></div>
          <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#050505' }}>{currency(poTotals.total)}</strong><span>Estimated PO Value</span></div></div>
          <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#22c55e' }}>{suppliers.length}</strong><span>Suppliers</span></div></div>

          {/* Supplier Filter */}
          <div className="span-12" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Filter size={16} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Filter by Supplier:</span>
            <button onClick={() => setPoFilter('all')} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #d0d5dd', background: poFilter === 'all' ? '#050505' : '#fff', color: poFilter === 'all' ? '#fff' : '#667085', cursor: 'pointer', fontSize: 12 }}>All ({OOS_SKUS.length})</button>
            {suppliers.map(s => (
              <button key={s} onClick={() => setPoFilter(s)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #d0d5dd', background: poFilter === s ? '#050505' : '#fff', color: poFilter === s ? '#fff' : '#667085', cursor: 'pointer', fontSize: 12 }}>
                {s} ({OOS_SKUS.filter(x => x.supplier === s).length})
              </button>
            ))}
          </div>

          {/* PO Table */}
          <div className="span-12">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th><th>Product</th><th>Supplier</th><th>On-Hand</th>
                    <th>Reorder Pt</th><th>Safety Stock</th><th>Order Qty</th>
                    <th>Unit Cost</th><th>Line Total</th><th>Lead Time</th><th>Daily Usage</th><th>Urgency</th>
                  </tr>
                </thead>
                <tbody>
                  {(poFilter === 'all' ? OOS_SKUS : OOS_SKUS.filter(s => s.supplier === poFilter)).map(s => {
                    const orderQty = s.reorder + s.safety;
                    const lineTotal = orderQty * s.cost;
                    const urgency = s.dailyUsage * s.leadTime > s.safety ? 'Critical' : s.dailyUsage > 5 ? 'High' : 'Normal';
                    return (
                      <tr key={s.sku}>
                        <td><strong>{s.sku}</strong></td>
                        <td>{s.name}</td>
                        <td>{s.supplier}</td>
                        <td style={{ color: '#ef4444', fontWeight: 700 }}>{s.onHand}</td>
                        <td>{s.reorder}</td>
                        <td>{s.safety}</td>
                        <td style={{ fontWeight: 700, color: '#2563eb' }}>{orderQty}</td>
                        <td>{currency(s.cost)}</td>
                        <td style={{ fontWeight: 700 }}>{currency(lineTotal)}</td>
                        <td>{s.leadTime}d</td>
                        <td>{s.dailyUsage}/day</td>
                        <td>
                          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                            background: urgency === 'Critical' ? '#fef2f2' : urgency === 'High' ? '#fffbeb' : '#f0f9ff',
                            color: urgency === 'Critical' ? '#ef4444' : urgency === 'High' ? '#f79009' : '#2563eb' }}>
                            {urgency}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
                    <td colSpan={6}>TOTAL ({poTotals.count} SKUs)</td>
                    <td>{poTotals.units.toLocaleString()} units</td>
                    <td colSpan={2}>{currency(poTotals.total)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="primary-action" onClick={() => alert(`Generating ${poTotals.count} Purchase Requisitions for ${currency(poTotals.total)}...`)}>
                <Truck size={14} /> Generate Purchase Requisitions
              </button>
              <button className="panel-action-button" onClick={() => alert('Exporting PO summary as CSV...')}>
                <Download size={14} /> Export CSV
              </button>
              <button className="panel-action-button" onClick={() => alert('Printing PO summary...')}>
                <Printer size={14} /> Print
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── TAB: Cycle Count Sheet ─── */}
      {activeTab === 'cyclecount' && (
        <>
          <div className="span-12">
            <div className="panel-header">
              <h3><ClipboardCheck size={18} /> Option C: Daily 5-SKU Blind Cycle Count Sheet</h3>
              <span style={{ fontSize: 12, color: '#667085' }}>Generated automatically every 08:00 AM · System quantities hidden (blind count)</span>
            </div>
            <div style={{ fontSize: 13, color: '#667085', marginBottom: 12, padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
              <strong>Directive INV-SOP-001 §5:</strong> Daily Rolling Cycle Count: 5 SKUs audited every workday at 08:00 AM.
              Class A counted every 14 days; Class B every 30 days; Class C every 60 days.
              Variance > 1% requires immediate root-cause investigation within 24 hours.
            </div>
          </div>

          {/* Cycle Count Sheet */}
          <div className="span-12">
            <div style={{ border: '2px solid #050505', borderRadius: 12, padding: 24, background: '#fff' }}>
              {/* Sheet Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #050505', paddingBottom: 12, marginBottom: 16 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20 }}>FARMTRACK ERP — BLIND CYCLE COUNT SHEET</h2>
                  <div style={{ fontSize: 12, color: '#667085' }}>INV-SOP-001 §5 · Daily Rolling Count</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div><strong>Sheet ID:</strong> {cycleSheet.sheetId}</div>
                  <div><strong>Date:</strong> {cycleSheet.date}</div>
                  <div><strong>Warehouse:</strong> {cycleSheet.warehouse}</div>
                </div>
              </div>

              {/* Counter & Verifier */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><strong>Counter (User ID):</strong><br />{cycleSheet.counter}</div>
                <div><strong>Verifier (Manager):</strong><br />{cycleSheet.verifier}</div>
                <div><strong>Count Time:</strong><br />_____ : _____ AM</div>
              </div>

              {/* Count Table - BLIND (no system qty shown) */}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#050505', color: '#fff' }}>
                    <th style={{ padding: 10, textAlign: 'left' }}>#</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>SKU</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Product Name</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Bin Location</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Physical Count</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Variance</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Notes / Root Cause</th>
                  </tr>
                </thead>
                <tbody>
                  {cycleSheet.items.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: 12 }}>{item.lineNo}</td>
                      <td style={{ padding: 12 }}><strong>{item.sku}</strong></td>
                      <td style={{ padding: 12 }}>{item.productName}</td>
                      <td style={{ padding: 12 }}>{item.binLocation}</td>
                      <td style={{ padding: 12 }}>
                        <input type="number" placeholder="____" style={{ width: 80, padding: '4px 8px', border: '1px solid #d0d5dd', borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: 12, color: '#667085' }}><em>(To be calculated after submission)</em></td>
                      <td style={{ padding: 12 }}>
                        <input type="text" placeholder="Reason if variance > 1%" style={{ width: 200, padding: '4px 8px', border: '1px solid #d0d5dd', borderRadius: 4 }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Sign-off */}
              <div style={{ marginTop: 24, borderTop: '2px solid #050505', paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>DUAL-CONTROL SIGN-OFF (Tier 2 if variance > KES 2,000 or > 5 units)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div>
                    <strong>Counter Signature:</strong>
                    <div style={{ marginTop: 8, borderBottom: '1px solid #000', height: 30 }}></div>
                  </div>
                  <div>
                    <strong>Inventory Controller Sign-off:</strong>
                    <div style={{ marginTop: 8, borderBottom: '1px solid #000', height: 30 }}></div>
                  </div>
                  <div>
                    <strong>Store Manager Approval (if Tier 2):</strong>
                    <div style={{ marginTop: 8, borderBottom: '1px solid #000', height: 30 }}></div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button className="primary-action" onClick={() => alert('Cycle count submitted for dual sign-off...')}>
                  <CheckCircle2 size={14} /> Submit Count
                </button>
                <button className="panel-action-button" onClick={() => window.print()}>
                  <Printer size={14} /> Print Sheet
                </button>
                <button className="panel-action-button" onClick={() => setCycleSheet(generateCycleCountSheet(stockItems))}>
                  <RefreshCw size={14} /> Regenerate 5 SKUs
                </button>
              </div>
            </div>
          </div>

          {/* ABC Class Schedule */}
          <div className="span-12">
            <div className="panel-header"><h3>ABC Cycle Count Schedule</h3></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { class: 'A', desc: 'Top 20% value (20 SKUs)', freq: 'Every 14 days', color: '#ef4444', count: 20 },
                { class: 'B', desc: 'Next 30% value (30 SKUs)', freq: 'Every 30 days', color: '#f79009', count: 30 },
                { class: 'C', desc: 'Bottom 50% value (50 SKUs)', freq: 'Every 60 days', color: '#22c55e', count: 50 },
              ].map(c => (
                <div key={c.class} style={{ border: `2px solid ${c.color}30`, borderRadius: 10, padding: 16, background: `${c.color}08` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: c.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18 }}>
                      {c.class}
                    </div>
                    <span style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{c.count}</span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600 }}>{c.desc}</div>
                  <div style={{ fontSize: 12, color: '#667085' }}>Count Frequency: {c.freq}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ─── TAB: Shift Handover Form ─── */}
      {activeTab === 'handover' && (
        <>
          <div className="span-12">
            <div className="panel-header">
              <h3><Clock size={18} /> Option C: Digital Shift Handover Form</h3>
              <span style={{ fontSize: 12, color: '#667085' }}>Mandatory sign-off between outgoing and incoming shift leads</span>
            </div>
            <div style={{ fontSize: 13, color: '#667085', marginBottom: 12, padding: 12, background: '#fef3c7', borderRadius: 8, border: '1px solid #fde68a' }}>
              <strong>Directive HR-SOP-002 §2:</strong> Mandatory Shift Clock-In/Out via ERP Mobile Terminal with biometric/geo-pin verification.
              End-of-shift physical sign-off required for: Open POs, Staged orders, Quarantined/Damaged stock, Scanner inventory.
            </div>
          </div>

          <div className="span-12">
            <div style={{ border: '2px solid #050505', borderRadius: 12, padding: 24, background: '#fff' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #050505', paddingBottom: 12, marginBottom: 16 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20 }}>FARMTRACK ERP — SHIFT HANDOVER FORM</h2>
                  <div style={{ fontSize: 12, color: '#667085' }}>HR-SOP-002 §2 · Store Operations</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div><strong>Date:</strong> {handover.date}</div>
                  <div><strong>Outgoing:</strong> {handover.outgoingShift}</div>
                  <div><strong>Incoming:</strong> {handover.incomingShift}</div>
                </div>
              </div>

              {/* Shift Leads */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><strong>Outgoing Shift Lead:</strong><br />{handover.outgoingLead}</div>
                <div><strong>Incoming Shift Lead:</strong><br />{handover.incomingLead}</div>
                <div><strong>Handover Time:</strong><br />{handover.handoverTime}</div>
              </div>

              {/* Checklist */}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#050505', color: '#fff' }}>
                    <th style={{ padding: 10, textAlign: 'left' }}>#</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Handover Checklist Item</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Status</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Count/Qty</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {handover.checklist.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: 12 }}>{item.id}</td>
                      <td style={{ padding: 12, fontWeight: 600 }}>{item.item}</td>
                      <td style={{ padding: 12 }}>
                        <select style={{ padding: '4px 8px', border: '1px solid #d0d5dd', borderRadius: 4 }}>
                          <option value="pending">Pending</option>
                          <option value="complete">✅ Complete</option>
                          <option value="issue">⚠️ Issue Found</option>
                        </select>
                      </td>
                      <td style={{ padding: 12 }}>
                        <input type="text" placeholder="___" style={{ width: 60, padding: '4px 8px', border: '1px solid #d0d5dd', borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: 12 }}>
                        <input type="text" placeholder="Notes..." style={{ width: 200, padding: '4px 8px', border: '1px solid #d0d5dd', borderRadius: 4 }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Signatures */}
              <div style={{ marginTop: 24, borderTop: '2px solid #050505', paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>BOTH SHIFTS MUST SIGN BEFORE LOGOFF</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <strong>Outgoing Shift Lead Signature:</strong>
                    <div style={{ marginTop: 8, borderBottom: '1px solid #000', height: 30 }}></div>
                  </div>
                  <div>
                    <strong>Incoming Shift Lead Signature:</strong>
                    <div style={{ marginTop: 8, borderBottom: '1px solid #000', height: 30 }}></div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button className="primary-action" onClick={() => alert('Shift handover submitted. Incoming shift can now clock in.')}>
                  <CheckCircle2 size={14} /> Complete Handover
                </button>
                <button className="panel-action-button" onClick={() => window.print()}>
                  <Printer size={14} /> Print Form
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── TAB: RACI Matrix ─── */}
      {activeTab === 'raci' && (
        <>
          <div className="span-12">
            <div className="panel-header">
              <h3><Users size={18} /> 7-User Role Responsibility Matrix (RACI)</h3>
              <span style={{ fontSize: 12, color: '#667085' }}>R = Responsible · A = Accountable · C = Consulted · I = Informed</span>
            </div>
          </div>

          <div className="span-12">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Task / Workflow</th>
                    <th>Store Manager<br />(User 1)</th>
                    <th>Inv Controller<br />(User 2)</th>
                    <th>Receiving Officers<br />(Users 3,4)</th>
                    <th>Dispatch Officers<br />(Users 5,6)</th>
                    <th>QC Specialist<br />(User 7)</th>
                  </tr>
                </thead>
                <tbody>
                  {RACI_TASKS.map((t, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{t.task}</td>
                      {['mgr', 'ctrl', 'recv', 'disp', 'qc'].map(role => {
                        const val = t[role];
                        const colors = { R: '#22c55e', A: '#2563eb', C: '#f79009', I: '#d0d5dd' };
                        return (
                          <td key={role} style={{ textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-flex', width: 28, height: 28, borderRadius: 6,
                              background: `${colors[val]}20`, color: colors[val], fontWeight: 700,
                              alignItems: 'center', justifyContent: 'center', fontSize: 13
                            }}>
                              {val}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div className="span-12" style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span><span style={{ display: 'inline-block', width: 16, height: 16, background: '#22c55e20', color: '#22c55e', borderRadius: 4, textAlign: 'center', lineHeight: '16px', fontWeight: 700, marginRight: 4 }}>R</span> Responsible (Does the work)</span>
            <span><span style={{ display: 'inline-block', width: 16, height: 16, background: '#2563eb20', color: '#2563eb', borderRadius: 4, textAlign: 'center', lineHeight: '16px', fontWeight: 700, marginRight: 4 }}>A</span> Accountable (Approves/Owns)</span>
            <span><span style={{ display: 'inline-block', width: 16, height: 16, background: '#f7900920', color: '#f79009', borderRadius: 4, textAlign: 'center', lineHeight: '16px', fontWeight: 700, marginRight: 4 }}>C</span> Consulted</span>
            <span><span style={{ display: 'inline-block', width: 16, height: 16, background: '#d0d5dd20', color: '#d0d5dd', borderRadius: 4, textAlign: 'center', lineHeight: '16px', fontWeight: 700, marginRight: 4 }}>I</span> Informed</span>
          </div>
        </>
      )}

      {/* ─── TAB: HR KPI Dashboard ─── */}
      {activeTab === 'kpi' && (
        <>
          <div className="span-12">
            <div className="panel-header">
              <h3><Award size={18} /> HR KPI & Performance Evaluation Dashboard</h3>
              <span style={{ fontSize: 12, color: '#667085' }}>Linked to inventory variance logs · Monthly performance scorecard</span>
            </div>
            <div style={{ fontSize: 13, color: '#667085', marginBottom: 12, padding: 12, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
              <strong>Directive HR-SOP-002 §4:</strong> IRA Contribution (35%) · Receiving Turnaround (20%) · Picking Accuracy (25%) · Damage Rate (20%)
            </div>
          </div>

          {/* KPI Formula Cards */}
          <div className="span-6">
            <div className="panel-header"><h3>🧮 Performance Metric Formulas</h3></div>
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                { name: 'Picking Accuracy %', formula: '(Error-Free Lines / Total Lines) × 100', target: '≥ 99.5%', weight: '25%' },
                { name: 'Inventory Variance Impact', formula: 'Σ(|Physical - System| × Unit Cost)', target: 'Per user', weight: '35%' },
                { name: 'Receiving Turnaround (RTP)', formula: 'Bin Putaway Time - Dock Arrival Time', target: '< 3.0 hrs', weight: '20%' },
                { name: 'Overall Labor Efficiency', formula: '(Standard Hours / Clocked Hours) × 100', target: '> 85%', weight: '20%' },
              ].map(f => (
                <div key={f.name} style={{ padding: 12, background: '#f9fafb', borderRadius: 8, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{f.name}</strong>
                    <span style={{ background: '#050505', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 10 }}>Weight: {f.weight}</span>
                  </div>
                  <code style={{ display: 'block', marginTop: 4, color: '#667085', fontSize: 11 }}>{f.formula}</code>
                  <div style={{ marginTop: 4, color: '#22c55e', fontWeight: 600 }}>Target: {f.target}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Discrepancy Protocol */}
          <div className="span-6">
            <div className="panel-header"><h3>⚠️ Discrepancy & Retraining Protocol</h3></div>
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                { level: 1, name: 'Data Entry Error < KES 1,000', action: 'System Flag + Mandatory 30-min SOP Refresher', color: '#f79009' },
                { level: 2, name: 'Unexplained Variance KES 1,000-10,000', action: 'Formal HR Review + Peer Audit', color: '#ef4444' },
                { level: 3, name: 'Gross Negligence > KES 10,000', action: 'Formal Disciplinary Action', color: '#dc2626' },
              ].map(d => (
                <div key={d.level} style={{ border: `1px solid ${d.color}30`, borderRadius: 10, padding: 12, background: `${d.color}08` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: d.color }}>Level {d.level}: {d.name}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>Action: {d.action}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-User Performance Scorecard */}
          <div className="span-12">
            <div className="panel-header"><h3>📊 Monthly Performance Scorecard (7 Users)</h3></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>User</th><th>Role</th>
                    <th>IRA % (35%)</th><th>Picking % (25%)</th>
                    <th>Receiving hrs (20%)</th><th>Damage % (20%)</th>
                    <th>Overall Score</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {STORE_ROLES.map(role => {
                    const score = Math.round(
                      (role.kpi.ira * 0.35) +
                      (role.kpi.picking * 0.25) +
                      (role.kpi.receiving * 0.20) +
                      ((100 - role.kpi.damage) * 0.20)
                    );
                    return (
                      <tr key={role.id}>
                        <td>{role.id}</td>
                        <td><strong>{role.name}</strong></td>
                        <td>{role.short}</td>
                        <td style={{ color: role.kpi.ira >= 98 ? '#22c55e' : '#f79009', fontWeight: 700 }}>{role.kpi.ira}%</td>
                        <td style={{ color: role.kpi.picking >= 99.5 ? '#22c55e' : role.kpi.picking === 0 ? '#d0d5dd' : '#f79009', fontWeight: 700 }}>
                          {role.kpi.picking === 0 ? 'N/A' : `${role.kpi.picking}%`}
                        </td>
                        <td>{role.kpi.receiving === 0 ? 'N/A' : '< 3.0 hrs'}</td>
                        <td style={{ color: role.kpi.damage <= 0.1 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{role.kpi.damage}%</td>
                        <td style={{ fontWeight: 700, fontSize: 14, color: score >= 95 ? '#22c55e' : score >= 80 ? '#f79009' : '#ef4444' }}>{score}%</td>
                        <td>
                          <span className={`status ${score >= 95 ? 'active' : score >= 80 ? 'partial' : 'cancelled'}`}>
                            {score >= 95 ? 'Excellent' : score >= 80 ? 'Meets' : 'Below'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default StoreOperationsGovernance;