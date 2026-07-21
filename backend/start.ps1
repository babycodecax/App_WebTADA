#Requires -Version 5.1
<#
.SYNOPSIS
    Obsidian RAG Chatbox - Khoi dong nhanh FastAPI server
#>
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not $ProjectRoot) { $ProjectRoot = $PWD.Path }

$VenvDir   = Join-Path $ProjectRoot ".venv"
$Python    = "C:\Users\ADMIN\AppData\Local\Programs\Python\Python312\python.exe"
$MainFile  = Join-Path $ProjectRoot "main.py"
$HostAddr  = "0.0.0.0"
$Port      = 8000

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Obsidian RAG Chatbox - FastAPI Server" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# 1. Tao venv neu chua co
if (-not (Test-Path "$VenvDir\Scripts\python.exe")) {
    Write-Host "[1/3] Tao virtualenv ..." -ForegroundColor Yellow
    & $Python -m venv $VenvDir
    if (-not $?) { throw "Khong tao duoc venv" }
}

# 2. Cai dependencies
Write-Host "[2/3] Kiem tra dependencies ..." -ForegroundColor Yellow
& "$VenvDir\Scripts\Activate.ps1"
pip install -q -r "$ProjectRoot\requirements.txt"
if (-not $?) { throw "Cai dat dependencies that bai" }

# 3. Chay server
Write-Host "[3/3] Khoi dong server tai http://$($HostAddr):$($Port)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Stop: Ctrl+C" -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

python $MainFile
if (-not $?) {
    Write-Host "`nServer da dung." -ForegroundColor Red
    Read-Host "Nhan Enter de thoat"
}