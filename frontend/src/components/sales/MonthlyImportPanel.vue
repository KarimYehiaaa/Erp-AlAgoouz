<!--
  MonthlyImportPanel.vue — تبويب "شهري": استيراد مبيعات Excel الشهرية
  رفع ملف مبيعات جهاز المبيعات الرئيسي مع فحص مسبق واستيراد ذكي يخصم المخزون.
  استُخرج من SalesView لتقليل حجم الملف المركزي (كان 2,463 سطرًا).
-->
<template>
  <div class="monthly-view-wrap">
    <div class="card form-card monthly-sales-card" style="max-width: 900px; margin: 0 auto">
      <span class="monthly-kicker">Excel فقط</span>
      <h3>استيراد مبيعات شهرية</h3>
      <p class="monthly-copy">
        ارفع ملف مبيعات جهاز المبيعات الرئيسي هنا وسيتم تسجيلها وخصمها من المخزون تلقائياً.
      </p>
      <div class="monthly-actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="importing"
          @click="$emit('downloadTemplate')"
        >
          تحميل قالب مبيعات شهرية
        </button>
        <label class="btn btn-outline import-btn" :class="{ disabled: validating }">
          {{ validating ? 'جاري الفحص...' : 'فحص ملف Excel' }}
          <input
            type="file"
            accept=".xlsx,.xls"
            hidden
            :disabled="validating"
            @change="onFile('validate')"
          />
        </label>
        <label
          class="btn btn-success monthly-import-btn import-btn"
          :class="{ disabled: importing }"
          role="button"
        >
          {{ importing ? 'جاري الاستيراد...' : 'استيراد ذكي وخصم المخزون' }}
          <input
            type="file"
            accept=".xlsx,.xls"
            hidden
            :disabled="importing"
            @change="onFile('import')"
          />
        </label>
      </div>
      <div class="monthly-rules">
        <span>المخزن المستهدف: مخزون المحل</span>
        <span>نوع البيع: مبيعات شهرية</span>
        <span>الدفع الافتراضي: مدفوع</span>
      </div>
      <div v-if="msg || details.length" class="import-result inline" :class="{ err }">
        <p class="import-msg" :class="{ err }">{{ msg }}</p>
        <ul v-if="details.length" class="import-details">
          <li v-for="(d, i) in details" :key="i">{{ d }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * تبويب الاستيراد الشهري — يستهلك من SalesView.
 *
 * @props importing   حالة الاستيراد
 * @props validating  حالة الفحص
 * @props msg         رسالة النتيجة
 * @props err         هل الرسالة خطأ
 * @props details     تفاصيل النتيجة (أسطر)
 *
 * @emits downloadTemplate  طلب تحميل القالب الشهري
 * @emits validate          ملف مختار للفحص (File)
 * @emits import            ملف مختار للاستيراد (File)
 */
const emit = defineEmits<{
  downloadTemplate: [];
  validate: [file: File];
  import: [file: File];
}>();

defineProps<{
  importing: boolean;
  validating: boolean;
  msg: string;
  err: boolean;
  details: any[];
}>();

/** تمرير الملف للأب ثم تصفير الحقل (يسمح بإعادة اختيار نفس الملف). */
const onFile = (kind: 'validate' | 'import') => (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (kind === 'validate') emit('validate', file);
  else emit('import', file);
  input.value = '';
};
</script>

<style lang="scss" scoped>
.form-card {
  position: relative;
  overflow: hidden;
  border-color: var(--sales-panel-border);
  border-radius: calc(var(--radius-lg) + 2px);
  background:
    radial-gradient(
      circle at top left,
      color-mix(in srgb, var(--primary) 8%, transparent),
      transparent 32%
    ),
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--card-bg) 94%, var(--primary) 4%),
      var(--bg-elevated)
    );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    var(--shadow-xs);
}
.form-card::before {
  content: '';
  position: absolute;
  inset: 0;
  height: 4px;
  background: linear-gradient(
    90deg,
    var(--primary),
    color-mix(in srgb, var(--accent) 70%, var(--primary)),
    transparent
  );
  opacity: 0.74;
}
.monthly-sales-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  background:
    radial-gradient(
      circle at 15% 10%,
      color-mix(in srgb, var(--accent) 18%, transparent),
      transparent 28%
    ),
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--card-bg) 92%, var(--primary) 7%),
      var(--bg-elevated)
    );
}
.monthly-sales-card h3 {
  margin-bottom: 0;
}
.monthly-kicker {
  width: fit-content;
  padding: 5px 11px;
  border-radius: 999px;
  color: var(--primary-strong);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
  font-size: 0.76rem;
  font-weight: 950;
}
.monthly-copy {
  position: relative;
  z-index: 1;
  margin: 0;
  color: var(--text-muted);
  line-height: 1.8;
  font-size: 0.92rem;
  font-weight: 750;
}
.monthly-actions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.monthly-actions .btn {
  min-height: 42px;
  border-radius: 999px;
  font-weight: 900;
  cursor: pointer;
}
.monthly-actions .monthly-import-btn {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(
    135deg,
    var(--success),
    color-mix(in srgb, var(--success) 72%, #052e16)
  );
  box-shadow: 0 12px 24px color-mix(in srgb, var(--success) 24%, transparent);
}
.monthly-actions .monthly-import-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 16px 30px color-mix(in srgb, var(--success) 30%, transparent);
}
.monthly-actions .btn.disabled {
  opacity: 0.5;
  pointer-events: none;
}
.monthly-rules {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
}
.monthly-rules span {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  color: var(--text);
  background: color-mix(in srgb, var(--bg-elevated) 78%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 12%, var(--border));
  font-size: 0.8rem;
  font-weight: 850;
}
.import-btn {
  cursor: pointer;
  margin: 0;
}
.import-result.inline {
  position: relative;
  z-index: 1;
  margin-top: 0;
}
.import-result {
  margin-top: 4px;
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  background: color-mix(in srgb, var(--success) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
}
.import-result.err {
  background: color-mix(in srgb, var(--danger) 6%, transparent);
  border-color: color-mix(in srgb, var(--danger) 20%, transparent);
}
.import-msg {
  margin: 0 0 8px;
  font-weight: 700;
  color: var(--success);
}
.import-result.err .import-msg {
  color: var(--danger);
}
.import-details {
  margin: 0;
  padding-right: 20px;
  font-size: 0.88rem;
  color: var(--text);
  li {
    margin: 4px 0;
  }
}
@media (max-width: 640px) {
  .monthly-rules {
    grid-template-columns: 1fr;
  }
}
</style>
