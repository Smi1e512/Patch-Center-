"""Single-admin authentication; no database or user accounts."""
import hashlib
import hmac
import json
import secrets
import threading
import time
from collections import deque
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

AUTH_FILE = Path(__file__).resolve().parent / "data" / "admin.json"
LOCK = threading.RLock()
ATTEMPTS = deque()
MAX_ATTEMPTS = 5
WINDOW_SECONDS = 60
MAX_TOKENS = 64

router = APIRouter(prefix="/api/admin", tags=["admin"])
bearer = HTTPBearer(auto_error=False)


class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=256)


def password_hash(password: str, salt: bytes) -> str:
    return hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=2**15, r=8, p=1,
        maxmem=64 * 1024 * 1024, dklen=32,
    ).hex()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def save_state(state):
    AUTH_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = AUTH_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    temporary.replace(AUTH_FILE)


def load_state():
    try:
        state = json.loads(AUTH_FILE.read_text(encoding="utf-8"))
        salt = bytes.fromhex(state["salt"])
        digest = bytes.fromhex(state["password_hash"])
        tokens = state["tokens"]
        if (len(salt) != 16 or len(digest) != 32 or not isinstance(tokens, list)
                or len(tokens) > MAX_TOKENS
                or any(not isinstance(item, str) or len(item) != 64
                       or len(bytes.fromhex(item)) != 32 for item in tokens)):
            raise ValueError("Invalid admin state")
        return state
    except (OSError, ValueError, TypeError, KeyError):
        raise HTTPException(503, "管理员密码尚未设置或配置不可用，请在服务器本地设置。")


def set_password(password: str):
    if not 12 <= len(password) <= 256 or not password.strip():
        raise ValueError("Password must contain 12–256 characters and not be blank.")
    salt = secrets.token_bytes(16)
    with LOCK:
        save_state({
            "salt": salt.hex(),
            "password_hash": password_hash(password, salt),
            "tokens": [],
        })
        ATTEMPTS.clear()


def limit_login():
    now = time.monotonic()
    while ATTEMPTS and now - ATTEMPTS[0] >= WINDOW_SECONDS:
        ATTEMPTS.popleft()
    if len(ATTEMPTS) >= MAX_ATTEMPTS:
        raise HTTPException(429, "尝试次数过多，请一分钟后重试。", headers={"Retry-After": "60"})
    ATTEMPTS.append(now)


def validate_token(state, token: str):
    if not token or len(token) != 43 or not token.isascii():
        return False
    digest = token_hash(token)
    return any(hmac.compare_digest(digest, stored) for stored in state["tokens"])


def require_admin(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    """Reuse this dependency on every future protected admin endpoint."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "请先验证管理员密码。", headers={"WWW-Authenticate": "Bearer"})
    with LOCK:
        if not validate_token(load_state(), credentials.credentials):
            raise HTTPException(401, "管理员登录凭证已失效。", headers={"WWW-Authenticate": "Bearer"})
    return credentials.credentials


@router.post("/login")
def login(body: LoginRequest, response: Response):
    with LOCK:
        state = load_state()
        limit_login()
        candidate = password_hash(body.password, bytes.fromhex(state["salt"]))
        if not hmac.compare_digest(candidate, state["password_hash"]):
            raise HTTPException(401, "管理员密码错误。")
        token = secrets.token_urlsafe(32)
        state["tokens"] = (state["tokens"] + [token_hash(token)])[-MAX_TOKENS:]
        save_state(state)
        ATTEMPTS.clear()
    response.headers["Cache-Control"] = "no-store"
    return {"token": token}


@router.get("/session")
def session(response: Response, _token: str = Depends(require_admin)):
    response.headers["Cache-Control"] = "no-store"
    return {"authenticated": True}


@router.post("/logout")
def logout(response: Response, token: str = Depends(require_admin)):
    with LOCK:
        state = load_state()
        digest = token_hash(token)
        state["tokens"] = [item for item in state["tokens"] if not hmac.compare_digest(item, digest)]
        save_state(state)
    response.headers["Cache-Control"] = "no-store"
    return {"authenticated": False}
