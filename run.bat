@echo off
chcp 65001 >nul
node "%~dp0cli.mjs" %*
if errorlevel 1 pause