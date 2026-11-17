"""Telegram restrictions are intersected with current, tenant-scoped CRM grants."""
from app.core.rbac import ROLE_PERMISSION_MATRIX, get_user_effective_roles

MODULES = ('tasks', 'tickets', 'custody', 'assets', 'subscriptions', 'reports', 'notifications', 'search')
ACTIONS = {'view': 'view', 'create': 'create', 'update': 'edit', 'manage': 'manage_access'}
POLICY_KEY = '_telegram_permissions'


def crm_grants(user, company_id, db):
    if not user or user.is_deleted or user.account_status != 'Active':
        return {}
    from app.models.user import CompanyMembership
    if not user.is_superadmin and not db.query(CompanyMembership).filter_by(
        user_id=user.id, company_id=company_id, status='Active'
    ).first():
        return {}
    roles = get_user_effective_roles(user, company_id, db)
    grants = {}
    for module in MODULES:
        grants[module] = [action for action, crm_action in ACTIONS.items() if any(
            crm_action in ROLE_PERMISSION_MATRIX.get(role, {}).get(module, set()) for role in roles
        )]
    # Personal notification/search operations expose only already-authorized records.
    grants['notifications'] = ['view']
    grants['search'] = ['view']
    # CRM tasks.update_task explicitly permits assignees to edit their own tasks.
    if user.employee_id and 'view' in grants.get('tasks', []) and 'update' not in grants['tasks']:
        grants['tasks'].append('update')
    return grants


def policy_for(link):
    return (link.notification_preferences or {}).get(POLICY_KEY, {}) if link else {}


def effective_grants(link, maximum):
    policy = policy_for(link)
    modules = link.allowed_modules if link is not None and link.allowed_modules is not None else MODULES
    restrictions = policy.get('actions', {})
    return {module: [a for a in actions if a in restrictions.get(module, actions)]
            if module in modules else [] for module, actions in maximum.items()}


def maximum_scope(user, company_id, db):
    roles = get_user_effective_roles(user, company_id, db) if user else []
    return 'Company' if any(r in ('Super Admin', 'Company Admin', 'IT Manager', 'IT Technician', 'Auditor') for r in roles) else 'Self'
