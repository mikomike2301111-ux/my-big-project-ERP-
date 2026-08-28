import React, { useState, useEffect, useRef, useCallback } from 'react';
import './AIAssistant.css';

/* FarmTrack AI Assistant — performance-tuned: history 8, tokens 2048, localStorage 30, fixed stream actions */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '\u0026amp;')
    .replace(/</g, '\u0026lt;')
    .replace(/>/g, '\u0026gt;')
    .replace(/"/g, '\u0026quot;')
    .replace(/'/g, '\u0026#39;');
}

function renderMarkdown(text) {
  if (!text) return '';
  let t = escapeHtml(text);
  t = t.replace(/[\u{1F000}-\u{1FAFF}]/gu, '').replace(/[\u{2600}-\u{27BF}]/gu, '');
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/^\s*([-_*~])\1{2,}\s*$/gm, '');
  const blocks = t.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  return blocks.map(block => {
    if (/^[-*]\s+/m.test(block) && block.split('\n').every(l => /^[-*]\s+/.test(l.trim()) || !l.trim())) {
      const items = block.split('\n').filter(l => l.trim()).map(l => `<li>${l.replace(/^[-*]\s+/, '')}</li>`).join('');
      return `<ul>${items}</ul>`;
    }
    let para = block.replace(/\n/g, ' ');
    para = para.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
    return `<p>${para}</p>`;
  }).join('');
}

const MODULE_PROMPTS = {
  dashboard: ['Show me today\'s business summary', 'What requires attention today?', 'Explain the dashboard KPIs'],
  sales: ['How does the sales workflow work?', 'Show unpaid invoices'],
  inventory: ['Show low stock items', 'Inventory value summary'],
  manufacturing: ['How does the production workflow work?', 'Show production status'],
  production: ['How does the production workflow work?', 'Show production status'],
  accounts: ['Show cash position', 'Unpaid invoices summary'],
  finance: ['Profit and loss overview', 'Show cash position'],
  crm: ['Find a customer', 'Outstanding customer invoices'],
  customers: ['Find a customer', 'Outstanding customer invoices'],
  hr: ['Leave balance summary', 'Attendance today'],
  reports: ['Executive dashboard summary', 'Revenue vs expenses trend'],
  notifications: ['What alerts need attention now?', 'Summarise critical notifications'],
};
const DEFAULT_PROMPTS = ['How does the ERP work?', 'What requires attention today?', 'Show me a business summary'];
const NAVIGATION_MAP = { dashboard: 'dashboard', sales: 'sales', inventory: 'inventory', manufacturing: 'production', production: 'production', finance: 'finance', accounts: 'accounts', crm: 'customers', customers: 'customers', hr: 'hr', reports: 'reports', settings: 'settings', notifications: 'notifications' };
const MODULE_LABELS = { dashboard: 'Dashboard', sales: 'Sales', inventory: 'Inventory', manufacturing: 'Manufacturing', production: 'Manufacturing', finance: 'Finance', accounts: 'Accounts', crm: 'CRM', customers: 'CRM', hr: 'HR', reports: 'Reports', settings: 'Settings', notifications: 'Notifications' };

export default function AIAssistant({ currentModule, user, onNavigate }) {
  const [open, setOpen] = useState(() => { try { return JSON.parse(localStorage.getItem('ai-copilot-open')) || false; } catch { return false; } });
  const [messages, setMessages] = useState(() => { try { return JSON.parse(localStorage.getItem('ai-copilot-history')) || []; } catch { return []; } });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [lastActions, setLastActions] = useState([]);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [expandedChecklist, setExpandedChecklist] = useState(null);
  const [feedbackMap, setFeedbackMap] = useState(() => { try { return JSON.parse(localStorage.getItem('ai-copilot-feedback')) || {}; } catch { return {}; } });
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => { localStorage.setItem('ai-copilot-open', JSON.stringify(open)); }, [open]);
  useEffect(() => {
    const capped = Array.isArray(messages) ? messages.slice(-30) : [];
    localStorage.setItem('ai-copilot-history', JSON.stringify(capped));
  }, [messages]);
  useEffect(() => { localStorage.setItem('ai-copilot-feedback', JSON.stringify(feedbackMap)); }, [feedbackMap]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamText]);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input.trim().slice(0, 2000), timestamp: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setStreaming(true);
    setStreamText('');
    setLastActions([]);
    let streamActions = [];
    try {
      const history = newMessages.slice(-8).map(m => ({ role: m.role, content: String(m.content || '').slice(0, 2000) }));
      const response = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userMsg.content,
          module: currentModule,
          history,
          user: { id: user?.id, name: user?.name, role: user?.role },
          stream: true,
          maxTokens: 2048,
        }),
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
            for (const line of text.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.chunk) { fullText += data.chunk; setStreamText(fullText); }
                  if (data.done) {
                    fullText = data.reply || fullText;
                    streamActions = data.suggestedActions || [];
                    setLastActions(streamActions);
                  }
                } catch { /* ignore */ }
              }
            }
          }
        }
        const aiMsg = { role: 'assistant', content: fullText, timestamp: new Date().toISOString(), actions: streamActions };
        setMessages(prev => [...prev, aiMsg]);
        setStreamText('');
      } else {
        const data = await response.json();
        const aiMsg = { role: 'assistant', content: data.reply || 'No response received.', timestamp: new Date().toISOString(), actions: data.suggestedActions || [] };
        setMessages(prev => [...prev, aiMsg]);
        setLastActions(data.suggestedActions || []);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}. Please try again.`, timestamp: new Date().toISOString(), isError: true }]);
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  }, [input, messages, currentModule, user, loading]);

  const handleKeyDown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const clearConversation = () => { setMessages([]); setStreamText(''); setLastActions([]); setShowConfirmClear(false); setExpandedChecklist(null); };
  const copyToClipboard = text => navigator.clipboard.writeText(text);
  const handleAction = (action) => {
    if (action.type === 'navigate' && action.path && onNavigate) onNavigate(NAVIGATION_MAP[action.path] || action.path);
    if (action.type === 'checklist') setExpandedChecklist(expandedChecklist === action.label ? null : action.label);
  };
  const suggested = MODULE_PROMPTS[currentModule] || DEFAULT_PROMPTS;
  const moduleLabel = MODULE_LABELS[currentModule] || (currentModule || 'Dashboard').toUpperCase();
  const isNewChat = messages.length === 0 && !loading && !streaming;

  return (
    <>
      <button className={`ai-fab ${open ? 'hidden' : ''}`} title="Ask AI" onClick={() => setOpen(o => !o)} aria-label="FarmTrack AI Assistant">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      </button>
      <div className={`ai-panel ${open ? 'open' : ''}`}>
        <header className="ai-header">
          <div className="ai-header-title"><h3>FarmTrack AI Assistant</h3><div className="ai-header-status"><span className="online-dot" /><span className="ai-module">{moduleLabel}</span></div></div>
          <div className="ai-header-actions">
            <button onClick={() => (messages.length > 0 ? setShowConfirmClear(true) : clearConversation())} title="New chat">New</button>
            <button onClick={() => setOpen(false)} title="Close">Close</button>
          </div>
        </header>
        {showConfirmClear && (
          <div className="ai-confirm-bar"><span>Clear this conversation?</span><button onClick={clearConversation} className="ai-confirm-yes">Clear</button><button onClick={() => setShowConfirmClear(false)} className="ai-confirm-no">Cancel</button></div>
        )}
        <div className="ai-conversation">
          {isNewChat && (
            <div className="ai-welcome">
              <h4>How can I help you today?</h4>
              <p>I explain workflows, guide tasks, and use live page data. Guide only — I do not change data.</p>
              <div className="ai-suggestions">{suggested.map((p, i) => <button key={i} className="ai-chip" onClick={() => setInput(p)}>{p}</button>)}</div>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`ai-message ${msg.role} ${msg.isError ? 'error' : ''}`}>
              <div className="ai-message-header"><span className={`ai-badge ${msg.role === 'user' ? 'user' : ''}`}>{msg.role === 'assistant' ? 'Assistant' : 'You'}</span></div>
              <div className="ai-message-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
              {msg.role === 'assistant' && <div className="ai-message-tools"><button onClick={() => copyToClipboard(msg.content)}>Copy</button></div>}
              {msg.role === 'assistant' && msg.actions && msg.actions.length > 0 && (
                <div className="ai-actions">{msg.actions.map((action, ai) => (
                  <div key={ai} className={`ai-action-card ${action.type}`}>
                    {action.type === 'navigate' && <button className="ai-action-nav" onClick={() => handleAction(action)}>{action.label}</button>}
                    {action.type === 'insight' && <button className="ai-action-insight" onClick={() => handleAction(action)}>{action.label}</button>}
                  </div>
                ))}</div>
              )}
            </div>
          ))}
          {streaming && streamText && (
            <div className="ai-message assistant"><div className="ai-message-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(streamText) + '<span class="ai-cursor">|</span>' }} /></div>
          )}
          {loading && !streamText && <div className="ai-message assistant"><div className="ai-typing-label">Assistant is thinking</div></div>}
          <div ref={messagesEndRef} />
        </div>
        <footer className="ai-input-area">
          <div className="ai-input-wrapper">
            <textarea ref={textareaRef} rows={1} placeholder="Ask for guidance on this page…" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} maxLength={2000} disabled={loading} />
            <div className="ai-input-bar"><span className="ai-char-count">{input.length}/2000</span><button onClick={sendMessage} disabled={loading || !input.trim()} className="ai-send-btn">Send</button></div>
          </div>
        </footer>
      </div>
    </>
  );
}
