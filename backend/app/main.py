import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import SessionLocal, init_db
from app.api.v1.router import api_router
from app.core.telemetry import metrics_collector, TelemetryMiddleware

logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_production_security()
    init_db()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="نظام إدارة الأصول التقنية ومكتب المساعدة والعمليات للشركات المتعددة - Investor Gate",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TelemetryMiddleware)

app.include_router(api_router, prefix="/api")


@app.get("/api/v1/metrics")
@app.get("/metrics")
def get_metrics(format: str = "json"):
    if format == "prometheus":
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(metrics_collector.get_prometheus_text(), media_type="text/plain; version=0.0.4")
    return metrics_collector.get_summary()


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
    }


@app.get("/api/ready")
def readiness_check():
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ready", "database": "connected"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Database not ready: {exc}")
    finally:
        db.close()


@app.get("/")
def root():
    return {
        "message": "Investor Gate IT Operations Management API",
        "docs": "/docs",
        "api_v1": "/api/v1",
    }
