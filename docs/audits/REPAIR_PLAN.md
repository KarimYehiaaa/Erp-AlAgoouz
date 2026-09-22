# خطة الإصلاح الشامل والتحصين الجذري — بن العجوز ERP
## Master Repair, Hardening & Parity Plan

**المشروع:** بن العجوز ERP (Bin Al-Ajouz ERP)  
**التاريخ:** 22 سبتمبر 2026  
**الحالة:** وثيقة معتمدة للمرحلة التخطيطية والبحثية قبل التنفيذ  
**المرجع:** `docs/audits/REPAIR_PLAN.md`

---

## 1. خريطة البنية المعمارية وتكامل البيئات الأربع (Environment Topology)

النظام يعمل عبر **أربع بيئات متصلة** تتكامل فيما بينها:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       1. LOCAL / ON-PREMISE (البيئة الأساسية)               │
│  - تعمل محلياً داخل شبكة المحل دون اشتراط إنترنت مستمر                        │
│  - خادم Node.js/Express + قاعدة بيانات PostgreSQL محلية + Redis اختياري     │
│  - المصدر الأساسي لتشغيل الكاشير ونقاط البيع والفواتير والمخزون اليومي        │
└───────────────────────┬─────────────────────────────┬───────────────────────┘
                        │                             │
                        │                             │
                        ▼                             ▼
┌───────────────────────────────────┐     ┌───────────────────────────────────┐
│       3. DESKTOP POS (سطح المكتب) │     │      4. MOBILE APP (الموبايل)     │
│  - تطبيق Electron + Vue 3         │     │  - تطبيق هجين (Capacitor/Vue 3)   │
│  - يتصل بالخادم المحلي أو السحابي │     │  - شاشات الإدارة التنفيذية        │
│  - قاعدة بيانات SQLite محلية      │     │  - اعتماد الخصومات وتجاوز المدير  │
│  - مزامنة دفعية Outbox عند الاتصال│     │  - متابعة الإيرادات والمخزون      │
└─────────────────┬─────────────────┘     └─────────────────┬─────────────────┘
                  │                                         │
                  │              مزامنة Outbox              │
                  │          (عبر الإنترنت عند التوفر)      │
                  ▼                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        2. ONLINE CLOUD SERVER (السحابي)                     │
│  - استضافة Vercel Serverless + قاعدة بيانات Supabase / Neon السحابية         │
│  - تُستخدم للوصول عن بُعد، ومزامنة الفروع، ونسخ الاحتياط السحابي، والموبايل │
│  - نفس منطق الأعمال وعقود الـ APIs والأمان وقواعد البيانات                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. مصفوفة المشاكل المكتشفة وجذورها التقنية (Identified Issues & Root Causes)

| الرقم | المشكلة المكتشفة | مستوى الخطورة | الملفات والوحدات المتأثرة | البيئات والعملاء المتأثرون | السبب الجذري (Root Cause) |
|---|---|---|---|---|---|
| **H-01** | تطبيق Idempotency قبل المصادقة | 🔴 حرج (Critical) | `backend/src/app.ts`, `backend/src/middleware/idempotency.ts` | Local, Online, All Clients | يتم استدعاء `app.use(requireIdempotency)` قبل التحقق من هوية المستخدم، مما يجعل `req.user` غير معرف (`anon`) فيشترك جميع المستخدمين في نفس نطاق الـ Idempotency، مما يهدد بتسريب أو إعادة ردود عمليات مستخدم لآخر. |
| **H-02** | ثغرة تجاوز المدير (Manager Override) غير المقيد | 🔴 حرج (Critical) | `backend/src/middleware/managerOverride.ts` | Backend, POS, Mobile | توكن التجاوز الصادر لا يتحقق من هوية الكاشير المنفذ (`payload.csr === req.user.id`) ولا يمنع إعادة استخدام التوكن عدة مرات خلال صلاحيته، مما يتيح لكاشير آخر استخدامه لتمرير خصومات غير مصرح بها. |
| **H-03** | غياب العزل الصارم لقراءة المخزون (Warehouse Read IDOR) | 🔴 حرج (Critical) | `backend/src/routes/inventory.routes.ts`, `backend/src/middleware/warehouseAccess.ts`, `backend/src/controllers/inventoryController.ts` | Backend, Web, Desktop | استعلامات الجرد وحركات المخزون وقوائم الجرد تقبل المعرفات دون التحقق من أن المستخدم مصرح له بالمخزن المرتبط بالبيان، مما يسمح بالاطلاع على مخازن أخرى. |
| **H-04** | ثغرة IDOR في تفاصيل المبيعات (`GET /sales/:id`) | 🔴 حرج (Critical) | `backend/src/controllers/salesController.ts`, `backend/src/services/salesService.ts` | Web, Desktop, Mobile | استرجاع الفاتورة بالمعرف لا يفحص نطاق مخزن المستخدم أو صلاحيات الوصول في حال كان المستخدم مقيداً بمخزن معين. |
| **H-05** | انعدام التحقق من مخزن الجرد عند التعديل والاعتماد | 🔴 حرج (Critical) | `backend/src/routes/inventory.routes.ts`, `backend/src/controllers/stocktakeController.ts`, `backend/src/services/stocktakeService.ts` | Web, Desktop | مسارات `PUT /stocktakes/:id/items` و `POST /stocktakes/:id/complete` تفتقر لوسيط `enforceWarehouseAccess`، ولا تفحص في الخدمة ما إذا كان مخزن الجرد مصرحاً للمستخدم الحالي. |
| **H-06** | استهلاك المخزون الصامت بين المخازن (Cross-Warehouse Fallback) | 🔴 حرج (Critical) | `backend/src/services/saleInventoryOps.ts` | Inventory, Sales, Accounting | عند نقص المخزون في المخزن المحدد، يقوم النظام تلقائياً وبشكل صامت بخصم الكمية المتبقية من أي مخزن آخر لديه رصيد دون موافقة أو توثيق محاسبي صريح. |
| **H-07** | تضارب وازدواجية احتساب تكلفة المبيعات (COGS/Profit Inconsistency) | 🔴 حرج (Critical) | `backend/src/services/saleInventoryOps.ts`, `backend/src/services/invoiceService.ts`, `backend/src/services/plService.ts`, `backend/src/services/dashboardService.ts` | Accounting, Reports, Dashboard | يتم تخزين `cost_price` في `sale_items` كإجمالي للسطر في موضع (سعر التكلفة × الكمية) وكـ سعر وحدة في موضع آخر، وتقوم تقارير P&L بضرب `cost_price * quantity` مما يضاعف الكمية تربيعياً (`qty * qty`) في الـ COGS. |
| **H-08** | تصنيف أخطاء الـ Outbox الخاطئ وحجر طلبات المصادقة | 🔴 حرج (Critical) | `frontend/src/services/outboxService.ts` | POS, Offline Sync | تصنيف أي كود 4xx (عدا 408 و429) كبيانات تالفة، مما يؤدي لحجر الفواتير نهائياً عند انتهاء التوكن (401) أو الصلاحية (403) أو التعارض (409) بدلاً من إعادة المصادقة أو التوفيق. |
| **H-09** | مزامنة الدفعات المفتوحة دون قيود (`POST /sales/batch-sync`) | 🟠 عالي (High) | `backend/src/controllers/posShiftController.ts` | POS, Offline Sync | عدم وجود حد أقصى لعدد الفواتير بالدفعة، وتجاوز فحص المخزن المسموح إذا تم إرسال `warehouse_id` كقيمة فارغة أو غير محددة. |
| **H-10** | ثغرة IDOR في الإشعارات (`PATCH /notifications/:id/read`) | 🟠 عالي (High) | `backend/src/services/userService.ts`, `backend/src/controllers/usersController.ts` | Notifications, Users | استعلام التحديث `UPDATE notifications SET is_read = TRUE WHERE id = $1` لا يتحقق من أن الإشعار ملك للمستخدم الحالي (`user_id = $2 OR user_id IS NULL`). |
| **H-11** | تسريب توكن التجاوز في طلبات موافقة المدير بالموبايل | 🔴 حرج (Critical) | `backend/src/controllers/managerMobileController.ts` | Mobile, POS | نقطة `GET /pos/approvals/:id/status` تعيد بيانات الطلب بالكامل بما فيها `override_token` لأي مستخدم موثق دون التحقق من أنه الكاشير الطالب. |
| **H-12** | خروج Factory Reset بنجاح رغم الفشل وإغفال الجداول الحديثة | 🟠 عالي (High) | `backend/src/database/factoryReset.ts` | Local, DB Admin | كود `process.exit(0)` داخل كتلة `finally` يتسبب في إعطاء كود نجاح 0 حتى لو حدث خطأ، بالإضافة لعدم تفريغ جداول القيود المحاسبية والفترات المالية الحديثة. |
| **H-13** | عدم التحقق من صحة وموثوقية رابط السيرفر المخصص بالواجهة | 🟠 عالي (High) | `frontend/src/api/client.ts` | Frontend, Mobile | السماح بتعيين أي عنوان في `localStorage.binalagoouz_server_url` وإرسال الـ Credentials والتوكنات إليه دون فحصه عبر قائمة موثوقة (Whitelist). |
| **H-14** | إغفال التوكن المجدد في طابور الطلبات المتزامنة | 🟠 عالي (High) | `frontend/src/api/client.ts` | Frontend, Auth | عند اكتمال تجديد التوكن، يتم استدعاء `processQueue(null, null)` بدلاً من تمرير التوكن الجديد للطلبات المعلقة، مما يتسبب في فشل الطلبات التي تعتمد على ترويسة Bearer. |
| **H-15** | تنافس تجديد التوكن وإلغاء الجلسات النشطة في السيرفر | 🔴 حرج (Critical) | `backend/src/services/authService.ts` | Auth, All Clients | عند وصول طلبين متزامنين بنفس الـ Refresh Token، ينجح الأول بينما يفشل الثاني ويقوم بإلغاء جميع توكنات المستخدم النشطة (`UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1`). |
| **H-16** | تصديق الجلسة من جانب العميل فقط عبر `localStorage.user` | 🟠 عالي (High) | `frontend/src/stores/auth.ts`, `frontend/src/router/guards.ts` | Frontend, Security | اعتبار المستخدم موثقاً لمجرد وجود كائن `user` في `localStorage` والسماح بالتنقل في الواجهة دون انتظار تأكيد السيرفر عند الإقلاع. |
| **H-17** | حساب الأرباح التاريخية بأسعار الشراء الحالية | 🔴 حرج (Critical) | `backend/src/services/userService.ts` | Reports, Profit | حساب أرباح الفئات بالتقرير عبر `SUM(si.quantity * p.purchase_price)` بدلاً من استخدام تكلفة العملية التاريخية، مما يشوه تقارير الربحية السابقة عند تغير سعر المنتج اليوم. |
| **H-18** | غياب فحوصات الصحة والتأمين في Docker Compose | 🟡 متوسط (Medium) | `docker-compose.yml` | Local Deployment, DevOps | غياب `healthcheck` للـ Postgres والـ Redis، وعدم تقييد المنافذ بـ `127.0.0.1`، واعتماد `001_schema.sql` فقط في `initdb.d`. |
| **H-19** | كشف تفاصيل الأخطاء الداخلية في Serverless Vercel | 🟡 متوسط (Medium) | `api/index.ts` | Cloud Deployment, Security | إعادة `err.message` مباشرة للعملاء في استجابات 500 في بيئة الإنتاج السحابية. |

---

## 3. خطة الإصلاح مرحلياً (Execution Phases)

### المرحلة 0: التحضير والتوثيق والتحقق الأولي (Phase 0: Baseline & Documentation)
1. إنشاء وتثبيت وثيقة خطة الإصلاح الشاملة `docs/audits/REPAIR_PLAN.md`.
2. إنشاء خطة التنفيذ المعتمدة في الذاكرة وموافقة المستخدم قبل البدء في التعديلات البرمجية.
3. التأكد من ثبات نتائج الفحص الأولي (`npm run typecheck` و `test:local` و `desktop tests`).

### المرحلة 1: الأمان والمصادقة وتجاوز المدير وعزل المخازن (Phase 1: Auth & Warehouse Isolation)
1. **إصلاح H-01 (Idempotency Scope):**
   - تعديل `backend/src/app.ts` بحيث يُطبق وسيط `requireIdempotency` بعد استخراج هوية المستخدم أو تحصينه ليكون مستقلاً وآمناً لكل مستخدم ومسار ومفتاح.
   - إضافة اختبار تراجع يؤكد أن المستخدم B لا يمكنه استرجاع أو تعطيل عملية المستخدم A بنفس المفتاح.
2. **إصلاح H-02 (Manager Override Binding):**
   - تعديل `backend/src/middleware/managerOverride.ts` للتحقق الصارم من أن `payload.csr === req.user.id`.
   - فرض كود استخدام لمرة واحدة (JTI / Nonce) أو تقليص الصلاحية الزمنية لمنع إعادة استخدام التوكن.
   - إضافة اختبار تراجع لمنع استخدام توكن كاشير بواسطة كاشير آخر.
3. **إصلاح H-03 & H-04 & H-05 (Warehouse Isolation & IDOR):**
   - تعديل `salesService.getSaleById` للتحقق من صلاحية وصول المستخدم لمخزن الفاتورة ما لم يكن مديراً عاماً.
   - تعديل مسارات ووظائف الجرد (`stocktakeService` و `inventory.routes.ts`) لفرض فحص `enforceWarehouseAccess` والتحقق من صلاحية المخزن في كل من `get`, `updateItems`, `complete`, `delete`.
   - إضافة اختبارات تراجع لعزل قراءة المبيعات والجرد بين المخازن.
4. **إصلاح H-10 (Notification IDOR):**
   - تعديل استعلام تحديث قراءة الإشعار ليكون: `WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`.
   - إضافة اختبار تراجع يمنع المستخدم من تعديل إشعارات غيره.
5. **إصلاح H-11 (Manager Mobile Approvals):**
   - حماية نقطة فحص حالة الموافقة `checkApprovalStatus` بحيث تقتصر على صاحب الطلب أو المديرين فقط، ولا تعيد التوكن الحساس إلا للكاشير صاحب الطلب.

### المرحلة 2: سلامة البيانات المالية وتكلفة البضاعة والمخزون (Phase 2: Financial Integrity & COGS)
1. **إصلاح H-06 (Cross-Warehouse Inventory Fallback):**
   - إزالة السحب التلقائي الصامت من المخازن الأخرى في `saleInventoryOps.ts`.
   - قصر الصرف على المخزن المحدد للفاتورة حصراً، أو رفض العملية بخطأ واضح وطلب تحويل مخزني رسمي.
2. **إصلاح H-07 (COGS & Profit Calculation):**
   - توحيد تعريف `sale_items.cost_price` ليكون سعر تكلفة الوحدة التاريخي (Unit Cost) أو تعديل الاستعلامات المحاسبية وتقارير P&L وDashboard لتعتمد على التكلفة المخزنة بدقة دون تكرار الضرب في الكمية.
3. **إصلاح H-17 (Historical Profit in Reports):**
   - تعديل `userService.getProfitReport` ليعتمد على `si.cost_price` أو `s.cost_amount` التاريخية بدلاً من `p.purchase_price` الحالية.
   - إضافة اختبار تراجع يثبت ثبات أرباح اليوم الأول حتى لو ارتفعت أسعار شراء المنتجات في اليوم الثاني.

### المرحلة 3: نظام الـ Offline والـ Outbox والـ Batch Sync (Phase 3: Offline & Outbox Hardening)
1. **إصلاح H-08 (Outbox Error Handling):**
   - تحديث `frontend/src/services/outboxService.ts` للتمييز الدقيق بين:
     - `400` / `422`: أخطاء تحقق وبيانات تالفة -> حجر ومراجعة (QUARANTINED).
     - `401`: انتهاء صلاحية التوكن -> إعادة تجديد التوكن وتكرار المحاولة بأمان دون حجر.
     - `403`: خطأ صلاحية أو جلسة -> تعليق للمراجعة دون تصنيفها كتلف.
     - `408` / `429` / `5xx`: إعادة المحاولة مع Exponential Backoff.
     - `409`: معالجة التعارض وفقاً لرد السيرفر.
2. **إصلاح H-09 (Batch Sync Safeguards):**
   - وضع حد أقصى للدفعة (مثلاً 50 أو 100 فاتورة كحد أقصى) في `posShiftController.batchSyncSales`.
   - التحقق الصارم من Zod Schema لكل عنصر داخل الدفعة.
   - فرض المخزن المسموح للكاشير حتى لو أرسل العميل `warehouse_id` فارغاً.

### المرحلة 4: البيئة المحلية والـ Docker والنسخ الاحتياطي (Phase 4: Local & Database Reliability)
1. **إصلاح H-12 (Factory Reset Hardening):**
   - إصلاح كود الخروج في `backend/src/database/factoryReset.ts` ليرجع `process.exit(1)` عند حدوث أي خطأ، ولا يرجع 0 إلا عند النجاح التام.
   - شمول كافة الجداول الحديثة في التفريغ (`journal_entries`, `journal_entry_lines`, `financial_periods`, `idempotency_records`, `db_row_audits`, إلخ).
2. **إصلاح H-18 (Docker Compose):**
   - إضافة فحوصات صحة (`healthcheck`) لخدمات `postgres` و `redis`.
   - ربط خدمة `backend` بشرط `condition: service_healthy`.
   - تقييد منافذ قواعد البيانات بـ `127.0.0.1`.

### المرحلة 5: السيرفر السحابي والنشر والبيئات (Phase 5: Online & Cloud Production Hardening)
1. **إصلاح H-19 (Information Disclosure):**
   - تعديل `api/index.ts` لمنع إرجاع `err.message` المباشر في بيئة الإنتاج وإرجاع رسالة خطأ عامة وآمنة مع معرّف الطلب.
   - التأكد من ضبط ترويسات الأمان ومطابقة قواعد CORS لكافة النطاقات السحابية والمحلية المعتمدة.

### المرحلة 6: عملاء الواجهة وسطح المكتب والموبايل (Phase 6: Frontend, Desktop & Mobile Clients)
1. **إصلاح H-13 (Trusted Server Whitelist):**
   - تطبيق استراتيجية قائمة النطاقات الموثوقة (Allowed Origins Whitelist) في `frontend/src/api/client.ts` لمنع الاتصال بسيرفرات مجهولة.
2. **إصلاح H-14 & H-15 (Token Refresh Concurrency & Queue):**
   - تمرير التوكن الجديد `refreshedToken` لـ `processQueue` في `client.ts`.
   - إصلاح التنافس في `backend/src/services/authService.ts` لمنع إلغاء جلسات المستخدم بالكامل عند تزامن طلبات التجديد.
3. **إصلاح H-16 (Frontend Stale Auth Guard):**
   - تحصين `auth.ts` و `guards.ts` بحيث لا تمنح صلاحيات إدارية دون مصادقة السيرفر الفعالة.

### المرحلة 7: الفحص التراجعي والتدقيق النهائي المزدوج (Phase 7: Full Regression & Verification)
1. تشغيل اختبارات TypeScript (`npm run typecheck`).
2. تشغيل كافة اختبارات الـ Backend المحلية المعزولة (`npm run test:local`).
3. تشغيل كافة اختبارات الـ Frontend (`npm run test:unit`).
4. تشغيل كافة اختبارات الـ Desktop POS (`npm test`).
5. إجراء تدقيق أمني ومحاسبي شامل للتأكد من عدم وجود أي ثغرات أو انحرافات جديدة.
6. إصدار تقرير الإنجاز النهائي `docs/audits/REPAIR_REPORT.md`.

---

## 4. مصفوفة التحقق والاختبارات التراجعية المطلوبة (Verification Matrix)

1. **SECURITY:**
   - [ ] Cross-user idempotency isolation (`test_idempotency_cross_user.test.ts`)
   - [ ] Cross-cashier manager override rejection (`test_manager_override_cross_cashier.test.ts`)
   - [ ] Sales IDOR by warehouse/user scope (`test_sales_warehouse_idor.test.ts`)
   - [ ] Stocktake access control (`test_stocktake_authorization.test.ts`)
   - [ ] Notification update IDOR (`test_notification_idor.test.ts`)
   - [ ] Manager approvals token exposure (`test_approval_token_leak.test.ts`)

2. **FINANCE & INVENTORY:**
   - [ ] Historical COGS invariant against future price changes (`test_historical_cogs.test.ts`)
   - [ ] Multi-warehouse fallback rejection (`test_no_silent_warehouse_fallback.test.ts`)
   - [ ] Journal entry double-entry debit/credit balance across all flows

3. **OFFLINE & SYNC:**
   - [ ] Outbox 401 token refresh retry (`outboxService.spec.ts`)
   - [ ] Outbox 403 quarantine prevention (`outboxService.spec.ts`)
   - [ ] Batch sync payload limits and warehouse enforcement (`test_batch_sync_limits.test.ts`)

4. **AUTH & CLIENTS:**
   - [ ] Concurrent token refresh queue (`test_refresh_concurrency.test.ts`)
   - [ ] Server URL whitelist validation in Web & Mobile

---
*تم إعداد الخطة بدقة متناهية التزاماً بقواعد المشروع والنزاهة المحاسبية والأمنية.*
