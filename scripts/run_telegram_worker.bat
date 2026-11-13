@echo off
echo ==============================================================
echo STARTING INVESTOR GATE OS: TELEGRAM BOT LONG-POLLING DAEMON
echo ==============================================================
cd /d "%~dp0\..\backend"
python app\workers\telegram_poller.py
pause
