# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

from pathlib import Path
import re
p=Path(__file__).resolve().parents[1]/'frontend/src/app/tasks/page.tsx'
s=p.read_text(encoding='utf-8').replace('SearchIcon, FilterIcon,','SearchIcon,')
s=s.replace('catch (err: any)', 'catch (err: unknown)')
s=re.sub(r'(set(?:ResendMessage|CreateError|ActionError))\(err[^;\n]+\|\| ("[^"\n]+")\);', r'\1(err instanceof Error ? err.message : \2);', s)
s=s.replace('    loadTasks();\n  }, [loadTasks, currentCompany]);', '    const timer = window.setTimeout(() => { void loadTasks(); }, 0);\n    return () => window.clearTimeout(timer);\n  }, [loadTasks, currentCompany]);')
s=s.replace('    loadDependencies();\n  }, [loadDependencies, currentCompany]);', '    const timer = window.setTimeout(() => { void loadDependencies(); }, 0);\n    return () => window.clearTimeout(timer);\n  }, [loadDependencies, currentCompany]);')
p.write_text(s,encoding='utf-8')
