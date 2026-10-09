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

echo [3/3] Pornim StudyX...
call npm run electron:dev

if %errorlevel% neq 0 (
    echo.
    echo Eroare la pornire.
    pause
)
