@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 goto no_node
for /f %%v in ('node -p "Number(process.versions.node.split('.')[0])"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 24 goto old_node
start "Tennis GO server" /D "%~dp0" cmd /k node server.mjs
echo Waiting for server...
powershell -NoProfile -Command "$u='http://localhost:3000/api/config'; for($i=0; $i -lt 30; $i++){try{$r=Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 1; if($r.StatusCode -eq 200){exit 0}}catch{}; Start-Sleep -Milliseconds 500}; exit 1"
if errorlevel 1 goto failed
start "" "http://localhost:3000"
echo Tennis GO is open at http://localhost:3000
exit /b 0
:no_node
echo Node.js 24 or newer is required for the server version.
echo Opening offline demo instead.
start "" "%~dp0OPEN_DEMO.html"
pause
exit /b 1
:old_node
echo Node.js 24 or newer is required. Current version:
node --version
echo Opening offline demo instead.
start "" "%~dp0OPEN_DEMO.html"
pause
exit /b 1
:failed
echo Server did not start. Check the Tennis GO server window for an error.
echo Opening offline demo instead.
start "" "%~dp0OPEN_DEMO.html"
pause
exit /b 1
