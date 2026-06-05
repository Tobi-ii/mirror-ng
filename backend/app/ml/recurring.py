import logging
from typing import List, Dict
from datetime import datetime, timedelta
from collections import defaultdict

logger = logging.getLogger(__name__)

def detect_recurring(transactions: List[Dict], tolerance_days: int = 3, tolerance_amount: float = 0.15) -> List[Dict]:
    merchants: Dict[str, List[Dict]] = {}
    for tx in transactions:
        if tx.get('tx_type') != 'debit':
            continue
        key = _tx_key(tx)
        merchants.setdefault(key, []).append(tx)

    recurring = []
    for key, txs in merchants.items():
        if len(txs) < 2:
            continue
        sorted_txs = sorted(txs, key=lambda t: t['timestamp'])
        intervals = []
        for i in range(1, len(sorted_txs)):
            try:
                d1 = datetime.fromisoformat(str(sorted_txs[i - 1]['timestamp']))
                d2 = datetime.fromisoformat(str(sorted_txs[i]['timestamp']))
                intervals.append(abs((d2 - d1).days))
            except (ValueError, TypeError):
                continue

        if len(intervals) < 1:
            continue

        avg_interval = sum(intervals) / len(intervals)
        amounts = [float(t.get('amount', 0)) for t in sorted_txs]

        pattern = _classify_pattern(avg_interval)
        if not pattern:
            continue

        amounts_consistent = all(
            abs(a - amounts[0]) / max(amounts[0], 0.01) < tolerance_amount
            for a in amounts
        ) if amounts else False

        dates_consistent = all(
            abs(intervals[i] - avg_interval) <= tolerance_days
            for i in range(len(intervals))
        )

        if amounts_consistent and dates_consistent and avg_interval >= 7:
            amount = amounts[0]
            recurring.append({
                'key': key,
                'merchant': key.split('|')[0],
                'pattern': pattern,
                'avg_interval_days': round(avg_interval, 1),
                'amount': round(amount, 2),
                'count': len(sorted_txs),
                'total_spent': round(sum(amounts), 2),
                'last_date': sorted_txs[-1]['timestamp'],
                'next_expected': _next_expected(sorted_txs[-1]['timestamp'], avg_interval),
                'confidence': _confidence(len(sorted_txs), len(intervals)),
            })

    recurring.sort(key=lambda x: x['amount'], reverse=True)
    return recurring

def _tx_key(tx: Dict) -> str:
    merchant = tx.get('narration', '').strip().lower()[:40]
    amount = round(float(tx.get('amount', 0)), 2)
    return f"{merchant}|{amount}"

def _classify_pattern(avg_days: float) -> Optional[str]:
    if avg_days >= 27 and avg_days <= 33:
        return 'monthly'
    elif avg_days >= 6 and avg_days <= 8:
        return 'weekly'
    elif avg_days >= 13 and avg_days <= 15:
        return 'biweekly'
    elif avg_days >= 85 and avg_days <= 95:
        return 'quarterly'
    elif avg_days >= 360 and avg_days <= 370:
        return 'yearly'
    return None

def _next_expected(last_date_str: str, interval_days: float) -> Optional[str]:
    try:
        last = datetime.fromisoformat(str(last_date_str))
        return (last + timedelta(days=interval_days)).isoformat()
    except (ValueError, TypeError):
        return None

def _confidence(count: int, intervals: int) -> str:
    if count >= 6:
        return 'high'
    elif count >= 3:
        return 'medium'
    return 'low'
