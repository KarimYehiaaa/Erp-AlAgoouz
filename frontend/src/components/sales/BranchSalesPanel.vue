<!--
  BranchSalesPanel.vue — تبويب "يومي": نموذج تسجيل/تعديل + سجل مبيعات الفرع
  النموذج يُعرض داخل مودال عند التعديل (Teleport إلى body) وكرت عادي عند
  التسجيل. الجدول يعرض سجل المبيعات اليومية مع خيار التعديل.
  استُخرج من SalesView لتقليل حجم الملف المركزي (كان 2,463 سطرًا).
-->
<template>
  <div class="grid main-row" :class="{ 'grid-2': !editingSaleId }">
    <Teleport to="body" :disabled="!editingSaleId">
      <div
        :class="{ 'modal-overlay': editingSaleId }"
        @click.self="editingSaleId ? $emit('cancelEdit') : null"
      >
        <div class="card form-card" :class="{ 'modal-card': editingSaleId }">
          <h3>
            {{ editingSaleId ? 'تعديل بيع' : 'تسجيل مبيعات يومية' }}
          </h3>
          <form @submit.prevent="$emit('submit')">
            <div v-if="editingSaleId" class="edit-banner">
              <span>وضع التعديل مفعل للفاتورة {{ editingSaleNumber }}</span>
              <button type="button" class="btn btn-outline btn-sm" @click="$emit('cancelEdit')">
                إلغاء التعديل
              </button>
            </div>
            <div class="form-group">
              <label>تاريخ المبيعات *</label>
              <input v-model="form.sale_date" type="date" required />
            </div>
            <div class="form-group">
              <label>المبلغ (ج.م) *</label>
              <input
                v-model.number="form.total_amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="0.00"
              />
            </div>
            <div class="form-group">
              <label>حالة الدفع *</label>
              <select v-model="form.payment_status">
                <option value="paid">مدفوع بالكامل</option>
                <option value="partial">دفع جزئي</option>
                <option value="unpaid">آجل (غير مدفوع)</option>
              </select>
            </div>
            <div v-if="form.payment_status === 'partial'" class="form-group">
              <label>المبلغ المدفوع حالياً (ج.م) *</label>
              <input
                v-model.number="form.paid_amount"
                type="number"
                min="0.01"
                :max="form.total_amount || undefined"
                step="0.01"
                required
                placeholder="أدخل المبلغ المدفوع"
              />
              <div v-if="remainingAmount > 0" class="field-hint warning">
                سيُضاف {{ formatMoney(remainingAmount) }} لرصيد العميل المستحق
              </div>
            </div>
            <div class="form-group">
              <label>ملاحظات</label>
              <textarea v-model="form.notes" rows="2"></textarea>
            </div>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'جاري الحفظ...' : editingSaleId ? 'حفظ التعديل' : 'حفظ' }}
            </button>
          </form>
        </div>
      </div>
    </Teleport>

    <div class="card table-wrap list-card sales-history-card">
      <div class="history-head">
        <div>
          <h3>سجل المبيعات اليومية</h3>
          <p>{{ sales.length }} عملية</p>
        </div>
        <div style="display: flex; align-items: center; gap: 12px">
          <router-link to="/branch-sales" class="btn btn-outline btn-sm">
            <span> شاشة الكاشير والمبيعات السريعة</span>
          </router-link>
          <span class="history-total">{{ formatMoney(periodTotal) }}</span>
        </div>
      </div>
      <BaseTable
        :items="sales"
        :columns="activeColumns"
        :loading="loadingSales"
        empty-message="لا توجد مبيعات يومية للفرع في هذه الفترة"
      >
        <template #cell-sale_date="{ item }">
          <span class="history-date">{{ formatDate(item.sale_date || item.created_at) }}</span>
        </template>
        <template #cell-sale_number="{ item }">
          <span class="mono" style="font-weight: 700">{{
            item.sale_number || item.invoice_number || '—'
          }}</span>
        </template>
        <template #cell-total_amount="{ item }">
          <span class="history-amount">{{ formatMoney(item.total_amount) }}</span>
        </template>
        <template #cell-payment_status="{ item }">
          <span class="history-payment" :class="paymentBadge(item.payment_status)">
            {{ paymentStatusLabel(item.payment_status) }}
          </span>
        </template>
        <template #cell-actions="{ item }">
          <button
            v-permission="['sales.edit', 'pos.edit']"
            type="button"
            class="history-edit-btn"
            :disabled="saving || item.status !== 'completed'"
            @click="$emit('startEdit', item)"
          >
            تعديل
          </button>
        </template>
      </BaseTable>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * تبويب المبيعات اليومية (الفرع) — يستهلك من SalesView.
 *
 * @props editingSaleId        معرف الفاتورة قيد التعديل (null = تسجيل جديد)
 * @props editingSaleNumber    رقم الفاتورة قيد التعديل (للشريط العلوي)
 * @props form                 نموذج البيع (يُعدَّل داخليًا عبر v-model)
 * @props saving               حالة الحفظ
 * @props remainingAmount      المبلغ المتبقي في الدفع الجزئي
 * @props sales                سجل المبيعات اليومية
 * @props activeColumns        أعمدة الجدول النشطة
 * @props loadingSales         حالة تحميل السجل
 * @props periodTotal          إجمالي الفترة
 * @props formatMoney          دالة تنسيق المبالغ
 * @props formatDate           دالة تنسيق التاريخ
 * @props paymentBadge         دالة تلوين شارة حالة الدفع
 * @props paymentStatusLabel   دالة تسمية حالة الدفع
 *
 * @emits submit       إرسال النموذج (إنشاء/تعديل)
 * @emits cancelEdit   إلغاء وضع التعديل
 * @emits startEdit    بدء تعديل فاتورة (item)
 */
import BaseTable from '@/components/ui/BaseTable.vue';

defineProps<{
  editingSaleId: number | null;
  editingSaleNumber: string;
  form: {
    sale_date: string;
    total_amount: number | null;
    customer_id: number | null;
    payment_method: string;
    payment_status: string;
    paid_amount: number | null;
    notes: string;
  };
  saving: boolean;
  remainingAmount: number;
  sales: any[];
  activeColumns: any[];
  loadingSales: boolean;
  periodTotal: number;
  formatMoney: (_value: number | null | undefined) => string;
  formatDate: (_d: any) => string;
  paymentBadge: (_s: any) => string[];
  paymentStatusLabel: (_s: any) => string;
}>();
</script>

<style lang="scss" scoped>
.main-row {
  align-items: start;
  gap: 18px;
}
.form-card,
.list-card {
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
.form-card::before,
.list-card::before {
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
.form-card h3,
.list-card h3 {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
  color: var(--text-strong);
  font-size: 1.05rem;
  font-weight: 950;
  letter-spacing: -0.02em;
}
.form-card h3::before,
.list-card h3::before {
  content: '';
  width: 12px;
  height: 28px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--primary), var(--primary-strong));
  box-shadow: 0 8px 18px color-mix(in srgb, var(--primary) 25%, transparent);
}
.form-card form {
  position: relative;
  z-index: 1;
}
.form-card .form-group {
  margin-bottom: 14px;
}
.form-card .form-group label {
  color: var(--text-muted);
  font-weight: 950;
}
.form-card input,
.form-card select,
.form-card textarea {
  min-height: 46px;
  border-radius: var(--radius-md);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--bg-elevated) 92%, transparent),
    color-mix(in srgb, var(--card-bg) 86%, transparent)
  );
}
.form-card .btn-primary[type='submit'] {
  width: 100%;
  min-height: 48px;
  margin-top: 4px;
  border-radius: 999px;
  font-weight: 950;
  box-shadow: 0 14px 28px color-mix(in srgb, var(--primary) 26%, transparent);
}
.list-card {
  max-height: 640px;
  overflow: auto;
}
.sales-history-card {
  padding: 0;
}
.history-head {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 20px 20px 14px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--card-bg) 96%, var(--primary) 4%),
    var(--bg-elevated)
  );
  border-bottom: 1px solid color-mix(in srgb, var(--primary) 10%, var(--border));
}
.history-head h3 {
  margin: 0 0 5px;
}
.history-head p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.84rem;
  font-weight: 800;
}
.history-total {
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 8px 13px;
  border-radius: 999px;
  color: var(--primary-strong);
  background: color-mix(in srgb, var(--primary) 9%, var(--bg-elevated));
  border: 1px solid color-mix(in srgb, var(--primary) 20%, var(--border));
  font-weight: 950;
  white-space: nowrap;
}
.list-card table {
  border-collapse: separate;
  border-spacing: 0 9px;
  padding: 0 14px 14px;
}
.list-card thead th {
  position: sticky;
  top: 77px;
  z-index: 2;
  border: 0;
  background: color-mix(in srgb, var(--bg-elevated) 96%, var(--primary) 3%);
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 950;
  padding-block: 10px;
}
.list-card tbody td {
  border-top: 1px solid color-mix(in srgb, var(--primary) 9%, var(--border));
  border-bottom: 1px solid color-mix(in srgb, var(--primary) 9%, var(--border));
  background: color-mix(in srgb, var(--bg-elevated) 84%, transparent);
  font-weight: 800;
  padding-block: 13px;
}
.list-card tbody td:first-child {
  border-inline-start: 1px solid color-mix(in srgb, var(--primary) 8%, var(--border));
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
.list-card tbody td:last-child {
  border-inline-end: 1px solid color-mix(in srgb, var(--primary) 8%, var(--border));
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}
.list-card tbody tr:hover td {
  background: color-mix(in srgb, var(--primary) 6%, var(--bg-elevated));
}
.payment-open td {
  background: color-mix(in srgb, var(--warning) 7%, var(--bg-elevated));
}
.payment-open:hover td {
  background: color-mix(in srgb, var(--warning) 11%, var(--bg-elevated));
}
.history-date {
  color: var(--text-muted);
  font-weight: 900;
  white-space: nowrap;
}
.history-amount {
  color: var(--text-strong);
  font-size: 0.98rem;
  font-weight: 950;
  white-space: nowrap;
}
.history-payment .badge {
  min-width: 74px;
  justify-content: center;
}
.history-action {
  text-align: left;
}
.history-edit-btn {
  min-width: 72px;
  min-height: 34px;
  padding: 7px 12px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 7%, var(--bg-elevated));
  color: var(--primary-strong);
  font-weight: 900;
  cursor: pointer;
  transition:
    transform var(--transition),
    box-shadow var(--transition),
    background var(--transition);
}
.history-edit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--primary) 13%, var(--bg-elevated));
  box-shadow: var(--shadow-xs);
}
.history-edit-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 24px;
}

/* ── Modal styles for editing ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: overlayFadeIn 0.2s ease;
}

@keyframes overlayFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-card {
  width: min(560px, 95vw);
  max-height: 90vh;
  overflow-y: auto;
  /* خلفية الكارت من المتغيرات العامة للثيم */
  background: var(--card-bg, #fff);
  border: 1px solid var(--card-border, #e2e8f0);
  border-radius: var(--radius-lg, 16px);
  box-shadow:
    0 24px 60px -12px rgba(0, 0, 0, 0.35),
    0 8px 24px -4px rgba(0, 0, 0, 0.2);
  /* إيقاف تأثير الـ hover على الكارد داخل الموديل */
  transform: none !important;
  animation: modalSlideIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-card:hover {
  transform: none !important;
  box-shadow:
    0 24px 60px -12px rgba(0, 0, 0, 0.35),
    0 8px 24px -4px rgba(0, 0, 0, 0.2) !important;
  border-color: var(--card-border, #e2e8f0) !important;
}

@media (max-width: 900px) {
  .main-row {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .list-card {
    max-height: none;
    overflow: hidden;
  }
  .list-card table,
  .list-card thead,
  .list-card tbody,
  .list-card tr,
  .list-card th,
  .list-card td {
    display: block;
  }
  .list-card table {
    border-spacing: 0;
    padding: 0 12px 12px;
  }
  .list-card thead {
    display: none;
  }
  .list-card tbody {
    display: grid;
    gap: 10px;
  }
  .list-card tbody tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px 12px;
    padding: 13px;
    border: 1px solid color-mix(in srgb, var(--primary) 12%, var(--border));
    border-radius: var(--radius-md);
    background:
      radial-gradient(
        circle at 0 100%,
        color-mix(in srgb, var(--accent) 10%, transparent),
        transparent 38%
      ),
      color-mix(in srgb, var(--bg-elevated) 82%, transparent);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
  }
  .list-card tbody td,
  .list-card tbody td:first-child,
  .list-card tbody td:last-child {
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 0;
  }
  .list-card tbody tr:hover td,
  .payment-open td,
  .payment-open:hover td {
    background: transparent;
  }
  .list-card tbody td:nth-child(1) {
    grid-column: 1;
    color: var(--text-strong);
    font-size: 0.95rem;
    font-weight: 950;
  }
  .list-card tbody td:nth-child(2) {
    grid-column: 2;
    color: var(--text-strong);
    font-size: 0.98rem;
    font-weight: 950;
    white-space: nowrap;
  }
  .list-card tbody td:nth-child(3) {
    align-self: center;
  }
  .list-card tbody td:nth-child(4) {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    padding-top: 2px;
  }
  .list-card tbody td.empty {
    grid-column: 1 / -1;
    padding: 18px;
  }
}
</style>
