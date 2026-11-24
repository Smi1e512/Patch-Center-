@echo off
setlocal
cd /d "%~dp0"
python "%~dp0scripts\manage.py" stop
if errorlevel 1 (
    echo.
    pause
    exit /b 1
)
exit /b 0
