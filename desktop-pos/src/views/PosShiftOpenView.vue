<template>
  <div class="pos-shift-open-page">
    <div class="shift-card">
      <div class="card-header">
        <div class="header-icon-badge">
          <AppIcon name="clock" :size="32" />
        </div>
        <h2>فتح وردية جديدة</h2>
        <p>مرحباً بك يا <strong>{{ authStore.user?.full_name || 'الكاشير' }}</strong>، يرجى إدخال عهدة البداية (الفكة) لبدء العمليات.</p>
      </div>

      <form class="shift-form" @submit.prevent="handleOpenShift">
        <div class="form-group">
          <label>الرصيد الافتتاحي / الفكة النقدية بالدرج (ج.م)</label>
          <div class="money-input-wrapper">
            <input
              v-model.number="openingCash"
              type="number"
              min="0"
              step="any"
              required
              placeholder="0.00"
              class="money-input"
              autofocus
            />
            <span class="currency-label">ج.م</span>
          </div>
        </div>

        <div class="form-group">
          <label>ملاحظات افتتاحية (اختياري)</label>
          <input
            v-model="notes"
            type="text"
            placeholder="مثلاً: استلام عهدة فكة 500 جنيه من الخزينة"
            class="pos-input"
          />
        </div>

        <div class="shift-meta-pills">
          <div class="meta-pill">
            <AppIcon name="monitor" :size="14" />
            <span>نقطة البيع: <strong>TRM-MAIN-01</strong></span>
          </div>
          <div class="meta-pill">
            <AppIcon name="shop" :size="14" />
            <span>الفرع: <strong>الفرع الرئيسي</strong></span>
          </div>
        </div>

        <button type="submit" class="btn-start-shift" :disabled="shiftStore.loading">
          <span v-if="shiftStore.loading">جاري فتح الوردية...</span>
          <span v-else>بدء الوردية والانتقال لشاشة البيع (Enter)</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import { usePosAuthStore } from '../stores/posAuth';
import { usePosShiftStore } from '../stores/posShift';

const router = useRouter();
const authStore = usePosAuthStore();
const shiftStore = usePosShiftStore();

const openingCash = ref<number>(500);
const notes = ref<string>('');

onMounted(async () => {
  await shiftStore.fetchCurrentShift();
  if (shiftStore.isShiftOpen) {
    router.push('/sales');
  }
});

const handleOpenShift = async () => {
  try {
    await shiftStore.openShift(openingCash.value, notes.value);
    router.push('/sales');
  } catch (err: any) {
    alert(err.message || 'حدث خطأ أثناء فتح الوردية');
  }
};
</script>

<style lang="scss" scoped>
.pos-shift-open-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 20%, rgba(138, 87, 42, 0.08) 0%, #f6f4f0 85%);
  padding: 20px;
}

.shift-card {
  width: 100%;
  max-width: 500px;
  background: #ffffff;
  border: 1.5px solid var(--border, #e7e2d9);
  border-radius: var(--radius-xl, 18px);
  padding: 36px 30px;
  box-shadow: 0 12px 36px rgba(41, 37, 36, 0.08);
}

.card-header {
  text-align: center;
  margin-bottom: 26px;

  .header-icon-badge {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--primary, #8a572a);
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    box-shadow: 0 4px 14px rgba(138, 87, 42, 0.3);
  }

  h2 {
    font-size: 1.5rem;
    font-weight: 900;
    color: var(--text-strong, #0c0a09);
    margin: 0 0 8px;
  }

  p {
    font-size: 0.9rem;
    color: var(--text-muted, #78716c);
    margin: 0;
    line-height: 1.4;
  }
}

.shift-form {
  display: flex;
  flex-direction: column;
  gap: 18px;

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;

    label {
      font-size: 0.88rem;
      font-weight: 750;
      color: var(--text-main, #292524);
    }

    .money-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;

      .money-input {
        width: 100%;
        height: 56px;
        padding: 0 54px 0 18px;
        background: #fdfaf5;
        border: 2px solid var(--primary, #8a572a);
        border-radius: 8px;
        color: var(--primary, #8a572a);
        font-size: 1.6rem;
        font-weight: 950;
        text-align: right;

        &:focus {
          outline: none;
          box-shadow: 0 0 0 4px rgba(138, 87, 42, 0.2);
        }
      }

      .currency-label {
        position: absolute;
        left: 18px;
        font-size: 1.1rem;
        font-weight: 800;
        color: var(--text-muted, #78716c);
      }
    }

    .pos-input {
      height: 48px;
      padding: 0 16px;
      background: #ffffff;
      border: 1.5px solid var(--border, #e7e2d9);
      border-radius: 8px;
      color: var(--text-strong, #0c0a09);
      font-size: 0.95rem;

      &:focus {
        border-color: var(--primary, #8a572a);
        outline: none;
      }
    }
  }

  .shift-meta-pills {
    display: flex;
    gap: 8px;
    margin-top: 4px;

    .meta-pill {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-soft, #fbf9f6);
      border: 1px solid var(--border, #e7e2d9);
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 0.78rem;
      color: var(--text-muted, #78716c);

      strong {
        color: var(--text-strong, #0c0a09);
      }
    }
  }

  .btn-start-shift {
    height: 52px;
    background: linear-gradient(135deg, #8a572a 0%, #6e411b 100%);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 1.05rem;
    font-weight: 850;
    cursor: pointer;
    margin-top: 10px;
    transition: all 0.2s ease;
    box-shadow: 0 4px 14px rgba(138, 87, 42, 0.3);

    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #9b6330 0%, #7d4a20 100%);
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(138, 87, 42, 0.4);
    }
  }
}
</style>
