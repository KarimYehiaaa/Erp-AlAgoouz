"""
menu_engineering.py — Menu Engineering Matrix for Cafes and Roasteries.
══════════════════════════════════════════════════════════════════════
Implements the Kasavana & Smith (1982) Menu Engineering model, evaluating items
across two dimensions:
  1. Popularity (Sales Volume) relative to the menu average benchmark.
  2. Profitability (Unit Contribution Margin = Price - Cost) relative to the average margin benchmark.

Categorization quadrants:
  - Star: High Volume, High Margin (Protect quality, promote prominently).
  - Workhorse (Plowhorse): High Volume, Low Margin (Maintain, gradually optimize recipe costs or prices).
  - Puzzle: Low Volume, High Margin (Reposition, feature in combos or marketing).
  - Dog: Low Volume, Low Margin (Evaluate reformulation, price adjustment, or replacement).
"""
from typing import List
import numpy as np
from models import MenuItemInput, MenuItemOutput, MenuMatrixResponse


def compute_menu_matrix(items: List[MenuItemInput]) -> MenuMatrixResponse:
    if not items:
        return MenuMatrixResponse(
            total_items=0,
            benchmark_popularity=0.0,
            benchmark_profitability=0.0,
            items=[]
        )

    # 1. Compute unit profit margins and total sales volumes
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
