@echo off
title Sahayak AI — Full Stack Launcher
echo.
echo  =========================================
echo    Sahayak AI — Starting Backend + Frontend
echo  =========================================
echo.

:: ── Backend ────────────────────────────────────────────────────────────────
echo  [1/2] Starting backend on http://localhost:8000 ...
cd /d "%~dp0sahayak"

if not exist ".venv\Scripts\activate.bat" (
    echo  Creating virtual environment...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    pip install -r requirements.txt
) else (
    call .venv\Scripts\activate.bat
)

start "Sahayak Backend" cmd /k "python -m uvicorn main:app --host 0.0.0.0 --port 8000 && pause"

:: Wait for backend to be ready
echo  Waiting for backend to start...
:wait
ping -n 2 127.0.0.1 >nul
curl -s http://localhost:8000/health --max-time 2 >nul 2>&1
if errorlevel 1 goto wait
echo  Backend is ready!

:: ── Frontend ────────────────────────────────────────────────────────────────
echo.
echo  [2/2] Starting frontend on http://localhost:5173 ...
cd /d "%~dp0sahayak-frontend"
start "Sahayak Frontend" cmd /k "npm run dev && pause"

echo.
echo  =========================================
echo   Both services are running!
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo  =========================================
echo.
pause
