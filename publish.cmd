@echo off
REM ============================================================
REM  Shubh Quotation - one-click publish to GitHub
REM  Double-click this file (or run: publish.cmd) to put your
REM  latest changes online. It first repairs any broken symbols
REM  (like the micro sign) so the website never shows garbled text.
REM ============================================================
cd /d "%~dp0"

echo.
echo [1/3] Cleaning up special characters in the catalog...
python tools\fix_encoding.py
if errorlevel 1 (
  echo.
  echo Stopped: the catalog could not be cleaned. Nothing was pushed.
  pause
  exit /b 1
)

echo.
echo [2/3] Saving your changes...
git add -A
git commit -m "Update %DATE% %TIME%"

echo.
echo [3/3] Uploading to GitHub...
git push origin main
if errorlevel 1 (
  echo.
  echo Push failed. Check your internet connection and try again.
  pause
  exit /b 1
)

echo.
echo Done! Your changes are live. Hard-refresh the app (Ctrl+Shift+R) to see them.
pause
