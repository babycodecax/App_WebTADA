@echo off
chcp 65001 >nul
cd /d "D:\CodeApp\Projects\App_WebTADA"

set "CLAUDE_EXE=C:\Users\ADMIN\AppData\Local\Microsoft\WinGet\Packages\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\claude.exe"

:: Kiem tra proxy local truoc khi chay
echo [Check] Kiem tra proxy localhost:20128...
curl -s -o nul -w "%%{http_code}%%" http://localhost:20128/v1/models > %TEMP%\claude_proxy_check.txt 2>&1
set /p PROXY_STATUS=<%TEMP%\claude_proxy_check.txt
if "%PROXY_STATUS%"=="" set PROXY_STATUS=000
del %TEMP%\claude_proxy_check.txt 2>nul

if "%PROXY_STATUS%"=="000" (
    echo [WARN] Proxy localhost:20128 KHONG phan hoi!
    echo [WARN] Claude se dung model mac dinh (khong qua proxy).
    echo ---
    start "Claude Code" cmd /c ""%CLAUDE_EXE%" %*"
) else (
    echo [OK] Proxy localhost:20128 dap ung (HTTP %PROXY_STATUS%)
    echo [Info] Dang khoi dong Claude via proxy...
    echo ---
    set ANTHROPIC_BASE_URL=http://localhost:20128/v1
    set ANTHROPIC_API_KEY=sk-0f08089bbe7bdf07-7vzxxt-ba217387
    set ANTHROPIC_MODEL=Test
    start "Claude Code" cmd /c ""%CLAUDE_EXE%" %*"
)