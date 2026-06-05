import re
import logging
from datetime import datetime
from typing import Optional
from .base import BankParser, ParsedTransaction, categorize

logger = logging.getLogger(__name__)

class OPayParser(BankParser):
    BANK_NAME      = "OPay"
    SENDER_PATTERN = r"no-reply@opay-nigeria\.com|opay"
    PROVIDES_BALANCE = True

    def parse(self, subject: str, body: str) -> Optional[ParsedTransaction]:
        # "Your transfer of ₦2,500.00 is successful" → debit
        transfer_m = re.search(r"transfer of ₦([\d,]+\.?\d*)", body, re.IGNORECASE)
        # "₦2,500.00 has been credited" → credit
        credit_m   = re.search(r"₦([\d,]+\.?\d*)\s+has been credited", body, re.IGNORECASE)
        amount_m   = transfer_m or credit_m

        if not amount_m:
            amount_m = re.search(r"Amount[:\s]+₦([\d,]+\.?\d*)", body, re.IGNORECASE)

        tx_type = "debit" if transfer_m else ("credit" if credit_m else self._tx_type(subject, body))

        # "available balance is ₦12,730.44"
        balance_m = re.search(r"available balance is ₦([\d,]+\.?\d*)", body, re.IGNORECASE)

        # "Transaction Date: May 21st, 2026 19:24:36"
        date_m = re.search(
            r"Transaction Date[:\s]+([A-Za-z]+ \d+\w*, \d{4} \d{2}:\d{2}:\d{2})",
            body, re.IGNORECASE
        )

        # Recipient name as narration
        narration_m = re.search(r"Name[:\s]+(.+?)(?:\n|Bank:)", body, re.IGNORECASE | re.DOTALL)

        if not amount_m:
            return None

        narration = narration_m.group(1).strip() if narration_m else ""

        timestamp = None
        if date_m:
            date_str = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", date_m.group(1))
            try:
                timestamp = datetime.strptime(date_str.strip(), "%B %d, %Y %H:%M:%S")
            except Exception:
                pass

        return ParsedTransaction(
            bank          = self.BANK_NAME,
            tx_type       = tx_type,
            amount        = self._amount(amount_m.group(1)),
            balance       = self._amount(balance_m.group(1)) if balance_m else None,
            narration     = narration,
            # OPay emails show the destination account, not your OPay wallet number.
            # account_last4 is left None so the onboarding gaps modal prompts
            # the user to enter their own OPay account last 4 manually.
            account_last4 = None,
            timestamp     = timestamp,
            category      = categorize(narration),
            raw_email     = body,
        )
