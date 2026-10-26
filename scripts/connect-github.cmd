@echo off
setlocal
cd /d "%~dp0.."

echo Checking Git...
git --version
if errorlevel 1 (
    echo Git was not found. Install Git for Windows from https://git-scm.com/download/win
    pause
    exit /b 1
)

echo.
echo GitHub sign-in: follow the URL and enter the one-time code shown below.
echo Complete sign-in in your browser. Do not share your password or access token.
echo.
git credential-manager github login --device
if errorlevel 1 (
    echo.
    echo GitHub sign-in did not complete. Check the message above.
    echo Run this file from your normal Windows account, outside the Codex terminal.
    pause
    exit /b 1
)

echo.
echo Accounts available to Git Credential Manager:
git credential-manager github list
if errorlevel 1 (
    echo Account verification failed. See the message above.
    pause
    exit /b 1
)
echo.
echo GitHub authentication completed. Return to the project conversation to continue.
pause
