@echo off
:: 1. تجميع التعديلات الجديدة — المصادر والتكوينات فقط
::    (بدون git add . حتى لا تُرفع ملفات البيئة أو البناء أو المؤقتة عن طريق الخطأ)
git add -u
git add backend/src frontend/src migrations docs scripts assets api .github .husky
git add package.json package-lock.json tsconfig.json eslint.config.js .prettierrc .editorconfig .gitignore .gitattributes .env.example
git add backend/package.json backend/package-lock.json backend/.env.example backend/Dockerfile backend/tsconfig.json backend/vitest.config.ts
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/vitest.config.ts frontend/tsconfig.json frontend/tsconfig.node.json frontend/tailwind.config.js frontend/postcss.config.js frontend/env.d.ts frontend/Dockerfile
git add docker-compose.yml Dockerfile render.yaml vercel.json ecosystem.config.cjs

:: 2. عمل التوثيق برسالة تلقائية تحتوي على التاريخ والوقت الحاليين
git commit -m "Auto backup: %date% %time%"

:: 3. الرفع التلقائي إلى جيت هاب
git push

echo =======================================
echo     Fol El Fol Ya Kemo
echo =======================================
pause