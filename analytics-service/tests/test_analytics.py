import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app, validate_environment_configuration
from models import (
    ProductForecastInput,
    HistoricalSalesPoint,
    CustomerActivityInput,
    MenuItemInput,
    MetricDataPoint,
)
from forecasting import forecast_product_demand
from churn_risk import compute_churn_risk
from menu_engineering import compute_menu_matrix
from anomaly_detector import detect_operational_anomalies

client = TestClient(app)


def test_case_a_production_missing_key_fails_closed():
    """Case A: Production + missing key -> startup configuration failure"""
    os.environ["ANALYTICS_ENV"] = "production"
    os.environ["ANALYTICS_API_KEY"] = ""
    with pytest.raises(RuntimeError) as exc_info:
        validate_environment_configuration()
    assert "Failing closed" in str(exc_info.value)


def test_case_a_lifespan_startup_fails_closed_in_production():
    """Case A: Production + missing key -> TestClient lifespan startup fails closed"""
    os.environ["ANALYTICS_ENV"] = "production"
    os.environ["ANALYTICS_API_KEY"] = ""
    with pytest.raises(RuntimeError) as exc_info:
        with TestClient(app):
            pass
    assert "Failing closed" in str(exc_info.value)


def test_case_b_production_wrong_key_returns_401():
    """Case B: Production + wrong key -> 401 Unauthorized"""
    os.environ["ANALYTICS_ENV"] = "production"
    os.environ["ANALYTICS_API_KEY"] = "valid-secret-key-123"
    try:
        response = client.post(
            "/analytics/churn-risk",
            headers={"X-Analytics-Service-Key": "wrong-key"},
            json={"customers": []},
        )
        assert response.status_code == 401
        assert "Unauthorized" in response.json()["detail"]
    finally:
        del os.environ["ANALYTICS_API_KEY"]


def test_case_c_production_correct_key_succeeds():
    """Case C: Production + correct key -> request succeeds (200)"""
    os.environ["ANALYTICS_ENV"] = "production"
    os.environ["ANALYTICS_API_KEY"] = "valid-secret-key-123"
    try:
        response = client.post(
            "/analytics/churn-risk",
            headers={"X-Analytics-Service-Key": "valid-secret-key-123"},
            json={"customers": []},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
    finally:
        del os.environ["ANALYTICS_API_KEY"]


def test_case_d_development_explicit_opt_out_succeeds_without_key():
    """Case D: Development + explicit auth-disabled -> request succeeds without key"""
    os.environ["ANALYTICS_ENV"] = "development"
    os.environ["ANALYTICS_REQUIRE_AUTH"] = "false"
    os.environ["ANALYTICS_API_KEY"] = ""
    try:
        response = client.post(
            "/analytics/churn-risk",
            json={"customers": []},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
    finally:
        os.environ["ANALYTICS_ENV"] = "production"
        os.environ["ANALYTICS_REQUIRE_AUTH"] = "true"


def test_health_check_unauthenticated_and_safe():
    """Health check must remain unauthenticated and leak zero secrets"""
    os.environ["ANALYTICS_ENV"] = "production"
    os.environ["ANALYTICS_API_KEY"] = "prod-key-hidden"
    try:
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"
        assert "prod-key-hidden" not in str(data)
        assert "env" not in data
    finally:
        del os.environ["ANALYTICS_API_KEY"]


def test_forecast_insufficient_data():
    prod = ProductForecastInput(
        product_id=10,
        name_ar="قهوة كولومبي",
        historical_sales=[
            HistoricalSalesPoint(date="2026-09-01", quantity=5.0),
            HistoricalSalesPoint(date="2026-09-02", quantity=6.0),
            HistoricalSalesPoint(date="2026-09-03", quantity=4.0),
        ],
    )
    result = forecast_product_demand(prod, horizon=30)
    assert result.quality == "insufficient_data"
    assert result.data_points == 3
    assert result.mae is None
    assert result.confidence_score <= 0.5


def test_forecast_sufficient_data_with_backtesting():
    sales = [
        HistoricalSalesPoint(date=f"2026-09-{i:02d}", quantity=float(10 + (i % 3) * 2))
        for i in range(1, 15)
    ]
    prod = ProductForecastInput(product_id=20, name_ar="إسبريسو بليند", historical_sales=sales)
    result = forecast_product_demand(prod, horizon=30)
    assert result.quality == "sufficient"
    assert result.data_points == 14
    assert result.mae is not None
    assert result.mape is not None
    assert len(result.daily_forecast) == 30


def test_forecast_empty_sales():
    prod = ProductForecastInput(product_id=30, name_ar="شاي أخضر", historical_sales=[])
    result = forecast_product_demand(prod, horizon=7)
    assert result.quality == "insufficient_data"
    assert result.forecast_7d == 0.0
    assert result.data_points == 0


def test_churn_risk_intervals_and_terminology():
    customers = [
        CustomerActivityInput(
            customer_id=1,
            name_ar="عميل نشط",
            days_since_last_order=4,
            total_orders=5,
            total_spent=250.0,
            average_order_value=50.0,
        ),
        CustomerActivityInput(
            customer_id=2,
            name_ar="عميل متوسط",
            days_since_last_order=10,
            total_orders=3,
            total_spent=150.0,
            average_order_value=50.0,
        ),
        CustomerActivityInput(
            customer_id=3,
            name_ar="عميل مبتعد",
            days_since_last_order=20,
            total_orders=2,
            total_spent=100.0,
            average_order_value=50.0,
        ),
        CustomerActivityInput(
            customer_id=4,
            name_ar="عميل منقطع",
            days_since_last_order=45,
            total_orders=1,
            total_spent=50.0,
            average_order_value=50.0,
        ),
    ]
    response = compute_churn_risk(customers)
    assert response.total_analyzed == 4
    assert response.high_risk_count == 2

    res_by_id = {r.customer_id: r for r in response.results}

    assert res_by_id[1].risk_level == "low"
    assert res_by_id[1].churn_risk_estimate == 0.05
    assert res_by_id[1].churn_probability == 0.05
    assert res_by_id[1].churn_risk_score == 5.0

    assert res_by_id[2].risk_level == "medium"
    assert res_by_id[2].churn_risk_estimate == 0.25
    assert res_by_id[2].churn_risk_score == 25.0

    assert res_by_id[3].risk_level == "high"
    assert res_by_id[3].churn_risk_estimate == 0.65
    assert res_by_id[3].churn_risk_score == 65.0

    assert res_by_id[4].risk_level == "critical"
    assert res_by_id[4].churn_risk_estimate == 0.90
    assert res_by_id[4].churn_risk_score == 90.0


def test_churn_high_frequency_customer_adjustment():
    regular_customer = CustomerActivityInput(
        customer_id=5,
        name_ar="عميل منتظم توقف فجأة",
        days_since_last_order=16,
        total_orders=15,
        total_spent=1500.0,
        average_order_value=100.0,
    )
    response = compute_churn_risk([regular_customer])
    out = response.results[0]
    assert out.risk_level == "high"
    assert out.churn_risk_score == 75.0


def test_anomaly_insufficient_data():
    points = [
        MetricDataPoint(timestamp=f"2026-09-0{i}", entity_id="s1", value=10.0, entity_type="shift_variance")
        for i in range(1, 4)
    ]
    response = detect_operational_anomalies(points)
    assert response.anomalies_found == 0
    for res in response.results:
        assert res.quality == "insufficient_data"
        assert res.is_anomaly is False


def test_anomaly_zero_variance():
    points = [
        MetricDataPoint(timestamp=f"2026-09-0{i}", entity_id="s1", value=50.0, entity_type="shift_variance")
        for i in range(1, 7)
    ]
    response = detect_operational_anomalies(points)
    assert response.anomalies_found == 0
    for res in response.results:
        assert res.quality == "no_variance"
        assert res.is_anomaly is False
        assert res.z_score == 0.0


def test_anomaly_detection_with_iqr_outlier():
    points = [
        MetricDataPoint(timestamp=f"2026-09-{i:02d}", entity_id="s1", value=float(10 + (i % 3)), entity_type="shift_variance")
        for i in range(1, 10)
    ]
    points.append(
        MetricDataPoint(timestamp="2026-09-10", entity_id="s1", value=300.0, entity_type="shift_variance")
    )
    response = detect_operational_anomalies(points, sensitivity=2.5)
    assert response.anomalies_found >= 1

    spike = response.results[-1]
    assert spike.is_anomaly is True
    assert spike.iqr_outlier is True
    assert spike.z_score > 2.5
    assert spike.quality == "sufficient"


def test_menu_matrix_quadrants():
    items = [
        MenuItemInput(product_id=1, name_ar="صنف نجم", units_sold=100, unit_cost=10, unit_price=40),
        MenuItemInput(product_id=2, name_ar="صنف شعبي", units_sold=120, unit_cost=25, unit_price=30),
        MenuItemInput(product_id=3, name_ar="صنف واعد", units_sold=15, unit_cost=10, unit_price=45),
        MenuItemInput(product_id=4, name_ar="صنف راكد", units_sold=10, unit_cost=20, unit_price=22),
    ]
    response = compute_menu_matrix(items)
    assert response.total_items == 4
    quadrants = {it.product_id: it.quadrant for it in response.items}
    assert quadrants[1] == "Star"
    assert quadrants[2] == "Workhorse"
    assert quadrants[3] == "Puzzle"
    assert quadrants[4] == "Dog"
