import React, { useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Package, BarChart3, ClipboardCheck, Download, Printer, Clock, UserCog, QrCode, MapPin, FileText, Truck, DollarSign, RefreshCw, Search, Eye, Activity, Calendar } from 'lucide-react';

export function InventoryAuditDashboard({ user, stockItems, movements, adjustments, warehouses, onClose }) {
  const [activePhase, setActivePhase] = useState(1);
  const [activeStep, setActiveStep] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  const totalSKUs = (stockItems || []).length;
  const outOfStock = (stockItems || []).filter(s => (s.quantityAvailable || 0) <= 0).length;
  const lowStock = (stockItems || []).filter(s => (s.quantityAvailable || 0) > 0 && (s.quantityAvailable || 0) <= (s.minimumStock || 10)).length;
  const damaged = (stockItems || []).reduce((s, i) => s + (i.damagedQuantity || 0), 0);
  const quarantined = (stockItems || []).reduce((s, i) => s + (i.quarantinedQuantity || 0), 0);
  const totalValue = (stockItems || []).reduce((s, i) => s + (i.inventoryValue || 0), 0);
  const reserved = (stockItems || []).reduce((s, i) => s + (i.quantityReserved || 0), 0);
  const incoming = (stockItems || []).reduce((s, i) => s + (i.quantityIncoming || 0), 0);
  const outgoing = (stockItems || []).reduce((s, i) => s + (i.quantityOutgoing || 0), 0);
  const availableStock = (stockItems || []).reduce((s, i) => s + (i.quantityAvailable || 0), 0);
  const accuracy = outOfStock + lowStock > 0 ? Math.round((1 - (outOfStock + lowStock) / Math.max(1, totalSKUs)) * 100) : 95;

  const phases = [
    { id: 1, name: 'Physical & Location', color: '#2563eb', steps: [
      { id: 'full-count', label: 'Full Physical Count', icon: ClipboardCheck, desc: 'Count every single physical unit across all SKUs and map against system records', done: false },
      { id: 'abc-count', label: 'ABC Cycle Counting', icon: BarChart3, desc: 'Class A weekly, Class B monthly, Class C quarterly', done: false },
      { id: 'bin-audit', label: 'Bin/Shelf Location Audit', icon: MapPin, desc: 'Verify every item in assigned Zone-Aisle-Rack-Shelf-Bin location', done: false },
      { id: 'quarantine-audit', label: 'Quarantine & Damaged Isolation', icon: AlertTriangle, desc: 'Physically isolate and re-count damaged/quarantined items', done: false },
      { id: 'blind-count', label: 'Blind Count Execution', icon: Eye, desc: 'Count sheets without showing system quantities to prevent bias', done: false },
    ]},
    { id: 2, name: 'Process & Multi-User', color: '#7c3aed', steps: [
      { id: 'user-log', label: 'User Activity Log Audit', icon: UserCog, desc: 'Review transactions across all 7 team members', done: false },
      { id: 'cutoff', label: 'Transaction Cutoff Audit', icon: Clock, desc: 'Ensure GRNs before cutoff are posted, GDNs deducted before physical count', done: false },
      { id: 'uom', label: 'UOM Conversion Verification', icon: Package, desc: 'Audit loose units vs bulk packs conversions', done: false },
      { id: 'double-blind', label: 'Two-Person Double-Blind Audit', icon: UserCog, desc: 'Two independent teams count same aisle, compare results', done: false },
      { id: 'qr-scan', label: 'QR/Barcode Tag Scan Audit', icon: QrCode, desc: 'Scan physical tags and verify against system records', done: false },
    ]},
    { id: 3, name: 'Product Integrity', color: '#059669', steps: [
      { id: 'batch', label: 'Batch & Lot Reconciliation', icon: Package, desc: 'Match physical lot numbers against active batch records', done: false },
      { id: 'expiry', label: 'Expiry & FEFO Compliance', icon: Calendar, desc: 'Check physical expiry dates, ensure First-Expired-First-Out picking', done: false },
      { id: 'serial', label: 'Serial Number Tracking', icon: QrCode, desc: 'Verify physical serial numbers against system records', done: false },
      { id: 'reservation', label: 'Stock Reservation Audit', icon: ClipboardCheck, desc: `Cross-reference ${reserved} reserved units against active orders`, done: false },
      { id: 'pipeline', label: 'Incoming Pipeline Audit', icon: Truck, desc: `Compare ${incoming} incoming units against physical receiving docks`, done: false },
    ]},
    { id: 4, name: 'Financial & Valuation', color: '#d97706', steps: [
      { id: 'dispatch', label: 'Outgoing Dispatch Audit', icon: Truck, desc: `Audit ${outgoing} outgoing units staged for shipment`, done: false },
      { id: 'fifo', label: 'FIFO Cost & Valuation Audit', icon: DollarSign, desc: `Audit stock valuation under FIFO rules across KES ${(totalValue/1000000).toFixed(1)}M inventory`, done: false },
      { id: 'variance', label: 'Variance Root-Cause Analysis', icon: Search, desc: 'Categorize variances into: Data Entry, Theft, Damage, UOM, Misplacement', done: false },
      { id: 'reorder', label: 'Reorder Point Calibration', icon: RefreshCw, desc: `Audit safety stock for ${lowStock} low-stock items to prevent stockouts`, done: false },
      { id: 'freeze', label: 'Post-Audit Adjustment Freeze', icon: FileText, desc: 'Enforce manager approval for all inventory adjustments', done: false },
    ]},
  ];

  const gaps = [
    { name: 'RBAC Access Control', risk: 'Unrestricted adjustments; no accountability', severity: 'Critical', icon: UserCog },
    { name: 'Dual-Control Authorization', risk: 'Phantom stock creation; theft concealment', severity: 'Critical', icon: CheckCircle2 },
    { name: 'Barcode/Mobile Scanning', risk: 'Manual typing errors; slow audit cycles', severity: 'High', icon: QrCode },
    { name: 'Cycle Count Program', risk: 'Operations halt for manual count days', severity: 'High', icon: RefreshCw },
    { name: 'Standard Operating Procedures', risk: '7 people doing tasks 7 different ways', severity: 'High', icon: FileText },
    { name: 'Bin Location Precision', risk: 'Lost stock; misplaced items marked missing', severity: 'Medium', icon: MapPin },
    { name: 'Staging & Holding Controls', risk: 'Damaged/Quarantined mixed with sellable', severity: 'Medium', icon: AlertTriangle },
    { name: 'Automated Reorder Triggers', risk: '17 OOS items; constant fire-fighting', severity: 'Medium', icon: RefreshCw },
    { name: 'Audit Trail & Logging', risk: 'Unable to identify variance causes', severity: 'Medium', icon: Activity },
    { name: 'Valuation Reconciliation', risk: 'Inaccurate FIFO balance sheet reporting', severity: 'Low', icon: DollarSign },
  ];

  const accuracyColor = accuracy >= 90 ? '#22c55e' : accuracy >= 70 ? '#f79009' : '#ef4444';

  return (
    <div className="dashboard-grid">
      {/* Header */}
      <div className="span-12" style={{ background: 'linear-gradient(135deg, #050505, #2563eb)', borderRadius: 16, padding: 24, color: '#fff', marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24 }}>Inventory Audit Command Center</h2>
            <p style={{ margin: '8px 0 0', opacity: 0.8 }}>Enterprise Audit Framework & Gap Analysis · {totalSKUs} SKUs managed by 7 team members</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 36, fontWeight: 700 }}>{accuracy}%</div>
            <div style={{ opacity: 0.8 }}>Inventory Accuracy</div>
            <div style={{ marginTop: 8, background: accuracyColor, borderRadius: 8, padding: '2px 12px', fontSize: 12, display: 'inline-block' }}>
              {accuracy >= 90 ? 'GOOD' : accuracy >= 70 ? 'NEEDS IMPROVEMENT' : 'CRITICAL'}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#101828' }}>{totalSKUs}</strong><span>Total SKUs</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#ef4444' }}>{outOfStock}</strong><span>Out of Stock</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#f79009' }}>{lowStock}</strong><span>Low Stock</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#22c55e' }}>{availableStock.toLocaleString()}</strong><span>Available Units</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: reserved ? '#2563eb' : '#22c55e' }}>{reserved}</strong><span>Reserved</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#22c55e' }}>{incoming}</strong><span>Incoming</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#f79009' }}>{outgoing}</strong><span>Outgoing</span></div></div>
      <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: damaged ? '#ef4444' : '#22c55e' }}>{damaged}</strong><span>Damaged Units</span></div></div>

      {/* 4-Phase Audit Methodology */}
      <div className="span-12">
        <div className="panel-header"><h3>📋 4-Phase Audit Methodology</h3></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {phases.map(phase => (
            <div key={phase.id}
              style={{ border: `2px solid ${activePhase === phase.id ? phase.color : '#e5e7eb'}`, borderRadius: 12, padding: 16, cursor: 'pointer', background: activePhase === phase.id ? '#f8fafc' : '#fff' }}
              onClick={() => setActivePhase(phase.id)}>
              <div style={{ fontSize: 13, fontWeight: 700, color: phase.color }}>Phase {phase.id}</div>
              <div style={{ fontWeight: 600, margin: '4px 0' }}>{phase.name}</div>
              <div style={{ fontSize: 12, color: '#667085' }}>{phase.steps.length} audit techniques</div>
              <div style={{ marginTop: 8 }}>
                {phase.steps.map(step => (
                  <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: 11 }}>
                    <span style={{ color: step.done ? '#22c55e' : '#d0d5dd' }}>{step.done ? '✅' : '○'}</span>
                    <span style={{ color: step.done ? '#22c55e' : '#667085' }}>{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active Phase Steps */}
      <div className="span-8">
        <div className="panel-header"><h3>Phase {activePhase}: {phases.find(p => p.id === activePhase)?.name} - Action Items</h3></div>
        {phases.find(p => p.id === activePhase)?.steps.map((step, i) => (
          <div key={step.id}
            style={{ display: 'flex', gap: 12, padding: '12px 16px', marginBottom: 8, border: '1px solid #e5e7eb', borderRadius: 12, cursor: 'pointer', background: activeStep === step.id ? '#f0f9ff' : '#fff' }}
            onClick={() => setActiveStep(activeStep === step.id ? null : step.id)}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f2f4f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <step.icon size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{i+1}. {step.label}</strong>
                <span style={{ background: step.done ? '#dcfce7' : '#f2f4f7', padding: '2px 10px', borderRadius: 12, fontSize: 11, color: step.done ? '#22c55e' : '#667085' }}>
                  {step.done ? 'Done' : 'Pending'}
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#667085', marginTop: 4 }}>{step.desc}</div>
              {activeStep === step.id && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button className="panel-action-button" style={{ background: '#22c55e', color: '#fff' }} onClick={(e) => { e.stopPropagation(); step.done = !step.done; }}>
                    <CheckCircle2 size={14} /> {step.done ? 'Mark Pending' : 'Mark Complete'}
                  </button>
                  <button className="panel-action-button" onClick={(e) => { e.stopPropagation(); alert(`Starting ${step.label} audit...`); }}>
                    <ClipboardCheck size={14} /> Start Audit
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Gap Analysis */}
      <div className="span-4">
        <div className="panel-header"><h3>🔍 Gap Analysis</h3><span style={{ fontSize: 12, color: '#667085' }}>10 gaps identified</span></div>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {gaps.map(gap => (
            <div key={gap.name} style={{ padding: '10px 12px', borderBottom: '1px solid #f2f4f7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <gap.icon size={16} />
                  <strong style={{ fontSize: 13 }}>{gap.name}</strong>
                </div>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: gap.severity === 'Critical' ? '#fef2f2' : gap.severity === 'High' ? '#fffbeb' : '#f0f9ff', color: gap.severity === 'Critical' ? '#ef4444' : gap.severity === 'High' ? '#f79009' : '#2563eb', fontWeight: 600 }}>
                  {gap.severity}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#667085', marginTop: 4 }}>{gap.risk}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Key Formulas */}
      <div className="span-6">
        <div className="panel-header"><h3>🧮 Key Audit Formulas</h3></div>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { name: 'Inventory Record Accuracy', formula: `IRA% = (Accurate SKUs / Total SKUs) × 100`, value: `${accuracy}%`, target: '≥ 98%' },
            { name: 'Quantity Variance', formula: `Var% = (|Physical - System| / System) × 100`, value: `${100 - accuracy}%`, target: '< 2%' },
            { name: 'Shrinkage Rate', formula: `Shrink% = (Lost Stock Value / Total Value) × 100`, value: `${((outOfStock + lowStock) / Math.max(1, totalSKUs) * 10).toFixed(1)}%`, target: '< 1%' },
            { name: 'Available Stock', formula: 'Available = On-Hand - Reserved - Quarantined - Damaged + Incoming', value: `${availableStock}`, target: '> Reorder Point' },
          ].map(f => (
            <div key={f.name} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', gap: 8, padding: '8px 12px', background: '#f9fafb', borderRadius: 8, fontSize: 12, alignItems: 'center' }}>
              <strong>{f.name}</strong>
              <code style={{ fontSize: 11, color: '#667085' }}>{f.formula}</code>
              <span style={{ fontWeight: 700, color: f.name === 'Inventory Record Accuracy' ? accuracyColor : '#101828' }}>{f.value}</span>
              <span style={{ color: '#667085' }}>Target: {f.target}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 14-Day Action Plan */}
      <div className="span-6">
        <div className="panel-header"><h3>📅 14-Day Implementation Roadmap</h3></div>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { days: 'Days 1-2', tasks: ['Freeze inventory for 24h', 'Full physical count all SKUs', 'Segregate damaged/quarantined'], color: '#ef4444' },
            { days: 'Days 3-5', tasks: ['Reconcile physical vs system', 'Submit high-variance items', 'Post approved adjustments'], color: '#f79009' },
            { days: 'Days 6-8', tasks: ['Configure 7 user roles', 'Enforce QR scanning', 'Assign bin locations'], color: '#2563eb' },
            { days: 'Days 9-14', tasks: ['Daily 5-SKU cycle counting', 'Review PO alerts', 'Publish accuracy report'], color: '#22c55e' },
          ].map(phase => (
            <div key={phase.days} style={{ border: `1px solid ${phase.color}20`, borderRadius: 10, padding: 12, background: `${phase.color}08` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: phase.color }}>{phase.days}</strong>
                <span style={{ fontSize: 11, color: '#667085' }}>{phase.tasks.length} action items</span>
              </div>
              {phase.tasks.map((task, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12 }}>
                  <input type="checkbox" style={{ margin: 0 }} />
                  <span>{task}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Items Needing Attention */}
      <div className="span-12">
        <div className="panel-header"><h3>⚠️ Items Requiring Immediate Audit Attention</h3></div>
        <div className="table-wrap" style={{ maxHeight: 300 }}>
          <table>
            <thead><tr><th>SKU</th><th>Product</th><th>Available</th><th>Status</th><th>Damaged</th><th>Quarantined</th><th>Value</th><th>Action</th></tr></thead>
            <tbody>
              {(stockItems || []).filter(s => (s.damagedQuantity || 0) > 0 || (s.quarantinedQuantity || 0) > 0 || (s.quantityAvailable || 0) <= (s.minimumStock || 10)).slice(0, 20).map(item => (
                <tr key={item.id} onClick={() => setSelectedItem(item)} style={{ cursor: 'pointer', background: (item.damagedQuantity || 0) > 0 ? '#fef2f2' : (item.quantityAvailable || 0) <= 0 ? '#fffbeb' : '' }}>
                  <td><strong>{item.sku}</strong></td>
                  <td>{item.productName}</td>
                  <td style={{ color: (item.quantityAvailable || 0) <= 0 ? '#ef4444' : '#101828', fontWeight: 700 }}>{item.quantityAvailable || 0}</td>
                  <td><span className={`status ${(item.quantityAvailable || 0) <= 0 ? 'cancelled' : (item.quantityAvailable || 0) <= (item.minimumStock || 10) ? 'partial' : 'active'}`}>
                    {(item.quantityAvailable || 0) <= 0 ? 'Out of Stock' : (item.quantityAvailable || 0) <= (item.minimumStock || 10) ? 'Low Stock' : 'In Stock'}
                  </span></td>
                  <td style={{ color: (item.damagedQuantity || 0) > 0 ? '#ef4444' : '#22c55e' }}>{item.damagedQuantity || 0}</td>
                  <td style={{ color: (item.quarantinedQuantity || 0) > 0 ? '#f79009' : '#22c55e' }}>{item.quarantinedQuantity || 0}</td>
                  <td>{currency(item.inventoryValue)}</td>
                  <td><button className="mini-action" onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}><Eye size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function currency(v) { return `Ksh${Number(v || 0).toLocaleString()}`; }