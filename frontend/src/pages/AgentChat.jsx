// AgentChat.jsx — A chat interface where users can ask questions about their
// finances in plain English. Powered by an LLM agent (or a fallback intent system).
import { useState, useRef, useEffect } from 'react'
import { api } from '../services/api'
import { Send, Bot, User, Zap, RotateCcw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

// Suggested questions shown as clickable buttons when the chat is empty
const SUGGESTIONS = [
  "What's my current balance?",
  "How much did I spend this week?",
  "Forecast my spend for next week",
  "What number did I buy airtime for most?",
  "Who sent my highest credit alert?",
  "How much did I spend on transfers?",
  "Any unusual transactions?",
  "What was my biggest single debit?",
]

export default function AgentChat({ userId, sinceDate, untilDate }) {
  // ── State ─────────────────────────────────────────────────────────────
  // messages: the chat history, each with a role ('user' | 'assistant') and content
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "I'm Mirror — your financial intelligence layer. Ask me anything about your money.",
      tool_calls: []
    }
  ])
  const [input, setInput] = useState('')          // what the user is currently typing
  const [loading, setLoading] = useState(false)    // true while waiting for agent response
  const [modelUsed, setModelUsed] = useState(null) // the model/agent that handled the last response
  const bottomRef = useRef(null)                   // auto-scroll to newest message

  // Auto-scroll to the bottom whenever a new message arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Convert the messages array into the format the backend API expects
  // (skipping the first assistant message — that's just the greeting)
  const buildHistory = () =>
    messages
      .filter(m => m.role !== 'assistant' || messages.indexOf(m) !== 0)
      .map(m => ({ role: m.role, content: m.content }))

  // Send a message to the agent. Tries the full LLM (v1) first, then
  // falls back to the intent-based agent (v2) if v1 fails.
  const send = async (text) => {
    const userMsg = text || input.trim()
    if (!userMsg || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    try {
      // Try v1 (full LLM-powered agent) first
      const res = await api.chat(userId, userMsg, buildHistory(), sinceDate, untilDate)
      if (res.success) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: res.response,
          tool_calls: res.tool_calls_made || []
        }])
        setModelUsed(res.model_used)
        setLoading(false)
        return
      }
    } catch (err) {
      // v1 failed — fall through to v2
    }

    // Fall back to v2 (intent-based, no LLM needed)
    try {
      const res = await api.chatV2(userId, userMsg, buildHistory(), sinceDate, untilDate)
      if (res.success) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: res.response,
          tool_calls: []
        }])
        setModelUsed('intent-agent')
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Something went wrong. Try again.',
          tool_calls: []
        }])
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Could not reach the agent. Is the backend running?',
        tool_calls: []
      }])
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setMessages([{
      role: 'assistant',
      content: "Fresh start. What do you want to know?",
      tool_calls: []
    }])
    setModelUsed(null)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] sm:h-[calc(100vh-200px)] max-w-3xl mx-auto px-0 sm:px-0">

      {/* Header: title, model status indicator, and reset button */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tighter uppercase italic">Ask Mirror</h1>
          <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1">
            Ask anything in plain English · {modelUsed ? <span className="text-indigo-400">{modelUsed}</span> : 'ready'}
          </p>
        </div>
        <button onClick={reset} className="p-1.5 sm:p-2 rounded-xl hover:bg-white/5 transition-colors shrink-0">
          <RotateCcw size={14} className="text-slate-500" />
        </button>
      </div>

      {/* Clickable suggestion buttons — shown only when chat is empty */}
      {messages.length === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 mb-4 sm:mb-6">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => send(s)}
              className="text-left px-3 sm:px-4 py-2.5 sm:py-3 bg-white/5 border border-white/5 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs text-slate-400 hover:bg-white/10 hover:text-white transition-all"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Messages: the chat thread — user messages on right, assistant on left */}
      <div className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 pr-1 sm:pr-2 pb-24">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 sm:gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex-shrink-0 flex items-center justify-center ${
              msg.role === 'assistant'
                ? 'bg-indigo-600 shadow-lg shadow-indigo-600/20'
                : 'bg-white/10'
            }`}>
              {msg.role === 'assistant'
                ? <Bot size={10} className="text-white" />
                : <User size={10} className="text-slate-300" />
              }
            </div>

            <div className={`max-w-[85%] sm:max-w-[80%] space-y-1.5 sm:space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
              {/* Tool calls badge */}
              {msg.tool_calls?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {msg.tool_calls.map((tc, j) => (
                    <span key={j} className="flex items-center gap-1 text-[8px] sm:text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 sm:px-2 py-0.5 rounded-full font-mono">
                      <Zap size={6} />
                      {tc.tool}
                    </span>
                  ))}
                </div>
              )}

              {/* Message bubble */}
              <div className={`px-3 sm:px-5 py-2 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm leading-relaxed ${
                msg.role === 'assistant'
                  ? 'bg-[#0a0c10] border border-white/5 text-slate-200'
                  : 'bg-indigo-600 text-white'
              }`}>
                {msg.role === 'assistant' ? (
                  <ReactMarkdown
                    components={{
                      ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-1">{children}</ol>,
                      li: ({ children }) => <li className="text-slate-200">{children}</li>,
                      strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
                      p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                      code: ({ children }) => <code className="bg-white/5 px-1 py-0.5 rounded text-[11px] font-mono text-indigo-300">{children}</code>,
                    }}
                  >{msg.content}</ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Loading */}
        {loading && (
          <div className="flex gap-2 sm:gap-3">
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <Bot size={10} className="text-white" />
            </div>
            <div className="px-3 sm:px-5 py-3 sm:py-4 bg-[#0a0c10] border border-white/5 rounded-xl sm:rounded-2xl">
              <div className="flex gap-1 sm:gap-1.5">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-indigo-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input: text field + send button, supports Enter key to submit */}
      <div className="mt-3 sm:mt-4 flex gap-2 sm:gap-3">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="e.g. Who sent me the most money? What number gets airtime from me?"
          className="flex-1 bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl px-4 sm:px-5 py-3 sm:py-4 text-white text-xs sm:text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
          disabled={loading}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-600 rounded-xl sm:rounded-2xl flex items-center justify-center hover:bg-indigo-700 disabled:opacity-30 transition-all active:scale-95 flex-shrink-0 self-end"
        >
          <Send size={12} className="text-white" />
        </button>
      </div>
    </div>
  )
}