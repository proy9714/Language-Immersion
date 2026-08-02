@echo off
title German Immersion Tracker
cd /d "%~dp0"
start "" http://localhost:4545
node server.js
pause
