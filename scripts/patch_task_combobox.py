# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

from pathlib import Path
p = Path(__file__).resolve().parents[1] / 'frontend/src/app/tasks/page.tsx'
s = p.read_text(encoding='utf-8')
start = s.index('                <label className="block text-xs font-medium text-gray-700 mb-1">الموظف / الفني المسند إليه</label>')
end = s.index('                {/* Live Telegram Connection', start)
s = s[:start] + '''                <EmployeeCombobox
                  value={formData.assigned_to_id}
                  initialName={editingTask?.assigned_to_name}
                  companyId={currentCompany?.id}
                  onChange={(employee) => {
                    setSelectedEmployee(employee);
                    setFormData(current => ({ ...current, assigned_to_id: employee?.id || "", notify_telegram: employee?.is_telegram_linked ?? true }));
                  }}
                />

''' + s[end:]
s = s.replace('const selectedEmp = employees.find((e) => e.id === formData.assigned_to_id);', 'const selectedEmp = selectedEmployee;')
p.write_text(s, encoding='utf-8')
