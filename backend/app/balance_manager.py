import sqlite3
import logging
from typing import Optional, List, Dict
from datetime import datetime
from .database import get_db

logger = logging.getLogger(__name__)

class BalanceManager:
    """Manages running balances starting from user-provided initial balance"""
    
    def __init__(self, db_connection=None):
        # Ensure we handle the connection properly
        self.db = db_connection or get_db()

    def _last4(self, account_last4: str) -> str:
        """Helper to ensure we always use the last 4 digits for database keys"""
        if not account_last4:
            return ""
        return str(account_last4)[-4:]
    
    def set_initial_balance(
        self, 
        user_id: str, 
        bank: str, 
        account_last4: str, 
        balance: float,
        as_of: Optional[datetime] = None
    ):
        """Set starting balance for an account (Anchor)"""
        if as_of is None:
            as_of = datetime.now()
        
        # Standardize
        standard_last4 = self._last4(account_last4)
        
        self.db.execute('''
            INSERT OR REPLACE INTO account_balances 
            (user_id, bank, account_last4, balance, last_updated, is_anchor)
            VALUES (?, ?, ?, ?, ?, 1)
        ''', (user_id, bank, standard_last4, balance, as_of.isoformat()))
        
        self.db.commit()
    
    def update_balance_from_transaction(
        self, 
        user_id: str, 
        transaction
    ) -> Optional[float]:
        """Update balance based on new transaction"""
        
        # Normalize the incoming transaction's account number
        tx_last4 = self._last4(transaction.account_last4)
        
        # FIX: use `is not None` instead of `> 0`
        # This correctly handles NGN0.00 balances (e.g. Sterling after clearing out)
        if transaction.balance is not None:
            self._store_balance(user_id, transaction, transaction.balance)
            return transaction.balance
        
        # Otherwise calculate based on the standardized last 4
        current = self.get_current_balance(user_id, transaction.bank, tx_last4)
        
        if current is None:
            # Re-added the last 4 here for easier debugging in logs
            logger.warning(f"Balance skipped. No anchor found for {transaction.bank} (*{tx_last4})")
            return None 
        
        if transaction.tx_type == 'credit':
            new_balance = current + transaction.amount
        else:
            new_balance = current - transaction.amount
        
        self._store_balance(user_id, transaction, new_balance)
        return new_balance
    
    def _store_balance(self, user_id, transaction, balance: float):
        """Internal method to record a balance snapshot after a transaction"""
        # FIX: Standardizing here ensures the running balance row matches the anchor row
        standard_last4 = self._last4(transaction.account_last4)

        self.db.execute('''
        INSERT INTO account_balances 
        (user_id, bank, account_last4, balance, last_updated, transaction_id, is_anchor)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id,
            transaction.bank,
            standard_last4, # Use standardized here
            balance,
            datetime.now().isoformat(),
            getattr(transaction, 'id', None),
            0
        ))
        self.db.commit()

    def manual_adjust(
        self, 
        user_id: str, 
        bank: str, 
        account_last4: str, 
        new_balance: float,
        reason: str = "manual_adjustment"
    ):
        """User manually corrects balance"""
        standard_last4 = self._last4(account_last4)
        
        self.db.execute('''
            INSERT INTO account_balances 
            (user_id, bank, account_last4, balance, last_updated, adjustment_reason, is_anchor)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        ''', (
            user_id, 
            bank, 
            standard_last4, 
            new_balance, 
            datetime.now().isoformat(),
            reason
        ))
        self.db.commit()
    
    def get_current_balance(
        self, 
        user_id: str, 
        bank: str, 
        account_last4: str
    ) -> Optional[float]:
        """Get most recent balance for account"""
        standard_last4 = self._last4(account_last4)
        
        cursor = self.db.execute('''
            SELECT balance FROM account_balances 
            WHERE user_id = ? AND bank = ? AND account_last4 = ?
            ORDER BY last_updated DESC
            LIMIT 1
        ''', (user_id, bank, standard_last4))
        
        row = cursor.fetchone()
        return row['balance'] if row else None
    
    def get_all_current_balances(self, user_id: str) -> List[Dict]:
        """Get current balances — one per (bank, account_last4) pair.
        If the same bank has entries with and without real last4s, keep the real one.
        If it has multiple real last4s, they are different accounts — keep all.
        """
        cursor = self.db.execute('''
            SELECT DISTINCT bank, account_last4, balance, last_updated, is_anchor
            FROM account_balances 
            WHERE user_id = ? 
            AND (user_id, bank, account_last4, last_updated) IN (
                SELECT user_id, bank, account_last4, MAX(last_updated)
                FROM account_balances
                WHERE user_id = ?
                GROUP BY user_id, bank, account_last4
            )
        ''', (user_id, user_id))
        
        rows = [dict(row) for row in cursor.fetchall()]
        
        # Group by bank, then keep only distinct (bank, last4) — prefer real last4
        by_bank: Dict[str, List[Dict]] = {}
        for r in rows:
            by_bank.setdefault(r['bank'], []).append(r)
        
        result = []
        for bank, entries in by_bank.items():
            real = [e for e in entries if (e.get('account_last4') or '').strip() not in ('', '0000')]
            if real:
                # Keep all distinct real last4 accounts
                seen_last4 = set()
                for e in real:
                    last4 = (e.get('account_last4') or '').strip()
                    if last4 not in seen_last4:
                        seen_last4.add(last4)
                        result.append(e)
            else:
                # No real last4s — keep the latest
                result.append(max(entries, key=lambda e: e.get('last_updated') or ''))
        
        return result