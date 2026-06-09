import { useState, useRef, useEffect } from 'react'
import { api } from '../services/api'
import { Send, Bot, User, Zap, RotateCcw } from 'lucide-react'

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

export default function AgentChat({ userId }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "I'm Mirror — your financial intelligence layer. Ask me anything about your money.",
      tool_calls: []
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [modelUsed, setModelUsed] = useState(null)
  const bottomRef = useRef(null)

  // Scroll smoothly to bottom on message updates or loading state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Build history cleanly using the native index argument to prevent indexOf string-matching bugs
  const buildHistory = () =>
    messages
      .filter((_, idx) => idx !== 0) 
      .map(m => ({ role: m.role, content: m.content }))

  const send = async (text) => {
    // Deduplicate fast entries early
    if (loading) return;

    const userMsg = (text || input).trim()
    if (!userMsg) return

    // Clear input instantly before processing the async payload execution chain
    setInput('')
    setLoading(true)
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])

    try {
      const historyPayload = buildHistory()
      const res = await api.chat(userId, userMsg, historyPayload)
      
      if (res.success) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: res.response,
          tool_calls: res.tool_calls_made || []
        }])
        setModelUsed(res.model_used)
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
          tool_calls: []
        }])
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Could not reach the agent. Please check if the financial service backend is active.',
        tool_calls: []
      }])
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    if (loading) return
    setMessages([
      {
        role: 'assistant',
        content: "Fresh start. What do you want to know?",
        tool_calls: []
      }
    ])
    setModelUsed(null)
  }

  // Preserve suggestions on screen while the initial user request is pending
  const showSuggestions = messages.length === 1 || (messages.length === 2 && loading)

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] sm:h-[calc(100vh-120px)] max-w-3xl mx-auto px-4 sm:px-0">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6 border-b border-white/5 pb-4 shrink-0">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tighter uppercase italic">Ask Mirror</h1>
          <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">
            Ask anything in plain English · {modelUsed ? <span className="text-indigo-400 font-mono">{modelUsed}</span> : 'Ready'}
          </p>
        </div>
        <button 
          onClick={reset} 
          disabled={loading}
          className="p-2 rounded-xl hover:bg-white/5 transition-colors shrink-0 disabled:opacity-20 disabled:hover:bg-transparent"
          title="Reset Conversation"
        >
          <RotateCcw size={16} className="text-slate-400" />
        </button>
      </div>

      {/* Messages Window */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-white/10">
        
        {/* Render Chat Messages */}
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 sm:gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            
            {/* Avatar Framework */}
            <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex-shrink-0 flex items-center justify-center border ${
              msg.role === 'assistant'
                ? 'bg-indigo-600 border-indigo-500 shadow-lg shadow-indigo-600/10'
                : 'bg-white/5 border-white/10'
            }`}>
              {msg.role === 'assistant'
                ? <Bot size={12} className="text-white" />
                : <User size={12} className="text-slate-300" />
              }
            </div>

            <div className={`max-w-[85%] sm:max-w-[75%] space-y-1.5 flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              
              {/* Contextual LLM Tool Hooks Badge Layer */}
              {msg.tool_calls?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-0.5">
                  {msg.tool_calls.map((tc, j) => (
                    <span key={j} className="flex items-center gap-1 text-[9px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-mono">
                      <Zap size={8} className="animate-pulse" />
                      {tc.tool}
                    </span>
                  ))}
                </div>
              )}

              {/* Message Bubble Block */}
              <div className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === 'assistant'
                  ? 'bg-[#0a0c10] border border-white/5 text-slate-200'
                  : 'bg-indigo-600 text-white rounded-tr-none'
              }`}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {/* Loading Indicator Wave */}
        {loading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex gap-2 sm:gap-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-indigo-600 border border-indigo-500 flex items-center justify-center flex-shrink-0">
              <Bot size={12} className="text-white" />
            </div>
            <div className="px-4 py-3 bg-[#0a0c10] border border-white/5 rounded-2xl flex items-center">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div 
                    key={i} 
                    className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 150}ms`, animationDuration: '0.6s' }} 
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Context Suggestions Mount Point */}
        {showSuggestions && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 animate-fadeIn">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => send(s)}
                disabled={loading}
                className="text-left px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl text-xs text-slate-400 hover:bg-white/5 hover:border-white/10 hover:text-slate-200 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Control Input Dock */}
      <div className="mt-4 flex gap-2 sm:gap-3 bg-[#05070a] pt-2 pb-4 shrink-0">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Ask Mirror about balances, trends, or unusual spikes..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs sm:text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
          disabled={loading}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          className="w-10 h-10 sm:w-11 sm:h-11 bg-indigo-600 rounded-xl flex items-center justify-center hover:bg-indigo-700 disabled:opacity-20 transition-all active:scale-95 shrink-0"
        >
          <Send size={14} className="text-white" />
        </button>
      </div>
    </div>
  )
}
