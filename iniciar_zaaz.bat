@echo off
title Zaaz Seguimiento
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (set "PY=py") else (set "PY=python")

start "Zaaz - Servidor de datos" /min cmd /k %PY% servidor.py
start "Zaaz - Pagina web" /min cmd /k %PY% -m http.server 8000

rem Espera a que los servidores arranquen
timeout /t 4 /nobreak >nul

set "URL=http://localhost:8000/index.html"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" goto abrir
set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" goto abrir
set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" goto abrir
start "" "%URL%"
goto fin

:abrir
start "" "%CHROME%" "%URL%"

:fin
exit
