import React, { useState, useEffect, useRef } from 'react';
import './AIAssistant.css';

// Simple mapping of module => suggested prompts
const MODULE_PROMPTS = {
  dashboard: [
    "Show today's sales",
    "Show unpaid invoices",
    "Inventory below reorder level",
    "Attendance summary",
    "Payroll summary",
    "Procurement report",
    "Monthly revenue",
    "Explain this dashboard",
    "What requires attention today?"
  ],
  manufacturing: [
    "Show low‑stock raw materials",
    "Show fast‑moving products",
    "Show slow‑moving products",
    "Purchase recommendations",
    "Explain production status"
  ],
  accounts: [
    "Show unpaid invoices",
    "Show overdue supplier bills",
    "Summarize cash position",
    "Explain profit & loss"
  ],
  crm: [
    "Find a customer",
    "Show purchase history",
    "Outstanding invoices",
    "Recent payments",
    "Related opportunities"
  ],
  inventory: [
    "Low stock items",
    "Fast moving products",
    "Stock movement last week",
    "Purchase recommendations"
  ],
  hr: [
    "Leave balance for John",
    "Attendance today",
    "Performance summary",
    "Payroll history"
  ]
};

export default function AIAssistant({ currentModule }) {
  const [open, setOpen] = useState(() => {
    // persist open/closed state across navigation
    try {
      return JSON.parse(localStorage.getItem('ai-assistant-open')) || false;
    } catch { return false; }
  });
  const [messages, setMessages] = useState([]); // {role:'user'|'assistant', text:string}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef(null);

  // Save open state
  useEffect(() => {
    localStorage.setItem('ai-assistant-open', JSON.stringify(open));
  }, [open]);

  // Auto‑expand textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = { role: 'user', text: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      // Placeholder: call a real AI endpoint later
      const response = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMsg.text, module: currentModule })
      });
      const data = await response.json();
      const aiMsg = { role: 'assistant', text: data.reply || 'I could not fetch an answer right now.' };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      const errMsg = { role: 'assistant', text: 'Sorry, I ran into an error.' };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setInput('');
  };

  const suggested = MODULE_PROMPTS[currentModule] || MODULE_PROMPTS.dashboard;

  return (
    <>
      {/* Floating AI button */}
      <button
        className="ai-fab"
        title="Ask AI"
        onClick={() => setOpen(o => !o)}
        aria-label="Ask AI"
      >
        🤖
      </button>

      {/* Slide‑out panel */}
      <div className={`ai-panel ${open ? 'open' : ''}`}>
        <header className="ai-header">
          <h3>AI Assistant</h3>
          <span className="module-name">{currentModule?.toUpperCase() || ''}</span>
          <button onClick={clearConversation} className="ai-action" title="Clear Conversation">🗑️</button>
          <button onClick={() => setOpen(false)} className="ai-action" title="Close">✖️</button>
        </header>

        <div className="ai-conversation">
          {messages.length === 0 && (
            <div className="ai-suggestions">
              {suggested.map((p, i) => (
                <button
                  key={i}
                  className="ai-chip"
                  onClick={() => setInput(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`ai-bubble ${msg.role}`}>
              <p>{msg.text}</p>
              {msg.role === 'assistant' && (
                <div className="ai-tools">
                  <button onClick={() => navigator.clipboard.writeText(msg.text)} title="Copy">📋</button>
                  <button title="Regenerate" onClick={async () => {
                    // simple re‑ask same query
                    setMessages(prev => prev.slice(0, idx));
                    setInput(messages[idx - 1]?.text || '');
                  }}>🔄</button>
                  <button title="Like">👍</button>
                  <button title="Dislike">👎</button>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="ai-bubble assistant typing">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          )}
        </div>

        <footer className="ai-input-area">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="Ask about employees, sales, inventory, invoices, payroll, reports, customers, suppliers or anything related to your business..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={1000}
          />
          <div className="ai-input-tools">
            <span className="char-count">{input.length}/1000</span>
            <button onClick={sendMessage} disabled={loading || !input.trim()} className="send-btn">▶️</button>
          </div>
        </footer>
      </div>
    </>
  );
}
