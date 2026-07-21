@echo off
chcp 65001 >nul
title App_WebTADA — Khởi động nhanh
cd /d "D:\CodeApp\Projects\App_WebTADA"
echo ============================================
echo   App_WebTADA — Chatbot Thue/Ke toan
echo ============================================
echo.
echo  [1] Mo Claude Code (lam viec chung)
echo  [2] Chay backend FastAPI + Claude Code
echo  [q] Thoat
echo.
set /p choice="Chon (1-2, q): "

if /i "%choice%"=="q" exit /b

if "%choice%"=="1" (
    start claude
    goto :eof
)

if "%choice%"=="2" (
    echo [1/2] Khoi dong FastAPI server...
    start "RAG Server" cmd /c "cd /d D:\CodeApp\Projects\App_WebTADA\backend && .venv\Scripts\activate.bat && python main.py"
    echo [2/2] Mo Claude Code...
    timeout /t 3 /nobreak >nul
    start claude
    goto :eof
)

echo Lua chon khong hop le.
pause
