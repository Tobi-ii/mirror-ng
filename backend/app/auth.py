"""
auth.py — JWT authentication for Mirror.ng
"""
import os
import logging
import base64
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from fastapi import Request, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)

SECRET_KEY = os.environ["SECRET_KEY"]
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

# ── Fernet encryption for email passwords ──────────────────────────
_salt = b'mirror-ng-email-pw-v1'

def _get_fernet():
    """Derive a Fernet key from the app SECRET_KEY."""
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=_salt, iterations=100000)
    key = base64.urlsafe_b64encode(kdf.derive(SECRET_KEY.encode()))
    return Fernet(key)

def encrypt_password(plaintext: str) -> str:
    """Encrypt an email password for server-side storage."""
    return _get_fernet().encrypt(plaintext.encode()).decode()

def decrypt_password(ciphertext: str) -> str:
    """Decrypt a stored email password."""
    return _get_fernet().decrypt(ciphertext.encode()).decode()

security = HTTPBearer(auto_error=False)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_current_user_id(request: Request) -> Optional[str]:
    auth: Optional[HTTPAuthorizationCredentials] = await security(request)
    if not auth:
        return None
    payload = decode_access_token(auth.credentials)
    if payload is None:
        return None
    return payload.get("user_id")


async def require_user_id(request: Request) -> str:
    user_id = await get_current_user_id(request)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id
