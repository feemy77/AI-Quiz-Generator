"""
Authentication router: Registration, Login, Firebase Login, Role Switching, and Profile Management.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Header
import auth
import database
from schemas import RegisterRequest, LoginRequest, FirebaseLoginRequest, ResetPasswordRequest, UpdateProfileRequest, SwitchRoleRequest
from dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register")
def register(req: RegisterRequest):
    if database.get_user_by_email(req.email):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    password_hash, salt = auth.hash_password(req.password)
    user_id = database.create_user(req.name, req.email, password_hash, salt, "unassigned", "")
    token = auth.generate_token()
    database.create_session(token, user_id)
    return {"token": token, "user_id": user_id, "role": "unassigned", "name": req.name}

@router.post("/login")
def login(req: LoginRequest):
    user = database.get_user_by_email(req.email)
    if not user or not auth.verify_password(req.password, user["password_hash"], user["salt"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = auth.generate_token()
    database.create_session(token, user["id"])
    return {"token": token, "user_id": user["id"], "role": user["role"], "name": user["name"]}

@router.post("/firebase-login")
def firebase_login(req: FirebaseLoginRequest):
    """
    Seamlessly authenticate Firebase users (e.g. Google / Apple OAuth from Web or Mobile).
    Finds existing account or registers a new user with verified email.
    """
    user = database.get_user_by_email(req.email)
    if not user:
        # Create a new user with a secure random password hash
        random_pwd = auth.generate_token()
        password_hash, salt = auth.hash_password(random_pwd)
        assigned_role = req.role if req.role in ("teacher", "student") else "student"
        user_id = database.create_user(
            name=req.name or req.email.split("@")[0].capitalize(),
            email=req.email,
            password_hash=password_hash,
            salt=salt,
            role=assigned_role,
            institution_name=""
        )
        user = database.get_user_by_id(user_id)
    
    token = auth.generate_token()
    database.create_session(token, user["id"])
    return {
        "token": token, 
        "user_id": user["id"], 
        "role": user["role"], 
        "name": user["name"],
        "is_firebase": True
    }

@router.post("/update-profile")
def update_profile(req: UpdateProfileRequest, user=Depends(get_current_user)):
    database.update_user_profile(user["id"], req.role, req.institution_name)
    return {"message": "Profile updated successfully", "role": req.role}

@router.post("/switch-role")
def switch_role(req: SwitchRoleRequest, user=Depends(get_current_user)):
    if req.new_role not in ["student", "teacher"]:
        raise HTTPException(status_code=400, detail="Role must be either 'student' or 'teacher'")
    database.update_user_role(user["id"], req.new_role)
    return {"ok": True, "role": req.new_role, "message": f"Switched to {req.new_role} mode"}

@router.post("/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        auth_token = authorization.removeprefix("Bearer ").strip()
        database.delete_session(auth_token)
    return {"ok": True}

@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest):
    """Resets user password in local system securely."""
    user = database.get_user_by_email(req.email)
    if not user:
        raise HTTPException(status_code=404, detail="No registered account found with this email.")
    password_hash, salt = auth.hash_password(req.new_password)
    database.update_user_password(req.email, password_hash, salt)
    return {"ok": True, "message": "Password updated successfully. You can now sign in."}
