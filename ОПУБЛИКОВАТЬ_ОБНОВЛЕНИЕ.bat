@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\publish-github.ps1"
if errorlevel 1 goto :error
echo Обновление опубликовано в GitHub.
pause
exit /b 0
:error
echo Публикация не завершена. Сообщение об ошибке выше.
pause
exit /b 1
