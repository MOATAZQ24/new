# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

from typing import Any, Optional, List, TypeVar, Generic
from pydantic import BaseModel

T = TypeVar("T")


class PaginationMeta(BaseModel):
    total: int
    page: int
    per_page: int
    total_pages: int


class APIResponse(BaseModel):
    data: Any = None
    message: str = "Success"
    pagination: Optional[PaginationMeta] = None


def success_response(
    data: Any = None,
    message: str = "Success",
    pagination: Optional[PaginationMeta] = None,
) -> dict:
    return {
        "data": data,
        "message": message,
        "pagination": pagination.model_dump() if pagination else None,
    }


def paginate(total: int, page: int, per_page: int) -> PaginationMeta:
    total_pages = max(1, (total + per_page - 1) // per_page)
    return PaginationMeta(
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )
