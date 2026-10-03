@echo off
rem ============================================================
rem  Nhap dup file nay de chay game Block Quest English
rem ============================================================
chcp 65001 >nul
title Block Quest English - DANG CHAY (dong cua so nay de tat game)
set "PATH=%USERPROFILE%\tools\node;%PATH%"
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Khong tim thay Node.js. Hay cai Node.js 22 LTS tu https://nodejs.org roi chay lai.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Dang cai dat lan dau, vui long doi 1-2 phut...
  call npm install --no-fund --no-audit
)

echo Dang chuan bi game...
call npm run build >nul
if errorlevel 1 (
  echo Co loi khi chuan bi game. Chay lai lenh "npm run build" de xem chi tiet.
  pause
  exit /b 1
)

echo.
echo  ==========================================================
echo   GAME DANG CHAY! Trinh duyet se tu mo.
echo.
echo   Choi tren may tinh bang / dien thoai (cung Wi-Fi):
echo   mo dia chi "Network" hien ben duoi tren trinh duyet.
echo.
echo   De TAT game: dong cua so nay.
echo  ==========================================================
echo.
call npx vite preview --host --open --port 4173
