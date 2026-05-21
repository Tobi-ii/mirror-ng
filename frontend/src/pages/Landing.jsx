import React, { useState, useEffect } from 'react'
import { Shield, Zap, Github, Mail, Database, Lock, Clock, ChevronRight } from 'lucide-react'

export function Landing({ onLogin }) {
  const [isLoading, setIsLoading] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [provider, setProvider] = useState('gmail')
  const [subSlide, setSubSlide] = useState(0)
  const [isIntroActive, setIsIntroActive] = useState(true)

  useEffect(() => {
    const layoutTimer = setTimeout(() => {
      setIsIntroActive(false)
    }, 4000)

    const slideTimer = setInterval(() => {
      setSubSlide(prev => (prev === 0 ? 1 : 0))
    }, 10000)

    return () => {
      clearTimeout(layoutTimer)
      clearInterval(slideTimer)
    }
  }, [])

  const handleMockLogin = (selectedProvider) => {
    setProvider(selectedProvider)
    setIsLoading(true)
    setTimeout(() => {
      const mockUser = { user_id: 'mock_user_' + Date.now(), email: 'user@example.com', name: 'Test User' }
      onLogin(mockUser, { access_token: 'mock_access_token' })
      setIsLoading(false)
    }, 1500)
  }

  return (
    <div className="h-screen bg-[#050608] overflow-hidden flex flex-col select-none text-white font-sans">
      
      {/* ── HEADER ────────────────────────────────────────────────────── */}
      <header className="h-16 border-b border-white/[0.03] bg-[#050608]/80 backdrop-blur-xl px-10 flex items-center justify-between z-20 shrink-0">
        <div className="flex flex-col">
          <h1 className="font-black tracking-tighter text-xl leading-tight">
            mirror<span className="text-indigo-500">.ng</span>
          </h1>
          <span className="text-[9px] text-slate-400 font-black uppercase tracking-[0.15em]">
            A financial project by Tobiii
          </span>
        </div>

        <a href="https://github.com/mirror-ng/mirror-ng" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-all text-[11px] bg-white/[0.03] px-5 py-2.5 rounded-xl border border-white/[0.05] font-bold">
          <Github size={14} /> View on GitHub
        </a>
      </header>

      {/* ── MAIN CONTENT ──────────────────────────────────────────────── */}
      <main className="flex-1 relative max-w-7xl mx-auto w-full px-10 flex items-center min-h-0">
        
        <div className="grid grid-cols-1 md:grid-cols-12 w-full items-center gap-12 transition-all [transition-duration:1200ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]">
          
          {/* LEFT COLUMN */}
          <div className={`flex flex-col items-center text-center mx-auto w-full transition-all [transition-duration:1200ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]
            ${isIntroActive ? 'md:col-span-12 max-w-2xl' : 'md:col-span-7 max-w-xl'}`}>
            
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-indigo-500/10 rounded-full px-5 py-2.5 border border-indigo-500/20 mb-4 scale-100">
              <Shield size={14} className="text-indigo-400" />
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-wider">Open Source · Privacy First</span>
            </div>

            {/* Brand */}
            <h2 className={`font-black tracking-tighter leading-none mb-4 transition-all [transition-duration:1200ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]
              ${isIntroActive ? 'text-8xl md:text-[7rem]' : 'text-6xl md:text-7xl'}`}>
              mirror<span className="text-indigo-500">.ng</span>
            </h2>
            
            {/* Subtitle */}
            <p className={`text-slate-400 leading-relaxed mb-2 transition-all [transition-duration:1200ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] mx-auto
              ${isIntroActive ? 'text-xl max-w-xl' : 'text-lg max-w-md'}`}>
              Your financial mirror across all Nigerian banks. No API needed.
            </p>
            <p className="text-white text-2xl font-black tracking-tight mb-8">
              Just your email alerts.
            </p>

            {/* Trust indicators */}
            <div className="flex items-center justify-center gap-6 mb-8 text-slate-600 w-full">
              <div className="flex items-center gap-2">
                <Lock size={12} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Non-Custodial</span>
              </div>
              <div className="w-[1px] h-4 bg-white/10" />
              <div className="flex items-center gap-2">
                <Zap size={12} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Instant Sync</span>
              </div>
              <div className="w-[1px] h-4 bg-white/10" />
              <div className="flex items-center gap-2">
                <Database size={12} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Local Only</span>
              </div>
            </div>

            {/* Auth buttons */}
            <div className="w-full max-w-md flex flex-col gap-4 items-center mx-auto">
              {!showEmailForm ? (
                <>
                  <button 
                    onClick={() => handleMockLogin('gmail')} 
                    disabled={isLoading}
                    className="group bg-white text-black hover:bg-slate-100 w-full h-14 rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-2xl shadow-white/5 cursor-pointer"
                  >
                    {isLoading && provider === 'gmail' ? (
                      <div className="w-5 h-5 border-[3px] border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                      <Mail size={18} />
                    )}
                    Continue with Gmail
                    <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform text-slate-400 ml-1" />
                  </button>

                  <div className="flex items-center gap-3 w-full">
                    <div className="flex-1 h-[1px] bg-white/[0.06]" />
                    <span className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em] whitespace-nowrap">Or Connect Via</span>
                    <div className="flex-1 h-[1px] bg-white/[0.06]" />
                  </div>

                  <div className="flex gap-3 w-full">
                    <button 
                      onClick={() => handleMockLogin('yahoo')}
                      disabled={isLoading}
                      className="flex-1 bg-[#0f0a1c] border border-indigo-500/20 hover:border-indigo-500/40 text-indigo-300 hover:text-white h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer"
                    >
                      {isLoading && provider === 'yahoo' ? (
                        <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
                      ) : (
                        <span className="font-black italic text-sm tracking-tighter text-indigo-400">y!</span>
                      )}
                      Yahoo
                    </button>
                    <button 
                      onClick={() => setShowEmailForm(true)}
                      className="flex-1 bg-white/[0.02] border border-white/[0.05] hover:border-white/10 text-slate-400 hover:text-white h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <Mail size={14} />
                      Other
                    </button>
                  </div>
                </>
              ) : (
                <div className="w-full bg-[#0a0c10] border border-white/10 rounded-[2rem] p-6 space-y-4 animate-in fade-in zoom-in-95 duration-300 text-left">
                   <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Advanced Mail Link</span>
                    <button onClick={() => setShowEmailForm(false)} className="text-xs text-slate-500 hover:text-white font-bold cursor-pointer">Cancel</button>
                   </div>
                   <input type="email" placeholder="IMAP Server Address" className="w-full bg-black/50 border border-white/5 rounded-xl px-4 py-3 text-xs outline-none focus:border-indigo-500 transition-all" />
                   <input type="password" placeholder="App-Specific Password" className="w-full bg-black/50 border border-white/5 rounded-xl px-4 py-3 text-xs outline-none focus:border-indigo-500 transition-all" />
                   <button onClick={() => handleMockLogin('other')} className="w-full bg-indigo-600 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all cursor-pointer">Connect</button>
                </div>
              )}
            </div>
            
            {!isIntroActive && (
              <p className="text-[10px] text-slate-700 font-bold uppercase tracking-[0.2em] flex items-center gap-2 mt-6 justify-center w-full mx-auto">
                <Lock size={12} className="text-slate-800 shrink-0" /> Credentials never leave your browser.
              </p>
            )}
          </div>

          {/* RIGHT COLUMN — 5/12 — Dynamic sliding panels */}
          <div className={`md:col-span-5 relative h-[520px] bg-[#0b0a14]/60 border border-indigo-500/[0.06] rounded-[2.5rem] p-8 flex flex-col justify-between shadow-2xl backdrop-blur-md transition-all [transition-duration:1200ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]
            ${isIntroActive ? 'opacity-0 translate-x-16 scale-95 pointer-events-none hidden md:none' : 'opacity-100 translate-x-0 scale-100 hidden md:flex'}`}>
            
            <div className="flex items-center justify-between border-b border-indigo-500/[0.06] pb-4">
              <span className="text-[11px] font-black text-indigo-300/60 uppercase tracking-[0.25em]">
                {subSlide === 0 ? '01 // Isolation' : '02 // Pipeline'}
              </span>
              
              <div className="flex gap-1.5">
                <button onClick={() => setSubSlide(0)} className={`h-1 rounded-full transition-all duration-500 cursor-pointer ${subSlide === 0 ? 'w-8 bg-indigo-500' : 'w-2 bg-slate-800'}`} />
                <button onClick={() => setSubSlide(1)} className={`h-1 rounded-full transition-all duration-500 cursor-pointer ${subSlide === 1 ? 'w-8 bg-indigo-500' : 'w-2 bg-slate-800'}`} />
              </div>
            </div>

            <div className="relative flex-1 mt-6">
              
              {/* SLIDE 0 */}
              <div className={`absolute inset-0 transition-all duration-700 flex flex-col gap-5 ${subSlide === 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
                <div className="bg-indigo-500/[0.06] border border-indigo-500/[0.08] rounded-2xl p-6 flex items-start gap-4">
                   <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center shrink-0"><Shield size={22} className="text-indigo-400"/></div>
                   <div className="text-left"><h4 className="text-white font-black text-xs uppercase mb-1 tracking-widest">Security Audit</h4><p className="text-indigo-200/50 text-[11px] leading-relaxed">Mirror is sandboxed open-source software. You can compile your own localized package or review our codebase manually.</p></div>
                </div>
                <div className="grid grid-cols-2 gap-4 flex-1 text-left">
                  <div className="bg-indigo-500/[0.03] border border-indigo-500/[0.06] rounded-2xl p-5 flex flex-col justify-between"><Zap className="text-indigo-400" size={24} /><div><h4 className="font-black text-[10px] uppercase mb-1 tracking-widest text-white">Instant Sync</h4><p className="text-indigo-200/40 text-[10px] leading-snug">Local triggers clear raw inputs natively post-parse.</p></div></div>
                  <div className="bg-indigo-500/[0.03] border border-indigo-500/[0.06] rounded-2xl p-5 flex flex-col justify-between"><Database className="text-indigo-400" size={24} /><div><h4 className="font-black text-[10px] uppercase mb-1 tracking-widest text-white">Zero Cloud</h4><p className="text-indigo-200/40 text-[10px] leading-snug">No data parsing caches or intermediate database engines used.</p></div></div>
                </div>
              </div>


              {/* SLIDE 1 — STAGGERED PIPELINE LAYOUT */}
              <div className={`absolute inset-0 transition-all duration-700 flex flex-col justify-between -mt-2 py-1 ${subSlide === 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
                
                {/* Step 1 - Left Aligned */}
                <div className="flex items-center gap-4 self-start w-[72%] bg-white/[0.02] border border-white/[0.03] rounded-2xl p-3.5 text-left backdrop-blur-sm shadow-xl">
                  <div className="w-11 h-11 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-black text-sm text-indigo-400 shrink-0 shadow-inner">
                    1
                  </div>
                  <div>
                    <h5 className="font-black text-white uppercase tracking-wider text-[11px] leading-tight">Connect Email</h5>
                    <p className="text-slate-400 text-[10px] mt-0.5 leading-tight">Sign in securely — we read only your bank alerts</p>
                  </div>
                </div>

                {/* Step 2 - Right Aligned */}
                <div className="flex items-center gap-4 self-end w-[72%] bg-white/[0.02] border border-white/[0.03] rounded-2xl p-3.5 text-left backdrop-blur-sm shadow-xl">
                  <div className="order-2 w-11 h-11 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-black text-sm text-indigo-400 shrink-0 shadow-inner">
                    2
                  </div>
                  <div className="order-1 text-right flex-1">
                    <h5 className="font-black text-white uppercase tracking-wider text-[11px] leading-tight">Set Balances</h5>
                    <p className="text-slate-400 text-[10px] mt-0.5 leading-tight">Input initial points to calculate ongoing shifts</p>
                  </div>
                </div>

                {/* Step 3 - Left Aligned */}
                <div className="flex items-center gap-4 self-start w-[72%] bg-white/[0.02] border border-white/[0.03] rounded-2xl p-3.5 text-left backdrop-blur-sm shadow-xl">
                  <div className="w-11 h-11 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-black text-sm text-indigo-400 shrink-0 shadow-inner">
                    3
                  </div>
                  <div>
                    <h5 className="font-black text-white uppercase tracking-wider text-[11px] leading-tight">Sync Alerts</h5>
                    <p className="text-slate-400 text-[10px] mt-0.5 leading-tight">Isolated micro-scans run natively on device</p>
                  </div>
                </div>

                {/* Step 4 - Right Aligned */}
                <div className="flex items-center gap-4 self-end w-[72%] bg-white/[0.02] border border-white/[0.03] rounded-2xl p-3.5 text-left backdrop-blur-sm shadow-xl">
                  <div className="order-2 w-11 h-11 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-black text-sm text-indigo-400 shrink-0 shadow-inner">
                    4
                  </div>
                  <div className="order-1 text-right flex-1">
                    <h5 className="font-black text-white uppercase tracking-wider text-[11px] leading-tight">Track Dashboard</h5>
                    <p className="text-slate-400 text-[10px] mt-0.5 leading-tight">Unified transaction metrics updated in real-time</p>
                  </div>
                </div>

                {/* Vector Path Connection */}
                <svg className="absolute inset-0 w-full h-full -z-10 opacity-[0.03]" viewBox="0 0 300 300" preserveAspectRatio="none">
                  <path d="M 55 45 L 245 45 L 55 255 L 245 255" fill="none" stroke="#818cf8" strokeWidth="2" strokeDasharray="120 120" />
                </svg>

              </div>

            </div>

            <div className="border-t border-indigo-500/[0.06] pt-3 flex items-center gap-2 text-indigo-300/40">
              <Clock size={12} className="text-indigo-400/40 animate-pulse" />
              <span className="text-[9px] font-black uppercase tracking-[0.25em]">Automated lifecycle sync interval — 10s cycle</span>
            </div>

          </div>

        </div>
      </main>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer className="h-10 border-t border-white/[0.03] bg-[#050608] flex items-center justify-center shrink-0">
        <p className="text-[8px] text-slate-700 font-black uppercase tracking-[0.4em]">
          Financially Transparent · mirror.ng · By Tobiii
        </p>
      </footer>
    </div>
  )
}