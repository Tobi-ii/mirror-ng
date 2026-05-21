import { useState, useEffect } from 'react';
import { ArrowLeft, Trash2, LogOut, Pencil, Check, X, AlertTriangle, Sparkles } from 'lucide-react';
import { api } from '../services/api';

export function Settings({ userId, onBack, onLogout, transactions, onDataChanged }) {
  const [balances, setBalances] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingBal, setEditingBal] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [deletingAlias, setDeletingAlias] = useState(null);
  const [clearingAliases, setClearingAliases] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getBalances(userId),
      api.getAliases(userId)
    ]).then(([balRes, aliasRes]) => {
      let loadedBals = balRes?.success ? balRes.balances : [];

      // Add banks that have transactions but no balance record (anchor not set)
      const balBankKeys = new Set(loadedBals.map(b => b.bank + '|' + (b.account_last4 || '')));
      const latestTxPerBank = {};
      (transactions || []).forEach(t => {
        const key = t.bank;
        if (!latestTxPerBank[key] || (t.timestamp || '') > (latestTxPerBank[key].timestamp || '')) {
          latestTxPerBank[key] = t;
        }
      });
      Object.values(latestTxPerBank).forEach(tx => {
        const key = tx.bank + '|' + (tx.account_last4 || '');
        if (!balBankKeys.has(key)) {
          loadedBals.push({
            bank: tx.bank,
            account_last4: tx.account_last4 || '0000',
            balance: 0,
            last_updated: tx.timestamp,
            is_anchor: false,
            provides_balance: false,
            _isUnanchored: true
          });
          balBankKeys.add(key);
        }
      });

      setBalances(loadedBals);
      if (aliasRes?.success) setAliases(aliasRes.aliases);
    }).finally(() => setLoading(false));
  }, [userId, transactions]);

  const handleDeleteBalance = async (bank, last4) => {
    await api.deleteBalance(userId, bank, last4);
    const balRes = await api.getBalances(userId);
    if (balRes?.success) setBalances(balRes.balances);
    if (onDataChanged) onDataChanged();
  };

  const handleAdjustBalance = async (bank, last4) => {
    await api.adjustBalance(userId, bank, last4 || '0000', parseFloat(editValue), 'user_manual_adjustment');
    const balRes = await api.getBalances(userId);
    if (balRes?.success) setBalances(balRes.balances);
    setEditingBal(null);
    if (onDataChanged) onDataChanged();
  };

  const handleDeleteAlias = async (aliasId) => {
    await api.deleteAlias(userId, aliasId);
    const aliasRes = await api.getAliases(userId);
    if (aliasRes?.success) setAliases(aliasRes.aliases);
    setDeletingAlias(null);
  };

  const handleClearAllAliases = async () => {
    setClearingAliases(true);
    for (const a of aliases) {
      try { await api.deleteAlias(userId, a.id); } catch (e) { console.error(e); }
    }
    setAliases([]);
    setClearingAliases(false);
    setConfirmClear(false);
  };

  const syncedBanks = new Set((transactions || []).map(t => t.bank));
  const _isUnanchored = (b) => b._isUnanchored === true;

  const getCategory = (b) => {
    if (b.provides_balance) return 'auto_tracked';
    if (_isUnanchored(b) || syncedBanks.has(b.bank)) return 'anchor_needed';
    return 'manual';
  };

  const getBadge = (b) => {
    const cat = getCategory(b);
    if (cat === 'auto_tracked')
      return <span className="text-[8px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full font-black uppercase tracking-wider">Balance auto-tracked</span>;
    if (cat === 'anchor_needed')
      return <span className="text-[8px] px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full font-black uppercase tracking-wider">Anchor not set</span>;
    return <span className="text-[8px] px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-full font-black uppercase tracking-wider">Manual</span>;
  };

  const fmt = (n) => `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050608] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050608] text-white">
      <div className="max-w-4xl mx-auto px-8 py-10 space-y-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button onClick={onBack} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors">
              <ArrowLeft size={20} className="text-slate-400" />
            </button>
            <div>
              <h1 className="text-3xl font-black tracking-tighter italic uppercase">Settings</h1>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">Manage your financial mirror</p>
            </div>
          </div>
          <button onClick={onLogout} className="flex items-center gap-2 px-6 py-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 hover:bg-rose-500/20 transition-all text-[10px] font-black uppercase tracking-widest">
            <LogOut size={14} /> Logout
          </button>
        </div>

        {/* Balances */}
        <section className="space-y-4">
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Bank Accounts ({balances.length})</h2>
          <div className="space-y-2">
            {balances.length === 0 ? (
              <p className="text-slate-600 text-sm italic py-8 text-center">No accounts configured.</p>
            ) : balances.map((b, i) => {
              const cat = getCategory(b);
              const isAutoTracked = cat === 'auto_tracked';
              const isManual = cat === 'manual';
              return (
              <div key={i} className="flex items-center justify-between bg-[#0a0c10] border border-white/5 rounded-2xl px-6 py-4 group hover:border-white/10 transition-all">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                    <span className="text-indigo-400 font-black text-sm">{b.bank.charAt(0)}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold truncate">{b.bank}</p>
                      {getBadge(b)}
                    </div>
                    <p className="text-[10px] text-slate-600 font-mono">•••• {b.account_last4}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {editingBal === i ? (
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">₦</span>
                        <input type="number" value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          className="w-28 bg-white/5 border border-white/10 pl-6 pr-3 py-2 rounded-xl text-white text-xs font-black outline-none focus:border-indigo-500"
                          autoFocus
                        />
                      </div>
                      <button onClick={() => handleAdjustBalance(b.bank, b.account_last4)}
                        className="p-2 bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
                        <Check size={12} />
                      </button>
                      <button onClick={() => setEditingBal(null)}
                        className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm font-black tabular-nums font-mono">{fmt(b.balance)}</span>
                  )}
                  {!isAutoTracked && (
                    <button onClick={() => { setEditingBal(i); setEditValue(b.balance); }}
                      className="opacity-0 group-hover:opacity-100 p-2 hover:bg-white/10 rounded-lg transition-all">
                      <Pencil size={12} className="text-slate-500" />
                    </button>
                  )}
                  {isManual && (
                    <button onClick={() => handleDeleteBalance(b.bank, b.account_last4)}
                      className="opacity-0 group-hover:opacity-100 p-2 hover:bg-rose-500/10 rounded-lg transition-all">
                      <Trash2 size={12} className="text-rose-400" />
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </section>

        {/* Aliases */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
              Transaction Aliases ({aliases.length})
            </h2>
            {aliases.length > 0 && !confirmClear && (
              <button onClick={() => setConfirmClear(true)}
                className="text-[9px] px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg font-black uppercase tracking-wider hover:bg-rose-500/20 transition-all flex items-center gap-1.5">
                <Trash2 size={10} /> Clear All
              </button>
            )}
            {confirmClear && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-rose-400 font-black uppercase tracking-wider">Clear all {aliases.length} aliases?</span>
                <button onClick={handleClearAllAliases} disabled={clearingAliases}
                  className="text-[9px] px-3 py-1.5 bg-rose-600 text-white rounded-lg font-black uppercase tracking-wider hover:bg-rose-700 transition-all">
                  {clearingAliases ? 'Clearing...' : 'Yes'}
                </button>
                <button onClick={() => setConfirmClear(false)}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-all">
                  <X size={12} className="text-slate-500" />
                </button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {aliases.length === 0 ? (
              <p className="text-slate-600 text-sm italic py-8 text-center">No aliases defined.</p>
            ) : aliases.map((a, i) => (
              <div key={i} className="flex items-center justify-between bg-[#0a0c10] border border-white/5 rounded-2xl px-6 py-4 group hover:border-white/10 transition-all">
                <div className="min-w-0 flex-1 mr-4">
                  <p className="text-sm font-bold text-indigo-300 truncate">{a.display_name}</p>
                  <p className="text-[10px] text-slate-600 truncate font-mono">
                    Pattern: {a.recipient_pattern?.slice(0, 50)}
                    {a.category && <span className="ml-2 text-slate-500">· {a.category}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {deletingAlias === i ? (
                    <>
                      <button onClick={() => handleDeleteAlias(a.id)}
                        className="text-[9px] px-3 py-1.5 bg-rose-500/20 text-rose-400 rounded-lg font-black uppercase tracking-wider hover:bg-rose-500/30 transition-colors">
                        Confirm
                      </button>
                      <button onClick={() => setDeletingAlias(null)}
                        className="p-1.5 hover:bg-white/10 rounded-lg transition-all">
                        <X size={12} className="text-slate-500" />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setDeletingAlias(i)}
                      className="opacity-0 group-hover:opacity-100 p-2 hover:bg-rose-500/10 rounded-lg transition-all">
                      <Trash2 size={12} className="text-rose-400" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <div className="pt-6 border-t border-white/5 text-center">
          <p className="text-[9px] text-slate-700 font-black uppercase tracking-[0.3em]">
            mirror.ng · Your Financial Mirror
          </p>
        </div>
      </div>
    </div>
  );
}