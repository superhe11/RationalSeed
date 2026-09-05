@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\prepare-update.ps1"
if errorlevel 1 goto :error
echo Обновление подготовлено. Теперь нужно опубликовать сайт обновлений.
pause
exit /b 0
:error
echo Не удалось подготовить обновление. Подробности выше.
pause
exit /b 1
