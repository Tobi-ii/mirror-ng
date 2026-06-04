import { useState, useEffect } from 'react';
import { 
  ArrowDownLeft, ArrowUpRight, Pencil, Check, X, Brain, Sparkles, 
  ChevronDown, ChevronRight, CheckCircle2, Layers, Tags, FolderOpen 
} from 'lucide-react';
import { api } from '../services/api';

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
function TransactionItem({ tx, userId, onAliasUpdate, isAliased: initialIsAliased, index, showEditButton = true, showCheckbox, selected, onToggleSelect }) {
  const [isEditing, setIsEditing] = useState(false);
  const [aliasName, setAliasName] = useState(tx?.narration || '');
  const [category, setCategory] = useState(tx?.category || 'General');
  const [isSaving, setIsSaving] = useState(false);
  const [isAliased, setIsAliased] = useState(initialIsAliased);
  
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

  const handleSaveAlias = async () => {
    if (!aliasName.trim()) return;
    
    setIsSaving(true);
    try {
      await api.saveAlias(userId, {
        recipient_pattern: originalNarration.slice(0, 60),
        display_name: aliasName,
        category: category
      });
      
      setIsAliased(true);
      setIsEditing(false);
      if (onAliasUpdate) onAliasUpdate();
    } catch (error) {
      console.error('Failed to save alias:', error);
    } finally {
      setIsSaving(false);
    }
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
  };

  // Always show edit button if showEditButton is true (now for credits too)
  const canEdit = showEditButton && (isCredit || !isAliased || isAliased);

  return (
    <div
      className={`flex items-center justify-between px-5 py-5 border-l-2 ${theme.border} ${theme.bg} rounded-r-2xl transition-all group mb-1.5 hover:bg-opacity-30`}
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
                <option key={cat} value={cat}>{cat}</option>
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
            {showCheckbox && (
              <button onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
                className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                  selected ? 'bg-indigo-600 border-indigo-500' : 'border-white/20 hover:border-white/40'
                }`}>
                {selected && <Check size={10} className="text-white" />}
              </button>
            )}
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${theme.dot}`} />

            <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center ${
              isCredit ? theme.creditIcon : theme.debitIcon
            }`}>
              {isCredit ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-xs font-bold truncate ${isAliased ? 'text-indigo-300' : 'text-white'}`}>
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
            
            {/* Show edit button for all transactions (including credits and aliased) */}
            {canEdit && (
              <button
                onClick={() => {
                  setIsEditing(true);
                  setAliasName(tx.narration);
                  setCategory(tx.category || 'General');
                }}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/10 rounded-lg transition-all"
              >
                <Pencil size={12} className="text-slate-400" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Category Group for Aliased Transactions
function AliasedCategoryGroup({ category, transactions, userId, onAliasUpdate, isExpanded, onToggle }) {
  const [expanded, setExpanded] = useState(isExpanded);
  const [isBatchEditing, setIsBatchEditing] = useState(false);
  const [batchName, setBatchName] = useState(category);
  const [batchCategory, setBatchCategory] = useState(category);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBatchAlias = async () => {
    if (!batchName.trim()) return;
    const toAlias = transactions.filter(tx => selectedIds.has(tx.id));
    if (toAlias.length === 0) return;
    
    setIsSaving(true);
    try {
      for (const tx of toAlias) {
        await api.saveAlias(userId, {
          recipient_pattern: (tx.original_narration || tx.narration).slice(0, 60),
          display_name: batchName,
          category: batchCategory
        });
      }
      setIsBatchEditing(false);
      setSelectedIds(new Set());
      if (onAliasUpdate) onAliasUpdate();
    } catch (error) {
      console.error('Failed to batch alias:', error);
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
    <div className="mb-4 border border-white/5 rounded-xl overflow-hidden">
      <div className={`px-4 py-2 ${bgColor.replace('bg-', 'bg-opacity-20 bg-') || 'bg-white/5'}`}>
        <div className="flex items-center justify-between">
          <button onClick={toggleExpand} className="flex items-center gap-2 flex-1">
            {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
            <FolderOpen size={14} className={catColor} />
            <span className={`text-xs font-black uppercase tracking-wider ${catColor}`}>{category}</span>
            <span className="text-[8px] px-1.5 py-0.5 bg-white/10 rounded-full">{transactions.length} transactions</span>
          </button>
          
          {!isBatchEditing && (
            <button onClick={() => { setIsBatchEditing(true); setExpanded(true); }}
              className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider hover:bg-indigo-700 transition-colors"
            >
              Alias All ({transactions.length})
            </button>
          )}
          
          {isBatchEditing && (
            <div className="flex items-center gap-1.5">
              <button onClick={handleBatchAlias} disabled={isSaving || selectedIds.size === 0}
                className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                {selectedIds.size === 0 ? 'Select transactions' : `Alias Selected (${selectedIds.size})`}
              </button>
              <button onClick={() => { setIsBatchEditing(false); setSelectedIds(new Set()); }}
                className="p-1 bg-white/5 rounded-lg text-slate-400 hover:bg-white/10"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
      
      {expanded && (
        <div className="p-2 space-y-1">
          {isBatchEditing && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <input type="text" value={batchName} onChange={(e) => setBatchName(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs w-32 flex-1 min-w-0"
                placeholder="Display name" autoFocus />
              <select value={batchCategory} onChange={(e) => setBatchCategory(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs"
              >
                {CATEGORIES.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
              </select>
              <span className="text-[8px] text-slate-400 whitespace-nowrap">{selectedIds.size} / {transactions.length}</span>
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
              showEditButton={!isBatchEditing}
              showCheckbox={isBatchEditing}
              selected={selectedIds.has(tx.id)}
              onToggleSelect={() => toggleSelection(tx.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Grouped Transaction Component with Batch Alias (for ML suggested groups)
function GroupedTransactionGroup({ group, groupName, userId, onAliasUpdate, isExpanded, onToggle }) {
  const [isBatchEditing, setIsBatchEditing] = useState(false);
  const [batchName, setBatchName] = useState(group?.display_name || '');
  const [batchCategory, setBatchCategory] = useState(group?.category || 'General');
  const [isSaving, setIsSaving] = useState(false);
  const [expanded, setExpanded] = useState(isExpanded);
  const [isAliased, setIsAliased] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  if (!group || !group.transactions) return null;

  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBatchAlias = async () => {
    if (!batchName.trim()) return;
    
    const toAlias = group.transactions.filter(tx => selectedIds.has(tx.id));
    if (toAlias.length === 0) return;
    
    setIsSaving(true);
    try {
      for (const tx of toAlias) {
        await api.saveAlias(userId, {
          recipient_pattern: (tx.original_narration || tx.narration).slice(0, 60),
          display_name: batchName,
          category: batchCategory
        });
      }
      setIsAliased(true);
      setIsBatchEditing(false);
      setSelectedIds(new Set());
      if (onAliasUpdate) onAliasUpdate();
    } catch (error) {
      console.error('Failed to save batch alias:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleExpand = () => {
    setExpanded(!expanded);
    if (onToggle) onToggle(!expanded);
  };

  const allAliased = group.transactions.every(tx => tx.aliased === true) || isAliased;

  return (
    <div className="mb-4 border border-white/5 rounded-xl overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 px-4 py-2">
        <div className="flex items-center justify-between">
          <button onClick={toggleExpand} className="flex items-center gap-2 flex-1">
            {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
            <Layers size={14} className="text-indigo-400" />
            <span className="text-xs font-black uppercase tracking-wider text-white">{groupName}</span>
            <span className="text-[8px] px-1.5 py-0.5 bg-white/10 rounded-full">{group.transactions.length} transactions</span>
            {allAliased && <Check size={10} className="text-emerald-400" />}
          </button>
          
          {!allAliased && !isBatchEditing && (
            <button
              onClick={() => { setIsBatchEditing(true); setExpanded(true); }}
              className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider hover:bg-indigo-700 transition-colors"
            >
              Alias All ({group.transactions.length})
            </button>
          )}
          
          {isBatchEditing && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleBatchAlias}
                disabled={isSaving || selectedIds.size === 0}
                className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {selectedIds.size === 0 ? 'Select transactions' : `Alias Selected (${selectedIds.size})`}
              </button>
              <button
                onClick={() => { setIsBatchEditing(false); setSelectedIds(new Set()); }}
                className="p-1 bg-white/5 rounded-lg text-slate-400 hover:bg-white/10"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
      
      {expanded && (
        <div className="p-2 space-y-1">
          {isBatchEditing && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <input
                type="text"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs w-32 flex-1 min-w-0"
                placeholder="Display name"
                autoFocus
              />
              <select
                value={batchCategory}
                onChange={(e) => setBatchCategory(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <span className="text-[8px] text-slate-400 whitespace-nowrap">{selectedIds.size} / {group.transactions.length}</span>
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
              showEditButton={!isBatchEditing}
              showCheckbox={isBatchEditing}
              selected={selectedIds.has(tx.id)}
              onToggleSelect={() => toggleSelection(tx.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
  
  const [isPendingBatch, setIsPendingBatch] = useState(false);
  const [isCreditBatch, setIsCreditBatch] = useState(false);
  const [flatBatchIds, setFlatBatchIds] = useState(new Set());
  const [flatBatchName, setFlatBatchName] = useState('');
  const [flatBatchCategory, setFlatBatchCategory] = useState('General');
  const [flatBatchSaving, setFlatBatchSaving] = useState(false);

  const toggleFlatSelection = (id) => {
    setFlatBatchIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleFlatBatchAlias = async () => {
    if (!flatBatchName.trim()) return;
    setFlatBatchSaving(true);
    try {
      const all = isPendingBatch ? pendingTransactions : creditTransactions;
      for (const tx of all.filter(t => flatBatchIds.has(t.id))) {
        await api.saveAlias(userId, {
          recipient_pattern: (tx.original_narration || tx.narration).slice(0, 60),
          display_name: flatBatchName,
          category: flatBatchCategory
        });
      }
      setIsPendingBatch(false);
      setIsCreditBatch(false);
      setFlatBatchIds(new Set());
      if (onAliasUpdate) onAliasUpdate();
    } catch (error) {
      console.error('Failed to batch alias:', error);
    } finally {
      setFlatBatchSaving(false);
    }
  };

  const cancelFlatBatch = () => {
    setIsPendingBatch(false);
    setIsCreditBatch(false);
    setFlatBatchIds(new Set());
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
            {!isPendingBatch && (
              <button onClick={() => { setIsPendingBatch(true); setExpandedGroups(p => ({ ...p, pending: true })); }}
                className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider hover:bg-indigo-700 transition-colors"
              >
                Alias All ({pendingTransactions.length})
              </button>
            )}
            {isPendingBatch && (
              <div className="flex items-center gap-1.5">
                <button onClick={handleFlatBatchAlias} disabled={flatBatchSaving || flatBatchIds.size === 0}
                  className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  {flatBatchIds.size === 0 ? 'Select transactions' : `Alias Selected (${flatBatchIds.size})`}
                </button>
                <button onClick={cancelFlatBatch} className="p-1 bg-white/5 rounded-lg text-slate-400 hover:bg-white/10">
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
          
          {expandedGroups.pending && (
            <div className="mt-2 space-y-1 pl-4">
              {isPendingBatch && (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <input type="text" value={flatBatchName} onChange={(e) => setFlatBatchName(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs w-32 flex-1 min-w-0"
                    placeholder="Display name" autoFocus />
                  <select value={flatBatchCategory} onChange={(e) => setFlatBatchCategory(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs"
                  >
                    {CATEGORIES.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                  </select>
                  <span className="text-[8px] text-slate-400 whitespace-nowrap">{flatBatchIds.size} / {pendingTransactions.length}</span>
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
                  showEditButton={!isPendingBatch}
                  showCheckbox={isPendingBatch}
                  selected={flatBatchIds.has(tx.id)}
                  onToggleSelect={() => toggleFlatSelection(tx.id)}
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
            {!isCreditBatch && (
              <button onClick={() => { setIsCreditBatch(true); setExpandedGroups(p => ({ ...p, credits: true })); }}
                className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider hover:bg-indigo-700 transition-colors"
              >
                Alias All ({creditTransactions.length})
              </button>
            )}
            {isCreditBatch && (
              <div className="flex items-center gap-1.5">
                <button onClick={handleFlatBatchAlias} disabled={flatBatchSaving || flatBatchIds.size === 0}
                  className="text-[8px] px-2 py-1 bg-indigo-600 text-white rounded-lg font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  {flatBatchIds.size === 0 ? 'Select transactions' : `Alias Selected (${flatBatchIds.size})`}
                </button>
                <button onClick={cancelFlatBatch} className="p-1 bg-white/5 rounded-lg text-slate-400 hover:bg-white/10">
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
          
          {expandedGroups.credits && (
            <div className="mt-2 space-y-1 pl-4">
              {isCreditBatch && (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <input type="text" value={flatBatchName} onChange={(e) => setFlatBatchName(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs w-32 flex-1 min-w-0"
                    placeholder="Display name" autoFocus />
                  <select value={flatBatchCategory} onChange={(e) => setFlatBatchCategory(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs"
                  >
                    {CATEGORIES.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
                  </select>
                  <span className="text-[8px] text-slate-400 whitespace-nowrap">{flatBatchIds.size} / {creditTransactions.length}</span>
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
                  showEditButton={!isCreditBatch}
                  showCheckbox={isCreditBatch}
                  selected={flatBatchIds.has(tx.id)}
                  onToggleSelect={() => toggleFlatSelection(tx.id)}
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
  );
}