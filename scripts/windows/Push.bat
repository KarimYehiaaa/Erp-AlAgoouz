@echo off
setlocal
cd /d "%~dp0..\.."
if errorlevel 1 goto :failed

rem Stage tracked edits, then explicit source and configuration directories only.
git add -u
if errorlevel 1 goto :failed
git add backend/src backend/tests backend/migrations backend/api backend/scripts docs scripts assets api .github .husky shared
if errorlevel 1 goto :failed
git add backend/certs/prod-ca-2021.crt
if errorlevel 1 goto :failed
git add frontend/src frontend/android frontend/e2e
if errorlevel 1 goto :failed
git add desktop-pos/electron desktop-pos/src desktop-pos/tests desktop-pos/scripts
if errorlevel 1 goto :failed
git add package.json package-lock.json tsconfig.json .editorconfig .gitignore .gitattributes .env.example config
if errorlevel 1 goto :failed
git add backend/package.json backend/package-lock.json backend/.env.example backend/Dockerfile backend/tsconfig.json backend/vitest.config.ts
if errorlevel 1 goto :failed
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/vitest.config.ts frontend/tsconfig.json frontend/tsconfig.node.json frontend/postcss.config.js frontend/env.d.ts frontend/Dockerfile
if errorlevel 1 goto :failed
git add desktop-pos/package.json desktop-pos/package-lock.json desktop-pos/electron-builder.json desktop-pos/tsconfig.json desktop-pos/tsconfig.node.json desktop-pos/vite.config.ts desktop-pos/index.html desktop-pos/BUILDING.md
if errorlevel 1 goto :failed
git add docker-compose.yml Dockerfile vercel.json backend/vercel.json frontend/vercel.json
if errorlevel 1 goto :failed

git commit -m "Auto backup: %date% %time%"
if errorlevel 1 goto :failed
git push
if errorlevel 1 goto :failed

echo =======================================
echo     Push completed successfully
echo =======================================
pause
exit /b 0

:failed
echo Push stopped because a staging, commit, or push operation failed.
exit /b 1
