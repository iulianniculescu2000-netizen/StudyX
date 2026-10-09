@echo off
setlocal enabledelayedexpansion
title StudyX - Dev Mode
cd /d "%~dp0"

echo [1/4] Verificam Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo EROARE: Node.js nu este in PATH.
    pause
    exit /b 1
)

echo [2/4] Verificam dependintele...
if not exist node_modules (
    echo Instalam modulele necesare (te rog asteapta)...
    call npm install
)

echo [3/4] Eliberam portul 5173...
REM Inchidem procesele care blocheaza portul 5173
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a /T 2>nul
)
taskkill /F /IM electron.exe /T 2>nul
taskkill /F /IM "StudyX.exe" /T 2>nul

echo [4/4] Pornim StudyX...
echo ^> Se lanseaza mediul de dezvoltare...
call npm run electron:dev

if %errorlevel% neq 0 (
    echo.
    echo Aplicatia s-a oprit neasteptat (cod: %errorlevel%).
    pause
)
