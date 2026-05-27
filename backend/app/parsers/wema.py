import re
import logging
from datetime import datetime
from typing import Optional
from .base import BankParser, Transaction, categorize

logger = logging.getLogger(__name__)

class WemaBankParser(BankParser):
    BANK_NAME      = "Wema Bank"
    SENDER_PATTERN = r"no-reply@alat\.ng|wemabank\.com"
    PROVIDES_BALANCE = True

    def parse(self, subject: str, body: str) -> Optional[Transaction]:
        # "NGN 2,500.00 has landed" → credit
        # "NGN 2,500.00 has been debited" → debit
        credit_m = re.search(r"NGN\s*([\d,]+\.?\d*)\s+has landed", body, re.IGNORECASE)
        debit_m  = re.search(r"NGN\s*([\d,]+\.?\d*)\s+has been debited", body, re.IGNORECASE)
        amount_m = credit_m or debit_m

        if not amount_m:
            # Fallback
            amount_m = re.search(r"NGN\s*([\d,]+\.?\d*)", body, re.IGNORECASE)

        tx_type = "credit" if credit_m else ("debit" if debit_m else self._tx_type(subject, body))

        # "Account Balance: 4,007.94 NGN"
        balance_m = re.search(r"Account Balance[:\s]+([\d,]+\.?\d*)\s+NGN", body, re.IGNORECASE)

        # "Account No: 0239****78" → last 4 visible digits
        acct_m = re.search(r"Account No[:\s]+[\d\*]*([\d]{2})", body, re.IGNORECASE)

        # "Date and Time: 21-05-2026 19:24:52"
        date_m = re.search(r"Date and Time[:\s]+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})", body, re.IGNORECASE)

        # "Note: NIP:..."
        narration_m = re.search(r"Note[:\s]+(.+?)(?:\n|Account Balance)", body, re.IGNORECASE | re.DOTALL)

        if not amount_m:
            return None

        narration = narration_m.group(1).strip() if narration_m else ""

        timestamp = None
        if date_m:
            try:
                timestamp = datetime.strptime(date_m.group(1).strip(), "%d-%m-%Y %H:%M:%S")
            except Exception:
                timestamp = self._date(date_m.group(1).strip())

        return Transaction(
            bank          = self.BANK_NAME,
            tx_type       = tx_type,
            amount        = self._amount(amount_m.group(1)),
            balance       = self._amount(balance_m.group(1)) if balance_m else None,
            narration     = narration,
            account_last4 = acct_m.group(1) if acct_m else self._last4(body),
            timestamp     = timestamp,
            category      = categorize(narration),
            raw_email     = body,
        )
