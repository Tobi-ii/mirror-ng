import numpy as np
from typing import List, Dict
from datetime import datetime, timedelta
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)

def weekly_spend_forecast(transactions: List[Dict]) -> Dict:
    daily = _aggregate_daily(transactions)
    if len(daily) < 2:
        return {'forecast': [], 'trend': 'insufficient_data', 'daily_avg': 0, 'weekly_projection': 0}

    dates = sorted(daily.keys())
    X = np.array([(d - dates[0]).days for d in dates], dtype=float)
    y = np.array([daily[d] for d in dates], dtype=float)

    base_forecast = _linear_regression_forecast(X, y, dates)
    smooth_forecast = _exponential_smoothing_forecast(y, dates)

    combined = []
    for i in range(7):
        combined.append({
            'date': base_forecast[i]['date'],
            'predicted_spend': round((base_forecast[i]['predicted_spend'] + smooth_forecast[i]['predicted_spend']) / 2, 2),
            'linear_model': base_forecast[i]['predicted_spend'],
            'smooth_model': smooth_forecast[i]['predicted_spend'],
        })

    slope = float(np.polyfit(X, y, 1)[0])
    trend = 'increasing' if slope > 50 else 'decreasing' if slope < -50 else 'stable'

    return {
        'forecast': combined,
        'trend': trend,
        'daily_avg': round(float(np.mean(y)), 2),
        'weekly_projection': round(sum(f['predicted_spend'] for f in combined), 2),
    }

def _aggregate_daily(transactions: List[Dict]) -> Dict:
    daily = defaultdict(float)
    for tx in transactions:
        if tx.get('tx_type') != 'debit':
            continue
        try:
            date = datetime.fromisoformat(str(tx['timestamp'])).date()
            daily[date] += float(tx['amount'])
        except (ValueError, TypeError):
            continue
    return dict(daily)

def _linear_regression_forecast(X: np.ndarray, y: np.ndarray, dates: List) -> List[Dict]:
    x_mean, y_mean = X.mean(), y.mean()
    slope = float(np.dot(X - x_mean, y - y_mean) / (np.dot(X - x_mean, X - x_mean) + 1e-8))
    intercept = float(y_mean - slope * x_mean)
    floor = float(y.mean()) * 0.1
    last_x = (dates[-1] - dates[0]).days
    forecast = []
    for i in range(1, 8):
        day_x = last_x + i
        predicted = max(floor, slope * day_x + intercept)
        forecast.append({
            'date': (dates[-1] + timedelta(days=i)).isoformat(),
            'predicted_spend': round(predicted, 2),
        })
    return forecast

def _exponential_smoothing_forecast(y: np.ndarray, dates: List, alpha: float = 0.3) -> List[Dict]:
    smoothed = np.zeros(len(y))
    smoothed[0] = y[0]
    for i in range(1, len(y)):
        smoothed[i] = alpha * y[i] + (1 - alpha) * smoothed[i - 1]

    recent_trend = np.mean([smoothed[-1] - smoothed[-i] for i in range(2, min(5, len(smoothed) + 1))]) if len(smoothed) >= 3 else 0

    forecast = []
    last_val = smoothed[-1]
    floor = float(y.mean()) * 0.1
    for i in range(1, 8):
        predicted = max(floor, last_val + recent_trend * i)
        forecast.append({
            'date': (dates[-1] + timedelta(days=i)).isoformat(),
            'predicted_spend': round(predicted, 2),
        })
    return forecast
