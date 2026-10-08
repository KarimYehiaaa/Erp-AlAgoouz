# 🧠 Bin Al-Agoouz ERP — Analytics & AI Companion Service

خدمة التحليلات الذكية والتنبؤ بالطلب المرافقة لنظام **بن العجوز ERP**.

## 🏗️ المعمارية (Companion Architecture)

- **Node.js (Core ERP)**: يظل المحرك الأساسي لكافة العمليات المالية، المبيعات، نقاط البيع (POS)، المخزون، والترحيل المحاسبي.
- **Python (FastAPI Companion)**: يعمل كخدمة مرافقة لمعالجة النماذج الإحصائية الثقيلة وحسابات الذكاء الاصطناعي دون إثقال كاهل خادم الـ ERP الرئيسي.
- **استقلال التحليل المدمج**: تستخدم مسارات ERP الحالية خوارزميات TypeScript؛ لا تستدعي هذه الخدمة تلقائيًا. يتوفر عميل `analyticsCompanionService.ts` للربط، ويعيد `null` عند فشل الاتصال أو الاستجابة حتى يستطيع المستدعي تطبيق بديل محلي. تشغيل Python وحده لا يفعّل هذا الربط داخل الشاشات.

---

## 🚀 نقاط النهاية (Endpoints)

1. **`GET /health`**: فحص جاهزية الخدمة.
2. **`POST /forecast/demand`**: التنبؤ الإحصائي بالطلب المستقبلي على أصناف المقهى والبن الأخضر والمحمص بنموذج Holt الخطي، دون مكوّن موسمي.
3. **`POST /analytics/churn-risk`**: تصنيف احتمالية انقطاع العملاء (Customer Churn) بناءً على منحنيات الحداثة والتكرار (RFM).
4. **`POST /analytics/menu-matrix`**: تحليل هندسة القائمة (Stars, Workhorses, Puzzles, Dogs) للربحية والمبيعات.
5. **`POST /analytics/anomalies`**: الكشف عن الشذوذ الإحصائي في الفروقات النقدية وإلغاءات الفواتير.

---

## 🛠️ التشغيل المحلي

```bash
cd analytics-service
python -m pip install uv
uv sync --locked
# Set ANALYTICS_API_KEY in the process environment from your secret manager.
# The same key must be configured in the ERP backend environment.
uv run --locked uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

لتشغيل اختبارات الخدمة محليًا:

```bash
uv run --locked pytest -p no:cacheprovider -q
```

ملف `uv.lock` هو مصدر الإصدارات المثبتة عبر Windows وLinux وPython 3.12–3.14. ملفا `requirements.txt` و`requirements-dev.txt` صادران منه للاستخدام مع pip؛ صورة Docker تثبت ملف التشغيل مع التحقق من hashes. بعد تعديل التبعيات، حدّث القفل باستخدام `uv lock` ثم صدّر الملفين من القفل.

صورة Docker تثبت تبعيات التشغيل فقط؛ أدوات الاختبار وملفات البيئة والـvirtualenv المحلية مستبعدة من سياق البناء:

```bash
docker build -t bin-alagoouz-analytics .
docker run --env ANALYTICS_API_KEY -p 127.0.0.1:8001:8001 bin-alagoouz-analytics
```

تتوقف الخدمة عند البدء إذا لم يُضبط `ANALYTICS_API_KEY`؛ لا يقرأ التطبيق ملف `.env` تلقائيًا. اضبط القيمة في بيئة العملية، واضبط `ANALYTICS_SERVICE_URL` في خادم ERP على عنوان الخدمة. المثال يربط المنفذ بالمضيف المحلي فقط؛ داخل شبكة Docker يحتاج خادم ERP إلى اسم حاوية التحليلات بدل localhost. اختيار `ANALYTICS_ENV=development` مع `ANALYTICS_REQUIRE_AUTH=false` يلغي المصادقة صراحةً للاختبار المحلي فقط، ولا يصلح للإنتاج.

ترفض الخدمة الأرقام غير المنتهية مثل NaN وInfinity برد 422. مدة التوقع عدد صحيح من 1 إلى 365 يومًا، وحد الشذوذ موجب؛ يمنع سقف السنة تخصيص قوائم توقع ضخمة بطلب واحد. تمثل `forecast_30d` أول 30 يومًا من التوقع المتاح، حتى عند طلب مدة أطول؛ لا تضاعف قلة البيانات هذا الإجمالي. تشمل CI اختبارات Python 3.12 مستقلة عن اختبارات الويب والخادم.
