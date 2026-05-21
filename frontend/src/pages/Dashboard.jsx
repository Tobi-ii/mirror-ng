import { useState, useRef } from 'react';
import { 
  LayoutDashboard, History, LogOut, Brain, MessageSquare, Settings as LucideSettings 
} from 'lucide-react';
import { api } from '../services/api';

import FloatingNavItem from "../components/FloatingNavItem";
import BankCard from "../components/BankCard";
import SpendChart from "../components/SpendChart";
import InsightsPanel from "./InsightsPanel";
import AgentChat from "./AgentChat";
import SessionOnboarding from "../components/SessionOnboarding";
import DashboardHeader from "../components/DashboardHeader";
import ExecutiveDashboard from "./ExecutiveDashboard";
import { Settings } from "./Settings";
import CustomSelect from "../components/CustomSelect";
import MLGroupView from "../components/MLGroupView";

const SUPPORTED_BANKS = [
  'Sterling Bank', 'Wema (ALAT)', 'GTBank', 'Access Bank',
  'First Bank', 'Kuda', 'OPay', 'Moniepoint', 'PalmPay',
  'Piggyvest', 'Cowrywise', 'Other',
];

function AddManualCard({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [bank, setBank] = useState('Piggyvest');
  const [last4, setLast4] = useState('');
  const [balance, setBalance] = useState('');

  const handleAdd = () => {
    if (!balance) return;
    onAdd(bank, last4 || '0000', balance);
    setOpen(false);
    setBank('Piggyvest');
    setLast4('');
    setBalance('');
  };

  if (!open) return (
    <div onClick={() => setOpen(true)}
      className="h-44 w-32 flex-shrink-0 rounded-[2.5rem] border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-indigo-500/50 hover:bg-white/5 transition-all group">
      <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-indigo-500/20 transition-all">
        <span className="text-xl text-slate-500 group-hover:text-indigo-400 font-light">+</span>
      </div>
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 group-hover:text-slate-400 text-center leading-relaxed">Add<br/>Account</p>
    </div>
  );

  return (
    <div className="h-44 w-[280px] flex-shrink-0 rounded-[2.5rem] bg-[#0a0c10] border border-white/10 p-5 flex flex-col justify-between shadow-2xl animate-in fade-in zoom-in-95 duration-300">
      <CustomSelect
        value={bank}
        onChange={setBank}
        options={SUPPORTED_BANKS}
        placeholder="Select bank"
      />
      <div className="flex gap-2">
        <input 
          type="text" 
          value={last4} 
          onChange={e => setLast4(e.target.value.slice(-4))}
          placeholder="Last 4" 
          maxLength={4}
          className="w-1/3 bg-white/5 border border-white/10 px-2 py-2 rounded-xl text-white text-[10px] font-mono outline-none text-center focus:border-indigo-500 transition-colors" 
        />
        <div className="relative flex-1">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-[10px] font-black">₦</span>
          <input 
            type="number" 
            value={balance} 
            onChange={e => setBalance(e.target.value)}
            placeholder="Balance"
            className="w-full bg-white/5 border border-white/10 pl-5 pr-2 py-2 rounded-xl text-white text-[10px] font-black outline-none focus:border-indigo-500 transition-colors" 
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button 
          onClick={handleAdd} 
          className="flex-1 py-2 bg-indigo-600 text-white text-[10px] font-black rounded-xl hover:bg-indigo-700 transition-colors"
        >
          Add
        </button>
        <button 
          onClick={() => setOpen(false)} 
          className="flex-1 py-2 bg-white/5 text-slate-400 text-[10px] font-black rounded-xl hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function Dashboard({ userId, onLogout }) {
  const [transactions, setTransactions] = useState([]);
  const [balances, setBalances] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isBlurred, setIsBlurred] = useState(false);
  const [hoverLabel, setHoverLabel] = useState('');
  const [bankFilter, setBankFilter] = useState('all');
  const [execMode, setExecMode] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const timerRef = useRef(null);
  const mainRef = useRef(null);

  const [sinceDate, setSinceDate] = useState('2026-04-30');
  const [untilDate, setUntilDate] = useState('2026-05-14');

  // ── Audit window filter ──────────────────────────────────────────────
  const auditFilteredTransactions = transactions.filter(tx => {
    if (!tx.timestamp) return false;
    const txDate = tx.timestamp.split('T')[0];
    return untilDate
      ? txDate >= sinceDate && txDate <= untilDate
      : txDate >= sinceDate;
  });

  // ── Alias application with original narration preservation ───────────
  const applyAliases = (txList) => {
    if (!aliases.length) return txList;
    return txList.map(tx => {
      const match = aliases.find(a =>
        tx.narration?.toLowerCase().includes(a.recipient_pattern.toLowerCase())
      );
      if (!match) return tx;
      return { 
        ...tx, 
        narration: match.display_name, 
        category: match.category, 
        aliased: true,
        original_narration: tx.narration
      };
    });
  };

  const aliasedTransactions = applyAliases(auditFilteredTransactions);

  // ── Balance display logic ────────────────────────────────────────────
  const syncedBanks = [...new Set(auditFilteredTransactions.map(t => t.bank))].map(bank => {
    const bankTxs = auditFilteredTransactions.filter(t => t.bank === bank);
    const existingBal = balances.find(b => b.bank === bank);
    const net = bankTxs.reduce((s, t) => t.tx_type === 'credit' ? s + t.amount : s - t.amount, 0);
    return {
      bank,
      account_last4: existingBal?.account_last4 || bankTxs[0]?.account_last4 || '????',
      balance: existingBal ? existingBal.balance : net,
      last_updated: existingBal?.last_updated || bankTxs[0]?.timestamp,
      isSynced: true
    };
  });

  const manualBanks = balances
    .filter(b => !syncedBanks.find(s => s.bank === b.bank))
    .map(b => ({ ...b, isSynced: false }));

  const displayBalances = [...syncedBanks, ...manualBanks]
    .sort((a, b) => a.isSynced === b.isSynced ? 0 : a.isSynced ? -1 : 1);

  // ── Derived stats (use aliased transactions) ─────────────────────────
  const aggregateLiquidity = displayBalances.reduce((s, b) => s + (b.balance || 0), 0);
  const totalIn = aliasedTransactions.filter(t => t.tx_type === 'credit').reduce((s, t) => s + t.amount, 0);
  const totalOut = aliasedTransactions.filter(t => t.tx_type === 'debit').reduce((s, t) => s + t.amount, 0);
  const banks = [...new Set(auditFilteredTransactions.map(t => t.bank))];
  const filteredTx = bankFilter === 'all'
    ? aliasedTransactions
    : aliasedTransactions.filter(t => t.bank === bankFilter);

  // ── API helpers ──────────────────────────────────────────────────────
  const loadAliases = async () => {
    try {
      const res = await api.getAliases(userId);
      if (res?.success) setAliases(res.aliases || []);
    } catch (e) {
      console.error('Failed to load aliases:', e);
    }
  };

  const refreshBalances = async () => {
    try {
      const balRes = await api.getBalances(userId);
      if (balRes?.success) setBalances(balRes.balances);
      await loadAliases();
    } catch (e) {
      console.error('Failed to refresh:', e);
    }
  };

  const refreshTransactions = async () => {
    try {
      const txRes = await api.getTransactions(userId, { limit: 1000 });
      if (txRes?.success) setTransactions(txRes.transactions);
      await loadAliases();
    } catch (e) {
      console.error('Failed to refresh transactions:', e);
    }
  };

  const closeSettings = () => {
    setShowSettings(false);
    refreshBalances();
  };

  const handleAddAccount = async (bank, last4, balance) => {
    await api.setInitialBalances(userId, [{
      bank, account_last4: last4 || '0000', balance: parseFloat(balance)
    }]);
    const balRes = await api.getBalances(userId);
    if (balRes?.success) setBalances(balRes.balances);
  };

  const handleScroll = () => {
    if (mainRef.current) setScrolled(mainRef.current.scrollTop > 30);
  };

  const handleInitialize = async (isSkip, accounts = []) => {
    if (isSkip) { setShowOnboarding(false); return; }
    setSyncing(true);
    try {
      const validAccounts = accounts
        .filter(a => a.balance && parseFloat(a.balance) > 0)
        .map(a => ({ bank: a.bank, account_last4: a.account_last4 || '0000', balance: parseFloat(a.balance) }));

      if (validAccounts.length > 0) await api.setInitialBalances(userId, validAccounts);

      const res = await api.syncTransactions(userId, sinceDate, untilDate || null);

      if (res?.success) {
        const [txRes, balRes] = await Promise.all([
          api.getTransactions(userId, { limit: 1000 }),
          api.getBalances(userId)
        ]);
        if (txRes?.success) setTransactions(txRes.transactions);
        if (balRes?.success) setBalances(balRes.balances);
        await loadAliases();
      }
      setShowOnboarding(false);
    } catch (e) {
      setShowOnboarding(false);
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  };

  const handleMouseEnter = (label) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHoverLabel(label);
    timerRef.current = setTimeout(() => setIsBlurred(true), 800);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsBlurred(false);
    setHoverLabel('');
  };

  const fmt = (n) => `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

  const BankFilterBar = () => (
    banks.length > 1 ? (
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setBankFilter('all')}
          className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-all ${bankFilter === 'all' ? 'bg-white text-black' : 'text-slate-500 hover:text-white'}`}>
          All
        </button>
        {banks.map(b => (
          <button key={b} onClick={() => setBankFilter(b)}
            className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-all ${bankFilter === b ? 'bg-white text-black' : 'text-slate-500 hover:text-white'}`}>
            {b.replace(' Bank', '').replace(' (ALAT)', '')}
          </button>
        ))}
      </div>
    ) : null
  );

  return (
    <div className="relative min-h-screen bg-[#050608] text-white overflow-hidden">
      {/* Blur overlay */}
      <div className={`fixed inset-0 z-[95] transition-all duration-700 pointer-events-none ${isBlurred ? 'backdrop-blur-[64px] bg-black/80 opacity-100' : 'backdrop-blur-0 opacity-0'}`} />
      
      {isBlurred && (
        <div className="fixed inset-0 flex items-center justify-center z-[96] pointer-events-none text-center px-6">
          <h2 className="text-[12vw] font-black italic uppercase tracking-tighter text-white animate-in zoom-in-95 duration-700 leading-none">{hoverLabel}</h2>
        </div>
      )}

      {showOnboarding && (
        <SessionOnboarding
          sinceDate={sinceDate} setSinceDate={setSinceDate}
          untilDate={untilDate} setUntilDate={setUntilDate}
          onExecute={handleInitialize} syncing={syncing}
        />
      )}

      {/* Settings */}
      {showSettings && (
        <div className="fixed inset-0 z-[90] overflow-y-auto pointer-events-auto bg-[#050608]">
          <Settings
            userId={userId}
            onBack={closeSettings}
            onLogout={onLogout}
            transactions={auditFilteredTransactions}
            onDataChanged={refreshBalances}
          />
        </div>
      )}

      {/* Main content */}
      <main 
        ref={mainRef} 
        onScroll={handleScroll}
        className={`h-screen overflow-y-auto will-change-transform ${
          isBlurred ? 'scale-[0.92] opacity-5 transition-all duration-700' : 'scale-100 opacity-100'
        }`}
        style={{ backfaceVisibility: 'hidden' }}
      >
        <DashboardHeader
          sinceDate={sinceDate} untilDate={untilDate}
          onNewAudit={() => setShowOnboarding(true)}
          execMode={execMode}
          onToggleExec={() => setExecMode(prev => !prev)}
        />

        <div className="p-8 pb-32 max-w-[1700px] mx-auto space-y-10">

          {/* Hero */}
          <section className="space-y-4 text-center flex flex-col items-center w-full">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
              <p className="text-[11px] font-black uppercase tracking-[0.5em] text-white/50">
                {execMode && activeTab === 'dashboard' ? 'Executive View' : 'The Mirror'}
              </p>
            </div>
            {activeTab === 'dashboard' && (
              <>
                <h1 className="text-[7.5vw] font-black tracking-tighter italic tabular-nums leading-none text-center w-full">
                  {fmt(aggregateLiquidity)}
                </h1>
                <div className="flex items-center justify-center gap-12 text-sm pt-2">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Inflow</span>
                    <span className="text-emerald-400 font-black font-mono text-xl">+{fmt(totalIn)}</span>
                  </div>
                  <div className="w-[1px] h-12 bg-white/5" />
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Accounts</span>
                    <span className="text-indigo-400 font-black font-mono text-xl">{displayBalances.length}</span>
                  </div>
                  <div className="w-[1px] h-12 bg-white/5" />
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Outflow</span>
                    <span className="text-rose-400 font-black font-mono text-xl">-{fmt(totalOut)}</span>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Executive mode */}
          {activeTab === 'dashboard' && execMode && (
            <ExecutiveDashboard transactions={aliasedTransactions} />
          )}

          {activeTab === 'dashboard' && !execMode && (
            <>
              <div className="relative group/scroll">
                <div className="flex gap-6 overflow-x-auto pb-8 scrollbar-hide px-2 items-center">
                  {displayBalances.length > 3 && <AddManualCard onAdd={handleAddAccount} />}
                  {displayBalances.map((b, i) => (
                    <BankCard
                      key={i}
                      bank={b.bank}
                      account_last4={b.account_last4}
                      balance={b.balance}
                      last_updated={b.last_updated}
                      onClick={() => setBankFilter(prev => prev === b.bank ? 'all' : b.bank)}
                      totalCredit={aliasedTransactions.filter(t => t.bank === b.bank && t.tx_type === 'credit').reduce((s, t) => s + t.amount, 0)}
                      totalDebit={aliasedTransactions.filter(t => t.bank === b.bank && t.tx_type === 'debit').reduce((s, t) => s + t.amount, 0)}
                    />
                  ))}
                  <AddManualCard onAdd={handleAddAccount} />
                  <div className="w-64 shrink-0" />
                </div>
                <div className="absolute top-0 right-0 h-full w-48 bg-gradient-to-l from-[#050608] via-[#050608]/80 to-transparent pointer-events-none z-20" />
              </div>

              {/* Grid layout containing updated stretch alignments */}
              <div className={`grid grid-cols-1 lg:grid-cols-3 gap-16 pt-4 ${auditExpanded ? 'items-start' : 'items-stretch'}`}>
                <div className={`lg:col-span-2 flex flex-col ${auditExpanded ? '' : 'h-full'}`}>
                  <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 text-white">Audit Trail</h3>
                    <BankFilterBar />
                  </div>
                  <div className={`bg-[#0a0c10]/40 rounded-[3.5rem] border border-white/5 p-8 ${auditExpanded ? '' : 'flex-1 h-full'}`}>
                    <MLGroupView 
                      transactions={filteredTx}
                      userId={userId}
                      onAliasUpdate={refreshTransactions}
                      onViewChange={setAuditExpanded}
                    />
                  </div>
                </div>
                <div className={`flex flex-col ${auditExpanded ? '' : 'h-full'}`}>
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 text-white mb-6">Volume Logic</h3>
                  <div className="flex-1 h-full">
                    <SpendChart transactions={aliasedTransactions} />
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'ask' && <AgentChat userId={userId} />}
          {activeTab === 'insights' && <InsightsPanel userId={userId} />}

          {activeTab === 'history' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h3 className="text-xs font-black uppercase tracking-[0.3em] opacity-20 text-white">Audit Feed</h3>
                <BankFilterBar />
              </div>
              <div className="bg-[#0a0c10]/40 border border-white/5 rounded-[3.5rem] p-8 max-w-5xl mx-auto min-h-[420px]">
                <MLGroupView 
                  transactions={filteredTx}
                  userId={userId}
                  onAliasUpdate={refreshTransactions}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Navigation */}
      <nav className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 p-4 bg-[#0a0c10]/80 backdrop-blur-3xl border border-white/10 rounded-full shadow-2xl transition-all duration-500 ${scrolled ? 'opacity-100' : 'opacity-20 hover:opacity-100'}`}>
        <FloatingNavItem 
          icon={<LayoutDashboard size={22} />} 
          label="The Mirror"
          active={activeTab === 'dashboard' && !showSettings}
          onMouseEnter={() => handleMouseEnter('The Mirror')}
          onMouseLeave={handleMouseLeave}
          onClick={() => { setActiveTab('dashboard'); setShowSettings(false); handleMouseLeave(); }} 
        />
        <FloatingNavItem 
          icon={<MessageSquare size={22} />} 
          label="Ask Mirror"
          active={activeTab === 'ask' && !showSettings}
          onMouseEnter={() => handleMouseEnter('Ask Mirror')}
          onMouseLeave={handleMouseLeave}
          onClick={() => { setActiveTab('ask'); setShowSettings(false); handleMouseLeave(); }} 
        />
        <FloatingNavItem 
          icon={<Brain size={22} />} 
          label="Insights"
          active={activeTab === 'insights' && !showSettings}
          onMouseEnter={() => handleMouseEnter('Insights')}
          onMouseLeave={handleMouseLeave}
          onClick={() => { setActiveTab('insights'); setShowSettings(false); handleMouseLeave(); }} 
        />
        <FloatingNavItem 
          icon={<History size={22} />} 
          label="Audit Feed"
          active={activeTab === 'history' && !showSettings}
          onMouseEnter={() => handleMouseEnter('Audit Feed')}
          onMouseLeave={handleMouseLeave}
          onClick={() => { setActiveTab('history'); setShowSettings(false); handleMouseLeave(); }} 
        />
        <FloatingNavItem 
          icon={<LucideSettings size={22} />} 
          label="Settings"
          active={showSettings}
          onMouseEnter={() => handleMouseEnter('Settings')}
          onMouseLeave={handleMouseLeave}
          onClick={() => { setShowSettings(true); handleMouseLeave(); }} 
        />
        <div className="w-[1px] h-8 bg-white/10 mx-2" />
        <button onClick={onLogout} className="p-5 text-red-500/40 hover:text-red-500 transition-all rounded-full">
          <LogOut size={22} />
        </button>
      </nav>
    </div>
  );
}