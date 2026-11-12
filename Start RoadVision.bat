@echo off
title RoadVision Launcher

set "PROJECT_DIR=%~dp0"
set "BACKEND_DIR=%PROJECT_DIR%backend"
set "PYTHON_EXE=%BACKEND_DIR%\venv\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
    echo ERROR: RoadVision virtual environment not found.
    pause
    exit /b 1
)

echo Starting RoadVision Backend...
start "RoadVision Backend" cmd /k "cd /d ""%BACKEND_DIR%"" && ""%PYTHON_EXE%"" app.py"

echo Starting RoadVision Frontend...
start "RoadVision Frontend" cmd /k "cd /d ""%PROJECT_DIR%"" && ""%PYTHON_EXE%"" -m http.server 5500"

timeout /t 3 /nobreak >nul

echo Opening RoadVision in browser...
start "" "http://127.0.0.1:5500"

exit /b
