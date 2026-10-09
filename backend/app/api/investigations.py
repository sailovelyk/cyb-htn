from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from app.core.security import get_current_user, require_role
from app.core.database import get_db
from app.services.audit_service import log_action
from datetime import datetime, timezone
from bson import ObjectId
import pymongo

router = APIRouter()


def _serialize(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


class InvestigationCreate(BaseModel):
    alert_id: str
    anomaly_id: str
    notes: Optional[str] = None


class InvestigationUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    analyst_decision: Optional[str] = None


@router.post("")
async def create_investigation(
    payload: InvestigationCreate,
    request: Request,
    current_user: dict = Depends(require_role("ADMIN", "ANALYST")),
):
    db = get_db()

    # Validate anomaly exists
    try:
        anomaly = db.anomalies.find_one({"_id": ObjectId(payload.anomaly_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid anomaly ID")
    if not anomaly:
        raise HTTPException(status_code=404, detail="Anomaly not found")

    # Get related log for timeline
    log_doc = None
    if anomaly.get("log_id"):
        try:
            log_doc = db.logs.find_one({"_id": ObjectId(anomaly["log_id"])})
        except Exception:
            pass

    investigation = {
        "alert_id": payload.alert_id,
        "anomaly_id": payload.anomaly_id,
        "log_id": anomaly.get("log_id"),
        "status": "open",
        "created_by": current_user["username"],
        "assigned_to": current_user["username"],
        "notes": payload.notes or "",
        "analyst_decision": None,
        "anomaly_summary": {
            "user": anomaly.get("user"),
            "ip": anomaly.get("ip"),
            "hostname": anomaly.get("hostname"),
            "event_type": anomaly.get("event_type"),
            "action": anomaly.get("action"),
            "timestamp": anomaly.get("timestamp"),
            "normalized_anomaly_score": anomaly.get("normalized_anomaly_score"),
            "raw_model_signal": anomaly.get("raw_model_signal"),
            "risk_level": anomaly.get("risk_level"),
            "final_risk_score": anomaly.get("final_risk_score"),
            "risk_signals": anomaly.get("risk_signals"),
            "evidence": anomaly.get("evidence"),
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    result = db.investigations.insert_one(investigation)
    inv_id = str(result.inserted_id)

    # Update anomaly and alert with investigation reference
    db.anomalies.update_one(
        {"_id": ObjectId(payload.anomaly_id)},
        {"$set": {"investigation_id": inv_id, "status": "investigating"}}
    )
    if payload.alert_id:
        try:
            db.alerts.update_one(
                {"_id": ObjectId(payload.alert_id)},
                {"$set": {"investigation_id": inv_id, "status": "investigating", "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        except Exception:
            pass

    ip = request.client.host if request.client else None
    log_action(
        action="investigation_created",
        user_id=current_user["_id"],
        username=current_user["username"],
        resource="investigation",
        resource_id=inv_id,
        ip=ip,
        result="success",
        details={"anomaly_id": payload.anomaly_id, "alert_id": payload.alert_id},
    )

    created = db.investigations.find_one({"_id": result.inserted_id})
    return _serialize(created)


@router.get("")
async def list_investigations(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: str = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: int = Query(-1),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    query = {}
    if status:
        query["status"] = status.lower()

    total = db.investigations.count_documents(query)
    skip = (page - 1) * page_size
    cursor = db.investigations.find(query).sort(sort_by, sort_order).skip(skip).limit(page_size)
    items = [_serialize(doc) for doc in cursor]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
        "investigations": items,
    }


@router.get("/{investigation_id}")
async def get_investigation(
    investigation_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    try:
        doc = db.investigations.find_one({"_id": ObjectId(investigation_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid investigation ID")
    if not doc:
        raise HTTPException(status_code=404, detail="Investigation not found")

    ip = request.client.host if request.client else None
    log_action(
        action="investigation_viewed",
        user_id=current_user["_id"],
        username=current_user["username"],
        resource="investigation",
        resource_id=investigation_id,
        ip=ip,
        result="success",
    )

    return _serialize(doc)


@router.get("/{investigation_id}/timeline")
async def get_timeline(
    investigation_id: str,
    window_minutes: int = Query(60, ge=1, le=1440),
    current_user: dict = Depends(get_current_user),
):
    """
    Return related log events around the investigation's primary event.
    Only returns real records from the database — never fabricated.
    """
    db = get_db()
    try:
        inv = db.investigations.find_one({"_id": ObjectId(investigation_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid investigation ID")
    if not inv:
        raise HTTPException(status_code=404, detail="Investigation not found")

    summary = inv.get("anomaly_summary", {})
    user = summary.get("user")
    ip = summary.get("ip")
    hostname = summary.get("hostname")
    event_ts = summary.get("timestamp")

    if not event_ts:
        return {"timeline": [], "message": "No timestamp available for timeline"}

    # Build time window
    from datetime import timedelta
    try:
        from datetime import datetime
        base_ts = datetime.fromisoformat(event_ts.replace("Z", "+00:00"))
        window = timedelta(minutes=window_minutes)
        start_ts = (base_ts - window).isoformat()
        end_ts = (base_ts + window).isoformat()
    except Exception:
        return {"timeline": [], "message": "Could not parse event timestamp"}

    # Find related events: same user OR same IP within window
    query = {
        "timestamp": {"$gte": start_ts, "$lte": end_ts}
    }
    or_conditions = []
    if user:
        or_conditions.append({"user": user})
    if ip:
        or_conditions.append({"ip": ip})
    if hostname:
        or_conditions.append({"hostname": hostname})

    if or_conditions:
        query["$or"] = or_conditions

    cursor = (
        db.logs.find(query, {"features": 0})
        .sort("timestamp", 1)
        .limit(100)
    )

    timeline_events = []
    for doc in cursor:
        doc["_id"] = str(doc["_id"])
        timeline_events.append({
            "id": doc["_id"],
            "timestamp": doc.get("timestamp"),
            "user": doc.get("user"),
            "ip": doc.get("ip"),
            "hostname": doc.get("hostname"),
            "event_type": doc.get("event_type"),
            "action": doc.get("action"),
            "status": doc.get("status"),
            "anomaly_score": doc.get("anomaly_score"),
            "risk_level": doc.get("risk_level"),
            "has_anomaly": doc.get("has_anomaly", False),
        })

    return {
        "investigation_id": investigation_id,
        "center_timestamp": event_ts,
        "window_minutes": window_minutes,
        "total_events": len(timeline_events),
        "timeline": timeline_events,
    }


@router.patch("/{investigation_id}")
async def update_investigation(
    investigation_id: str,
    payload: InvestigationUpdate,
    request: Request,
    current_user: dict = Depends(require_role("ADMIN", "ANALYST")),
):
    db = get_db()
    try:
        oid = ObjectId(investigation_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid investigation ID")

    existing = db.investigations.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Investigation not found")

    VALID_STATUSES = {"open", "in_progress", "closed", "escalated"}
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if payload.status:
        if payload.status.lower() not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {payload.status}")
        updates["status"] = payload.status.lower()

    if payload.notes is not None:
        updates["notes"] = payload.notes

    if payload.analyst_decision is not None:
        updates["analyst_decision"] = payload.analyst_decision

    db.investigations.update_one({"_id": oid}, {"$set": updates})

    ip = request.client.host if request.client else None
    log_action(
        action="investigation_updated",
        user_id=current_user["_id"],
        username=current_user["username"],
        resource="investigation",
        resource_id=investigation_id,
        ip=ip,
        result="success",
        details={"updates": updates},
    )

    updated = db.investigations.find_one({"_id": oid})
    return _serialize(updated)
