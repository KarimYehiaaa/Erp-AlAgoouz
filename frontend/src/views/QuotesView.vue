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

        <div class="preview-doc">
          <div class="preview-top">
            <div>
              <p class="preview-kicker">عرض سعر</p>
              <h4>{{ form.customer_name || 'اسم العميل' }}</h4>
            </div>
          </div>

          <div class="preview-terms">
            <span>البنود</span>
            <ul>
              <li v-for="item in form.items" :key="item.key">
                {{ item.name || 'بند بدون اسم' }} - {{ item.unit || 'وحدة' }} - {{ formatMoney(item.price) }}
              </li>
            </ul>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import AppLogo from '@/components/AppLogo.vue';
import { quotes as quotesApi } from '@/api';

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

const formatMoney = (value) =>
  `${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;

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
    const response = await quotesApi.downloadPdf(payload);
    const blob = response instanceof Blob ? response : response?.data instanceof Blob ? response.data : response;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quote-${new Date().toISOString().slice(0, 10)}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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

.preview-doc {
  display: grid;
  gap: 16px;
  padding: 18px;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--primary) 12%, var(--line));
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(250, 247, 243, 0.98));
  box-shadow: 0 22px 60px rgba(47, 30, 18, 0.08);
}

.preview-top {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.preview-kicker {
  margin: 0 0 6px;
  color: var(--primary-strong);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.preview-top h4 {
  margin: 0;
  font-size: 1.08rem;
}

.preview-terms {
  display: grid;
  gap: 10px;
}

.preview-terms > span {
  font-size: 0.84rem;
  font-weight: 800;
  color: var(--text-strong);
}

.preview-terms ul {
  margin: 0;
  padding-inline-start: 18px;
  display: grid;
  gap: 8px;
  color: var(--text-muted);
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
