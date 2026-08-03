@echo off
REM Scheduled leftover-and-sweep run for the Seanime migration track.
REM
REM INTERACTIVE ON PURPOSE: opens a visible console running claude with the brief as its first
REM message and STAYS interactive, so the run can be watched and steered. A `-p` run cannot be.
REM
REM Runs LOCALLY: the work is ~1,200 uncommitted paths and the sweep drives the packaged Electron
REM app in out\ over CDP. Neither exists in a cloud sandbox.
REM
REM COORDINATOR = claude-primary. Workers = claude-x and claude-backup, dispatched BY the brief.
REM Never dispatch to the account you are running on -- it competes for your own quota.
REM
REM JP_SWEEP_ACTIVE arms the Stop hook in .claude/settings.local.json, which blocks the run from
REM stopping until it creates the completion sentinel. Normal interactive sessions never set this
REM variable, so the hook is inert for them.
setlocal
set CLAUDE_CONFIG_DIR=C:\Users\Arseniy\.claude-primary
set JP_SWEEP_ACTIVE=1
REM Clear any sentinel/counter left by a previous run, or the hook releases immediately.
del /f /q "%TEMP%\jp-sweep-complete.flag" >nul 2>&1
del /f /q "%TEMP%\jp-sweep-blocks.count" >nul 2>&1
cd /d C:\Users\Arseniy\Projects\jp-study-app
start "jp-study migration sweep" cmd /k claude "Read docs/migration/SCHEDULED_SWEEP_BRIEF.md in this repository and carry it out in full, exactly as written. Work autonomously; I may or may not be watching."
endlocal
