# بن العجوز — نظام ERP

نظام إدارة متكامل لمحل البن التركي والمشروبات الساخنة والباردة.

## المتطلبات

- Node.js 18+
- PostgreSQL 14+

## تشغيل دائم (بعد إغلاق Cursor)

من مستكشف الملفات شغّل: **`scripts/start-erp.bat`**

أو راجع: [RUN-SERVERS.md](RUN-SERVERS.md)

---

## التثبيت السريع

```bash
# 1. قاعدة البيانات
createdb bin_al_ajouz
psql -d bin_al_ajouz -f backend/migrations/001_schema.sql
psql -d bin_al_ajouz -f backend/migrations/002_seed.sql

# 2. Backend
cd backend
cp .env.example .env
npm install
npm run dev

# 3. Frontend
cd frontend
npm install
npm run dev
```

## الشعار

ضع ملف الشعار الرسمي في: `assets/logo.png` (يُستخدم تلقائياً في كل الواجهات).

## بيانات الدخول الافتراضية

| المستخدم | كلمة المرور | الدور |
|----------|-------------|-------|
| admin | Admin@123 | مدير النظام |

## الهيكل

```
bin-al-ajouz-erp/
├── assets/          # الشعار والموارد
├── backend/         # Express API
├── frontend/        # Vue.js SPA
└── docker-compose.yml
```

## الميزات

- مبيعات POS وجملة
- مخزون متعدد المخازن
- عملاء وموردين
- فواتير وطباعة
- مصروفات وتقارير
- JWT + صلاحيات
- RTL + Dark Mode
