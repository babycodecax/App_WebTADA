@echo off
chcp 65001 >nul
title TADA - Start Server
cd /d "%~dp0backend"

echo ============================================
echo   TADA Chatbox - Bat dau server
echo ============================================
echo.
echo [1/2] Kiem tra server cu...
tasklist /fi "WindowTitle eq Obsidian Chatbot*" 2>nul | find "python" >nul
if not errorlevel 1 (
    echo   Dang tat server cu...
    taskkill /fi "WindowTitle eq Obsidian Chatbot*" /f >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo [2/2] Mo http://localhost:8000 ...
echo.
echo   Mo trinh duyet: http://localhost:8000
echo   Stop server: Ctrl+C
echo ============================================

start http://localhost:8000
call .venv\Scripts\activate.bat
python main.py
if errorlevel 1 (
    pause
)
