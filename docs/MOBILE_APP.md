# تطبيق الموبايل — بن العجوز ERP (Android)

تطبيق أندرويد أصلي يغلّف واجهة الـ ERP نفسها (Vue 3) عبر **Capacitor**، ويتصل بنفس
خادم الـ API وبنفس قاعدة بيانات PostgreSQL — لا يوجد باكند منفصل للتطبيق.

## كيف يعمل

- التطبيق يعرض الواجهة المبنية من `frontend/dist` داخل WebView أصلي.
- كل الطلبات تذهب إلى خادم الـ API المُستضاف (`/api/v1/...`) الذي يتصل بـ PostgreSQL وRedis.
- داخل التطبيق لا تعمل الكوكيز عبر الأصول المختلفة، لذلك تعتمد الجلسة على
  `Authorization: Bearer <token>` مع refresh token مخزّن محليًا (نفس آلية الويب مع fallback).

## ضبط عنوان الخادم

ثلاث طرق (بترتيب الأولوية داخل التطبيق):

1. **شاشة الدخول داخل التطبيق** — حقل «عنوان الخادم» يظهر فقط داخل التطبيق،
   ويُحفظ في `localStorage` (مفتاح `MOBILE_API_URL`) ويمكن تغييره في أي وقت.
2. **متغير البناء** — عند بناء الواجهة للتطبيق:
   ```
   VITE_API_URL=https://erp.example.com npm run mobile:sync
   ```
3. افتراضيًا: فارغ → يجب إدخاله من شاشة الدخول.

> مطلوب HTTPS في الإنتاج لأن WebView يعمل على `https://localhost`
> (أي طلب http سيُحجب كـ mixed content).

## البناء والتشغيل

```bash
# متطلبات: Android Studio (يوفّر SDK + Gradle + JBR)
# ملاحظة: Capacitor 8 يحتاج Java 21+ — السكريبت بيلتقط JBR من Android Studio تلقائيًا

# 1. بناء الواجهة ومزامنتها مع مشروع الأندرويد
npm run mobile:sync

# 2. فتح المشروع في Android Studio للبناء والتشغيل على جهاز/محاكي
npm run mobile:android

# أو بناء APK تجريبي مباشرة من الطرفية:
npm run mobile:apk
# الناتج: android/app/build/outputs/apk/debug/app-debug.apk
```

### إعداد الـ SDK على جهاز جديد

إذا كان قرص C: ممتلئ، يمكن تسطيب الـ SDK على D: يدويًا:
1. حمّل Android Command Line Tools من Google وفكّها في `D:\android-sdk\cmdline-tools\latest`
2. `sdkmanager "platforms;android-36" "build-tools;36.0.0" platform-tools` ثم اقبل التراخيص
3. أنشئ `android/local.properties` بالسطر: `sdk.dir=D\:\\android-sdk`

الملف `android/local.properties` غير متتبع في Git (مُستثنى في .gitignore) لاختلاف المسارات بين الأجهزة.

## تعديل أيقونة واسم التطبيق

- الاسم: `appName` في `capacitor.config.json` (حاليًا «بن العجوز»).
- الأيقونات: `android/app/src/main/res/mipmap-*/ic_launcher.png`
  (يمكن توليدها من `frontend/public/icons/icon-512.png`).

## ملاحظات أمنية مهمة

- **CORS**: التطبيق يرسل `Origin: https://localhost` — إن كان الخادم يستخدم
  `helmet` + قائمة CORS صارمة، أضِف `https://localhost` إلى `CORS_ORIGIN` في
  `.env` الخاص بالخادم، أو اتركه (الخادم يسمح للطلبات بدون Origin فقط —
  والـ WebView يرسل Origin دائمًا، لذا الإضافة ضرورية).
- **WebSocket**: المزامنة اللحظية (`/ws`) تُشتق من عنوان الخادم تلقائيًا
  (`https→wss`). الخادم يتحقق من Origin — أضِف `https://localhost` لنفس السبب أعلاه.
- **رفع الملفات/الروابط الخارجية** تعمل داخل WebView كالمتصفح.

## أرقام الإصدار (أتمتة)

المصدر الوحيد: `android/version.properties` — يُدار بأمر واحد:

```bash
npm run mobile:bump             # patch:  1.0.0 → 1.0.1 (الإصلاحات الصغيرة)
npm run mobile:bump -- minor    # minor:  1.0.0 → 1.1.0 (ميزات جديدة)
npm run mobile:bump -- major    # major:  1.0.0 → 2.0.0 (تغييرات كبرى)
npm run mobile:bump -- show     # عرض الأرقام الحالية
```

كل bump يزيد `versionCode` بمقدار 1 (شرط جوجل بلاي: رقم فريد تصاعدي لكل رفع) ويحدّث `versionName` المعروض للمستخدم.

**دورة الإصدار الكاملة:**

```bash
# زيادة الإصدار + بناء AAB موقّعة في خطوة واحدة:
npm run mobile:bump -- patch --build

# أو مع إنشاء git tag للإصدار:
npm run mobile:bump -- minor --tag
git push origin v1.1.0

# أو يدويًا: زد الإصدار ثم ابنِ
npm run mobile:bump -- minor
npm run mobile:aab
```

> يمكن للـ CI تجاوز الأرقام بمتغيرات البيئة `APP_VERSION_CODE` و`APP_VERSION_NAME` دون تعديل الملف.

## نسخة Release موقّعة (جاهزة لـ Google Play)

### الإعداد (تم مرة واحدة)

- ملف التوقيع: `android/app/bn-al-ajouz-keystore.keystore`
  (alias: `bn-al-ajouz`، صلاحية 25 سنة، CN=Bin Al-Ajouz)
- كلمات المرور: `android/keystore.properties` — **سري وغير متتبع في Git**،
  والقالب للفريق في `android/keystore.properties.example`
- ⚠️ **احتفظ بنسخة احتياطية من ملف الـ keystore وكلمات المرور في مكان آمن** —
  فقدانه يعني عدم القدرة على تحديث التطبيق المنشور نهائيًا (Google Play
  يستطيع إعادة تعيين المفتاح عبر Play App Signing بعد أول رفع فقط).

### البناء

```bash
# AAB للنشر على Google Play
npm run mobile:aab

# APK موقّع للتوزيع المباشر
npm run mobile:release-apk

# النواتج:
# android/app/build/outputs/bundle/release/app-release.aab
# android/app/build/outputs/apk/release/app-release.apk
```

> يتطلب البناء Java 21+ — إذا كان JAVA_HOME أقل، السكريبتات تستخدم تلقائيًا
> JDK 21 المثبت (Temurin) أو JBR من Android Studio.

### التحقق من التوقيع

```bash
D:/android-sdk/build-tools/36.0.0/apksigner.bat verify \
  android/app/build/outputs/apk/release/app-release.apk
# النتيجة المتوقعة: "Verifies" + v2 scheme: true
```

### البناء التلقائي عبر GitHub Actions (CI)

الملف: `.github/workflows/mobile-release.yml` — يعمل تلقائيًا عند دفع tag إصدار:

```bash
npm run mobile:bump -- patch --tag   # زوّد الإصدار + commit + tag v1.0.x
git push origin main --tags          # الدفع يشغّل الـ workflow
```

الـ workflow يبني AAB موقّعة ويرفعها كـ artifact ويُنشئ GitHub Release جاهزًا.

**إعداد لمرة واحدة — GitHub Secrets** (Settings → Secrets and variables → Actions → New repository secret):

| Secret | القيمة |
|---|---|
| `ANDROID_KEYSTORE_B64` | محتوى الـ keystore مشفّر base64 — ولّده محليًا: `base64 -w0 android/app/bn-al-ajouz-keystore.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | كلمة مرور الـ keystore (الموجودة في keystore.properties) |
| `ANDROID_KEY_PASSWORD` | كلمة مرور المفتاح (نفس القيمة) |

> الـ CI يتجاوز أرقام الإصدار بمتغيرات `APP_VERSION_NAME` (من الـ tag) و`APP_VERSION_CODE` (من run_number) — فلا حاجة لرفع version.properties مع كل إصدار.

### خطوات النشر على Google Play (مختصر)

1. أنشئ حساب مطوّر على [Google Play Console](https://play.google.com/console) (رسم لمرة واحدة $25)
2. أنشئ تطبيقًا جديدًا باسم «بن العجوز ERP» وحزمة `com.binalajouz.erp`
3. ارفع `app-release.aab` في Production → New release
4. Play App Signing مفعّل افتراضيًا — مفتاح الرفع (upload key) هو الـ keystore المحلي
5. أكمل بيانات المتجر: الوصف، لقطات الشاشة، أيقونة 512×512 (`frontend/public/icons/icon-512.png`)، سياسة الخصوصية
6. أرسل للمراجعة — أول مراجعة عادة تأيام قليلة

## تحديث التطبيق

بعد أي تعديل على الواجهة:
```bash
npm run mobile:sync
```
ثم أعد البناء من Android Studio أو `gradlew assembleDebug`.
تحديثات الواجهة لا تحتاج إصدارًا جديدًا على المتجر إن كنت تخدم الواجهة من الخادم
(خيار `server.url` في capacitor.config.json — غير مُفعّل حاليًا).
