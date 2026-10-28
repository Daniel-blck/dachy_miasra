@echo off
cd /d "%~dp0dachy-miasto"
echo Dachy Miasta: http://127.0.0.1:4173/
echo Otworz ten adres w przegladarce. Ctrl+C zatrzymuje serwer.
node scripts/serve.mjs
pause
