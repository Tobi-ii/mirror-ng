/**
 * Mirror-NG API Service
 * Centralized interface for FastAPI backend communication.
 * Routes to local IndexedDB when cloud sync is OFF.
 */
import { localData } from './localData';

const API_BASE = '';

let _password = null;
let _cloudSync = true;
let _userId = null;

export function setPassword(pwd) {
  _password = pwd;
}

export function clearPassword() {
  _password = null;
}

export function setCloudSync(enabled) {
  _cloudSync = enabled;
}

export function isCloudSync() {
  return _cloudSync;
}

export function setUserId(id) {
  _userId = id;
}

function getToken() {
  try {
    const user = JSON.parse(localStorage.getItem('mirror_user') || '{}');
    return user.token || null;
  } catch { return null; }
}

function getUserId() {
  if (_userId) return _userId;
  try {
    const user = JSON.parse(localStorage.getItem('mirror_user') || '{}');
    return user.id || null;
  } catch { return null; }
}

async function authFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('mirror_user');
    clearPassword();
    window.location.href = '/';
  }
  return res;
}

export const api = {
  /**
   * Health check to verify backend connectivity
   */
  health: async () => {
    const res = await authFetch(`${API_BASE}/health`);
    return res.json();
  },

  /**
   * Onboarding anchor points
   */
  setInitialBalances: async (userId, balances) => {
    if (!_cloudSync) {
      await localData.saveBalances(userId, balances.map(b => ({
        ...b, last_updated: new Date().toISOString(), is_anchor: true
      })));
      return { success: true };
    }
    const res = await authFetch(`${API_BASE}/api/set-initial-balances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: String(userId), balances })
    });
    return res.json();
  },

  /**
   * Get onboarding gaps (unresolved accounts needing balance anchors)
   */
  getOnboardingGaps: async (userId) => {
    if (!_cloudSync) return { success: true, gaps: [] };
    const res = await authFetch(`${API_BASE}/api/onboarding-gaps/${String(userId)}`);
    if (!res.ok) throw new Error('Failed to fetch onboarding gaps');
    return res.json();
  },

  /**
   * Resolve onboarding gaps by setting missing balances
   */
  resolveOnboardingGaps: async (userId, resolutions) => {
    if (!_cloudSync) return { success: true };
    const res = await authFetch(`${API_BASE}/api/onboarding-gaps/${String(userId)}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolutions })
    });
    if (!res.ok) throw new Error('Failed to resolve gaps');
    return res.json();
  },

  /**
   * Sync transactions from IMAP (Yahoo/Gmail)
   */
  syncTransactions: async (userId, sinceDate, untilDate = null) => {
    const body = { 
      user_id: String(userId), 
      since_date: sinceDate,
      until_date: untilDate 
    };
    if (_password) {
      body.password = _password;
    }
    const res = await authFetch(`${API_BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to sync with mail server' }));
      throw new Error(JSON.stringify(err.detail) || 'Failed to sync with mail server');
    }
    const data = await res.json();
    // When cloud sync is off, store results locally
    if (!_cloudSync && data.success && data.new_transactions?.length) {
      await localData.saveTransactions(userId, data.new_transactions);
      // Derive balances from transactions
      const localBals = await localData.getBalances(userId);
      for (const tx of data.new_transactions) {
        const existing = localBals.find(b => b.bank === tx.bank);
        if (tx.balance !== null && tx.balance !== undefined) {
          if (existing) existing.balance = tx.balance;
          else localBals.push({ bank: tx.bank, account_last4: tx.account_last4 || '0000', balance: tx.balance, last_updated: tx.timestamp, is_anchor: false });
        }
      }
      await localData.saveBalances(userId, localBals);
    }
    return data;
  },

  /**
   * Fetch current liquidity
   */
  getBalances: async (userId) => {
    if (!_cloudSync) {
      const bals = await localData.getBalances(userId);
      return { success: true, balances: bals, total_accounts: bals.length };
    }
    const res = await authFetch(`${API_BASE}/api/balances/${String(userId)}`);
    return res.json();
  },

  /**
   * Retrieve transaction history
   */
  getTransactions: async (userId, { limit = 300, offset = 0, bank = null } = {}) => {
    if (!_cloudSync) {
      let txs = await localData.getTransactions(userId);
      if (bank) txs = txs.filter(t => t.bank === bank);
      const sliced = txs.slice(offset, offset + limit);
      return { success: true, transactions: sliced, count: sliced.length, has_more: offset + limit < txs.length };
    }
    const params = new URLSearchParams({ limit, offset });
    if (bank) params.append('bank', bank);
    const res = await authFetch(`${API_BASE}/api/transactions/${String(userId)}?${params.toString()}`);
    return res.json();
  },

  /**
   * Delete a bank account balance
   */
  deleteBalance: async (userId, bank, accountLast4) => {
    if (!_cloudSync) {
      await localData.deleteBalance(userId, bank);
      return { success: true };
    }
    const res = await authFetch(`${API_BASE}/api/balances/${String(userId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bank: bank,
        account_last4: accountLast4
      })
    });
    if (!res.ok) throw new Error('Failed to delete bank account');
    return res.json();
  },

  /**
   * Manual balance adjustment
   */
  adjustBalance: async (userId, bank, accountLast4, newBalance, reason) => {
    if (!_cloudSync) {
      await localData.adjustBalance(userId, bank, parseFloat(newBalance));
      return { success: true };
    }
    const res = await authFetch(`${API_BASE}/api/manual-adjust-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: String(userId),
        bank,
        account_last4: accountLast4,
        new_balance: newBalance,
        reason
      })
    });
    return res.json();
  },

  /**
   * Financial insights and forecasting
   */
  getInsights: async (userId) => {
    if (!_cloudSync) return { success: true, anomalies: [], forecast: [], message: "Local mode — insights available in Ask Mirror" };
    const res = await authFetch(`${API_BASE}/api/insights/${String(userId)}`);
    if (!res.ok) throw new Error('Failed to fetch insights');
    return res.json();
  },

  /**
   * LLM Agent Chat (Original - Tool-based)
   */
  chat: async (userId, message, history = []) => {
    const body = { user_id: String(userId), message, history };
    if (!_cloudSync) {
      const txs = await localData.getTransactions(userId);
      body.local_transactions = txs;
    }
    const res = await authFetch(`${API_BASE}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Agent failed to respond');
    return res.json();
  },

  /**
   * LLM Agent Chat v2 (Structured Intent Agent - No hallucination)
   */
  chatV2: async (userId, message, history = []) => {
    const body = { user_id: String(userId), message, history };
    if (!_cloudSync) {
      const txs = await localData.getTransactions(userId);
      body.local_transactions = txs;
    }
    const res = await authFetch(`${API_BASE}/api/agent/chat-v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Agent V2 failed to respond');
    return res.json();
  },

  /**
   * Get user-defined transaction aliases
   */
  getAliases: async (userId) => {
    if (!_cloudSync) {
      const aliases = await localData.getAliases(userId);
      return { success: true, aliases };
    }
    const res = await authFetch(`${API_BASE}/api/aliases/${String(userId)}`);
    return res.json();
  },

  /**
   * Save a transaction alias
   */
  saveAlias: async (userId, data) => {
    if (!_cloudSync) {
      const aliases = await localData.getAliases(userId);
      const newAlias = { id: Date.now(), ...data };
      aliases.push(newAlias);
      await localData.saveAliases(userId, aliases);
      return { success: true, alias: newAlias };
    }
    const res = await authFetch(`${API_BASE}/api/aliases/${String(userId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient_pattern: data.recipient_pattern,
        display_name: data.display_name,
        category: data.category || 'General'
      })
    });
    if (!res.ok) throw new Error('Failed to save alias');
    return res.json();
  },

  /**
   * Delete a transaction alias
   */
  deleteAlias: async (userId, aliasId) => {
    if (!_cloudSync) {
      await localData.deleteAlias(userId, aliasId);
      return { success: true };
    }
    const res = await authFetch(`${API_BASE}/api/aliases/${String(userId)}/${aliasId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete alias');
    return res.json();
  },

  /**
   * Generate AI-powered suggestions for transaction aliases
   */
  generateAliasSuggestions: async (userId, narrations) => {
    try {
      if (!_cloudSync) {
        return { success: true, suggestions: generateLocalSuggestions(narrations) };
      }
      const res = await authFetch(`${API_BASE}/api/ai/suggest-aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: String(userId), 
          narrations: narrations.slice(0, 50)
        })
      });
      
      if (!res.ok) {
        console.warn('AI suggestions failed, falling back to local grouping');
        return { success: true, suggestions: generateLocalSuggestions(narrations) };
      }
      
      return await res.json();
    } catch (error) {
      console.error('AI suggestion error:', error);
      return { success: true, suggestions: generateLocalSuggestions(narrations) };
    }
  },

  /**
   * Bulk apply multiple aliases at once
   */
  bulkSaveAliases: async (userId, aliases) => {
    if (!_cloudSync) {
      const existing = await localData.getAliases(userId);
      const merged = [...existing, ...aliases.map(a => ({ id: Date.now() + Math.random(), ...a }))];
      await localData.saveAliases(userId, merged);
      return { success: true };
    }
    const res = await authFetch(`${API_BASE}/api/aliases/${String(userId)}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aliases })
    });
    if (!res.ok) throw new Error('Failed to bulk save aliases');
    return res.json();
  },

  /**
   * Get AI-powered transaction categorization for audit window
   */
  categorizeTransactions: async (userId, transactionIds) => {
    const res = await authFetch(`${API_BASE}/api/ai/categorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        user_id: String(userId), 
        transaction_ids: transactionIds 
      })
    });
    if (!res.ok) throw new Error('Failed to categorize transactions');
    return res.json();
  },

  // ── Cloud sync management ──────────────────────────────────────

  getCloudSync: async (userId) => {
    const res = await authFetch(`${API_BASE}/api/cloud-sync/${String(userId)}`);
    return res.json();
  },

  setCloudSync: async (userId, enabled) => {
    const res = await authFetch(`${API_BASE}/api/cloud-sync/${String(userId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: String(userId), cloud_sync: enabled })
    });
    return res.json();
  },

  exportData: async (userId) => {
    const res = await authFetch(`${API_BASE}/api/data/export/${String(userId)}`);
    return res.json();
  },

  importData: async (userId, data) => {
    const res = await authFetch(`${API_BASE}/api/data/import/${String(userId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: String(userId), ...data })
    });
    return res.json();
  }
};

/**
 * Export transactions as CSV with alias-based category.
 * Columns: Date, Narration, Amount, Category
 * Category = the alias display_name if a match exists.
 */
export function exportCSV(transactions, aliases, filename = 'mirror-ng.csv') {
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;

  const rows = transactions.map(tx => {
    const narration = (tx.narration || '').trim();
    const match = aliases.find(a =>
      narration.toLowerCase().includes((a.recipient_pattern || '').toLowerCase())
    );
    return {
      date: tx.timestamp ? tx.timestamp.split('T')[0] : '',
      narration: match ? match.display_name : narration,
      amount: tx.tx_type === 'credit' ? tx.amount : -(tx.amount || 0),
      category: match ? (match.display_name || '') : ''
    };
  });

  const header = 'Date,Narration,Amount,Category';
  const csv = [header, ...rows.map(r =>
    [esc(r.date), esc(r.narration), r.amount, esc(r.category)].join(',')
  )].join('\r\n');

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Fallback: Local intelligent grouping and suggestion generator
 */
function generateLocalSuggestions(narrations) {
  const suggestions = {};
  
  const patterns = {
    'food': {
      keywords: ['mcdonald', 'kfc', 'domino', 'pizza', 'burger', 'restaurant', 'cafe', 'eatery', 'food', 'chicken'],
      category: 'Food',
      cleanName: (text) => {
        if (text.includes('MCDONALD')) return "McDonald's";
        if (text.includes('KFC')) return "KFC";
        if (text.includes('DOMINO')) return "Domino's Pizza";
        return text.split(' ').slice(0, 2).join(' ');
      }
    },
    'transport': {
      keywords: ['uber', 'bolt', 'taxi', 'transport', 'lagos bus', 'brt', 'train', 'fuel', 'petrol', 'gas station'],
      category: 'Transport',
      cleanName: (text) => {
        if (text.includes('UBER')) return "Uber";
        if (text.includes('BOLT')) return "Bolt";
        if (text.includes('FUEL') || text.includes('PETROL')) return "Fuel Purchase";
        return text.split(' ').slice(0, 2).join(' ');
      }
    },
    'data_airtime': {
      keywords: ['mtn', 'glo', 'airtel', '9mobile', 'airtime', 'data plan', 'internet', 'subscription'],
      category: 'Data & Airtime',
      cleanName: (text) => {
        if (text.includes('MTN')) return "MTN";
        if (text.includes('GLO')) return "GLO";
        if (text.includes('AIRTEL')) return "Airtel";
        return "Data & Airtime";
      }
    },
    'shopping': {
      keywords: ['jumia', 'konga', 'amazon', 'aliexpress', 'shop', 'mall', 'store', 'retail'],
      category: 'Shopping',
      cleanName: (text) => {
        if (text.includes('JUMIA')) return "Jumia";
        if (text.includes('KONGA')) return "Konga";
        return text.split(' ').slice(0, 2).join(' ');
      }
    },
    'utilities': {
      keywords: ['ikeja electric', 'eko electric', 'abuja disco', 'water', 'waste', 'bill', 'utility'],
      category: 'Utilities',
      cleanName: (text) => {
        if (text.includes('IKEJA')) return "Ikeja Electric";
        if (text.includes('WATER')) return "Water Bill";
        return "Utility Bill";
      }
    },
    'entertainment': {
      keywords: ['netflix', 'showmax', 'spotify', 'apple music', 'cinema', 'movie', 'game', 'playstation'],
      category: 'Entertainment',
      cleanName: (text) => {
        if (text.includes('NETFLIX')) return "Netflix";
        if (text.includes('SHOWMAX')) return "Showmax";
        if (text.includes('SPOTIFY')) return "Spotify";
        return text.split(' ').slice(0, 2).join(' ');
      }
    },
    'transfer': {
      keywords: ['transfer to', 'send money', 'payment to', 'credit to'],
      category: 'Transfer',
      cleanName: (text) => {
        const match = text.match(/transfer to (\w+)/i);
        if (match) return `Transfer to ${match[1]}`;
        return "Bank Transfer";
      }
    }
  };

  for (const narration of narrations) {
    const lowerNarration = narration.toLowerCase();
    let suggested = false;
    
    for (const [key, pattern] of Object.entries(patterns)) {
      if (pattern.keywords.some(keyword => lowerNarration.includes(keyword))) {
        suggestions[narration] = {
          display_name: pattern.cleanName(narration),
          category: pattern.category,
          group: pattern.category,
          confidence: 0.7
        };
        suggested = true;
        break;
      }
    }
    
    if (!suggested) {
      const words = narration.split(' ');
      const displayName = words.slice(0, 3).join(' ').substring(0, 30);
      suggestions[narration] = {
        display_name: displayName || "Transaction",
        category: "General",
        group: "General",
        confidence: 0.3
      };
    }
  }
  
  return suggestions;
}
