import re
import logging
from typing import Optional
from datetime import datetime
from .base import BankParser, ParsedTransaction, categorize

logger = logging.getLogger(__name__)

class SterlingBankParser(BankParser):
    BANK_NAME      = "Sterling Bank"
    SENDER_PATTERN = r"e-business@sterling\.ng"
    PROVIDES_BALANCE = True

    def parse(self, subject: str, body: str) -> Optional[ParsedTransaction]:
        # Amount: "NGN2,100.00" (no space)
        amount_m = re.search(r"Amount\s+NGN([\d,]+\.?\d*)", body, re.IGNORECASE)

        # Balance: "Current Balance\s+NGN0.00"
        balance_m = re.search(r"Current Balance\s+NGN([\d,]+\.?\d*)", body, re.IGNORECASE)

        # Account: "*****95156" — take last 4
        acct_m = re.search(r"Account Number\s+[\*\d]*([\d]{4})", body, re.IGNORECASE)

        # Date: "23/05/2026 6:21 AM"
        date_m = re.search(r"Date\s+(\d{2}/\d{2}/\d{4}\s+\d+:\d{2}\s+[AP]M)", body, re.IGNORECASE)

        # Type: "Transaction\s+DEBIT" or "CREDIT"
        type_m = re.search(r"Transaction\s+(DEBIT|CREDIT)", body, re.IGNORECASE)

        narration_m = re.search(r"Description\s+(.+?)(?:\n|Amount)", body, re.IGNORECASE | re.DOTALL)

        if not amount_m:
            return None

        tx_type = type_m.group(1).lower() if type_m else self._tx_type(subject, body)
        narration = narration_m.group(1).strip() if narration_m else ""

        # Date format: "23/05/2026 6:21 AM"
        timestamp = None
        if date_m:
            try:
                timestamp = datetime.strptime(date_m.group(1).strip(), "%d/%m/%Y %I:%M %p")
            except Exception:
                timestamp = self._date(date_m.group(1).strip())

        return ParsedTransaction(
            bank          = self.BANK_NAME,
            tx_type       = tx_type,
            amount        = self._amount(amount_m.group(1)),
            balance       = self._amount(balance_m.group(1)) if balance_m else None,
            narration     = narration,
            account_last4 = acct_m.group(1) if acct_m else None,
            timestamp     = timestamp,
            category      = categorize(narration),
            raw_email     = body,
        )
