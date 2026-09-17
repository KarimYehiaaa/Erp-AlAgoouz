"""
forecasting.py — Demand forecasting for cafe & roastery items.
Uses Holt's Linear Trend Model (Double Exponential Smoothing) for trended demand,
with one-step-ahead backtesting for MAE and MAPE accuracy metrics.
"""
from typing import List, Tuple, Optional
import numpy as np
from models import ProductForecastInput, ProductForecastOutput

MIN_OBSERVATIONS = 7


def calculate_holt_linear(
    series: List[float],
    alpha: float = 0.35,
    beta: float = 0.15,
    horizon: int = 30,
) -> Tuple[List[float], Optional[float], Optional[float]]:
    """
    Holt's Linear Exponential Smoothing for trended demand.
    Computes out-of-sample forecasts and one-step-ahead backtested MAE & MAPE.
    """
    n = len(series)
    if n == 0:
        return [0.0] * horizon, None, None
    if n == 1:
        return [float(series[0])] * horizon, None, None

    level = series[0]
    trend = series[1] - series[0]

    abs_errors = []
    pct_errors = []

    for t in range(1, n):
        # 1-step ahead prediction before updating with series[t]
        pred_t = max(0.0, level + trend)
        actual_t = series[t]

        err = abs(actual_t - pred_t)
        abs_errors.append(err)
        if actual_t > 0:
            pct_errors.append(err / actual_t)

        # Update Holt state
        last_level = level
        level = alpha * actual_t + (1.0 - alpha) * (last_level + trend)
        trend = beta * (level - last_level) + (1.0 - beta) * trend

    mae = round(float(np.mean(abs_errors)), 3) if abs_errors else None
    mape = round(float(np.mean(pct_errors)) * 100.0, 2) if pct_errors else None

    forecasts = []
    for m in range(1, horizon + 1):
        pred = max(0.0, level + m * trend)
        forecasts.append(round(pred, 3))

    return forecasts, mae, mape


def forecast_product_demand(product: ProductForecastInput, horizon: int = 30) -> ProductForecastOutput:
    """
    Computes demand forecast with backtested error metrics and quality grade.
    """
    points = sorted(product.historical_sales, key=lambda p: p.date)
    quantities = [float(p.quantity) for p in points]
    n_points = len(quantities)

    # 1. Handle insufficient data or empty history
    if n_points == 0:
        return ProductForecastOutput(
            product_id=product.product_id,
            name_ar=product.name_ar,
            forecast_7d=0.0,
            forecast_30d=0.0,
            daily_forecast=[0.0] * horizon,
            trend_slope=0.0,
            confidence_score=0.2,
            quality="insufficient_data",
            mae=None,
            mape=None,
            data_points=0,
        )

    if n_points < MIN_OBSERVATIONS:
        mean_val = round(float(np.mean(quantities)), 3)
        daily_preds = [max(0.0, mean_val)] * horizon
        f7d = round(sum(daily_preds[:7]), 3)
        f30d = round(sum(daily_preds[:horizon]), 3)
        return ProductForecastOutput(
            product_id=product.product_id,
            name_ar=product.name_ar,
            forecast_7d=f7d,
            forecast_30d=f30d,
            daily_forecast=daily_preds,
            trend_slope=0.0,
            confidence_score=0.4,
            quality="insufficient_data",
            mae=None,
            mape=None,
            data_points=n_points,
        )

    # 2. Compute Holt Linear Forecast and error metrics
    daily_preds, mae, mape = calculate_holt_linear(quantities, alpha=0.35, beta=0.15, horizon=horizon)

    # 3. Estimate linear trend slope
    x = np.arange(n_points)
    y = np.array(quantities)
    slope, _ = np.polyfit(x, y, 1)

    # 4. Aggregations
    f7d = round(sum(daily_preds[:7]), 3)
    f30d = round(sum(daily_preds[:min(30, horizon)]), 3)

    # 5. Quality classification and confidence metric
    std_dev = float(np.std(quantities))
    mean_val = float(np.mean(quantities))

    if std_dev < 1e-6:
        quality = "low_variance"
        confidence = 0.9
    else:
        quality = "sufficient"
        cv = (std_dev / mean_val) if mean_val > 0 else 1.0
        confidence = max(0.4, min(0.98, 1.0 - (cv * 0.2)))

    return ProductForecastOutput(
        product_id=product.product_id,
        name_ar=product.name_ar,
        forecast_7d=f7d,
        forecast_30d=f30d,
        daily_forecast=daily_preds,
        trend_slope=round(float(slope), 4),
        confidence_score=round(confidence, 2),
        quality=quality,
        mae=mae,
        mape=mape,
        data_points=n_points,
    )
