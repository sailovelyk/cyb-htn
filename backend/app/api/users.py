from fastapi import APIRouter, Depends, Query, Request, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.core.security import get_current_user, require_role, hash_password
from app.core.database import get_db
from app.services.audit_service import log_action
from datetime import datetime, timezone
from bson import ObjectId

router = APIRouter()

VALID_ROLES = {"ADMIN", "ANALYST", "VIEWER"}


def _serialize(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    doc.pop("password_hash", None)
    return doc


class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str = "ANALYST"
    full_name: Optional[str] = None


class UserUpdate(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(require_role("ADMIN")),
):
    db = get_db()
    total = db.users.count_documents({})
    skip = (page - 1) * page_size
    cursor = db.users.find({}, {"password_hash": 0}).skip(skip).limit(page_size)
    users = [_serialize(dict(doc)) for doc in cursor]
    return {"total": total, "page": page, "page_size": page_size, "users": users}


@router.post("")
async def create_user(
    payload: UserCreate,
    request: Request,
    current_user: dict = Depends(require_role("ADMIN")),
):
    db = get_db()

    if payload.role.upper() not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}")

    # Check username uniqueness
    if db.users.find_one({"username": payload.username}):
        raise HTTPException(status_code=409, detail="Username already exists")
    if db.users.find_one({"email": payload.email}):
        raise HTTPException(status_code=409, detail="Email already exists")

    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user_doc = {
        "username": payload.username,
        "email": payload.email,
        "password_hash": hash_password(payload.password),
        "role": payload.role.upper(),
        "full_name": payload.full_name,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["username"],
    }

    result = db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    ip = request.client.host if request.client else None
    log_action(
        action="user_created",
        user_id=current_user["_id"],
        username=current_user["username"],
        resource="user",
        resource_id=user_id,
        ip=ip,
        result="success",
        details={"new_username": payload.username, "role": payload.role.upper()},
    )

    created = db.users.find_one({"_id": result.inserted_id})
    return _serialize(dict(created))


@router.get("/{user_id}")
async def get_user(user_id: str, current_user: dict = Depends(require_role("ADMIN"))):
    db = get_db()
    try:
        doc = db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    return _serialize(dict(doc))


@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    payload: UserUpdate,
    request: Request,
    current_user: dict = Depends(require_role("ADMIN")),
):
    db = get_db()
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    existing = db.users.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if payload.email is not None:
        updates["email"] = payload.email
    if payload.role is not None:
        if payload.role.upper() not in VALID_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        updates["role"] = payload.role.upper()
    if payload.full_name is not None:
        updates["full_name"] = payload.full_name
    if payload.is_active is not None:
        updates["is_active"] = payload.is_active

    db.users.update_one({"_id": oid}, {"$set": updates})

    ip = request.client.host if request.client else None
    log_action(
        action="user_modified",
        user_id=current_user["_id"],
        username=current_user["username"],
        resource="user",
        resource_id=user_id,
        ip=ip,
        result="success",
        details={"updates": updates},
    )

    updated = db.users.find_one({"_id": oid}, {"password_hash": 0})
    return _serialize(dict(updated))
