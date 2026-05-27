const DB_NAME = 'mirror-ng';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('data')) {
        db.createObjectStore('data');
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function get(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('data', 'readonly');
    const req = tx.objectStore('data').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function set(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('data', 'readwrite');
    tx.objectStore('data').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function del(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('data', 'readwrite');
    tx.objectStore('data').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function pfx(userId, type) {
  return `${type}_${userId}`;
}

export const localData = {
  async saveTransactions(userId, txs) {
    const existing = await this.getTransactions(userId) || [];
    const merged = [...existing];
    for (const tx of txs) {
      const dup = merged.find(
        e => e.bank === tx.bank && e.amount === tx.amount && e.timestamp === tx.timestamp
      );
      if (!dup) merged.push(tx);
    }
    await set(pfx(userId, 'txn'), merged);
    return merged;
  },

  async getTransactions(userId) {
    return (await get(pfx(userId, 'txn'))) || [];
  },

  async saveBalances(userId, bals) {
    const existing = await this.getBalances(userId) || [];
    for (const b of bals) {
      const idx = existing.findIndex(e => e.bank === b.bank);
      if (idx >= 0) existing[idx] = b;
      else existing.push(b);
    }
    await set(pfx(userId, 'bal'), existing);
    return existing;
  },

  async getBalances(userId) {
    return (await get(pfx(userId, 'bal'))) || [];
  },

  async deleteBalance(userId, bank) {
    const bals = await this.getBalances(userId);
    const filtered = bals.filter(b => b.bank !== bank);
    await set(pfx(userId, 'bal'), filtered);
    return filtered;
  },

  async adjustBalance(userId, bank, newBalance) {
    const bals = await this.getBalances(userId);
    const idx = bals.findIndex(b => b.bank === bank);
    if (idx >= 0) bals[idx].balance = newBalance;
    else bals.push({ bank, account_last4: '0000', balance: newBalance, last_updated: new Date().toISOString(), is_anchor: true });
    await set(pfx(userId, 'bal'), bals);
    return bals;
  },

  async saveAliases(userId, aliases) {
    await set(pfx(userId, 'alias'), aliases);
    return aliases;
  },

  async getAliases(userId) {
    return (await get(pfx(userId, 'alias'))) || [];
  },

  async deleteAlias(userId, aliasId) {
    const aliases = await this.getAliases(userId);
    const filtered = aliases.filter(a => a.id !== aliasId);
    await set(pfx(userId, 'alias'), filtered);
    return filtered;
  },

  async getExport(userId) {
    const transactions = await this.getTransactions(userId);
    const balances = await this.getBalances(userId);
    const aliases = await this.getAliases(userId);
    return { transactions, balances, aliases };
  },

  async importData(userId, { transactions, balances, aliases }) {
    if (transactions) await set(pfx(userId, 'txn'), transactions);
    if (balances) await set(pfx(userId, 'bal'), balances);
    if (aliases) await set(pfx(userId, 'alias'), aliases);
  },

  async clearUser(userId) {
    await del(pfx(userId, 'txn'));
    await del(pfx(userId, 'bal'));
    await del(pfx(userId, 'alias'));
  }
};
