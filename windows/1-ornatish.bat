@echo off
chcp 65001 >nul
title Umra boti - o'rnatish
cd /d "%~dp0.."

echo.
echo ============================================
echo   UMRA BOTI - BIRINCHI O'RNATISH
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 goto yoq_node

for /f "tokens=*" %%v in ('node -v') do set NODEV=%%v
echo Node.js topildi: %NODEV%
echo.

echo Kerakli paketlar o'rnatilmoqda. Bu 1-2 daqiqa olishi mumkin...
echo.
call npm install
if errorlevel 1 goto xato_npm

echo.
if exist ".env" goto env_bor
echo Endi sozlamalarni to'ldiramiz.
echo Bot tokeni va API kaliti so'raladi.
echo.
call npm run setup
goto tekshirish

:env_bor
echo Sozlamalar fayli (.env) allaqachon bor - o'tkazib yuborildi.
echo Qaytadan sozlash kerak bo'lsa: npm run setup
echo.

:tekshirish
echo.
echo Sozlamalar tekshirilmoqda...
echo.
call npm run tekshir

echo.
echo ============================================
echo   O'RNATISH TUGADI
echo ============================================
echo.
echo Botni ishga tushirish uchun:  2-boshlash.bat
echo.
pause
exit /b 0

:yoq_node
echo.
echo [XATO] Node.js o'rnatilmagan.
echo.
echo Node.js - bu botni ishlatadigan dastur. Bepul.
echo.
echo 1. Brauzerda ochasiz:  https://nodejs.org
echo 2. Katta yashil tugmani bosib yuklab olasiz (LTS)
echo 3. O'rnatasiz - hamma joyda Next / Install bosib
echo 4. Shu faylni (1-ornatish.bat) qaytadan ishga tushirasiz
echo.
echo DIQQAT: Node.js kamida 22.6 versiyada bo'lishi kerak.
echo.
pause
exit /b 1

:xato_npm
echo.
echo [XATO] Paketlarni o'rnatib bo'lmadi.
echo.
echo Sabablari:
echo  - internet yo'q yoki uzilib qoldi
echo  - ish joyidagi tarmoq npm'ni to'sayapti
echo.
echo Internetni tekshirib, shu faylni qaytadan ishga tushiring.
echo.
pause
exit /b 1
