from fastapi import APIRouter, Depends, Query
from app.core.security import get_current_user, require_role
from app.core.database import get_db

router = APIRouter()


@router.get("")
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: str = Query(None),
    username: str = Query(None),
    sort_order: int = Query(-1),
    current_user: dict = Depends(require_role("ADMIN")),
):
    db = get_db()
    query = {}
    if action:
        query["action"] = {"$regex": action, "$options": "i"}
    if username:
        query["username"] = {"$regex": username, "$options": "i"}

    total = db.audit_logs.count_documents(query)
    skip = (page - 1) * page_size
    cursor = db.audit_logs.find(query).sort("timestamp", sort_order).skip(skip).limit(page_size)

    logs = []
    for doc in cursor:
        doc["_id"] = str(doc["_id"])
        logs.append(doc)

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
        "audit_logs": logs,
    }
