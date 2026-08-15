<template>
  <div class="card backup-settings-card">
    <div class="card-header">
      <h3>💾 إدارة النسخ الاحتياطي والنظام</h3>
      <p class="hint">حفظ وتنزيل نسخة من قواعد البيانات أو استعادة البيانات</p>
    </div>

    <div class="backup-actions">
      <div class="action-item">
        <div class="action-info">
          <strong>تنزيل نسخة احتياطية (Backup)</strong>
          <small>إنشاء ملف SQL يحتفظ بجميع البيانات الحالية</small>
        </div>
        <button type="button" class="btn btn-outline" :disabled="loading" @click="downloadBackup">
          <AppIcon name="download" :size="16" /> {{ loading ? 'جاري التنزيل...' : 'تنزيل Backup' }}
        </button>
      </div>

      <div class="action-item danger-zone">
        <div class="action-info">
          <strong>تصفير بيانات حركات النظام (Factory Reset)</strong>
          <small class="text-danger"
            >تصفير المبيعات والمخزون والمالية مع الحفاظ على المنتجات والمستخدمين</small
          >
        </div>
        <button
          type="button"
          class="btn btn-delete"
          :disabled="resetting"
          @click="$emit('reset-system')"
        >
          <AppIcon name="delete" :size="16" /> تصفير الحركات
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineEmits(['reset-system']);

const loading = ref(false);
const resetting = ref(false);

const downloadBackup = async () => {
  loading.value = true;
  try {
    const res = await fetch('/api/v1/operations/backup', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!res.ok) throw new Error('فشل تنزيل النسخة الاحتياطية');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_alagoouz_${new Date().toISOString().slice(0, 10)}.sql`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (err: any) {
    alert(err.message || 'حدث خطأ أثناء تنزيل النسخة الاحتياطية');
  } finally {
    loading.value = false;
  }
};
</script>

<style lang="scss" scoped>
.backup-settings-card {
  padding: 20px;
}

.card-header {
  margin-bottom: 18px;
  h3 {
    margin: 0 0 4px 0;
  }
  .hint {
    color: var(--text-muted);
    font-size: 0.85rem;
    margin: 0;
  }
}

.backup-actions {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.action-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);

  .action-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    strong {
      font-size: 0.92rem;
    }
    small {
      font-size: 0.8rem;
      color: var(--text-muted);
    }
  }

  &.danger-zone {
    border-color: color-mix(in srgb, var(--danger) 30%, transparent);
    background: color-mix(in srgb, var(--danger) 4%, var(--bg));
  }
}
</style>
