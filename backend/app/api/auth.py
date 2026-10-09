from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from app.core.security import hash_password, verify_password, create_access_token, get_current_user
from app.core.database import get_db
from app.services.audit_service import log_action
from bson import ObjectId
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request):
    db = get_db()
    ip = request.client.host if request.client else None

    # Find user by username
    user = db.users.find_one({"username": payload.username})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        log_action(
            action="login_failed",
            username=payload.username,
            ip=ip,
            result="failure",
            details={"reason": "Invalid credentials"},
        )
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is disabled")

    user_id = str(user["_id"])
    token = create_access_token({"sub": user_id, "role": user["role"]})

    log_action(
        action="login",
        user_id=user_id,
        username=user["username"],
        ip=ip,
        result="success",
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "username": user["username"],
            "email": user.get("email"),
            "role": user["role"],
            "full_name": user.get("full_name"),
        },
    }


@router.post("/logout")
async def logout(request: Request, current_user: dict = Depends(get_current_user)):
    ip = request.client.host if request.client else None
    log_action(
        action="logout",
        user_id=current_user["_id"],
        username=current_user["username"],
        ip=ip,
        result="success",
    )
    return {"message": "Logged out successfully"}


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["_id"],
        "username": current_user["username"],
        "email": current_user.get("email"),
        "role": current_user["role"],
        "full_name": current_user.get("full_name"),
    }
