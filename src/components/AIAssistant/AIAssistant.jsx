import React, { useState, useEffect, useRef, useCallback } from 'react';
import './AIAssistant.css';

const MODULE_PROMPTS = {
  dashboard: [
    'Show me today\'s business summary',
    'What requires attention today?',
    'Explain the dashboard KPIs',
    'Monthly revenue vs expenses',
    'Key business metrics overview',
  ],
  sales: [
    'How does the sales workflow work?',
    'Show today\'s sales',
    'Compare this month to last month',
    'Which products are selling fastest?',
    'Show unpaid invoices',
    'Sales performance by customer',
  ],
  inventory: [
    'How does inventory management work?',
    'Show low stock items',
    'Inventory value summary',
    'Stock movement this week',
    'Fast moving products',
    'Slow moving products',
  ],
  manufacturing: [
    'How does the production workflow work?',
    'Show production status',
    'Low stock raw materials',
    'Production cost analysis',
    'Batch traceability summary',
    'Quality control status',
  ],
  accounts: [
    'How does the accounting workflow work?',
    'Show cash position',
    'Unpaid invoices summary',
    'Overdue supplier bills',
    'Profit and loss overview',
    'Aging report summary',
  ],
  finance: [
    'Explain financial statements',
    'Show cash position',
    'Profit and loss overview',
    'Balance sheet summary',
    'Expense breakdown',
    'Revenue analysis',
  ],
  crm: [
    'How does the CRM workflow work?',
    'Find a customer',
    'Customer purchase history',
    'Outstanding customer invoices',
    'Recent customer payments',
    'Sales opportunities',
  ],
  procurement: [
    'How does procurement work?',
    'Purchase order status',
    'Supplier performance',
    'Pending deliveries',
    'Procurement spend summary',
    'Low stock alerts',
  ],
  hr: [
    'How does HR management work?',
    'Leave balance summary',
    'Attendance today',
    'Payroll overview',
    'Employee performance',
    'Headcount summary',
  ],
  reports: [
    'Explain the reports page',
    'Executive dashboard summary',
    'Department performance overview',
    'Revenue vs expenses trend',
    'Inventory turnover analysis',
    'Manufacturing efficiency report',
  ],
  settings: [
    'How do I configure the ERP?',
    'System health overview',
    'User activity summary',
    'Integration status',
    'Recent audit events',
    'System configuration summary',
  ],
  email: [
    'Email delivery status',
    'Recent sent emails',
    'Email delivery rate',
    'Failed email summary',
    'Email activity by module',
  ],
  analytics: [
    'Explain the analytics charts',
    'Compare departments',
    'Trend analysis',
    'Forecast overview',
    'Performance comparison',
  ],
};

const DEFAULT_PROMPTS = [
  'How does the ERP work?',
  'What requires attention today?',
  'Show me a business summary',
  'Explain the workflow from quotation to payment',
  'What reports should I review?',
];

const NAVIGATION_MAP = {
  dashboard: 'dashboard',
  sales: 'sales',
  inventory: 'inventory',
  manufacturing: 'production',
  production: 'production',
  finance: 'finance',
  accounts: 'accounts',
  crm: 'customers',
  procurement: 'purchasing',
  purchasing: 'purchasing',
  hr: 'hr',
  reports: 'reports',
  settings: 'settings',
  email: 'email',
  analytics: 'analytics',
};

export default function AIAssistant({ currentModule, user, onNavigate }) {
  const [open, setOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ai-copilot-open')) || false; } catch { return false; }
  });
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ai-copilot-history')) || []; } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [lastActions, setLastActions] = useState([]);
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [expandedChecklist, setExpandedChecklist] = useState(null);

  useEffect(() => { localStorage.setItem('ai-copilot-open', JSON.stringify(open)); }, [open]);
  useEffect(() => { localStorage.setItem('ai-copilot-history', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamText]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setStreaming(true);
    setStreamText('');
    setLastActions([]);

    try {
      const history = newMessages.slice(-10).map(m => ({ role: m.role, content: m.content }));
      const response = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMsg.content, module: currentModule, history, user: { id: user?.id, name: user?.name, role: user?.role }, stream: true }),
      });

      if (!response.ok) throw new Error('Failed to get AI response');

      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let done = false;
        while (!done) {
          const { value, done: d } = await reader.read();
          done = d;
          if (value) {
            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.chunk) { fullText += data.chunk; setStreamText(fullText); }
                  if (data.done) {
                    fullText = data.reply || fullText;
                    setLastActions(data.suggestedActions || []);
                  }
                } catch { /* ignore parse errors */ }
              }
            }
          }
        }
        const aiMsg = { role: 'assistant', content: fullText, timestamp: new Date().toISOString(), actions: lastActions };
        setMessages(prev => [...prev, aiMsg]);
        setStreamText('');
      } else {
        const data = await response.json();
        const aiMsg = { role: 'assistant', content: data.reply || 'No response received.', timestamp: new Date().toISOString(), actions: data.suggestedActions || [] };
        setMessages(prev => [...prev, aiMsg]);
        setLastActions(data.suggestedActions || []);
      }
    } catch (err) {
      const errMsg = { role: 'assistant', content: `Error: ${err.message}. Please try again.`, timestamp: new Date().toISOString(), isError: true };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  }, [input, messages, currentModule, user, loading, lastActions]);

  const handleKeyDown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const clearConversation = () => { setMessages([]); setStreamText(''); setLastActions([]); setShowConfirmClear(false); setExpandedChecklist(null); };
  const copyToClipboard = text => navigator.clipboard.writeText(text);

  const handleAction = (action) => {
    if (action.type === 'navigate' && action.path && onNavigate) {
      onNavigate(NAVIGATION_MAP[action.path] || action.path);
    }
    if (action.type === 'checklist') {
      setExpandedChecklist(expandedChecklist === action.label ? null : action.label);
    }
  };

  const suggested = MODULE_PROMPTS[currentModule] || DEFAULT_PROMPTS;
  const moduleLabel = (currentModule || 'dashboard').toUpperCase();

  return (
    <>
      <button className="ai-fab" title="ERP Copilot" onClick={() => setOpen(o => !o)} aria-label="ERP Copilot">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v14a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
          <path d="M12 8v4"/><path d="M12 16h.01"/>
        </svg>
      </button>

      <div className={`ai-panel ${open ? 'open' : ''}`}>
        <header className="ai-header">
          <div className="ai-header-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v14a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M12 8v4"/><path d="M12 16h.01"/>
            </svg>
            <div>
              <h3>ERP Copilot</h3>
              <span className="ai-module">{moduleLabel}</span>
            </div>
          </div>
          <div className="ai-header-actions">
            <button onClick={() => messages.length > 0 ? setShowConfirmClear(true) : {}} title={messages.length > 0 ? 'Clear conversation' : 'No conversation to clear'} disabled={messages.length === 0} className="ai-action-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
            <button onClick={() => setOpen(false)} title="Close panel" className="ai-action-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </header>

        {showConfirmClear && (
          <div className="ai-confirm-bar">
            <span>Clear this conversation?</span>
            <button onClick={clearConversation} className="ai-confirm-yes">Clear</button>
            <button onClick={() => setShowConfirmClear(false)} className="ai-confirm-no">Cancel</button>
          </div>
        )}

        <div className="ai-conversation">
          {messages.length === 0 && !loading && (
            <div className="ai-welcome">
              <div className="ai-welcome-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2a3 3 0 0 0-3 3v14a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
              </div>
              <h4>How can I help you today?</h4>
              <p>I can explain ERP workflows, guide you through tasks, analyze your data, interpret reports, troubleshoot issues, and recommend improvements.</p>
              <div className="ai-suggestions">
                {suggested.map((p, i) => (
                  <button key={i} className="ai-chip" onClick={() => { setInput(p); }}>{p}</button>
                ))}
              </div>
              <div className="ai-capabilities">
                <div className="ai-cap-item"><span className="ai-cap-dot"/>Explain workflows</div>
                <div className="ai-cap-item"><span className="ai-cap-dot"/>Navigate the ERP</div>
                <div className="ai-cap-item"><span className="ai-cap-dot"/>Analyze reports</div>
                <div className="ai-cap-item"><span className="ai-cap-dot"/>Troubleshoot errors</div>
                <div className="ai-cap-item"><span className="ai-cap-dot"/>Guide step-by-step</div>
                <div className="ai-cap-item"><span className="ai-cap-dot"/>Recommend actions</div>
              </div>
              <div className="ai-disclaimer">
                <span>Advisory mode</span> — I explain, guide, and recommend. I never modify data without your explicit action.
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`ai-message ${msg.role} ${msg.isError ? 'error' : ''}`}>
              <div className="ai-message-header">
                {msg.role === 'assistant' ? (
                  <span className="ai-badge">Copilot</span>
                ) : (
                  <span className="ai-badge user">You</span>
                )}
                <span className="ai-timestamp">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="ai-message-body">
                {msg.content.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
              {msg.role === 'assistant' && (
                <div className="ai-message-tools">
                  <button onClick={() => copyToClipboard(msg.content)} title="Copy response">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    Copy
                  </button>
                  <button onClick={() => { setInput(messages[idx - 1]?.content || ''); }} title="Regenerate response">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                    Regenerate
                  </button>
                </div>
              )}
              {/* Suggested Actions */}
              {msg.role === 'assistant' && msg.actions && msg.actions.length > 0 && (
                <div className="ai-actions">
                  {msg.actions.map((action, ai) => (
                    <div key={ai} className={`ai-action-card ${action.type}`}>
                      {action.type === 'navigate' && (
                        <button className="ai-action-nav" onClick={() => handleAction(action)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                          <span>{action.label}</span>
                        </button>
                      )}
                      {action.type === 'checklist' && (
                        <div className="ai-action-checklist">
                          <button className="ai-action-checklist-header" onClick={() => handleAction(action)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                            <span>{action.label}</span>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={expandedChecklist === action.label ? 'rotated' : ''}><polyline points="6 9 12 15 18 9"/></svg>
                          </button>
                          {expandedChecklist === action.label && action.steps && (
                            <ol className="ai-checklist-steps">
                              {action.steps.map((step, si) => (
                                <li key={si}><span className="ai-checklist-num">{si + 1}</span>{step}</li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                      {action.type === 'insight' && (
                        <button className="ai-action-insight" onClick={() => handleAction(action)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
                          <span>{action.label}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {streaming && streamText && (
            <div className="ai-message assistant">
              <div className="ai-message-header"><span className="ai-badge">Copilot</span><span className="ai-timestamp">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
              <div className="ai-message-body"><p>{streamText}</p><span className="ai-cursor">|</span></div>
            </div>
          )}

          {loading && !streamText && (
            <div className="ai-message assistant">
              <div className="ai-message-header"><span className="ai-badge">Copilot</span></div>
              <div className="ai-typing">
                <span className="ai-dot" /><span className="ai-dot" /><span className="ai-dot" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <footer className="ai-input-area">
          <div className="ai-input-wrapper">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Ask about workflows, reports, data, navigation, troubleshooting, or any ERP topic..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={2000}
              disabled={loading}
            />
            <div className="ai-input-bar">
              <span className="ai-char-count">{input.length}/2000</span>
              <button onClick={sendMessage} disabled={loading || !input.trim()} className="ai-send-btn" title="Send message">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg>
              </button>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
