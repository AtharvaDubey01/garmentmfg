@echo off
rem Make your own GarmentMFGSetup.exe (the Windows installer). Double-click this file.
title Make the GarmentMFG installer
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed on this PC.
  echo   Install the LTS version from https://nodejs.org ^(just click Next^), then double-click MAKE-EXE.cmd again.
  echo.
  pause
  exit /b 1
)
node packaging\make-exe.mjs
set RESULT=%ERRORLEVEL%
echo.
if "%RESULT%"=="0" (
  echo   Opening the my-exe folder...
  start "" explorer "%~dp0my-exe"
)
pause
exit /b %RESULT%
