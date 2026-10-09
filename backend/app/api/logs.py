import uuid
import logging
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query, Request
from app.core.security import get_current_user, require_role
from app.core.database import get_db
from app.core.config import settings
from app.services.log_parser import parse_logs, ALLOWED_EXTENSIONS
from app.services.detection_service import run_detection_pipeline
from app.services.audit_service import log_action
from bson import ObjectId

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_MIME = {"text/csv", "application/json", "text/plain", "text/x-log", "application/octet-stream"}


def _serialize(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


@router.post("/upload")
async def upload_logs(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role("ADMIN", "ANALYST")),
):
    # Validate extension
    filename = file.filename or "upload"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ".unknown"
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Read content with size check
    content = await file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: {settings.MAX_UPLOAD_SIZE_MB}MB"
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    # Parse logs
    records, errors = parse_logs(content, filename)

    if not records:
        raise HTTPException(
            status_code=422,
            detail=f"No valid records found in file. Errors: {errors[:5]}"
        )

    # Limit records
    if len(records) > settings.MAX_LOG_RECORDS:
        records = records[:settings.MAX_LOG_RECORDS]

    batch_id = str(uuid.uuid4())
    ip = request.client.host if request.client else None

    # Run detection pipeline
    result = run_detection_pipeline(
        records=records,
        batch_id=batch_id,
        filename=filename,
        uploaded_by=current_user["username"],
    )

    log_action(
        action="log_upload",
        user_id=current_user["_id"],
        username=current_user["username"],
        resource="logs",
        resource_id=batch_id,
        ip=ip,
        result="success",
        details={
            "filename": filename,
            "records_parsed": len(records),
            "parse_errors": len(errors),
            **result,
        },
    )

    return {
        "batch_id": batch_id,
        "filename": filename,
        "parse_errors": errors[:20],  # Return first 20 errors for visibility
        **result,
    }


@router.get("")
async def list_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: str = Query(None),
    ip: str = Query(None),
    hostname: str = Query(None),
    event_type: str = Query(None),
    risk_level: str = Query(None),
    start_time: str = Query(None),
    end_time: str = Query(None),
    sort_by: str = Query("timestamp"),
    sort_order: int = Query(-1),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    query = {}

    if user:
        query["user"] = {"$regex": user, "$options": "i"}
    if ip:
        query["ip"] = {"$regex": ip, "$options": "i"}
    if hostname:
        query["hostname"] = {"$regex": hostname, "$options": "i"}
    if event_type:
        query["event_type"] = {"$regex": event_type, "$options": "i"}
    if risk_level:
        query["risk_level"] = risk_level.upper()
    if start_time:
        query.setdefault("timestamp", {})["$gte"] = start_time
    if end_time:
        query.setdefault("timestamp", {})["$lte"] = end_time

    total = db.logs.count_documents(query)
    skip = (page - 1) * page_size

    allowed_sort = {"timestamp", "user", "ip", "anomaly_score", "risk_level", "ingested_at"}
    if sort_by not in allowed_sort:
        sort_by = "timestamp"

    cursor = db.logs.find(query, {"features": 0}).sort(sort_by, sort_order).skip(skip).limit(page_size)
    logs = [_serialize(doc) for doc in cursor]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
        "logs": logs,
    }


@router.get("/{log_id}")
async def get_log(log_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    try:
        doc = db.logs.find_one({"_id": ObjectId(log_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid log ID")

    if not doc:
        raise HTTPException(status_code=404, detail="Log not found")

    return _serialize(doc)
