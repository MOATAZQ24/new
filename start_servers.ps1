Write-Host "Starting Investor Gate IT Operations Platform..." -ForegroundColor Green

Start-Process python -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload" -WorkingDirectory "$PSScriptRoot\backend"
Start-Sleep -Seconds 3

Start-Process node -ArgumentList "node_modules/next/dist/bin/next dev -p 3000" -WorkingDirectory "$PSScriptRoot\frontend"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "Investor Gate Platform is running!" -ForegroundColor Cyan
Write-Host "Frontend Web App: http://localhost:3000" -ForegroundColor Yellow
Write-Host "Backend API Docs: http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host "Default Login: admin / Admin@12345" -ForegroundColor Yellow
Write-Host "===================================================" -ForegroundColor Cyan
