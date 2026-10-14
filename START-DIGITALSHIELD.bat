@echo off
cd /d "%~dp0"
echo Starting DigitalShield on http://localhost:3001
if not exist node_modules (
  echo Dependencies are missing. Installing them now...
  call npm install
  if errorlevel 1 pause & exit /b 1
)
call npm run dev
pause
