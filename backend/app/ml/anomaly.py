import numpy as np
from typing import List, Dict, Optional
from collections import defaultdict
import logging

from sklearn.ensemble import IsolationForest

logger = logging.getLogger(__name__)


def detect_anomalies(transactions: List[Dict]) -> List[Dict]:
    if len(transactions) < 3:
        return [{**tx, 'is_anomaly': False, 'anomaly_reason': None} for tx in transactions]

    forest_scores = _isolation_forest_anomalies(transactions)
    z_scores = _zscore_anomalies(transactions)
    merchant_scores = _merchant_anomalies(transactions)

    result = []
    for tx in transactions:
        tx_id = id(tx)
        reasons = []
        if forest_scores.get(tx_id, {}).get('is_anomaly'):
            reasons.append(forest_scores[tx_id]['reason'])
        if z_scores.get(tx_id, {}).get('is_anomaly'):
            reasons.append(z_scores[tx_id]['reason'])
        if merchant_scores.get(tx_id, {}).get('is_anomaly'):
            reasons.append(merchant_scores[tx_id]['reason'])

        tx_copy = dict(tx)
        tx_copy['is_anomaly'] = len(reasons) > 0
        tx_copy['anomaly_reason'] = reasons[0] if reasons else None
        result.append(tx_copy)

    return result


def _isolation_forest_anomalies(transactions: List[Dict]) -> Dict:
    debits = [tx for tx in transactions if tx.get('tx_type') == 'debit']
    if len(debits) < 5:
        return {id(tx): {'is_anomaly': False, 'reason': None} for tx in transactions}

    cat_map: Dict[str, List[int]] = defaultdict(list)
    for i, tx in enumerate(debits):
        cat_map[tx.get('category', 'General')].append(i)

    forest = IsolationForest(contamination=0.05, random_state=42, n_estimators=100)

    all_scores = {}
    for cat, indices in cat_map.items():
        if len(indices) < 5:
            for i in indices:
                all_scores[id(debits[i])] = {'is_anomaly': False, 'reason': None}
            continue

        amounts = np.array([[float(debits[i]['amount'])] for i in indices])
        scores = forest.fit_predict(amounts)
        for i, score in zip(indices, scores):
            tx_id = id(debits[i])
            if score == -1:
                amt = float(debits[i]['amount'])
                mean_amt = float(np.mean(amounts))
                all_scores[tx_id] = {
                    'is_anomaly': True,
                    'reason': f"Unusual {cat} spend — ₦{amt:,.0f} (typical ₦{mean_amt:,.0f})",
                }
            else:
                all_scores[tx_id] = {'is_anomaly': False, 'reason': None}

    result = {}
    for tx in transactions:
        tx_id = id(tx)
        if tx_id in all_scores:
            result[tx_id] = all_scores[tx_id]
        else:
            result[tx_id] = {'is_anomaly': False, 'reason': None}
    return result


def _zscore_anomalies(transactions: List[Dict]) -> Dict:
    by_category: Dict[str, List[float]] = defaultdict(list)
    for tx in transactions:
        if tx.get('tx_type') != 'debit':
            continue
        by_category[tx.get('category', 'General')].append(float(tx['amount']))

    stats = {}
    for cat, amts in by_category.items():
        if len(amts) >= 5:
            q1, q3 = float(np.percentile(amts, 25)), float(np.percentile(amts, 75))
            iqr = q3 - q1
            mean_v = float(np.mean(amts))
            std_v = float(np.std(amts))
            threshold = max(2.0, float(np.percentile(np.abs(np.array(amts) - mean_v) / max(std_v, 1e-8), 90))) if std_v > 0 else 2.0
            stats[cat] = {'mean': mean_v, 'std': std_v, 'threshold': threshold, 'iqr_upper': q3 + 1.5 * iqr}

    result = {}
    for tx in transactions:
        tx_id = id(tx)
        cat = tx.get('category', 'General')
        amount = float(tx['amount'])
        if tx.get('tx_type') == 'debit' and cat in stats and stats[cat]['std'] > 0:
            z = abs(amount - stats[cat]['mean']) / stats[cat]['std']
            threshold = stats[cat]['threshold']
            if z > threshold:
                result[tx_id] = {
                    'is_anomaly': True,
                    'reason': f"Unusually high {cat} spend — ₦{amount:,.0f} vs avg ₦{stats[cat]['mean']:,.0f}",
                }
                continue
            if amount > stats[cat]['iqr_upper']:
                result[tx_id] = {
                    'is_anomaly': True,
                    'reason': f"Unusual {cat} spend — ₦{amount:,.0f} (above ₦{stats[cat]['iqr_upper']:,.0f} threshold)",
                }
                continue
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
                    'reason': f"Unusual amount for this merchant — ₦{amount:,.0f} vs typical ₦{stats[merchant]['mean']:,.0f}",
                }
                continue
        result[tx_id] = {'is_anomaly': False, 'reason': None}
    return result
