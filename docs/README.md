# بن العجوز ERP

نظام إدارة متكامل لمحل البن والمشروبات، يشمل المبيعات، المخزون، المنتجات، المشتريات، العملاء، الموردين، الفواتير، المصروفات، وصفات الإنتاج، الموارد البشرية، التقارير، والنسخ الاحتياطي.

## المتطلبات

- Node.js 18 أو أحدث
- PostgreSQL 14 أو أحدث
- npm

## التشغيل السريع

```bash
cd backend
cp .env.example .env
npm install
npm run setup-db
npm run dev

cd ../frontend
npm install
npm run dev
```

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
node src/database/reset-admin.js admin "NewStrongPasswordHere"
```

## هيكل المشروع

```text
AlAgoouz-erp/
├── assets/       # الشعار والموارد العامة
├── backend/      # Express API و PostgreSQL
├── frontend/     # Vue 3 + Vite
├── docs/         # التوثيق
└── scripts/      # سكربتات تشغيل وصيانة
```

## ملاحظات أمان

- لا تستخدم كلمات مرور افتراضية في الإنتاج.
- استخدم `JWT_SECRET` طويل وعشوائي.
- شغل اختبارات التكامل على قاعدة اختبار منفصلة فقط.
- لا تضع ملفات `.env` أو النسخ الاحتياطية داخل Git.
