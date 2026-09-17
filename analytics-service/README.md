# 🧠 Bin Al-Agoouz ERP — Analytics & AI Companion Service

خدمة التحليلات الذكية والتنبؤ بالطلب المرافقة لنظام **بن العجوز ERP**.

## 🏗️ المعمارية (Companion Architecture)

- **Node.js (Core ERP)**: يظل المحرك الأساسي لكافة العمليات المالية، المبيعات، نقاط البيع (POS)، المخزون، والترحيل المحاسبي.
- **Python (FastAPI Companion)**: يعمل كخدمة مرافقة لمعالجة النماذج الإحصائية الثقيلة وحسابات الذكاء الاصطناعي دون إثقال كاهل خادم الـ ERP الرئيسي.
- **تسامح تام مع الأعطال (Fault-Tolerant Fallback)**: في حال عدم تشغيل هذه الخدمة، يعود خادم Node.js تلقائياً ودون أي توقف للخوارزميات الإحصائية المدمجة (Pure TypeScript fallback).

---

## 🚀 نقاط النهاية (Endpoints)

1. **`GET /health`**: فحص جاهزية الخدمة.
2. **`POST /forecast/demand`**: التنبؤ الإحصائي بالطلب المستقبلي على أصناف المقهى والبن الأخضر والمحمص بنموذج Holt-Winters.
3. **`POST /analytics/churn-risk`**: تصنيف احتمالية انقطاع العملاء (Customer Churn) بناءً على منحنيات الحداثة والتكرار (RFM).
4. **`POST /analytics/menu-matrix`**: تحليل هندسة القائمة (Stars, Workhorses, Puzzles, Dogs) للربحية والمبيعات.
5. **`POST /analytics/anomalies`**: الكشف عن الشذوذ الإحصائي في الفروقات النقدية وإلغاءات الفواتير.

---

## 🛠️ التشغيل المحلي

```bash
cd analytics-service
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --port 8001 --reload
```

## 🐳 التشغيل عبر Docker

```bash
docker build -t bin-alagoouz-analytics .
docker run -p 8001:8001 bin-alagoouz-analytics
```
