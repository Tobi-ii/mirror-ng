/**
 * Mirror-NG API Service
 * Centralized interface for FastAPI backend communication.
 */
const API_BASE = ''; 

export const api = {
  /**
   * Health check to verify backend connectivity
   */
  health: async () => {
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
  },

  /**
   * Onboarding anchor points
   */
  setInitialBalances: async (userId, balances) => {
    const res = await fetch(`${API_BASE}/api/set-initial-balances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, balances })
    });
    return res.json();
  },

  /**
   * Sync transactions from IMAP (Yahoo/Gmail)
   */
  syncTransactions: async (userId, sinceDate, untilDate = null) => {
    console.log(`[Mirror] Triggering sync: ${sinceDate} to ${untilDate || 'Present'}`);
    const res = await fetch(`${API_BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        user_id: userId, 
        since_date: sinceDate,
        until_date: untilDate 
      })
    });
    if (!res.ok) throw new Error('Failed to sync with mail server');
    return res.json();
  },

  /**
   * Fetch current liquidity
   */
  getBalances: async (userId) => {
    const res = await fetch(`${API_BASE}/api/balances/${userId}`);
    return res.json();
  },

  /**
   * Retrieve transaction history
   */
  getTransactions: async (userId, { limit = 300, offset = 0, bank = null } = {}) => {
    const params = new URLSearchParams({ limit, offset });
    if (bank) params.append('bank', bank);
    const res = await fetch(`${API_BASE}/api/transactions/${userId}?${params.toString()}`);
    return res.json();
  },

  /**
   * Delete a bank account balance
   */
  deleteBalance: async (userId, bank, accountLast4) => {
    const res = await fetch(`${API_BASE}/api/balances/${userId}`, {
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
    const res = await fetch(`${API_BASE}/api/manual-adjust-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
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
    const res = await fetch(`${API_BASE}/api/insights/${userId}`);
    if (!res.ok) throw new Error('Failed to fetch insights');
    return res.json();
  },

  /**
   * LLM Agent Chat (Original - Tool-based)
   */
  chat: async (userId, message, history = []) => {
    const res = await fetch(`${API_BASE}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, message, history })
    });
    if (!res.ok) throw new Error('Agent failed to respond');
    return res.json();
  },

  /**
   * LLM Agent Chat v2 (Structured Intent Agent - No hallucination)
   */
  chatV2: async (userId, message, history = []) => {
    const res = await fetch(`${API_BASE}/api/agent/chat-v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, message, history })
    });
    if (!res.ok) throw new Error('Agent V2 failed to respond');
    return res.json();
  },

  /**
   * Get user-defined transaction aliases
   */
  getAliases: async (userId) => {
    const res = await fetch(`${API_BASE}/api/aliases/${userId}`);
    return res.json();
  },

  /**
   * Save a transaction alias
   */
  saveAlias: async (userId, data) => {
    const res = await fetch(`${API_BASE}/api/aliases/${userId}`, {
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
    const res = await fetch(`${API_BASE}/api/aliases/${userId}/${aliasId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete alias');
    return res.json();
  },

  /**
   * Generate AI-powered suggestions for transaction aliases
   * Uses ML/AI to analyze transaction narrations and suggest meaningful names & categories
   */
  generateAliasSuggestions: async (userId, narrations) => {
    try {
      const res = await fetch(`${API_BASE}/api/ai/suggest-aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: userId, 
          narrations: narrations.slice(0, 50) // Limit to 50 to avoid rate limits
        })
      });
      
      if (!res.ok) {
        // Fallback to local intelligent grouping if backend AI fails
        console.warn('AI suggestions failed, falling back to local grouping');
        return { success: true, suggestions: generateLocalSuggestions(narrations) };
      }
      
      return await res.json();
    } catch (error) {
      console.error('AI suggestion error:', error);
      // Fallback to local suggestions
      return { success: true, suggestions: generateLocalSuggestions(narrations) };
    }
  },

  /**
   * Bulk apply multiple aliases at once
   */
  bulkSaveAliases: async (userId, aliases) => {
    const res = await fetch(`${API_BASE}/api/aliases/${userId}/bulk`, {
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
    const res = await fetch(`${API_BASE}/api/ai/categorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        user_id: userId, 
        transaction_ids: transactionIds 
      })
    });
    if (!res.ok) throw new Error('Failed to categorize transactions');
    return res.json();
  }
};

/**
 * Fallback: Local intelligent grouping and suggestion generator
 * Uses pattern matching and NLP techniques when backend AI is unavailable
 */
function generateLocalSuggestions(narrations) {
  const suggestions = {};
  
  // Common patterns for Nigerian banking
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
      // Default: extract first few words as display name
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