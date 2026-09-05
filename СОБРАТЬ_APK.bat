@echo off
setlocal
chcp 65001 >nul
title Сборка Android APK — Рациональное зерно
cd /d "%~dp0"

if not exist "node_modules\@capacitor\cli" (
  echo Устанавливаю компоненты сборки...
  call npm install
  if errorlevel 1 goto :error
)

set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"

echo Собираю Android-приложение...
call npm run android:apk
if errorlevel 1 goto :error

copy /y "android\app\build\outputs\apk\release\app-release.apk" "Рациональное_зерно.apk" >nul
if errorlevel 1 goto :error

echo.
echo Готово: %CD%\Рациональное_зерно.apk
pause
exit /b 0

:error
echo.
echo Не удалось собрать APK. Сообщение об ошибке находится выше.
pause
exit /b 1
