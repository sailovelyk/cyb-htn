from fastapi import APIRouter, Depends, Query
from app.core.security import get_current_user
from app.core.database import get_db
import csv
import io
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone

router = APIRouter()


@router.get("/summary")
async def report_summary(
    start_date: str = Query(None),
    end_date: str = Query(None),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    query = {}
    if start_date:
        query.setdefault("created_at", {})["$gte"] = start_date
    if end_date:
        query.setdefault("created_at", {})["$lte"] = end_date

    total_logs = db.logs.count_documents({})
    total_anomalies = db.anomalies.count_documents(query)

    risk_pipeline = [
        {"$match": query},
        {"$group": {"_id": "$risk_level", "count": {"$sum": 1}}},
    ]
    risk_dist = {d["_id"]: d["count"] for d in db.anomalies.aggregate(risk_pipeline)}

    total_alerts = db.alerts.count_documents({})
    critical_alerts = db.alerts.count_documents({"severity": "CRITICAL"})
    high_alerts = db.alerts.count_documents({"severity": "HIGH"})
    resolved_alerts = db.alerts.count_documents({"status": "resolved"})
    false_positives = db.alerts.count_documents({"status": "false_positive"})

    total_investigations = db.investigations.count_documents({})
    closed_investigations = db.investigations.count_documents({"status": "closed"})

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "period": {"start": start_date, "end": end_date},
        "total_logs": total_logs,
        "total_anomalies": total_anomalies,
        "risk_distribution": risk_dist,
        "total_alerts": total_alerts,
        "critical_alerts": critical_alerts,
        "high_alerts": high_alerts,
        "resolved_alerts": resolved_alerts,
        "false_positives": false_positives,
        "total_investigations": total_investigations,
        "closed_investigations": closed_investigations,
    }


@router.get("/export/anomalies")
async def export_anomalies_csv(
    start_date: str = Query(None),
    end_date: str = Query(None),
    risk_level: str = Query(None),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    query = {}
    if start_date:
        query.setdefault("created_at", {})["$gte"] = start_date
    if end_date:
        query.setdefault("created_at", {})["$lte"] = end_date
    if risk_level:
        query["risk_level"] = risk_level.upper()

    cursor = db.anomalies.find(query, {"features": 0}).sort("created_at", -1).limit(10000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "timestamp", "user", "ip", "hostname", "event_type", "action",
        "risk_level", "normalized_anomaly_score", "final_risk_score", "raw_model_signal",
        "status", "created_at"
    ])

    for doc in cursor:
        writer.writerow([
            str(doc["_id"]),
            doc.get("timestamp", ""),
            doc.get("user", ""),
            doc.get("ip", ""),
            doc.get("hostname", ""),
            doc.get("event_type", ""),
            doc.get("action", ""),
            doc.get("risk_level", ""),
            doc.get("normalized_anomaly_score", ""),
            doc.get("final_risk_score", ""),
            doc.get("raw_model_signal", ""),
            doc.get("status", ""),
            doc.get("created_at", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=anomalies_export.csv"},
    )
