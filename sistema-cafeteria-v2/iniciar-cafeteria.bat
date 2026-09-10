@echo off
setlocal
cd /d "%~dp0"

REM Inicia el servidor de la app en segundo plano
start "Cafeteria - Servidor" /min cmd /c "npm run dev"

REM Espera unos segundos a que el servidor arranque
timeout /t 6 /nobreak >nul

REM Abre el navegador en la pantalla de la app
start http://localhost:5173
