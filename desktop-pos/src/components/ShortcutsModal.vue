<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
    <div class="card modal-content shortcuts-modal">
      <div class="modal-header-row">
        <div class="header-title">
          <AppIcon name="keyboard" :size="20" />
          <h3>دليل اختصارات لوحة المفاتيح للكاشير</h3>
        </div>
        <button type="button" class="close-modal-btn" @click="emit('close')">
          <AppIcon name="close" :size="16" />
        </button>
      </div>

      <div class="shortcuts-grid">
        <div class="shortcut-item">
          <kbd class="key-badge">Space</kbd>
          <span>فتح / إغلاق درج الدفع والمحاسبة</span>
        </div>
        <div class="shortcut-item">
          <kbd class="key-badge">F1</kbd>
          <span>فتح وإغلاق دليل الاختصارات</span>
        </div>
        <div class="shortcut-item">
          <kbd class="key-badge">F2 / F7</kbd>
          <span>التركيز على بحث المنتجات أو مسح الباركود</span>
        </div>
        <div class="shortcut-item">
          <kbd class="key-badge">F4</kbd>
          <span>تعليق الطلب (Hold) / التركيز على الخصم</span>
        </div>
        <div class="shortcut-item">
          <kbd class="key-badge">F6</kbd>
          <span>تفريغ السلة الحالية بالكامل</span>
        </div>
        <div class="shortcut-item">
          <kbd class="key-badge">F8</kbd>
          <span>إعادة طباعة آخر فاتورة تم حفظها</span>
        </div>
        <div class="shortcut-item">
          <kbd class="key-badge">F9</kbd>
          <span>تفعيل الدفع النقدي (كاش) وفتح درج النقدية</span>
        </div>
        <div class="shortcut-item">
          <kbd class="key-badge">F10</kbd>
          <span>تفعيل الدفع بالبطاقة (فيزا / شبكة)</span>
        </div>
        <div class="shortcut-item">
          <kbd class="key-badge">Enter</kbd>
          <span>حفظ عملية البيع والطباعة الفورية</span>
        </div>
        <div class="shortcut-item">
          <kbd class="key-badge">Esc</kbd>
          <span>إغلاق درج الدفع أو النوافذ المنبثقة</span>
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn-close-action" @click="emit('close')">
          فهمت، إغلاق (Esc)
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppIcon from './AppIcon.vue';

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<style lang="scss" scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(5px);
  z-index: 250;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.shortcuts-modal {
  width: 100%;
  max-width: 580px;
  background: #1e130b;
  border: 1px solid #d4a373;
  border-radius: 16px;
  padding: 22px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
  color: #fffaf2;
}

.modal-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
  border-bottom: 1px solid rgba(212, 163, 115, 0.2);
  padding-bottom: 12px;

  .header-title {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #faedcd;

    h3 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 850;
    }
  }

  .close-modal-btn {
    background: rgba(255, 255, 255, 0.08);
    border: none;
    color: #fff;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(239, 68, 68, 0.25);
      color: #f87171;
    }
  }
}

.shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  margin-bottom: 20px;

  .shortcut-item {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(212, 163, 115, 0.15);
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 0.84rem;
    color: #faedcd;

    .key-badge {
      display: inline-block;
      padding: 4px 9px;
      font-size: 0.78rem;
      font-weight: 850;
      color: #140d08;
      background: linear-gradient(135deg, #faedcd 0%, #d4a373 100%);
      border-radius: 6px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      font-family: inherit;
      white-space: nowrap;
    }

    span {
      font-size: 0.8rem;
      font-weight: 600;
    }
  }
}

.modal-actions {
  display: flex;
  justify-content: flex-end;

  .btn-close-action {
    padding: 9px 24px;
    background: linear-gradient(135deg, #d4a373 0%, #a86f3d 100%);
    border: 1px solid #faedcd;
    border-radius: 10px;
    color: #140d08;
    font-weight: 850;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: linear-gradient(135deg, #faedcd 0%, #d4a373 100%);
      transform: translateY(-1px);
    }
  }
}
</style>
