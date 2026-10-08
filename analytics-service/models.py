"""
models.py — Data transfer and validation schemas for Bin Al-Agoouz Analytics Service.
"""
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class AnalyticsModel(BaseModel):
    # JSON statistics must never contain NaN or infinities.
    model_config = ConfigDict(allow_inf_nan=False)


class HistoricalSalesPoint(AnalyticsModel):
    date: str
    quantity: float


class ProductForecastInput(AnalyticsModel):
    product_id: int
    name_ar: str
    category_name: Optional[str] = None
    historical_sales: List[HistoricalSalesPoint] = Field(default_factory=list)
    current_stock: float = 0.0


class DemandForecastRequest(AnalyticsModel):
    forecast_days: int = Field(default=30, ge=1, le=365)
    products: List[ProductForecastInput]


class ProductForecastOutput(AnalyticsModel):
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


class DemandForecastResponse(AnalyticsModel):
    status: str = "success"
    forecast_days: int
    results: List[ProductForecastOutput]


# Churn Models
class CustomerActivityInput(AnalyticsModel):
    customer_id: int
    name_ar: str
    days_since_last_order: int
    total_orders: int
    total_spent: float
    average_order_value: float


class ChurnRiskRequest(AnalyticsModel):
    customers: List[CustomerActivityInput]


class CustomerChurnOutput(AnalyticsModel):
    customer_id: int
    name_ar: str
    churn_risk_estimate: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Rule-based heuristic risk estimate (0.0 to 1.0) based on recency cadence. Not a calibrated probability.",
    )
    churn_probability: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Deprecated compatibility alias matching churn_risk_estimate.",
    )
    churn_risk_score: float = Field(
        default=0.0,
        ge=0.0,
        le=100.0,
        description="Heuristic 0-100 score.",
    )
    risk_level: str  # 'low', 'medium', 'high', 'critical'
    recommended_action: str


class ChurnRiskResponse(AnalyticsModel):
    status: str = "success"
    total_analyzed: int
    high_risk_count: int
    results: List[CustomerChurnOutput]


# Menu Engineering Matrix Models
class MenuItemInput(AnalyticsModel):
    product_id: int
    name_ar: str
    category_name: Optional[str] = None
    units_sold: float
    unit_cost: float
    unit_price: float


class MenuMatrixRequest(AnalyticsModel):
    items: List[MenuItemInput]


class MenuItemOutput(AnalyticsModel):
    product_id: int
    name_ar: str
    category_name: Optional[str] = None
    units_sold: float
    profit_margin_unit: float
    total_profit: float
    quadrant: str  # 'Star', 'Workhorse', 'Puzzle', 'Dog'
    recommendation: str


class MenuMatrixResponse(AnalyticsModel):
    status: str = "success"
    total_items: int
    benchmark_popularity: float
    benchmark_profitability: float
    items: List[MenuItemOutput]


# Anomaly Detection Models
class MetricDataPoint(AnalyticsModel):
    timestamp: str
    entity_id: str
    value: float
    entity_type: str  # 'shift_variance', 'discount_percent', 'void_count'


class AnomalyDetectionRequest(AnalyticsModel):
    points: List[MetricDataPoint]
    sensitivity: float = Field(default=2.5, gt=0)  # z-score threshold


class AnomalyPointOutput(AnalyticsModel):
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


class AnomalyDetectionResponse(AnalyticsModel):
    status: str = "success"
    anomalies_found: int
    results: List[AnomalyPointOutput]
