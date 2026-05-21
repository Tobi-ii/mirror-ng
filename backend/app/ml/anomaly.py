import numpy as np
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)

def detect_anomalies(transactions: List[Dict], z_threshold: float = 2.0) -> List[Dict]:
    if len(transactions) < 3:
        return [{**tx, 'is_anomaly': False, 'anomaly_reason': None} for tx in transactions]

    # Compute per-category stats on debit amounts
    by_category: Dict[str, List[float]] = {}
    for tx in transactions:
        if tx.get('tx_type') != 'debit':
            continue
        cat = tx.get('category', 'General')
        by_category.setdefault(cat, []).append(float(tx['amount']))

    stats = {
        cat: {'mean': np.mean(amts), 'std': np.std(amts)}
        for cat, amts in by_category.items() if len(amts) >= 2
    }

    result = []
    for tx in transactions:
        cat = tx.get('category', 'General')
        amount = float(tx['amount'])
        is_anomaly = False
        reason = None

        if tx.get('tx_type') == 'debit' and cat in stats and stats[cat]['std'] > 0:
            z = abs(amount - stats[cat]['mean']) / stats[cat]['std']
            if z > z_threshold:
                is_anomaly = True
                reason = f"Unusually high {cat} spend — ₦{amount:,.0f} vs avg ₦{stats[cat]['mean']:,.0f}"

        result.append({**tx, 'is_anomaly': is_anomaly, 'anomaly_reason': reason})

    return result