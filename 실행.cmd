@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or later is required. https://nodejs.org
  pause
  exit /b 1
)
start "" "http://localhost:4317"
node server.mjs
pause
