# تقرير الفحص الشامل للكود — نظام بن العجوز ERP

> تاريخ الفحص: 2026-08-31
> نطاق الفحص: الكود الحالي بالكامل (العمل الجاهز + التعديلات غير الملتزمة + الملفات الجديدة غير المتعقبة)

---

## ملخص تنفيذي

المشروع في حالة **تطوير نشط وواسع النطاق** مع إضافات ضخمة حديثة (Desktop POS، تطبيق Android Manager، نظام ورديات الكاشير، موافقات المدير عن بُعد، محرك نقاط الولاء). البنية العامة سليمة وتتبع نمط تجاري (controllers/services/routes) مع التزام جيد بالأمان (JWT + RBAC + Row Locking + Idempotency).

**إجمالي الملاحظات:**
- 🔴 حرجة (مؤكد): **مشكلتان**
- 🟠 أمنية/متوسطة: **5 ملاحظات**
- 🟡 معمارية/جودة كود: **6 ملاحظات**
- 🔵 نظافة/تنظيم: **4 ملاحظات**

---

## 🔴 GPS الحرج (مؤكد)

### 1. خطأ SQL مؤكد — Endpoint `/manager-mobile/summary` مكسور
**الملف:** `backend/src/controllers/managerMobileController.ts:77`

```sql
JOIN users u ON s.user_id = u.id
```

جدول `pos_shifts` لا يحتوي على عمود `user_id` — يحتوي فقط على `cashier_user_id` (Migration 053). لم يضف أي migration لاحق العمود. هذا الاستعلام سيرمي `column s.user_id does not exist` عند أي طلب لهذا الـ endpoint → **خطأ 500 دائم**.

**الإصلاح:** استبدل بـ `s.cashier_user_id`.

### 2. كسر جلسات فوري عند تغيير كلمة المرور/الدور بسبب Caching
**الملف:** `backend/src/middleware/auth.ts` + `backend/src/services/userService.ts`

- `auth.ts` يخزّن المستخدم في كاش `auth_users` لمدة **30 ثانية**.
- `userService.ts:45` عند تغيير كلمة المرور أو الدور يرفع `token_version`.
- لكن **لا يوجد `invalidateByTag('auth_users')` عند التعديل**.

النتيجة: المستخدم الذي تغيّرت كلمة مروره/دوره للتو، إذا كانت بياناته مخزنة في الكاش بـ token_version قديمة، فسيرفض النظام توكنه الجديد (المُصدَر بـ ver حديث) لأن الكاش ما يزال يعرض القديم حتى انتهاء الـ 30 ثانية → **تسجيل خروج قسري/رفض مصادقة مؤقت** على الخادم نفسه.

**الإصلاح:** استدعِ `appCache.invalidateByTag('auth_users')` بعد تعديل `token_version`/كلمة المرور/`is_active` في `userService.updateUser`.

---

## 🟠 أمنية

### 3. تأخّر 60 ثانية في تفعيل صلاحيات الأدوار (Cache Invalidation ناقص)
**الملف:** `backend/src/middleware/auth.ts` (كاش `auth_roles`, TTL 60s) + `userService.assignPermissions` (سطر 684-699)

عند تعديل `role_permissions` لكل دور لا يُستدعى `invalidateByTag('auth_roles')`. تغيير صلاحية أو إلغاء صلاحية من دور لن يُطبَّق **لمدة تصل إلى 60 ثانية** على الجلسات القائمة. في بيئة Vercel (multi-instance) هذا قد يعني استمرار صلاحية وصول مستخدم سُلبت صلاحيته لفترة أطول.

**الإصلاح:** أضف إبطال تاج `auth_roles` في `assignPermissions`، و`auth_users` عند تعطيل المستخدم.

### 4. تقسيم Flat على كل ورديات الخادم مع Rate Limit لكل مستخدم فقط
**الملف:** `backend/src/controllers/posShiftController.ts:133-158` (`verifyPin`)

المنطق يجرّب PIN مقابل **كل** مستخدمين admin/manager النشطين في حلقة. Rate limiterّ مُبني على `user.id` (لكل مستخدم 5/دقيقة). نجاح وحدة الدقيقة الواحدة يظل محميًا جيدًا من التخمين، لكن:
- لا يوجد Rate Limit عام لكل المحاولات أو قفل Progressive (Upper limit per IP + per manager).
- بعد 4 محاولات ناجحة/فاشلة صغيرة لا يوجد سلوك توعوي (مثل تأخير أسي).

**توصية:** حدّ بـ 5-10 محاولات فاشلة لكل `cashier_user_id` ثم قفل مؤقت 15 دقيقة، بالإضافة إلى حد IP عالمي.

### 5. `batchSyncSales` يتجاوز عزل الفروع (Branch Isolation Bypass)
**الملف:** `backend/src/controllers/posShiftController.ts:62-90` و `routes/pos.routes.ts`

`createDailySale` العادي في `sales.routes.ts` محمي بـ `enforceWarehouseAccess`. لكن مسار `POST /sales/batch-sync` يستدعي `createDailySale` مباشرة **بدون** `enforceWarehouseAccess`، بحيث يمكن لـ payload مزامنة تحديد أي `warehouse_id` (أي فرع آخر) — تجاوز محتمل لعزل المخازن بين الفروع.

**الإصلاح:** تحقّق على الخادم أن `warehouse_id` لكل صف مزامنة يخص فرع المستخدم (أو أضف وسيط `enforceWarehouseAccess` على مسار batch-sync).

### 6. تطبيق Android Manager يعمل بـ cleartext HTTP + تنقّل عالمي مفتوح
**الملف:** `frontend/capacitor.config.ts`

```json
androidScheme: 'http',
cleartext: true,
allowNavigation: ['*'],
```

تطبيق الإدارة يحمل بيانات مالية حساسة (تقارير المبيعات، المخزون، ورديات النقدية). تفعيل `cleartext: true` + `androidScheme: http` يعرّض الاتصالات للاعتراض (Man-in-the-Middle) على شبكات غير آمنة. `allowNavigation: ['*']` يفتح التنقل لأي نطاق داخل WebView.

**توصية (للإنتاج):** استخدم `https` و`cleartext: false`، وقيّد `allowNavigation` بالنطاق الفعلي للـ API. يُترَك `http/cleartext` للبيئة المحلية فقط.

### 7. `local.properties` مكشوف (مسار SDK)
**الملف:** `frontend/android/local.properties`

يحتوي مسار SDK المحلي (`sdk.dir=...`). غير متعقب حاليًا لكن يجب إضافته إلى `.gitignore` (أو `android/.gitignore`) لمنع الالتزام العرضي. (متوسط الخطورة، ممارسة.)

---

## 🟡 معمارية / جودة كود

### 8. `closeShift` يغلق أول وردية "open" للمستخدم وليس الوردية المحددة
**الملف:** `backend/src/services/posShiftService.ts:166-212`

`closeShift` يستدعي `getCurrentShift(userId)` ثم يقارن `shift.id !== shiftId`. لو كان المستخدم يملك ورديتين مفتوحتين (مسار معقد غير شائع لأنه يمنع فتح ثانية عبر `openShift`)، أو حدث شذوذ، فالفحص يحمي من حالة غير صالحة بشكل صحيح. **لكن** لا يوجد استخدام للمعاملة الوحيدة `FOR UPDATE` قبل القراءة، والقراءة خارج المعاملة؛ إغلاق متزامن قد يكتب بيانات متداخلة. يظهر `getCurrentShift` إعادة حساب مكلفة (3 استعلامات) داخل `closeShift` — تكرار منطق.

**توصية:** نفّذ `UPDATE ... WHERE id=$1 AND status='open'` مباشرة بشرط `cashier_user_id=$2` مع `RETURNING` لضمان الذرية (row lock تلقائي) بدلاً من قراءة-ثم-تحديث.

### 9. كود مُكرر في استعلامات مبيعات الدفع بطرق متعددة
**الملف:** `backend/src/controllers/managerMobileController.ts:18-45`

استعلامان متطابقان تقريبًا (branch و wholesale) بعمود `payment_method` نفسه. يُستخرج أحدهما: نوع-واحد-دالة لتعريف الأعمدة. (تحذير Duplicated Code / DRY.)

### 10. `roundMoney` على `totalQuantity` — قيم كمية ليست مالية
**الملف:** `backend/src/controllers/managerMobileController.ts:199`

`roundMoney(Number(row.total_qty))` يُطبق دالة تقريب العملة على كميات المخزون (قد تكون وحدات كسرية أو لا). استخدام دالة مالية للكمية غير دقيق مفهوميًا.

### 11. Intrusive Cache داخل Middleware — مسؤولية منتشرة
**الملف:** `backend/src/middleware/auth.ts`

جلب الـ cache للـ auth (مستخدم + أدوار) يدوي عبر `query` + `appCache` داخل middleware يوزّع منطق الإبطال على أكثر من مكان أدى للمشكلتين (2) و(3). حل أكثر تماسكًا: طبقة Repository/Service للمصادقة تعزل الـ cache وإبطاله في نقطة واحدة.

### 12. `verifyPin` يجلب كل المدراء ويقارن bcrypt لكل واحد
**الملف:** `backend/src/controllers/posShiftController.ts:133-157`

لازم جلب كل admin/manager ثم `bcrypt.compare` لكل صف. عند وجود عدد كبير من المدراء تتحول لعملية ثقيلة (bcrypt مقصود بطيء). البديل: إضافة عمود معرف فريد للـ PIN أو استعلام مُرشَّح بـ `username`/معرّف مدخل، أو تخزين المدير المحدد في توكن الكاشير.

### 13. `sales` route بلا `enforceWarehouseAccess` على update/return كامل العمق
الملف: `backend/src/routes/sales.routes.ts`

`/sales/:id/return` محمي بـ `requireManagerOverride` لكن عزل الفرع (enforceWarehouseAccess) لا يظهر على مسار الإرجاع؛ تأكد من أن الإرجاع يقيّد على مخزن المستخدم.

---

## 🔵 نظافة / تنظيم

### 14. ملفات مؤقتة وDebug مبعثرة في جذر المشروع
- `count*.cjs` (x7), `fix.cjs`, `patch.cjs`, `end.txt`, `orig.txt`, `orig.vue`, `temp_products_panel.txt`, `test-route.ts`, `test_divs.cjs`, `upgrade_graph.cjs`, `upgrade_pos.cjs`, `documentation_source.html`, `generate_docs_pdf.cjs`

كلها سكربتات/نسخ مؤقتة من عمليات التطوير (فبعضها يعدّل ملفات رسمية مثل `ProductsPanel.vue` و `AutomationGraphView.vue`). **إزالتها يا بني لتعطيب الجذر.**

### 15. حِزَم `desktop-pos/dist` و `desktop-pos/release` (build artifacts) داخل الشجرة
نسخ مبنية من تطبيق Electron (داخل `desktop-pos/dist*`, `release/`) موجودة على القرص. **يجب إضافتها إلى `.gitignore`** حتى لا تُلتزم عرضًا.

### 16. ثنائي APK كبير في الجذر (`BinAlAgoouz-Manager.apk` ~16MB)
ملف APK مُجمَّع في جذر repo. إما وضعه في مجلد `releases/` مستبعد من git، أو إدارته عبر GI releases بدل الالتزام.

### 17. ملفات البناء `frontend/android` ليست في `.gitignore` الجذري
إصدار Capacitor Android غير متعقب حاليًا لكن لا يوجد حكم واضح في `.gitignore` الجذري؛ ضع إدخالًا لـ `frontend/android/` (مع استثناء المتطلبات) أو أبقِه خارج الشجرة.

> فهرس الملفات الثقيلة على القرص (غير متعقبة): `dist/backups/full-backups/tmp/logs` ≈ **586 MB** (20133 ملف) — كلها في `.gitignore` فأهلاً، لكن راجع ما إذا كان بعضها يجب حذفه لتخفيف مساحة العمل.

---

## ملاحظات إيجابية (محافظ عليها)

- ✅ **Order Idempotency**: دفاع جيد ضد إعادة إرسال `sync_id` (UUID فقط) بسلوك ممتاز (يعيد البيع القائم بدل التكرار).
- ✅ **Manager Override على الخادم**: تحويل المصادقة من عميل-فقط إلى خادم (توكن JWT قصير 10 دقائق + تعطيل فوري عند إبطال الحساب). أمن أفضل بكثير.
- ✅ **Rate limiting** على `/pos/verify-pin`.
- ✅ **Row Locking** (`FOR UPDATE`) في نقاط الولاء والمخزون.
- ✅ **محرك نقاط الولاء** مع حساب آمن (`FOR UPDATE` + سقف للاسترداد + مكافأة على الدفع الفعلي).
- ✅ **عزل الفروع** موجود على مسار إنشاء البيع العادي.
- ✅ لا توجد أسرار مكشوفة (API keys / private keys) في `backend/src` أو الـ frontend الجديد.

---

## إجراءات مقترحة بالترتيب

1. **حرج:** إصلاح خطأ `s.user_id` في `managerMobileController` (يُعطّل تقرير المدير).
2. **حرج:** إبطال كاش `auth_users` عند تعديل كلمة المرور/الدور/التعطيل (يمنع كسر الجلسات + تأخر تفعيل الصلاحيات).
3. **أمني:** إبطال `auth_roles` عند تعديل `role_permissions`.
4. **أمني:** عزل فرع داخل `/sales/batch-sync`.
5. **أمني:** تقييد cleartext/allowNavigation في Capacitor للإنتاج.
6. **نظافة:** حذف ملفات debug المؤقتة، وإضافة `desktop-pos/dist*`, `release/`, `local.properties`, `frontend/android` إلى `.gitignore`.
7. التحقق من تمرير `npm run typecheck` بعد الإصلاحات (الـ repo يتضمن سكربت typecheck رسمي).
