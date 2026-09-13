<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card">
      <header class="modal-header">
        <div class="header-title-wrap">
          <div class="icon-circle">
            <AppIcon name="clock" :size="20" />
          </div>
          <div>
            <h3>الفواتير المعلقة (Held Orders)</h3>
            <p>يمكنك استرجاع أي فاتورة معلقة لمتابعة الدفع أو إلغائها</p>
          </div>
        </div>
        <button type="button" class="btn-close-modal" @click="emit('close')">
          <AppIcon name="close" :size="18" />
        </button>
      </header>

      <div class="modal-body">
        <div v-if="!heldOrders.length" class="empty-held-orders">
          <AppIcon name="coffee" :size="40" />
          <h4>لا توجد فواتير معلقة حالياً</h4>
          <p>عند تعليق أي طلب سيظهر هنا للرجوع إليه في أي وقت</p>
        </div>

        <div v-else class="held-orders-list">
          <div
            v-for="(order, idx) in heldOrders"
            :key="order.id"
            class="held-order-card"
          >
            <div class="order-card-header">
              <div class="order-meta">
                <span class="order-badge">طلب معلق #{{ idx + 1 }}</span>
                <span class="order-time">{{ formatTime(order.held_at) }}</span>
              </div>
              <strong class="order-total">{{ formatMoney(order.total) }}</strong>
            </div>

            <div class="order-items-preview">
              <span
                v-for="item in order.items"
                :key="item.id"
                class="item-pill"
              >
                {{ item.name_ar }} × {{ item.quantity }}
              </span>
            </div>

            <div class="order-card-footer">
              <button
                type="button"
                class="btn-delete-held"
                @click="deleteHeldOrder(idx)"
              >
                <AppIcon name="trash2" :size="14" />
                <span>حذف</span>
              </button>

              <button
                type="button"
                class="btn-restore-held"
                @click="restoreOrder(order, idx)"
              >
                <AppIcon name="check" :size="16" />
                <span>استرجاع إلى السلة الحالية</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppIcon from './AppIcon.vue';
import { formatMoney } from '../utils/currency';

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  close: [];
  restore: [order: any];
}>();

const heldOrders = ref<any[]>([]);

const loadHeldOrders = () => {
  try {
    const raw = localStorage.getItem('pos_held_orders');
    heldOrders.value = raw ? JSON.parse(raw) : [];
  } catch {
    heldOrders.value = [];
  }
};

onMounted(() => {
  loadHeldOrders();
});

const formatTime = (isoString: string) => {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const deleteHeldOrder = (index: number) => {
  if (confirm('هل أنت متأكد من حذف هذه الفاتورة المعلقة؟')) {
    heldOrders.value.splice(index, 1);
    localStorage.setItem('pos_held_orders', JSON.stringify(heldOrders.value));
  }
};

const restoreOrder = (order: any, index: number) => {
  heldOrders.value.splice(index, 1);
  localStorage.setItem('pos_held_orders', JSON.stringify(heldOrders.value));
  emit('restore', order);
  emit('close');
};
</script>

<style lang="scss" scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(12, 10, 9, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  padding: 20px;
}

.modal-card {
  width: 100%;
  max-width: 600px;
  background: #ffffff;
  border: 1.5px solid var(--border, #e7e2d9);
  border-radius: var(--radius-lg, 14px);
  box-shadow: 0 16px 40px rgba(41, 37, 36, 0.2);
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #ffffff;
  border-bottom: 1.5px solid var(--border-soft, #f0ebe1);

  .header-title-wrap {
    display: flex;
    align-items: center;
    gap: 12px;

    .icon-circle {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--primary-soft, rgba(138, 87, 42, 0.08));
      color: var(--primary, #8a572a);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--primary-border, rgba(138, 87, 42, 0.2));
    }

    h3 {
      font-size: 1.15rem;
      font-weight: 900;
      color: var(--text-strong, #0c0a09);
      margin: 0 0 2px;
    }

    p {
      font-size: 0.78rem;
      color: var(--text-muted, #78716c);
      margin: 0;
    }
  }

  .btn-close-modal {
    background: transparent;
    border: none;
    color: var(--text-muted, #78716c);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;

    &:hover {
      background: var(--bg-soft, #fbf9f6);
      color: var(--text-strong, #0c0a09);
    }
  }
}

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.empty-held-orders {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted, #78716c);

  h4 {
    font-size: 1.1rem;
    font-weight: 850;
    color: var(--text-strong, #0c0a09);
    margin: 12px 0 4px;
  }

  p {
    font-size: 0.85rem;
    margin: 0;
  }
}

.held-orders-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.held-order-card {
  background: var(--bg-soft, #fbf9f6);
  border: 1.5px solid var(--border, #e7e2d9);
  border-radius: var(--radius-md, 10px);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  .order-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .order-meta {
      display: flex;
      align-items: center;
      gap: 8px;

      .order-badge {
        font-size: 0.78rem;
        font-weight: 850;
        color: var(--primary, #8a572a);
        background: #ffffff;
        border: 1px solid var(--primary-border, rgba(138, 87, 42, 0.25));
        padding: 2px 8px;
        border-radius: 6px;
      }

      .order-time {
        font-size: 0.76rem;
        color: var(--text-muted, #78716c);
        font-weight: 700;
      }
    }

    .order-total {
      font-size: 1.15rem;
      font-weight: 950;
      color: var(--primary, #8a572a);
    }
  }

  .order-items-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    .item-pill {
      background: #ffffff;
      border: 1px solid var(--border-soft, #f0ebe1);
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 0.76rem;
      font-weight: 750;
      color: var(--text-main, #292524);
    }
  }

  .order-card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 8px;
    border-top: 1px dashed var(--border, #e7e2d9);

    .btn-delete-held {
      display: flex;
      align-items: center;
      gap: 4px;
      background: transparent;
      border: 1px solid transparent;
      color: var(--danger, #dc2626);
      font-size: 0.78rem;
      font-weight: 750;
      padding: 4px 8px;
      border-radius: 6px;
      cursor: pointer;

      &:hover {
        background: var(--danger-soft, rgba(220, 38, 38, 0.1));
      }
    }

    .btn-restore-held {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--primary, #8a572a);
      color: #ffffff;
      border: none;
      font-size: 0.82rem;
      font-weight: 850;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(138, 87, 42, 0.25);

      &:hover {
        background: var(--primary-hover, #6e411b);
      }
    }
  }
}
</style>
