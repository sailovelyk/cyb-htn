"""
AegisLog AI — FastAPI Application Entry Point
"""
import logging
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import create_indexes, check_connection
from app.api import auth, logs, anomalies, alerts, investigations, models, dashboard, users, audit, reports

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    # Startup
    logger.info("AegisLog AI starting up...")
    if check_connection():
        logger.info("MongoDB connected successfully")
        create_indexes()
        # Seed default admin user if DB is empty
        _seed_default_user()
    else:
        logger.warning("MongoDB connection failed — some features will be unavailable")
    yield
    # Shutdown
    logger.info("AegisLog AI shutting down...")


def _seed_default_user():
    """Create default admin and analyst users if no users exist."""
    from app.core.database import get_db
    from app.core.security import hash_password
    from datetime import datetime, timezone

    db = get_db()
    if db.users.count_documents({}) == 0:
        default_users = [
            {
                "username": "admin",
                "email": "admin@aegislog.local",
                "password_hash": hash_password("Admin@1234"),
                "role": "ADMIN",
                "full_name": "System Administrator",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": "system",
            },
            {
                "username": "analyst",
                "email": "analyst@aegislog.local",
                "password_hash": hash_password("Analyst@1234"),
                "role": "ANALYST",
                "full_name": "Security Analyst",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": "system",
            },
            {
                "username": "viewer",
                "email": "viewer@aegislog.local",
                "password_hash": hash_password("Viewer@1234"),
                "role": "VIEWER",
                "full_name": "Log Viewer",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": "system",
            },
        ]
        db.users.insert_many(default_users)
        logger.info("Default users seeded: admin / analyst / viewer")


app = FastAPI(
    title="AegisLog AI",
    description="AI-Powered Anomaly Detection for System Logs — CQ-M06",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(logs.router, prefix="/api/logs", tags=["Logs"])
app.include_router(anomalies.router, prefix="/api/anomalies", tags=["Anomalies"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["Alerts"])
app.include_router(investigations.router, prefix="/api/investigations", tags=["Investigations"])
app.include_router(models.router, prefix="/api/models", tags=["Models"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(audit.router, prefix="/api/audit-logs", tags=["Audit Logs"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])


@app.get("/api/health")
async def health():
    db_ok = check_connection()
    from app.ml.isolation_forest import get_model_status
    model_status = get_model_status()
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "unavailable",
        "model": model_status.get("status", "unknown"),
        "version": "1.0.0",
    }
