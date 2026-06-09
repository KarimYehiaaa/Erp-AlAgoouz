# إعداد Windows — حل "حدث خطأ في الاتصال"

## التشخيص

| الخدمة | المنفذ | الحالة المطلوبة |
|--------|--------|-----------------|
| Frontend (Vite) | 5173 | `npm run dev` في مجلد `frontend` |
| Backend (Express) | 3000 | `npm run dev` في مجلد `backend` |
| PostgreSQL | 5432 | يجب أن يعمل دائماً |

رسالة **"حدث خطأ في الاتصال"** عند تسجيل الدخول = **قاعدة البيانات غير مشغّلة** (Backend يعمل لكن PostgreSQL لا).

---

## الحل 1: PostgreSQL محلي (موصى به)

1. ثبّت من: https://www.postgresql.org/download/windows/
2. أثناء التثبيت احفظ كلمة مرور المستخدم `postgres`
3. افتح **pgAdmin** أو **SQL Shell (psql)** ونفّذ:

```sql
CREATE USER erp_user WITH PASSWORD 'erp_secret_2024';
CREATE DATABASE bin_al_ajouz OWNER erp_user;
GRANT ALL PRIVILEGES ON DATABASE bin_al_ajouz TO erp_user;
```

4. نفّذ ملفات الـ Schema (من مجلد المشروع):

```powershell
cd "D:\AlAgoouz System\AlAgoouz-erp"
psql -U erp_user -d bin_al_ajouz -f backend\migrations\001_schema.sql
psql -U erp_user -d bin_al_ajouz -f backend\migrations\002_seed.sql
```

5. شغّل الخوادم (نافذتان):

```powershell
# نافذة 1
cd backend
npm run dev

# نافذة 2
cd frontend
npm run dev
```

6. تحقق: افتح http://localhost:3000/api/health  
   يجب أن ترى: `"success": true`

---

## الحل 2: Docker (إن كان مثبتاً)

```powershell
cd "D:\AlAgoouz System\AlAgoouz-erp"
docker compose up -d
cd backend
npm run dev
```

---

## بيانات الدخول

- المستخدم: `admin`
- كلمة المرور: `Admin@123`
