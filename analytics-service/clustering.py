"""
clustering.py — Business Intelligence matrix algorithms:
1. Menu Engineering Matrix (Stars, Workhorses, Puzzles, Dogs) for cafes & roasteries.
2. Customer Churn Risk scoring based on RFM recency decay.
"""
from typing import List
import numpy as np
from models import (
    MenuItemInput,
    MenuItemOutput,
    MenuMatrixResponse,
    CustomerActivityInput,
    CustomerChurnOutput,
    ChurnRiskResponse
)


def compute_menu_matrix(items: List[MenuItemInput]) -> MenuMatrixResponse:
    if not items:
        return MenuMatrixResponse(
            total_items=0,
            benchmark_popularity=0.0,
            benchmark_profitability=0.0,
            items=[]
        )

    # 1. Compute unit profit margins and total sales
    volumes = [float(it.units_sold) for it in items]
    margins = [float(it.unit_price - it.unit_cost) for it in items]

    avg_volume = float(np.mean(volumes)) if volumes else 0.0
    avg_margin = float(np.mean(margins)) if margins else 0.0

    output_items: List[MenuItemOutput] = []

    for it in items:
        vol = float(it.units_sold)
        margin = float(it.unit_price - it.unit_cost)
        tot_profit = round(vol * margin, 2)

        is_high_volume = vol >= avg_volume
        is_high_margin = margin >= avg_margin

        if is_high_volume and is_high_margin:
            quadrant = "Star"
            recommendation = "صنف نجم (Star): حافظ على جودته وروج له كصنف رائد في القائمة."
        elif is_high_volume and not is_high_margin:
            quadrant = "Workhorse"
            recommendation = "صنف شعبي عالي البيع (Workhorse): ارفع السعر تدريجياً أو اضبط تكلفة المكونات لتحسين الربحية."
        elif not is_high_volume and is_high_margin:
            quadrant = "Puzzle"
            recommendation = "صنف واعد عالي الربح (Puzzle): عزز تسويقه، غيّر موقعه في قائمة الطعام، أو قدمه ضمن عروض مجمعة."
        else:
            quadrant = "Dog"
            recommendation = "صنف منخفض البيع والربح (Dog): فكر في استبداله أو إعادة هيكلة وصفته."

        output_items.append(MenuItemOutput(
            product_id=it.product_id,
            name_ar=it.name_ar,
            category_name=it.category_name,
            units_sold=round(vol, 2),
            profit_margin_unit=round(margin, 2),
            total_profit=tot_profit,
            quadrant=quadrant,
            recommendation=recommendation
        ))

    # Sort items by total profit descending
    output_items.sort(key=lambda x: x.total_profit, reverse=True)

    return MenuMatrixResponse(
        total_items=len(items),
        benchmark_popularity=round(avg_volume, 2),
        benchmark_profitability=round(avg_margin, 2),
        items=output_items
    )


def compute_churn_risk(customers: List[CustomerActivityInput]) -> ChurnRiskResponse:
    results: List[CustomerChurnOutput] = []
    high_risk_count = 0

    for c in customers:
        days = c.days_since_last_order
        orders = c.total_orders

        # Sigmoid-based recency score
        # In a cafe/roastery, regulars visit every 3-7 days. 14+ days is warning, 30+ is high churn risk.
        if days <= 7:
            prob = 0.05
            risk = "low"
            rec = "عميل نشط ودائم. حافظ على ولائه."
        elif days <= 14:
            prob = 0.25
            risk = "medium"
            rec = "تنبيه انقطاع مبكر: أرسل رسالة ترحيبية أو عرض قهوتك المفضلة."
        elif days <= 30:
            prob = 0.65
            risk = "high"
            rec = "خطر ابتعاد مرتفع: اتصل بالعميل أو امنحه خصم عودة مميز."
            high_risk_count += 1
        else:
            prob = 0.90
            risk = "critical"
            rec = "عميل خامل/منقطع: يتطلب إعادة استهداف مخصصة (Win-back campaign)."
            high_risk_count += 1

        results.append(CustomerChurnOutput(
            customer_id=c.customer_id,
            name_ar=c.name_ar,
            churn_probability=prob,
            risk_level=risk,
            recommended_action=rec
        ))

    results.sort(key=lambda x: x.churn_probability, reverse=True)

    return ChurnRiskResponse(
        total_analyzed=len(customers),
        high_risk_count=high_risk_count,
        results=results
    )
