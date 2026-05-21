import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar } from 'lucide-react';
import CustomSelect from './CustomSelect';

const SUPPORTED_BANKS = [
  'Sterling Bank', 'Wema (ALAT)', 'GTBank', 'Access Bank',
  'First Bank', 'Kuda', 'OPay', 'Moniepoint', 'PalmPay',
  'Piggyvest', 'Cowrywise', 'Other',
];

const getTodayDate = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

const getThirtyDaysAgo = () => {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().split('T')[0];
};

export default function SessionOnboarding({
  sinceDate: externalSinceDate,
  setSinceDate: externalSetSinceDate,
  untilDate: externalUntilDate,
  setUntilDate: externalSetUntilDate,
  onExecute, 
  syncing 
}) {
  const [sinceDate, setSinceDate] = useState(externalSinceDate || getThirtyDaysAgo());
  const [untilDate, setUntilDate] = useState(getTodayDate());

  useEffect(() => {
    const today = getTodayDate();
    setUntilDate(today);
    if (externalSetUntilDate) externalSetUntilDate(today);
  }, []);

  useEffect(() => {
    if (externalSetSinceDate) externalSetSinceDate(sinceDate);
  }, [sinceDate, externalSetSinceDate]);

  useEffect(() => {
    if (externalSetUntilDate) externalSetUntilDate(untilDate);
  }, [untilDate, externalSetUntilDate]);

  const [accounts, setAccounts] = useState([
    { bank: 'Sterling Bank', account_last4: '', balance: '' }
  ]);

  const addAccount = () => {
    if (accounts.length >= 4) return;
    setAccounts(prev => [...prev, { bank: 'Sterling Bank', account_last4: '', balance: '' }]);
  };

  const removeAccount = (i) => {
    setAccounts(prev => prev.filter((_, idx) => idx !== i));
  };

  const updateAccount = (i, field, value) => {
    setAccounts(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: value } : a));
  };

  const handleExecute = () => {
    const valid = accounts.filter(a => a.bank && a.balance && parseFloat(a.balance) >= 0);
    onExecute(false, valid);
  };

  const handleSinceDateChange = (e) => {
    const newDate = e.target.value;
    setSinceDate(newDate);
    if (newDate > untilDate) {
      const today = getTodayDate();
      setUntilDate(today);
    }
  };

  const handleUntilDateChange = (e) => {
    const newDate = e.target.value;
    const today = getTodayDate();
    if (newDate > today) {
      setUntilDate(today);
    } else {
      setUntilDate(newDate);
    }
  };

  const totalOpening = accounts.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0);
  const fmt = (n) => `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  const todayDate = getTodayDate();

  return (
    <div className="fixed inset-0 z-[110] bg-[#050608] flex items-center justify-center p-6">
      <div className="max-w-3xl w-full">

        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-5xl font-black italic tracking-tighter uppercase">Initialize Mirror</h2>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.5em] mt-2">
            Frame your financial reality
          </p>
          {totalOpening > 0 && (
            <p className="text-3xl font-black italic text-white tabular-nums mt-3">{fmt(totalOpening)}</p>
          )}
        </div>

        <div className="bg-[#0a0c10] border border-white/10 p-8 rounded-[3rem] shadow-2xl space-y-6">

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-white tracking-widest ml-2">Audit Start</label>
              <div className="relative">
                <input 
                  type="date" 
                  value={sinceDate}
                  onChange={handleSinceDateChange}
                  max={untilDate}
                  className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-2xl text-white outline-none font-bold text-sm appearance-none [color-scheme:dark] transition-all"
                />
                <Calendar size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-purple-400/60 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-white tracking-widest ml-2">
                Audit End
                <span className="text-purple-400 ml-1">· Today</span>
              </label>
              <div className="relative">
                <input 
                  type="date" 
                  value={untilDate}
                  onChange={handleUntilDateChange}
                  min={sinceDate}
                  max={todayDate}
                  className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-2xl text-white outline-none font-bold text-sm appearance-none [color-scheme:dark] transition-all"
                />
                <Calendar size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-purple-400/60 pointer-events-none" />
              </div>
              <p className="text-[8px] text-slate-600 text-right mt-1">Max: {todayDate} (today)</p>
            </div>
          </div>

          {/* Accounts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-black uppercase text-white tracking-widest">Opening Balances</label>
              <span className="text-[9px] text-slate-700 italic">Max 4 accounts</span>
            </div>

            {accounts.map((account, i) => (
              <div key={i} className="grid grid-cols-[1.2fr_90px_130px_32px] gap-2 items-center">
                
                <CustomSelect
                  value={account.bank}
                  onChange={(val) => updateAccount(i, 'bank', val)}
                  options={SUPPORTED_BANKS}
                  placeholder="Select bank"
                />

                <input type="text" value={account.account_last4}
                  onChange={(e) => updateAccount(i, 'account_last4', e.target.value.slice(-4))}
                  placeholder="Last 4" maxLength={4}
                  className="bg-white/5 border border-white/10 px-3 py-3 rounded-2xl text-white outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/20 font-mono text-xs text-center h-[44px] transition-all"
                />

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-black">₦</span>
                  <input type="number" value={account.balance}
                    onChange={(e) => updateAccount(i, 'balance', e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-white/10 pl-6 pr-2 py-3 rounded-2xl text-white outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/20 font-black text-sm h-[44px] transition-all"
                  />
                </div>

                {accounts.length > 1 ? (
                  <button onClick={() => removeAccount(i)}
                    className="p-1 text-slate-700 hover:text-rose-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                ) : <div />}
              </div>
            ))}

            {accounts.length < 4 && (
              <button onClick={addAccount}
                className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-purple-400 hover:text-purple-300 transition-colors mt-2">
                <Plus size={12} /> Add Another Account
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 pt-2">
            <button onClick={handleExecute} disabled={syncing}
              className="w-full py-5 bg-white text-black font-black rounded-full uppercase italic text-base hover:bg-purple-600 hover:text-white transition-all active:scale-[0.98] disabled:opacity-50">
              {syncing ? 'Reconstructing Feed...' : 'Execute Session Audit'}
            </button>
            <button onClick={() => onExecute(true, [])} disabled={syncing}
              className="w-full py-3 text-slate-500 font-black rounded-full uppercase text-[9px] tracking-[0.3em] hover:text-white transition-all disabled:opacity-50">
              Skip to Stateless Audit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}