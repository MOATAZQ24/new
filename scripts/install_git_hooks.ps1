# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================
<#
.SYNOPSIS
    Installs local Git hooks for IGOS-DAPF governance enforcement.
#>

$root = Split-Path $PSScriptRoot -Parent
Write-Host "[*] Configuring Git core.hooksPath to .githooks..." -ForegroundColor Cyan

git config core.hooksPath .githooks
if ($LASTEXITCODE -eq 0) {
    Write-Host "[+] Local pre-commit attribution hook successfully activated!" -ForegroundColor Green
} else {
    Write-Host "[!] Failed to configure git hooks path." -ForegroundColor Red
}
