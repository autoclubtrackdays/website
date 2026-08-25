@echo off
rem Acceso directo para abrir el panel. Copiar al escritorio.
rem Al cerrar esta ventana se apaga el panel.
cd /d "%~dp0..\.."
start "" http://localhost:4322
call npm run admin
