# بن العجوز ERP (Bin Al-Agoouz ERP)

نظام لإدارة محل واحد ونقطة البيع والمبيعات والمخزون والحسابات، مع إمكانية وجود مخازن متعددة داخل نفس النشاط. راجع [سياق النشاط](CONTEXT.md).

---

## 🚀 التقنيات المستخدمة (Tech Stack)

- **Backend:** Node.js (إصدار التطوير في `.nvmrc`)، Express.js، TypeScript، PostgreSQL، Redis / BullMQ، WebSocket عبر `ws`.
- **Frontend:** Vue 3 (Composition API)، Vite، Pinia، TypeScript، SCSS، Chart.js.
- **Mobile / Desktop:** Capacitor (Android/iOS) + Electron / Desktop POS.
- **Testing & Quality:** Vitest، فحص TypeScript، اختبارات قاعدة بيانات محلية معزولة. عدد الاختبارات ونتائجها يُستخرجان من التشغيل الحالي.

---

## ⚡ التشغيل السريع (Quickstart)

المشروع مبني بهيكلية **npm workspace** (الاعتماديات تدار من الجذر):

```bash
# 1. تثبيت الحزم من جذر المشروع
npm install

# 2. تهيئة ملف الإعدادات
cp .env.example .env

# 3. تشغيل الخادم والواجهة
npm run dev -w backend
npm run dev -w frontend
```

---

## 🧪 الفحص والاختبارات (Verification & Quality)

```bash
# فحص دقة الأنواع (TypeScript Typecheck)
npm run typecheck

# الفحص المحلي الموحد الشامل (Migrations + Isolated Tests)
npm run check:local

# فحص الأمان للاعتماديات التشغيلية
npm run security:audit

# بناء حزمة الإنتاج
npm run build -w frontend
```

---

## 🐳 خيارات الاستضافة والتشغيل (Deployment)

1. **الاستضافة المعتمدة للإنتاج (Recommended: Docker / VPS):**
   - استخدام Dockerfile و docker-compose.yml لتشغيل الخادم، قاعدة البيانات، وRedis بدعم كامل للـ WebSockets والطباعة المباشرة.
2. **الاستضافة السحابية / PWA:**
   - الواجهة تدعم التحديثات اللحظية والتطبيق الهجين عبر Capacitor.

---

## 📚 التوثيق الإضافي (Documentation)

- 📖 [دليل المطور الكامل](docs/README.md)
- 🛡️ [سياسات الأمان والحماية المتقدمة](docs/security/SECURITY.md)
- 📊 [تقرير التحقق النهائي والإصدار](docs/reports/RELEASE_VERIFICATION_REPORT.md)
- 🔍 [تقرير التدقيق الفني الشامل](docs/audits/FULL_AUDIT_REPORT.md)
- 🧠 [الذاكرة المعمارية للنظام](.agents/skills/erp-brain/SKILL.md)
