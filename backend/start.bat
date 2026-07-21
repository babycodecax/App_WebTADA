@echo off
cd /d "%~dp0"
title Obsidian Chatbot
echo ============================================
echo  Obsidian RAG Chatbox - FastAPI Server
echo ============================================

:: === CONFIG ===
set VENV_DIR=.venv
set PYTHON=C:\Users\ADMIN\AppData\Local\Programs\Python\Python312\python.exe
set MAIN=main.py
set HOST=0.0.0.0
set PORT=8000

:: === 1. Create venv if not exists ===
if not exist "%VENV_DIR%\Scripts\python.exe" (
    echo [1/3] Tao virtualenv ...
    "%PYTHON%" -m venv %VENV_DIR%
    if errorlevel 1 (
        echo LOI: Khong tao duoc venv. Hay kiem tra Python.
        pause
        exit /b 1
    )
)

:: === 2. Activate + check dependencies ===
echo [2/3] Kiem tra dependencies ...
call "%VENV_DIR%\Scripts\activate.bat"
pip install -q -r "%~dp0requirements.txt"
if errorlevel 1 (
    echo LOI: Cai dat dependencies that bai.
    pause
    exit /b 1
)

:: === 3. Run server ===
echo [3/3] Khoi dong server tai http://%HOST%:%PORT%
echo.
echo    Che do: %CONFIG_MODE:DEBUG=production%
echo    Stop: Ctrl+C
echo ============================================
echo.

python "%MAIN%"
if errorlevel 1 (
    echo Server da dung.
    pause
)