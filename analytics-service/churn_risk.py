"""
churn_risk.py — Customer Churn Risk Scoring for Cafes & Roasteries.

This is a rule-based heuristic risk estimate based primarily on recency and historical order frequency.
It is not a statistically calibrated probability.

In coffee retail operations, regular customer visit cadence is typically 3-7 days.
Scoring tracks recency intervals:
  - <= 7 days:   Low Risk (estimate ~ 0.05, score 5)
  - 8-14 days:   Medium Risk (estimate ~ 0.25, score 25)
  - 15-30 days:  High Risk (estimate ~ 0.65, score 65)
  - > 30 days:   Critical Inactivity (estimate ~ 0.90, score 90)
"""
from typing import List
from models import CustomerActivityInput, CustomerChurnOutput, ChurnRiskResponse


def compute_churn_risk(customers: List[CustomerActivityInput]) -> ChurnRiskResponse:
    results: List[CustomerChurnOutput] = []
    high_risk_count = 0

    for c in customers:
        days = c.days_since_last_order
        orders = c.total_orders

        # Base heuristic risk estimate and score based on visit cadence
        if days <= 7:
            estimate = 0.05
            score = 5.0
            risk = "low"
            rec = "عميل نشط ودائم. حافظ على ولائه."
        elif days <= 14:
            estimate = 0.25
            score = 25.0
            risk = "medium"
            rec = "تنبيه انقطاع مبكر: أرسل رسالة ترحيبية أو عرض قهوتك المفضلة."
        elif days <= 30:
            estimate = 0.65
            score = 65.0
            risk = "high"
            rec = "خطر ابتعاد مرتفع: اتصل بالعميل أو امنحه خصم عودة مميز."
            high_risk_count += 1
        else:
            estimate = 0.90
            score = 90.0
            risk = "critical"
            rec = "عميل خامل/منقطع: يتطلب إعادة استهداف مخصصة (Win-back campaign)."
            high_risk_count += 1

        # Adjust score slightly if high frequency historical buyer has suddenly stalled
        if orders >= 10 and days > 14:
            score = min(100.0, score + 10.0)

        results.append(
            CustomerChurnOutput(
                customer_id=c.customer_id,
                name_ar=c.name_ar,
                churn_risk_estimate=estimate,
                churn_probability=estimate,
                churn_risk_score=score,
                risk_level=risk,
                recommended_action=rec,
            )
        )

    results.sort(key=lambda x: x.churn_risk_score, reverse=True)

    return ChurnRiskResponse(
        total_analyzed=len(customers),
        high_risk_count=high_risk_count,
        results=results,
    )
