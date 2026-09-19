@echo off
cd /d "%~dp0..\..\"
:: 1. ØªØ¬Ù…ÙŠØ¹ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„Ø§Øª Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© â€” Ø§Ù„Ù…ØµØ§Ø¯Ø± ÙˆØ§Ù„ØªÙƒÙˆÙŠÙ†Ø§Øª ÙÙ‚Ø·
::    (Ø¨Ø¯ÙˆÙ† git add . Ø­ØªÙ‰ Ù„Ø§ ØªÙØ±ÙØ¹ Ù…Ù„ÙØ§Øª Ø§Ù„Ø¨ÙŠØ¦Ø© Ø£Ùˆ Ø§Ù„Ø¨Ù†Ø§Ø¡ Ø£Ùˆ Ø§Ù„Ù…Ø¤Ù‚ØªØ© Ø¹Ù† Ø·Ø±ÙŠÙ‚ Ø§Ù„Ø®Ø·Ø£)
git add -u
git add backend/src frontend/src migrations docs scripts assets api .github .husky
git add package.json package-lock.json tsconfig.json eslint.config.js .editorconfig .gitignore .gitattributes .env.example config
git add backend/package.json backend/package-lock.json backend/.env.example backend/Dockerfile backend/tsconfig.json backend/vitest.config.ts
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/vitest.config.ts frontend/tsconfig.json frontend/tsconfig.node.json frontend/tailwind.config.js frontend/postcss.config.js frontend/env.d.ts frontend/Dockerfile
git add docker-compose.yml Dockerfile vercel.json

:: 2. Ø¹Ù…Ù„ Ø§Ù„ØªÙˆØ«ÙŠÙ‚ Ø¨Ø±Ø³Ø§Ù„Ø© ØªÙ„Ù‚Ø§Ø¦ÙŠØ© ØªØ­ØªÙˆÙŠ Ø¹Ù„Ù‰ Ø§Ù„ØªØ§Ø±ÙŠØ® ÙˆØ§Ù„ÙˆÙ‚Øª Ø§Ù„Ø­Ø§Ù„ÙŠÙŠÙ†
git commit -m "Auto backup: %date% %time%"

:: 3. Ø§Ù„Ø±ÙØ¹ Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠ Ø¥Ù„Ù‰ Ø¬ÙŠØª Ù‡Ø§Ø¨
git push

echo =======================================
echo     Fol El Fol Ya Kemo
echo =======================================
pause