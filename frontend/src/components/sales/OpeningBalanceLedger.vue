<!--
  OpeningBalanceLedger.vue — بطاقة "بداية المدة" (الرصيد المرحل)
  ═══════════════════════════════════════════════════════════════
  تعرض رصيد بداية الفترة وتسمح بتعديله وحفظه (تعديل/حفظ داخل البطاقة).
  استُخرجت من SalesView لتقليل حجم الملف المركزي (كان 2,463 سطرًا).
-->
<template>
  <section class="opening-balance opening-ledger" :class="{ editing: editing, saving }">
    <div class="ledger-glow" aria-hidden="true"></div>
    <div class="opening-balance-head">
      <div class="ledger-title">
        <span class="ledger-mark" aria-hidden="true">رصيد</span>
        <div>
          <h3>بداية المدة</h3>
          <p>الرصيد المرحل قبل مبيعات الفترة، يدخل في صافي التدفق فقط.</p>
        </div>
      </div>
      <div class="ledger-amount">
        <span>الرصيد المسجل</span>
        <strong>{{ formatMoney(form.amount || 0) }}</strong>
      </div>
      <div class="opening-balance-actions">
        <button
          type="button"
          class="ledger-action secondary"
          :disabled="loading || saving"
          @click="$emit('startEdit')"
        >
          تعديل
        </button>
        <button
          type="button"
          class="ledger-action primary"
          :disabled="saving || !editing"
          @click="$emit('save')"
        >
          {{ saving ? 'جارٍ الحفظ...' : 'حفظ' }}
        </button>
      </div>
    </div>
    <div class="opening-balance-grid">
      <div class="ledger-field">
        <span>من تاريخ</span>
        <input v-model="form.from_date" type="date" :disabled="!editing" />
      </div>
      <div class="ledger-field">
        <span>إلى تاريخ</span>
        <input v-model="form.to_date" type="date" :disabled="!editing" />
      </div>
      <div class="ledger-field amount-field">
        <span>المبلغ المرحل</span>
        <input
          v-model.number="form.amount"
          type="number"
          min="0"
          step="0.01"
          :disabled="!editing"
          placeholder="0.00"
        />
      </div>
    </div>
    <div v-if="msg" class="opening-balance-msg" :class="{ err }">
      {{ msg }}
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * بطاقة بداية المدة — يستهلك من SalesView.
 *
 * @props form     نموذج الرصيد { from_date, to_date, amount } (يُعدَّل داخليًا)
 * @props loading  حالة تحميل الرصيد
 * @props saving   حالة الحفظ
 * @props editing  وضع التعديل مفعّل
 * @props msg      رسالة الحالة (نجاح/خطأ)
 * @props err      هل الرسالة خطأ
 * @props formatMoney دالة تنسيق المبالغ (تمرر من الأب)
 *
 * @emits startEdit  طلب دخول وضع التعديل
 * @emits save       طلب حفظ الرصيد
 */
defineProps<{
  form: { from_date: string; to_date: string; amount: number | null };
  loading: boolean;
  saving: boolean;
  editing: boolean;
  msg: string;
  err: boolean;
  formatMoney: (_value: number | null | undefined) => string;
}>();
</script>

<style lang="scss" scoped>
.opening-balance {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--warning) 22%, var(--border));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--warning) 9%, var(--bg-elevated)),
    var(--bg-elevated)
  );
}
.opening-ledger {
  position: relative;
  overflow: hidden;
  padding: 20px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--card-border));
  border-radius: calc(var(--radius-lg) + 4px);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, transparent), transparent 42%),
    radial-gradient(
      circle at 10% 20%,
      color-mix(in srgb, var(--accent) 16%, transparent),
      transparent 28%
    ),
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--card-bg) 92%, var(--primary) 8%),
      var(--bg-elevated)
    );
  box-shadow:
    0 22px 55px color-mix(in srgb, var(--primary) 14%, transparent),
    var(--shadow-sm);
}
.opening-ledger::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(90deg, color-mix(in srgb, var(--primary) 7%, transparent) 1px, transparent 1px),
    linear-gradient(0deg, color-mix(in srgb, var(--primary) 5%, transparent) 1px, transparent 1px);
  background-size: 46px 46px;
  mask-image: linear-gradient(90deg, transparent, #000 18%, #000 74%, transparent);
  opacity: 0.45;
  pointer-events: none;
}
.ledger-glow {
  position: absolute;
  inset-inline-end: -90px;
  top: -110px;
  width: 270px;
  height: 270px;
  border-radius: 999px;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--accent) 30%, transparent),
    transparent 62%
  );
  filter: blur(2px);
  pointer-events: none;
}
.opening-balance-head {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(190px, auto) auto;
  gap: 16px;
  align-items: center;
}
.ledger-title {
  display: flex;
  align-items: center;
  gap: 14px;
}
.ledger-mark {
  width: 58px;
  height: 58px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
  color: #fff;
  font-size: 0.78rem;
  font-weight: 950;
  letter-spacing: -0.01em;
  background: linear-gradient(145deg, var(--primary), var(--primary-strong)), var(--primary);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 14px 32px color-mix(in srgb, var(--primary) 32%, transparent);
  transform: rotate(-2deg);
}
.opening-balance-head h3 {
  margin: 0 0 5px;
  color: var(--text-strong);
  font-size: clamp(1.05rem, 1.9vw, 1.35rem);
  font-weight: 950;
  letter-spacing: -0.03em;
}
.opening-balance-head p {
  margin: 0;
  max-width: 430px;
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.7;
}
.ledger-amount {
  min-width: 190px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--border));
  background: color-mix(in srgb, var(--bg-elevated) 78%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    var(--shadow-xs);
}
.ledger-amount span {
  display: block;
  margin-bottom: 4px;
  color: var(--text-muted);
  font-size: 0.74rem;
  font-weight: 900;
}
.ledger-amount strong {
  display: block;
  color: var(--primary-strong);
  font-size: clamp(1.25rem, 2vw, 1.75rem);
  line-height: 1.15;
  font-weight: 950;
  letter-spacing: -0.03em;
}
.opening-balance-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.ledger-action {
  min-width: 74px;
  min-height: 40px;
  padding: 9px 17px;
  border: 0;
  border-radius: 999px;
  font-size: 0.84rem;
  font-weight: 900;
  cursor: pointer;
  transition:
    transform var(--transition),
    box-shadow var(--transition),
    opacity var(--transition);
}
.ledger-action:hover:not(:disabled) {
  transform: translateY(-2px);
}
.ledger-action:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}
.ledger-action.primary {
  color: #fff;
  background: linear-gradient(135deg, var(--primary), var(--primary-strong));
  box-shadow: 0 12px 26px color-mix(in srgb, var(--primary) 30%, transparent);
}
.ledger-action.primary:disabled {
  color: var(--text-muted);
  background: color-mix(in srgb, var(--bg-elevated) 78%, transparent);
  box-shadow: none;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
}
.ledger-action.secondary {
  color: var(--text-strong);
  background: color-mix(in srgb, var(--bg-elevated) 84%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--border));
}
.opening-balance-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}
.ledger-field {
  padding: 12px;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
  background: color-mix(in srgb, var(--bg-elevated) 78%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
}
.ledger-field span {
  display: block;
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 0.74rem;
  font-weight: 950;
}
.ledger-field input {
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--card-bg) 86%, transparent);
  color: var(--text-strong);
  font-weight: 850;
  transition:
    border-color var(--transition),
    box-shadow var(--transition),
    background var(--transition);
}
.ledger-field input:disabled {
  opacity: 1;
  color: var(--text);
  background: transparent;
  border-color: transparent;
  padding-inline: 0;
}
.opening-ledger.editing .ledger-field input {
  border-color: color-mix(in srgb, var(--primary) 26%, var(--border));
  background: var(--bg-elevated);
}
.opening-ledger.editing .ledger-field input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 14%, transparent);
}
.opening-balance-msg {
  position: relative;
  z-index: 1;
  margin-top: 12px;
  font-size: 0.88rem;
  color: var(--success);
  font-weight: 700;
  padding: 10px 12px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--success) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--success) 18%, transparent);
}
.opening-balance-msg.err {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 6%, transparent);
  border-color: color-mix(in srgb, var(--danger) 20%, transparent);
}
@media (max-width: 1100px) {
  .opening-balance-head {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
  .ledger-amount {
    max-width: 320px;
  }
  .opening-balance-actions {
    justify-content: flex-start;
  }
}
@media (max-width: 640px) {
  .opening-ledger {
    padding: 16px;
    border-radius: var(--radius-lg);
  }
  .ledger-title {
    align-items: flex-start;
  }
  .ledger-mark {
    width: 58px;
    height: 48px;
    border-radius: 16px;
    font-size: 0.72rem;
  }
  .opening-balance-grid {
    grid-template-columns: 1fr;
  }
  .ledger-amount {
    max-width: none;
  }
  .ledger-action {
    flex: 1;
  }
}
</style>
