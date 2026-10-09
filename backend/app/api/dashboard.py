from fastapi import APIRouter, Depends, Query
from app.core.security import get_current_user
from app.core.database import get_db
import pymongo

router = APIRouter()


@router.get("/stats")
async def dashboard_stats(current_user: dict = Depends(get_current_user)):
    db = get_db()

    total_logs = db.logs.count_documents({})
    total_anomalies = db.anomalies.count_documents({})
    critical_alerts = db.alerts.count_documents({"severity": "CRITICAL"})
    high_alerts = db.alerts.count_documents({"severity": "HIGH"})
    new_alerts = db.alerts.count_documents({"status": "new"})
    active_investigations = db.investigations.count_documents({"status": {"$in": ["open", "in_progress"]}})
    resolved_investigations = db.investigations.count_documents({"status": "closed"})

    # Risk distribution
    risk_pipeline = [
        {"$group": {"_id": "$risk_level", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    risk_dist = {doc["_id"]: doc["count"] for doc in db.anomalies.aggregate(risk_pipeline)}

    # Recent detections (last 24h)
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    recent_anomalies = db.anomalies.count_documents({"created_at": {"$gte": cutoff}})

    # Top suspicious users
    user_pipeline = [
        {"$match": {"user": {"$ne": None}}},
        {"$group": {"_id": "$user", "count": {"$sum": 1}, "max_score": {"$max": "$normalized_anomaly_score"}}},
        {"$sort": {"count": -1}},
        {"$limit": 5},
    ]
    top_users = [{"user": d["_id"], "count": d["count"], "max_score": d.get("max_score")} for d in db.anomalies.aggregate(user_pipeline)]

    # Top suspicious IPs
    ip_pipeline = [
        {"$match": {"ip": {"$ne": None}}},
        {"$group": {"_id": "$ip", "count": {"$sum": 1}, "max_score": {"$max": "$normalized_anomaly_score"}}},
        {"$sort": {"count": -1}},
        {"$limit": 5},
    ]
    top_ips = [{"ip": d["_id"], "count": d["count"], "max_score": d.get("max_score")} for d in db.anomalies.aggregate(ip_pipeline)]

    # Last ingested log timestamp
    last_log = db.logs.find_one({}, sort=[("ingested_at", -1)], projection={"ingested_at": 1})
    last_ingested_at = last_log.get("ingested_at") if last_log else None

    return {
        "total_logs": total_logs,
        "total_anomalies": total_anomalies,
        "critical_alerts": critical_alerts,
        "high_alerts": high_alerts,
        "new_alerts": new_alerts,
        "active_investigations": active_investigations,
        "resolved_investigations": resolved_investigations,
        "risk_distribution": risk_dist,
        "recent_anomalies_24h": recent_anomalies,
        "top_suspicious_users": top_users,
        "top_suspicious_ips": top_ips,
        "last_ingested_at": last_ingested_at,
    }



@router.get("/timeline")
async def anomaly_timeline(
    hours: int = Query(48, ge=1, le=168),
    current_user: dict = Depends(get_current_user),
):
    """Return anomaly counts grouped by hour for charting."""
    db = get_db()
    from datetime import datetime, timezone, timedelta

    # Aggregate anomalies by hour using timestamp prefix
    pipeline = [
        {"$match": {"created_at": {"$exists": True}}},
        {
            "$group": {
                "_id": {"$substr": ["$created_at", 0, 13]},  # "YYYY-MM-DDTHH"
                "count": {"$sum": 1},
                "critical": {"$sum": {"$cond": [{"$eq": ["$risk_level", "CRITICAL"]}, 1, 0]}},
                "high": {"$sum": {"$cond": [{"$eq": ["$risk_level", "HIGH"]}, 1, 0]}},
            }
        },
        {"$sort": {"_id": 1}},
        {"$limit": hours},
    ]

    result = list(db.anomalies.aggregate(pipeline))
    return {"timeline": result}


@router.get("/risk-distribution")
async def risk_distribution(current_user: dict = Depends(get_current_user)):
    db = get_db()
    pipeline = [
        {"$group": {"_id": "$risk_level", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    dist = [{"risk_level": d["_id"], "count": d["count"]} for d in db.anomalies.aggregate(pipeline)]
    return {"distribution": dist}


@router.get("/recent-threats")
async def recent_threats(
    limit: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    """Return most recent high/critical anomalies for the threat feed."""
    db = get_db()
    cursor = (
        db.anomalies.find(
            {"risk_level": {"$in": ["HIGH", "CRITICAL"]}},
            {"features": 0}
        )
        .sort("created_at", -1)
        .limit(limit)
    )
    threats = []
    for doc in cursor:
        doc["_id"] = str(doc["_id"])
        threats.append(doc)
    return {"threats": threats}


@router.get("/event-types")
async def event_type_distribution(current_user: dict = Depends(get_current_user)):
    db = get_db()
    pipeline = [
        {"$match": {"event_type": {"$ne": None}}},
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    dist = [{"event_type": d["_id"], "count": d["count"]} for d in db.logs.aggregate(pipeline)]
    return {"distribution": dist}
