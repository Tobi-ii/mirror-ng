import numpy as np
from typing import List, Dict
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

def weekly_spend_forecast(transactions: List[Dict]) -> Dict:
    # Aggregate daily debit spend
    daily: Dict = {}
    for tx in transactions:
        if tx.get('tx_type') != 'debit':
            continue
        try:
            date = datetime.fromisoformat(str(tx['timestamp'])).date()
            daily[date] = daily.get(date, 0) + float(tx['amount'])
        except:
            continue

    if len(daily) < 2:
        return {'forecast': [], 'trend': 'insufficient_data', 'daily_avg': 0, 'weekly_projection': 0}

    dates = sorted(daily.keys())
    base = dates[0]
    X = np.array([(d - base).days for d in dates], dtype=float)
    y = np.array([daily[d] for d in dates], dtype=float)

    # OLS linear regression (no sklearn needed)
    x_mean, y_mean = X.mean(), y.mean()
    slope = float(np.dot(X - x_mean, y - y_mean) / (np.dot(X - x_mean, X - x_mean) + 1e-8))
    intercept = float(y_mean - slope * x_mean)

    last_x = (dates[-1] - base).days
    forecast = []
    for i in range(1, 8):
        day_x = last_x + i
        predicted = max(0.0, slope * day_x + intercept)
        forecast.append({
            'date': (dates[-1] + timedelta(days=i)).isoformat(),
            'predicted_spend': round(predicted, 2)
        })

    return {
        'forecast': forecast,
        'trend': 'increasing' if slope > 100 else 'decreasing' if slope < -100 else 'stable',
        'daily_avg': round(float(y.mean()), 2),
        'weekly_projection': round(sum(f['predicted_spend'] for f in forecast), 2)
    }