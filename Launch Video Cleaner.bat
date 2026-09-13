@echo off
cd /d "%~dp0"
where pythonw >nul 2>nul
if %ERRORLEVEL% equ 0 (
    start "" pythonw launcher.py
) else (
    start "" python launcher.py
)
