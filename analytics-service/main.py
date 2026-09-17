"""
main.py — FastAPI Companion Layer for Bin Al-Agoouz ERP.
Provides advanced ML analytics, demand forecasting, menu engineering, and anomaly detection.
Preserves Node.js as the core transaction engine while offloading computational models.
"""
from fastapi import FastAPI, HTTPException
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
from clustering import compute_menu_matrix, compute_churn_risk
from anomaly_detector import detect_operational_anomalies

app = FastAPI(
    title="Bin Al-Agoouz ERP Analytics Service",
    version="1.0.0",
    description="Machine Learning & Business Intelligence companion service for coffee roastery and cafe operations.",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "bin-al-agoouz-analytics",
        "version": "1.0.0",
        "role": "companion_layer",
    }


@app.post("/forecast/demand", response_model=DemandForecastResponse)
def get_demand_forecast(req: DemandForecastRequest):
    try:
        results: list[ProductForecastOutput] = []
        for prod in req.products:
            res = forecast_product_demand(prod, horizon=req.forecast_days)
            results.append(res)

        return DemandForecastResponse(
            forecast_days=req.forecast_days,
            results=results
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Demand forecasting error: {str(e)}")


@app.post("/analytics/churn-risk", response_model=ChurnRiskResponse)
def get_churn_risk(req: ChurnRiskRequest):
    try:
        return compute_churn_risk(req.customers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Churn risk calculation error: {str(e)}")


@app.post("/analytics/menu-matrix", response_model=MenuMatrixResponse)
def get_menu_matrix(req: MenuMatrixRequest):
    try:
        return compute_menu_matrix(req.items)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Menu matrix calculation error: {str(e)}")


@app.post("/analytics/anomalies", response_model=AnomalyDetectionResponse)
def get_anomalies(req: AnomalyDetectionRequest):
    try:
        return detect_operational_anomalies(req.points, sensitivity=req.sensitivity)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Anomaly detection error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
