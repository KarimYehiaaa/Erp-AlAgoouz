<!--
  ReturnTab.vue — تبويب "استرداد بـ Excel": استرداد المخزون الجماعي
  ثلاث خطوات (تحميل القالب ← كتابة الكمية ← فحص ثم رفع) + بطاقة النتيجة
  (معاينة/تفاصيل/أخطاء). استُخرج من InventoryView.vue (كان 1,594 سطرًا).
-->
<template>
  <div class="excel-return-page">
    <!-- Info Card -->
    <div class="card info-card">
      <div class="info-icon"></div>
      <div class="info-body">
        <h3>استرداد المخزون بالجملة عبر Excel</h3>
        <p>
          حمّل القالب — فيه كل المنتجات جاهزة بالكود والاسم والمخزون الحالي. اكتب الكمية المُستردة
          فقط لكل منتج، ثم ارفع الملف.
        </p>
      </div>
    </div>

    <!-- Steps -->
    <div class="steps-row">
      <div class="step-card">
        <div class="step-num">1</div>
        <div class="step-body">
          <strong>حمّل القالب</strong>
          <span>فيه كل المنتجات جاهزة — كود + اسم + مخزون حالي</span>
        </div>
      </div>
      <div class="step-arrow">←</div>
      <div class="step-card">
        <div class="step-num">2</div>
        <div class="step-body">
          <strong>اكتب الكمية</strong>
          <span>في عمود "كمية_الاسترداد" فقط — اترك الباقي فارغاً</span>
        </div>
      </div>
      <div class="step-arrow">←</div>
      <div class="step-card">
        <div class="step-num">3</div>
        <div class="step-body">
          <strong>افحص ثم ارفع</strong>
          <span>افحص الملف أولاً للتأكد، ثم ارفعه للتنفيذ</span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="card actions-card">
      <div class="action-group">
        <div class="action-label">
          <span class="action-num">1</span>
          <strong>تحميل القالب</strong>
          <small>اختر المخزن لتصفية المنتجات (اختياري)</small>
        </div>
        <div class="action-controls">
          <select :value="returnWarehouseId" class="warehouse-select" @change="onWarehouseChange">
            <option value="">كل المخازن</option>
            <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name_ar }}</option>
          </select>
          <button
            class="btn btn-primary"
            :disabled="downloadingTemplate"
            @click="$emit('download')"
          >
            {{ downloadingTemplate ? '⏳ جاري التحميل...' : ' تحميل القالب' }}
          </button>
        </div>
      </div>

      <div class="action-divider"></div>

      <div class="action-group">
        <div class="action-label">
          <span class="action-num">2</span>
          <strong>فحص الملف قبل الرفع</strong>
          <small>تحقق من صحة البيانات بدون تنفيذ</small>
        </div>
        <div class="action-controls">
          <label class="btn btn-outline file-btn">
            فحص الملف
            <input type="file" accept=".xlsx,.xls" hidden @change="onFile('validate')" />
          </label>
        </div>
      </div>

      <div class="action-divider"></div>

      <div class="action-group">
        <div class="action-label">
          <span class="action-num">3</span>
          <strong>رفع وتنفيذ الاسترداد</strong>
          <small>سيتم إضافة الكميات للمخزون فوراً</small>
        </div>
        <div class="action-controls">
          <label class="btn btn-success file-btn">
            رفع وتنفيذ
            <input type="file" accept=".xlsx,.xls" hidden @change="onFile('import')" />
          </label>
        </div>
      </div>
    </div>

    <!-- Result -->
    <div
      v-if="excelResult"
      class="card result-card"
      :class="excelResult.ok === false ? 'result-err' : 'result-ok'"
    >
      <div class="result-header">
        <span class="result-icon">{{
          excelResult.ok === false ? '' : excelResult.success !== undefined ? '' : ''
        }}</span>
        <div>
          <strong>{{ excelResult.title }}</strong>
          <p>{{ excelResult.summary }}</p>
        </div>
      </div>

      <!-- معاينة الفحص -->
      <div v-if="excelResult.preview?.length" class="result-preview">
        <h4>معاينة (أول 5 منتجات صالحة):</h4>
        <table class="inv-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>المنتج</th>
              <th>المخزن</th>
              <th>الكمية</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, idx) in excelResult.preview" :key="`${p.sku}-${idx}`">
              <td class="mono">{{ p.sku }}</td>
              <td>{{ p.product_name }}</td>
              <td>{{ p.warehouse_name || '—' }}</td>
              <td class="qty">+{{ p.quantity }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- نتائج الاستيراد -->
      <div v-if="excelResult.details?.length" class="result-preview">
        <h4>المنتجات التي تم استردادها ({{ excelResult.details.length }}):</h4>
        <table class="inv-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>المنتج</th>
              <th>المخزن</th>
              <th>الكمية المُستردة</th>
              <th>المخزون الجديد</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, idx) in excelResult.details" :key="`${d.sku}-${idx}`">
              <td class="mono">{{ d.sku }}</td>
              <td>{{ d.product_name }}</td>
              <td>{{ d.warehouse_name || '—' }}</td>
              <td class="qty success-text">+{{ d.quantity }}</td>
              <td class="qty">{{ d.new_stock }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- الأخطاء -->
      <div v-if="excelResult.errors?.length || excelResult.failed?.length" class="result-errors">
        <h4>مشاكل ({{ (excelResult.errors || excelResult.failed || []).length }}):</h4>
        <ul>
          <li v-for="(e, i) in excelResult.errors || excelResult.failed || []" :key="i">
            {{ typeof e === 'string' ? e : `سطر ${e.row} — ${e.sku}: ${e.message}` }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * تبويب الاسترداد عبر Excel — يستهلك من InventoryView.
 *
 * @props warehouses             قائمة المخازن (لفلترة القالب)
 * @props returnWarehouseId      المخزن المختار للفلترة (v-model:return-warehouse-id)
 * @props downloadingTemplate    حالة تحميل القالب
 * @props excelResult            بطاقة النتيجة (معاينة/تفاصيل/أخطاء)
 *
 * @emits update:returnWarehouseId  تغيير المخزن المفلتر
 * @emits download                  طلب تحميل القالب
 * @emits validate                  ملف مختار للفحص (File)
 * @emits import                    ملف مختار للتنفيذ (File)
 */
defineProps<{
  warehouses: any[];
  returnWarehouseId: string;
  downloadingTemplate: boolean;
  excelResult: any;
}>();

const emit = defineEmits<{
  'update:returnWarehouseId': [value: string];
  download: [];
  validate: [file: File];
  import: [file: File];
}>();

const onWarehouseChange = (e: Event) => {
  emit('update:returnWarehouseId', (e.target as HTMLSelectElement).value);
};

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
.excel-return-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  .info-icon {
    font-size: 2.5rem;
    flex-shrink: 0;
  }
  h3 {
    margin: 0 0 6px;
    color: var(--primary-dark);
  }
  p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.6;
  }
}

.steps-row {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  .step-card {
    flex: 1;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 18px;
    background: var(--bg-card);
    .step-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--primary);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.9rem;
      flex-shrink: 0;
    }
    strong {
      display: block;
      font-size: 0.9rem;
      color: var(--primary-dark);
      margin-bottom: 3px;
    }
    span {
      font-size: 0.8rem;
      color: var(--text-muted);
    }
  }
  .step-arrow {
    padding: 0 8px;
    color: var(--text-muted);
    font-size: 1.2rem;
    flex-shrink: 0;
  }
}

.actions-card {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  overflow: hidden;
}
.action-group {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  flex-wrap: wrap;
  .action-label {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    .action-num {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: var(--primary);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.82rem;
      flex-shrink: 0;
    }
    strong {
      font-size: 0.95rem;
      color: var(--text-strong);
    }
    small {
      display: block;
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 2px;
    }
  }
  .action-controls {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
}
.action-divider {
  height: 1px;
  background: var(--border);
  margin: 0;
}

.file-btn {
  cursor: pointer;
  position: relative;
  overflow: hidden;
  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
}
.btn-success {
  background: linear-gradient(135deg, #2e7d4f, #1a5c38);
  color: #fff;
  border: none;
  padding: 9px 18px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-weight: 700;
  font-size: 0.9rem;
  transition: var(--transition);
  &:hover {
    opacity: 0.9;
  }
}

/* Result Card */
.result-card {
  border-radius: var(--radius-md);
  overflow: hidden;
  &.result-ok {
    border: 1px solid rgba(46, 125, 79, 0.3);
    background: rgba(46, 125, 79, 0.04);
  }
  &.result-err {
    border: 1px solid rgba(180, 35, 24, 0.3);
    background: rgba(180, 35, 24, 0.04);
  }
  .result-header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 18px 20px;
    .result-icon {
      font-size: 1.8rem;
      flex-shrink: 0;
    }
    strong {
      display: block;
      font-size: 1rem;
      color: var(--text-strong);
      margin-bottom: 4px;
    }
    p {
      margin: 0;
      font-size: 0.88rem;
      color: var(--text-muted);
    }
  }
  .result-preview {
    padding: 0 20px 16px;
    h4 {
      margin: 0 0 10px;
      font-size: 0.9rem;
      color: var(--text-strong);
    }
  }
  .result-errors {
    padding: 0 20px 16px;
    h4 {
      margin: 0 0 8px;
      font-size: 0.9rem;
      color: var(--danger);
    }
    ul {
      margin: 0;
      padding-right: 20px;
      li {
        font-size: 0.85rem;
        color: var(--danger);
        margin: 4px 0;
      }
    }
  }
}

.warehouse-select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  font-size: 0.9rem;
}
.inv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  th {
    background: var(--bg);
    padding: 10px 12px;
    text-align: right;
    font-weight: 700;
    color: var(--text-muted);
    font-size: 0.8rem;
    border-bottom: 2px solid var(--border);
    white-space: nowrap;
  }
  td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  tr:last-child td {
    border-bottom: 0;
  }
  tr:hover td {
    background: color-mix(in srgb, var(--primary) 3%, var(--bg-elevated));
  }
}
.mono {
  font-family: monospace;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.qty {
  font-weight: 700;
}
.success-text {
  color: #2e7d4f;
}
@media (max-width: 768px) {
  .steps-row {
    flex-direction: column;
    .step-arrow {
      transform: rotate(90deg);
    }
  }
  .action-group {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
