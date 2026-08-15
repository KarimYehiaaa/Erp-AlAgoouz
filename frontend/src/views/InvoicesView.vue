<template>
  <div class="invoices-page">
    <div class="create-card card">
      <div>
        <h3>إنشاء فاتورة عميل</h3>
        <p>هذا القسم مخصص لفواتير العملاء اليدوية فقط لإرسالها ومشاركتها.</p>
      </div>
      <div class="create-actions">
        <router-link
          v-permission="'invoices.add'"
          to="/invoices/quotes"
          class="btn btn-outline quote-btn"
        >
          <AppIcon name="quote" />
          <span>عرض أسعار</span>
        </router-link>
        <router-link v-permission="'invoices.add'" to="/invoices/create" class="btn btn-primary"
          >+ إنشاء فاتورة</router-link
        >
      </div>
    </div>

    <div class="page-header">
      <h3>الفواتير اليدوية</h3>
      <select v-model="filterStatus" @change="load">
        <option value="">كل حالات الدفع</option>
        <option value="paid">مدفوعة</option>
        <option value="unpaid">غير مدفوعة</option>
        <option value="partial">جزئية</option>
        <option value="refunded">مستردة</option>
      </select>
    </div>

    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>رقم الفاتورة</th>
            <th>العميل</th>
            <th>الإجمالي</th>
            <th>حالة الدفع</th>
            <th>التاريخ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!invoices.length">
            <td colspan="6" class="empty">لا توجد فواتير يدويّة حتى الآن.</td>
          </tr>
          <tr v-for="inv in invoices" :key="inv.id">
            <td>
              <strong>{{ inv.invoice_number }}</strong>
            </td>
            <td>{{ inv.customer_name || 'عميل نقدي' }}</td>
            <td>{{ formatMoney(inv.total_amount) }}</td>
            <td>
              <span :class="statusClass(inv.payment_status)">{{
                statusLabel(inv.payment_status)
              }}</span>
            </td>
            <td>{{ formatDate(inv.issued_at || inv.created_at) }}</td>
            <td class="actions">
              <router-link :to="`/invoices/${inv.id}`" class="icon-btn" title="عرض">
                <AppIcon name="search" :size="16" />
              </router-link>
              <router-link
                v-permission="'invoices.edit'"
                :to="`/invoices/${inv.id}/edit`"
                class="icon-btn"
                title="تعديل"
              >
                <AppIcon name="edit" :size="16" />
              </router-link>
              <button
                v-permission="'invoices.delete'"
                type="button"
                class="icon-btn danger"
                @click="deleteInvoice(inv.id)"
                title="حذف"
              >
                <AppIcon name="delete" :size="16" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { invoices as api } from '@/api';
import { formatMoney } from '@/utils/currency';

const invoices = ref<any[]>([]);
const filterStatus = ref('');

const statusLabel = (s: any) =>
  (
    ({
      paid: 'مدفوعة',
      partial: 'جزئية',
      unpaid: 'غير مدفوعة',
      refunded: 'مستردة',
    }) as Record<string, string>
  )[s] || s;

const statusClass = (s: any) => [
  'badge',
  s === 'paid' ? 'badge-success' : s === 'unpaid' ? 'badge-danger' : 'badge-warning',
];
const formatDate = (d: any) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

const load = async () => {
  const params: Record<string, any> = {};
  if (filterStatus.value) params.payment_status = filterStatus.value;
  const res = await api.list(params);
  invoices.value = res.data || [];
};

const deleteInvoice = async (id: any) => {
  if (!window.confirm('هل أنت متأكد من حذف هذه الفاتورة؟')) return;
  try {
    await api.delete(id);
    await load();
  } catch (e: any) {
    window.alert(e?.message || 'فشل حذف الفاتورة');
  }
};

onMounted(load);
</script>

<style lang="scss" scoped>
.create-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
  h3 {
    margin: 0 0 6px;
    color: var(--primary-strong);
  }
  p {
    margin: 0;
    color: var(--text-muted);
  }
}
.create-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.quote-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.page-header {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  align-items: center;
  justify-content: space-between;
  select {
    padding: 10px 14px;
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    transition: var(--transition);
    &:focus {
      outline: none;
      border-color: var(--primary);
    }
  }
}
.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 24px !important;
}
.actions {
  white-space: nowrap;
}
.actions .icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  cursor: pointer;
  margin-left: 4px;
  font-size: 0.9rem;
  border-radius: var(--radius-xs);
  transition: var(--transition);
  &:hover {
    background: var(--bg);
    border-color: var(--primary-soft);
  }
  &.danger {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 25%, transparent);
    &:hover {
      background: color-mix(in srgb, var(--danger) 8%, transparent);
    }
  }
}
</style>
