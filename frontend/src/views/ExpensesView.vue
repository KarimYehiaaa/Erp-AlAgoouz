<template>
  <div>
    <div class="page-header">
      <div class="header-left">
        <label>تاريخ الحساب</label>
        <input v-model="selectedDate" type="date" @change="load" />
      </div>
      <button class="btn btn-primary" @click="openCreate">+ مصروف جديد</button>
    </div>

    <div class="grid grid-2" style="margin-bottom: 16px">
      <StatCard label="إجمالي مصاريف اليوم" :value="dayTotal" icon="🧾" />
      <StatCard label="إجمالي مصاريف الشهر" :value="monthTotal" icon="📅" />
    </div>

    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>البند</th>
            <th>التصنيف</th>
            <th>المبلغ</th>
            <th>التاريخ</th>
            <th>طريقة الدفع</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in expenses" :key="e.id">
            <td>{{ e.title }}</td>
            <td>{{ e.category_name }}</td>
            <td>{{ formatMoney(e.amount) }}</td>
            <td>{{ e.expense_date }}</td>
            <td>{{ e.payment_method }}</td>
            <td class="actions">
              <button class="btn btn-sm btn-outline" @click="openEdit(e)">تعديل</button>
              <button class="btn btn-sm btn-danger icon-btn" @click="removeExpense(e)" title="حذف" aria-label="حذف">🗑️</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showForm" class="modal" @click.self="showForm = false">
      <div class="card modal-content">
        <h3>{{ form.id ? 'تعديل' : 'إضافة' }} مصروف</h3>
        <form @submit.prevent="save">
          <div class="form-group"><label>البند</label><input v-model="form.title" required /></div>
          <div class="form-group"><label>التصنيف</label><select v-model="form.category_id"><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name_ar }}</option></select></div>
          <div class="form-group"><label>المبلغ</label><input v-model.number="form.amount" type="number" required /></div>
          <div class="form-group"><label>تاريخ المصروف</label><input v-model="form.expense_date" type="date" /></div>
          <button type="submit" class="btn btn-primary">حفظ</button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { expenses as api } from '@/api';
import StatCard from '@/components/StatCard.vue';
import { formatMoney } from '@/utils/currency';

const expenses = ref([]);
const categories = ref([]);
const dayTotal = ref(0);
const monthTotal = ref(0);
const selectedDate = ref(new Date().toISOString().split('T')[0]);
const showForm = ref(false);
const form = ref({ id: null, title: '', category_id: 1, amount: 0, expense_date: new Date().toISOString().split('T')[0] });

const resetForm = () => {
  form.value = {
    id: null,
    title: '',
    category_id: categories.value[0]?.id || 1,
    amount: 0,
    expense_date: selectedDate.value,
  };
};

const openCreate = () => {
  resetForm();
  showForm.value = true;
};

const openEdit = (row) => {
  form.value = {
    id: row.id,
    title: row.title,
    category_id: row.category_id,
    amount: Number(row.amount || 0),
    expense_date: String(row.expense_date || '').slice(0, 10),
  };
  showForm.value = true;
};

const toMonthRange = (dateStr) => {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth();
  const from = new Date(y, m, 1).toISOString().slice(0, 10);
  const to = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  return { from, to };
};

const load = async () => {
  const { from, to } = toMonthRange(selectedDate.value);
  const [listRes, c, dayRes, monthRes] = await Promise.all([
    api.list({ from_date: from, to_date: to, limit: 500 }),
    api.categories(),
    api.list({ from_date: selectedDate.value, to_date: selectedDate.value, limit: 500 }),
    api.list({ from_date: from, to_date: to, limit: 1000 }),
  ]);

  expenses.value = listRes.data;
  categories.value = c.data;
  dayTotal.value = (dayRes.data || []).reduce((sum, x) => sum + Number(x.amount || 0), 0);
  monthTotal.value = (monthRes.data || []).reduce((sum, x) => sum + Number(x.amount || 0), 0);
};

const saving = ref(false);
const save = async () => {
  saving.value = true;
  try {
    if (form.value.id) await api.update(form.value.id, form.value);
    else await api.create(form.value);
    showForm.value = false;
    resetForm();
    await load();
  } catch (e) {
    window.alert(e.message || 'فشل حفظ المصروف');
  } finally {
    saving.value = false;
  }
};

const removeExpense = async (row) => {
  if (!window.confirm(`تأكيد حذف المصروف: ${row.title} ؟`)) return;
  await api.delete(row.id);
  await load();
};

onMounted(load);
</script>

<style lang="scss" scoped>
.page-header { margin-bottom: 20px; text-align: left; display: flex; justify-content: space-between; align-items: end; gap: 12px; }
.header-left { display: flex; flex-direction: column; gap: 6px; }
.header-left input { padding: 8px; border: 1px solid var(--border); border-radius: var(--radius); }
.actions { width: 140px; display: flex; gap: 8px; }
.icon-btn { min-width: 34px; padding: 6px 8px; border-radius: var(--radius-xs); }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; }
.modal-content { max-width: 420px; width: 90%; }
</style>
