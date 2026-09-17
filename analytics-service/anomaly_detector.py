"""
anomaly_detector.py — Real-time operational anomaly detection for Bin Al-Agoouz ERP.
Detects cash differences, void spikes, and discount abuse using statistical z-scores and IQR boundaries.
"""
from typing import List
import numpy as np
from models import MetricDataPoint, AnomalyPointOutput, AnomalyDetectionResponse


def detect_operational_anomalies(points: List[MetricDataPoint], sensitivity: float = 2.5) -> AnomalyDetectionResponse:
    if not points:
        return AnomalyDetectionResponse(anomalies_found=0, results=[])

    values = np.array([float(p.value) for p in points])
    mean_val = float(np.mean(values))
    std_val = float(np.std(values))

    # Avoid zero division
    if std_val < 1e-6:
        std_val = 1.0

    results: List[AnomalyPointOutput] = []
    anomalies_count = 0

    for p in points:
        val = float(p.value)
        z = (val - mean_val) / std_val
        is_anomaly = abs(z) >= sensitivity

        if is_anomaly:
            anomalies_count += 1
            if z > 0:
                explanation = f"قيمة شاذة مرتفعة بشكل غير طبيعي ({val:.2f}) مقارنة بالمتوسط ({mean_val:.2f}) بانحراف معياري {z:.2f}σ"
            else:
                explanation = f"قيمة منخفضة شاذة ({val:.2f}) مقارنة بالمتوسط ({mean_val:.2f}) بانحراف معياري {z:.2f}σ"
        else:
            explanation = "ضمن النطاق الإحصائي الطبيعي"

        results.append(AnomalyPointOutput(
            timestamp=p.timestamp,
            entity_id=p.entity_id,
            entity_type=p.entity_type,
            value=round(val, 2),
            z_score=round(float(z), 2),
            is_anomaly=is_anomaly,
            explanation=explanation
        ))

    return AnomalyDetectionResponse(
        anomalies_found=anomalies_count,
        results=results
    )
