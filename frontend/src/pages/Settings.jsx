import { useState, useEffect } from 'react';
import { ArrowLeft, Trash2, LogOut, Pencil, Check, X, AlertTriangle, Sparkles, Cloud, CloudOff, Download, Upload, ChevronDown, ChevronRight } from 'lucide-react';
import { api, setCloudSync, isCloudSync, exportCSV } from '../services/api';
import { localData } from '../services/localData';

export function Settings({ userId, onBack, onLogout, transactions, onDataChanged, onCloudSyncChange }) {
  const [balances, setBalances] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingBal, setEditingBal] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editLast4, setEditLast4] = useState('');
  const [deletingAlias, setDeletingAlias] = useState(null);
  const [clearingAliases, setClearingAliases] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [expandedAliasGroups, setExpandedAliasGroups] = useState({});
  const [cloudSync, setCloudSyncLocal] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [showMigrateConfirm, setShowMigrateConfirm] = useState(false);
  const [migrateDirection, setMigrateDirection] = useState(null); // 'to-local' or 'to-cloud'

  useEffect(() => {
    Promise.all([
      api.getBalances(userId),
      api.getAliases(userId),
      api.getCloudSync(userId)
    ]).then(([balRes, aliasRes, syncRes]) => {
      setCloudSyncLocal(syncRes?.success ? syncRes.cloud_sync : true);
      let loadedBals = balRes?.success ? balRes.balances : [];

      // Add banks that have transactions but no balance record (anchor not set)
      const normLast4 = (v) => (v || '0000');
      const balBankKeys = new Set(loadedBals.map(b => b.bank + '|' + normLast4(b.account_last4)));
      const latestTxPerBank = {};
      (transactions || []).forEach(t => {
        const key = t.bank + '|' + normLast4(t.account_last4);
        if (!latestTxPerBank[key] || (t.timestamp || '') > (latestTxPerBank[key].timestamp || '')) {
          latestTxPerBank[key] = t;
        }
      });
      Object.values(latestTxPerBank).forEach(tx => {
        const key = tx.bank + '|' + normLast4(tx.account_last4);
        if (!balBankKeys.has(key)) {
          loadedBals.push({
            bank: tx.bank,
            account_last4: normLast4(tx.account_last4),
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

  const handleToggleCloudSync = async () => {
    const newVal = !cloudSync;
    if (newVal) {
      // OFF → ON: upload local data to cloud
      setMigrateDirection('to-cloud');
    } else {
      // ON → OFF: download cloud data to local
      setMigrateDirection('to-local');
    }
    setShowMigrateConfirm(true);
  };

  const confirmMigration = async () => {
    setShowMigrateConfirm(false);
    setMigrating(true);
    try {
      if (migrateDirection === 'to-local') {
        // Export from server to local
        const exportRes = await api.exportData(userId);
        if (exportRes?.success) {
          await localData.clearUser(userId);
          await localData.importData(userId, {
            transactions: exportRes.transactions || [],
            balances: exportRes.balances || [],
            aliases: exportRes.aliases || []
          });
        }
      } else {
        // Export from local to server
        const localExport = await localData.getExport(userId);
        await api.importData(userId, localExport);
      }

      // Toggle on server
      const res = await api.setCloudSync(userId, migrateDirection === 'to-cloud');
      if (res?.success) {
        setCloudSyncLocal(migrateDirection === 'to-cloud');
        setCloudSync(migrateDirection === 'to-cloud');
        if (onCloudSyncChange) onCloudSyncChange(migrateDirection === 'to-cloud');
      }
    } catch (e) {
      console.error('Migration failed:', e);
    } finally {
      setMigrating(false);
      setMigrateDirection(null);
      // Refresh data
      const [balRes, aliasRes] = await Promise.all([
        api.getBalances(userId),
        api.getAliases(userId)
      ]);
      if (balRes?.success) setBalances(balRes.balances);
      if (aliasRes?.success) setAliases(aliasRes.aliases);
      if (onDataChanged) onDataChanged();
    }
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
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-10 space-y-8 sm:space-y-12">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <button onClick={onBack} className="p-2 sm:p-3 bg-white/5 rounded-xl sm:rounded-2xl hover:bg-white/10 transition-colors shrink-0">
              <ArrowLeft size={18} className="sm:size-[20px] text-slate-400" />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-black tracking-tighter italic uppercase truncate">Settings</h1>
              <p className="text-[8px] sm:text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] sm:tracking-[0.3em]">Manage your financial mirror</p>
            </div>
          </div>
          <button onClick={onLogout} className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl sm:rounded-2xl text-rose-400 hover:bg-rose-500/20 transition-all text-[8px] sm:text-[10px] font-black uppercase tracking-widest shrink-0">
            <LogOut size={12} className="sm:size-[14px]" /> <span className="hidden sm:inline">Logout</span><span className="sm:hidden">Out</span>
          </button>
        </div>

        {/* Cloud Sync Toggle */}
        <section className="space-y-4">
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Data Sync</h2>
          <div className="bg-[#0a0c10] border border-white/5 rounded-2xl px-4 sm:px-6 py-4 sm:py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {cloudSync ? (
                  <Cloud size={18} className="text-indigo-400" />
                ) : (
                  <CloudOff size={18} className="text-amber-400" />
                )}
                <div>
                  <p className="text-xs sm:text-sm font-bold">{cloudSync ? 'Cloud Sync' : 'Local Only'}</p>
                  <p className="text-[8px] sm:text-[10px] text-slate-500 mt-0.5">
                    {cloudSync
                      ? 'Your data is stored on the server. Accessible from any device.'
                      : 'Your data stays in this browser. Not synced across devices.'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleToggleCloudSync}
                disabled={migrating}
                className={`relative w-12 h-7 sm:w-14 sm:h-8 rounded-full transition-all ${
                  cloudSync ? 'bg-indigo-600' : 'bg-white/10'
                } ${migrating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className={`absolute top-0.5 sm:top-1 w-5 h-5 sm:w-6 sm:h-6 bg-white rounded-full shadow-lg transition-all ${
                  cloudSync ? 'left-6 sm:left-7' : 'left-1'
                }`} />
              </button>
            </div>
            {migrating && (
              <div className="mt-3 flex items-center gap-2 text-amber-400 text-[10px] font-black uppercase tracking-wider">
                <div className="w-3 h-3 border-2 border-amber-400/20 border-t-amber-400 rounded-full animate-spin" />
                Migrating data...
              </div>
            )}
          </div>
        </section>

        {/* CSV Export */}
        <div className="bg-[#0a0c10] border border-white/5 rounded-2xl px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Download size={18} className="text-indigo-400" />
            <div>
              <p className="text-xs sm:text-sm font-bold">Export CSV</p>
              <p className="text-[8px] sm:text-[10px] text-slate-500 mt-0.5">
                Download all transactions with alias categories
              </p>
            </div>
          </div>
          <button
            onClick={() => exportCSV(transactions || [], aliases)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black rounded-xl transition-all uppercase tracking-wider"
          >
            Download
          </button>
        </div>

        {/* Migration Confirmation Modal */}
        {showMigrateConfirm && (
          <div className="fixed inset-0 z-[99] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-[#0a0c10] border border-white/10 rounded-[2rem] p-6 sm:p-8 max-w-md w-full space-y-4">
              <h3 className="text-base sm:text-lg font-black uppercase tracking-wider">
                {migrateDirection === 'to-local' ? 'Download Data?' : 'Upload Data?'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                {migrateDirection === 'to-local'
                  ? 'All your data will be downloaded from the cloud to this device. Server data will be deleted.'
                  : 'All local data on this device will be uploaded to the cloud, replacing any existing server data.'}
              </p>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowMigrateConfirm(false)}
                  className="flex-1 py-3 bg-white/5 text-slate-400 text-[10px] font-black rounded-xl hover:bg-white/10 transition-all uppercase tracking-wider">
                  Cancel
                </button>
                <button onClick={confirmMigration}
                  className="flex-1 py-3 bg-indigo-600 text-white text-[10px] font-black rounded-xl hover:bg-indigo-700 transition-all uppercase tracking-wider">
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

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
              <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#0a0c10] border border-white/5 rounded-2xl px-4 sm:px-6 py-3 sm:py-4 group hover:border-white/10 transition-all gap-2 sm:gap-0">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                    <span className="text-indigo-400 font-black text-xs sm:text-sm">{b.bank.charAt(0)}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <p className="text-xs sm:text-sm font-bold truncate">{b.bank}</p>
                      {getBadge(b)}
                    </div>
                    <p className="text-[8px] sm:text-[10px] text-slate-600 font-mono">•••• {b.account_last4}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 ml-11 sm:ml-0">
                  {editingBal === i ? (
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <input type="text" value={editLast4}
                        onChange={e => setEditLast4(e.target.value.slice(-4))}
                        placeholder="Last 4"
                        maxLength={4}
                        className="w-12 sm:w-14 bg-white/5 border border-white/10 px-2 py-1.5 sm:py-2 rounded-xl text-white text-[10px] sm:text-xs font-mono text-center outline-none focus:border-indigo-500"
                      />
                      <div className="relative">
                        <span className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[10px] sm:text-xs">₦</span>
                        <input type="number" value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          className="w-20 sm:w-28 bg-white/5 border border-white/10 pl-5 sm:pl-6 pr-2 sm:pr-3 py-1.5 sm:py-2 rounded-xl text-white text-[10px] sm:text-xs font-black outline-none focus:border-indigo-500"
                          autoFocus
                        />
                      </div>
                      <button onClick={() => handleAdjustBalance(b.bank, editLast4 || '0000')}
                        className="p-1.5 sm:p-2 bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
                        <Check size={10} className="sm:size-[12px]" />
                      </button>
                      <button onClick={() => setEditingBal(null)}
                        className="p-1.5 sm:p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                        <X size={10} className="sm:size-[12px]" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs sm:text-sm font-black tabular-nums font-mono">{fmt(b.balance)}</span>
                  )}
                  {!isAutoTracked && (
                    <button onClick={() => { setEditingBal(i); setEditValue(b.balance); setEditLast4(b.account_last4 || ''); }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-all">
                      <Pencil size={10} className="sm:size-[12px] text-slate-500" />
                    </button>
                  )}
                  {isManual && (
                    <button onClick={() => handleDeleteBalance(b.bank, b.account_last4)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 sm:p-2 hover:bg-rose-500/10 rounded-lg transition-all">
                      <Trash2 size={10} className="sm:size-[12px] text-rose-400" />
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
            ) : Object.entries(aliases.reduce((g, a) => {
              const key = a.display_name || 'Unnamed';
              (g[key] = g[key] || []).push(a);
              return g;
            }, {})).map(([name, items]) => {
              const isOpen = expandedAliasGroups[name] ?? false;
              return (
                <div key={name} className="bg-[#0a0c10] border border-white/5 rounded-2xl overflow-hidden">
                  <button onClick={() => setExpandedAliasGroups(p => ({ ...p, [name]: !(p[name] ?? false) }))}
                    className="w-full flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 hover:bg-white/[0.02] transition-all">
                    <div className="flex items-center gap-2 min-w-0">
                      {isOpen ? <ChevronDown size={12} className="text-slate-500 shrink-0" /> : <ChevronRight size={12} className="text-slate-500 shrink-0" />}
                      <span className="text-xs sm:text-sm font-bold text-indigo-300">{name}</span>
                      <span className="text-[8px] px-1.5 py-0.5 bg-white/10 rounded-full">{items.length}</span>
                      {items[0].category && <span className="text-[8px] text-slate-500">· {items[0].category}</span>}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 sm:px-6 pb-3 space-y-1 border-t border-white/5 pt-2">
                      {items.map((a, i) => (
                        <div key={a.id || i} className="flex items-center justify-between group hover:bg-white/[0.02] rounded-lg px-2 py-1.5 transition-all">
                          <p className="text-[8px] sm:text-[10px] text-slate-600 truncate font-mono flex-1 min-w-0">
                            {a.recipient_pattern?.slice(0, 50)}
                          </p>
                          <button onClick={() => handleDeleteAlias(a.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-500/10 rounded-lg transition-all shrink-0 ml-2">
                            <Trash2 size={8} className="text-rose-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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