# بن العجوز ERP

نظام إدارة متكامل لمحل البن والمشروبات، يشمل المبيعات، المخزون، المنتجات، المشتريات، العملاء، الموردين، الفواتير، المصروفات، وصفات الإنتاج، الموارد البشرية، التقارير، والنسخ الاحتياطي.

## المتطلبات

- Node.js 22 أو أحدث (يُشغّل TypeScript مباشرة عبر type stripping)
- PostgreSQL 14 أو أحدث
- npm (المشروع npm workspace — الاعتماديات في جذر المشروع)

## التشغيل السريع

```bash
cp .env.example .env        # في جذر المشروع (أو backend/.env.example داخل backend)
npm install                 # من جذر المشروع (workspace)

cd backend
npm run dev                 # الخادم على http://localhost:3001 (يعرض الواجهة المبنية من frontend/dist)

cd ../frontend
npm run dev                 # (اختياري) خادم تطوير Vite للواجهة
```

**ملاحظة مهمة**: المشروع **npm workspace** — لا تثبّت داخل `backend/` أو `frontend/` منفردةً، بل من جذر المشروع (`npm install`).

## TypeScript 100% مع strict

- **الباك-إند والواجهة محوّلان بالكامل إلى TypeScript** (بما فيها services وcontrollers وviews وcomposables وstores) مع JSDoc وافٍ لكل التصديرات.
- `strict: true` مفعّل في الجانبين، مع `noUncheckedIndexedAccess` على الواجهة — صفر أخطاء.

## أوامر الفحص والتشغيل (من جذر المشروع)

```bash
npm run typecheck    # فحص الأنواع في الجانبين (باك + واجهة)
npm test             # كل الاختبارات (باك + واجهة)
npm run check:local  # الفحص المحلي الموحّد: tsc للباك + اختبارات معزولة (موصى به قبل كل PR)
```

### اختبارات الباك-إند وقاعدة البيانات

```bash
npm run check:local              # من جذر المشروع: فحص الباك والسكربتات والاختبارات ومسار البناء
npm run test:local -w backend     # اختبارات على قاعدة محلية معزولة (bin_al_ajouz_test)
npm test -w backend               # اختبارات (محمية بالحارس — انظر أدناه)
```

**حماية قاعدة الإنتاج 🔒**: الاختبارات محمية بحارس أمان (`backend/tests/setup-env.ts`) يقرأ الإعداد المحلول من `config` — إذا كان هدف القاعدة **بعيدًا** (Supabase/إنتاج) يتوقف `npm test` فورًا برسالة واضحة قبل أي اتصال. المسار المعتمد محليًا هو `npm run test:local` الذي يجهّز قاعدة معزولة على `localhost` تلقائيًا (setup + migrate) ثم يشغّل vitest.

### اختبار الدخان التشغيلي

`backend/tests/smoke.test.ts` يضمن أمرين كانا يتعطلان من قبل:

- **POST JSON حقيقي** عبر `express.json()` — يلتقط فورًا عطل `body-parser`/`iconv-lite` الناتج عن `node_modules` مكسور.
- **اختيار dist الصحيح** — لا يُقبل أي مجلد dist ما لم يحتوِ على `index.html`، فيُقدَّم `frontend/dist` الحقيقي بدل بقايا builds خاطئة (404 سابقًا).

### CI (GitHub Actions)

`.github/workflows/ci.yml` يشغّل على كل push وPR: تثبيت معتمديات + `check:local` (tsc + اختبارات معزولة ضد خدمة Postgres مدمجة) + فحص الواجهة (typecheck + tests + build) + دخان تشغيلي (تشغيل الخادم الفعلي مع POST وGET /).

## Docker

انسخ ملف البيئة من جذر المشروع:

```bash
cp .env.example .env
```

ثم عدل القيم الحساسة في `.env`، خصوصا:

- `DB_PASSWORD`
- `JWT_SECRET`

بعدها شغل:

```bash
docker compose up -d
```

## بيانات الدخول

قد تحتوي بيانات التأسيس على مستخدم إداري افتراضي. يجب تغيير كلمة مروره فورا قبل أي استخدام حقيقي.

لإعادة تعيين كلمة مرور المدير:

```bash
cd backend
npm run reset-admin -- admin "NewStrongPasswordHere"
```

## هيكل المشروع

```text
AlAgoouz-erp/
├── assets/          # الشعار والموارد العامة
├── backend/         # Express API و PostgreSQL (TypeScript)
├── frontend/        # Vue 3 + Vite (TypeScript)
├── desktop-pos/     # تطبيق نقطة البيع لسطح المكتب (Electron + Vue 3)
├── docs/            # التوثيق والتقارير والمعمارية
│   ├── architecture/
│   ├── audits/
│   ├── deployment/
│   ├── desktop/
│   ├── reports/
│   └── security/
└── scripts/         # السكربتات المنظمة
    ├── database/    # النسخ الاحتياطي، التهيئة، والهجرات
    ├── deployment/  # بناء حزم الموبايل والفحص التكاملي
    ├── maintenance/ # حارس مسار البناء، التحديث التلقائي، وإغلاق المنافذ
    ├── security/    # فحص الأمان وتوليد الشهادات
    └── windows/     # سكربتات ويندوز والتشغيل الصامت والمشغلات
```

## ملاحظات أمان

- لا تستخدم كلمات مرور افتراضية في الإنتاج.
- استخدم `JWT_SECRET` طويل وعشوائي.
- الاختبارات **لا تلمس قاعدة الإنتاج أبدًا** — استخدم `npm run test:local` محليًا، والـ CI يستخدم قاعدة معزولة.
- لا تضع ملفات `.env` أو النسخ الاحتياطية داخل Git.
- البناء المحلي `npm run build` يكتب إلى `frontend/dist` الذي يقدّمه الخادم. إعداد Vercel في الجذر يحدد `dist` كمخرج مستقل للنشر السحابي؛ راجع ملف الإعداد للبيئة المقصودة ولا تخلط ناتج البناء المحلي بناتج النشر.
