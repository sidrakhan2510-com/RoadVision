@echo off
title RoadVision Startup

cd /d "%~dp0"

echo Starting RoadVision Flask Server...

venv\Scripts\python.exe app.py

pause