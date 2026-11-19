import hashlib
import os
import json
import secrets
from typing import Dict, List, Optional, Tuple
from pydantic_settings import BaseSettings


# Resolve root database path deterministically
_DEFAULT_DB_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "it_ops.db")).replace("\\", "/")

# Centralized data-driven operational constants & SLA policies
DEFAULT_TICKET_SLA_HOURS: Dict[str, int] = {
    "Urgent / Critical": 4,
    "Urgent": 4,
    "Critical": 4,
    "High": 8,
    "Medium": 24,
    "Low": 72,
}

CANONICAL_ROLES: Tuple[str, ...] = (
    "Super Admin",
    "Company Admin",
    "IT Manager",
    "IT Technician",
    "Employee",
    "Auditor",
)

INSECURE_SECRET_KEYS = {
    "",
    "changeme",
    "secret",
    "change-me-to-64-char-random-string",
    "replace-with-64-char-cryptographic-random-hex-string",
}
_INSECURE_SECRET_SHA256 = {
    "d3c47f1e7b8e11074284e576c3f34b98d8b7d42336386416f99f5785d409c7e4",
}


class Settings(BaseSettings):
    APP_NAME: str = "Investor Gate IT Operations Management System"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", os.getenv("ENV", "development"))
    DEBUG: bool = os.getenv("DEBUG", "true").lower() in ("true", "1", "yes")

    # Database: Supports PostgreSQL and SQLite
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{_DEFAULT_DB_FILE}",
    )

    SECRET_KEY: str = os.getenv("SECRET_KEY") or secrets.token_hex(32)
    SESSION_EXPIRE_HOURS: int = int(os.getenv("SESSION_EXPIRE_HOURS", "24"))
    SESSION_COOKIE_SECURE: bool = os.getenv(
        "SESSION_COOKIE_SECURE",
        "true" if os.getenv("ENVIRONMENT", os.getenv("ENV", "development")).lower() == "production" else "false",
    ).lower() in ("true", "1", "yes")
    SESSION_COOKIE_SAMESITE: str = os.getenv("SESSION_COOKIE_SAMESITE", "lax")
    CORS_ORIGINS: str = os.getenv(
        "CORS_ORIGINS",
        '["http://localhost:3000","http://127.0.0.1:3000","http://localhost:8000","http://127.0.0.1:8000","https://localhost","http://localhost"]',
    )
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./data/uploads")
    BACKUP_DIR: str = os.getenv("BACKUP_DIR", "")
    RATE_LIMIT_LOGIN_ATTEMPTS: int = 5
    RATE_LIMIT_LOCKOUT_MINUTES: int = 15

    # SMTP Configuration (Gmail TLS Port 587)
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM_EMAIL: str = os.getenv("SMTP_FROM_EMAIL", "")
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "Investor Gate OS")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 15

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() == "production"

    def validate_production_security(self) -> None:
        """Fail fast at startup if running in production with a default or weak SECRET_KEY."""
        if self.is_production:
            key = (self.SECRET_KEY or "").strip()
            key_hash = hashlib.sha256(key.encode("utf-8")).hexdigest()
            if key in INSECURE_SECRET_KEYS or key_hash in _INSECURE_SECRET_SHA256 or len(key) < 32:
                raise RuntimeError(
                    "FATAL: Production startup aborted — SECRET_KEY is missing, default, or shorter than 32 characters."
                )

    @property
    def cors_origins_list(self) -> List[str]:
        raw = (self.CORS_ORIGINS or "").strip()
        if not raw:
            return []
        try:
            if raw.startswith("["):
                origins = json.loads(raw)
            else:
                origins = [o.strip() for o in raw.split(",") if o.strip()]
            if not isinstance(origins, list) or any(not isinstance(o, str) or o == "*" for o in origins):
                raise ValueError("CORS_ORIGINS must be an explicit list of origins without '*'")
            return origins
        except Exception:
            return []

    @property
    def cors_origin_regex(self) -> Optional[str]:
        """Regex for CORS origin matching. In development, automatically permits RFC1918 private subnets
        (192.168.x.x, 10.x.x.x, 172.16-31.x.x) and loopback for seamless real mobile device testing over LAN.
        In production, strictly adheres to explicit CORS_ORIGIN_REGEX if configured.
        """
        env_regex = os.getenv("CORS_ORIGIN_REGEX", "").strip()
        if env_regex:
            return env_regex
        if not self.is_production:
            return r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$"
        return None

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "allow"


settings = Settings()
settings.validate_production_security()
