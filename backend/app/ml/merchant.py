import re
import logging
from typing import List, Dict, Optional
from collections import Counter

logger = logging.getLogger(__name__)

MERCHANT_PATTERNS = [
    (r'POS(?:\s+-\s+)?(?:\w+\s*)?(.+)', 1),
    (r'(?:PAYMENT TO|PAYMENT FOR|PURCHASE AT|PAID TO|PAY\s+)(.+)', 1),
    (r'(?:TRANSFER TO|TRF TO|TO:)\s*(.+)', 1),
    (r'(?:ATM\s+(?:WITHDRAWAL|WITHDRAW))(?:\s*[-–]\s*)?(.+)?', 1),
    (r'BILL PAYMENT\s*[:\-]?\s*(.+)', 1),
    (r'(UBER|BOLT|NETFLIX|SPOTIFY|SHOWMAX|DSTV|GOTV)(?:\s|$)', 0),
    (r'(MTN|GLO|AIRTEL|9MOBILE)\s*(?:DATA|AIRTIME)?', 0),
]

STOP_WORDS = {'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'at', 'by', 'with', 'from'}

def clean_merchant_name(name: str) -> str:
    name = re.sub(r'[^a-zA-Z0-9\s]', ' ', name).strip()
    name = re.sub(r'\s+', ' ', name)
    parts = [w.capitalize() for w in name.split() if w.lower() not in STOP_WORDS]
    return ' '.join(parts) if parts else name.capitalize()

def extract_merchant(narration: str) -> Optional[str]:
    if not narration:
        return None
    text = narration.strip()
    for pattern, group_idx in MERCHANT_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            raw = m.group(group_idx)
            if raw and raw.strip():
                return clean_merchant_name(raw.strip())
    if ' ' in text and len(text.split()) <= 5:
        return clean_merchant_name(text)
    return None

def cluster_merchants(transactions: List[Dict]) -> Dict[str, List[Dict]]:
    merchant_txs: Dict[str, List[Dict]] = {}
    for tx in transactions:
        merchant = extract_merchant(tx.get('narration', ''))
        if merchant:
            merchant_txs.setdefault(merchant, []).append(tx)
    return merchant_txs

def get_top_merchants(transactions: List[Dict], min_count: int = 2, limit: int = 20) -> List[Dict]:
    clusters = cluster_merchants(transactions)
    results = []
    for merchant, txs in clusters.items():
        if len(txs) < min_count:
            continue
        total = sum(float(t.get('amount', 0)) for t in txs if t.get('tx_type') == 'debit')
        results.append({
            'merchant': merchant,
            'count': len(txs),
            'total_spent': round(total, 2),
            'avg_amount': round(total / len(txs), 2) if txs else 0,
            'category': Counter(t.get('category', 'General') for t in txs).most_common(1)[0][0],
        })
    results.sort(key=lambda x: x['total_spent'], reverse=True)
    return results[:limit]
