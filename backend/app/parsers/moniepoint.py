"""
moniepoint.py — Moniepoint Bank alert email parser

Sender:  no-reply@moniepoint.com

──────────────────────────────────────────────────────────
Sample CREDIT alert (Moniepoint)
──────────────────────────────────────────────────────────
Subject: Credit alert!

Hi [CUSTOMER NAME],

We wish to inform you that a credit transaction occurred
on your account with us.

Credit Amount
 9,500.00

Transaction Details

Account Balance:
N 10,256.12

Account Number:
[FULL ACCOUNT NUMBER]

Sender's Name:
from [SENDER NAME]

Date & Time:
22 May, 2026 | 10:28:56 AM

Narration:
MOBILE TRF TO MMF [NARRATION]
──────────────────────────────────────────────────────────
Note: Moniepoint exposes full account number in email.
Amount has no currency prefix — just a plain number.
Balance uses "N" prefix (not NGN or ₦).
Date format: "22 May, 2026 | 10:28:56 AM"
──────────────────────────────────────────────────────────
"""

import re
import logging
from datetime import datetime
from typing import Optional
from .base import BankParser, ParsedTransaction, categorize

logger = logging.getLogger(__name__)


class MoniepointParser(BankParser):

    BANK_NAME        = "Moniepoint"
    SENDER_PATTERN   = r"no-reply@moniepoint\.com|moniepoint"
    PROVIDES_BALANCE = True

    def parse(self, subject: str, body: str) -> Optional[ParsedTransaction]:

        # Transaction type
        if re.search(r"credit", subject, re.IGNORECASE):
            tx_type = "credit"
        elif re.search(r"debit", subject, re.IGNORECASE):
            tx_type = "debit"
        else:
            tx_type = self._tx_type(subject, body)

        # Amount
        amount_m = re.search(
            r"(?:Credit|Debit)\s+Amount\s+N?₦?\s*([\d,]+\.?\d*)",
            body, re.IGNORECASE
        )

        # Balance
        balance_m = re.search(
            r"Account Balance[:\s]+N\s*([\d,]+\.?\d*)",
            body, re.IGNORECASE
        )

        # Account number (full — take last 4)
        acct_m = re.search(
            r"Account Number[:\s]+([\d]{10,})",
            body, re.IGNORECASE
        )

        # Narration
        narr_m = re.search(
            r"Narration[:\s]+(.+?)(?:\n\n|\n[A-Z]|$)",
            body, re.IGNORECASE | re.DOTALL
        )

        # Sender name as fallback narration
        sender_m = re.search(
            r"Sender(?:'s)?\s+Name[:\s]+(?:from\s+)?(.+?)(?:\n|$)",
            body, re.IGNORECASE
        )

        # Date
        date_m = re.search(
            r"(\d{1,2}\s+[A-Za-z]+,\s+\d{4})\s*\|\s*(\d{1,2}:\d{2}:\d{2}\s*[AP]M)",
            body, re.IGNORECASE
        )

        if not amount_m:
            return None

        narration = ""
        if narr_m:
            narration = re.sub(r'\s+', ' ', narr_m.group(1)).strip()
        elif sender_m:
            narration = sender_m.group(1).strip()

        timestamp = None
        if date_m:
            date_str = f"{date_m.group(1)} {date_m.group(2).strip()}"
            try:
                timestamp = datetime.strptime(date_str, "%d %B, %Y %I:%M:%S %p")
            except Exception:
                try:
                    timestamp = datetime.strptime(date_str, "%d %b, %Y %I:%M:%S %p")
                except Exception:
                    pass

        last4 = acct_m.group(1)[-4:] if acct_m else None

        return ParsedTransaction(
            bank          = self.BANK_NAME,
            tx_type       = tx_type,
            amount        = self._amount(amount_m.group(1)),
            balance       = self._amount(balance_m.group(1)) if balance_m else None,
            narration     = narration,
            account_last4 = last4,
            timestamp     = timestamp,
            category      = categorize(narration),
            raw_email     = body,
        )
