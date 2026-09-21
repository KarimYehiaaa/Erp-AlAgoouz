<template>
  <div class="excel-mode card">
    <h3>استيراد مبيعات المحل من Excel</h3>
    <p class="excel-note">
      حمّل القالب — فيه كل منتجات المحل جاهزة بالكود والاسم والسعر. اكتب الكمية فقط لكل منتج بيع، ثم
      ارفع الملف.
    </p>

    <div class="excel-actions">
      <button class="btn btn-primary" @click="emit('download')" :disabled="downloadingTemplate">
        {{ downloadingTemplate ? '⏳ جاري التحميل...' : ' تحميل القالب (منتجات جاهزة)' }}
      </button>
      <label class="btn btn-outline import-label">
        فحص الملف قبل الرفع
        <input type="file" accept=".xlsx,.xls" hidden @change="onValidate($event)" />
      </label>
      <label class="btn btn-outline import-label">
        رفع واستيراد
        <input type="file" accept=".xlsx,.xls" hidden @change="onImport($event)" />
      </label>
    </div>

    <!-- نتيجة الفحص / الاستيراد -->
    <div v-if="excelMsg" class="import-result" :class="{ 'import-err': excelErr }">
      <p class="import-msg">{{ excelMsg }}</p>
      <ul v-if="excelDetails.length" class="import-details">
        <li v-for="(d, i) in excelDetails" :key="i">{{ d }}</li>
      </ul>
    </div>

    <!-- شرح الخطوات -->
    <div class="excel-steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-body">
          <strong>حمّل القالب</strong>
          <span>فيه كل منتجات المحل جاهزة — كود + اسم + سعر</span>
        </div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-body">
          <strong>اكتب الكمية</strong>
          <span>في عمود «الكمية» فقط للمنتجات التي بيعت — اترك الباقي فارغاً</span>
        </div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-body">
          <strong>ارفع الملف</strong>
          <span>سيتم خصم المخزون تلقائياً بناءً على وصفة كل منتج</span>
        </div>
      </div>
    </div>

    <!-- معاينة المنتجات في القالب -->
    <details class="excel-guide" open>
      <summary>معاينة شكل القالب ({{ allProducts.length }} منتج)</summary>
      <div class="guide-table-wrap">
        <table class="guide-table">
          <thead>
            <tr>
              <th>تاريخ_البيع</th>
              <th>كود_المنتج</th>
              <th>اسم_المنتج</th>
              <th>التصنيف</th>
              <th>سعر_البيع</th>
              <th style="background: #2e7d4f">الكمية ← اكتبها هنا</th>
              <th>طريقة_الدفع</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in allProducts.slice(0, 8)" :key="p.id">
              <td class="muted">{{ todayStr }}</td>
              <td>
                <code>{{ p.sku }}</code>
              </td>
              <td>{{ p.name_ar }}</td>
              <td class="muted">{{ p.category_name || '—' }}</td>
              <td>{{ formatMoney(p.sale_price) }}</td>
              <td class="qty-col">___</td>
              <td class="muted">cash</td>
            </tr>
            <tr v-if="allProducts.length > 8">
              <td colspan="7" class="more-row">
                ... و {{ allProducts.length - 8 }} منتج آخر في القالب
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="guide-note">لا تعدّل عمود «كود_المنتج» — هو المرجع الأساسي للاستيراد</p>
    </details>
  </div>
</template>

<script setup lang="ts">
/**
 * @props allProducts — كل منتجات الفرع (لمعاينة القالب)
 * @props downloadingTemplate — حالة تحميل القالب
 * @props excelMsg — رسالة نتيجة الفحص/الاستيراد
 * @props excelErr — هل النتيجة خطأ
 * @props excelDetails — تفاصيل النتيجة
 * @props todayStr — تاريخ اليوم لعرضه في المعاينة
 * @props formatMoney — تنسيق العملة
 * @emits download — تحميل القالب
 * @emits validate — فحص الملف (File)
 * @emits import — استيراد الملف (File)
 */
defineProps<{
  allProducts: any[];
  downloadingTemplate: boolean;
  excelMsg: string;
  excelErr: boolean;
  excelDetails: any[];
  todayStr: string;
  formatMoney: (_v: any) => string;
}>();

const emit = defineEmits<{
  download: [];
  validate: [file: File];
  import: [file: File];
}>();

const onValidate = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) emit('validate', file);
  (e.target as HTMLInputElement).value = '';
};

const onImport = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) emit('import', file);
  (e.target as HTMLInputElement).value = '';
};
</script>

<style lang="scss" scoped>
/* Excel Mode */
.excel-mode {
  h3 {
    margin-bottom: 8px;
    color: var(--primary-dark);
  }
  .excel-note {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin-bottom: 16px;
  }
  .excel-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }
  .import-label {
    cursor: pointer;
  }
}

/* Steps */
.excel-steps {
  display: flex;
  gap: 0;
  margin-bottom: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  .step {
    flex: 1;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 16px;
    border-left: 1px solid var(--border);
    &:last-child {
      border-left: none;
    }
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
    .step-body {
      display: flex;
      flex-direction: column;
      gap: 3px;
      strong {
        font-size: 0.9rem;
        color: var(--primary-dark);
      }
      span {
        font-size: 0.8rem;
        color: var(--text-muted);
      }
    }
  }
}

.import-result {
  padding: 12px;
  border-radius: var(--radius);
  background: rgba(46, 125, 79, 0.08);
  border: 1px solid rgba(46, 125, 79, 0.3);
  &.import-err {
    background: rgba(180, 35, 24, 0.08);
    border-color: rgba(180, 35, 24, 0.3);
  }
  .import-msg {
    margin: 0 0 8px;
    font-weight: 700;
  }
  .import-details {
    margin: 0;
    padding-right: 20px;
    font-size: 0.88rem;
    li {
      margin: 3px 0;
    }
  }
}

.excel-guide {
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  summary {
    cursor: pointer;
    font-weight: 700;
    color: var(--primary-dark);
    margin-bottom: 8px;
  }
  .guide-note {
    color: var(--text-muted);
    font-size: 0.85rem;
    margin-top: 10px;
  }
  .guide-table-wrap {
    overflow-x: auto;
    margin-top: 10px;
  }
  .guide-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    th,
    td {
      border: 1px solid var(--border);
      padding: 7px 10px;
      text-align: right;
    }
    th {
      background: var(--primary);
      color: #fff;
    }
    .muted {
      color: var(--text-muted);
    }
    .qty-col {
      background: rgba(46, 125, 79, 0.08);
      font-weight: 700;
      color: #2e7d4f;
      text-align: center;
    }
    .more-row {
      text-align: center;
      color: var(--text-muted);
      font-style: italic;
    }
    code {
      background: var(--bg);
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 0.8rem;
    }
  }
}
</style>
