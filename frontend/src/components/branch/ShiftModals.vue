<template>
  <Teleport to="body">
    <!-- Open Shift Modal -->
    <Transition name="fade">
      <div v-if="showOpenShift" class="modal-overlay">
        <div class="modal-box">
          <div class="modal-header">
            <h3>🟢 فتح وردية جديدة</h3>
          </div>
          <div class="modal-body">
            <label>النقدية الافتتاحية (المبلغ في الدرج)</label>
            <input
              type="number"
              v-model="openShiftState.openingCash"
              min="0"
              class="pos-input"
              placeholder="0.00"
            />

            <div class="quick-amounts">
              <button
                v-for="amount in [0, 500, 1000, 2000, 5000]"
                :key="amount"
                class="quick-btn"
                @click="openShiftState.openingCash = amount"
              >
                {{ amount }}
              </button>
            </div>
          </div>
          <div class="modal-footer">
            <button
              class="btn-confirm"
              :disabled="
                shiftLoading ||
                openShiftState.openingCash === null ||
                openShiftState.openingCash < 0
              "
              @click="handleOpenShift"
            >
              <span v-if="shiftLoading">جاري الفتح...</span>
              <span v-else>فتح الوردية وبدء البيع ✨</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Cash Movement Modal -->
    <Transition name="fade">
      <div v-if="showCashMovement" class="modal-overlay" @click.self="closeCashMovement">
        <div class="modal-box">
          <div class="modal-header">
            <h3>💰 تسجيل حركة نقدية</h3>
          </div>
          <div class="modal-body">
            <div class="movement-types">
              <div
                class="type-tile"
                :class="{ active: cashMoveState.movement_type === 'drop' }"
                @click="cashMoveState.movement_type = 'drop'"
              >
                <div class="icon">📤</div>
                <div class="label">توريد للخزينة</div>
              </div>
              <div
                class="type-tile"
                :class="{ active: cashMoveState.movement_type === 'deposit' }"
                @click="cashMoveState.movement_type = 'deposit'"
              >
                <div class="icon">📥</div>
                <div class="label">إيداع فكة</div>
              </div>
              <div
                class="type-tile"
                :class="{ active: cashMoveState.movement_type === 'expense' }"
                @click="cashMoveState.movement_type = 'expense'"
              >
                <div class="icon">🧾</div>
                <div class="label">مصروف طارئ</div>
              </div>
            </div>

            <div class="input-group">
              <label>المبلغ</label>
              <input
                type="number"
                v-model="cashMoveState.amount"
                min="0"
                class="pos-input"
                placeholder="0.00"
              />
            </div>

            <div class="input-group">
              <label>السبب / الملاحظة</label>
              <input
                type="text"
                v-model="cashMoveState.reason"
                class="pos-input text-right"
                placeholder="اكتب السبب هنا..."
              />
            </div>
          </div>
          <div class="modal-footer split">
            <button class="btn-cancel" @click="closeCashMovement">إلغاء</button>
            <button
              class="btn-confirm"
              :disabled="shiftLoading || cashMoveState.amount <= 0 || !cashMoveState.reason.trim()"
              @click="handleCashMovement"
            >
              تسجيل الحركة
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Close Shift Modal -->
    <Transition name="fade">
      <div v-if="showCloseShift" class="modal-overlay" @click.self="closeCloseShift">
        <div class="modal-box">
          <div class="modal-header">
            <h3>📊 إغلاق الوردية — Z-Report</h3>
          </div>
          <div class="modal-body" v-if="currentShift">
            <div class="shift-stats">
              <div class="stat-row">
                <span>النقدية الافتتاحية:</span>
                <span>{{ formatMoney(currentShift.opening_cash) }}</span>
              </div>
              <div class="stat-row">
                <span>إجمالي مبيعات الكاش:</span>
                <span>{{
                  formatMoney(currentShift.live_cash_sales || currentShift.total_cash_sales || 0)
                }}</span>
              </div>
              <div class="stat-row">
                <span>السحوبات (توريد + مصروفات):</span>
                <span>{{ formatMoney(currentShift.total_withdrawals || 0) }}</span>
              </div>
              <div class="stat-row">
                <span>الإيداعات:</span>
                <span>{{ formatMoney(currentShift.total_deposits || 0) }}</span>
              </div>
              <div class="stat-row highlight">
                <span>النقدية المتوقعة:</span>
                <span>{{ formatMoney(currentShift.expected_cash || 0) }}</span>
              </div>
            </div>

            <hr class="divider" />

            <div class="input-group">
              <label>النقدية الفعلية (عدّ يدوي)</label>
              <input
                type="number"
                v-model="closeShiftState.actualCash"
                min="0"
                class="pos-input"
                placeholder="0.00"
              />
            </div>

            <div
              class="difference-display"
              v-if="closeShiftState.actualCash !== null && closeShiftState.actualCash > 0"
            >
              <span v-if="cashDifference > 0" class="text-green"
                >زيادة: +{{ formatMoney(cashDifference) }} ✅</span
              >
              <span v-else-if="cashDifference < 0" class="text-red"
                >عجز: {{ formatMoney(cashDifference) }} 🔴</span
              >
              <span v-else class="text-green">مطابقة تامة ✅</span>
            </div>

            <div class="input-group">
              <label>ملاحظات (اختياري)</label>
              <textarea
                v-model="closeShiftState.notes"
                class="pos-input text-right"
                rows="2"
                placeholder="أي ملاحظات حول العجز أو الزيادة..."
              ></textarea>
            </div>
          </div>
          <div class="modal-footer split">
            <button class="btn-cancel" @click="closeCloseShift">تراجع</button>
            <button
              class="btn-confirm"
              :disabled="
                shiftLoading ||
                closeShiftState.actualCash === null ||
                closeShiftState.actualCash < 0
              "
              @click="handleCloseShift"
            >
              إغلاق الوردية
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue';
import type { PosShift } from '@/api/pos.api';

const props = defineProps<{
  showOpenShift: boolean;
  showCloseShift: boolean;
  showCashMovement: boolean;
  currentShift: PosShift | null;
  shiftLoading: boolean;
}>();

const emit = defineEmits<{
  'update:showOpenShift': [value: boolean];
  'update:showCloseShift': [value: boolean];
  'update:showCashMovement': [value: boolean];
  openShift: [openingCash: number];
  closeShift: [actualCash: number, notes: string];
  cashMovement: [
    data: { movement_type: 'drop' | 'deposit' | 'expense'; amount: number; reason: string },
  ];
}>();

// Utils
const formatMoney = (amount: number) => {
  return (
    new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      amount,
    ) + ' ج.م'
  );
};

// Open Shift Logic
const openShiftState = reactive({
  openingCash: null as number | null,
});

const handleOpenShift = () => {
  if (openShiftState.openingCash !== null && openShiftState.openingCash >= 0) {
    emit('openShift', openShiftState.openingCash);
  }
};

watch(
  () => props.showOpenShift,
  (val) => {
    if (val) openShiftState.openingCash = 0;
  },
);

// Cash Movement Logic
const cashMoveState = reactive({
  movement_type: 'drop' as 'drop' | 'deposit' | 'expense',
  amount: 0,
  reason: '',
});

const closeCashMovement = () => {
  emit('update:showCashMovement', false);
};

const handleCashMovement = () => {
  if (cashMoveState.amount > 0 && cashMoveState.reason.trim()) {
    emit('cashMovement', { ...cashMoveState });
  }
};

watch(
  () => props.showCashMovement,
  (val) => {
    if (val) {
      cashMoveState.movement_type = 'drop';
      cashMoveState.amount = 0;
      cashMoveState.reason = '';
    }
  },
);

// Close Shift Logic
const closeShiftState = reactive({
  actualCash: null as number | null,
  notes: '',
});

const cashDifference = computed(() => {
  const expected = props.currentShift?.expected_cash || 0;
  return (closeShiftState.actualCash || 0) - expected;
});

const closeCloseShift = () => {
  emit('update:showCloseShift', false);
};

const handleCloseShift = () => {
  if (closeShiftState.actualCash !== null && closeShiftState.actualCash >= 0) {
    emit('closeShift', closeShiftState.actualCash, closeShiftState.notes);
  }
};

watch(
  () => props.showCloseShift,
  (val) => {
    if (val) {
      closeShiftState.actualCash = props.currentShift?.expected_cash || 0;
      closeShiftState.notes = '';
    }
  },
);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  direction: rtl;
  font-family: 'Tajawal', 'Cairo', sans-serif;
}

.modal-box {
  background: linear-gradient(145deg, #1e1e2e, #252536);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 28px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.5);
  color: #fff;
}

.modal-header h3 {
  margin: 0 0 20px 0;
  font-size: 22px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.input-group label,
.modal-body > label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: #a0a0b0;
  font-weight: 600;
}

.pos-input {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: #e0e0e0;
  padding: 12px 16px;
  font-size: 18px;
  text-align: center;
  width: 100%;
  box-sizing: border-box;
  outline: none;
  transition:
    border-color 0.2s,
    background 0.2s;
}

.pos-input:focus {
  border-color: #10b981;
  background: rgba(255, 255, 255, 0.1);
}

.pos-input.text-right {
  text-align: right;
  font-size: 16px;
}

.quick-amounts {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.quick-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  padding: 8px 16px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.movement-types {
  display: flex;
  gap: 10px;
}

.type-tile {
  flex: 1;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 12px 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.type-tile:hover {
  background: rgba(255, 255, 255, 0.05);
}

.type-tile.active {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.15);
}

.type-tile .icon {
  font-size: 24px;
  margin-bottom: 6px;
}

.type-tile .label {
  font-size: 13px;
  font-weight: 600;
}

.shift-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 15px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.stat-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.stat-row.highlight {
  color: #fbbf24;
  font-weight: 700;
  font-size: 17px;
}

.divider {
  border: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 5px 0;
}

.difference-display {
  text-align: center;
  font-weight: bold;
  font-size: 16px;
  margin-top: -10px;
}

.text-green {
  color: #10b981;
}
.text-red {
  color: #ef4444;
}

.modal-footer {
  margin-top: 24px;
  display: flex;
  gap: 12px;
}

.modal-footer.split {
  justify-content: flex-end;
}

.btn-confirm {
  flex: 1;
  background: linear-gradient(90deg, #10b981, #059669);
  color: white;
  border: none;
  padding: 14px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-confirm:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-confirm:disabled {
  background: #374151;
  color: #9ca3af;
  cursor: not-allowed;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: none;
  padding: 14px 24px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.2);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
