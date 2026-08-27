<!--
  SalesSummaryCard.vue — بطاقة "ملخص الفترة" لمبيعات الفرع/الجملة
  تعرض حالة الفترة (تلوين حسب الأداء) وأربع قيم رئيسية:
  بداية المدة / مبيعات محصلة / آجل أو ديون / رصيد متوقع.
  استُخرجت من SalesView لتقليل حجمه (كان الملف 2,648 سطرًا).
-->
<template>
  <section class="sales-insight card" :class="salesHealth.tone">
    <div class="insight-copy">
      <span class="eyebrow">ملخص الفترة</span>
      <h3>{{ salesHealth.title }}</h3>
      <p>{{ salesHealth.message }}</p>
    </div>
    <div class="insight-metrics">
      <div class="insight-tile">
        <span>{{ activeTab === 'wholesale' ? 'ديون سابقة/افتتاحية' : 'بداية المدة' }}</span>
        <strong>{{
          props.formatMoney(
            activeTab === 'wholesale' ? totalOpeningBalanceDebts : openingBalanceForm.amount || 0,
          )
        }}</strong>
      </div>
      <div class="insight-tile success">
        <span>مبيعات محصلة</span>
        <strong>{{ props.formatMoney(collectedTotal) }}</strong>
      </div>
      <div class="insight-tile warning">
        <span>{{
          activeTab === 'wholesale' ? 'إجمالي ديون العملاء الكلية' : 'آجل/جزئي للمتابعة'
        }}</span>
        <strong>{{ props.formatMoney(openCreditTotal) }}</strong>
      </div>
      <div class="insight-tile primary">
        <span>رصيد متوقع</span>
        <strong>{{ props.formatMoney(periodCashTotal) }}</strong>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * بطاقة ملخص الفترة — تستهلك من SalesView.
 *
 * @props salesHealth            حالة الفترة { tone, title, message }
 * @props activeTab              التبويب النشط (branch/wholesale/monthly)
 * @props totalOpeningBalanceDebts  إجمالي الديون الافتتاحية (للجملة)
 * @props openingBalanceForm     نموذج الرصيد الافتتاحي { amount }
 * @props collectedTotal         المبيعات المحصلة
 * @props openCreditTotal        الآجل/الجزئي للمتابعة
 * @props periodCashTotal        الرصيد المتوقع
 * @props formatMoney            دالة تنسيق المبالغ (تمرر من الأب لضمان تطابق العرض)
 */
const props = defineProps<{
  salesHealth: { tone: string; title: string; message: string };
  activeTab: string;
  totalOpeningBalanceDebts: number;
  openingBalanceForm: { amount: number | null };
  collectedTotal: number;
  openCreditTotal: number;
  periodCashTotal: number;
  formatMoney: (_value: number | null | undefined) => string;
}>();
</script>

<style lang="scss" scoped>
.sales-insight {
  display: grid;
  grid-template-columns: minmax(260px, 0.9fr) minmax(520px, 1.35fr);
  gap: 18px;
  align-items: stretch;
  overflow: hidden;
  position: relative;
  padding: 20px;
  border-color: var(--sales-panel-border);
  border-radius: calc(var(--radius-lg) + 2px);
  background:
    linear-gradient(90deg, var(--sales-grid-line) 1px, transparent 1px),
    linear-gradient(0deg, var(--sales-grid-line) 1px, transparent 1px),
    radial-gradient(
      circle at top right,
      color-mix(in srgb, var(--primary) 14%, transparent),
      transparent 34%
    ),
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--surface-1) 94%, var(--primary) 6%),
      var(--surface-2)
    );
  background-size:
    42px 42px,
    42px 42px,
    auto,
    auto;
}
.sales-insight::before {
  content: '';
  position: absolute;
  inset-inline-start: -70px;
  bottom: -90px;
  width: 190px;
  height: 190px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  pointer-events: none;
}
.sales-insight::after {
  content: '';
  position: absolute;
  inset: auto 20px 0 20px;
  height: 3px;
  border-radius: 999px 999px 0 0;
  background: linear-gradient(
    90deg,
    var(--primary),
    color-mix(in srgb, var(--accent) 70%, var(--primary)),
    transparent
  );
  opacity: 0.72;
}
.sales-insight.warning {
  border-color: color-mix(in srgb, var(--warning) 30%, var(--border));
}
.sales-insight.success {
  border-color: color-mix(in srgb, var(--success) 26%, var(--border));
}
.sales-insight.muted {
  border-color: color-mix(in srgb, var(--text-muted) 18%, var(--border));
}
.insight-copy,
.insight-metrics {
  position: relative;
  z-index: 1;
}
.eyebrow {
  display: inline-flex;
  margin-bottom: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  color: var(--primary-strong);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 15%, transparent);
  font-size: 0.76rem;
  font-weight: 900;
  letter-spacing: 0.04em;
}
.insight-copy h3 {
  margin: 0 0 6px;
  color: var(--text-strong);
  font-size: clamp(1.05rem, 1.7vw, 1.35rem);
  font-weight: 950;
  letter-spacing: -0.03em;
}
.insight-copy p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.75;
}
.insight-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.insight-tile {
  position: relative;
  overflow: hidden;
  min-height: 92px;
  padding: 15px 16px;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--primary) 12%, var(--border));
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--bg-elevated) 88%, transparent),
    color-mix(in srgb, var(--card-bg) 72%, transparent)
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    var(--shadow-xs);
}
.insight-tile::before {
  content: '';
  position: absolute;
  inset-inline-end: 0;
  top: 13px;
  bottom: 13px;
  width: 4px;
  border-radius: 999px 0 0 999px;
  background: color-mix(in srgb, var(--primary) 55%, transparent);
}
.insight-tile span {
  display: block;
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 950;
}
.insight-tile strong {
  display: block;
  color: var(--text-strong);
  font-size: clamp(1rem, 1.35vw, 1.25rem);
  line-height: 1.35;
  font-weight: 950;
  letter-spacing: -0.03em;
}
.insight-tile.success::before {
  background: color-mix(in srgb, var(--success) 58%, transparent);
}
.insight-tile.warning::before {
  background: color-mix(in srgb, var(--warning) 65%, transparent);
}
.insight-tile.primary::before {
  background: color-mix(in srgb, var(--primary) 70%, transparent);
}
.insight-tile.success strong {
  color: var(--success);
}
.insight-tile.warning strong {
  color: var(--warning);
}
.insight-tile.primary strong {
  color: var(--primary-strong);
}

/* ── Responsive ── */
@media (max-width: 1200px) {
  .sales-insight {
    grid-template-columns: 1fr;
  }
  .insight-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .insight-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
