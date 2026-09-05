@echo off
setlocal
cd /d "%~dp0"

set "NOVEL_URL=http://127.0.0.1:38741/"

powershell.exe -NoProfile -Command "$urls=@('%NOVEL_URL%','http://127.0.0.1:3000/'); foreach($u in $urls){try{$r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 $u;if($r.StatusCode -eq 200 -and $r.Content -match 'title-screen'){Start-Process $u;exit 0}}catch{}};exit 1"
if not errorlevel 1 exit /b 0

where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  echo Install it from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vinext.cmd" (
  echo First launch: installing local components...
  call npm.cmd install
  if errorlevel 1 (
    echo Installation failed. Check the internet connection and run this file again.
    pause
    exit /b 1
  )
)

if not exist "dist\server\index.js" (
  echo Building the novel...
  call npm.cmd run build
  if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
  )
)

start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "$u='%NOVEL_URL%';for($i=0;$i -lt 120;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 $u;if($r.StatusCode -eq 200){Start-Process $u;exit}}catch{};Start-Sleep -Milliseconds 500}"

echo The novel is starting. This window keeps the local server running.
echo Close this window when you finish reading.
call ".\node_modules\.bin\vinext.cmd" start --host 127.0.0.1 --port 38741 --strictPort

