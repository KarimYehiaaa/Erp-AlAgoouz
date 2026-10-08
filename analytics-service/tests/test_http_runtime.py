"""Exercise actual loopback HTTP, independently of FastAPI's in-process client."""
import json
import socket
import threading
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import uvicorn

from main import app


def test_actual_http_authentication_validation_and_forecast(monkeypatch):
    monkeypatch.setenv("ANALYTICS_ENV", "production")
    monkeypatch.setenv("ANALYTICS_API_KEY", "isolated-http-fixture")
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    address = f"http://127.0.0.1:{listener.getsockname()[1]}"
    server = uvicorn.Server(uvicorn.Config(app, log_level="error", lifespan="on"))
    worker = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
    worker.start()
    try:
        deadline = time.monotonic() + 10
        while not server.started:
            assert worker.is_alive() and time.monotonic() < deadline, "HTTP server startup failed"
            time.sleep(0.01)
        with urlopen(address + "/health", timeout=5) as response:
            assert response.status == 200
            assert json.load(response)["status"] == "healthy"
        request = Request(address + "/analytics/churn-risk", data=b'{"customers":[]}',
                          headers={"Content-Type": "application/json"})
        try:
            urlopen(request, timeout=5)
            raise AssertionError("Missing authentication was accepted")
        except HTTPError as error:
            assert error.code == 401
            error.close()
        headers = {"Content-Type": "application/json",
                   "X-Analytics-Service-Key": "isolated-http-fixture"}
        payload = {"forecast_days": 60, "products": [{
            "product_id": 1, "name_ar": "fixture",
            "historical_sales": [{"date": "2026-10-01", "quantity": 10}],
        }]}
        request = Request(address + "/forecast/demand",
                          data=json.dumps(payload).encode(), headers=headers)
        with urlopen(request, timeout=5) as response:
            assert response.status == 200
            result = json.load(response)["results"][0]
            assert result["forecast_30d"] == 300 and len(result["daily_forecast"]) == 60
        payload["products"][0]["historical_sales"][0]["quantity"] = "Infinity"
        request = Request(address + "/forecast/demand",
                          data=json.dumps(payload).encode(), headers=headers)
        try:
            urlopen(request, timeout=5)
            raise AssertionError("Nonfinite quantity was accepted")
        except HTTPError as error:
            assert error.code == 422
            assert json.load(error)["detail"][0]["type"] == "finite_number"
            error.close()
    finally:
        server.should_exit = True
        worker.join(timeout=5)
        listener.close()
        assert not worker.is_alive(), "HTTP server did not stop"
