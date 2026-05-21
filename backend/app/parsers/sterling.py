import re
import logging
from typing import Optional
from .base import BankParser, Transaction, categorize

logger = logging.getLogger(__name__)

class SterlingParser(BankParser):
    BANK_NAME = "Sterling Bank"
    SENDER_PATTERN = r"@sterling\.ng"
    PROVIDES_BALANCE = False

    def _clean_narration(self, narration: str) -> str:
        """Strip reference numbers and extract meaningful description"""
        if '|' in narration:
            narration = narration.split('|', 1)[1].strip()

        remark_match = re.search(r'REMARK:\s*(.+)$', narration, re.IGNORECASE)
        if remark_match:
            narration = remark_match.group(1).strip()

        return narration or "Sterling Bank Transaction"

    def parse(self, subject: str, body: str) -> Optional[Transaction]:
        try:
            body = re.sub(r'\s+', ' ', body).strip()

            # === 1. Amount ===
            amount_match = re.search(r'Amount\s*[:\s]*NGN\s*([\d,]+\.?\d*)', body, re.IGNORECASE)
            if not amount_match:
                amount_match = re.search(r'NGN\s*([\d,]+\.\d{2})', body, re.IGNORECASE)
            amount = self._amount(amount_match.group(1)) if amount_match else None
            if amount is None:
                return None

            # === 2. Transaction Type (ADDITION: Catch NIP and Inward transfers) ===
            body_lower = body.lower()
            if any(w in body_lower for w in ["debit", "money out", "sent to"]):
                tx_type = "debit"
            elif any(w in body_lower for w in ["credit", "money in", "received from", "transfer from", "nip transfer"]):
                tx_type = "credit"
            else:
                tx_type = self._tx_type(subject, body)

            # === 3. Narration ===
            narration = ""
            narration_match = re.search(
                r'Description\s*[:\s]+(.+?)(?:\s+(?:Account|Amount|Transaction|Date|$))',
                body, re.IGNORECASE
            )
            if narration_match:
                narration = narration_match.group(1).strip()
            else:
                narration = re.sub(r'Money\s+[OI]ut!\s*\*+\d+', '', subject, flags=re.IGNORECASE).strip()

            narration = self._clean_narration(narration)

            # === 4. Account Last 4 (ADDITION: Forced 4-digit slice) ===
            account_match = re.search(r'Account\s*Number\s*[:\s]*\*+(\d+)', body, re.IGNORECASE)
            # This ensures even if the bank sends 5 digits (95156), we only store 5156
            account_last4 = account_match.group(1)[-4:] if account_match else None

            # === 5. Timestamp ===
            date_match = re.search(r'Date\s*[:\s]\s*([\d/]+\s+[\d:]+\s*[APM]+)', body, re.IGNORECASE)
            timestamp = None
            if date_match:
                timestamp = self._date(date_match.group(1))
            if not timestamp:
                logger.warning(f"Sterling: Could not parse timestamp from: {body[:100]}")
                return None

            return Transaction(
                bank=self.BANK_NAME,
                tx_type=tx_type,
                amount=amount,
                balance=None,
                narration=narration,
                account_last4=account_last4,
                timestamp=timestamp,
                category=categorize(narration),
                raw_email=body[:500]
            )

        except Exception as e:
            logger.error(f"Sterling parser error: {e}", exc_info=True)
            return None