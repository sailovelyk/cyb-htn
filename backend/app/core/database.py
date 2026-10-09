from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import ConnectionFailure
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None
_db = None


def get_client() -> MongoClient:
    global _client
    if _client is None:
        _client = MongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=5000)
    return _client


def get_db():
    global _db
    if _db is None:
        client = get_client()
        _db = client[settings.MONGODB_DATABASE]
    return _db


def check_connection() -> bool:
    try:
        get_client().admin.command("ping")
        return True
    except ConnectionFailure:
        return False


def create_indexes():
    """Create all required database indexes."""
    db = get_db()

    # Logs indexes
    db.logs.create_index([("timestamp", DESCENDING)])
    db.logs.create_index([("user", ASCENDING)])
    db.logs.create_index([("ip", ASCENDING)])
    db.logs.create_index([("hostname", ASCENDING)])
    db.logs.create_index([("event_type", ASCENDING)])
    db.logs.create_index([("anomaly_score", DESCENDING)])
    db.logs.create_index([("risk_level", ASCENDING)])
    db.logs.create_index([("batch_id", ASCENDING)])

    # Anomalies indexes
    db.anomalies.create_index([("anomaly_score", DESCENDING)])
    db.anomalies.create_index([("risk_level", ASCENDING)])
    db.anomalies.create_index([("timestamp", DESCENDING)])
    db.anomalies.create_index([("status", ASCENDING)])
    db.anomalies.create_index([("log_id", ASCENDING)])

    # Alerts indexes
    db.alerts.create_index([("status", ASCENDING)])
    db.alerts.create_index([("severity", ASCENDING)])
    db.alerts.create_index([("created_at", DESCENDING)])
    db.alerts.create_index([("anomaly_id", ASCENDING)])

    # Investigations indexes
    db.investigations.create_index([("status", ASCENDING)])
    db.investigations.create_index([("created_at", DESCENDING)])
    db.investigations.create_index([("alert_id", ASCENDING)])

    # Users indexes
    db.users.create_index([("username", ASCENDING)], unique=True)
    db.users.create_index([("email", ASCENDING)], unique=True)

    # Audit logs indexes
    db.audit_logs.create_index([("timestamp", DESCENDING)])
    db.audit_logs.create_index([("user_id", ASCENDING)])
    db.audit_logs.create_index([("action", ASCENDING)])

    # Models indexes
    db.models.create_index([("created_at", DESCENDING)])
    db.models.create_index([("status", ASCENDING)])

    logger.info("Database indexes created successfully")
