<template>
  <div class="quote-page" dir="rtl" lang="ar">
    <section class="hero card">
      <div class="hero-brand">
        <AppLogo size="lg" />
        <div>
          <span class="eyebrow">مستند داخلي</span>
          <h2>إنشاء عرض سعر</h2>
          <p>اسم العميل فقط، وبعدها البنود تُكتب يدويًا: اسم البند، الوحدة، وسعر الوحدة.</p>
        </div>
      </div>

      <div class="hero-actions">
        <button type="button" class="btn btn-outline" @click="resetForm">إعادة ضبط</button>
        <button type="button" class="btn btn-outline" :disabled="savingTemplate" @click="saveTemplate">
          {{ savingTemplate ? 'جارٍ حفظ القالب...' : 'حفظ البنود كقالب ثابت' }}
        </button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="downloadPdf">
          {{ saving ? 'جارٍ تجهيز PDF...' : 'تنزيل PDF' }}
        </button>
      </div>
    </section>

    <div class="grid-layout">
      <form class="card editor-panel" @submit.prevent="downloadPdf">
        <div class="panel-head">
          <h3>بيانات العرض</h3>
          <span class="badge">عرض سعر</span>
        </div>

        <div class="form-group">
          <label>اسم العميل</label>
          <input v-model.trim="form.customer_name" type="text" placeholder="اسم العميل أو الشركة" />
        </div>

        <div class="form-group">
          <label>ملاحظات سريعة</label>
          <textarea v-model.trim="form.notes" rows="3" placeholder="أي ملاحظات تظهر في عرض الأسعار..."></textarea>
        </div>

        <div class="items-head">
          <div>
            <h3>البنود</h3>
            <p>اكتب البند يدويًا مع الوحدة وسعر الوحدة فقط.</p>
          </div>
          <button type="button" class="btn btn-outline btn-sm" @click="addItem">+ إضافة بند</button>
        </div>

        <div class="items-list">
          <div v-for="(item, index) in form.items" :key="item.key" class="item-row">
            <div class="item-main">
              <div class="grid-2 compact-grid">
                <div class="form-group">
                  <label>اسم البند</label>
                  <input v-model.trim="item.name" type="text" placeholder="اسم المنتج أو الخدمة" />
                </div>
                <div class="form-group">
                  <label>الوحدة</label>
                  <input v-model.trim="item.unit" type="text" placeholder="قطعة / كرتونة / ساعة" />
                </div>
              </div>

              <div class="form-group narrow">
                <label>سعر الوحدة</label>
                <input v-model.number="item.price" min="0" step="0.01" type="number" />
              </div>
            </div>
            <div class="item-side">
              <button v-if="form.items.length > 1" type="button" class="btn btn-sm btn-danger" @click="removeItem(index)">حذف</button>
            </div>
          </div>
        </div>

        <p v-if="error" class="status error">{{ error }}</p>
        <p v-if="success" class="status success">{{ success }}</p>
        <p v-if="templateMessage" class="status info">{{ templateMessage }}</p>
      </form>

      <aside class="card preview-panel">
        <div class="panel-head">
          <h3>معاينة سريعة</h3>
          <span class="badge soft">بدون إجماليات</span>
        </div>

        <div class="preview-doc invoice-doc">
          <img src="/logo.png" class="inv-watermark" alt="" />
          <header class="inv-header">
            <div class="inv-brand">
              <AppLogo size="lg" :rounded="true" />
              <div>
                <h1>بن العجوز</h1>
                <p class="tagline">للحب التركي</p>
                <p><strong>العنوان:</strong> جمهورية مصر العربية</p>
                <p><strong>الهاتف:</strong> 01000000000</p>
              </div>
            </div>
            <div class="inv-title-box">
              <span class="inv-type">عرض سعر</span>
              <span class="inv-number">QUO-TEMP</span>
            </div>
          </header>

          <div class="inv-parties">
            <div class="party-box">
              <h4>بيانات العميل</h4>
              <p><strong>الاسم:</strong> {{ form.customer_name || 'عميل نقدي' }}</p>
            </div>
            <div class="party-box meta">
              <p><strong>تاريخ الإصدار:</strong> {{ new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) }}</p>
              <p><strong>الصلاحية:</strong> ساري لمدة 15 يوم</p>
            </div>
          </div>

          <table class="inv-table">
            <thead>
              <tr>
                <th style="width: 8%">#</th>
                <th style="width: 50%">البيان</th>
                <th style="width: 17%">الوحدة</th>
                <th style="width: 25%">السعر</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, i) in form.items" :key="item.key">
                <td>{{ i + 1 }}</td>
                <td>{{ item.name || 'بند بدون اسم' }}</td>
                <td>{{ item.unit || 'وحدة' }}</td>
                <td>{{ formatMoney(item.price) }}</td>
              </tr>
            </tbody>
          </table>

          <p v-if="form.notes" class="inv-notes"><strong>ملاحظات:</strong> {{ form.notes }}</p>

          <footer class="inv-footer">
            <p>نتشرف بخدمتكم دائمًا، ونشكركم على ثقتكم في بن العجوز.</p>
          </footer>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import AppLogo from '@/components/AppLogo.vue';
import { quotes as quotesApi } from '@/api';
import { formatMoney } from '@/utils/currency';

const templateStorageKey = 'quote_template';
const makeKey = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const makeItem = (seed = {}) => ({
  key: seed.key || makeKey(),
  name: seed.name || '',
  unit: seed.unit || '',
  price: Number(seed.price) || 0,
});

const form = reactive({
  customer_name: '',
  notes: '',
  items: [makeItem()],
});

const saving = ref(false);
const savingTemplate = ref(false);
const error = ref('');
const success = ref('');
const templateMessage = ref('');
const savedTemplate = ref({ items: [makeItem()] });

// formatMoney is imported from @/utils/currency

const normalizeTemplate = (source) => ({
  items: (Array.isArray(source?.items) ? source.items : [])
    .map((item) => makeItem({
      key: item.key,
      name: item.name || item.product_name || item.description || '',
      unit: item.unit || '',
      price: item.price ?? item.unit_price ?? 0,
    }))
    .filter((item) => item.name.trim()),
});

const applyTemplate = (template) => {
  const next = normalizeTemplate(template);
  savedTemplate.value = next.items.length ? next : { items: [makeItem()] };
  form.items = savedTemplate.value.items.map((item) => ({ ...item }));
};

const persistTemplateLocal = (template) => {
  try {
    localStorage.setItem(templateStorageKey, JSON.stringify(template));
  } catch {
    // ignore local storage failures
  }
};

const readTemplateLocal = () => {
  try {
    const raw = localStorage.getItem(templateStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeTemplate(parsed);
  } catch {
    return null;
  }
};

const loadTemplate = async () => {
  templateMessage.value = '';
  try {
    const res = await quotesApi.template();
    const template = normalizeTemplate(res?.data || res || { items: [] });
    if (template.items.length) {
      applyTemplate(template);
      persistTemplateLocal(template);
      templateMessage.value = 'تم تحميل قالب البنود المحفوظ.';
      return;
    }
  } catch {
    // fall back to local cache
  }

  const localTemplate = readTemplateLocal();
  if (localTemplate?.items?.length) {
    applyTemplate(localTemplate);
    templateMessage.value = 'تم تحميل قالب البنود من الجهاز.';
    return;
  }

  applyTemplate({ items: [makeItem()] });
  templateMessage.value = 'ابدأ بإضافة البنود ثم احفظها كقالب ثابت.';
};

const addItem = () => form.items.push(makeItem());
const removeItem = (index) => {
  if (form.items.length === 1) return;
  form.items.splice(index, 1);
};

const resetForm = () => {
  form.customer_name = '';
  form.notes = '';
  form.items = savedTemplate.value.items.map((item) => ({ ...item, key: makeKey() }));
  error.value = '';
  success.value = '';
};

const buildPayload = () => ({
  customer_name: form.customer_name.trim(),
  notes: form.notes.trim(),
  items: form.items
    .filter((item) => item.name.trim())
    .map((item) => ({
      product_name: item.name.trim(),
      description: item.name.trim(),
      unit: item.unit.trim(),
      unit_price: Number(item.price) || 0,
    })),
});

const saveTemplate = async () => {
  templateMessage.value = '';
  const template = normalizeTemplate({
    items: form.items.filter((item) => item.name.trim()).map((item) => ({
      name: item.name,
      unit: item.unit,
      price: item.price,
    })),
  });
  if (!template.items.length) {
    error.value = 'أضف بندًا واحدًا على الأقل قبل حفظ القالب.';
    return;
  }

  savingTemplate.value = true;
  try {
    const res = await quotesApi.saveTemplate(template);
    const saved = normalizeTemplate(res?.data || res || template);
    applyTemplate(saved);
    persistTemplateLocal(saved);
    templateMessage.value = 'تم حفظ البنود كقالب ثابت.';
  } catch (e) {
    persistTemplateLocal(template);
    savedTemplate.value = template.items.length ? template : { items: [makeItem()] };
    error.value = e?.message || 'فشل حفظ القالب';
  } finally {
    savingTemplate.value = false;
  }
};

const downloadPdf = async () => {
  error.value = '';
  success.value = '';

  const payload = buildPayload();
  if (!payload.customer_name) {
    error.value = 'اكتب اسم العميل أولًا.';
    return;
  }
  if (!payload.items.length) {
    error.value = 'أضف بندًا واحدًا على الأقل.';
    return;
  }

  saving.value = true;
  try {
    const el = document.querySelector('.preview-doc');
    const module = await import('html2pdf.js');
    const html2pdf = module.default || module;
    await html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename: `quote-${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(el)
      .save();
    success.value = 'تم تنزيل عرض السعر بنجاح.';
  } catch (e) {
    error.value = e?.message || 'فشل إنشاء ملف PDF';
  } finally {
    saving.value = false;
  }
};

onMounted(loadTemplate);
</script>

<style lang="scss" scoped>
.quote-page {
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  gap: 18px;
}

.hero {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  background:
    radial-gradient(circle at top right, rgba(197, 157, 112, 0.18), transparent 28%),
    linear-gradient(135deg, color-mix(in srgb, var(--bg-elevated) 84%, #fff) 0%, var(--bg-elevated) 100%);
}

.hero-brand {
  display: flex;
  align-items: center;
  gap: 16px;
}

.eyebrow {
  display: inline-flex;
  padding: 5px 10px;
  margin-bottom: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary-strong);
  font-size: 0.74rem;
  font-weight: 800;
}

.hero p {
  margin: 8px 0 0;
  color: var(--text-muted);
  max-width: 60ch;
}

.hero-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.grid-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr);
  gap: 18px;
  align-items: start;
}

.editor-panel,
.preview-panel {
  display: grid;
  gap: 18px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  color: var(--primary-strong);
  font-size: 0.74rem;
  font-weight: 800;
}

.badge.soft {
  background: color-mix(in srgb, var(--success) 10%, transparent);
  color: var(--success);
}

.form-group {
  display: grid;
  gap: 8px;
}

.form-group.narrow {
  max-width: 240px;
}

.form-group label {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-strong);
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--bg);
  color: var(--text-strong);
  padding: 12px 14px;
  transition: var(--transition);
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 14%, transparent);
}

.items-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 10px;
}

.items-head p {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 0.86rem;
}

.items-list {
  display: grid;
  gap: 12px;
}

.item-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-elevated) 92%, #fff);
}

.item-main {
  display: grid;
  gap: 10px;
}

.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.compact-grid {
  gap: 10px;
}

.item-side {
  display: flex;
  align-items: start;
  justify-content: end;
}

.status {
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  font-weight: 700;
}

.status.error {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  color: var(--danger);
}

.status.success {
  background: color-mix(in srgb, var(--success) 10%, transparent);
  color: var(--success);
}

.status.info {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--primary-strong);
}

.preview-panel {
  position: sticky;
  top: 18px;
}

.invoice-doc {
  background: #fff;
  color: #1a1510;
  padding: 30px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
  font-family: 'Cairo', sans-serif;
  position: relative;
  overflow: hidden;
}
.inv-watermark {
  position: absolute;
  top: 55%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 250px;
  height: 250px;
  opacity: 0.04;
  pointer-events: none;
  z-index: 0;
  object-fit: contain;
}
.inv-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 3px solid #5c3d2e;
  margin-bottom: 18px;
}
.inv-brand {
  display: flex;
  gap: 12px;
  align-items: center;
  h1 { font-size: 1.35rem; color: #5c3d2e; margin: 0 0 2px; font-weight: 800; }
  .tagline { color: #8b5e3c; font-size: 0.8rem; margin: 0 0 4px; font-weight: 700; }
  p { margin: 2px 0; font-size: 0.8rem; color: var(--text-muted); }
}
.inv-title-box {
  text-align: left;
  background: linear-gradient(135deg, #5c3d2e, #8b5e3c);
  color: #fff;
  padding: 10px 16px;
  border-radius: 8px;
  .inv-type { display: block; font-size: 0.8rem; opacity: 0.9; }
  .inv-number { display: block; font-size: 1.1rem; font-weight: 800; margin-top: 2px; }
}
.inv-parties {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 18px;
}
.party-box {
  background: var(--bg);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  h4 { margin: 0 0 6px; color: #5c3d2e; font-size: 0.88rem; font-weight: 800; }
  p { margin: 4px 0; font-size: 0.82rem; color: var(--text-strong); }
}
.inv-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 18px;
  th {
    background: #5c3d2e;
    color: #fff;
    padding: 10px;
    text-align: right;
    font-size: 0.85rem;
    font-weight: 800;
  }
  td {
    padding: 10px;
    border-bottom: 1px solid var(--border);
    font-size: 0.82rem;
    color: var(--text-strong);
  }
  tbody tr:nth-child(even) { background: var(--bg); }
}
.inv-notes {
  background: #fff9e6;
  padding: 10px;
  border-radius: 6px;
  border-right: 4px solid #c9a227;
  font-size: 0.82rem;
  color: #7c5f00;
  margin-bottom: 12px;
}
.inv-footer {
  text-align: center;
  margin-top: 20px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  p { font-size: 0.78rem; margin: 0; }
}

@media (max-width: 980px) {
  .grid-layout {
    grid-template-columns: 1fr;
  }

  .preview-panel {
    position: static;
  }
}

@media (max-width: 720px) {
  .hero,
  .hero-brand,
  .hero-actions,
  .items-head,
  .item-row {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: stretch;
  }

  .grid-2 {
    grid-template-columns: 1fr;
  }

  .form-group.narrow {
    max-width: none;
  }
}
</style>
