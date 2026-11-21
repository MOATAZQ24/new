# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

Write-Host "==============================================================" -ForegroundColor Green
Write-Host "STARTING INVESTOR GATE OS: TELEGRAM BOT LONG-POLLING DAEMON" -ForegroundColor Green
Write-Host "==============================================================" -ForegroundColor Green
Set-Location "$PSScriptRoot\..\backend"
python app\workers\telegram_poller.py
