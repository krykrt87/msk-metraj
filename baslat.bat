@echo off
chcp 65001 >nul
title MSK Metraj - baslatici
cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadı. Kurulum: %LOCALAPPDATA%\Programs\nodejs
  pause
  exit /b 1
)
if not exist node_modules (
  echo Bağımlılıklar kuruluyor, ilk seferde birkaç dakika sürer...
  call npm install
)

rem Uygulama sunucusu kapalıysa başlat
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173 -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Uygulama sunucusu başlatılıyor...
  start "MSK Metraj - Uygulama" /min cmd /k "npx vite --mode yerel --host 127.0.0.1"
)

echo Hazır olması bekleniyor...
set /a deneme=0
:bekle
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173 -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto hazir
set /a deneme+=1
if %deneme% geq 90 (
  echo Uygulama sunucusu 3 dakikada açılmadı. "MSK Metraj - Uygulama" penceresindeki hatayı kontrol edin.
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto bekle

:hazir
start "" http://127.0.0.1:5173
echo.
echo Uygulama açıldı: http://127.0.0.1:5173
echo Yerel mod: veri work\ klasöründen okunur, değişiklik kaydedilmez. Metrajı yeniden ürettikten sonra sayfayı yenileyin.
timeout /t 8 >nul
exit /b 0
