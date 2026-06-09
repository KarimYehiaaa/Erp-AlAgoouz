<template>
  <div>
    <div class="page-header">
      <button class="btn btn-primary" @click="openCreate">+ مورد</button>
    </div>

    <div class="grid grid-3">
      <div v-for="s in suppliers" :key="s.id" class="card supplier-card">
        <div class="supplier-head">
          <h3>{{ s.name_ar }}</h3>
          <div class="actions">
            <button class="btn btn-sm btn-outline icon-btn" @click="openEdit(s)" title="تعديل" aria-label="تعديل">✏️</button>
            <button class="btn btn-sm btn-danger icon-btn" @click="removeSupplier(s)" title="حذف" aria-label="حذف">🗑️</button>
          </div>
        </div>
        <p>{{ s.phone || 'بدون هاتف' }}</p>
        <p>الرصيد: <strong>{{ formatMoney(s.balance) }}</strong></p>
        <p class="meta">آخر تعديل: <strong>{{ s.last_updated_by || 'غير محدد' }}</strong></p>
        <span class="badge">{{ s.code }}</span>
      </div>
    </div>

    <div v-if="showForm" class="modal" @click.self="showForm = false">
      <div class="card modal-content">
        <h3>{{ form.id ? 'تعديل' : 'إضافة' }} مورد</h3>
        <form @submit.prevent="save">
          <div class="form-group"><label>الاسم</label><input v-model="form.name_ar" required /></div>
          <div class="form-group"><label>الهاتف</label><input v-model="form.phone" /></div>
          <button type="submit" class="btn btn-primary">حفظ</button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { suppliers as api } from '@/api';
import { formatMoney } from '@/utils/currency';

const suppliers = ref([]);
const showForm = ref(false);
const form = ref({ id: null, name_ar: '', phone: '' });

const load = async () => {
  suppliers.value = (await api.list()).data || [];
};

const openCreate = () => {
  form.value = { id: null, name_ar: '', phone: '' };
  showForm.value = true;
};

const openEdit = (row) => {
  form.value = { id: row.id, name_ar: row.name_ar, phone: row.phone || '' };
  showForm.value = true;
};

const save = async () => {
  try {
    if (form.value.id) await api.update(form.value.id, form.value);
    else await api.create(form.value);
    showForm.value = false;
    await load();
  } catch (e) {
    window.alert(e?.message || 'تعذر حفظ المورد');
  }
};

const removeSupplier = async (supplier) => {
  if (!window.confirm(`تأكيد حذف المورد: ${supplier.name_ar} ؟`)) return;
  try {
    await api.delete(supplier.id);
    await load();
  } catch (e) {
    window.alert(e?.message || 'تعذر حذف المورد');
  }
};

onMounted(load);
</script>

<style scoped>
.page-header { margin-bottom: 20px; }
.supplier-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.supplier-card h3 { margin-bottom: 8px; color: var(--primary); }
.meta { color: var(--text-muted); font-size: 0.9rem; margin-top: 6px; }
.actions { display: flex; gap: 8px; }
.icon-btn { min-width: 34px; padding: 6px 8px; border-radius: var(--radius-xs); }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; }
.modal-content { max-width: 420px; width: 90%; }
</style>
