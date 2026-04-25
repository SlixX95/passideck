@echo off
REM TermDeck Installer for Windows
REM Creates a Start Menu shortcut and desktop shortcut

setlocal enabledelayedexpansion

set "TERMDECK_DIR=%~dp0"
set "APP_NAME=TermDeck"

echo.
echo   TermDeck Installer (Windows)
echo   ============================
echo.

REM Step 1: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo   ERROR: Node.js not found. Install from https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM Step 2: Install dependencies
if not exist "%TERMDECK_DIR%node_modules" (
    echo   [1/3] Installing dependencies...
    cd /d "%TERMDECK_DIR%" && npm install
) else (
    echo   [1/3] Dependencies already installed
)

REM Step 3: Create config directory
if not exist "%USERPROFILE%\.termdeck" (
    mkdir "%USERPROFILE%\.termdeck"
)
if not exist "%USERPROFILE%\.termdeck\config.yaml" (
    copy "%TERMDECK_DIR%config\config.example.yaml" "%USERPROFILE%\.termdeck\config.yaml" >nul
    echo   [2/3] Config created at %%USERPROFILE%%\.termdeck\config.yaml
) else (
    echo   [2/3] Config already exists
)

REM Step 4: Create Start Menu shortcut
set "SHORTCUT_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs"
set "DESKTOP_DIR=%USERPROFILE%\Desktop"

REM Create VBS script to make shortcuts (Windows doesn't have ln for .lnk files)
set "VBS_FILE=%TEMP%\termdeck_shortcut.vbs"
(
    echo Set WshShell = WScript.CreateObject("WScript.Shell"^)
    echo Set lnk = WshShell.CreateShortcut("%SHORTCUT_DIR%\%APP_NAME%.lnk"^)
    echo lnk.TargetPath = "cmd.exe"
    echo lnk.Arguments = "/c cd /d ""%TERMDECK_DIR%"" && node packages\cli\src\index.js"
    echo lnk.WorkingDirectory = "%TERMDECK_DIR%"
    echo lnk.Description = "TermDeck - Web-based terminal multiplexer"
    echo lnk.WindowStyle = 7
    echo lnk.Save
    echo Set lnk2 = WshShell.CreateShortcut("%DESKTOP_DIR%\%APP_NAME%.lnk"^)
    echo lnk2.TargetPath = "cmd.exe"
    echo lnk2.Arguments = "/c cd /d ""%TERMDECK_DIR%"" && node packages\cli\src\index.js"
    echo lnk2.WorkingDirectory = "%TERMDECK_DIR%"
    echo lnk2.Description = "TermDeck - Web-based terminal multiplexer"
    echo lnk2.WindowStyle = 7
    echo lnk2.Save
) > "%VBS_FILE%"
cscript //nologo "%VBS_FILE%"
del "%VBS_FILE%"

echo   [3/3] Shortcuts created (Start Menu + Desktop)
echo.
echo   Done! You can now:
echo.
echo     1. Double-click TermDeck on your Desktop
echo     2. Find it in the Start Menu
echo     3. Or run: npm run dev
echo.
pause
