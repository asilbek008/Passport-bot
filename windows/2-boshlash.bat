@echo off
chcp 65001 >nul
title Umra boti - ishlayapti
cd /d "%~dp0.."

rem "jim" - avtomatik ishga tushirishda beriladi: oyna ko'rinmaydi,
rem shuning uchun "pause" ko'rinmas oynada kutib qolmasligi kerak
set JIM=0
if "%1"=="jim" set JIM=1

where node >nul 2>nul
if errorlevel 1 goto yoq_node
if not exist "node_modules" goto yoq_paket
if not exist ".env" goto yoq_env

if not exist "logs" mkdir "logs"

echo.
echo ============================================
echo   UMRA BOTI ISHGA TUSHMOQDA
echo ============================================
echo.
echo To'xtatish uchun shu oynani yopasiz yoki Ctrl+C bosasiz.
echo Oyna yopiq turganda bot ISHLAMAYDI.
echo.

:qayta
node --experimental-strip-types --no-warnings=ExperimentalWarning src/index.ts
set KOD=%errorlevel%
if %KOD%==0 goto tugadi

echo.
echo ============================================
echo   BOT TO'XTADI - 10 soniyadan keyin qayta
echo ============================================
echo.
echo Butunlay to'xtatish uchun shu oynani yoping.
echo.
timeout /t 10 /nobreak >nul
goto qayta

:tugadi
echo.
echo Bot to'xtatildi.
echo.
if %JIM%==0 pause
exit /b 0

:yoq_node
echo.
echo [XATO] Node.js o'rnatilmagan. Avval 1-ornatish.bat ni ishga tushiring.
echo.
if %JIM%==0 pause
exit /b 1

:yoq_paket
echo.
echo [XATO] Paketlar o'rnatilmagan. Avval 1-ornatish.bat ni ishga tushiring.
echo.
if %JIM%==0 pause
exit /b 1

:yoq_env
echo.
echo [XATO] Sozlamalar yo'q (.env fayli topilmadi).
echo Avval 1-ornatish.bat ni ishga tushiring.
echo.
if %JIM%==0 pause
exit /b 1
