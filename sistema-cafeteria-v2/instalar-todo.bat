@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "DESTINO=D:\MORA PROYECTO\PROYECTO NUEVO MORA\sistema-cafeteria"

echo ================================================================
echo   Instalador de Cafeteria - Sistema de Caja
echo ================================================================
echo.
echo Carpeta destino: %DESTINO%
echo.

REM 1) Crea la carpeta destino si no existe (y las carpetas padre tambien)
if not exist "%DESTINO%" (
  echo La carpeta no existe. Creandola...
  mkdir "%DESTINO%"
)

REM 2) Copia todos los archivos del proyecto hacia el destino
REM    (si ya existen, los reemplaza; no borra node_modules si ya estaba instalado)
set "ORIGEN=%~dp0"
if /i "%ORIGEN%"=="%DESTINO%\" (
  echo Ya estas parado en la carpeta destino, no hace falta copiar nada.
) else (
  echo Copiando archivos del proyecto...
  xcopy /E /I /Y /EXCLUDE:excluir.txt "%ORIGEN%*" "%DESTINO%\" >nul
  echo Archivos copiados.
)
echo.

REM 3) Verifica Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js en tu computadora.
  echo Descargalo desde https://nodejs.org e instalalo, luego vuelve
  echo a hacer doble clic en este archivo.
  pause
  exit /b 1
)

REM 4) Entra al destino e instala dependencias si hace falta
cd /d "%DESTINO%"
if not exist node_modules (
  echo Instalando dependencias, un momento...
  call npm install
)

echo.
echo Iniciando el servidor...
start "Cafeteria - Servidor" /min cmd /c "npm run dev"

timeout /t 6 /nobreak >nul
start http://localhost:5173

echo.
echo Listo. La app deberia abrirse en tu navegador.
pause
