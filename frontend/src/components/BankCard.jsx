import { useState, useRef, useEffect } from 'react';
import { CreditCard, TrendingUp, TrendingDown } from 'lucide-react';

const BANK_COLORS = {
  'Sterling Bank':  'from-emerald-500 to-teal-600',
  'Wema (ALAT)':   'from-purple-600 to-indigo-800',
  'Wema Bank':      'from-purple-600 to-indigo-800',
  'Kuda':           'from-emerald-500 to-teal-600',
  'GTBank':        'from-orange-500 to-amber-600',
  'Access Bank':   'from-red-700 to-red-900',
  'OPay':          'from-orange-400 to-orange-600',
  'Moniepoint':    'from-blue-500 to-blue-700',
  'default':       'from-slate-700 to-slate-900',
};

const COLOR_OPTIONS = [
  { gradient: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-500' },
  { gradient: 'from-purple-600 to-indigo-800', bg: 'bg-purple-600' },
  { gradient: 'from-orange-500 to-amber-600', bg: 'bg-orange-500' },
  { gradient: 'from-rose-500 to-pink-700', bg: 'bg-rose-500' },
  { gradient: 'from-blue-500 to-indigo-700', bg: 'bg-blue-500' },
  { gradient: 'from-red-600 to-rose-700', bg: 'bg-red-600' },
  { gradient: 'from-cyan-500 to-blue-600', bg: 'bg-cyan-500' },
  { gradient: 'from-violet-600 to-purple-800', bg: 'bg-violet-600' },
  { gradient: 'from-slate-600 to-slate-800', bg: 'bg-slate-600' },
];

export default function BankCard({
  bank, balance, account_last4, last_updated,
  totalCredit = 0, totalDebit = 0, onClick,
  colorIndex = null, allBankColors = {}, onColorChange
}) {
  const defaultGradient = BANK_COLORS[bank] || BANK_COLORS['default'];
  const resolvedIndex = colorIndex !== null ? colorIndex : COLOR_OPTIONS.findIndex(o => o.gradient === defaultGradient);
  const effectiveIndex = resolvedIndex >= 0 ? resolvedIndex : 0;

  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setShowPicker(false);
      }
    }
    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPicker]);

  const togglePicker = (e) => {
    e.stopPropagation();
    setShowPicker(!showPicker);
  };

  const handleColorSelect = (e, idx) => {
    e.stopPropagation();
    if (onColorChange) onColorChange(bank, idx);
    setShowPicker(false);
  };

  const usedByOthers = Object.entries(allBankColors)
    .filter(([otherBank]) => otherBank !== bank)
    .map(([, idx]) => idx);

  const fmt = (n) =>
    new Intl.NumberFormat('en-NG', {
      style: 'currency', currency: 'NGN', minimumFractionDigits: 2,
    }).format(n);

  const fmtDate = (s) =>
    s ? new Date(s).toLocaleDateString('en-NG', {
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    }) : '';

  return (
    <div className="relative group w-[220px] sm:w-[260px] md:w-[300px] lg:w-[340px] shrink-0">
      <div
        onClick={onClick}
        className={`rounded-2xl sm:rounded-[2.5rem] bg-gradient-to-br ${COLOR_OPTIONS[effectiveIndex].gradient} text-white shadow-2xl flex relative overflow-hidden transition-all duration-500 ease-in-out group-hover:-translate-y-2 group-hover:shadow-indigo-500/20 active:scale-[0.97] cursor-pointer h-40 sm:h-44 md:h-48 lg:h-52`}
      >
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-white/20 transition-all duration-1000 pointer-events-none" />

        {/* Main content */}
        <div className="flex-[1.6] p-4 sm:p-5 md:p-6 lg:p-7 flex flex-col justify-between z-10 min-w-0 transition-all duration-500">
          <div className="flex justify-between items-start relative">

            {/* Container to handle horizontal positioning context */}
            <div ref={pickerRef} className="flex items-center relative">
              {/* ── Card icon — click to open horizontal menu ── */}
              <button
                onClick={togglePicker}
                type="button"
                title="Change card colour"
                className={`w-11 h-11 rounded-2xl backdrop-blur-xl flex items-center justify-center border shadow-inner shrink-0 transition-all duration-200 z-30 ${
                  showPicker 
                    ? 'bg-white/30 border-white/40 scale-105' 
                    : 'bg-white/15 border-white/20 hover:bg-white/25 hover:scale-110 active:scale-95'
                }`}
              >
                <CreditCard size={22} className="opacity-90" />
              </button>

              {/* ── Horizontal Colour Picker ── */}
              {showPicker && (
                <div className="absolute left-14 top-0 flex items-center gap-1.5 bg-black/40 backdrop-blur-xl border border-white/10 px-3 py-2 rounded-2xl shadow-xl animate-in fade-in slide-in-from-left-2 duration-200 z-20 max-w-[140px] sm:max-w-[180px] md:max-w-[220px] overflow-x-auto scrollbar-none">
                  {COLOR_OPTIONS.map((option, idx) => {
                    const taken = usedByOthers.includes(idx);
                    return (
                      <button
                        key={idx}
                        onClick={(e) => { if (!taken) handleColorSelect(e, idx); }}
                        type="button"
                        disabled={taken}
                        className={`w-5 h-5 rounded-full shrink-0 transition-all duration-150 hover:scale-125 active:scale-90 border ${
                          idx === effectiveIndex
                            ? 'border-white scale-110 shadow-md ring-2 ring-white/20'
                            : 'border-white/30'
                        } ${option.bg} ${taken ? 'opacity-20 cursor-not-allowed hover:scale-100' : ''}`}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            <span className="font-mono text-[10px] font-bold opacity-60 tracking-widest mt-1">
              •••• {account_last4}
            </span>
          </div>

          <div className="overflow-hidden mt-4">
            {/* Bank name */}
            <p className="text-[9px] font-black uppercase tracking-[0.25em] opacity-90 mb-1.5 truncate">
              {bank}
            </p>

            <h3 className="text-[1.4rem] font-black tracking-tighter tabular-nums leading-none whitespace-nowrap">
              {fmt(balance)}
            </h3>

            {/* Date */}
            <p className="text-[8px] opacity-70 mt-2 font-mono tracking-tight italic uppercase">
              {fmtDate(last_updated)}
            </p>
          </div>
        </div>

        {/* Hover panel — inflow / outflow */}
        <div className="w-0 opacity-0 group-hover:w-full group-hover:flex-1 group-hover:opacity-100 transition-all duration-500 ease-in-out border-l border-white/10 bg-black/10 backdrop-blur-md flex flex-col justify-center px-0 group-hover:px-5 gap-3 overflow-hidden z-10">
          <div className="py-1 whitespace-nowrap">
            <div className="flex items-center gap-1.5 opacity-40 mb-1">
              <TrendingUp size={11} className="text-emerald-400" />
              <span className="text-[7px] font-black uppercase tracking-widest">Inflow</span>
            </div>
            <p className="text-xs font-black text-emerald-400 tabular-nums">
              +{fmt(totalCredit).replace('NGN', '').trim()}
            </p>
          </div>
          <div className="h-[1px] bg-white/5 w-full shrink-0" />
          <div className="py-1 whitespace-nowrap">
            <div className="flex items-center gap-1.5 opacity-40 mb-1">
              <TrendingDown size={11} className="text-rose-400" />
              <span className="text-[7px] font-black uppercase tracking-widest">Outflow</span>
            </div>
            <p className="text-xs font-black text-rose-400 tabular-nums">
              -{fmt(totalDebit).replace('NGN', '').trim()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
