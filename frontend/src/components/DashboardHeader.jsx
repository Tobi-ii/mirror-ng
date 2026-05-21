import React from 'react';
import { Calendar, RefreshCw } from 'lucide-react';

export default function DashboardHeader({ sinceDate, untilDate, onNewAudit, execMode, onToggleExec }) {
  return (
    <header className="sticky top-0 z-40 bg-[#050608]/40 backdrop-blur-2xl px-12 py-4 flex justify-between items-center border-b border-white/5">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black italic text-black">M</div>
        <span className="font-black text-2xl tracking-tighter italic uppercase">Mirror.ng</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-3 px-6 py-3 bg-white/5 rounded-full border border-white/10">
          <Calendar size={14} className="text-indigo-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {sinceDate} — {untilDate || 'PRESENT'}
          </span>
        </div>

        <button
          onClick={onToggleExec}
          className={`text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-full border transition-all ${
            execMode
              ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'border-white/10 text-slate-500 hover:text-white hover:border-white/30'
          }`}
        >
          {execMode ? '✦ Executive' : 'Executive'}
        </button>

        <button
          onClick={onNewAudit}
          className="text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2 transition-all"
        >
          <RefreshCw size={14} /> New Audit
        </button>
      </div>
    </header>
  );
}