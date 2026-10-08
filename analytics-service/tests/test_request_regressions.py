import copy
import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ANALYTICS_ENV", "production")
    monkeypatch.setenv("ANALYTICS_API_KEY", "isolated-regression-key")
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


HEADERS = {"X-Analytics-Service-Key": "isolated-regression-key"}


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity"])
@pytest.mark.parametrize(
    "endpoint,payload",
    [
        (
            "/forecast/demand",
            {"products": [{
                "product_id": 1,
                "name_ar": "fixture",
                "historical_sales": [{"date": "2026-10-01", "quantity": None}],
            }]},
        ),
        (
            "/analytics/menu-matrix",
            {"items": [{
                "product_id": 1, "name_ar": "fixture", "units_sold": None,
                "unit_cost": 10, "unit_price": 20,
            }]},
        ),
        (
            "/analytics/anomalies",
            {"points": [{
                "timestamp": "2026-10-01", "entity_id": "1",
                "entity_type": "shift_variance", "value": None,
            }]},
        ),
    ],
)
def test_nonfinite_numeric_strings_are_rejected(client, endpoint, payload, value):
    body = copy.deepcopy(payload)
    if "products" in body:
        body["products"][0]["historical_sales"][0]["quantity"] = value
    elif "items" in body:
        body["items"][0]["units_sold"] = value
    else:
        body["points"][0]["value"] = value
    response = client.post(endpoint, headers=HEADERS, json=body)
    assert response.status_code == 422


def test_nonfinite_json_literal_returns_validation_error(client):
    response = client.post(
        "/analytics/anomalies",
        headers={**HEADERS, "Content-Type": "application/json"},
        content=(
            '{"points":[{"timestamp":"2026-10-01","entity_id":"1",'
            '"entity_type":"shift_variance","value":NaN}]}'
        ),
    )
    assert response.status_code == 422


def test_non_ascii_invalid_auth_header_returns_401(client):
    response = client.post(
        "/analytics/churn-risk",
        headers=[(b"X-Analytics-Service-Key", b"\xff")],
        json={"customers": []},
    )
    assert response.status_code == 401


@pytest.mark.parametrize("days", [30, 60, 365])
def test_short_history_30_day_total_does_not_expand_with_requested_horizon(client, days):
    response = client.post(
        "/forecast/demand",
        headers=HEADERS,
        json={"forecast_days": days, "products": [{
            "product_id": 1, "name_ar": "fixture",
            "historical_sales": [{"date": "2026-10-01", "quantity": 10}],
        }]},
    )
    assert response.status_code == 200
    result = response.json()["results"][0]
    assert len(result["daily_forecast"]) == days
    assert result["forecast_7d"] == 70
    assert result["forecast_30d"] == 300


@pytest.mark.parametrize("days", [0, -1])
def test_nonpositive_forecast_horizon_is_rejected(client, days):
    response = client.post(
        "/forecast/demand", headers=HEADERS,
        json={"forecast_days": days, "products": []},
    )
    assert response.status_code == 422


@pytest.mark.parametrize("sensitivity", [0, -1])
def test_nonpositive_anomaly_threshold_is_rejected(client, sensitivity):
    response = client.post(
        "/analytics/anomalies", headers=HEADERS,
        json={"points": [], "sensitivity": sensitivity},
    )
    assert response.status_code == 422


@pytest.mark.parametrize("days", [366, 1_000_000_000])
def test_unbounded_forecast_allocation_is_rejected_before_computation(client, days):
    # An empty product list safely reproduces the missing horizon validation
    # without actually allocating the attacker's billion-day result array.
    response = client.post(
        "/forecast/demand", headers=HEADERS,
        json={"forecast_days": days, "products": []},
    )
    assert response.status_code == 422
