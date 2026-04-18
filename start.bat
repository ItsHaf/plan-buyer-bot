@echo off
echo.
echo ==========================================
echo     Plan Buyer Bot - Quick Start
echo ==========================================
echo.
echo  WARNING: This bot requires Chrome with remote debugging!
echo  Make sure Chrome is running with: --remote-debugging-port=9222
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [1/4] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
) else (
    echo [1/4] Dependencies already installed
)

echo.
echo [2/4] Choose your strategy:
echo.
echo 1. Pre-position (recommended if you can be on the site early)
echo    - Opens tabs and waits on the page before the rush
echo    - Lower risk of getting kicked out
echo.
echo 2. Refresh Spam (for hot drops with instant sellout)
echo    - Continuously refreshes all tabs
echo    - Higher success rate but risk of rate limiting
echo.
echo 3. Hybrid (recommended for most scenarios)
echo    - Starts with pre-position, then switches to refresh
echo.

set /p strategy="Enter choice (1-3): "

if "%strategy%"=="1" set STRATEGY=pre-position
if "%strategy%"=="2" set STRATEGY=refresh-spam
if "%strategy%"=="3" set STRATEGY=hybrid

if not defined STRATEGY (
    echo Invalid choice, using hybrid strategy
    set STRATEGY=hybrid
)

echo.
echo [3/4] How many tabs? (10-20 recommended, more = higher success but more resource usage)
set /p tabs="Enter number of tabs (default: 15): "

if "%tabs%"=="" set tabs=15

echo.
echo [4/4] Choose plan tier:
echo   1. Lite
echo   2. Pro
echo   3. Max (default)
set /p plan="Enter choice (1-3): "

if "%plan%"=="1" set PLAN=lite
if "%plan%"=="2" set PLAN=pro
if "%plan%"=="3" set PLAN=max
if not defined PLAN set PLAN=max

echo.
echo ==========================================
echo     Configuration Summary
echo ==========================================
echo Strategy: %STRATEGY%
echo Tabs: %tabs%
echo Plan: %PLAN%
echo.
echo IMPORTANT: Make sure you're already logged in to the target site!
echo.
pause

echo.
echo Starting Plan Buyer Bot...
echo Press Ctrl+C to stop at any time
echo.

npx tsx src/index.ts --tabs=%tabs% --strategy=%STRATEGY% --plan=%PLAN%

echo.
echo Bot stopped.
pause
