<#
.SYNOPSIS
    Investor Gate OS - Unified Developer Toolkit Launcher
.DESCRIPTION
    Provides a centralized CLI for managing the development environment,
    running quality gates, visual regression tests, accessibility audits,
    and security vulnerability scans.
#>

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "quality-gate", "visual-test", "a11y-audit", "security-scan", "status", "help")]
    [string]$Action = "status"
)

$root = Split-Path $PSScriptRoot -Parent
$frontendDir = Join-Path $root "frontend"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Investor Gate OS - Developer & Quality Toolkit" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

switch ($Action) {
    "status" {
        Write-Host "[*] Checking Platform & Services Status..." -ForegroundColor Yellow
        $runtime = Join-Path $root ".lan-runtime/processes.json"
        if (Test-Path $runtime) {
            $procs = Get-Content $runtime | ConvertFrom-Json
            Write-Host "[+] Managed Services:" -ForegroundColor Green
            $procs | Format-Table name, pid, started
        } else {
            Write-Host "[-] No managed daemon processes recorded in .lan-runtime" -ForegroundColor Gray
        }

        # Check API Health
        try {
            $h = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -TimeoutSec 2
            Write-Host "[+] Backend API (127.0.0.1:8000): HEALTHY ($($h.app) v$($h.version))" -ForegroundColor Green
        } catch {
            Write-Host "[-] Backend API (127.0.0.1:8000): UNREACHABLE" -ForegroundColor Red
        }

        # Check Frontend
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000" -TimeoutSec 2 -UseBasicParsing
            Write-Host "[+] Frontend Web (127.0.0.1:3000): HEALTHY (HTTP $($r.StatusCode))" -ForegroundColor Green
        } catch {
            Write-Host "[-] Frontend Web (127.0.0.1:3000): UNREACHABLE" -ForegroundColor Red
        }

        Write-Host "`nToolkit Capabilities:" -ForegroundColor Cyan
        Write-Host "  - In-Browser Visual Editor (React Grab): Ctrl + Shift + E"
        Write-Host "  - Developer Sandbox & Design Tokens: http://127.0.0.1:3000/sandbox"
        Write-Host "  - Observability Telemetry Endpoint: http://127.0.0.1:8000/api/v1/metrics"
    }

    "quality-gate" {
        Write-Host "[*] Launching Full Automated Quality Gate..." -ForegroundColor Yellow
        & (Join-Path $PSScriptRoot "quality-gate.ps1")
    }

    "visual-test" {
        Write-Host "[*] Executing Playwright Visual Regression Matrix..." -ForegroundColor Yellow
        cmd /c "cd /d $frontendDir && npx playwright test tests/visual"
    }

    "a11y-audit" {
        Write-Host "[*] Executing WCAG 2.2 AA Accessibility Audits..." -ForegroundColor Yellow
        cmd /c "cd /d $frontendDir && npx playwright test tests/a11y"
    }

    "security-scan" {
        Write-Host "[*] Running Gitleaks & OWASP ZAP DAST Security Scans..." -ForegroundColor Yellow
        python (Join-Path $root "scripts/run_gitleaks_scan.py")
        python (Join-Path $root "scripts/run_zap_audit.py")
    }

    "start" {
        Write-Host "[*] Launching Full Platform with Developer Tools..." -ForegroundColor Yellow
        & (Join-Path $PSScriptRoot "start-lan.ps1") -SkipBuild -KeepRunning
    }

    "help" {
        Write-Host "Available commands:" -ForegroundColor White
        Write-Host "  .\scripts\dev-toolkit.ps1 status         - Check services & tools status"
        Write-Host "  .\scripts\dev-toolkit.ps1 quality-gate   - Run full automated quality gate"
        Write-Host "  .\scripts\dev-toolkit.ps1 visual-test    - Run Playwright visual tests"
        Write-Host "  .\scripts\dev-toolkit.ps1 a11y-audit     - Run axe-core accessibility audit"
        Write-Host "  .\scripts\dev-toolkit.ps1 security-scan  - Run secret & DAST security scans"
        Write-Host "  .\scripts\dev-toolkit.ps1 start          - Start platform services"
    }
}
