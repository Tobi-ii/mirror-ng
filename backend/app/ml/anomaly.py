import numpy as np
from typing import List, Dict, Optional
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)

def detect_anomalies(transactions: List[Dict], z_threshold: float = 2.0) -> List[Dict]:
    if len(transactions) < 3:
        return [{**tx, 'is_anomaly': False, 'anomaly_reason': None} for tx in transactions]

    z_scores = _zscore_anomalies(transactions, z_threshold)
    iqr_scores = _iqr_anomalies(transactions)
    merchant_scores = _merchant_anomalies(transactions)

    result = []
    for tx in transactions:
        tx_id = id(tx)
        reasons = []
        if z_scores.get(tx_id, {}).get('is_anomaly'):
            reasons.append(z_scores[tx_id]['reason'])
        if iqr_scores.get(tx_id, {}).get('is_anomaly'):
            reasons.append(iqr_scores[tx_id]['reason'])
        if merchant_scores.get(tx_id, {}).get('is_anomaly'):
            reasons.append(merchant_scores[tx_id]['reason'])

        tx_copy = dict(tx)
        tx_copy['is_anomaly'] = len(reasons) > 0
        tx_copy['anomaly_reason'] = reasons[0] if reasons else None
        result.append(tx_copy)

    return result

def _zscore_anomalies(transactions: List[Dict], z_threshold: float = 2.0) -> Dict:
    by_category: Dict[str, List[float]] = defaultdict(list)
    for tx in transactions:
        if tx.get('tx_type') != 'debit':
            continue
        by_category[tx.get('category', 'General')].append(float(tx['amount']))

    stats = {}
    for cat, amts in by_category.items():
        if len(amts) >= 2:
            stats[cat] = {'mean': float(np.mean(amts)), 'std': float(np.std(amts))}

    result = {}
    for tx in transactions:
        tx_id = id(tx)
        cat = tx.get('category', 'General')
        amount = float(tx['amount'])
        if tx.get('tx_type') == 'debit' and cat in stats and stats[cat]['std'] > 0:
            z = abs(amount - stats[cat]['mean']) / stats[cat]['std']
            if z > z_threshold:
                result[tx_id] = {
                    'is_anomaly': True,
                    'reason': f"Unusually high {cat} spend — ₦{amount:,.0f} vs avg ₦{stats[cat]['mean']:,.0f}"
                }
                continue
        result[tx_id] = {'is_anomaly': False, 'reason': None}
    return result

def _iqr_anomalies(transactions: List[Dict]) -> Dict:
    by_category: Dict[str, List[float]] = defaultdict(list)
    for tx in transactions:
        if tx.get('tx_type') != 'debit':
            continue
        by_category[tx.get('category', 'General')].append(float(tx['amount']))

    bounds = {}
    for cat, amts in by_category.items():
        if len(amts) >= 5:
            q1, q3 = np.percentile(amts, 25), np.percentile(amts, 75)
            iqr = q3 - q1
            bounds[cat] = {'upper': q3 + 1.5 * iqr, 'lower': q1 - 1.5 * iqr}

    result = {}
    for tx in transactions:
        tx_id = id(tx)
        cat = tx.get('category', 'General')
        amount = float(tx['amount'])
        if tx.get('tx_type') == 'debit' and cat in bounds and amount > bounds[cat]['upper']:
            result[tx_id] = {
                'is_anomaly': True,
                'reason': f"Unusual {cat} spend — ₦{amount:,.0f} (above ₦{bounds[cat]['upper']:,.0f} threshold)"
            }
        else:
            result[tx_id] = {'is_anomaly': False, 'reason': None}
    return result

def _merchant_anomalies(transactions: List[Dict]) -> Dict:
    by_merchant: Dict[str, List[float]] = defaultdict(list)
    for tx in transactions:
        if tx.get('tx_type') != 'debit':
            continue
        merchant = tx.get('narration', '').strip().lower()[:30]
        if merchant:
            by_merchant[merchant].append(float(tx['amount']))

    stats = {}
    for merchant, amts in by_merchant.items():
        if len(amts) >= 3:
            stats[merchant] = {'mean': float(np.mean(amts)), 'std': float(np.std(amts))}

    result = {}
    for tx in transactions:
        tx_id = id(tx)
        merchant = tx.get('narration', '').strip().lower()[:30]
        amount = float(tx['amount'])
        if tx.get('tx_type') == 'debit' and merchant in stats and stats[merchant]['std'] > 0:
            z = abs(amount - stats[merchant]['mean']) / stats[merchant]['std']
            if z > 2.5:
                result[tx_id] = {
                    'is_anomaly': True,
                    'reason': f"Unusual amount for this merchant — ₦{amount:,.0f} vs typical ₦{stats[merchant]['mean']:,.0f}"
                }
                continue
        result[tx_id] = {'is_anomaly': False, 'reason': None}
    return result
