import { useState, useEffect } from 'react';
import { 
  ArrowDownLeft, ArrowUpRight, Pencil, Check, X, Brain, Sparkles, 
  ChevronDown, ChevronRight, CheckCircle2, Layers, Tags, FolderOpen 
} from 'lucide-react';
import { api } from '../services/api';
import AliasSpreadModal from './AliasSpreadModal';

// ==========================================
// UTILITIES & CONFIGURATIONS
// ==========================================

function countOtherMatches(allTransactions, pattern, excludeNarrations = []) {
  const p = pattern.toLowerCase();
  return allTransactions.filter(tx => {
    if (tx.aliased) return false;
    const nar = (tx.original_narration || tx.narration || '').toLowerCase();
    if (!nar.includes(p)) return false;
    if (excludeNarrations.some(ex => nar === ex.toLowerCase())) return false;
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
    debitIcon: 'bg-slate-500/10 text-rose-400',
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

function groupSimilarTransactions(transactions) {
  if (!transactions || transactions.length === 0) return { groups: {}, ungrouped: [] };
  const groups = {};
  const ungrouped = [];
  for (const tx of transactions) {
    const suggestion = getMLSuggestion(tx.original_narration || tx.narration);
    if (suggestion) {
      const key = suggestion.display_name;
      if (!groups[key]) {
        groups[key] = { display_name: suggestion.display_name, category: suggestion.category, transactions: [] };
      }
      groups[key].transactions.push(tx);
    } else {
      ungrouped.push(tx);
    }
  }
  return { groups, ungrouped };
}

// ==========================================
// CHILD COMPONENT: TRANSACTION ITEM ROW
// ==========================================

function TransactionItem({ tx, userId, onAliasUpdate, isAliased: initialIsAliased, index, showEditButton = true, selected, selectionCount, onToggleSelect, scopeTransactions }) {
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
    } catch (e) { return ''; }
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
      if (onToggleSelect) onToggleSelect(tx.id);
      if (onAliasUpdate) onAliasUpdate();
    } catch (error) {
      console.error('Failed to save alias:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAlias = async (overrideName = null, overrideCat = null) => {
    const name = (overrideName || aliasName).trim();
    const cat = overrideCat || category;
    if (!name) return;

    const pattern = originalNarration.slice(0, 60);
    const scope = scopeTransactions || [];
    const otherCount = countOtherMatches(scope, pattern, [originalNarration]);

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

  const handleAcceptSuggestion = () => {
    if (mlSuggestion) {
      setAliasName(mlSuggestion.display_name);
      setCategory(mlSuggestion.category);
      handleSaveAlias(mlSuggestion.display_name, mlSuggestion.category);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setAliasName(tx.narration || '');
    setCategory(tx.category || 'General');
    if (onToggleSelect) onToggleSelect(tx.id);
  };

  const canEdit = showEditButton;
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
              onClick={() => handleSaveAlias()}
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
            <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center ${isCredit ? theme.creditIcon : theme.debitIcon}`}>
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
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right flex-shrink-0">
              <p className={`font-black text-xs tabular-nums ${isCredit ? 'text-emerald-400' : 'text-white'}`}>
                {isCredit ? '+' : '-'}{fmt(tx.amount)}
              </p>
            </div>
            {canEdit && (
              <button
                onClick={() => onToggleSelect(tx.id)}
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

// ==========================================
// CHILD COMPONENT: ALIASED CATEGORY GROUP CONTAINER
// ==========================================

function AliasedCategoryGroup({ category, transactions, userId, onAliasUpdate, isExpanded, onToggle }) {
  const [expanded, setExpanded] = useState(isExpanded);
  const toggleExpand = () => {
    setExpanded(!expanded);
    if (onToggle) onToggle(!expanded);
  };

  const catColor = CATEGORY_COLORS[category]?.split(' ')[0] || 'text-slate-400';
  const bgColor = CATEGORY_COLORS[category]?.split(' ')[1] || 'bg-white/5';

  return (
    <div className="mb-4 border border-white/5 rounded-xl overflow-hidden">
      <div className={`px-4 py-2 ${bgColor.replace('bg-', 'bg-opacity-20 bg-') || 'bg-white/5'}`}>
        <button onClick={toggleExpand} className="flex items-center gap-2 w-full text-left">
          {expanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
          <FolderOpen size={14} className={`${catColor} shrink-0`} />
          <span className={`text-xs font-black uppercase tracking-wider ${catColor} truncate`}>{category}</span>
          <span className="text-[8px] px-1.5 py-0.5 bg-white/10 rounded-full shrink-0 ml-auto">{transactions.length} items</span>
        </button>
      </div>
      {expanded && (
        <div className="p-2 space-y-1">
          {transactions.map((tx, idx) => (
            <TransactionItem
              key={tx.id}
              tx={tx}
              userId={userId}
              onAliasUpdate={onAliasUpdate}
              isAliased={true}
              index={idx}
              showEditButton={false}
              selected={false}
              selectionCount={0}
              onToggleSelect={() => {}}
              scopeTransactions={transactions}
             />
           ))}
         </div>
       )}
    </div>
  );
}

// ==========================================
// CHILD COMPONENT: ML SUGGESTED BUCKET ACCORDION
// ==========================================

function GroupedTransactionGroup({ group, groupName, userId, onAliasUpdate, isExpanded, onToggle, selectedIds, toggleSelection }) {
  const [batchName, setBatchName] = useState(group?.display_name || '');
  const [batchCategory, setBatchCategory] = useState(group?.category || 'General');
  const [isSaving, setIsSaving] = useState(false);
  const [expanded, setExpanded] = useState(isExpanded);
  const [showForm, setShowForm] = useState(false);

  const handleAliasAll = () => {
    group.transactions.forEach(tx => {
      if (!selectedIds.has(tx.id)) toggleSelection(tx.id);
    });
    setBatchName(group.display_name || groupName);
    setBatchCategory(group.category || 'General');
    setShowForm(true);
  };

  const handleAliasSelected = async () => {
    if (!batchName.trim()) return;
    setIsSaving(true);
    try {
      const savePromises = group.transactions
        .filter(tx => selectedIds.has(tx.id))
        .map(tx => api.saveAlias(userId, {
          recipient_pattern: (tx.original_narration || tx.narration).slice(0, 60),
          display_name: batchName.trim(),
          category: batchCategory
        }));
      await Promise.all(savePromises);
      setShowForm(false);
      if (onAliasUpdate) onAliasUpdate();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mb-4 border border-white/5 rounded-xl overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 px-4 py-2 flex items-center justify-between">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 flex-1 text-left min-w-0">
          {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
          <Layers size={14} className="text-indigo-400" />
          <span className="text-xs font-black uppercase tracking-wider text-white truncate">{groupName}</span>
          <span className="text-[8px] px-1.5 py-0.5 bg-white/10 rounded-full">{group.transactions.length} items</span>
        </button>
        <div className="flex items-center gap-1.5">
          <button onClick={handleAliasAll} className="text-[8px] px-2 py-1 bg-indigo-600/60 text-white rounded-lg font-black uppercase">
            Alias Group
          </button>
        </div>
      </div>
      {expanded && (
        <div className="p-2 space-y-1">
          {showForm && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <input type="text" value={batchName} onChange={(e) => setBatchName(e.target.value)} className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs flex-1" />
              <select value={batchCategory} onChange={(e) => setBatchCategory(e.target.value)} className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs">
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <button onClick={handleAliasSelected} disabled={isSaving} className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black">Save</button>
            </div>
          )}
          {group.transactions.map((tx, idx) => (
            <TransactionItem
              key={tx.id}
              tx={tx}
              userId={userId}
              onAliasUpdate={onAliasUpdate}
              isAliased={tx.aliased}
              index={idx}
              selected={selectedIds.has(tx.id)}
              selectionCount={selectedIds.size}
              onToggleSelect={toggleSelection}
              scopeTransactions={group.transactions}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// MAIN EXPORT CONTAINER COMPONENT
// ==========================================

export default function TransactionList({ transactions = [], userId, onAliasUpdate }) {
  const [expandedGroups, setExpandedGroups] = useState({ aliasedCategories: {}, mlGroups: true, pending: true, credits: true });
  const [aliasedByCategory, setAliasedByCategory] = useState({});
  const [pendingTransactions, setPendingTransactions] = useState([]);
  const [creditTransactions, setCreditTransactions] = useState([]);
  const [mlGroups, setMlGroups] = useState({ groups: {}, ungrouped: [] });
  
  // Dynamic Inspection state hook for tracking explicit active layout targets inside Left/Right split pane view
  const [inspectedAlias, setInspectedAlias] = useState(null);

  const [flatBatchIds, setFlatBatchIds] = useState(new Set());
  const [flatBatchName, setFlatBatchName] = useState('');
  const [flatBatchCategory, setFlatBatchCategory] = useState('General');
  const [flatBatchSaving, setFlatBatchSaving] = useState(false);
  const [flatShowForm, setFlatShowForm] = useState(false);
  const [flatSection, setFlatSection] = useState(null);

  const toggleFlatSelection = (section) => (id) => {
    setFlatSection(section);
    setFlatBatchIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleFlatAliasAll = (section) => {
    const txs = section === 'pending' ? pendingTransactions : creditTransactions;
    setFlatBatchIds(new Set(txs.map(tx => tx.id)));
    setFlatSection(section);
    setFlatShowForm(true);
  };

  const handleFlatAliasSubmit = async () => {
    if (!flatBatchName.trim()) return;
    const txs = flatSection === 'pending' ? pendingTransactions : creditTransactions;
    setFlatBatchSaving(true);
    try {
      const savePromises = txs
        .filter(tx => flatBatchIds.has(tx.id))
        .map(tx => api.saveAlias(userId, {
          recipient_pattern: (tx.original_narration || tx.narration).slice(0, 60),
          display_name: flatBatchName.trim(),
          category: flatBatchCategory
        }));
      await Promise.all(savePromises);
      setFlatShowForm(false);
      setFlatBatchIds(new Set());
      if (onAliasUpdate) onAliasUpdate();
    } catch (error) {
      console.error(error);
    } finally {
      setFlatBatchSaving(false);
    }
  };

  const toggleGroup = (key) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    if (!transactions || transactions.length === 0) {
      setAliasedByCategory({});
      setPendingTransactions([]);
      setCreditTransactions([]);
      setMlGroups({ groups: {}, ungrouped: [] });
      return;
    }
    
    const aliased = transactions.filter(tx => tx.aliased === true);
    const pending = transactions.filter(tx => tx.tx_type === 'debit' && !tx.aliased);
    const credits = transactions.filter(tx => tx.tx_type === 'credit' && !tx.aliased);
    
    const groupedByCat = {};
    aliased.forEach(tx => {
      const cat = tx.category || 'General';
      if (!groupedByCat[cat]) groupedByCat[cat] = [];
      groupedByCat[cat].push(tx);
    });
    
    setAliasedByCategory(groupedByCat);
    setCreditTransactions(credits);
    
    const { groups, ungrouped } = groupSimilarTransactions(pending);
    setMlGroups({ groups, ungrouped });
    setPendingTransactions(ungrouped);
  }, [transactions]);

  if (!transactions || transactions.length === 0) {
    return <div className="py-20 text-center opacity-10 italic text-sm">No movements detected.</div>;
  }

  // Verification Boundaries checking if everything has successfully hit the categorized target threshold
  const allPendingAliased = Object.keys(mlGroups.groups || {}).length === 0 && pendingTransactions.length === 0;
  const isFullyCategorized = allPendingAliased && creditTransactions.length === 0 && Object.keys(aliasedByCategory).length > 0;

  // --- RENDERING METHOD B: DUAL COLUMN COMPLETED SPLIT LAYOUT ---
  if (isFullyCategorized) {
    const totalAliasedList = transactions.filter(tx => tx.aliased);
    const allUniqueAliasNames = Array.from(new Set(totalAliasedList.map(tx => tx.narration)));

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-300">
        
        {/* LEFT COLUMN: Clean categorized master feed view */}
        <div className="lg:col-span-7 space-y-4 max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar">
          <div className="flex items-center gap-2 pb-2 border-b border-white/5">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-white">Processed Audit Feed</h3>
            <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full uppercase ml-auto font-black tracking-widest">All Cleaned</span>
          </div>

          {Object.entries(aliasedByCategory).map(([category, txs]) => (
            <AliasedCategoryGroup
              key={category}
              category={category}
              transactions={txs}
              userId={userId}
              onAliasUpdate={onAliasUpdate}
              isExpanded={true}
            />
          ))}
        </div>

        {/* RIGHT COLUMN: Active Alias names registry tracking list */}
        <div className="lg:col-span-5 bg-zinc-950/40 border border-white/5 rounded-2xl p-5 space-y-4 sticky top-6">
          <div>
            <h4 className="text-xs font-black text-white uppercase tracking-wider">Alias Registries</h4>
            <p className="text-[9px] text-slate-500 font-mono mt-0.5">Click any alias token row to review component transaction bounds</p>
          </div>

          <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1 custom-scrollbar">
            {allUniqueAliasNames.map((name) => {
              const occurrences = totalAliasedList.filter(t => t.narration === name);
              const isInspecting = inspectedAlias === name;
              const catType = occurrences[0]?.category || 'General';

              return (
                <div key={name} className="border border-white/5 rounded-xl overflow-hidden transition-all">
                  <button
                    onClick={() => setInspectedAlias(isInspecting ? null : name)}
                    className={`w-full px-4 py-3 text-left flex items-center justify-between text-xs font-bold transition-all ${
                      isInspecting ? 'bg-indigo-600/10 border-b border-white/5 text-white' : 'bg-white/5 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold text-white">{name}</p>
                      <span className={`text-[7px] px-1.5 py-0.2 rounded-full font-black uppercase mt-1 inline-block ${CATEGORY_COLORS[catType] || CATEGORY_COLORS.General}`}>
                        {catType}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] bg-black/40 px-2 py-0.5 rounded-full font-mono text-indigo-400">
                        {occurrences.length} txs
                      </span>
                      {isInspecting ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                    </div>
                  </button>

                  {/* Reveals underlying transactions that compose this Alias upon click inspection selection */}
                  {isInspecting && (
                    <div className="p-3 bg-black/40 space-y-1 max-h-[250px] overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-1 duration-150">
                      {occurrences.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 text-[11px] border border-white/5 border-dashed">
                          <div className="min-w-0 flex-1 pr-4">
                            <p className="text-slate-300 truncate font-mono">{tx.original_narration || tx.narration}</p>
                            <p className="text-[8px] text-slate-600 mt-0.5">{tx.bank} • {new Date(tx.timestamp).toLocaleDateString()}</p>
                          </div>
                          <span className="font-black text-white shrink-0">
                            ₦{Math.abs(tx.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    );
  }

  // --- RENDERING METHOD A: STANDARD INTERMEDIARY AUDIT WORKFLOW ---
  return (
    <div className="space-y-6">
      {Object.keys(aliasedByCategory).length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 px-1">
            <Check size={12} className="text-emerald-400" />
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Aliased Transactions</span>
          </div>
          {Object.entries(aliasedByCategory).map(([category, txs]) => (
            <AliasedCategoryGroup
              key={category}
              category={category}
              transactions={txs}
              userId={userId}
              onAliasUpdate={onAliasUpdate}
              isExpanded={expandedGroups.aliasedCategories[category] ?? true}
            />
          ))}
        </div>
      )}

      {mlGroups.groups && Object.keys(mlGroups.groups).length > 0 && (
        <div className="mb-6">
          <button onClick={() => toggleGroup('mlGroups')} className="w-full flex items-center justify-between px-4 py-2 bg-amber-500/5 rounded-xl hover:bg-amber-500/10 text-left mb-2">
            <div className="flex items-center gap-2">
              {expandedGroups.mlGroups ? <ChevronDown size={14} className="text-amber-400" /> : <ChevronRight size={14} className="text-amber-400" />}
              <Brain size={12} className="text-amber-400" />
              <span className="text-[10px] font-black uppercase tracking-wider text-white">ML Suggested Groups</span>
            </div>
          </button>
          {expandedGroups.mlGroups && (
            <div className="space-y-3">
              {Object.entries(mlGroups.groups).map(([groupName, groupData]) => (
                <GroupedTransactionGroup
                  key={groupName}
                  group={groupData}
                  groupName={groupName}
                  userId={userId}
                  onAliasUpdate={onAliasUpdate}
                  isExpanded={true}
                  selectedIds={flatBatchIds}
                  toggleSelection={toggleFlatSelection('pending')}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {pendingTransactions.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between w-full px-4 py-2 bg-white/5 rounded-xl">
            <button onClick={() => setExpandedGroups(p => ({...p, pending: !p.pending}))} className="flex items-center gap-2 text-left">
              {expandedGroups.pending ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
              <Tags size={12} className="text-slate-400" />
              <span className="text-[10px] font-black uppercase tracking-wider text-white">Other Transactions</span>
            </button>
            <button onClick={() => handleFlatAliasAll('pending')} className="text-[8px] px-2 py-1 bg-indigo-600/60 text-white rounded-lg font-black uppercase">
              Alias All
            </button>
          </div>
          {expandedGroups.pending && (
            <div className="mt-2 space-y-1 pl-4">
              {flatShowForm && flatSection === 'pending' && (
                <div className="flex items-center gap-2 mb-2 px-1 animate-in fade-in duration-200">
                  <input type="text" value={flatBatchName} onChange={(e) => setFlatBatchName(e.target.value)} className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs flex-1" placeholder="Display name" />
                  <select value={flatBatchCategory} onChange={(e) => setFlatBatchCategory(e.target.value)} className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs">
                    {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <button onClick={handleFlatAliasSubmit} disabled={flatBatchSaving} className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black">Save</button>
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
                  selected={flatBatchIds.has(tx.id) && flatSection === 'pending'}
                  selectionCount={flatBatchIds.size}
                  onToggleSelect={toggleFlatSelection('pending')}
                  scopeTransactions={pendingTransactions}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {creditTransactions.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between w-full px-4 py-2 bg-emerald-500/5 rounded-xl">
            <button onClick={() => setExpandedGroups(p => ({...p, credits: !p.credits}))} className="flex items-center gap-2 text-left">
              {expandedGroups.credits ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
              <ArrowDownLeft size={12} className="text-emerald-400" />
              <span className="text-[10px] font-black uppercase tracking-wider text-white">Income / Credits</span>
            </button>
            <button onClick={() => handleFlatAliasAll('credits')} className="text-[8px] px-2 py-1 bg-indigo-600/60 text-white rounded-lg font-black uppercase">
              Alias All
            </button>
          </div>
          {expandedGroups.credits && (
            <div className="mt-2 space-y-1 pl-4">
              {flatShowForm && flatSection === 'credits' && (
                <div className="flex items-center gap-2 mb-2 px-1 animate-in fade-in duration-200">
                  <input type="text" value={flatBatchName} onChange={(e) => setFlatBatchName(e.target.value)} className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs flex-1" placeholder="Display name" />
                  <button onClick={handleFlatAliasSubmit} disabled={flatBatchSaving} className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black">Save</button>
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
                  selected={flatBatchIds.has(tx.id) && flatSection === 'credits'}
                  selectionCount={flatBatchIds.size}
                  onToggleSelect={toggleFlatSelection('credits')}
                  scopeTransactions={creditTransactions}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
