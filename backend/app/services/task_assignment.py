"""Tenant-scoped task assignee lookup and save-time eligibility checks."""
from datetime import datetime
from fastapi import HTTPException
from sqlalchemy import and_, or_, func, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import joinedload
from app.models.user import Employee, User, CompanyMembership

DIACRITICS = ''.join(chr(c) for a, b in ((0x610, 0x61a), (0x64b, 0x65f), (0x6d6, 0x6ed)) for c in range(a, b + 1)) + '\u0670\u0640'
TRANSLATION = str.maketrans({**dict.fromkeys(DIACRITICS, None), **dict.fromkeys('أإآٱ', 'ا'), 'ة': 'ه', 'ى': 'ي'})


def normalize_name(value):
    return ' '.join((value or '').translate(TRANSLATION).lower().split())


@event.listens_for(Engine, "connect")
def _register_sqlite_normalization(dbapi_connection, connection_record, *args):
    try:
        if hasattr(dbapi_connection, "create_function"):
            dbapi_connection.create_function("normalize_employee_name", 1, lambda v: normalize_name(v if isinstance(v, str) else ""), deterministic=True)
    except Exception:
        pass


# Also register on the already-created default engine (if its pool initialized before this module imported).
from app.core.database import engine as _engine  # noqa: E402
if _engine.dialect.name == "sqlite":
    event.listen(_engine, "checkout", _register_sqlite_normalization)
    event.listen(_engine, "connect", _register_sqlite_normalization)


def employee_query(db, company_id):
    return db.query(Employee).filter(Employee.company_id == company_id).options(
        joinedload(Employee.user), joinedload(Employee.department))


def eligible_expression(company_id):
    active_member = User.company_memberships.any(and_(
        CompanyMembership.company_id == company_id, CompanyMembership.status == 'Active'))
    active_user = Employee.user.has(and_(
        User.account_status == 'Active', User.is_deleted == False,
        or_(User.locked_until == None, User.locked_until <= datetime.utcnow()),
        or_(User.is_superadmin == True, active_member)))
    return and_(Employee.employment_status == 'Active', or_(~Employee.user.has(), active_user))


def validate_assignee(db, company_id, employee_id):
    employee = employee_query(db, company_id).filter(Employee.id == employee_id, eligible_expression(company_id)).first()
    if not employee:
        raise HTTPException(status_code=400, detail='الموظف غير نشط أو غير متاح للإسناد ضمن المنشأة الحالية')
    return employee


def search_assignees(db, company_id, search='', selected_id=None, limit=15):
    if not isinstance(limit, int):
        limit = int(getattr(limit, 'default', 15) or 15)
    query = employee_query(db, company_id)
    if selected_id:
        # Hydrate the current assignment by immutable ID, including a disabled account.
        return query.filter(Employee.id == selected_id).limit(1).all()
    query = query.filter(eligible_expression(company_id))
    tokens = normalize_name(search).split()
    if tokens:
        if db.get_bind().dialect.name == 'sqlite':
            normalized = func.normalize_employee_name(Employee.full_name)
        else:
            normalized = func.lower(func.translate(Employee.full_name, 'أإآٱةى' + DIACRITICS, 'ااااهي'))
        for token in tokens:
            query = query.filter(normalized.contains(token, autoescape=True))
    from app.models.telegram import TelegramUserLink
    verified_tg_exists = (
        db.query(TelegramUserLink.id)
        .filter(
            TelegramUserLink.employee_id == Employee.id,
            TelegramUserLink.company_id == company_id,
            TelegramUserLink.is_verified == True,
        )
        .exists()
    )
    return (
        query.order_by(
            Employee.full_name,
            ~verified_tg_exists,
            Employee.employee_number,
            Employee.id,
        )
        .limit(limit)
        .all()
    )
