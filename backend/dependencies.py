"""
Authentication and access control dependencies for FastAPI endpoints.
"""
from typing import Optional
from fastapi import Header, HTTPException, Depends
import database

def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.removeprefix("Bearer ").strip()
    user_id = database.get_user_id_for_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired session token.")
    user = database.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    return user

def get_optional_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    user_id = database.get_user_id_for_token(token)
    if user_id:
        return database.get_user_by_id(user_id)
    return None

def require_teacher(user=Depends(get_current_user)):
    if user["role"] not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Only teachers/admins can perform this action.")
    return user
