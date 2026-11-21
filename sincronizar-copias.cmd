@echo off
rem Doble clic para copiar el sistema desde la carpeta principal a la copia.
rem Cada una conserva su propio config.js (su propia base de datos).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sincronizar-copias.ps1"
echo.
pause
