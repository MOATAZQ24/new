from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / 'backend/app/services/telegram_service.py'
s = p.read_text(encoding='utf-8')
start = s.index('        # Check Telegram panel allowed modules', s.index('    def can_access_module'))
end = s.index('\n\ndef ensure_employee_user_account', start)
s = s[:start] + s[end:]
# Never infer an elevated CRM role from an employee's free-text job title.
start = s.index('        job = (employee.job_title')
end = s.index('        role = db.query(Role)', start)
s = s[:start] + '        target_role_name = "Employee"\n' + s[end:]
p.write_text(s, encoding='utf-8')

p = root / 'backend/app/api/v1/endpoints/telegram.py'
s = p.read_text(encoding='utf-8')
start = s.index('    roles = []', s.index('def get_crm_max_permitted_modules'))
end = s.index('\n\n@router.get("/links/{employee_id}/details")', start)
s = s[:start] + s[end:]
start = s.index('    client_ip = request.client.host', s.index('async def telegram_webhook'))
end = s.index('# ── No-Code Telegram Bot Menu Builder', start)
s = s[:start] + '\n\n' + s[end:]
p.write_text(s, encoding='utf-8')

p = root / 'frontend/src/components/telegram/TelegramLinkingModal.tsx'
s = p.read_text(encoding='utf-8')
start = s.index('          <div className="space-y-4">', s.index('activeTab === "permissions" && details'))
end = s.index('        {/* ── TAB 3:', start)
s = s[:start] + '''          <TelegramActionPermissions employeeId={employeeId} companyId={companyId} details={details} />
        )}

''' + s[end:]
p.write_text(s, encoding='utf-8')
