import sqlite3
import os
import logging
from typing import Optional, List, Dict
from datetime import datetime

logger = logging.getLogger(__name__)

DB_PATH = os.environ.get('DB_PATH', os.path.join(os.path.dirname(__file__), '..', 'mirror.db'))

def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize all database tables"""
    conn = get_db()
    
    # Users table - Updated with OAuth support
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            auth_provider TEXT DEFAULT 'yahoo',
            access_token TEXT,
            refresh_token TEXT,
            token_expiry TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_sync_at TIMESTAMP
        )
    ''')
    
    # If user_id column doesn't exist, add it for backward compatibility
    try:
        conn.execute('ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT "yahoo"')
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    try:
        conn.execute('ALTER TABLE users ADD COLUMN access_token TEXT')
    except sqlite3.OperationalError:
        pass
    
    try:
        conn.execute('ALTER TABLE users ADD COLUMN refresh_token TEXT')
    except sqlite3.OperationalError:
        pass
    
    try:
        conn.execute('ALTER TABLE users ADD COLUMN token_expiry TEXT')
    except sqlite3.OperationalError:
        pass
    
    try:
        conn.execute('ALTER TABLE users ADD COLUMN id INTEGER PRIMARY KEY AUTOINCREMENT')
    except sqlite3.OperationalError:
        pass
    
    # Transactions table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            bank TEXT NOT NULL,
            tx_type TEXT NOT NULL,
            amount REAL NOT NULL,
            balance_after REAL,
            narration TEXT,
            account_last4 TEXT,
            timestamp TEXT NOT NULL,
            email_received_at TEXT,
            category TEXT DEFAULT 'other',
            raw_email_preview TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(user_id)
        )
    ''')
    
    # Account balances table (history of all balance changes)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS account_balances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            bank TEXT NOT NULL,
            account_last4 TEXT NOT NULL,
            balance REAL NOT NULL,
            last_updated TEXT NOT NULL,
            transaction_id INTEGER,
            adjustment_reason TEXT,
            is_anchor BOOLEAN DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(user_id),
            FOREIGN KEY(transaction_id) REFERENCES transactions(id)
        )
    ''')
    
    # Account settings (user preferences)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS account_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            bank TEXT NOT NULL,
            account_last4 TEXT NOT NULL,
            nickname TEXT,
            color_preference TEXT,
            hide_from_total BOOLEAN DEFAULT 0,
            notify_on_large_transaction REAL,
            UNIQUE(user_id, bank, account_last4),
            FOREIGN KEY(user_id) REFERENCES users(user_id)
        )
    ''')

    # User Aliases (for transaction name mapping)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS user_aliases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            recipient_pattern TEXT NOT NULL,
            display_name TEXT NOT NULL,
            category TEXT DEFAULT 'General',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, recipient_pattern)
        )
    ''')

    # Create indexes for performance
    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_transactions_user_timestamp 
        ON transactions(user_id, timestamp DESC)
    ''')
    
    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_transactions_user_category 
        ON transactions(user_id, category)
    ''')
    
    # User preferences (cloud sync toggle, etc.)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS user_prefs (
            user_id TEXT PRIMARY KEY,
            cloud_sync INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(user_id)
        )
    ''')
    
    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_balances_user_account 
        ON account_balances(user_id, bank, account_last4, last_updated DESC)
    ''')
    
    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_aliases_user_pattern 
        ON user_aliases(user_id, recipient_pattern)
    ''')
    
    # Run schema migrations right after creating tables
    _migrate_users_table(conn)
    _drop_old_email_password_column(conn)
    _add_onboarding_dates_columns(conn)
    
    conn.commit()
    conn.close()

def _migrate_users_table(conn):
    """Migrate existing users table to new schema"""
    try:
        cursor = conn.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'user_id' in columns and 'id' not in columns:
            conn.execute('ALTER TABLE users RENAME TO users_old')
            conn.execute('''
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT UNIQUE,
                    email TEXT UNIQUE NOT NULL,
                    name TEXT,
                    auth_provider TEXT DEFAULT 'yahoo',
                    access_token TEXT,
                    refresh_token TEXT,
                    token_expiry TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_sync_at TIMESTAMP
                )
            ''')
            conn.execute('''
                INSERT INTO users (user_id, email, name, created_at, last_sync_at)
                SELECT user_id, email, name, created_at, last_sync_at FROM users_old
            ''')
            conn.execute('DROP TABLE users_old')
    except Exception as e:
        logger.warning(f"User table migration skipped: {e}")

def _drop_old_email_password_column(conn):
    """Drop email_password column if it exists (moved to encrypted storage)"""
    try:
        conn.execute("ALTER TABLE users DROP COLUMN email_password")
    except sqlite3.OperationalError:
        pass  # Column already gone
    except Exception as e:
        logger.warning(f"Column cleanup skipped: {e}")

def _add_onboarding_dates_columns(conn):
    """Add onboarding audit window columns to users table."""
    from datetime import datetime
    for col in ['onboarding_start_date', 'onboarding_end_date']:
        try:
            conn.execute(f'ALTER TABLE users ADD COLUMN {col} TEXT')
        except sqlite3.OperationalError:
            pass