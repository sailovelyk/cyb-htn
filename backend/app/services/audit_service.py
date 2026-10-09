"""
Audit Logging Service

Records all security-relevant actions for compliance and traceability.
Audit logs are append-only from the application perspective.
"""
from datetime import datetime, timezone
from typing import Optional
from app.core.database import get_db


def log_action(
    action: str,
    user_id: Optional[str] = None,
    username: Optional[str] = None,
    resource: Optional[str] = None,
    resource_id: Optional[str] = None,
    ip: Optional[str] = None,
    result: str = "success",
    details: Optional[dict] = None,
):
    """
    Append an audit log entry to MongoDB.
    This function should never raise — audit failures must not interrupt business logic.
    """
    try:
        db = get_db()
        entry = {
            "action": action,
            "user_id": user_id,
            "username": username,
            "resource": resource,
            "resource_id": resource_id,
            "ip": ip,
            "result": result,
            "details": details or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        db.audit_logs.insert_one(entry)
    except Exception:
        pass  # Never crash the caller due to audit log failure
