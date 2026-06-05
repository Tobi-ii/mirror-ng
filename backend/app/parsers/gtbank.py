"""
gtbank.py — Guaranty Trust Bank (GTBank/GTCo) alert email parser

Sender:  GeNS@gtbank.com

──────────────────────────────────────────────────────────
Sample DEBIT alert (GTBank)
──────────────────────────────────────────────────────────
Subject: Transaction Notification

Dear [ACCOUNT HOLDER NAME]
Guaranty Trust Bank electronic Notification Service (GeNS)
We wish to inform you that a DEBIT transaction occurred
on your account with us.

Account Number   : ******[LAST4]
Transaction Location : [LOCATION CODE]
Description      : [DESCRIPTION]
Amount           : NGN [AMOUNT]
Value Date       : [YYYY-MM-DD]
Remarks          : [REMARKS]
Time of Transaction : [HH:MM:SS AM/PM]

Current Balance  : NGN [BALANCE]
Available Balance : NGN [BALANCE]
──────────────────────────────────────────────────────────
Note: GTBank uses a tab-separated table layout with
colons as separators. Amount has no decimal in some alerts.
Date and Time are on separate lines.
──────────────────────────────────────────────────────────
"""

import re
import logging
from datetime import datetime
from typing import Optional
from .base import BankParser, ParsedTransaction, categorize

logger = logging.getLogger(__name__)


class GTBankParser(BankParser):

    BANK_NAME        = "GTBank"
    SENDER_PATTERN   = r"GeNS@gtbank\.com|gtbank\.com"
    PROVIDES_BALANCE = True

    def parse(self, subject: str, body: str) -> Optional[ParsedTransaction]:

        # ── Transaction type ──────────────────────────────────────────
        type_m = re.search(
            r"a\s+(DEBIT|CREDIT)\s+transaction\s+occurred",
            body, re.IGNORECASE
        )
        if type_m:
            tx_type = type_m.group(1).lower()
        else:
            tx_type = self._tx_type(subject, body)

        # ── Amount ────────────────────────────────────────────────────
        amount_m = re.search(
            r"Amount\s*:\s*NGN\s*([\d,]+\.?\d*)",
            body, re.IGNORECASE
        )

        # ── Balance ───────────────────────────────────────────────────
        balance_m = re.search(
            r"Current Balance\s*:\s*NGN\s*([\d,]+\.?\d*)",
            body, re.IGNORECASE
        )

        # ── Account last 4 ───────────────────────────────────────────
        acct_m = re.search(
            r"Account Number\s*:\s*\*+([\d]{4})",
            body, re.IGNORECASE
        )

        # ── Description / narration ───────────────────────────────────
        narr_m = re.search(
            r"Description\s*:\s*(.+?)(?:\n|$)",
            body, re.IGNORECASE
        )
        remarks_m = re.search(
            r"Remarks\s*:\s*(.+?)(?:\n|$)",
            body, re.IGNORECASE
        )

        # ── Date + Time ───────────────────────────────────────────────
        date_m = re.search(
            r"Value Date\s*:\s*(\d{4}-\d{2}-\d{2})",
            body, re.IGNORECASE
        )
        time_m = re.search(
            r"Time of Transaction\s*:\s*(\d{1,2}:\d{2}:\d{2}\s*[AP]M)",
            body, re.IGNORECASE
        )

        if not amount_m:
            return None

        # Build narration
        narration = ""
        if narr_m:
            narration = narr_m.group(1).strip()
        if remarks_m:
            remarks = remarks_m.group(1).strip()
            if remarks and remarks.lower() not in ("", narration.lower()):
                narration = f"{narration} | {remarks}" if narration else remarks
        narration = re.sub(r'\s+', ' ', narration).strip()

        # Combine date and time
        timestamp = None
        if date_m:
            date_str = date_m.group(1).strip()
            if time_m:
                time_str = time_m.group(1).strip()
                combined = f"{date_str} {time_str}"
                try:
                    timestamp = datetime.strptime(combined, "%Y-%m-%d %I:%M:%S %p")
                except Exception:
                    try:
                        timestamp = datetime.strptime(date_str, "%Y-%m-%d")
                    except Exception:
                        pass
            else:
                try:
                    timestamp = datetime.strptime(date_str, "%Y-%m-%d")
                except Exception:
                    pass

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
