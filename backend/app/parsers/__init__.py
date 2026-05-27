"""
Parsers package initialization.
Automatically maps sender domains to their respective parser classes.
"""

import re
import logging
from typing import List, Type, Optional
from .base import BankParser, Transaction
from .sterling import SterlingBankParser
from .wema import WemaBankParser
from .opay import OPayParser
from .stanbic import StanbicIBTCParser
from .stanchart import StandardCharteredParser
from .moniepoint import MoniepointParser
from .gtbank import GTBankParser

logger = logging.getLogger(__name__)

PARSER_CLASSES: List[Type[BankParser]] = [
    SterlingBankParser,
    WemaBankParser,
    OPayParser,
    StanbicIBTCParser,
    StandardCharteredParser,
    MoniepointParser,
    GTBankParser,
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
    "PARSER_CLASSES",
    "SterlingBankParser",
    "WemaBankParser",
    "OPayParser",
    "StanbicIBTCParser",
    "StandardCharteredParser",
    "MoniepointParser",
    "GTBankParser",
    "get_parser_for_sender",
    "parse_email",
    "get_all_sender_patterns",
]
