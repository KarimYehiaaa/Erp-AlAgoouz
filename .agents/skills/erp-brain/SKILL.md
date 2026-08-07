---
name: erp-brain
description: >
  الذاكرة الشاملة لنظام بن العجوز ERP — تحتوي على كل المعلومات المعمارية، هيكل قاعدة البيانات،
  الخوارزميات، قواعد العمل، وتفاصيل كل موديول. يتم تفعيل هذه المهارة تلقائياً عند أي طلب
  متعلق بالمشروع لضمان فهم كامل للسياق قبل التنفيذ.
---

# 🧠 الذاكرة الشاملة — نظام بن العجوز ERP

> هذا الملف هو المرجع الرئيسي لفهم المشروع بالكامل. يتم تفعيله تلقائياً عند أي طلب متعلق بالنظام.

---

## 📋 نظرة عامة على المشروع

| البند | القيمة |
|-------|--------|
| **اسم المشروع** | بن العجوز ERP (Bin Al-Ajouz ERP) |
| **النوع** | نظام ERP متكامل لإدارة المقاهي ومحامص البن |
| **الـ Stack** | Vue.js 3 + Express.js + PostgreSQL |
| **Frontend** | Vue 3 (Composition API) + Vite + Tailwind CSS + Pinia |
| **Backend** | Express.js + Node.js (≥18) + pg (PostgreSQL driver) |
| **قاعدة البيانات** | PostgreSQL |
| **الاستضافة** | Render (سحابي) + Local (محلي) بالتوازي |
| **الأمان** | JWT + RBAC + Helmet + Rate Limiting + AES-256 Encryption |
| **النشر** | Docker + PM2 + Render.yaml |

---

## 🏗️ هيكل المشروع

```
AlAgoouz-erp/
├── backend/
│   ├── src/
│   │   ├── index.js              # Entry point — Express server
│   │   ├── config/index.js       # إعدادات DB + JWT + بيئة التشغيل
│   │   ├── controllers/          # 20 controller (طبقة رقيقة تستدعي Services)
│   │   ├── services/             # 41 service (منطق الأعمال الكامل) ⭐
│   │   ├── routes/
│   │   │   ├── index.js          # كل الـ API endpoints
│   │   │   └── schemas.js        # Zod validation schemas
│   │   ├── middleware/           # auth, errorHandler, validate, audit, confirmAction
│   │   ├── utils/                # crypto, cache, pagination, numberParsing
│   │   └── database/             # pool connection
│   ├── migrations/               # 33 ملف ترحيل (001 → 032)
│   ├── scripts/                  # migrate, run-tests, export-supabase
│   └── test/                     # اختبارات المنطق والتكامل
├── frontend/
│   ├── src/
│   │   ├── views/                # 24 شاشة رئيسية
│   │   ├── components/           # مكونات مشتركة (Navbar, Sidebar, StatCard...)
│   │   ├── stores/               # Pinia stores (app, auth)
│   │   ├── api/                  # Axios endpoints مقسمة حسب الموديول
│   │   ├── composables/          # دوال Vue قابلة لإعادة الاستخدام
│   │   ├── router/               # Vue Router مع Route Guards
│   │   ├── services/             # خدمات الواجهة (طباعة، IndexedDB)
│   │   ├── styles/               # Tailwind + SCSS
│   │   └── utils/                # دوال مساعدة
│   └── vite.config.js
├── scripts/                      # سكربتات النظام (setup, backup, update)
├── docs/                         # التوثيق (ARCHITECTURE, SYSTEM_ANALYSIS, CHANGELOG)
└── docker-compose.yml
```

---

## 🗄️ هيكل قاعدة البيانات (Database Schema)

### الجداول الأساسية (Core Tables)

#### 👥 الأمان والمستخدمين
| الجدول | الوصف | العلاقات |
|--------|-------|----------|
| `roles` | الأدوار (admin, manager, cashier, warehouse) | → role_permissions |
| `permissions` | الصلاحيات المتاحة | → role_permissions |
| `role_permissions` | ربط أدوار بصلاحيات (M2M) | roles ↔ permissions |
| `users` | حسابات المستخدمين | → roles (FK) |
| `audit_logs` | سجل التدقيق العام | → users (FK) |
| `activity_logs` | سجل النشاطات | → users (FK) |
| `db_row_audits` | تدقيق على مستوى الصف (Row-Level) | محمي من الحذف |

#### 📦 المنتجات والمخزون
| الجدول | الوصف | العلاقات |
|--------|-------|----------|
| `product_categories` | تصنيفات المنتجات (بن، قهوة، إضافات) | → products |
| `products` | المنتجات (اسم، سعر بيع، سعر شراء، وحدة) | → category, warehouse |
| `product_units` | وحدات القياس ومعامل التحويل | → products |
| `warehouses` | المخازن | → inventory |
| `inventory` | أرصدة المخزون (منتج × مخزن) | → products, warehouses |
| `stock_movements` | كل حركات المخزون | → products, warehouses |
| `inventory_cost_layers` | طبقات التكلفة الفعلية (Cost Layers) | → products, warehouses |

#### 🧾 المبيعات والمشتريات
| الجدول | الوصف | العلاقات |
|--------|-------|----------|
| `sales` | فواتير المبيعات (POS/جملة/فرع) | → customers |
| `sale_items` | تفاصيل بنود البيع | → sales, products |
| `daily_sales` | مبيعات يومية مجمعة | — |
| `customers` | بيانات العملاء والأرصدة | → sales |
| `suppliers` | الموردين | → supplier_invoices |
| `supplier_invoices` | فواتير الشراء | → suppliers |
| `supplier_invoice_items` | تفاصيل بنود الشراء | → supplier_invoices, products |

#### 🍳 الوصفات والتصنيع
| الجدول | الوصف | العلاقات |
|--------|-------|----------|
| `recipes` | الوصفات (خلطات البن المركبة) | → products |
| `recipe_ingredients` | مكونات الوصفة | → recipes, products |
| `production_batches` | دفعات التصنيع | → recipes |
| `production_batch_items` | تفاصيل المواد المستهلكة | → production_batches |

#### 💰 الماليات
| الجدول | الوصف |
|--------|-------|
| `invoices` | الفواتير الضريبية |
| `invoice_items` | بنود الفواتير |
| `payments` | المدفوعات وتسويات العملاء |
| `expenses` | المصروفات التشغيلية |

#### 👷 الموارد البشرية (HR)
| الجدول | الوصف |
|--------|-------|
| `employees` | بيانات الموظفين والراتب الأساسي |
| `shifts` | تعريف الورديات (صباحي، مسائي) |
| `employee_shifts` | ربط الموظف بالوردية |
| `attendance` | سجلات الحضور والانصراف |
| `advances` | السلف وأقساطها |
| `advance_installments` | تفاصيل أقساط السلف |
| `payroll_runs` | مسيرات الرواتب الشهرية |
| `payroll_details` | تفاصيل مرتب كل موظف |

#### 📊 الجرد
| الجدول | الوصف |
|--------|-------|
| `stocktakes` | عمليات الجرد |
| `stocktake_items` | بنود الجرد (الكمية الفعلية vs النظامية) |

### الـ Views المهمة
| View | الوصف |
|------|-------|
| `v_product_stock` | حالة المخزون الحالي لكل منتج × مخزن |
| `v_daily_sales` | إحصائيات المبيعات اليومية المجمعة |

### الـ Triggers المهمة
- **`updated_at` تلقائي**: على كل الجداول الرئيسية
- **حماية الأدوار الافتراضية**: يمنع حذف/تعديل admin, manager, cashier, warehouse
- **قفل مسارات الإنتاج**: يمنع تعديل المنتجات أو الوصفات المرتبطة بإنتاج مكتمل
- **تدقيق Row-Level**: يسجل كل INSERT/UPDATE/DELETE في `db_row_audits`

---

## ⚙️ الخوارزميات وقواعد العمل (Business Logic)

### 1. 💰 خوارزمية حساب التكلفة الفعالة (Effective Cost)
```
المسار: backend/src/services/costsService.js, recipesService.js
```
- **الهدف**: حساب التكلفة الحقيقية للمنتج المركب (مثل خلطة بن)
- **المنطق**: حساب شجري (Recursive) — إذا كان المكون نفسه له وصفة، يتم حساب تكلفته أولاً
- **المعادلة**: `تكلفة المنتج = Σ (كمية المكون × سعر شراء المكون × معامل التحويل)`
- **التحويل**: يدعم تحويل الوحدات (كجم → جرام) عبر `conversion_factor` في `product_units`

### 2. 📊 خوارزمية التسعير الديناميكي (Dynamic Pricing)
```
المسار: backend/src/services/dynamicPricingService.js
```
- **الهدف**: اقتراح أسعار بيع بناءً على هامش ربح مستهدف
- **المنطق**: `سعر البيع المقترح = التكلفة الفعالة × (1 + هامش الربح المطلوب)`

### 3. 🏭 خوارزمية التصنيع والإنتاج (Production)
```
المسار: backend/src/services/recipesService.js
```
- **الأنواع**: وضع مباشر (Direct) أو مُخزَّن (Stocked)
- **العملية**: 
  1. التحقق من توفر كل المكونات في المخزن المصدر
  2. قفل صفوف المخزون (`FOR UPDATE`) لمنع التضارب
  3. خصم المكونات من المخزن المصدر
  4. إضافة المنتج المُصنع إلى المخزن الهدف
  5. تسجيل حركات المخزون (استهلاك + إنتاج)
- **العكس (Reversal)**: يمكن عكس دفعة إنتاج كاملة بإرجاع المكونات وخصم المنتج

### 4. 🛒 خوارزمية البيع وخصم المخزون
```
المسار: backend/src/services/salesService.js
```
- **المنطق الذكي**: 
  - إذا كان المنتج **عادي** → خصم مباشر من المخزون
  - إذا كان المنتج **مركب (له وصفة)** → تفكيك تلقائي وخصم المكونات
- **التزامن**: يستخدم `SELECT ... FOR UPDATE` لمنع Race Conditions
- **الأداء**: معالجة Batch لتجنب مشكلة N+1 queries
- **أنواع البيع**: POS (نقطة بيع)، جملة (Wholesale)، فرع (Branch)

### 5. 📈 خوارزمية المتوسط المرجح لسعر الشراء (Weighted Average)
```
المسار: backend/src/services/purchaseService.js
```
- **المنطق**: عند استلام فاتورة شراء، يتم تحديث سعر الشراء للمنتج:
  - `سعر الشراء الجديد = (الكمية القديمة × السعر القديم + الكمية الجديدة × السعر الجديد) ÷ (الكمية القديمة + الكمية الجديدة)`

### 6. 💵 خوارزمية تسوية مديونيات العملاء (Payment Allocation)
```
المسار: backend/src/services/customerService.js
```
- **المنطق**: عند دفع العميل مبلغ مجمع:
  1. جلب الفواتير المستحقة مرتبة من الأقدم
  2. توزيع المبلغ المدفوع على الفواتير بالترتيب (FIFO)
  3. تحديث رصيد العميل

### 7. 💼 خوارزمية مسير الرواتب (Payroll)
```
المسار: backend/src/services/hrService.js
```
- **الحسابات التلقائية**:
  - **خصم التأخير**: بناءً على فرق الوقت بين موعد الوردية والحضور الفعلي
  - **خصم الغياب**: أيام الغياب × (الراتب ÷ 30)
  - **الساعات الإضافية**: الساعات الزائدة × معدل الساعة × معامل الأوفرتايم
  - **أقساط السلف**: خصم تلقائي للقسط الشهري من السلف النشطة
  - **صافي الراتب**: `الراتب الأساسي + البدلات + الأوفرتايم - التأخير - الغياب - السلف - الخصومات`
- **الربط المالي**: مسير الرواتب يُسجل تلقائياً كمصروف في جدول `expenses`

### 8. 📦 خوارزمية الجرد (Stocktake)
```
المسار: backend/src/services/stocktakeService.js
```
- **العملية**:
  1. إنشاء عملية جرد وتحديد المنتجات
  2. إدخال الكميات الفعلية
  3. حساب الفروقات (الفعلي - النظامي)
  4. عند الاعتماد: إنشاء حركات تسوية تلقائية (زيادة/نقص)

### 9. 🔮 خوارزمية التنبؤ بالطلب (Forecasting)
```
المسار: backend/src/services/forecastingService.js
```
- **المنطق**: تحليل بيانات المبيعات التاريخية لتوقع الطلب المستقبلي
- **العوامل**: الموسمية، الاتجاه العام، ومتوسط الطلب اليومي
- **المخرجات**: توقعات الطلب، توصيات المخزون، وتحليل الموسمية

### 10. 📊 محاكي التضخم (Inflation Simulator)
```
المسار: frontend/src/views/CostsView.vue
```
- **الهدف**: What-If Analysis — ماذا لو ارتفع سعر مادة خام؟
- **المنطق**: حساب شجري فوري لتأثير تغيير سعر أي مكون على كل المنتجات المركبة التي تستخدمه

### 11. 📉 تحليل السلة السوقية (Market Basket Analysis)
```
المسار: backend/src/services/marketBasketService.js
```
- **الهدف**: اكتشاف أنماط الشراء — أي منتجات تُشترى معاً
- **المخرجات**: توصيات بيع متقاطع (Cross-selling)

### 12. 💸 إسقاط التدفقات النقدية (Cash Flow Projection)
```
المسار: backend/src/services/cashFlowProjectionService.js
```
- **المنطق**: تحليل الإيرادات والمصروفات التاريخية لتوقع التدفق النقدي المستقبلي

---

## 🔐 نظام الأمان والصلاحيات

### نظام RBAC (Role-Based Access Control)
- **4 أدوار افتراضية**: admin, manager, cashier, warehouse
- **الصلاحيات مُحببة (Granular)**: لكل عملية (مثل `sales:create`, `inventory:edit`, `hr:manage`)
- **حماية الأدوار**: Trigger يمنع حذف أو تعديل الأدوار الافتراضية

### طبقات الحماية
1. **JWT Authentication**: توكن مشفر لكل جلسة
2. **Rate Limiting**: حد أقصى للطلبات لمنع الهجمات
3. **Helmet**: حماية HTTP Headers
4. **CORS**: تحديد النطاقات المسموحة
5. **Confirm Action**: عمليات حساسة تتطلب هيدر تأكيد `x-confirm-action`
6. **Audit Logging**: تسجيل كل عملية في سجل التدقيق
7. **Row-Level Audits**: تسجيل كل تغيير على مستوى الصف في DB
8. **AES-256-CBC Encryption**: تشفير النسخ الاحتياطية

### وضع الخصوصية (Privacy Mode)
- يخفي المبالغ والتكاليف الحساسة بنجوم (***) عند التفعيل
- مفيد عند وجود أشخاص غير مصرح لهم بالقرب من الشاشة

---

## 🖥️ الواجهة الأمامية (Frontend Architecture)

### الشاشات الرئيسية (24 شاشة)
| الشاشة | الوصف | ملاحظات مهمة |
|--------|-------|--------------|
| `DashboardView` | لوحة القيادة الرئيسية | Charts بتحميل كسول، Cache 60 ثانية |
| `SalesView` | إدارة المبيعات (محل + جملة) | استيراد/تصدير Excel، تفقيط |
| `BranchSalesView` | كاشير الفرع (POS) | دعم Offline + باركود + طباعة حرارية |
| `RecipesView` | إدارة الوصفات والخلطات | حاسبة تكاليف + تحويل وحدات |
| `CostsView` | التكاليف والمحاكاة | محاكي تضخم (What-If Analysis) |
| `InventoryView` | إدارة المخزون | تحويل بين مخازن + هالك + Excel |
| `ProductsView` | إدارة المنتجات | تعديل جماعي + وحدات قياس |
| `PurchasesAndExpensesView` | المشتريات والمصروفات | ربط بالموردين + تسجيل نفقات |
| `CustomersView` | إدارة العملاء | كشف حساب + مديونيات |
| `SuppliersView` | إدارة الموردين | فواتير الشراء |
| `InvoicesView` | الفواتير الضريبية | إنشاء + طباعة PDF |
| `QuotesView` | عروض الأسعار | إنشاء + طباعة PDF |
| `HrView` | الموارد البشرية | حضور + ورديات + رواتب + سلف |
| `ForecastingView` | التنبؤات بالذكاء الاصطناعي | تنبؤ الطلب + تحليل موسمي |
| `AiCopilotView` | المساعد الذكي | نصائح + تحسين تسعير |
| `ReportsView` | التقارير الشاملة | P&L + تقارير مخصصة |
| `SettingsView` | الإعدادات العامة | بيانات الشركة + ضرائب + نسخ احتياطي |
| `UsersView` | إدارة المستخدمين | صلاحيات + أدوار |
| `StocktakesView` | قائمة عمليات الجرد | |
| `StocktakeFormView` | نموذج الجرد | |
| `OperationsView` | العمليات التشغيلية | صيانة DB |
| `LoginView` | تسجيل الدخول | |
| `InvoiceFormView` | نموذج الفاتورة | |
| `InvoicePrintView` | طباعة الفاتورة | |

### State Management (Pinia Stores)
| Store | الوظيفة |
|-------|---------|
| `useAppStore` | الثيم (Dark/Light)، Sidebar، وضع الخصوصية |
| `useAuthStore` | حالة الجلسة، التوكن، صلاحيات المستخدم، Route Guards |

### ميزات Frontend استثنائية
1. **Offline POS**: مبيعات الفرع تعمل بدون إنترنت (IndexedDB) وترسل كـ Batch عند الاتصال
2. **WebSocket Live Sync**: مزامنة فورية للمبيعات والمصروفات بدون تحديث الصفحة
3. **RTL Support**: دعم كامل للغة العربية من اليمين لليسار
4. **Excel Import/Export**: استيراد وتصدير المبيعات، المرتجعات، المخزون، والمنتجات
5. **Direct Thermal Printing**: طباعة إيصالات حرارية مباشرة
6. **Barcode Scanner**: دعم ماسح الباركود في شاشة الكاشير

---

## 📡 هيكل الـ API

### المسارات الرئيسية (Base: `/api/v1`)
| المسار | الوصف | الصلاحية |
|--------|-------|----------|
| `POST /auth/login` | تسجيل الدخول | عام |
| `GET/POST /sales` | المبيعات | sales:view / sales:create |
| `GET/POST /products` | المنتجات | products:view / products:create |
| `GET/POST /inventory/*` | المخزون والحركات | inventory:view / inventory:edit |
| `GET/POST /costs/recipes` | الوصفات | costs:view / costs:manage |
| `GET/POST /purchases` | المشتريات | purchases:view / purchases:create |
| `GET/POST /customers` | العملاء | customers:view / customers:create |
| `GET/POST /suppliers` | الموردين | suppliers:view / suppliers:create |
| `GET/POST /hr/*` | الموارد البشرية | hr:view / hr:manage |
| `GET/POST /invoices` | الفواتير | invoices:view / invoices:create |
| `GET/POST /stocktakes` | الجرد | stocktakes:view / stocktakes:create |
| `GET /dashboard` | لوحة القيادة | dashboard:view |
| `GET /reports/*` | التقارير | reports:view |
| `GET /forecasting/*` | التنبؤات | forecasting:view |
| `POST /backup/*` | النسخ الاحتياطي | admin only |
| `GET/POST /users` | إدارة المستخدمين | users:view / users:create |

### الـ Middleware Chain
```
Request → requestId → helmet → cors → rateLimit → authenticate → authorize → validate(schema) → controller → auditLog → Response
```

### التحقق من البيانات (Validation)
- **مكتبة Zod**: كل endpoint له schema محدد
- **دعم الأرقام العربية**: تحويل تلقائي من ٠١٢٣ إلى 0123
- **Preprocessing**: تنظيف المدخلات قبل الحفظ

---

## 🔄 أنماط معمارية مهمة (Architecture Patterns)

### 1. Database Transactions
- كل عملية حساسة (بيع، شراء، إنتاج، رواتب) تعمل داخل Transaction
- `BEGIN` → عمليات متعددة → `COMMIT` أو `ROLLBACK` عند الخطأ

### 2. Row Locking (Concurrency Control)
- `SELECT ... FOR UPDATE` على صفوف المخزون
- يمنع Race Conditions عند سحب نفس المنتج من عدة مستخدمين

### 3. In-Memory Caching
- نظام Cache داخلي مع TTL (60 ثانية للـ Dashboard)
- دعم Tags لإبطال مجموعات من الكاش

### 4. Error Handling بالعربي
- أخطاء PostgreSQL تُترجم تلقائياً لرسائل عربية واضحة
- مثال: "هذا السجل مستخدم في جداول أخرى ولا يمكن حذفه"

### 5. Batch Processing
- معالجة عمليات المبيعات والمخزون دفعة واحدة لتحسين الأداء
- تجنب مشكلة N+1 queries

---

## 🧪 الاختبارات (Testing)

- **المحرك**: `node:test` (المدمج في Node.js)
- **اختبارات المنطق**: حسابات المشتريات، الخصومات، تحويل الوحدات، التكلفة الشجرية
- **اختبارات التكامل**: على DB اختبارية معزولة (`localhost`) — تتضمن:
  - تحويلات المخزون
  - تطبيق الجرد
  - استهلاك المواد الخام عند الإنتاج
  - آليات Row Locking

---

## 📋 قواعد عامة مهمة

1. **كل الأسعار بالجنيه المصري (EGP)**
2. **الضرائب**: يدعم ضريبة القيمة المضافة (VAT) قابلة للتخصيص
3. **الوحدات**: نظام وحدات مرن مع معامل تحويل (كجم ↔ جرام، لتر ↔ مل)
4. **الأرقام**: دعم كامل للأرقام العربية والفارسية مع تحويل تلقائي
5. **التوقيت**: مصر (UTC+2/+3)
6. **الـ Sequences**: أرقام المبيعات والفواتير تُولد بـ PostgreSQL Sequences لمنع التكرار
7. **النسخ الاحتياطي**: تلقائي + يدوي + سحابي، مع تشفير AES-256
8. **الـ Soft Delete**: لا يتم حذف البيانات فعلياً — يتم تعليمها
9. **الترحيلات**: 33 ملف ترحيل متسلسل (001 → 032) مع ملف 018b إضافي
