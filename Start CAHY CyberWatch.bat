@echo off
rem Double-click to start CAHY CyberWatch (brings the window forward if it is already running).
cd /d "%~dp0"
start "" /min cmd /c "npm start"
