import base64
import hashlib
import hmac
import json
import os
import time
from typing import Optional, List, Dict, Any
from fastapi import Depends, HTTPException, status, Header

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    env_name = os.getenv("ENV", "development").lower()
    if env_name == "production":
        raise RuntimeError("JWT_SECRET_KEY environment variable is required in production mode!")
    SECRET_KEY = "urhealth-dev-secret-key-change-in-production"

ALGORITHM = "HS256"

def hash_password(password: str) -> str:
    """Hash password using PBKDF2 with SHA256."""
    salt = b"urhealth_salt_v1"
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return hashed.hex()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against hashed password."""
    return hash_password(plain_password) == hashed_password

def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def base64url_decode(data: str) -> bytes:
    padding = '=' * (4 - (len(data) % 4))
    return base64.urlsafe_b64decode(data + padding)

def create_jwt_token(payload: Dict[str, Any], expires_in_seconds: int = 86400) -> str:
    """Create a signed JWT token using HMAC-SHA256."""
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload_copy = payload.copy()
    payload_copy["iat"] = now
    payload_copy["exp"] = now + expires_in_seconds

    header_b64 = base64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    payload_b64 = base64url_encode(json.dumps(payload_copy, separators=(',', ':')).encode('utf-8'))

    signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')
    signature = hmac.new(SECRET_KEY.encode('utf-8'), signing_input, hashlib.sha256).digest()
    signature_b64 = base64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"

def decode_jwt_token(token: str) -> Dict[str, Any]:
    """Decode and verify a signed JWT token."""
    parts = token.split('.')
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token structure"
        )
    
    header_b64, payload_b64, signature_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')
    expected_sig = hmac.new(SECRET_KEY.encode('utf-8'), signing_input, hashlib.sha256).digest()

    try:
        actual_sig = base64url_decode(signature_b64)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature format"
        )

    if not hmac.compare_digest(expected_sig, actual_sig):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature"
        )

    try:
        payload = json.loads(base64url_decode(payload_b64).decode('utf-8'))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )

    if payload.get("exp", 0) < int(time.time()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired"
        )

    return payload

def get_current_user_optional(authorization: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    """Extract user payload from Authorization header if present, otherwise return None."""
    if not authorization:
        return None
    if not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    if not token:
        return None
    try:
        return decode_jwt_token(token)
    except HTTPException:
        return None

def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """Require valid JWT token in Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required. Please sign in."
        )
    token = authorization[7:].strip()
    return decode_jwt_token(token)

def require_roles(allowed_roles: List[str]):
    """FastAPI dependency factory enforcing allowed roles."""
    def dependency(current_user: Dict[str, Any] = Depends(get_current_user)):
        user_role = current_user.get("role")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role in {allowed_roles}, got '{user_role}'"
            )
        return current_user
    return dependency

def verify_hospital_access(hospital_id: str, current_user: Dict[str, Any]):
    """Ensure user is district_admin OR a coordinator assigned to the specified hospital."""
    role = current_user.get("role")
    user_h_id = current_user.get("hospital_id")
    if role == "district_admin":
        return True
    if role == "hospital_coordinator" and user_h_id == hospital_id:
        return True
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Forbidden: You do not have permission to modify hospital '{hospital_id}'"
    )
