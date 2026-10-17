@echo off
chcp 65001 >nul
title Umra boti - yangilash va tiklash
cd /d "%~dp0.."

echo.
echo ============================================
echo   YANGILASH VA TIKLASH
echo ============================================
echo.
echo Bu oyna ikki ish qiladi:
echo   1) botni GitHub'dagi oxirgi holatga yangilaydi;
echo   2) fayllar aralashib ketgan bo'lsa, ishlaydigan holatga qaytaradi.
echo.
echo Sozlamalaringiz (.env) va bazangiz (data papkasi) HECH QACHON
echo o'chmaydi - ular GitHub'da yo'q, faqat shu kompyuterda turadi.
echo.

where git >nul 2>nul
if errorlevel 1 goto yoq_git
if not exist ".git" goto yoq_repo

set OZGARGAN=
set TANLOV=
echo Hozirgi holat tekshirilmoqda...
echo.
git fetch origin
if errorlevel 1 goto yoq_internet

for /f %%i in ('git status --porcelain') do set OZGARGAN=1

if not defined OZGARGAN goto toza
echo --------------------------------------------
echo   DIQQAT: bu papkada o'zgargan fayllar bor
echo --------------------------------------------
git status --short
echo --------------------------------------------
echo.
echo Nima qilamiz?
echo.
echo   1 - GitHub'dagi ISHLAYDIGAN holatga qaytarish
echo       (yuqoridagi o'zgarishlar o'chadi, nusxasi saqlanadi)
echo   2 - Hech narsa qilmaslik (chiqish)
echo.
set /p TANLOV=Raqamni yozing va Enter bosing:

if "%TANLOV%"=="1" goto qaytarish
goto chiqish

:toza
echo Fayllar toza. Yangilanish olinmoqda...
echo.
git pull --ff-only origin main
if errorlevel 1 goto farqli
goto paketlar

:farqli
echo.
echo --------------------------------------------
echo   Bu papkadagi tarix GitHub'nikidan farq qiladi
echo --------------------------------------------
echo.
echo Nima qilamiz?
echo.
echo   1 - GitHub'dagi ISHLAYDIGAN holatga qaytarish
echo       (mahalliy o'zgarishlar o'chadi, nusxasi saqlanadi)
echo   2 - Hech narsa qilmaslik (chiqish)
echo.
set /p TANLOV=Raqamni yozing va Enter bosing:
if "%TANLOV%"=="1" goto qaytarish
goto chiqish

:qaytarish
echo.
echo O'zgargan fayllarning nusxasi saqlanmoqda...
if not exist "eski-nusxa" mkdir "eski-nusxa"
set STAMP=%DATE:/=-%_%TIME::=-%
set STAMP=%STAMP: =%
git diff > "eski-nusxa\ozgarishlar-%STAMP%.txt" 2>nul
if exist ".env" copy /y ".env" "eski-nusxa\env-%STAMP%.txt" >nul

echo GitHub'dagi holatga qaytarilmoqda...
git reset --hard origin/main
REM `clean` e'tiborsiz fayllarga TEGMAYDI: .env, data va zaxira joyida qoladi
git clean -fd
echo.
echo Qaytarildi. O'chgan o'zgarishlar nusxasi: eski-nusxa papkasida.
echo.

:paketlar
echo Paketlar tekshirilmoqda...
echo.
call npm install
if errorlevel 1 goto xato_npm

echo.
echo Bot tekshirilmoqda (bu yarim daqiqa oladi)...
echo.
call npm test
if errorlevel 1 goto xato_test

echo.
echo ============================================
echo   TAYYOR - BOT ISHLAYDIGAN HOLATDA
echo ============================================
echo.
echo Endi botni ishga tushirsangiz bo'ladi:  2-boshlash.bat
echo.
goto oxiri

:yoq_git
echo Git topilmadi. Uni bir marta o'rnatish kerak:
echo.
echo   https://git-scm.com/download/win
echo.
echo O'rnatgandan keyin shu oynani qaytadan oching.
echo.
goto oxiri

:yoq_repo
echo Bu papka GitHub'dan olinmagan (git yo'q), shuning uchun yangilab
echo bo'lmaydi.
echo.
echo Yangi papkaga ko'chirib oling:
echo.
echo   git clone https://github.com/asilbek008/Passport-bot.git umra-bot
echo.
echo Keyin eski papkadagi .env faylini va data papkasini yangisiga
echo ko'chirasiz.
echo.
goto oxiri

:yoq_internet
echo Internetga yoki GitHub'ga ulanib bo'lmadi.
echo Internetni tekshirib, qaytadan urinib ko'ring.
echo.
goto oxiri

:xato_npm
echo.
echo Paketlarni o'rnatishda xato. Internetni tekshiring va
echo shu oynani qaytadan oching.
echo.
goto oxiri

:xato_test
echo.
echo Tekshiruv o'tmadi. Shu oynadagi yozuvni Claude'ga ko'rsating.
echo.
goto oxiri

:chiqish
echo.
echo Hech narsa o'zgartirilmadi.
echo.

:oxiri
echo.
pause
