import os
import json
from typing import List
from pydantic_settings import BaseSettings


# Resolve root database path deterministically
_DEFAULT_DB_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "it_ops.db")).replace("\\", "/")

class Settings(BaseSettings):
    APP_NAME: str = "Investor Gate IT Operations Management System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Database: Supports PostgreSQL and SQLite
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{_DEFAULT_DB_FILE}"
    )

    SECRET_KEY: str = os.getenv("SECRET_KEY", "investorgate-secret-key-production-ready-2026")
    SESSION_EXPIRE_HOURS: int = 24
    SESSION_COOKIE_SECURE: bool = False
    CORS_ORIGINS: str = '["http://localhost:3000","http://127.0.0.1:3000","http://localhost:8000","http://127.0.0.1:8000"]'
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./data/uploads")
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
    def cors_origins_list(self) -> List[str]:
        try:
            origins = json.loads(self.CORS_ORIGINS)
            if not isinstance(origins, list) or any(not isinstance(o, str) or o == "*" for o in origins):
                raise ValueError("CORS_ORIGINS must be an explicit JSON list of origins")
            return origins
        except Exception:
            return []

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "allow"


settings = Settings()
