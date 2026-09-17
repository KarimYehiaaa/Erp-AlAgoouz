"""
main.py — FastAPI Companion Layer for Bin Al-Agoouz ERP.

Provides advanced ML analytics, demand forecasting, menu engineering, and anomaly detection.
Node.js remains the primary ERP transaction engine; this service acts as an optional
high-performance analytical companion.
"""
import os
import secrets
import logging
from contextlib import asynccontextmanager
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from models import (
    DemandForecastRequest,
    DemandForecastResponse,
    ProductForecastOutput,
    ChurnRiskRequest,
    ChurnRiskResponse,
    MenuMatrixRequest,
    MenuMatrixResponse,
    AnomalyDetectionRequest,
    AnomalyDetectionResponse,
)
from forecasting import forecast_product_demand
from menu_engineering import compute_menu_matrix
from churn_risk import compute_churn_risk
from anomaly_detector import detect_operational_anomalies

logger = logging.getLogger("analytics_service")


def validate_environment_configuration():
    """
    Ensures authentication is fail-closed in production.
    In production, ANALYTICS_API_KEY is strictly mandatory; missing key aborts startup.
    In development, unauthenticated access is allowed only if explicitly opted-out
    via ANALYTICS_REQUIRE_AUTH=false.
    """
    env = os.getenv("ANALYTICS_ENV", "production").strip().lower()
    api_key = os.getenv("ANALYTICS_API_KEY", "").strip()
    require_auth_raw = os.getenv("ANALYTICS_REQUIRE_AUTH", "true").strip().lower()
    require_auth = require_auth_raw not in ("false", "0", "no")

    if env == "production":
        if not api_key:
            raise RuntimeError(
                "FATAL: In production environment (ANALYTICS_ENV=production), "
                "ANALYTICS_API_KEY must be configured and non-empty. Failing closed."
            )
    elif env == "development":
        if require_auth and not api_key:
            raise RuntimeError(
                "Configuration Error: In development with authentication enabled, "
                "ANALYTICS_API_KEY must be provided, or set ANALYTICS_REQUIRE_AUTH=false to bypass locally."
            )
    else:
        if not api_key:
            raise RuntimeError(
                f"FATAL: In environment '{env}', ANALYTICS_API_KEY must be configured and non-empty."
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_environment_configuration()
    yield


app = FastAPI(
    title="Bin Al-Agoouz ERP Analytics Service",
    version="1.1.0",
    description="Statistical & Machine Learning companion service for coffee roastery and cafe operations.",
    lifespan=lifespan,
)

# Configurable and secure CORS middleware
raw_origins = os.getenv(
    "ANALYTICS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://localhost:8000,http://127.0.0.1:3000,http://127.0.0.1:5173",
)
allowed_origins: List[str] = [orig.strip() for orig in raw_origins.split(",") if orig.strip()]
is_wildcard = "*" in allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if not is_wildcard else ["*"],
    allow_credentials=not is_wildcard,  # Forbidden by spec to combine "*" with allow_credentials=True
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def verify_analytics_key(
    x_key: Optional[str] = Header(None, alias="X-Analytics-Service-Key"),
):
    """
    Constant-time comparison of X-Analytics-Service-Key.
    Fails closed if misconfigured in production or if key is invalid.
    """
    env = os.getenv("ANALYTICS_ENV", "production").strip().lower()
    require_auth_raw = os.getenv("ANALYTICS_REQUIRE_AUTH", "true").strip().lower()
    require_auth = require_auth_raw not in ("false", "0", "no")
    expected_key = os.getenv("ANALYTICS_API_KEY", "").strip()

    # Allow unauthenticated access ONLY in development when explicitly configured
    if env == "development" and not require_auth:
        return True

    if not expected_key:
        raise HTTPException(
            status_code=500,
            detail="Analytics service authentication is unconfigured.",
        )

    if not x_key or not secrets.compare_digest(x_key, expected_key):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: Missing or invalid X-Analytics-Service-Key",
        )
    return True


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled analytics error on {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "message": "Internal analytics processing error occurred.",
            "code": "ANALYTICS_INTERNAL_ERROR",
        },
    )


@app.get("/health")
def health_check():
    """
    Health check endpoint for Docker / orchestration probes.
    Kept unauthenticated intentionally; does not expose internal configuration or secrets.
    """
    return {
        "status": "healthy",
        "service": "bin-al-agoouz-analytics",
        "version": "1.1.0",
        "role": "companion_layer",
    }


@app.post(
    "/forecast/demand",
    response_model=DemandForecastResponse,
    dependencies=[Depends(verify_analytics_key)],
)
def get_demand_forecast(req: DemandForecastRequest):
    results: List[ProductForecastOutput] = []
    for prod in req.products:
        res = forecast_product_demand(prod, horizon=req.forecast_days)
        results.append(res)

    return DemandForecastResponse(
        forecast_days=req.forecast_days,
        results=results,
    )


@app.post(
    "/analytics/churn-risk",
    response_model=ChurnRiskResponse,
    dependencies=[Depends(verify_analytics_key)],
)
def get_churn_risk(req: ChurnRiskRequest):
    return compute_churn_risk(req.customers)


@app.post(
    "/analytics/menu-matrix",
    response_model=MenuMatrixResponse,
    dependencies=[Depends(verify_analytics_key)],
)
def get_menu_matrix(req: MenuMatrixRequest):
    return compute_menu_matrix(req.items)


@app.post(
    "/analytics/anomalies",
    response_model=AnomalyDetectionResponse,
    dependencies=[Depends(verify_analytics_key)],
)
def get_anomalies(req: AnomalyDetectionRequest):
    return detect_operational_anomalies(req.points, sensitivity=req.sensitivity)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
