# بن العجوز ERP (Bin Al-Agoouz ERP)

نظام متكامل لتخطيط موارد المؤسسات (ERP) ونقاط البيع (POS) مصمم للمطاعم والمقاهي والمحامص.

---

## 🚀 التقنيات المستخدمة (Tech Stack)

- **Backend:** Node.js (v22+), Express.js, TypeScript (Strict Mode), PostgreSQL, Redis / BullMQ, Socket.io.
- **Frontend:** Vue 3 (Composition API), Vite, Pinia, Tailwind CSS, TypeScript, Chart.js.
- **Mobile / Desktop:** Capacitor (Android/iOS) + Electron / Desktop POS.
- **Testing & Quality:** Vitest (68 tests), TypeScript strict, Migrations verification.

---

## ⚡ التشغيل السريع (Quickstart)

المشروع مبني بهيكلية **npm workspace** (الاعتماديات تدار من الجذر):

\ash
# 1. تثبيت الحزم من جذر المشروع
npm install

# 2. تهيئة ملف الإعدادات
cp .env.example .env

# 3. تشغيل الخادم والواجهة
npm run dev -w backend
npm run dev -w frontend
\\n
---

## 🧪 الفحص والاختبارات (Verification & Quality)

\ash
# فحص دقة الأنواع (TypeScript Typecheck)
npm run typecheck

# الفحص المحلي الموحد الشامل (Migrations + Vitest 68 Tests)
npm run check:local

# بناء حزمة الإنتاج
npm run build -w frontend
\\n
---

## 🐳 خيارات الاستضافة والتشغيل (Deployment)

1. **الاستضافة المعتمدة للإنتاج (Recommended: Docker / VPS):**
   - استخدام Dockerfile و docker-compose.yml لتشغيل الخادم، قاعدة البيانات، وRedis بدعم كامل للـ WebSockets والطباعة المباشرة.
2. **الاستضافة السحابية / PWA:**
   - الواجهة تدعم التحديثات اللحظية والتطبيق الهجين عبر Capacitor.

---

## 📚 التوثيق الإضافي (Documentation)

- 📖 [دليل المطور الكامل](docs/README.md)
- 🛡️ [تقرير التدقيق الفني الشامل](docs/audits/FULL_AUDIT_REPORT.md)
- 🧠 [الذاكرة المعمارية للنظام](.agents/skills/erp-brain/SKILL.md)
