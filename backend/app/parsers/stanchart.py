"""
stanchart.py — Standard Chartered Bank Nigeria alert email parser

Sender:  alerts.nigeria@sc.com

──────────────────────────────────────────────────────────
Sample DEBIT alert (Standard Chartered)
──────────────────────────────────────────────────────────
Subject: Standard Chartered: Transaction Alert

Dear Customer,

Email Alerts Summary

Banking Transaction
Debit Alert! Acct:xxxxxx[LAST4], Amt:NGN120000.00,
Desc:[NARRATION], Date:2026-02-06, Bal:NGN0.32

──────────────────────────────────────────────────────────
Note: Standard Chartered packs all transaction fields
into a single comma-separated line. No multiline labels.
──────────────────────────────────────────────────────────
"""

import re
import logging
from datetime import datetime
from typing import Optional
from .base import BankParser, Transaction, categorize

logger = logging.getLogger(__name__)


class StandardCharteredParser(BankParser):

    BANK_NAME        = "Standard Chartered"
    SENDER_PATTERN   = r"alerts\.nigeria@sc\.com|sc\.com"
    PROVIDES_BALANCE = True

    def parse(self, subject: str, body: str) -> Optional[Transaction]:

        # Transaction type
        type_m = re.search(r"(Debit|Credit)\s+Alert!", body, re.IGNORECASE)
        if type_m:
            tx_type = type_m.group(1).lower()
        else:
            tx_type = self._tx_type(subject, body)

        # The core alert line
        alert_line = ""
        alert_m = re.search(
            r"((?:Debit|Credit)\s+Alert!.+?)(?:\n|$)",
            body, re.IGNORECASE
        )
        if alert_m:
            alert_line = alert_m.group(1)

        # Amount
        amount_m = re.search(r"Amt:NGN([\d,]+\.?\d*)", alert_line or body, re.IGNORECASE)

        # Balance
        balance_m = re.search(r"Bal:NGN([\d,]+\.?\d*)", alert_line or body, re.IGNORECASE)

        # Account last 4
        acct_m = re.search(r"Acct:[Xx\*]+([\d]{4})", alert_line or body, re.IGNORECASE)

        # Narration
        narr_m = re.search(r"Desc:(.+?)(?:,\s*Date:|$)", alert_line or body, re.IGNORECASE)

        # Date
        date_m = re.search(r"Date:(\d{4}-\d{2}-\d{2})", alert_line or body, re.IGNORECASE)

        if not amount_m:
            return None

        narration = narr_m.group(1).strip() if narr_m else ""
        narration = re.sub(r'\s+', ' ', narration).strip()

        timestamp = None
        if date_m:
            try:
                timestamp = datetime.strptime(date_m.group(1).strip(), "%Y-%m-%d")
            except Exception:
                timestamp = self._date(date_m.group(1).strip())

        return Transaction(
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
