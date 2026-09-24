<!--
  ExcelGuide.vue — دليل شكل ملف Excel الصحيح لاستيراد المبيعات
  جدول توضيحي ثابت + قواعد كتابة الأعمدة (المحل/جملة/delete_all).
  استُخرج من SalesView لتقليل حجم الملف المركزي (كان 2,463 سطرًا).
-->
<template>
  <details class="excel-guide card" open>
    <summary>شكل الملف الصحيح (ورقة «مبيعات» فقط)</summary>
    <p class="guide-note">السطر 1 = عناوين ثابتة. من السطر 2 = بياناتك. لا تعدّل أسماء الأعمدة.</p>
    <div class="guide-table-wrap">
      <table class="guide-table">
        <thead>
          <tr>
            <th>تاريخ_البيع</th>
            <th>نوع_البيع</th>
            <th>المبلغ_جنيها</th>
            <th>كود_العميل</th>
            <th>حالة_الدفع</th>
            <th>طريقة_الدفع</th>
            <th>ملاحظات</th>
            <th>الإجراء</th>
          </tr>
        </thead>
        <tbody>
          <tr class="ok-row">
            <td>2026-05-21</td>
            <td>retail</td>
            <td>1500</td>
            <td></td>
            <td>paid</td>
            <td>cash</td>
            <td>مبيعات المحل</td>
            <td></td>
          </tr>
          <tr class="ok-row">
            <td>21/05/2026</td>
            <td>wholesale</td>
            <td>8500</td>
            <td>C-002</td>
            <td>paid</td>
            <td>transfer</td>
            <td>جملة</td>
            <td></td>
          </tr>
          <tr class="warn-row">
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td>حذف كل المبيعات الحالية</td>
            <td>delete_all</td>
          </tr>
          <tr class="bad-row">
            <td colspan="8">خطأ شائع: كتابة نوع بيع غير مدعوم — الصحيح: retail أو wholesale فقط</td>
          </tr>
        </tbody>
      </table>
    </div>
    <ul class="guide-list">
      <li><strong>المحل:</strong> نوع_البيع = <code>retail</code> — اترك كود_العميل فارغاً</li>
      <li>
        <strong>جملة:</strong> نوع_البيع = <code>wholesale</code> — كود عميل مثل
        <code>C-002</code>
      </li>
      <li>
        <strong>حذف كل المبيعات:</strong> اكتب <code>delete_all</code> في عمود
        <code>الإجراء</code> بأي صف
      </li>
      <li>أكواد العملاء المتاحة: {{ customerCodesHint }}</li>
    </ul>
  </details>
</template>

<script setup lang="ts">
/**
 * دليل ملف Excel — يستهلك من SalesView.
 *
 * @props customerCodesHint  قائمة أكواد العملاء المتاحة للعرض
 */
defineProps<{
  customerCodesHint: string;
}>();
</script>

<style lang="scss" scoped>
.excel-guide {
  summary {
    cursor: pointer;
    font-weight: 700;
    color: var(--text-strong);
  }
  .guide-note {
    color: var(--text-muted);
    font-size: 0.88rem;
    margin: 8px 0 12px;
  }
  .guide-table-wrap {
    overflow-x: auto;
  }
  .guide-table {
    width: 100%;
    font-size: 0.8rem;
    border-collapse: collapse;
    th,
    td {
      border: 1px solid var(--border);
      padding: 8px;
      text-align: right;
    }
    th {
      background: linear-gradient(135deg, var(--primary), var(--primary-strong));
      color: #fff;
    }
    .ok-row {
      background: color-mix(in srgb, var(--success) 8%, transparent);
    }
    .warn-row {
      background: color-mix(in srgb, var(--warning) 10%, transparent);
    }
    .bad-row td {
      background: color-mix(in srgb, var(--danger) 8%, transparent);
      color: var(--danger);
    }
  }
  code {
    background: var(--bg);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.82rem;
  }
  .guide-list {
    margin: 12px 0 0;
    padding-right: 20px;
    font-size: 0.88rem;
  }
}
</style>
