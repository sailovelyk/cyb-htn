"""
Detection Pipeline Service

Orchestrates the full pipeline:
RAW LOG → PREPROCESSING → FEATURE EXTRACTION → ML → SCORE → RISK → ALERT → DB
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional
from bson import ObjectId
from app.core.database import get_db
from app.core.risk_engine import compute_final_risk, generate_evidence, classify_risk_level
from app.ml.isolation_forest import predict_batch, get_model_status
from app.core.config import settings

logger = logging.getLogger(__name__)


def run_detection_pipeline(
    records: List[dict],
    batch_id: str,
    filename: str,
    uploaded_by: str,
) -> dict:
    """
    Run the complete detection pipeline on a list of normalized log records.

    Returns summary statistics of what was processed and detected.
    """
    db = get_db()

    model_status = get_model_status()
    model_available = model_status.get("status") == "active"

    if not model_available:
        logger.warning("Model not trained — storing logs without ML scoring")

    # Run ML inference (batch for efficiency)
    if model_available:
        ml_results = predict_batch(records)
    else:
        ml_results = [None] * len(records)

    anomaly_count = 0
    alert_count = 0
    logs_inserted = []

    for i, (record, ml_result) in enumerate(zip(records, ml_results)):
        # Build log document
        log_doc = {
            **record,
            "batch_id": batch_id,
            "filename": filename,
            "uploaded_by": uploaded_by,
            "ingested_at": datetime.now(timezone.utc).isoformat(),
            "anomaly_score": None,
            "risk_level": "UNKNOWN",
            "raw_model_signal": None,
            "features": None,
            "has_anomaly": False,
            "anomaly_id": None,
        }

        if ml_result is not None:
            ml_score = ml_result["normalized_anomaly_score"]
            risk_result = compute_final_risk(ml_score, ml_result["features"])
            evidence = generate_evidence(ml_result["features"], risk_result["signals"], record)

            log_doc["anomaly_score"] = ml_score
            log_doc["raw_model_signal"] = ml_result["raw_model_signal"]
            log_doc["risk_level"] = risk_result["risk_level"]
            log_doc["features"] = ml_result["features"]
            log_doc["has_anomaly"] = ml_result["is_anomaly"] or ml_score > settings.RISK_NORMAL_MAX

            # Insert log first to get its ID
            log_result = db.logs.insert_one(log_doc)
            log_id = log_result.inserted_id
            logs_inserted.append(log_id)

            # Create anomaly record if detected
            if log_doc["has_anomaly"]:
                anomaly_doc = {
                    "log_id": str(log_id),
                    "timestamp": record.get("timestamp"),
                    "user": record.get("user"),
                    "ip": record.get("ip"),
                    "hostname": record.get("hostname"),
                    "event_type": record.get("event_type"),
                    "action": record.get("action"),
                    "status_field": record.get("status"),
                    "source": record.get("source"),
                    "batch_id": batch_id,
                    "filename": filename,
                    "raw_model_signal": ml_result["raw_model_signal"],
                    "normalized_anomaly_score": ml_score,
                    "risk_level": risk_result["risk_level"],
                    "final_risk_score": risk_result["final_score"],
                    "risk_signals": risk_result["signals"],
                    "evidence": evidence,
                    "features": ml_result["features"],
                    "status": "open",
                    "investigation_id": None,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                anomaly_result = db.anomalies.insert_one(anomaly_doc)
                anomaly_id = anomaly_result.inserted_id
                anomaly_count += 1

                # Update log with anomaly reference
                db.logs.update_one(
                    {"_id": log_id},
                    {"$set": {"anomaly_id": str(anomaly_id)}}
                )

                # Create alert for HIGH and CRITICAL
                if risk_result["risk_level"] in ("HIGH", "CRITICAL"):
                    alert_doc = {
                        "anomaly_id": str(anomaly_id),
                        "log_id": str(log_id),
                        "severity": risk_result["risk_level"],
                        "anomaly_score": ml_score,
                        "final_risk_score": risk_result["final_score"],
                        "user": record.get("user"),
                        "ip": record.get("ip"),
                        "hostname": record.get("hostname"),
                        "event_type": record.get("event_type"),
                        "action": record.get("action"),
                        "timestamp": record.get("timestamp"),
                        "status": "new",
                        "assigned_analyst": None,
                        "investigation_id": None,
                        "evidence": evidence,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                    db.alerts.insert_one(alert_doc)
                    alert_count += 1
        else:
            # No ML — store log without scoring
            log_result = db.logs.insert_one(log_doc)
            logs_inserted.append(log_result.inserted_id)

    return {
        "total_records": len(records),
        "logs_stored": len(logs_inserted),
        "anomalies_detected": anomaly_count,
        "alerts_created": alert_count,
        "model_available": model_available,
    }


def rescore_unscored_logs() -> dict:
    """
    Evaluate existing logs in MongoDB that were stored before the model was trained.
    Scores them through the ML model and generates anomalies and alerts.
    """
    db = get_db()
    model_status = get_model_status()
    if model_status.get("status") != "active":
        return {"rescored": 0, "anomalies_detected": 0, "alerts_created": 0}

    unscored_logs = list(db.logs.find({"anomaly_score": None}).limit(10000))
    if not unscored_logs:
        return {"rescored": 0, "anomalies_detected": 0, "alerts_created": 0}

    records_to_predict = []
    for doc in unscored_logs:
        rec = {
            k: v for k, v in doc.items()
            if k not in (
                "_id", "batch_id", "filename", "uploaded_by", "ingested_at",
                "anomaly_score", "risk_level", "raw_model_signal", "features",
                "has_anomaly", "anomaly_id"
            )
        }
        records_to_predict.append(rec)

    ml_results = predict_batch(records_to_predict)
    anomaly_count = 0
    alert_count = 0

    for doc, ml_result, rec in zip(unscored_logs, ml_results, records_to_predict):
        if ml_result is None:
            continue
        log_id = doc["_id"]
        ml_score = ml_result["normalized_anomaly_score"]
        risk_result = compute_final_risk(ml_score, ml_result["features"])
        evidence = generate_evidence(ml_result["features"], risk_result["signals"], rec)
        has_anomaly = ml_result["is_anomaly"] or ml_score > settings.RISK_NORMAL_MAX

        update_fields = {
            "anomaly_score": ml_score,
            "raw_model_signal": ml_result["raw_model_signal"],
            "risk_level": risk_result["risk_level"],
            "features": ml_result["features"],
            "has_anomaly": has_anomaly,
        }

        if has_anomaly:
            anomaly_doc = {
                "log_id": str(log_id),
                "timestamp": doc.get("timestamp"),
                "user": doc.get("user"),
                "ip": doc.get("ip"),
                "hostname": doc.get("hostname"),
                "event_type": doc.get("event_type"),
                "action": doc.get("action"),
                "status_field": doc.get("status"),
                "source": doc.get("source"),
                "batch_id": doc.get("batch_id"),
                "filename": doc.get("filename"),
                "raw_model_signal": ml_result["raw_model_signal"],
                "normalized_anomaly_score": ml_score,
                "risk_level": risk_result["risk_level"],
                "final_risk_score": risk_result["final_score"],
                "risk_signals": risk_result["signals"],
                "evidence": evidence,
                "features": ml_result["features"],
                "status": "open",
                "investigation_id": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            anomaly_result = db.anomalies.insert_one(anomaly_doc)
            anomaly_id = anomaly_result.inserted_id
            update_fields["anomaly_id"] = str(anomaly_id)
            anomaly_count += 1

            if risk_result["risk_level"] in ("HIGH", "CRITICAL"):
                alert_doc = {
                    "anomaly_id": str(anomaly_id),
                    "log_id": str(log_id),
                    "severity": risk_result["risk_level"],
                    "anomaly_score": ml_score,
                    "final_risk_score": risk_result["final_score"],
                    "user": doc.get("user"),
                    "ip": doc.get("ip"),
                    "hostname": doc.get("hostname"),
                    "event_type": doc.get("event_type"),
                    "action": doc.get("action"),
                    "timestamp": doc.get("timestamp"),
                    "status": "new",
                    "assigned_analyst": None,
                    "investigation_id": None,
                    "evidence": evidence,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                db.alerts.insert_one(alert_doc)
                alert_count += 1

        db.logs.update_one({"_id": log_id}, {"$set": update_fields})

    return {
        "rescored": len(unscored_logs),
        "anomalies_detected": anomaly_count,
        "alerts_created": alert_count,
    }

