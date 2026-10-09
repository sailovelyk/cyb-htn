from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from app.core.security import get_current_user, require_role
from app.core.database import get_db
from app.ml.isolation_forest import train_model, get_model_status, _clear_cache
from app.services.audit_service import log_action
from app.services.detection_service import rescore_unscored_logs
from datetime import datetime, timezone

from bson import ObjectId
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class TrainRequest(BaseModel):
    contamination: Optional[float] = 0.1
    use_all_logs: Optional[bool] = True
    batch_id: Optional[str] = None


def _serialize(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


@router.get("/status")
async def model_status(current_user: dict = Depends(get_current_user)):
    status = get_model_status()
    return status


@router.get("")
async def list_models(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    total = db.models.count_documents({})
    skip = (page - 1) * page_size
    cursor = db.models.find({}).sort("created_at", -1).skip(skip).limit(page_size)
    models = [_serialize(doc) for doc in cursor]
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "models": models,
    }


@router.post("/train")
async def trigger_training(
    payload: TrainRequest,
    request: Request,
    current_user: dict = Depends(require_role("ADMIN")),
):
    db = get_db()
    ip = request.client.host if request.client else None

    # Validate contamination
    if not (0.01 <= payload.contamination <= 0.5):
        raise HTTPException(
            status_code=400,
            detail="contamination must be between 0.01 and 0.5"
        )

    # Fetch training records
    query = {}
    if not payload.use_all_logs and payload.batch_id:
        query["batch_id"] = payload.batch_id

    total_logs = db.logs.count_documents(query)
    if total_logs < 10:
        raise HTTPException(
            status_code=422,
            detail=f"Insufficient training data: {total_logs} logs. Minimum 10 required."
        )

    # Load records (limit to avoid memory issues)
    MAX_TRAINING = 50000
    cursor = db.logs.find(query, {"features": 0}).limit(MAX_TRAINING)
    records = list(cursor)

    # Convert bson docs to plain dicts
    for r in records:
        r.pop("_id", None)

    log_action(
        action="model_training_started",
        user_id=current_user["_id"],
        username=current_user["username"],
        resource="model",
        ip=ip,
        result="success",
        details={"training_records": len(records), "contamination": payload.contamination},
    )

    try:
        meta = train_model(records, contamination=payload.contamination)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Model training failed: {e}")
        log_action(
            action="model_training_failed",
            user_id=current_user["_id"],
            username=current_user["username"],
            resource="model",
            ip=ip,
            result="failure",
            details={"error": str(e)},
        )
        raise HTTPException(status_code=500, detail=f"Training failed: {e}")

    # Save model record to DB
    model_doc = {
        **meta,
        "trained_by": current_user["username"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    db.models.insert_one(model_doc)

    log_action(
        action="model_trained",
        user_id=current_user["_id"],
        username=current_user["username"],
        resource="model",
        ip=ip,
        result="success",
        details=meta,
    )

    return {
        "message": "Model trained successfully",
        "training_records": len(records),
        **meta,
    }
