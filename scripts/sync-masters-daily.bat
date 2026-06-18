@echo off
REM Windows Task Scheduler helper — run daily master sync from Fabric OneLake.
REM Example: schedule at 03:30 daily pointing to this .bat file.
cd /d "%~dp0.."
call npm run sync:masters >> logs\sync-masters.log 2>&1
