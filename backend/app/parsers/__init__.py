"""
Parsers package initialization.
Automatically maps sender domains to their respective parser classes.
"""

import re
import logging
from typing import List, Type, Optional
from .base import BankParser, Transaction
from .sterling import SterlingParser
from .wema import WemaParser  # <--- FIX 1: Import the Wema parser

logger = logging.getLogger(__name__)

# FIX 2: Add WemaParser to this list so the 'for' loop can find it
PARSER_CLASSES: List[Type[BankParser]] = [
    SterlingParser,
    WemaParser,
]

def get_parser_for_sender(sender_email: str) -> Optional[BankParser]:
    """
    Returns an instance of the appropriate parser based on the sender's email address.
    Handles both plain (user@bank.com) and display-name format (Bank <user@bank.com>).
    """
    # Extract bare email from "Display Name <email@domain.com>" if present
    match = re.search(r'<([^>]+)>', sender_email)
    clean_email = match.group(1).strip() if match else sender_email.strip()

    logger.debug(f"🔍 Matching sender: '{sender_email}' → clean: '{clean_email}'")

    for ParserClass in PARSER_CLASSES:
        # This checks the SENDER_PATTERN (r"no-reply@alat\.ng") in your wema.py
        if re.search(ParserClass.SENDER_PATTERN, clean_email, re.IGNORECASE):
            logger.debug(f"✅ Matched parser: {ParserClass.__name__}")
            return ParserClass()

    logger.debug(f"❌ No parser matched for: '{clean_email}'")
    return None

def parse_email(sender_email: str, subject: str, body: str) -> Optional[Transaction]:
    """
    Convenience function to parse an email directly using the correct parser.
    """
    parser = get_parser_for_sender(sender_email)
    if not parser:
        return None
    return parser.parse(subject, body)

def get_all_sender_patterns() -> List[str]:
    return [p.SENDER_PATTERN for p in PARSER_CLASSES]

__all__ = [
    "BankParser",
    "Transaction",
    "SterlingParser",
    "WemaParser",  # <--- FIX 3: Add to exports
    "get_parser_for_sender",
    "parse_email",
    "get_all_sender_patterns"
]