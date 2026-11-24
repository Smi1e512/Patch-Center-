@echo off
setlocal
cd /d "%~dp0"
python "%~dp0scripts\manage.py" start %*
if errorlevel 1 (
    echo.
    echo PatchCenter failed to start. Check the message above.
    pause
    exit /b 1
)
exit /b 0
