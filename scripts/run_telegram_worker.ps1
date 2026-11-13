Write-Host "==============================================================" -ForegroundColor Green
Write-Host "STARTING INVESTOR GATE OS: TELEGRAM BOT LONG-POLLING DAEMON" -ForegroundColor Green
Write-Host "==============================================================" -ForegroundColor Green
Set-Location "$PSScriptRoot\..\backend"
python app\workers\telegram_poller.py
