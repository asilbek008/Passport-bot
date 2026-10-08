@echo off
chcp 65001 >nul
title Umra boti - zaxira
cd /d "%~dp0.."

echo.
echo ============================================
echo   ZAXIRA OLISH
echo ============================================
echo.
echo Baza va pasport rasmlari bitta shifrlangan faylga
echo yig'iladi. Parolni yozib qo'ying - parolsiz zaxirani
echo ochib bo'lmaydi.
echo.
call npm run zaxira
echo.
echo Zaxira fayli 'zaxira' papkasida. Uni flesh-diskka yoki
echo boshqa kompyuterga ko'chirib qo'ying.
echo.
pause
