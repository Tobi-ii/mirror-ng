import re
import logging
from datetime import datetime
from typing import Optional
from .base import BankParser, Transaction, categorize

logger = logging.getLogger(__name__)

class WemaParser(BankParser):
    BANK_NAME = "Wema (ALAT)"
    SENDER_PATTERN = r"no-reply@alat\.ng"
    PROVIDES_BALANCE = True

    def _clean_narration(self, narration: str) -> str:
        """Strip repetitive ALAT/NIP prefixes and boilerplate"""
        narration = re.sub(r'ALAT NIP TRANSFER TO\s*', '', narration, flags=re.IGNORECASE)
        narration = re.sub(r'^NIP:', '', narration, flags=re.IGNORECASE)
        narration = re.sub(r'IP:OGUNWOYE OLORUNTOBILOBA VICTOR-', '', narration, flags=re.IGNORECASE)
        narration = re.sub(r'OneBank Transfer from\s*', '', narration, flags=re.IGNORECASE)
        narration = re.sub(r'\s+', ' ', narration).strip()
        if len(narration) > 100:
            narration = narration[:97] + "..."
        return narration or "Wema Transaction"

    def parse(self, subject: str, body: str, email_date: Optional[str] = None) -> Optional[Transaction]:
        """
        email_date: optional Date header from the email (used as fallback for timestamp)
        """
        try:
            # Normalize
            subj_lower = subject.lower()
            body_norm = re.sub(r'\s+', ' ', body)
            body_lower = body_norm.lower()

            # 1. Transaction type
            if any(x in subj_lower or x in body_lower for x in ["credited", "landed into"]):
                tx_type = "credit"
            elif any(x in subj_lower or x in body_lower for x in ["debited", "has left"]):
                tx_type = "debit"
            else:
                tx_type = self._tx_type(subject, body_norm)

            # 2. Amount
            amount_match = re.search(r'NGN\s*([\d,]+\.\d{2})', body_norm, re.IGNORECASE)
            if not amount_match:
                amount_match = re.search(r'([\d,]+\.\d{2})\s*NGN', body_norm, re.IGNORECASE)
            if not amount_match:
                return None
            amount = self._amount(amount_match.group(1))

            # 3. Narration
            narration_match = re.search(
                r'Note\s*[:\s]+(.+?)(?:\s+(?:Account\s+)?Balance|Value Date|$)', 
                body_norm, re.IGNORECASE | re.DOTALL
            )
            if narration_match:
                raw_narration = narration_match.group(1).strip()
                raw_narration = re.sub(r'\s+', ' ', raw_narration)
                if 'OneBank Transfer' in raw_narration:
                    parts = raw_narration.split(' to ')
                    raw_narration = parts[-1] if len(parts) > 1 else raw_narration
            else:
                raw_narration = "Wema Transaction"
            narration = self._clean_narration(raw_narration)

            # 4. Account ID
            account_match = re.search(r'Account\s*No\s*[:\s]*(\d{4})', body_norm, re.IGNORECASE)
            account_id = account_match.group(1) if account_match else "0239"

            # 5. Timestamp - robust with fallback
            timestamp = None
            # Try from body "Date and Time: ..."
            date_match = re.search(r'Date\s+and\s+Time\s*:\s*([\d-]+\s+[\d:]+)', body_norm, re.IGNORECASE)
            if date_match:
                date_str = date_match.group(1).strip()
                try:
                    parts = date_str.split()
                    day, month, year = parts[0].split('-')
                    time_str = parts[1]
                    iso_str = f"{year}-{month}-{day} {time_str}"
                    timestamp = datetime.strptime(iso_str, "%Y-%m-%d %H:%M:%S")
                    logger.debug(f"Parsed body date: {timestamp}")
                except Exception as e:
                    logger.warning(f"Failed to parse body date '{date_str}': {e}")

            # Fallback to email's Date header
            if timestamp is None and email_date:
                try:
                    from email.utils import parsedate_to_datetime
                    timestamp = parsedate_to_datetime(email_date)
                    logger.debug(f"Used email header date: {timestamp}")
                except Exception as e:
                    logger.warning(f"Failed to parse email date '{email_date}': {e}")

            # Final fallback: current time (should rarely happen)
            if timestamp is None:
                timestamp = datetime.now()
                logger.warning(f"Using current time for Wema transaction: {narration[:50]}")

            # 6. Balance
            balance_match = re.search(r'Account\s+Balance\s*[:\s]*([\d,]+\.\d{2})\s*NGN', body_norm, re.IGNORECASE)
            if not balance_match:
                balance_match = re.search(r'balance\s+of\s+([\d,]+\.\d{2})\s*NGN', body_norm, re.IGNORECASE)
            balance = self._amount(balance_match.group(1)) if balance_match else None

            transaction = Transaction(
                bank=self.BANK_NAME,
                tx_type=tx_type,
                amount=amount,
                balance=balance,
                narration=narration,
                account_last4=account_id,
                timestamp=timestamp,
                category=categorize(narration),
                raw_email=body[:500]
            )
            logger.info(f"✅ Successfully parsed Wema transaction: {tx_type} of ₦{amount} - {narration[:50]}")
            return transaction

        except Exception as e:
            logger.error(f"Wema parser error: {e}", exc_info=True)
            return None