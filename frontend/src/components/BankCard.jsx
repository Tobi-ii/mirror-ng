import { CreditCard, TrendingUp, TrendingDown } from 'lucide-react';

const BANK_COLORS = {
  'Sterling Bank': 'from-purple-600 to-indigo-800',
  'Wema (ALAT)': 'from-red-600 to-rose-700',
  'Wema Bank': 'from-red-600 to-rose-700',
  'Kuda': 'from-emerald-500 to-teal-600',
  'GTBank': 'from-orange-500 to-amber-600',
  'Access Bank': 'from-red-700 to-red-900',
  'OPay': 'from-green-500 to-emerald-700',
  'default': 'from-slate-700 to-slate-900',
};


export default function BankCard({ bank, balance, account_last4, last_updated, totalCredit = 0, totalDebit = 0, onClick }) {
  const color = BANK_COLORS[bank] || BANK_COLORS['default'];
  const fmt = (n) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2 }).format(n);
  const fmtDate = (s) => s ? new Date(s).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    /* OPTION B: FIXED 340px WIDTH */
    <div className="relative group w-[220px] sm:w-[260px] md:w-[300px] lg:w-[340px] shrink-0"> 
      <div 
        onClick={onClick} 
        className={`rounded-2xl sm:rounded-[2.5rem] bg-gradient-to-br ${color} text-white shadow-2xl flex relative overflow-hidden transition-all duration-500 ease-in-out group-hover:-translate-y-2 group-hover:shadow-indigo-500/20 active:scale-[0.97] cursor-pointer h-40 sm:h-44 md:h-48 lg:h-52`}
      >
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-white/20 transition-all duration-1000 pointer-events-none" />

        <div className="flex-[1.6] p-4 sm:p-5 md:p-6 lg:p-7 flex flex-col justify-between z-10 min-w-0 transition-all duration-500">
          <div className="flex justify-between items-start">
            <div className="w-11 h-11 bg-white/15 rounded-2xl backdrop-blur-xl flex items-center justify-center border border-white/20 shadow-inner shrink-0">
              <CreditCard size={22} className="opacity-90" />
            </div>
            <span className="font-mono text-[10px] font-bold opacity-50 tracking-widest mt-1">•••• {account_last4}</span>
          </div>

          <div className="overflow-hidden mt-4">
            <p className="text-[9px] font-black uppercase tracking-[0.25em] opacity-50 mb-1.5 truncate">{bank}</p>
            <h3 className="text-[1.4rem] font-black tracking-tighter tabular-nums leading-none whitespace-nowrap">
              {fmt(balance)}
            </h3>
            <p className="text-[8px] opacity-30 mt-2 font-mono tracking-tight italic uppercase">{fmtDate(last_updated)}</p>
          </div>
        </div>

        <div className="w-0 opacity-0 group-hover:w-full group-hover:flex-1 group-hover:opacity-100 transition-all duration-500 ease-in-out border-l border-white/10 bg-black/10 backdrop-blur-md flex flex-col justify-center px-0 group-hover:px-5 gap-3 overflow-hidden z-10">
          <div className="py-1 whitespace-nowrap">
            <div className="flex items-center gap-1.5 opacity-40 mb-1">
              <TrendingUp size={11} className="text-emerald-400" />
              <span className="text-[7px] font-black uppercase tracking-widest">Inflow</span>
            </div>
            <p className="text-xs font-black text-emerald-400 tabular-nums">+{fmt(totalCredit).replace('NGN', '').trim()}</p>
          </div>
          <div className="h-[1px] bg-white/5 w-full shrink-0" />
          <div className="py-1 whitespace-nowrap">
            <div className="flex items-center gap-1.5 opacity-40 mb-1">
              <TrendingDown size={11} className="text-rose-400" />
              <span className="text-[7px] font-black uppercase tracking-widest">Outflow</span>
            </div>
            <p className="text-xs font-black text-rose-400 tabular-nums">-{fmt(totalDebit).replace('NGN', '').trim()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}