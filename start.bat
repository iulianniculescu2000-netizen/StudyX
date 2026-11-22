@echo off
setlocal enabledelayedexpansion
title StudyX - Pornire
cd /d "%~dp0"

echo [1/3] Verificam Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo EROARE: Instaleaza Node.js!
    pause
    exit /b 1
)

echo [2/3] Eliberam resursele...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a /T 2>nul
)
taskkill /F /IM electron.exe /T 2>nul

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "SX_BRANCH=%%b"
for /f "delims=" %%c in ('git log -1 --format^=%%h_%%cs 2^>nul') do set "SX_COMMIT=%%c"
echo     Cod: %CD%  ramura !SX_BRANCH!  ultima modificare !SX_COMMIT!
echo [3/3] Pornim StudyX...
call npm run electron:dev

if %errorlevel% neq 0 (
    echo.
    echo Eroare la pornire.
    pause
)
