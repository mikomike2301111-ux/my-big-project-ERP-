import React, { useState } from 'react';
import { X, Phone, Mail, MapPin, ShoppingCart, ReceiptText, CircleDollarSign, FileText, Download, Printer, MessageSquare, Calendar, CheckCircle2, AlertTriangle, ArrowRight, MoreVertical, Edit3, Trash2, Send, Activity } from 'lucide-react';

function ModalCard({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-card ${wide ? 'wide' : ''}`} onClick={e => e.stopPropagation()}>
        <header><h2>{title}</h2><button type="button" onClick={onClose}><X size={18} /></button></header>
        {children}
      </div>
    </div>
  );
}

export function ClientDeepDive({ user, client, orders = [], invoices = [], payments = [], products = [], calls = [], onClose, onNavigate, onRefresh }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [actionMenu, setActionMenu] = useState(false);

  if (!client) return null;

  // Filter orders/invoices for this client
  const clientOrders = orders.filter(o => o.customerId === client.id || o.customerName === client.name);
  const clientInvoices = invoices.filter(i => i.customerId === client.id || i.customerName === client.name);
  const clientPayments = payments.filter(p => p.customerId === client.id || p.customerName === client.name);
  const clientCalls = calls.filter(c => c.customerId === client.id || c.customerName === client.name);

  // Financials
  const totalOrders = clientOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalPaid = clientInvoices.reduce((s, i) => s + Number(i.paid || 0), 0);
  const totalBalance = clientInvoices.reduce((s, i) => s + Number(i.balance || i.outstanding || 0), 0);
  const overdueInvoices = clientInvoices.filter(i => Number(i.balance || 0) > 0 && i.daysOverdue > 0);
  const overdueAmount = overdueInvoices.reduce((s, i) => s + Number(i.balance || 0), 0);

  const actions = [
    { label: 'View in CRM', icon: <Activity size={15} />, onClick: () => onNavigate?.('customers') },
    { label: 'Send Email', icon: <Mail size={15} />, onClick: () => { if (client.email) window.location.href = `mailto:${client.email}`; } },
    { label: 'Call', icon: <Phone size={15} />, onClick: () => { if (client.phone) window.location.href = `tel:${client.phone}`; } },
    { label: 'WhatsApp', icon: <MessageSquare size={15} />, onClick: () => { if (client.phone) window.open(`https://wa.me/${String(client.phone).replace(/\D/g, '')}`, '_blank'); } },
    { label: 'Export CSV', icon: <Download size={15} />, onClick: () => { const rows = [client, ...clientOrders, ...clientInvoices]; const csv = [Object.keys(rows[0] || {}).join(','), ...rows.map(r => Object.values(r).map(v => `"${v || ''}"`).join(','))].join('\n'); const blob = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${client.name}-data.csv`.replace(/\s+/g, '-'); a.click(); } },
    { label: 'Print Summary', icon: <Printer size={15} />, onClick: () => { const w = window.open('', '_blank'); if (!w) return; w.document.write(`<html><head><title>${client.name}</title></head><body><h1>${client.name}</h1><pre>${JSON.stringify(client, null, 2)}</pre><script>window.print()</script></body></html>`); w.document.close(); } },
    { label: 'Create Order', icon: <ShoppingCart size={15} />, onClick: () => { alert('New order creation form coming soon.'); } },
    { label: 'Record Payment', icon: <CircleDollarSign size={15} />, onClick: () => { const amt = prompt('Payment amount:', overdueAmount || 0); if (amt) alert(`Payment of Ksh${amt} recorded for ${client.name}`); } },
  ];

  const subTabs = ['overview', 'orders', 'invoices', 'payments', 'products', 'activity', 'financials'];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card wide wide-full" onClick={e => e.stopPropagation()} style={{ maxWidth: 1000, maxHeight: '90vh', overflow: 'hidden' }}>
        <header style={{ borderBottom: '1px solid #e5e7eb', padding: '16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#050505', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>
              {client.name?.[0] || 'C'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 20 }}>{client.name}</h2>
                <span className={`status ${(client.health || client.status || 'Active').toLowerCase() === 'active' ? 'active' : (client.health || '').toLowerCase() === 'vip' ? 'active' : 'partial'}`}>
                  {client.health || client.status || 'Active'}
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#667085', display: 'flex', gap: 16, marginTop: 2 }}>
                {client.email && <span>✉ {client.email}</span>}
                {client.phone && <span>📞 {client.phone}</span>}
                {client.city && <span>📍 {client.city}</span>}
                {client.type && <span>🏷 {client.type}</span>}
              </div>
            </div>
            {/* 3-dot Action Menu */}
            <div style={{ position: 'relative' }}>
              <button className="panel-action-button" onClick={() => setActionMenu(!actionMenu)} style={{ padding: '8px 12px' }}>
                <MoreVertical size={18} />
              </button>
              {actionMenu && (
                <div style={{ position: 'absolute', right: 0, top: '100%', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 220, padding: 8 }}>
                  {actions.map((a, i) => (
                    <button key={i} type="button" onClick={() => { setActionMenu(false); a.onClick(); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 8, color: '#344054' }}
                      onMouseOver={e => e.currentTarget.style.background = '#f2f4f7'}
                      onMouseOut={e => e.currentTarget.style.background = 'none'}>
                      {a.icon}<span>{a.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '8px 24px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', overflowX: 'auto' }}>
          {subTabs.map(t => (
            <button key={t} className={`settings-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}
              style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, border: 'none', background: activeTab === t ? '#fff' : 'transparent', borderRadius: 8, cursor: 'pointer', color: activeTab === t ? '#050505' : '#667085', boxShadow: activeTab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div style={{ overflow: 'auto', maxHeight: 'calc(90vh - 160px)', padding: 16 }}>
          <div className="dashboard-grid">
            {/* OVERVIEW */}
            {activeTab === 'overview' && (
              <>
                <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#22c55e' }}>{currency(totalPaid)}</strong><span>Total Paid</span></div></div>
                <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: overdueAmount ? '#ef4444' : '#22c55e' }}>{currency(overdueAmount)}</strong><span>Overdue</span></div></div>
                <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#2563eb' }}>{clientOrders.length}</strong><span>Orders</span></div></div>
                <div className="span-3"><div className="hr-report-kpi"><strong style={{ color: '#7c3aed' }}>{clientInvoices.length}</strong><span>Invoices</span></div></div>

                <div className="settings-kv-grid span-6">
                  <article><span>Customer ID</span><strong>{client.id || client.customerId || 'N/A'}</strong></article>
                  <article><span>Email</span><strong>{client.email || 'N/A'}</strong></article>
                  <article><span>Phone</span><strong>{client.phone || 'N/A'}</strong></article>
                  <article><span>Location</span><strong>{client.city || client.county || 'N/A'}</strong></article>
                  <article><span>Type</span><strong>{client.type || 'N/A'}</strong></article>
                  <article><span>Credit Limit</span><strong>{currency(client.creditLimit)}</strong></article>
                  <article><span>Total Purchases</span><strong>{currency(totalOrders)}</strong></article>
                  <article><span>Outstanding Balance</span><strong style={{ color: totalBalance > 0 ? '#ef4444' : '#22c55e' }}>{currency(totalBalance)}</strong></article>
                  <article><span>Payment Terms</span><strong>{client.paymentTerms || 'N/A'}</strong></article>
                  <article><span>Last Order</span><strong>{client.lastOrderDate || 'N/A'}</strong></article>
                </div>
                <div className="settings-kv-grid span-6">
                  <article><span>Days Since Last Order</span><strong>{client.lastOrderDate ? Math.round((Date.now() - new Date(client.lastOrderDate).getTime()) / 86400000) + 'd' : 'N/A'}</strong></article>
                  <article><span>Overdue Invoices</span><strong style={{ color: overdueInvoices.length ? '#ef4444' : '#22c55e' }}>{overdueInvoices.length}</strong></article>
                  <article><span>Overdue Amount</span><strong style={{ color: overdueAmount ? '#ef4444' : '#22c55e' }}>{currency(overdueAmount)}</strong></article>
                  <article><span>Total Orders Value</span><strong>{currency(totalOrders)}</strong></article>
                  <article><span>Health Score</span><strong>{client.health || client.score || 'Good'}</strong></article>
                  <article><span>Risk Level</span><strong style={{ color: overdueAmount > 10000 ? '#ef4444' : '#22c55e' }}>{overdueAmount > 10000 ? 'High' : overdueAmount > 0 ? 'Medium' : 'Low'}</strong></article>
                </div>

                {/* Recent Activity */}
                <div className="span-12">
                  <div className="panel-header"><h3>Recent Activity (last 5)</h3></div>
                  {[...clientInvoices.slice(0, 3).map(i => ({ type: 'invoice', ...i })), ...clientOrders.slice(0, 3).map(o => ({ type: 'order', ...o }))]
                    .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
                    .slice(0, 5).map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #f2f4f7', alignItems: 'center', fontSize: 13 }}>
                      <span>{item.type === 'invoice' ? '🧾' : '📦'}</span>
                      <strong>{item.invNo || item.saleNo || 'Ref'}</strong>
                      <span style={{ color: '#667085' }}>{item.date || item.createdAt || ''}</span>
                      <span style={{ marginLeft: 'auto' }}><strong>{currency(item.total || item.amount)}</strong></span>
                      <span className={`status ${item.status === 'Paid' || item.liveStatus === 'Delivered' ? 'active' : 'partial'}`}>{item.status || item.liveStatus || 'Open'}</span>
                    </div>
                  ))}
                  {clientInvoices.length === 0 && clientOrders.length === 0 && <div className="empty-state">No activity yet for this client.</div>}
                </div>
              </>
            )}

            {/* ORDERS */}
            {activeTab === 'orders' && (
              <div className="span-12">
                <div className="panel-header"><h3>Orders ({clientOrders.length})</h3><span style={{ fontSize: 13, color: '#667085' }}>Total: {currency(totalOrders)}</span></div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Order #</th><th>Date</th><th>Product</th><th>Qty</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Delivery</th></tr></thead>
                    <tbody>
                      {clientOrders.map((o, i) => (
                        <tr key={o.id || i}>
                          <td><strong>{o.saleNo || o.orderNo}</strong></td>
                          <td>{o.date || o.createdAt}</td>
                          <td>{o.productName || 'Multiple'}</td>
                          <td>{o.quantity || '-'}</td>
                          <td>{currency(o.total)}</td>
                          <td>{currency(o.paid)}</td>
                          <td style={{ color: Number(o.balance || 0) > 0 ? '#ef4444' : '#22c55e' }}>{currency(o.balance)}</td>
                          <td><span className={`status ${o.liveStatus === 'Delivered' ? 'active' : o.liveStatus === 'Dispatched' ? 'partial' : 'pending'}`}>{o.liveStatus || 'Pending'}</span></td>
                          <td>{o.deliveryStatus || '-'}</td>
                        </tr>
                      ))}
                      {clientOrders.length === 0 && <tr><td colSpan={9}><div className="empty-state">No orders found for this client.</div></td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* INVOICES */}
            {activeTab === 'invoices' && (
              <div className="span-12">
                <div className="panel-header"><h3>Invoices ({clientInvoices.length})</h3>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 13 }}>Paid: <strong style={{ color: '#22c55e' }}>{clientInvoices.filter(i => Number(i.balance || 0) <= 0).length}</strong></span>
                    <span style={{ fontSize: 13 }}>Unpaid: <strong style={{ color: '#ef4444' }}>{clientInvoices.filter(i => Number(i.balance || 0) > 0).length}</strong></span>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Invoice #</th><th>Date</th><th>Due Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Due Days</th><th>Status</th><th>Action</th></tr></thead>
                    <tbody>
                      {clientInvoices.map((inv, i) => (
                        <tr key={inv.id || i} style={{ background: inv.daysOverdue > 30 ? '#fef2f2' : inv.daysOverdue > 0 ? '#fffbeb' : '' }}>
                          <td><strong>{inv.invNo || inv.invoiceNo}</strong></td>
                          <td>{inv.date || inv.invoiceDate}</td>
                          <td>{inv.dueDate || '-'}</td>
                          <td>{currency(inv.total)}</td>
                          <td>{currency(inv.paid)}</td>
                          <td style={{ color: Number(inv.balance || 0) > 0 ? '#ef4444' : '#22c55e', fontWeight: 700 }}>{currency(inv.balance)}</td>
                          <td style={{ color: inv.daysOverdue > 30 ? '#ef4444' : inv.daysOverdue > 0 ? '#f79009' : '#22c55e' }}>{inv.daysOverdue ? `${inv.daysOverdue}d` : 'Current'}</td>
                          <td><span className={`status ${inv.status === 'Paid' || Number(inv.balance || 0) <= 0 ? 'active' : inv.daysOverdue > 0 ? 'cancelled' : 'partial'}`}>{inv.status || (Number(inv.balance || 0) <= 0 ? 'Paid' : 'Open')}</span></td>
                          <td>
                            <button className="mini-action" title="Download PDF" onClick={() => alert(`Downloading invoice ${inv.invNo}`)}><Download size={14} /></button>
                            <button className="mini-action" title="Email" onClick={() => alert(`Emailing invoice ${inv.invNo}`)}><Send size={14} /></button>
                          </td>
                        </tr>
                      ))}
                      {clientInvoices.length === 0 && <tr><td colSpan={9}><div className="empty-state">No invoices for this client.</div></td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PAYMENTS */}
            {activeTab === 'payments' && (
              <div className="span-12">
                <div className="panel-header"><h3>Payment History</h3>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <span>Total Paid: <strong style={{ color: '#22c55e' }}>{currency(totalPaid)}</strong></span>
                    <span>Outstanding: <strong style={{ color: totalBalance > 0 ? '#ef4444' : '#22c55e' }}>{currency(totalBalance)}</strong></span>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>Reference</th><th>Method</th><th>Amount</th><th>Invoice</th><th>Status</th></tr></thead>
                    <tbody>
                      {(clientPayments.length > 0 ? clientPayments : clientInvoices.filter(i => Number(i.paid || 0) > 0).map(i => ({
                        date: i.paymentDate || i.date, reference: i.invNo, method: i.paymentMethod || 'Bank', amount: i.paid, invoice: i.invNo, status: 'Completed'
                      }))).slice(0, 20).map((p, i) => (
                        <tr key={i}>
                          <td>{p.date || '-'}</td>
                          <td>{p.reference || '-'}</td>
                          <td>{p.method || 'Bank Transfer'}</td>
                          <td><strong>{currency(p.amount)}</strong></td>
                          <td>{p.invoice || '-'}</td>
                          <td><span className="status active">{p.status || 'Completed'}</span></td>
                        </tr>
                      ))}
                      {clientInvoices.filter(i => Number(i.paid || 0) > 0).length === 0 && <tr><td colSpan={6}><div className="empty-state">No payments recorded yet.</div></td></tr>}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 12 }}>
                  <button className="primary-action" onClick={() => { const amt = prompt('Enter payment amount:', totalBalance || 0); if (amt && Number(amt) > 0) alert(`Payment of Ksh${amt} recorded for ${client.name}. Invoice will be updated.`); }}>
                    <CircleDollarSign size={14} /> Record Payment
                  </button>
                </div>
              </div>
            )}

            {/* PRODUCTS */}
            {activeTab === 'products' && (
              <div className="span-12">
                <div className="panel-header"><h3>Products Purchased</h3></div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Price</th><th>Total</th><th>Order #</th><th>Date</th></tr></thead>
                    <tbody>
                      {(clientOrders.length > 0 ? clientOrders : [
                        { productName: 'Sample Product 1', sku: 'SP-001', quantity: 10, unitPrice: 1500, total: 15000, saleNo: 'ORD-001', date: '2026-07-15' }
                      ]).slice(0, 20).map((item, i) => (
                        <tr key={i}>
                          <td><strong>{item.productName || 'Product'}</strong></td>
                          <td>{item.sku || '-'}</td>
                          <td>{item.quantity || '-'}</td>
                          <td>{currency(item.unitPrice || item.price)}</td>
                          <td>{currency(item.total || item.quantity * (item.unitPrice || 0))}</td>
                          <td>{item.saleNo || item.orderNo || '-'}</td>
                          <td>{item.date || item.createdAt || '-'}</td>
                        </tr>
                      ))}
                      {clientOrders.length === 0 && <tr><td colSpan={7}><div className="empty-state">No product data available yet.</div></td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ACTIVITY */}
            {activeTab === 'activity' && (
              <div className="span-12">
                <div className="panel-header"><h3>Full Activity Timeline</h3></div>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {[...clientInvoices.map(i => ({ ...i, _type: 'Invoice', _icon: '🧾', _detail: `${i.invNo} - ${currency(i.total)}` })),
                    ...clientOrders.map(o => ({ ...o, _type: 'Order', _icon: '📦', _detail: `${o.saleNo} - ${currency(o.total)}` })),
                    ...clientCalls.map(c => ({ ...c, _type: 'Call', _icon: '📞', _detail: c.notes || c.comments || '' })),
                  ].sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || ''))).map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f2f4f7', alignItems: 'flex-start' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: item._type === 'Invoice' ? '#fef3c7' : item._type === 'Order' ? '#dbeafe' : '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{item._icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <strong>{item._type}: {item._detail}</strong>
                          <span style={{ fontSize: 12, color: '#667085' }}>{item.date || item.createdAt || ''}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>{item.status || item.liveStatus || ''}</div>
                      </div>
                    </div>
                  ))}
                  {clientInvoices.length === 0 && clientOrders.length === 0 && clientCalls.length === 0 && <div className="empty-state">No activity recorded yet.</div>}
                </div>
              </div>
            )}

            {/* FINANCIALS */}
            {activeTab === 'financials' && (
              <>
                <div className="span-6">
                  <div className="panel-header"><h3>Balance Summary</h3></div>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
                      <span>Total Purchases</span><strong>{currency(totalOrders)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
                      <span>Total Paid</span><strong style={{ color: '#22c55e' }}>{currency(totalPaid)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
                      <span>Outstanding Balance</span><strong style={{ color: totalBalance > 0 ? '#ef4444' : '#22c55e' }}>{currency(totalBalance)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
                      <span>Overdue Amount</span><strong style={{ color: overdueAmount > 0 ? '#ef4444' : '#22c55e' }}>{currency(overdueAmount)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
                      <span>Credit Limit</span><strong>{currency(client.creditLimit)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                      <span>Credit Utilization</span><strong style={{ color: client.creditLimit && Number(client.creditLimit) > 0 && (totalOrders / Number(client.creditLimit)) > 0.8 ? '#ef4444' : '#22c55e' }}>
                        {client.creditLimit && Number(client.creditLimit) > 0 ? `${Math.round((totalOrders / Number(client.creditLimit)) * 100)}%` : 'N/A'}
                      </strong>
                    </div>
                  </div>
                </div>
                <div className="span-6">
                  <div className="panel-header"><h3>Risk Analysis</h3></div>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                      <span>Payment Behavior</span>
                      <strong style={{ color: overdueInvoices.length > 2 ? '#ef4444' : overdueInvoices.length > 0 ? '#f79009' : '#22c55e' }}>
                        {overdueInvoices.length > 2 ? 'Poor' : overdueInvoices.length > 0 ? 'Fair' : 'Good'}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                      <span>Order Frequency</span><strong>{clientOrders.length > 10 ? 'High' : clientOrders.length > 3 ? 'Medium' : 'Low'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                      <span>Average Order Value</span><strong>{currency(clientOrders.length ? totalOrders / clientOrders.length : 0)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                      <span>Customer Lifetime Value</span><strong>{currency(totalOrders)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                      <span>Risk Score</span>
                      <strong style={{ color: overdueAmount > 50000 ? '#ef4444' : overdueAmount > 10000 ? '#f79009' : '#22c55e' }}>
                        {overdueAmount > 50000 ? 'High Risk' : overdueAmount > 10000 ? 'Medium Risk' : 'Low Risk'}
                      </strong>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function currency(v) { return `Ksh${Number(v || 0).toLocaleString()}`; }