@echo off
echo Starting Investor Gate IT Operations Platform...

start "InvestorGate-Backend" cmd /k "cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 3 /nobreak >nul

start "InvestorGate-Frontend" cmd /k "cd frontend && node node_modules/next/dist/bin/next dev -p 3000"

echo ===================================================
echo Investor Gate Platform is running!
echo Frontend Web App: http://localhost:3000
echo Backend API Docs: http://localhost:8000/docs
echo ===================================================
