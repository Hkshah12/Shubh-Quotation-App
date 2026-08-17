@echo off
title Shubh Enterprise - Quotation Generator
cd /d "%~dp0"
echo Starting Shubh Enterprise Quotation Generator...
echo Keep this window open while using the app. Close it to stop.
echo.
start "" http://localhost:4321
node server.js
pause
