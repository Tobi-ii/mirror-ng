import re
import logging
from datetime import datetime
from typing import Optional
from .base import BankParser, ParsedTransaction, categorize

logger = logging.getLogger(__name__)


class StanbicIBTCParser(BankParser):

    BANK_NAME        = "Stanbic IBTC"
    SENDER_PATTERN   = r"stanbicibtc-e-alert@stanbicibtc\.com|stanbicibtc"
    PROVIDES_BALANCE = True

    def parse(self, subject: str, body: str) -> Optional[ParsedTransaction]:

        # Transaction type
        type_m = re.search(r"(Debit|Credit)\s+alert\s+details", body, re.IGNORECASE)
        if type_m:
            tx_type = type_m.group(1).lower()
        else:
            tx_type = self._tx_type(subject, body)

        # Amount
        amount_m = re.search(
            r"Amount\s+NGN\s*([\d,]+\.?\d*)",
            body, re.IGNORECASE
        )

        # Balance
        balance_m = re.search(
            r"Current Balance\s+NGN\s*([\d,]+\.?\d*)",
            body, re.IGNORECASE
        )

        # Account last 4
        acct_m = re.search(
            r"Account Number\s+[Xx\*]+([\d]{4})",
            body, re.IGNORECASE
        )

        # Narration
        narr_m = re.search(
            r"Description\s+(.+?)(?:\n\s*\n|\nTransaction Reference|\nAccount)",
            body, re.IGNORECASE | re.DOTALL
        )

        # Date
        date_m = re.search(
            r"Transaction Date\s*&?\s*Time\s+(\d{2}-[A-Za-z]+-\d{4}\s+\d{2}:\d{2}:\d{2})",
            body, re.IGNORECASE
        )

        if not amount_m:
            return None

        narration = narr_m.group(1).strip() if narr_m else ""
        narration = re.sub(r'\s+', ' ', narration).strip()

        timestamp = None
        if date_m:
            date_str = date_m.group(1).strip().rstrip('.')
            try:
                timestamp = datetime.strptime(date_str, "%d-%b-%Y %H:%M:%S")
            except Exception:
                timestamp = self._date(date_str)

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
