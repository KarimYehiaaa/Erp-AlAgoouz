# إعداد Windows

هذا الدليل يساعدك على تشغيل النظام محليا على Windows عند ظهور مشكلة اتصال بين الواجهة والخادم أو قاعدة البيانات.

## الخدمات المطلوبة

| الخدمة     | المنفذ | الحالة المطلوبة                 |
| ---------- | ------ | ------------------------------- |
| Frontend   | 5173   | `npm run dev` داخل `frontend`   |
| Backend    | 3000   | `npm run dev` داخل `backend`    |
| PostgreSQL | 5432   | يجب أن تكون قاعدة البيانات تعمل |

## إعداد PostgreSQL محلي

ثبت PostgreSQL من:

https://www.postgresql.org/download/windows/

ثم أنشئ مستخدم وقاعدة بيانات بكلمة مرور قوية تختارها أنت:

```sql
CREATE USER erp_user WITH PASSWORD '<strong-password>';
CREATE DATABASE bin_al_ajouz OWNER erp_user;
GRANT ALL PRIVILEGES ON DATABASE bin_al_ajouz TO erp_user;
```

بعدها حدث ملف `backend/.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bin_al_ajouz
DB_USER=erp_user
DB_PASSWORD=<strong-password>
JWT_SECRET=<long-random-secret>
```

ثم شغل إعداد قاعدة البيانات:

```powershell
npm run setup-db -w backend
```

السكربت `scripts/windows/setup-database.ps1` يستدعي الأمر نفسه ويعيد رمز الفشل إذا لم تكتمل التهيئة. يستخدم `DATABASE_URL` عند وجوده. عند إنشاء مستخدم وقاعدة لأول مرة على PostgreSQL المثبت على Windows، يحتاج الإعداد إلى كلمة مرور المدير في `POSTGRES_PASSWORD` عبر البيئة المحلية؛ لا تضعها في Git. لا تحتاج قاعدة Supabase الحالية إلى كلمة مرور مدير PostgreSQL محلي.

لإعداد مكونات المشروع كلها بعد تجهيز ملف البيئة، شغّل `npm run setup` أو `scripts/windows/setup.ps1`. يتولى المعالج التثبيت من ملفات القفل، وينتظر جاهزية Docker المحلي عند اختياره، ويتوقف إذا فشل تثبيت الحزم أو إعداد القاعدة أو البناء.

## تشغيل الخوادم

افتح نافذتين:

```powershell
npm run dev -w backend
```

```powershell
npm run dev -w frontend
```

تحقق من الخادم:

```text
http://localhost:3000/api/health
```

## Docker

من جذر المشروع:

```powershell
Copy-Item .env.example .env
notepad .env
docker compose up -d
```

يجب وضع قيم قوية في `.env` قبل تشغيل Docker.

## إعادة تعيين كلمة مرور المدير

```powershell
npm run reset-admin -w backend -- admin "NewStrongPasswordHere"
```
