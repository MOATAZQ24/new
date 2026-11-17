"""Bounded, authorized command pages shared by polling and webhook delivery."""
import html
import uuid
from sqlalchemy import or_
from app.models.task import Task
from app.models.ticket import HelpDeskTicket
from app.models.asset import AssetCustody
from app.models.subscription import ThirdPartySubscription
from app.models.telegram import TelegramActionLog
from app.services.task_workflow import (
    ACTIVE_STAGES, STAGE_EMOJI, STAGE_LABELS_AR, STAGE_STATUSES, TERMINAL_STATUSES,
    stage_condition, stage_of, task_ref, is_overdue,
)
from app.services.telegram_permissions import crm_grants, effective_grants, policy_for, maximum_scope


def execute(db, telegram_user_id, telegram_chat_id, action_str, ip_address=None):
    from app.services.telegram_service import resolve_telegram_identity, _execute_bot_action_legacy
    context = resolve_telegram_identity(db, telegram_user_id, telegram_chat_id)
    if not context.is_authorized:
        return _execute_bot_action_legacy(db, telegram_user_id, telegram_chat_id, action_str, ip_address)
    context.effective_permissions = effective_grants(context.link, crm_grants(context.user, context.company_id, db))
    requested_scope = policy_for(context.link).get('scope', getattr(context.link, 'data_scope', 'Self'))
    context.data_scope = 'Company' if requested_scope == 'Company' and maximum_scope(context.user, context.company_id, db) == 'Company' else 'Self'
    parts = action_str.split(':')
    denied = False
    if parts[0] == 'act':
        required = 'view' if len(parts) > 1 and parts[1] in ('info', 'ack', 'acknowledge') else 'update'
        denied = required not in context.effective_permissions.get('tasks', [])
        try:
            task = db.query(Task).filter(Task.id == uuid.UUID(parts[2]), Task.company_id == context.company_id).populate_existing().with_for_update().first()
            denied = denied or not task or (context.data_scope == 'Self' and task.assigned_to_id != context.employee.id)
        except (ValueError, IndexError):
            denied = True
        if not denied and parts[1] in ('approve', 'rework') and not context.is_privileged:
            denied = True
    if parts[:2] in (['cmd', 'overdue'], ['cmd', 'search']):
        denied = not context.can_access_module('tasks' if parts[1] == 'overdue' else 'search')
    if parts[:2] in (['cmd', 'reports'], ['cmd', 'kpis']) and (
        'view' not in context.effective_permissions.get('reports', [])
    ):
        denied = True
    if parts[:2] in (['cmd', 'assets'], ['cmd', 'all_assets']) and (
        'view' not in context.effective_permissions.get('assets', [])
    ):
        denied = True
    if parts[:2] == ['cmd', 'subscriptions'] and (
        'view' not in context.effective_permissions.get('subscriptions', [])
    ):
        denied = True
    if denied:
        result = {'success': False, 'status': 'Unauthorized', 'message': 'ليس لديك صلاحية لتنفيذ هذا الإجراء.'}
    else:
        result = route(context, db, action_str)
        if result is None:
            result = _execute_bot_action_legacy(db, telegram_user_id, telegram_chat_id, action_str, ip_address)
    result.setdefault('reply_markup', navigation())
    db.add(TelegramActionLog(company_id=context.company_id, telegram_user_id=str(telegram_user_id),
        telegram_chat_id=telegram_chat_id, action=parts[1][:100] if len(parts) > 1 else 'invalid',
        status='Success' if result.get('success') else 'Unauthorized', ip_address=ip_address))
    db.commit()
    return result

COMMANDS = {
    'my_tasks': ('tasks', 'مهامي'), 'my_tickets': ('tickets', 'تذاكري'),
    'my_custody': ('custody', 'أصولي وعهدتي'), 'subscriptions': ('subscriptions', 'الاشتراكات'),
    'reports': ('reports', 'التقارير'), 'my_permissions': (None, 'صلاحياتي'),
}


def navigation(command=None, page=0, more=False):
    rows = []
    if command:
        buttons = []
        if page:
            buttons.append({'text': 'السابق', 'callback_data': f'cmd:{command}:{page-1}'})
        if more:
            buttons.append({'text': 'التالي', 'callback_data': f'cmd:{command}:{page+1}'})
        if buttons:
            rows.append(buttons)
    rows.append([{'text': '🏠 القائمة الرئيسية', 'callback_data': 'cmd:main_menu'}])
    return {'inline_keyboard': rows}


def route(context, db, action):
    parts = action.split(':')
    if len(parts) < 2 or parts[0] != 'cmd':
        return None
    command = {'tickets': 'my_tickets', 'subs': 'subscriptions', 'permissions': 'my_permissions'}.get(parts[1], parts[1])
    if command in ('main_menu', 'home', 'start_menu'):
        buttons = [{'text': label, 'callback_data': f'cmd:{name}'}
                   for name, (module, label) in COMMANDS.items()
                   if module is None or context.can_access_module(module)]
        return {'success': True, 'message': 'القائمة الرئيسية - اختر الخدمة المطلوبة',
                'reply_markup': {'inline_keyboard': [buttons[i:i+2] for i in range(0, len(buttons), 2)]}}
    if command not in COMMANDS:
        return None
    module, label = COMMANDS[command]
    if module and not context.can_access_module(module):
        return {'success': False, 'status': 'Forbidden', 'message': 'ليس لديك صلاحية للوصول لهذه البيانات.'}
    if command == 'my_permissions':
        lines = [f'صلاحياتك المعتمدة - {context.employee.full_name}', f'نطاق البيانات: {context.data_scope}']
        lines += [f'{m}: {", ".join(actions) or "غير مسموح"}' for m, actions in context.effective_permissions.items()]
        return {'success': True, 'message': html.escape('\n'.join(lines)), 'reply_markup': navigation()}
    if command == 'reports':
        return None  # Existing company aggregates, authorized above.
    if command == 'my_tasks':
        return my_tasks_view(context, db, parts)
    try:
        page = int(parts[2]) if len(parts) == 3 else 0
        if page < 0 or page > 100000 or len(parts) > 3:
            raise ValueError()
    except ValueError:
        return {'success': False, 'status': 'InvalidPage', 'message': 'رقم الصفحة غير صالح.'}
    cid, emp = context.company_id, context.employee.id
    if command == 'my_tasks':
        query = db.query(Task).filter(Task.company_id == cid, Task.assigned_to_id == emp)
        key, title = 'tasks', lambda r: r.title
    elif command == 'my_tickets':
        query = db.query(HelpDeskTicket).filter(HelpDeskTicket.company_id == cid, or_(
            HelpDeskTicket.requester_id == emp, HelpDeskTicket.assigned_technician_id == context.user.id))
        key, title = 'tickets', lambda r: r.issue_title
    elif command == 'my_custody':
        query = db.query(AssetCustody).filter(AssetCustody.company_id == cid, AssetCustody.employee_id == emp, AssetCustody.status == 'Active')
        key, title = 'custodies', lambda r: (f"{r.asset.asset_name} {r.asset.model}" if (r.asset and r.asset.model) else (r.asset.asset_name if r.asset else 'أصل تقني'))
    else:
        query = db.query(ThirdPartySubscription).filter(ThirdPartySubscription.company_id == cid)
        key, title = 'subscriptions', lambda r: r.service_name
    model = query.column_descriptions[0]['entity']
    records = query.order_by(model.id).offset(page * 5).limit(6).all()
    more, records = len(records) > 5, records[:5]
    lines = [f'{label} — الصفحة {page+1}']
    lines += [f'{title(r)[:180]} — {r.status}' for r in records]
    if not records:
        lines.append('لا توجد سجلات.')
    keyboard = navigation(command, page, more)
    if command == 'my_tasks':
        keyboard['inline_keyboard'][0:0] = [[{'text': title(r)[:50], 'callback_data': f'act:info:{r.id}'}] for r in records]
    return {'success': True, 'status': 'Success', 'message': html.escape('\n'.join(lines)),
            key: [{'id': str(r.id), 'title': title(r), 'status': r.status} for r in records], 'reply_markup': keyboard}


TASK_VIEWS = {  # view key -> (button label, SQL stage key)
    'active': ('🔄 النشطة', 'active'), 'new': ('📨 بانتظار القبول', 'new'),
    'in_progress': ('🔵 قيد التنفيذ', 'in_progress'), 'waiting': ('🟡 بانتظار التوضيح', 'waiting'),
    'overdue': ('🔴 المتأخرة', 'overdue'), 'completed': ('🟢 المكتملة', 'completed'),
    'rejected': ('⛔ المرفوضة', 'rejected'),
}
TASK_PAGE_SIZE = 5


def my_tasks_view(context, db, parts):
    """cmd:my_tasks[:view[:page]] — active tasks by default; completed ones only via the Completed view."""
    view, page = 'active', 0
    try:
        if len(parts) > 2:
            if len(parts) == 3 and parts[2].isdigit():
                page = int(parts[2])  # legacy cmd:my_tasks:<page>
            else:
                view = parts[2]
                if len(parts) > 3 and not parts[3].isdigit():
                    raise ValueError()
                page = int(parts[3]) if len(parts) > 3 else 0
        if view not in TASK_VIEWS or not 0 <= page <= 100000 or len(parts) > 4:
            raise ValueError()
    except ValueError:
        return {'success': False, 'status': 'InvalidPage', 'message': 'عرض أو رقم صفحة غير صالح.'}
    base = db.query(Task).filter(Task.company_id == context.company_id, Task.assigned_to_id == context.employee.id)
    counts = {key: base.filter(stage_condition(stage)).count() for key, (_, stage) in TASK_VIEWS.items()}
    query = base.filter(stage_condition(TASK_VIEWS[view][1]))
    records = query.order_by(Task.due_date.is_(None), Task.due_date.asc(), Task.created_at.desc()) \
        .offset(page * TASK_PAGE_SIZE).limit(TASK_PAGE_SIZE + 1).all()
    more, records = len(records) > TASK_PAGE_SIZE, records[:TASK_PAGE_SIZE]
    lines = [f"<b>📋 مهامي — {TASK_VIEWS[view][0]} ({counts[view]})</b> — صفحة {page + 1}"]
    keyboard = []
    for t in records:
        stage = stage_of(t.status)
        over = ' 🔴' if is_overdue(t) else ''
        due = t.due_date.strftime('%Y-%m-%d') if t.due_date else 'غير محدد'
        lines.append(f"{STAGE_EMOJI.get(stage, '▫️')} <code>{task_ref(t)}</code> {html.escape(t.title[:60])}\n"
                     f"   {STAGE_LABELS_AR.get(stage, t.status)}{over} | الأولوية: {html.escape(t.priority)} | الاستحقاق: {due}")
        keyboard.append([{'text': f"{STAGE_EMOJI.get(stage, '▫️')} {t.title[:40]}", 'callback_data': f'act:info:{t.id}'}])
    if not records:
        lines.append('لا توجد مهام في هذا العرض.')
    pager = []
    if page:
        pager.append({'text': '⬅️ السابق', 'callback_data': f'cmd:my_tasks:{view}:{page - 1}'})
    if more:
        pager.append({'text': 'التالي ➡️', 'callback_data': f'cmd:my_tasks:{view}:{page + 1}'})
    if pager:
        keyboard.append(pager)
    others = [k for k in TASK_VIEWS if k != view]
    chips = [{'text': f"{TASK_VIEWS[k][0]} ({counts[k]})", 'callback_data': f'cmd:my_tasks:{k}'} for k in others]
    keyboard += [chips[i:i + 2] for i in range(0, len(chips), 2)]
    keyboard.append([{'text': '🏠 القائمة الرئيسية', 'callback_data': 'cmd:main_menu'}])
    return {'success': True, 'status': 'Success', 'message': '\n'.join(lines), 'view': view, 'counts': counts,
            'tasks': [{'id': str(r.id), 'title': r.title, 'status': r.status, 'stage': stage_of(r.status)} for r in records],
            'reply_markup': {'inline_keyboard': keyboard}}
