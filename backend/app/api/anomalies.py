from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.security import get_current_user
from app.core.database import get_db
from bson import ObjectId

router = APIRouter()


def _serialize(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


@router.get("")
async def list_anomalies(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    risk_level: str = Query(None),
    status: str = Query(None),
    user: str = Query(None),
    ip: str = Query(None),
    min_score: float = Query(None, ge=0.0, le=1.0),
    max_score: float = Query(None, ge=0.0, le=1.0),
    start_time: str = Query(None),
    end_time: str = Query(None),
    sort_by: str = Query("normalized_anomaly_score"),
    sort_order: int = Query(-1),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    query = {}

    if risk_level:
        query["risk_level"] = risk_level.upper()
    if status:
        query["status"] = status.lower()
    if user:
        query["user"] = {"$regex": user, "$options": "i"}
    if ip:
        query["ip"] = {"$regex": ip, "$options": "i"}
    if min_score is not None:
        query.setdefault("normalized_anomaly_score", {})["$gte"] = min_score
    if max_score is not None:
        query.setdefault("normalized_anomaly_score", {})["$lte"] = max_score
    if start_time:
        query.setdefault("timestamp", {})["$gte"] = start_time
    if end_time:
        query.setdefault("timestamp", {})["$lte"] = end_time

    total = db.anomalies.count_documents(query)
    skip = (page - 1) * page_size

    cursor = (
        db.anomalies.find(query, {"features": 0})
        .sort(sort_by, sort_order)
        .skip(skip)
        .limit(page_size)
    )
    anomalies = [_serialize(doc) for doc in cursor]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
        "anomalies": anomalies,
    }


@router.get("/{anomaly_id}")
async def get_anomaly(anomaly_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    try:
        doc = db.anomalies.find_one({"_id": ObjectId(anomaly_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid anomaly ID")

    if not doc:
        raise HTTPException(status_code=404, detail="Anomaly not found")

    return _serialize(doc)
