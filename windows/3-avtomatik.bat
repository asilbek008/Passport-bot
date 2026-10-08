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
echo.
echo Bot endi faqat 2-boshlash.bat bilan qo'lda ishga tushadi.
echo.
pause
exit /b 0

:holat
cscript //nologo "%~dp0avtomatik.vbs" holat
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
