from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from app.core.security import get_current_user, require_role
from app.core.database import get_db
from app.services.audit_service import log_action
from datetime import datetime, timezone
from bson import ObjectId

router = APIRouter()


def _serialize(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


class AlertUpdate(BaseModel):
    status: Optional[str] = None
    assigned_analyst: Optional[str] = None
    notes: Optional[str] = None


@router.get("")
async def list_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: str = Query(None),
    severity: str = Query(None),
    user: str = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: int = Query(-1),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    query = {}
    if status:
        query["status"] = status.lower()
    if severity:
        query["severity"] = severity.upper()
    if user:
        query["user"] = {"$regex": user, "$options": "i"}

    total = db.alerts.count_documents(query)
    skip = (page - 1) * page_size
    cursor = db.alerts.find(query).sort(sort_by, sort_order).skip(skip).limit(page_size)
    alerts = [_serialize(doc) for doc in cursor]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
        "alerts": alerts,
    }


@router.get("/{alert_id}")
async def get_alert(alert_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    try:
        doc = db.alerts.find_one({"_id": ObjectId(alert_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid alert ID")
    if not doc:
        raise HTTPException(status_code=404, detail="Alert not found")
    return _serialize(doc)


@router.patch("/{alert_id}")
async def update_alert(
    alert_id: str,
    request: Request,
    payload: AlertUpdate,
    current_user: dict = Depends(require_role("ADMIN", "ANALYST")),
):
    db = get_db()
    try:
        oid = ObjectId(alert_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid alert ID")

    existing = db.alerts.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Alert not found")

    VALID_STATUSES = {"new", "investigating", "resolved", "false_positive"}
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if payload.status:
        if payload.status.lower() not in VALID_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}"
            )
        updates["status"] = payload.status.lower()

    if payload.assigned_analyst is not None:
        updates["assigned_analyst"] = payload.assigned_analyst

    if payload.notes is not None:
        updates["notes"] = payload.notes

    db.alerts.update_one({"_id": oid}, {"$set": updates})

    ip = request.client.host if request.client else None
    log_action(
        action="alert_status_changed",
        user_id=current_user["_id"],
        username=current_user["username"],
        resource="alert",
        resource_id=alert_id,
        ip=ip,
        result="success",
        details={
            "previous_status": existing.get("status"),
            "new_status": payload.status,
            "updates": updates,
        },
    )

    updated = db.alerts.find_one({"_id": oid})
    return _serialize(updated)
