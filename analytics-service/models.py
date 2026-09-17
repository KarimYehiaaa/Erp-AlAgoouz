"""
models.py — Data transfer and validation schemas for Bin Al-Agoouz Analytics Service.
"""
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field


class HistoricalSalesPoint(BaseModel):
    date: str
    quantity: float


class ProductForecastInput(BaseModel):
    product_id: int
    name_ar: str
    category_name: Optional[str] = None
    historical_sales: List[HistoricalSalesPoint] = Field(default_factory=list)
    current_stock: float = 0.0


class DemandForecastRequest(BaseModel):
    forecast_days: int = 30
    products: List[ProductForecastInput]


class ProductForecastOutput(BaseModel):
    product_id: int
    name_ar: str
    forecast_7d: float
    forecast_30d: float
    daily_forecast: List[float]
    trend_slope: float
    confidence_score: float
    quality: str = "sufficient"  # 'insufficient_data', 'sufficient', 'low_variance'
    mae: Optional[float] = None
    mape: Optional[float] = None
    data_points: int = 0


class DemandForecastResponse(BaseModel):
    status: str = "success"
    forecast_days: int
    results: List[ProductForecastOutput]


# Churn Models
class CustomerActivityInput(BaseModel):
    customer_id: int
    name_ar: str
    days_since_last_order: int
    total_orders: int
    total_spent: float
    average_order_value: float


class ChurnRiskRequest(BaseModel):
    customers: List[CustomerActivityInput]


class CustomerChurnOutput(BaseModel):
    customer_id: int
    name_ar: str
    churn_probability: float
    churn_risk_score: float = 0.0  # Heuristic 0-100 score
    risk_level: str  # 'low', 'medium', 'high', 'critical'
    recommended_action: str


class ChurnRiskResponse(BaseModel):
    status: str = "success"
    total_analyzed: int
    high_risk_count: int
    results: List[CustomerChurnOutput]


# Menu Engineering Matrix Models
class MenuItemInput(BaseModel):
    product_id: int
    name_ar: str
    category_name: Optional[str] = None
    units_sold: float
    unit_cost: float
    unit_price: float


class MenuMatrixRequest(BaseModel):
    items: List[MenuItemInput]


class MenuItemOutput(BaseModel):
    product_id: int
    name_ar: str
    category_name: Optional[str] = None
    units_sold: float
    profit_margin_unit: float
    total_profit: float
    quadrant: str  # 'Star', 'Workhorse', 'Puzzle', 'Dog'
    recommendation: str


class MenuMatrixResponse(BaseModel):
    status: str = "success"
    total_items: int
    benchmark_popularity: float
    benchmark_profitability: float
    items: List[MenuItemOutput]


# Anomaly Detection Models
class MetricDataPoint(BaseModel):
    timestamp: str
    entity_id: str
    value: float
    entity_type: str  # 'shift_variance', 'discount_percent', 'void_count'


class AnomalyDetectionRequest(BaseModel):
    points: List[MetricDataPoint]
    sensitivity: float = 2.5  # z-score threshold


class AnomalyPointOutput(BaseModel):
    timestamp: str
    entity_id: str
    entity_type: str
    value: float
    z_score: float
    is_anomaly: bool
    explanation: str
    iqr_outlier: bool = False
    q1: Optional[float] = None
    q3: Optional[float] = None
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None
    quality: str = "sufficient"  # 'sufficient', 'insufficient_data', 'no_variance'


class AnomalyDetectionResponse(BaseModel):
    status: str = "success"
    anomalies_found: int
    results: List[AnomalyPointOutput]
