@echo off
setlocal

set "ROOT=%~dp0"
set "PORT=3001"
set "URL=http://127.0.0.1:%PORT%"
set "SERVER=%ROOT%scripts\mobile-preview-server.js"
set "OUT=%ROOT%mobile-preview.out.log"
set "ERR=%ROOT%mobile-preview.err.log"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install dependencies first.
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing '%URL%' -TimeoutSec 2; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "AHU Report Local Preview" /min cmd /c "cd /d "%ROOT%" && node "%SERVER%" %PORT% > "%OUT%" 2> "%ERR%""
  timeout /t 5 /nobreak >nul
)

start "" "%URL%"
endlocal
