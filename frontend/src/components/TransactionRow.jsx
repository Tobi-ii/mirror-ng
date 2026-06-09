import { useState, useEffect } from 'react';
import { 
  ArrowDownLeft, ArrowUpRight, Pencil, Check, X, Brain, Sparkles, 
  ChevronDown, ChevronRight, CheckCircle2, Layers, Tags, FolderOpen 
} from 'lucide-react';
import { api } from '../services/api';
import AliasSpreadModal from './AliasSpreadModal';

// Returns count of non-aliased transactions whose narration contains `pattern`,
// excluding any narrations in `excludeNarrations` (used to avoid counting the
// transaction(s) the user is intentionally aliasing).
// Also excludes transactions that already match an ML group, so alias spread
// doesn't pull ML-grouped transactions out of their groups.
function countOtherMatches(allTransactions, pattern, excludeNarrations = []) {
  const p = pattern.toLowerCase();
  return allTransactions.filter(tx => {
    if (tx.aliased) return false;
    const nar = (tx.original_narration || tx.narration || '').toLowerCase();
    if (!nar.includes(p)) return false;
    // Skip the transaction(s) being aliased
    if (excludeNarrations.some(ex => nar === ex.toLowerCase())) return false;
    // Skip transactions that already match an ML group
    if (getMLSuggestion(tx.original_narration || tx.narration || '')) return false;
    return true;
  }).length;
}

const BANK_COLORS = {
  'Sterling Bank': {
    border: 'border-l-purple-600',
    bg: 'hover:bg-purple-950/20',
    dot: 'bg-purple-600',
    creditIcon: 'bg-emerald-500/10 text-emerald-400',
    debitIcon: 'bg-purple-500/10 text-purple-400',
  },
  'Wema (ALAT)': {
    border: 'border-l-rose-600',
    bg: 'hover:bg-rose-950/20',
    dot: 'bg-rose-600',
    creditIcon: 'bg-emerald-500/10 text-emerald-400',
    debitIcon: 'bg-rose-500/10 text-rose-400',
  },
  default: {
    border: 'border-l-slate-600',
    bg: 'hover:bg-slate-900/20',
    dot: 'bg-slate-600',
    creditIcon: 'bg-emerald-500/10 text-emerald-400',
    debitIcon: 'bg-slate-500/10 text-slate-400',
  }
};

const CATEGORIES = [
  'Transfer', 'Utilities', 'Food', 'Transport', 'Shopping',
  'Entertainment', 'Health', 'Education', 'Fuel', 'Data & Airtime',
  'Family', 'Business', 'General', 'Salary'
];

const CATEGORY_COLORS = {
  Transfer: 'text-indigo-400 bg-indigo-500/10',
  Utilities: 'text-orange-400 bg-orange-500/10',
  Food: 'text-rose-400 bg-rose-500/10',
  Shopping: 'text-pink-400 bg-pink-500/10',
  Salary: 'text-emerald-400 bg-emerald-500/10',
  Transport: 'text-cyan-400 bg-cyan-500/10',
  Entertainment: 'text-purple-400 bg-purple-500/10',
  Health: 'text-red-400 bg-red-500/10',
  Education: 'text-blue-400 bg-blue-500/10',
  Fuel: 'text-yellow-400 bg-yellow-500/10',
  'Data & Airtime': 'text-teal-400 bg-teal-500/10',
  Family: 'text-pink-400 bg-pink-500/10',
  Business: 'text-indigo-400 bg-indigo-500/10',
  General: 'text-slate-500 bg-slate-500/10',
};

// ML Pattern Groups for auto-suggestions
const ML_GROUPS = [
  { pattern: /airtime|mtn|\bglo\b|airtel|9mobile/i, name: 'Airtime Purchase', category: 'Data & Airtime' },
  { pattern: /data purchase|data plan|internet/i, name: 'Data Purchase', category: 'Data & Airtime' },
  { pattern: /transfer to|sent to|payment to|nip transfer|transfer from|onebank transfer|\bpos\b|\batm\b|withdrawal/i, name: 'Bank Transfer', category: 'Transfer' },
  { pattern: /ebill|electric|ikeja|eko disco|abuja disco/i, name: 'Electricity Bill', category: 'Utilities' },
  { pattern: /vat|value added tax/i, name: 'VAT Charge', category: 'Utilities' },
  { pattern: /card maintenance|card fee/i, name: 'Card Fee', category: 'Utilities' },
  { pattern: /food|restaurant|cafe|eatery|mcdonald|kfc|chicken|rice/i, name: 'Food Purchase', category: 'Food' },
  { pattern: /uber|bolt|taxi|transport/i, name: 'Transport', category: 'Transport' },
  { pattern: /salary|wage|payment from/i, name: 'Salary', category: 'Salary' },
];

function getMLSuggestion(narration) {
  if (!narration) return null;
  for (const group of ML_GROUPS) {
    if (group.pattern.test(narration)) {
      return { display_name: group.name, category: group.category };
    }
  }
  return null;
}

// Group similar transactions by ML suggestion
function groupSimilarTransactions(transactions) {
  if (!transactions || transactions.length === 0) return { groups: {}, ungrouped: [] };
  
  const groups = {};
  const ungrouped = [];
  
  for (const tx of transactions) {
    const suggestion = getMLSuggestion(tx.original_narration || tx.narration);
    if (suggestion) {
      const key = suggestion.display_name;
      if (!groups[key]) {
        groups[key] = {
          display_name: suggestion.display_name,
          category: suggestion.category,
          transactions: []
        };
      }
      groups[key].transactions.push(tx);
    } else {
      ungrouped.push(tx);
    }
  }
  
  return { groups, ungrouped };
}

// Individual Transaction Component - now editable for all types (including aliased and credits)
function TransactionItem({ tx, userId, onAliasUpdate, isAliased: initialIsAliased, index, showEditButton = true, selected, selectionCount, onToggleSelect, allTransactions }) {
  const [isEditing, setIsEditing] = useState(false);
  const [aliasName, setAliasName] = useState(tx?.narration || '');
  const [category, setCategory] = useState(tx?.category || 'General');
  const [isSaving, setIsSaving] = useState(false);
  const [isAliased, setIsAliased] = useState(initialIsAliased);
  const [showSpreadModal, setShowSpreadModal] = useState(false);
  const [spreadData, setSpreadData] = useState({ matchCount: 0, displayName: '', onYes: () => {}, onNo: () => {}, onCancel: () => {} });

  useEffect(() => {
    if (selected && selectionCount === 1 && !isEditing) {
      setIsEditing(true);
      setAliasName(tx.narration || '');
      setCategory(tx.category || 'General');
    } else if ((!selected || selectionCount >= 2) && isEditing) {
      setIsEditing(false);
    }
  }, [selected, selectionCount]);
  
  if (!tx) return null;
  
  const mlSuggestion = !isAliased && tx.tx_type === 'debit' ? getMLSuggestion(tx.original_narration || tx.narration) : null;

  const isCredit = tx.tx_type === 'credit';
  const theme = BANK_COLORS[tx.bank] || BANK_COLORS.default;
  const originalNarration = tx.original_narration || tx.narration;

  const fmt = (n) => new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: 'NGN', minimumFractionDigits: 2
  }).format(Math.abs(n));

  const fmtDate = (s) => {
    if (!s) return '';
    try {
      return new Date(s).toLocaleDateString('en-NG', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return '';
    }
  };

  const catStyle = CATEGORY_COLORS[category] || CATEGORY_COLORS.General;

  const doSaveAlias = async (pattern, exactMatch, name, cat) => {
    setIsSaving(true);
    try {
      await api.saveAlias(userId, {
        recipient_pattern: pattern,
        display_name: name,
        category: cat,
        exact_match: exactMatch || undefined
      });
      setIsAliased(true);
      setIsEditing(false);
      if (onToggleSelect) onToggleSelect(index);
      if (onAliasUpdate) onAliasUpdate();
    } catch (error) {
      console.error('Failed to save alias:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAlias = async () => {
    if (!aliasName.trim()) return;
    const pattern = originalNarration.slice(0, 60);
    const name = aliasName.trim();
    const cat = category;
    const otherCount = allTransactions
      ? countOtherMatches(allTransactions, pattern, [originalNarration])
      : 0;
    if (otherCount > 0) {
      setSpreadData({
        matchCount: otherCount,
        displayName: name,
        onYes: () => { setShowSpreadModal(false); doSaveAlias(pattern, false, name, cat); },
        onNo: () => { setShowSpreadModal(false); doSaveAlias(pattern, true, name, cat); },
        onCancel: () => { setShowSpreadModal(false); },
      });
      setShowSpreadModal(true);
      return;
    }
    doSaveAlias(pattern, false, name, cat);
  };

  const handleAcceptSuggestion = async () => {
    if (mlSuggestion) {
      setAliasName(mlSuggestion.display_name);
      setCategory(mlSuggestion.category);
      setTimeout(() => handleSaveAlias(), 100);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setAliasName(tx.narration || '');
    setCategory(tx.category || 'General');
    if (onToggleSelect) onToggleSelect(index);
  };

  const canEdit = showEditButton && (isCredit || !isAliased || isAliased);
  const isBatchSelected = selected && selectionCount >= 2;

  return (
    <>
    <div
      className={`flex items-center justify-between px-5 py-5 border-l-2 ${isBatchSelected ? 'border-l-indigo-500' : theme.border} ${theme.bg} ${isBatchSelected ? 'bg-indigo-500/10' : ''} rounded-r-2xl transition-all group mb-1.5 hover:bg-opacity-30`}
      style={{ animationDelay: `${(index || 0) * 30}ms` }}
    >
      {isEditing ? (
        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={aliasName}
              onChange={(e) => setAliasName(e.target.value)}
              placeholder="Display name..."
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs outline-none focus:border-indigo-500"
              autoFocus
            />
            <p className="text-[8px] text-slate-600 mt-0.5 truncate font-mono">
              Original: {originalNarration.slice(0, 40)}...
            </p>
          </div>
          
          <div className="w-full sm:w-32">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs outline-none focus:border-indigo-500"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat} style={{ background: '#1a1a1a', color: '#fff' }}>{cat}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handleSaveAlias}
              disabled={isSaving || !aliasName.trim()}
              className="p-1.5 bg-indigo-600 rounded-lg text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              <Check size={12} />
            </button>
            
            <button
              onClick={handleCancelEdit}
              className="p-1.5 bg-white/5 rounded-lg text-slate-400 hover:bg-white/10 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isBatchSelected ? 'bg-indigo-400' : theme.dot}`} />

            <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center ${
              isCredit ? theme.creditIcon : theme.debitIcon
            }`}>
              {isCredit ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-xs font-bold truncate ${isAliased ? 'text-indigo-300' : isBatchSelected ? 'text-indigo-200' : 'text-white'}`}>
                  {tx.narration}
                </p>
                {isAliased && (
                  <span className="text-[7px] px-1 py-0.5 bg-indigo-500/20 text-indigo-400 rounded-full font-black uppercase">
                    aliased
                  </span>
                )}
                {isBatchSelected && (
                  <span className="text-[7px] px-1 py-0.5 bg-indigo-500/30 text-indigo-300 rounded-full font-black uppercase">
                    selected
                  </span>
                )}
                {mlSuggestion && !isAliased && !isEditing && showEditButton && (
                  <button
                    onClick={handleAcceptSuggestion}
                    className="text-[7px] px-1 py-0.5 bg-amber-500/20 text-amber-400 rounded-full font-black uppercase flex items-center gap-1 hover:bg-amber-500/30 transition-colors"
                  >
                    <Sparkles size={7} />
                    ML: {mlSuggestion.display_name}
                  </button>
                )}
              </div>
              
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-wide ${catStyle}`}>
                  {category}
                </span>
                <span className="text-[8px] text-slate-600 font-mono">{tx.bank} •••• {tx.account_last4}</span>
                <span className="text-[8px] text-slate-700">{fmtDate(tx.timestamp)}</span>
              </div>
              
              {isAliased && (
                <p className="text-[7px] text-slate-600 mt-0.5 truncate font-mono">
                  Original: {originalNarration.slice(0, 50)}...
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right flex-shrink-0">
              <p className={`font-black text-xs tabular-nums ${isCredit ? 'text-emerald-400' : 'text-white'}`}>
                {isCredit ? '+' : '-'}{fmt(tx.amount)}
              </p>
            </div>
            
            {/* Pencil toggle for selection */}
            {canEdit && (
              <button
                onClick={() => onToggleSelect(index)}
                className={`p-1.5 rounded-lg transition-all ${selected ? 'bg-indigo-500/20' : 'opacity-0 group-hover:opacity-100 hover:bg-white/10'}`}
              >
                <Pencil size={12} className={selected ? 'text-indigo-400' : 'text-slate-400'} />
              </button>
            )}
          </div>
        </>
      )}
    </div>
      <AliasSpreadModal
        isOpen={showSpreadModal}
        matchCount={spreadData.matchCount}
        displayName={spreadData.displayName}
        onYes={spreadData.onYes}
        onNo={spreadData.onNo}
        onCancel={spreadData.onCancel}
      />
    </>
  );
}

// Category Group for Aliased Transactions
function AliasedCategoryGroup({ category, transactions, userId, onAliasUpdate, isExpanded, onToggle, allTransactions }) {
  const [expanded, setExpanded] = useState(isExpanded);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showForm, setShowForm] = useState(false);
  const [batchName, setBatchName] = useState(category);
  const [batchCategory, setBatchCategory] = useState(category);
  const [isSaving, setIsSaving] = useState(false);
  const [showSpreadModal, setShowSpreadModal] = useState(false);
  const [spreadData, setSpreadData] = useState({ matchCount: 0, displayName: '', onYes: () => {}, onNo: () => {}, onCancel: () => {} });

  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const doAliasAll = async (exactMatch, cat, txs) => {
    setIsSaving(true);
    try {
      for (const tx of txs) {
        await api.saveAlias(userId, {
          recipient_pattern: (tx.original_narration || tx.narration).slice(0, 60),
          display_name: cat,
          category: cat,
          exact_match: exactMatch || undefined
        });
      }
      if (onAliasUpdate) onAliasUpdate();
    } catch (error) {
      console.error('Failed to alias all:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAliasAll = async () => {
    setIsSaving(true);
    try {
      const cat = category;
      const txs = transactions;
      const patterns = txs.map(tx =>
        (tx.original_narration || tx.narration).slice(0, 60)
      );
      const allExclude = patterns.map(p => p.toLowerCase());
      const hasSpread = patterns.some(p =>
        allTransactions ? countOtherMatches(allTransactions, p, allExclude) > 0 : false
      );
      if (hasSpread) {
        setSpreadData({
          matchCount: allTransactions ? patterns.reduce((sum, p) => sum + countOtherMatches(allTransactions, p, allExclude), 0) : 0,
          displayName: cat,
          onYes: () => { setShowSpreadModal(false); doAliasAll(false, cat, txs); },
          onNo: () => { setShowSpreadModal(false); doAliasAll(true, cat, txs); },
          onCancel: () => { setShowSpreadModal(false); },
        });
        setShowSpreadModal(true);
        return;
      }
      for (const tx of txs) {
        await api.saveAlias(userId, {
          recipient_pattern: (tx.original_narration || tx.narration).slice(0, 60),
          display_name: cat,
          category: cat
        });
      }
      if (onAliasUpdate) onAliasUpdate();
    } catch (error) {
      console.error('Failed to alias all:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const doAliasSelected = async (exactMatch, name, cat, ids, txs) => {
    if (!name || !name.trim()) return;
    setIsSaving(true);
    try {
      for (const [idx, tx] of txs.entries()) {
        if (!ids.has(idx)) continue;
        await api.saveAlias(userId, {
          recipient_pattern: (tx.original_narration || tx.narration).slice(0, 60),
          display_name: name,
          category: cat,
          exact_match: exactMatch || undefined
        });
      }
      setShowForm(false);
      setSelectedIds(new Set());
      if (onAliasUpdate) onAliasUpdate();
    } catch (error) {
      console.error('Failed to alias selected:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAliasSelected = async () => {
    if (!batchName.trim()) return;
    const name = batchName.trim();
    const cat = batchCategory;
    const ids = selectedIds;
    const txs = transactions;
    setIsSaving(true);
    try {
      const patterns = [];
      for (const [idx, tx] of txs.entries()) {
        if (!ids.has(idx)) continue;
        patterns.push((tx.original_narration || tx.narration).slice(0, 60));
      }
      const allExclude = patterns.map(p => p.toLowerCase());
      const hasSpread = patterns.some(p =>
        allTransactions ? countOtherMatches(allTransactions, p, allExclude) > 0 : false
      );
      if (hasSpread) {
        setSpreadData({
          matchCount: allTransactions ? patterns.reduce((sum, p) => sum + countOtherMatches(allTransactions, p, allExclude), 0) : 0,
          displayName: name,
          onYes: () => { setShowSpreadModal(false); doAliasSelected(false, name, cat, ids, txs); },
          onNo: () => { setShowSpreadModal(false); doAliasSelected(true, name, cat, ids, txs); },
          onCancel: () => { setShowSpreadModal(false); },
        });
        setShowSpreadModal(true);
        return;
      }
      for (const [idx, tx] of txs.entries()) {
        if (!ids.has(idx)) continue;
        await api.saveAlias(userId, {
          recipient_pattern: (tx.original_narration || tx.narration).slice(0, 60),
          display_name: name,
          category: cat
        });
      }
      setShowForm(false);
      setSelectedIds(new Set());
      if (onAliasUpdate) onAliasUpdate();
    } catch (error) {
      console.error('Failed to alias selected:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleExpand = () => {
    setExpanded(!expanded);
    if (onToggle) onToggle(!expanded);
  };

  const catColor = CATEGORY_COLORS[category]?.split(' ')[0] || 'text-slate-400';
  const bgColor = CATEGORY_COLORS[category]?.split(' ')[1] || 'bg-white/5';

  return (
    <>
    <div className="mb-4 border border-white/5 rounded-xl overflow-hidden">
      <div className={`px-4 py-2 ${bgColor.replace('bg-', 'bg-opacity-20 bg-') || 'bg-white/5'}`}>
        <div className="flex items-center justify-between gap-2">
          <button onClick={toggleExpand} className="flex items-center gap-2 flex-1 min-w-0">
            {expanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
            <FolderOpen size={14} className={`${catColor} shrink-0`} />
            <span className={`text-xs font-black uppercase tracking-wider ${catColor} truncate`}>{category}</span>
            <span className="text-[8px] px-1.5 py-0.5 bg-white/10 rounded-full shrink-0">{transactions.length} transactions</span>
          </button>
          
          <div className="flex items-center gap-1.5 shrink-0">
            {selectedIds.size > 0 && (
              <button onClick={() => setShowForm(true)} disabled={isSaving}
                className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                Alias Selected ({selectedIds.size})
              </button>
            )}
            <button onClick={handleAliasAll} disabled={isSaving}
              className="text-[8px] px-2 py-1 bg-indigo-600/60 text-white rounded-lg font-black uppercase tracking-wider hover:bg-indigo-600 transition-colors disabled:opacity-50"
            >
              Alias All ({transactions.length})
            </button>
          </div>
        </div>
      </div>
      
      {expanded && (
        <div className="p-2 space-y-1">
          {showForm && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <input type="text" value={batchName} onChange={(e) => setBatchName(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs w-32 flex-1 min-w-0"
                placeholder="Display name" autoFocus />
              <select value={batchCategory} onChange={(e) => setBatchCategory(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs"
              >
                {CATEGORIES.map(cat => (<option key={cat} value={cat} style={{ background: '#1a1a1a', color: '#fff' }}>{cat}</option>))}
              </select>
              <button onClick={handleAliasSelected} disabled={isSaving}
                className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider transition-colors disabled:opacity-50">Save</button>
              <button onClick={() => { setShowForm(false); setSelectedIds(new Set()); }}
                className="p-1 bg-white/5 rounded-lg text-slate-400 hover:bg-white/10"><X size={12} /></button>
            </div>
          )}
          {transactions.map((tx, idx) => (
            <TransactionItem
              key={tx.id}
              tx={tx}
              userId={userId}
              onAliasUpdate={onAliasUpdate}
              isAliased={true}
              index={idx}
              showEditButton={true}
               selected={selectedIds.has(idx)}
               selectionCount={selectedIds.size}
               onToggleSelect={toggleSelection}
               allTransactions={allTransactions}
             />
           ))}
         </div>
       )}
    </div>
      <AliasSpreadModal
        isOpen={showSpreadModal}
        matchCount={spreadData.matchCount}
        displayName={spreadData.displayName}
        onYes={spreadData.onYes}
        onNo={spreadData.onNo}
        onCancel={spreadData.onCancel}
      />
    </>
  );
}

// Grouped Transaction Component with Batch Alias (for ML suggested groups)
function GroupedTransactionGroup({ group, groupName, userId, onAliasUpdate, isExpanded, onToggle, allTransactions }) {
  const [batchName, setBatchName] = useState(group?.display_name || '');
  const [batchCategory, setBatchCategory] = useState(group?.category || 'General');
  const [isSaving, setIsSaving] = useState(false);
  const [expanded, setExpanded] = useState(isExpanded);
  const [isAliased, setIsAliased] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showForm, setShowForm] = useState(false);
  const [showSpreadModal, setShowSpreadModal] = useState(false);
  const [spreadData, setSpreadData] = useState({ matchCount: 0, displayName: '', onYes: () => {}, onNo: () => {}, onCancel: () => {} });

  if (!group || !group.transactions) return null;

  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const doAliasAll = async (exactMatch, name, cat, txs) => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      for (const tx of txs) {
        await api.saveAlias(userId, {
          recipient_pattern: (tx.original_narration || tx.narration).slice(0, 60),
          display_name: name,
          category: cat,
          exact_match: exactMatch || undefined
        });
      }
      setIsAliased(true);
      if (onAliasUpdate) onAliasUpdate();
    } catch (error) {
      console.error('Failed to alias all:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAliasAll = async () => {
    const name = group.display_name || groupName;
    if (!name.trim()) return;
    const cat = group.category || 'General';
    const txs = group.transactions;
    const patterns = txs.map(tx =>
      (tx.original_narration || tx.narration).slice(0, 60)
    );
    const allExclude = patterns.map(p => p.toLowerCase());
    const hasSpread = patterns.some(p =>
      allTransactions ? countOtherMatches(allTransactions, p, allExclude) > 0 : false
    );
    if (hasSpread) {
      const totalMatches = allTransactions ? patterns.reduce((sum, p) => sum + countOtherMatches(allTransactions, p, allExclude), 0) : 0;
      setSpreadData({
        matchCount: totalMatches,
        displayName: name,
        onYes: () => { setShowSpreadModal(false); doAliasAll(false, name, cat, txs); },
        onNo: () => { setShowSpreadModal(false); doAliasAll(true, name, cat, txs); },
        onCancel: () => { setShowSpreadModal(false); },
      });
      setShowSpreadModal(true);
      return;
    }
    doAliasAll(false, name, cat, txs);
  };

  const doAliasSelected = async (exactMatch, name, cat, ids, txs) => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      for (const [idx, tx] of txs.entries()) {
        if (!ids.has(idx)) continue;
        await api.saveAlias(userId, {
          recipient_pattern: (tx.original_narration || tx.narration).slice(0, 60),
          display_name: name,
          category: cat,
          exact_match: exactMatch || undefined
        });
      }
      setIsAliased(true);
      setShowForm(false);
      setSelectedIds(new Set());
      if (onAliasUpdate) onAliasUpdate();
    } catch (error) {
      console.error('Failed to alias selected:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAliasSelected = async () => {
    if (!batchName.trim()) return;
    const name = batchName.trim();
    const cat = batchCategory;
    const ids = selectedIds;
    const txs = group.transactions;
    const patterns = [];
    for (const [idx, tx] of txs.entries()) {
      if (!ids.has(idx)) continue;
      patterns.push((tx.original_narration || tx.narration).slice(0, 60));
    }
    const allExclude = patterns.map(p => p.toLowerCase());
    const hasSpread = patterns.some(p =>
      allTransactions ? countOtherMatches(allTransactions, p, allExclude) > 0 : false
    );
    if (hasSpread) {
      const totalMatches = allTransactions ? patterns.reduce((sum, p) => sum + countOtherMatches(allTransactions, p, allExclude), 0) : 0;
      setSpreadData({
        matchCount: totalMatches,
        displayName: name,
        onYes: () => { setShowSpreadModal(false); doAliasSelected(false, name, cat, ids, txs); },
        onNo: () => { setShowSpreadModal(false); doAliasSelected(true, name, cat, ids, txs); },
        onCancel: () => { setShowSpreadModal(false); },
      });
      setShowSpreadModal(true);
      return;
    }
    doAliasSelected(false, name, cat, ids, txs);
  };

  const toggleExpand = () => {
    setExpanded(!expanded);
    if (onToggle) onToggle(!expanded);
  };

  const allAliased = group.transactions.every(tx => tx.aliased === true) || isAliased;

  return (
    <>
    <div className="mb-4 border border-white/5 rounded-xl overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <button onClick={toggleExpand} className="flex items-center gap-2 flex-1 min-w-0">
            {expanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
            <Layers size={14} className="text-indigo-400 shrink-0" />
            <span className="text-xs font-black uppercase tracking-wider text-white truncate">{groupName}</span>
            <span className="text-[8px] px-1.5 py-0.5 bg-white/10 rounded-full shrink-0">{group.transactions.length} transactions</span>
            {allAliased && <Check size={10} className="text-emerald-400 shrink-0" />}
          </button>
          
          {!allAliased && (
            <div className="flex items-center gap-1.5 shrink-0">
              {selectedIds.size > 0 && (
                <button onClick={() => setShowForm(true)} disabled={isSaving}
                  className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  Alias Selected ({selectedIds.size})
                </button>
              )}
              <button onClick={handleAliasAll} disabled={isSaving}
                className="text-[8px] px-2 py-1 bg-indigo-600/60 text-white rounded-lg font-black uppercase tracking-wider hover:bg-indigo-600 transition-colors disabled:opacity-50"
              >
                Alias All ({group.transactions.length})
              </button>
            </div>
          )}
        </div>
      </div>
      
      {expanded && (
        <div className="p-2 space-y-1">
          {showForm && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <input type="text" value={batchName} onChange={(e) => setBatchName(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs w-32 flex-1 min-w-0"
                placeholder="Display name" autoFocus />
              <select value={batchCategory} onChange={(e) => setBatchCategory(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs"
              >
                {CATEGORIES.map(cat => (<option key={cat} value={cat} style={{ background: '#1a1a1a', color: '#fff' }}>{cat}</option>))}
              </select>
              <button onClick={handleAliasSelected} disabled={isSaving}
                className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider transition-colors disabled:opacity-50">Save</button>
              <button onClick={() => { setShowForm(false); setSelectedIds(new Set()); }}
                className="p-1 bg-white/5 rounded-lg text-slate-400 hover:bg-white/10"><X size={12} /></button>
            </div>
          )}
          {group.transactions.map((tx, idx) => (
            <TransactionItem
              key={tx.id}
              tx={tx}
              userId={userId}
              onAliasUpdate={onAliasUpdate}
              isAliased={allAliased || tx.aliased}
              index={idx}
              showEditButton={true}
              selected={selectedIds.has(idx)}
              selectionCount={selectedIds.size}
              onToggleSelect={toggleSelection}
              allTransactions={allTransactions}
            />
          ))}
        </div>
      )}
    </div>
      <AliasSpreadModal
        isOpen={showSpreadModal}
        matchCount={spreadData.matchCount}
        displayName={spreadData.displayName}
        onYes={spreadData.onYes}
        onNo={spreadData.onNo}
        onCancel={spreadData.onCancel}
      />
    </>
  );
}

// Category Group for Aliased Transactions
export { ML_GROUPS, getMLSuggestion, groupSimilarTransactions };

// Main TransactionList Component
export default function TransactionList({ transactions = [], userId, onAliasUpdate }) {
  const [expandedGroups, setExpandedGroups] = useState({ 
    aliasedCategories: {}, 
    mlGroups: true, 
    pending: true,
    credits: true 
  });
  
  const [aliasedByCategory, setAliasedByCategory] = useState({});
  const [pendingTransactions, setPendingTransactions] = useState([]);
  const [creditTransactions, setCreditTransactions] = useState([]);
  const [mlGroups, setMlGroups] = useState({ groups: {}, ungrouped: [] });
  
  const [flatBatchIds, setFlatBatchIds] = useState(new Set());
  const [flatBatchName, setFlatBatchName] = useState('');
  const [flatBatchCategory, setFlatBatchCategory] = useState('General');
  const [flatBatchSaving, setFlatBatchSaving] = useState(false);
  const [flatShowForm, setFlatShowForm] = useState(false);
  const [flatSection, setFlatSection] = useState(null); // 'pending' or 'credits'
  const [showSpreadModal, setShowSpreadModal] = useState(false);
  const [spreadData, setSpreadData] = useState({ matchCount: 0, displayName: '', onYes: () => {}, onNo: () => {}, onCancel: () => {} });

  const toggleFlatSelection = (section) => (id) => {
    setFlatSection(section);
    setFlatBatchIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleFlatAliasAll = async (section) => {
    const txs = section === 'pending' ? pendingTransactions : creditTransactions;
    setFlatBatchSaving(true);
    try {
      setFlatSection(section);
      setFlatBatchName('');
      setFlatBatchCategory('General');
      setFlatShowForm(true);
    } finally {
      setFlatBatchSaving(false);
    }
  };

  const doFlatAliasSubmit = async (exactMatch, name, section, ids, category) => {
    if (!name || !name.trim()) return;
    const txs = section === 'pending' ? pendingTransactions : creditTransactions;
    setFlatBatchSaving(true);
    try {
      for (const [idx, tx] of txs.entries()) {
        if (ids.size > 0 && !ids.has(idx)) continue;
        await api.saveAlias(userId, {
          recipient_pattern: (tx.original_narration || tx.narration).slice(0, 60),
          display_name: name,
          category: category,
          exact_match: exactMatch || undefined
        });
      }
      setFlatShowForm(false);
      setFlatBatchIds(new Set());
      if (onAliasUpdate) onAliasUpdate();
    } catch (error) {
      console.error('Failed to batch alias:', error);
    } finally {
      setFlatBatchSaving(false);
    }
  };

  const handleFlatAliasSubmit = async () => {
    if (!flatBatchName.trim()) return;
    const name = flatBatchName.trim();
    const section = flatSection;
    const ids = new Set(flatBatchIds);
    const cat = flatBatchCategory;
    const txs = section === 'pending' ? pendingTransactions : creditTransactions;
    const patterns = txs
      .filter((_, idx) => ids.size === 0 || ids.has(idx))
      .map(tx => (tx.original_narration || tx.narration).slice(0, 60));
    const allExclude = patterns.map(p => p.toLowerCase());
    const hasSpread = patterns.some(p =>
      countOtherMatches(transactions, p, allExclude) > 0
    );
    if (hasSpread) {
      const totalMatches = patterns.reduce((sum, p) => sum + countOtherMatches(transactions, p, allExclude), 0);
      setSpreadData({
        matchCount: totalMatches,
        displayName: name,
        onYes: () => { setShowSpreadModal(false); doFlatAliasSubmit(false, name, section, ids, cat); },
        onNo: () => { setShowSpreadModal(false); doFlatAliasSubmit(true, name, section, ids, cat); },
        onCancel: () => { setShowSpreadModal(false); },
      });
      setShowSpreadModal(true);
      return;
    }
    doFlatAliasSubmit(false, name, section, ids, cat);
  };

  const cancelFlatBatch = () => {
    setFlatShowForm(false);
    setFlatBatchIds(new Set());
    setFlatSection(null);
  };

  useEffect(() => {
    if (!transactions || transactions.length === 0) {
      setAliasedByCategory({});
      setPendingTransactions([]);
      setCreditTransactions([]);
      setMlGroups({ groups: {}, ungrouped: [] });
      return;
    }
    
    // Separate transactions
    const aliased = transactions.filter(tx => tx.aliased === true);
    const pending = transactions.filter(tx => tx.tx_type === 'debit' && !tx.aliased);
    const credits = transactions.filter(tx => tx.tx_type === 'credit' && !tx.aliased);
    
    // Group aliased by category
    const groupedByCat = {};
    aliased.forEach(tx => {
      const cat = tx.category || 'General';
      if (!groupedByCat[cat]) groupedByCat[cat] = [];
      groupedByCat[cat].push(tx);
    });
    setAliasedByCategory(groupedByCat);
    setCreditTransactions(credits);
    
    // Group pending transactions by ML suggestions
    const { groups, ungrouped } = groupSimilarTransactions(pending);
    setMlGroups({ groups, ungrouped });
    setPendingTransactions(ungrouped);
  }, [transactions]);

  const toggleCategory = (category) => {
    setExpandedGroups(prev => ({
      ...prev,
      aliasedCategories: {
        ...prev.aliasedCategories,
        [category]: !prev.aliasedCategories[category]
      }
    }));
  };

  const toggleGroup = (group) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const allPendingAliased = Object.keys(mlGroups.groups || {}).length === 0 && pendingTransactions.length === 0;

  // If no transactions at all, show empty state
  if (!transactions || transactions.length === 0) {
    return (
      <div className="py-20 text-center opacity-10 italic text-sm">
        No movements detected.
      </div>
    );
  }

  return (
    <>
    <div className="space-y-6">
      {/* Aliased Transactions by Category */}
      {Object.keys(aliasedByCategory).length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Check size={12} className="text-emerald-400" />
            <span className="text-[10px] font-black uppercase tracking-wider text-white">Aliased Transactions</span>
            <span className="text-[8px] px-1.5 py-0.5 bg-white/10 rounded-full">
              {Object.values(aliasedByCategory).reduce((acc, arr) => acc + arr.length, 0)} total
            </span>
          </div>
          {Object.entries(aliasedByCategory).map(([category, txs]) => (
            <AliasedCategoryGroup
              key={category}
              category={category}
              transactions={txs}
              userId={userId}
              onAliasUpdate={onAliasUpdate}
              isExpanded={expandedGroups.aliasedCategories[category] ?? true}
              onToggle={() => toggleCategory(category)}
              allTransactions={transactions}
            />
          ))}
        </div>
      )}

      {/* ML Suggested Groups Section */}
      {mlGroups.groups && Object.keys(mlGroups.groups).length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => toggleGroup('mlGroups')}
            className="w-full flex items-center justify-between px-4 py-2 bg-amber-500/5 rounded-xl hover:bg-amber-500/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedGroups.mlGroups ? <ChevronDown size={14} className="text-amber-400" /> : <ChevronRight size={14} className="text-amber-400" />}
              <Brain size={12} className="text-amber-400" />
              <span className="text-[10px] font-black uppercase tracking-wider text-white">ML Suggested Groups</span>
              <span className="text-[8px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full">
                {Object.keys(mlGroups.groups).length} groups
              </span>
            </div>
          </button>
          
          {expandedGroups.mlGroups && (
            <div className="mt-2 space-y-3">
              {Object.entries(mlGroups.groups).map(([groupName, groupData]) => (
                <GroupedTransactionGroup
                  key={groupName}
                  group={groupData}
                  groupName={groupName}
                  userId={userId}
                  onAliasUpdate={onAliasUpdate}
                  isExpanded={true}
                  onToggle={() => {}}
                  allTransactions={transactions}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pending Individual Transactions */}
      {pendingTransactions.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between w-full px-4 py-2 bg-white/5 rounded-xl">
            <button onClick={() => toggleGroup('pending')} className="flex items-center gap-2 flex-1">
              {expandedGroups.pending ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
              <Tags size={12} className="text-slate-400" />
              <span className="text-[10px] font-black uppercase tracking-wider text-white">Other Transactions</span>
              <span className="text-[8px] px-1.5 py-0.5 bg-white/10 rounded-full">{pendingTransactions.length}</span>
            </button>
            <div className="flex items-center gap-1.5 shrink-0">
              {flatBatchIds.size > 0 && flatSection === 'pending' && (
                <button onClick={() => setFlatShowForm(true)}
                  className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider hover:bg-indigo-700 transition-colors"
                >
                  Alias Selected ({flatBatchIds.size})
                </button>
              )}
              <button onClick={() => handleFlatAliasAll('pending')}
                className="text-[8px] px-2 py-1 bg-indigo-600/60 text-white rounded-lg font-black uppercase tracking-wider hover:bg-indigo-600 transition-colors"
              >
                Alias All ({pendingTransactions.length})
              </button>
            </div>
          </div>
          
          {expandedGroups.pending && (
            <div className="mt-2 space-y-1 pl-4">
              {flatShowForm && flatSection === 'pending' && (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <input type="text" value={flatBatchName} onChange={(e) => setFlatBatchName(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs w-32 flex-1 min-w-0"
                    placeholder="Display name" autoFocus />
                  <select value={flatBatchCategory} onChange={(e) => setFlatBatchCategory(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs"
                  >
                    {CATEGORIES.map(cat => (<option key={cat} value={cat} style={{ background: '#1a1a1a', color: '#fff' }}>{cat}</option>))}
                  </select>
                  <button onClick={handleFlatAliasSubmit} disabled={flatBatchSaving || !flatBatchName.trim()}
                    className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider transition-colors disabled:opacity-50">Save</button>
                  <button onClick={cancelFlatBatch}
                    className="p-1 bg-white/5 rounded-lg text-slate-400 hover:bg-white/10"><X size={12} /></button>
                </div>
              )}
              {pendingTransactions.map((tx, idx) => (
                <TransactionItem
                  key={tx.id}
                  tx={tx}
                  userId={userId}
                  onAliasUpdate={onAliasUpdate}
                  isAliased={false}
                  index={idx}
                  showEditButton={true}
                   selected={flatBatchIds.has(idx) && flatSection === 'pending'}
                  selectionCount={flatBatchIds.size}
                  onToggleSelect={toggleFlatSelection('pending')}
                  allTransactions={transactions}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Credit/Income Transactions - Now aliasable */}
      {creditTransactions.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between w-full px-4 py-2 bg-emerald-500/5 rounded-xl">
            <button onClick={() => toggleGroup('credits')} className="flex items-center gap-2 flex-1">
              {expandedGroups.credits ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
              <ArrowDownLeft size={12} className="text-emerald-400" />
              <span className="text-[10px] font-black uppercase tracking-wider text-white">Income / Credits</span>
              <span className="text-[8px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full">{creditTransactions.length}</span>
            </button>
            <div className="flex items-center gap-1.5 shrink-0">
              {flatBatchIds.size > 0 && flatSection === 'credits' && (
                <button onClick={() => setFlatShowForm(true)}
                  className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider hover:bg-indigo-700 transition-colors"
                >
                  Alias Selected ({flatBatchIds.size})
                </button>
              )}
              <button onClick={() => handleFlatAliasAll('credits')}
                className="text-[8px] px-2 py-1 bg-indigo-600/60 text-white rounded-lg font-black uppercase tracking-wider hover:bg-indigo-600 transition-colors"
              >
                Alias All ({creditTransactions.length})
              </button>
            </div>
          </div>
          
          {expandedGroups.credits && (
            <div className="mt-2 space-y-1 pl-4">
              {flatShowForm && flatSection === 'credits' && (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <input type="text" value={flatBatchName} onChange={(e) => setFlatBatchName(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs w-32 flex-1 min-w-0"
                    placeholder="Display name" autoFocus />
                  <select value={flatBatchCategory} onChange={(e) => setFlatBatchCategory(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs"
                  >
                    {CATEGORIES.map(cat => (<option key={cat} value={cat} style={{ background: '#1a1a1a', color: '#fff' }}>{cat}</option>))}
                  </select>
                  <button onClick={handleFlatAliasSubmit} disabled={flatBatchSaving || !flatBatchName.trim()}
                    className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider transition-colors disabled:opacity-50">Save</button>
                  <button onClick={cancelFlatBatch}
                    className="p-1 bg-white/5 rounded-lg text-slate-400 hover:bg-white/10"><X size={12} /></button>
                </div>
              )}
              {creditTransactions.map((tx, idx) => (
                <TransactionItem
                  key={tx.id}
                  tx={tx}
                  userId={userId}
                  onAliasUpdate={onAliasUpdate}
                  isAliased={false}
                  index={idx}
                  showEditButton={true}
                   selected={flatBatchIds.has(idx) && flatSection === 'credits'}
                  selectionCount={flatBatchIds.size}
                  onToggleSelect={toggleFlatSelection('credits')}
                  allTransactions={transactions}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Completion State */}
      {allPendingAliased && creditTransactions.length === 0 && Object.keys(aliasedByCategory).length > 0 && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <CheckCircle2 size={32} className="text-emerald-500" />
            <p className="text-emerald-400 font-black text-sm uppercase tracking-wider">All Transactions Processed</p>
            <p className="text-slate-500 text-xs">Every transaction has been organized and categorized.</p>
          </div>
        </div>
      )}
    </div>
      <AliasSpreadModal
        isOpen={showSpreadModal}
        matchCount={spreadData.matchCount}
        displayName={spreadData.displayName}
        onYes={spreadData.onYes}
        onNo={spreadData.onNo}
        onCancel={spreadData.onCancel}
      />
    </>
  );
}