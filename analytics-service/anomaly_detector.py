"""
anomaly_detector.py — Operational anomaly detection for Bin Al-Agoouz ERP.

Detects operational variances (cash discrepancies, void spikes, discount ratios)
using standard statistical Z-Scores combined with Tukey's IQR (Interquartile Range) fences.
"""
from typing import List
import numpy as np
from models import MetricDataPoint, AnomalyPointOutput, AnomalyDetectionResponse


def detect_operational_anomalies(
    points: List[MetricDataPoint],
    sensitivity: float = 2.5,
) -> AnomalyDetectionResponse:
    if not points:
        return AnomalyDetectionResponse(anomalies_found=0, results=[])

    n_points = len(points)
    values = np.array([float(p.value) for p in points])

    # 1. Check for insufficient sample size (< 5 data points)
    if n_points < 5:
        results = [
            AnomalyPointOutput(
                timestamp=p.timestamp,
                entity_id=p.entity_id,
                entity_type=p.entity_type,
                value=round(float(p.value), 2),
                z_score=0.0,
                is_anomaly=False,
                explanation="حجم العينة غير كافٍ لإجراء فحص شذوذ موثوق (الحد الأدنى 5 نقاط).",
                iqr_outlier=False,
                quality="insufficient_data",
            )
            for p in points
        ]
        return AnomalyDetectionResponse(anomalies_found=0, results=results)

    # 2. Compute statistics
    mean_val = float(np.mean(values))
    std_val = float(np.std(values))
    q25, q75 = float(np.percentile(values, 25)), float(np.percentile(values, 75))
    iqr = q75 - q25
    lower_bound = round(q25 - (1.5 * iqr), 3)
    upper_bound = round(q75 + (1.5 * iqr), 3)

    is_no_variance = std_val < 1e-6
    quality = "no_variance" if is_no_variance else "sufficient"

    results: List[AnomalyPointOutput] = []
    anomalies_count = 0

    for p in points:
        val = float(p.value)

        if is_no_variance:
            z = 0.0
            iqr_outlier = False
            is_anomaly = False
            explanation = "القيم متطابقة تماماً بدون تشتت إحصائي (انحراف معياري صفري)."
        else:
            z = (val - mean_val) / std_val
            iqr_outlier = val < lower_bound or val > upper_bound
            # Treat either robust IQR evidence or a Z-score spike as an
            # anomaly. IQR catches extreme values that inflate the standard
            # deviation and would otherwise hide behind a weak Z-score.
            is_anomaly = abs(z) >= sensitivity or iqr_outlier

            if is_anomaly:
                anomalies_count += 1
                direction = "مرتفعة بشكل غير طبيعي" if z > 0 else "منخفضة بشكل غير طبيعي"
                explanation = (
                    f"قيمة شاذة {direction} ({val:.2f}) بانحراف معياري {z:.2f}σ "
                    f"[متوسط: {mean_val:.2f}, حدود IQR: [{lower_bound:.2f}, {upper_bound:.2f}]]."
                )
            else:
                explanation = "ضمن النطاق الإحصائي الطبيعي"

        results.append(
            AnomalyPointOutput(
                timestamp=p.timestamp,
                entity_id=p.entity_id,
                entity_type=p.entity_type,
                value=round(val, 2),
                z_score=round(float(z), 2),
                is_anomaly=is_anomaly,
                explanation=explanation,
                iqr_outlier=iqr_outlier,
                q1=round(q25, 2),
                q3=round(q75, 2),
                lower_bound=lower_bound,
                upper_bound=upper_bound,
                quality=quality,
            )
        )

    return AnomalyDetectionResponse(
        anomalies_found=anomalies_count,
        results=results,
    )
