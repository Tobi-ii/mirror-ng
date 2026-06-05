import re
import logging
from datetime import datetime
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class ParsedTransaction:
    bank: str
    tx_type: str
    amount: float
    balance: Optional[float]
    narration: str
    account_last4: Optional[str]
    timestamp: datetime
    category: str
    raw_email: str

    def to_dict(self):
        return {
            "id": getattr(self, 'id', None),
            "bank": self.bank,
            "tx_type": self.tx_type,
            "amount": self.amount,
            "balance": self.balance,
            "narration": self.narration,
            "account_last4": self.account_last4,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "category": self.category,
        }

class BankParser:
    """Base class for all bank parsers"""
    BANK_NAME = "Generic Bank"
    SENDER_PATTERN = r"@"
    
    def _amount(self, val: str) -> Optional[float]:
        if not val: return None
        try:
            return float(val.replace(',', ''))
        except ValueError:
            return None

    def _date(self, date_str: str) -> Optional[datetime]:
        if not date_str: return None
        date_str = re.sub(r'\s+', ' ', date_str.strip())
        formats = [ "%d/%m/%Y %I:%M %p", "%d/%m/%Y %H:%M:%S", "%d-%m-%Y %I:%M %p", "%d-%m-%Y %H:%M:%S",]
        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue
        return None

    def _tx_type(self, subject: str, body: str) -> str:
        text = (subject + " " + body).lower()
        if any(w in text for w in ['debit', 'money out', 'sent']): return 'debit'
        return 'credit'

    def parse(self, subject: str, body: str) -> Optional[ParsedTransaction]:
        """Subclasses must implement this"""
        raise NotImplementedError("Subclasses must implement parse()")

def categorize(narration: str) -> str:
    n = narration.lower()
    if any(w in n for w in ['airtime', 'data', 'mtn']): return 'Utilities'
    if any(w in n for w in ['transfer', 'nip']): return 'Transfer'
    return 'General'