@echo off
rem Keep this file plain ASCII: cmd mis-parses multibyte text after chcp 65001, at random.
rem Workshop 2 only, on its own port (8001). start-w1.bat is this same file with --workshop 1.
pushd "%~dp0"
title DODO Workshop 2 - keep this window open

where uv >nul 2>nul
if errorlevel 1 set "PATH=%USERPROFILE%\.local\bin;%PATH%"
where uv >nul 2>nul
if errorlevel 1 (
  echo uv was not found. Install it first ^(README, step 1^), then open this file again.
  pause
  popd
  exit /b 1
)

echo DODO Workshop is starting. The first run downloads packages and takes a few minutes.
echo Keep this window open during class.
echo If the browser does not open by itself, paste the http://127.0.0.1 address shown below into Chrome or Edge.
echo.
uv run python app.py serve --workshop 2 %*
echo.
echo The server has stopped. Press any key to close this window.
pause >nul
popd
