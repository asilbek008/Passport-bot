@echo off
chcp 65001 >nul
title Umra boti - avtomatik ishga tushirish
cd /d "%~dp0"

echo.
echo ============================================
echo   AVTOMATIK ISHGA TUSHIRISH
echo ============================================
echo.
echo Kompyuterga kirganingizda bot o'zi ishga tushadigan
echo qilib qo'yadi. Oyna ko'rinmaydi - bot orqa fonda ishlaydi.
echo.
echo   1 - yoqish
echo   2 - o'chirish
echo   3 - holatini ko'rish
echo.
set /p TANLOV="Tanlang - 1, 2 yoki 3: "
echo.

if "%TANLOV%"=="1" goto yoqish
if "%TANLOV%"=="2" goto ochirish
if "%TANLOV%"=="3" goto holat
echo Tanlov tushunarsiz.
echo.
pause
exit /b 1

:yoqish
cscript //nologo "%~dp0avtomatik.vbs" yoq
if errorlevel 1 goto xato
echo.
echo Endi kompyuterga kirganingizda bot o'zi ishga tushadi.
echo Hoziroq ishga tushirish uchun:  2-boshlash.bat
echo.
echo DIQQAT: bot kompyuter YOQIQ turganda ishlaydi. Kompyuterni
echo o'chirsangiz yoki uyquga qo'ysangiz - bot ham to'xtaydi.
echo.
pause
exit /b 0

:ochirish
cscript //nologo "%~dp0avtomatik.vbs" ochir

rem Task Scheduler'dagi qoldiqlar ham o'chiriladi.
rem Avvalgi versiyada avtomatik yoqish schtasks bilan qilingan edi,
rem shuning uchun eski nomlar ham tekshiriladi - aks holda yorliq
rem o'chirilgani bilan cmd oynasi baribir ko'tarilaverardi.
schtasks /query /tn "UmraBot" >nul 2>nul
if not errorlevel 1 call :vazifani_ochir "UmraBot"
schtasks /query /tn "UmraBoti" >nul 2>nul
if not errorlevel 1 call :vazifani_ochir "UmraBoti"

echo.
echo Bot endi faqat 2-boshlash.bat bilan qo'lda ishga tushadi.
echo.
pause
exit /b 0

:vazifa_bor
set TOPILDI=1
echo   %~1 - BOR (cmd oynasi shundan ko'tariladi)
goto :eof

:vazifani_ochir
echo Vazifa topildi: %~1 - o'chirilmoqda...
schtasks /delete /tn %1 /f
if errorlevel 1 goto vazifa_xato
goto :eof

:vazifa_xato
echo.
echo [DIQQAT] %~1 vazifasini o'chirib bo'lmadi - administrator huquqi kerak.
echo Shu faylni o'ng tugma bilan bosib "Run as administrator" tanlang.
echo.
goto :eof

:holat
echo Startup yorlig'i:
cscript //nologo "%~dp0avtomatik.vbs" holat
echo.
echo Task Scheduler vazifasi:
set TOPILDI=0
schtasks /query /tn "UmraBot" >nul 2>nul
if not errorlevel 1 call :vazifa_bor "UmraBot"
schtasks /query /tn "UmraBoti" >nul 2>nul
if not errorlevel 1 call :vazifa_bor "UmraBoti"
if %TOPILDI%==0 echo   yo'q
echo.
pause
exit /b 0

:xato
echo.
echo [XATO] Yorliq yaratilmadi.
echo.
echo Antivirus to'sgan bo'lishi mumkin. Qo'lda qilish ham mumkin:
echo  1. Win+R bosib, shell:startup yozasiz, Enter
echo  2. Ochilgan papkaga jim-boshlash.vbs faylining YORLIG'ini
echo     tashlaysiz - faylning o'zini emas, yorlig'ini.
echo.
pause
exit /b 1
