// Dashboard.jsx — The main screen after login. Shows balances, transactions,
// charts, agent chat, insights, settings. All the core functionality lives here.
import { useState, useRef, useEffect } from 'react';
import { 
  LayoutDashboard, History, LogOut, Brain, MessageSquare, Settings as LucideSettings,
  ChevronDown, ChevronRight, CheckCircle2, FolderOpen 
} from 'lucide-react';
import { api } from '../services/api';
import TransactionList, { getMLSuggestion } from '../components/TransactionRow';

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
import OnboardingGapsModal from '../components/OnboardingGapsModal';

// The list of banks users can choose from when manually adding an account
const SUPPORTED_BANKS = [
  'Sterling Bank', 'Wema (ALAT)', 'GTBank', 'Access Bank',
  'First Bank', 'Kuda', 'OPay', 'Moniepoint', 'PalmPay',
  'Piggyvest', 'Cowrywise', 'Other',
];

// The "+ Add Account" card that appears alongside the balance cards.
// Clicking it opens an inline form where you pick a bank, last 4 digits, and starting balance.
function AddManualCard({ onAdd }) {
  const [open, setOpen] = useState(false);    // is the form expanded?
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
      className="h-32 sm:h-36 md:h-44 w-24 sm:w-28 md:w-32 flex-shrink-0 rounded-2xl sm:rounded-[2rem] md:rounded-[2.5rem] border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-2 sm:gap-3 md:gap-4 cursor-pointer hover:border-indigo-500/50 hover:bg-white/5 transition-all group">
      <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-indigo-500/20 transition-all">
        <span className="text-xl text-slate-500 group-hover:text-indigo-400 font-light">+</span>
      </div>
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 group-hover:text-slate-400 text-center leading-relaxed">Add<br/>Account</p>
    </div>
  );

  return (
    <div className="h-36 sm:h-40 md:h-44 w-[220px] sm:w-[250px] md:w-[280px] flex-shrink-0 rounded-2xl sm:rounded-[2rem] md:rounded-[2.5rem] bg-[#0a0c10] border border-white/10 p-4 sm:p-5 flex flex-col justify-between shadow-2xl animate-in fade-in zoom-in-95 duration-300">
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

export default function Dashboard({ userId, onLogout, onCloudSyncChange }) {
  // ── Data state (loaded from API / local storage) ────────────────────
  const [transactions, setTransactions] = useState([]);     // all bank transactions
  const [balances, setBalances] = useState([]);              // bank account balances
  const [aliases, setAliases] = useState([]);                // user-defined transaction name aliases
  const [syncing, setSyncing] = useState(false);              // true while syncing with email

  // ── UI state ─────────────────────────────────────────────────────────
  const [auditExpanded, setAuditExpanded] = useState(false);  // show full audit trail?
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem(`mirror_onboarded_${userId}`));
  const [showSettings, setShowSettings] = useState(false);
  const [showGaps, setShowGaps] = useState(false);            // show banking gaps after sync
  const [activeTab, setActiveTab] = useState('dashboard');    // 'dashboard' | 'ask' | 'insights' | 'history'
  const [isBlurred, setIsBlurred] = useState(false);           // blur overlay for nav hover effect
  const [hoverLabel, setHoverLabel] = useState('');             // text shown during blur
  const [bankFilter, setBankFilter] = useState('all');          // filter transactions by bank
  const [execMode, setExecMode] = useState(false);             // executive dashboard mode
  const [scrolled, setScrolled] = useState(false);              // has user scrolled?
  const [drilldownCategory, setDrilldownCategory] = useState(null); // category to auto-expand in Audit Feed
  const [isMobile, setIsMobile] = useState(false);              // is the viewport mobile-sized?
  const timerRef = useRef(null);   // tracks the blur-effect hover timer
  const mainRef = useRef(null);     // reference to the scrollable main container

  // Detect mobile vs desktop layout (re-checks on resize)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Once onboarding is dismissed, mark it so it doesn't show again on reload
  useEffect(() => {
    if (!showOnboarding) localStorage.setItem(`mirror_onboarded_${userId}`, 'true');
  }, [showOnboarding, userId]);

  // If the user is already onboarded (page refresh), load data from the API
  useEffect(() => {
    if (userId && !showOnboarding) {
      refreshTransactions();
      refreshBalances();
    }
  }, [userId]);

  const [sinceDate, setSinceDate] = useState('2026-01-01');  // start of the audit window
  const [untilDate, setUntilDate] = useState(null);            // end date (null = no end)

  // ── Audit window filter ──────────────────────────────────────────────
  // Only show transactions within the sinceDate → untilDate range
  const auditFilteredTransactions = transactions.filter(tx => {
    if (!tx.timestamp) return false;
    const txDate = tx.timestamp.split('T')[0];
    return untilDate
      ? txDate >= sinceDate && txDate <= untilDate
      : txDate >= sinceDate;
  });

  // ── Apply aliases to transactions ─────────────────────────────────────
  // Replaces raw bank narration text with user-friendly names (e.g.
  // "POS DEBIT WDF*UBER TRIP" → "Uber"). Also applies ML suggestions.
  const applyAliases = (txList) => {
    return txList.map(tx => {
      const match = aliases.length > 0 ? aliases.find(a =>
        tx.narration?.toLowerCase().includes(a.recipient_pattern.toLowerCase())
      ) : null;
      if (match) {
        return { 
          ...tx, 
          narration: match.display_name, 
          category: match.category, 
          aliased: true,
          original_narration: tx.narration
        };
      }
      // Apply frontend ML suggestion for display category (fixes misclassified backend categories)
      const suggestion = getMLSuggestion(tx.narration || '');
      if (suggestion) {
        return { ...tx, category: suggestion.category };
      }
      return tx;
    });
  };

  // Transactions with aliases applied (used everywhere in the UI)
  const aliasedTransactions = applyAliases(auditFilteredTransactions);

  // ── Balance display logic ────────────────────────────────────────────
  // Deduplicate by (bank + last4) — accounts with different last4s are separate
  // Normalize null/empty last4 to '0000' so OPay (parser sets null) and manual entries match
  //    • If two entries exist for the same bank + last4:
  //      prefer the auto-tracked one (non-anchor) over the manual anchor
  //      prefer the one with a real last4 over one with '0000'
  const normLast4 = (v) => (v || '0000');
  const dedupedBalances = [];
  const seenKeys = new Set();
  (balances || []).forEach(b => {
    const key = `${b.bank}::${normLast4(b.account_last4)}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      dedupedBalances.push(b);
    } else {
      // Replace existing if this one is non-anchor (auto-tracked) or has real last4
      const idx = dedupedBalances.findIndex(x => `${x.bank}::${normLast4(x.account_last4)}` === key);
      const existing = dedupedBalances[idx];
      if ((!b.is_anchor && existing.is_anchor) || (normLast4(b.account_last4) !== '0000' && normLast4(existing.account_last4) === '0000')) {
        dedupedBalances[idx] = b;
      }
    }
  });

  // Build a list of banks that have transaction data (synced from email alerts).
  // Their balance is calculated as: manual anchor balance OR net credit/debit sum.
  const syncedBanks = [...new Set(auditFilteredTransactions.map(t => `${t.bank}::${normLast4(t.account_last4)}`))].map(key => {
    const [bank, last4] = key.split('::');
    const bankTxs = auditFilteredTransactions.filter(t => t.bank === bank && normLast4(t.account_last4) === last4);
    const existingBal = dedupedBalances.find(b => `${b.bank}::${normLast4(b.account_last4)}` === key);
    const net = bankTxs.reduce((s, t) => t.tx_type === 'credit' ? s + t.amount : s - t.amount, 0);
    return {
      bank,
      account_last4: existingBal?.account_last4 || bankTxs[0]?.account_last4 || '????',
      balance: existingBal ? existingBal.balance : net,
      last_updated: existingBal?.last_updated || bankTxs[0]?.timestamp,
      isSynced: true
    };
  });

  // Banks that have a manual balance entry but no synced transactions
  const manualBanks = dedupedBalances
    .filter(b => !syncedBanks.find(s => s.bank === b.bank && normLast4(s.account_last4) === normLast4(b.account_last4)))
    .map(b => ({ ...b, isSynced: false }));

  // Final combined list: synced banks first, then manual-only banks
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

  // ── API helpers: load data from backend (or local storage) ──────────
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

  // Close settings panel and refresh balance data
  const closeSettings = () => {
    setShowSettings(false);
    refreshBalances();
  };

  // Add a new bank account manually (with starting balance)
  const handleAddAccount = async (bank, last4, balance) => {
    try {
      const res = await api.setInitialBalances(userId, [{
        bank, account_last4: last4 || '0000', balance: parseFloat(balance)
      }]);
      if (!res?.success) {
        console.error('Failed to add account:', res);
        return;
      }
      const balRes = await api.getBalances(userId);
      if (balRes?.success) setBalances(balRes.balances);
    } catch (e) {
      console.error('Failed to add account:', e);
    }
  };

  const handleScroll = () => {
    if (mainRef.current) setScrolled(mainRef.current.scrollTop > 30);
  };

  const handleInitialize = async (isSkip, accounts = []) => {
    if (isSkip) { setShowOnboarding(false); refreshTransactions(); return; }
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
        
        // Show gaps modal if new transactions were synced
        if (res.total_synced > 0) {
          setShowGaps(true);
        }
      }
      setShowOnboarding(false);
    } catch (e) {
      console.error('Sync failed:', e);
      setShowOnboarding(false);
      await refreshTransactions();
    } finally {
      setSyncing(false);
    }
  };

  // Manually trigger a sync: fetch new transactions from the connected email
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.syncTransactions(userId, sinceDate, untilDate || null);
      if (res?.success) {
        const [txRes, balRes] = await Promise.all([
          api.getTransactions(userId, { limit: 1000 }),
          api.getBalances(userId)
        ]);
        if (txRes?.success) setTransactions(txRes.transactions);
        if (balRes?.success) setBalances(balRes.balances);
        await loadAliases();
        
        // Show gaps modal if new transactions were synced
        if (res.total_synced > 0) {
          setShowGaps(true);
        }
      }
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  };

  // Hover over a nav item → after 800ms, blur the whole screen and show a giant label
  // This is a visual gimmick — not functional, just a nice UI touch
  const handleMouseEnter = (label) => {
    if (isMobile) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setHoverLabel(label);
    timerRef.current = setTimeout(() => setIsBlurred(true), 800);
  };

  // Mouse leaves the nav item → remove blur immediately
  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsBlurred(false);
    setHoverLabel('');
  };

  // Format a number as Nigerian Naira, e.g. ₦1,234,567.89
  const fmt = (n) => `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

  // A row of buttons to filter transactions by bank
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
      {/* Black overlay that blurs the screen when hovering nav items */}
      <div className={`fixed inset-0 z-[95] transition-all duration-700 pointer-events-none ${isBlurred ? 'backdrop-blur-[64px] bg-black/80 opacity-100' : 'backdrop-blur-0 opacity-0'}`} />
      
      {isBlurred && (
        <div className="fixed inset-0 flex items-center justify-center z-[96] pointer-events-none text-center px-6">
          <h2 className="text-[12vw] font-black italic uppercase tracking-tighter text-white animate-in zoom-in-95 duration-700 leading-none">{hoverLabel}</h2>
        </div>
      )}

      {/* OnboardingGapsModal */}
      <OnboardingGapsModal
        userId={userId}
        isOpen={showGaps}
        onClose={() => setShowGaps(false)}
        onComplete={() => { 
          setShowGaps(false); 
          refreshTransactions();
        }}
      />

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
            transactions={transactions}
            onDataChanged={refreshBalances}
            onCloudSyncChange={onCloudSyncChange}
          />
        </div>
      )}

      {/* Main content */}
      <main 
        ref={mainRef} 
        onScroll={handleScroll}
        className={`h-screen overflow-y-auto will-change-transform pb-36 ${
          isBlurred ? 'scale-[0.92] opacity-5 transition-all duration-700' : 'scale-100 opacity-100'
        }`}
        style={{ backfaceVisibility: 'hidden' }}
      >
        {/* Top bar: sync button, date range picker, executive mode toggle */}
        <DashboardHeader
          sinceDate={sinceDate} untilDate={untilDate}
          onNewAudit={() => { localStorage.removeItem(`mirror_onboarded_${userId}`); setShowOnboarding(true); }}
          execMode={execMode}
          onToggleExec={() => setExecMode(prev => !prev)}
          onSync={handleSync}
          syncing={syncing}
        />

        <div className="p-4 sm:p-8 max-w-[1700px] mx-auto space-y-6 sm:space-y-10">

          {/* Hero: total liquidity, inflow, outflow, account count */}
          <section className="space-y-4 text-center flex flex-col items-center w-full">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
              <p className="text-[11px] font-black uppercase tracking-[0.5em] text-white/50">
                {execMode && activeTab === 'dashboard' ? 'Executive View' : 'The Mirror'}
              </p>
            </div>
            {activeTab === 'dashboard' && (
              <>
                <h1 className="text-[10vw] sm:text-[7.5vw] font-black tracking-tighter italic tabular-nums leading-none text-center w-full max-w-[90vw] sm:max-w-none break-all truncate sm:truncate-none px-2">
                  {fmt(aggregateLiquidity)}
                </h1>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-12 text-sm pt-2 w-full sm:w-auto">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Inflow</span>
                    <span className="text-emerald-400 font-black font-mono text-lg sm:text-xl">+{fmt(totalIn)}</span>
                  </div>
                  <div className="w-12 sm:w-[1px] h-[1px] sm:h-12 bg-white/5" />
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Accounts</span>
                    <span className="text-indigo-400 font-black font-mono text-lg sm:text-xl">{displayBalances.length}</span>
                  </div>
                  <div className="w-12 sm:w-[1px] h-[1px] sm:h-12 bg-white/5" />
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Outflow</span>
                    <span className="text-rose-400 font-black font-mono text-lg sm:text-xl">-{fmt(totalOut)}</span>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Executive mode: high-level overview for power users */}
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
              <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-10 lg:gap-16 pt-4 ${auditExpanded ? 'items-start' : 'items-stretch'}`}>
                {(filteredTx.length > 0 && filteredTx.every(tx => tx.aliased)) ? (
                  <>
                    <div className="lg:col-span-2 flex flex-col">
                      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 text-white">Audit Trail</h3>
                        <BankFilterBar />
                      </div>
                      <div className="bg-[#0a0c10]/40 rounded-2xl sm:rounded-[3.5rem] border border-white/5 p-4 sm:p-8 flex flex-col gap-4">
                        <div className="text-center">
                          <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2 opacity-50" />
                          <h2 className="text-sm font-black uppercase tracking-wider text-white/80">All Categorized</h2>
                          <p className="text-[11px] text-slate-500 mt-1">{filteredTx.length} transactions · click a category to drill down</p>
                        </div>
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                          {Object.entries(
                            filteredTx.reduce((acc, tx) => {
                              const cat = tx.category || 'General';
                              (acc[cat] = acc[cat] || []).push(tx);
                              return acc;
                            }, {})
                          ).sort((a, b) => b[1].length - a[1].length).map(([cat, txs]) => {
                            const total = txs.reduce((s, t) => s + t.amount, 0);
                            return (
                              <button
                                key={cat}
                                onClick={() => { setDrilldownCategory(cat); setActiveTab('history'); }}
                                className="flex-shrink-0 w-44 sm:w-52 bg-indigo-500/5 hover:bg-indigo-500/15 border border-white/5 hover:border-indigo-500/30 rounded-xl sm:rounded-2xl p-4 sm:p-5 text-left transition-all group"
                              >
                                <div className="text-[16px] font-black text-indigo-400 group-hover:text-indigo-300 transition-colors">{cat}</div>
                                <div className="text-[10px] text-slate-500 mt-1.5 font-mono">{txs.length} txns</div>
                                <div className="text-xs font-bold text-white/70 mt-1 font-mono">₦{total.toLocaleString('en-NG')}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <div className={`flex flex-col ${auditExpanded ? '' : 'h-full'}`}>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 text-white mb-6">Volume Logic</h3>
                      <div className="flex-1 h-full">
                        <SpendChart transactions={aliasedTransactions} />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`lg:col-span-2 flex flex-col ${auditExpanded ? '' : 'h-full'}`}>
                      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 text-white">Audit Trail</h3>
                        <BankFilterBar />
                      </div>
                      <div className={`bg-[#0a0c10]/40 rounded-2xl sm:rounded-[3.5rem] border border-white/5 p-4 sm:p-8 ${auditExpanded ? '' : 'flex-1 h-full'}`}>
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
                  </>
                )}
              </div>
            </>
          )}

          {activeTab === 'ask' && <AgentChat userId={userId} sinceDate={sinceDate} untilDate={untilDate} />}
          {activeTab === 'insights' && <InsightsPanel userId={userId} />}

          {activeTab === 'history' && (() => {
            const allAliased = filteredTx.length > 0 && filteredTx.every(tx => tx.aliased);

            if (!allAliased) {
              return (
                <div className="space-y-6">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.3em] opacity-20 text-white">Audit Feed</h3>
                    <BankFilterBar />
                  </div>
                  <div className="bg-[#0a0c10]/40 border border-white/5 rounded-2xl sm:rounded-[3.5rem] p-4 sm:p-8 max-w-5xl mx-auto min-h-[420px]">
                    <MLGroupView 
                      transactions={filteredTx}
                      userId={userId}
                      onAliasUpdate={refreshTransactions}
                    />
                  </div>
    </div>
  );
}

// ── Category Group (for drill-down in fully-aliased audit feed) ─────
function CategoryGroup({ category, transactions, userId, refreshTransactions, startExpanded }) {
  const [expanded, setExpanded] = useState(startExpanded || false);

  const total = transactions.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 hover:bg-white/[0.03] transition-all">
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? <ChevronDown size={12} className="text-slate-500 shrink-0" /> : <ChevronRight size={12} className="text-slate-500 shrink-0" />}
          <FolderOpen size={14} className="text-indigo-400 shrink-0" />
          <span className="text-xs sm:text-sm font-bold text-indigo-300">{category}</span>
          <span className="text-[8px] px-1.5 py-0.5 bg-white/10 rounded-full text-slate-400">{transactions.length}</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">
          ₦{total.toLocaleString('en-NG')}
        </span>
      </button>
      {expanded && (
        <div className="px-2 pb-3 space-y-1 border-t border-white/5 pt-2 max-h-[400px] overflow-y-auto">
          <TransactionList
            transactions={transactions}
            userId={userId}
            onAliasUpdate={refreshTransactions}
          />
        </div>
      )}
    </div>
  );
}

            const categoryGroups = {};
            filteredTx.forEach(tx => {
              const cat = tx.category || 'General';
              if (!categoryGroups[cat]) categoryGroups[cat] = [];
              categoryGroups[cat].push(tx);
            });

            return (
              <div className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.3em] opacity-20 text-white">Audit Feed</h3>
                  <BankFilterBar />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                  {/* Left: All Categorized summary */}
                  <div className="lg:col-span-2 bg-[#0a0c10]/40 border border-white/5 rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 flex flex-col items-center justify-center text-center min-h-[420px]">
                    <CheckCircle2 size={48} className="text-emerald-500 mb-4 opacity-50" />
                    <h2 className="text-lg font-black uppercase tracking-wider text-white">All Categorized</h2>
                    <p className="text-xs text-slate-500 mt-2">Every transaction has been assigned a group.</p>
                    <p className="mt-6 text-[10px] text-slate-600 font-mono">
                      {filteredTx.length} transactions
                    </p>
                  </div>
                  {/* Right: Category groups with drill-down */}
                  <div className="lg:col-span-3 space-y-3 max-h-[600px] overflow-y-auto">
                    {Object.entries(categoryGroups).sort((a, b) => b[1].length - a[1].length).map(([cat, txs]) => (
                      <CategoryGroup key={cat} category={cat} transactions={txs} userId={userId} refreshTransactions={refreshTransactions} startExpanded={cat === drilldownCategory} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </main>

      {/* Navigation */}
      <nav className={`fixed bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-0.5 sm:gap-3 p-1.5 sm:p-4 bg-[#0a0c10]/80 backdrop-blur-3xl border border-white/10 rounded-full shadow-2xl transition-all duration-500 ${scrolled ? 'opacity-100' : 'opacity-20 hover:opacity-100'}`}>
        <FloatingNavItem 
          icon={<LayoutDashboard size={18} />} 
          label="The Mirror"
          active={activeTab === 'dashboard' && !showSettings}
          onMouseEnter={() => handleMouseEnter('The Mirror')}
          onMouseLeave={handleMouseLeave}
          onClick={() => { setActiveTab('dashboard'); setShowSettings(false); handleMouseLeave(); }} 
        />
        <FloatingNavItem 
          icon={<MessageSquare size={18} />} 
          label="Ask Mirror"
          active={activeTab === 'ask' && !showSettings}
          onMouseEnter={() => handleMouseEnter('Ask Mirror')}
          onMouseLeave={handleMouseLeave}
          onClick={() => { setActiveTab('ask'); setShowSettings(false); handleMouseLeave(); }} 
        />
        <FloatingNavItem 
          icon={<Brain size={18} />} 
          label="Insights"
          active={activeTab === 'insights' && !showSettings}
          onMouseEnter={() => handleMouseEnter('Insights')}
          onMouseLeave={handleMouseLeave}
          onClick={() => { setActiveTab('insights'); setShowSettings(false); handleMouseLeave(); }} 
        />
        <FloatingNavItem 
          icon={<History size={18} />} 
          label="Audit Feed"
          active={activeTab === 'history' && !showSettings}
          onMouseEnter={() => handleMouseEnter('Audit Feed')}
          onMouseLeave={handleMouseLeave}
          onClick={() => { setActiveTab('history'); setShowSettings(false); handleMouseLeave(); }} 
        />
        <FloatingNavItem 
          icon={<LucideSettings size={18} />} 
          label="Settings"
          active={showSettings}
          onMouseEnter={() => handleMouseEnter('Settings')}
          onMouseLeave={handleMouseLeave}
          onClick={() => { setShowSettings(true); handleMouseLeave(); }} 
        />
        <div className="w-[1px] h-6 sm:h-8 bg-white/10 mx-1 sm:mx-2" />
        <button onClick={onLogout} className="p-3 sm:p-5 text-red-500/40 hover:text-red-500 transition-all rounded-full">
          <LogOut size={18} />
        </button>
      </nav>
    </div>
  );
}
