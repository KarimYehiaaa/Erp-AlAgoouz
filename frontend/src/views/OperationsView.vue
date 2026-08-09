<template>
  <div class="operations-page">
    <section class="ops-hero card">
      <div>
        <span class="eyebrow">مركز التشغيل</span>
        <h2>تنبيهات ومراجعة حركة النظام</h2>
        <p>مكان واحد لمتابعة المخاطر التشغيلية ومن نفذ العمليات المهمة داخل النظام.</p>
      </div>
      <button class="btn btn-primary" type="button" :disabled="loading" @click="loadAll">
        {{ loading ? 'جاري التحديث...' : 'تحديث المركز' }}
      </button>
    </section>

    <section class="summary-grid">
      <article class="card summary-card">
        <span>إجمالي التنبيهات</span>
        <strong>{{ alertsSummary.total || 0 }}</strong>
      </article>
      <article class="card summary-card danger">
        <span>تنبيهات حرجة</span>
        <strong>{{ alertsSummary.critical || 0 }}</strong>
      </article>
      <article class="card summary-card">
        <span>عمليات مراجعة</span>
        <strong>{{ auditLogs.length }}</strong>
      </article>
    </section>

    <section class="alerts-grid">
      <article
        v-for="alert in alerts"
        :key="alert.type"
        class="card alert-card"
        :class="alert.severity"
      >
        <div class="alert-head">
          <div>
            <span>{{ severityLabel(alert.severity) }}</span>
            <h3>{{ alert.title }}</h3>
          </div>
          <strong>{{ alert.count }}</strong>
        </div>
        <p>{{ alert.message }}</p>
        <ul v-if="alert.items?.length">
          <li
            v-for="item in alert.items.slice(0, 4)"
            :key="item.id || item.product_id || item.name_ar"
          >
            {{ item.name_ar || item.sku || item.title || 'عنصر' }}
            <small v-if="item.balance"> · {{ formatMoney(item.balance) }}</small>
            <small v-else-if="item.total_quantity !== undefined">
              · {{ Number(item.total_quantity).toFixed(2) }}</small
            >
          </li>
        </ul>
        <router-link class="alert-link" :to="alert.action_to">فتح القسم المرتبط</router-link>
      </article>

      <article v-if="!alerts.length && !loading" class="card empty-state">
        <h3>التشغيل مستقر</h3>
        <p>لا توجد تنبيهات تشغيل مهمة حاليًا.</p>
      </article>
    </section>

    <section class="card audit-card">
      <div class="audit-head">
        <div>
          <h3>سجل المراجعة</h3>
          <p>آخر العمليات الحساسة مرتبة من الأحدث للأقدم.</p>
        </div>
        <div class="filters">
          <input
            v-model.trim="filters.entity_type"
            placeholder="نوع الكيان مثل users"
            @keyup.enter="loadAudit"
          />
          <input
            v-model.trim="filters.action"
            placeholder="العملية مثل user_update"
            @keyup.enter="loadAudit"
          />
          <button class="btn btn-outline" type="button" @click="loadAudit">تصفية</button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الوقت</th>
              <th>المستخدم</th>
              <th>العملية</th>
              <th>الكيان</th>
              <th>رقم</th>
              <th>ملخص</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in auditLogs" :key="log.id">
              <td>{{ formatDateTime(log.created_at) }}</td>
              <td>{{ log.full_name || log.username || 'النظام' }}</td>
              <td>
                <span class="pill">{{ actionLabel(log.action) }}</span>
              </td>
              <td>{{ entityLabel(log.entity_type) }}</td>
              <td>{{ log.entity_id || '-' }}</td>
              <td>{{ logSummary(log) }}</td>
            </tr>
            <tr v-if="!auditLogs.length && !loading">
              <td colspan="6" class="empty">لا توجد عمليات مراجعة مطابقة.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { operations } from '@/api';
import { formatMoney } from '@/utils/currency';

const loading = ref(false);
const alertsSummary = ref({ total: 0, critical: 0 });
const auditLogs = ref([]);
const filters = ref({ entity_type: '', action: '' });

const alerts = computed(() => alertsSummary.value.alerts || []);

const severityLabel = (severity) =>
  ({
    danger: 'حرج',
    warning: 'تحذير',
    info: 'متابعة',
  })[severity] || 'تنبيه';

const actionLabel = (action) =>
  ({
    user_create: 'إنشاء مستخدم',
    user_update: 'تعديل مستخدم',
    user_delete: 'حذف مستخدم',
    sales_delete_type: 'حذف مبيعات نوع',
    products_delete_all: 'حذف كل المنتجات',
    inventory_clear_all: 'تصفير المخزون',
    backup_create: 'إنشاء نسخة احتياطية',
    backup_restore: 'استرجاع نسخة',
  })[action] || action;

const entityLabel = (entity) =>
  ({
    users: 'المستخدمين',
    sales: 'المبيعات',
    products: 'المنتجات',
    inventory: 'المخزون',
    backup: 'النسخ الاحتياطي',
  })[entity] ||
  entity ||
  '-';

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

const logSummary = (log) => {
  const data = log.new_data || log.old_data || {};
  if (data.username) return `المستخدم: ${data.username}`;
  if (data.name_ar) return data.name_ar;
  if (data.invoice_number) return data.invoice_number;
  const keys = Object.keys(data).filter((key) => data[key] !== undefined && data[key] !== null);
  return keys.length ? keys.slice(0, 3).join('، ') : '-';
};

const loadAlerts = async () => {
  alertsSummary.value = (await operations.alerts()).data || { total: 0, critical: 0, alerts: [] };
};

const loadAudit = async () => {
  const params = Object.fromEntries(Object.entries(filters.value).filter(([, value]) => value));
  auditLogs.value = (await operations.auditLogs({ limit: 80, ...params })).data || [];
};

const loadAll = async () => {
  loading.value = true;
  try {
    await Promise.all([loadAlerts(), loadAudit()]);
  } finally {
    loading.value = false;
  }
};

onMounted(loadAll);
</script>

<style scoped lang="scss">
.operations-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.ops-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
  background:
    radial-gradient(
      circle at 8% 12%,
      color-mix(in srgb, var(--accent) 24%, transparent),
      transparent 34%
    ),
    linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, var(--surface)), var(--surface));

  h2 {
    margin: 6px 0;
    font-size: clamp(1.7rem, 3vw, 2.5rem);
  }

  p {
    margin: 0;
    color: var(--text-muted);
    font-weight: 700;
  }
}

.eyebrow {
  color: var(--primary);
  font-weight: 950;
  font-size: 0.82rem;
}

.summary-grid,
.alerts-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.summary-card {
  span {
    color: var(--text-muted);
    font-weight: 800;
  }

  strong {
    display: block;
    margin-top: 8px;
    font-size: 2.2rem;
    color: var(--primary);
  }

  &.danger strong {
    color: var(--danger);
  }
}

.alert-card {
  position: relative;
  overflow: hidden;
  border-inline-start: 5px solid var(--primary);

  &.danger {
    border-inline-start-color: var(--danger);
  }
  &.warning {
    border-inline-start-color: var(--warning);
  }
  &.info {
    border-inline-start-color: var(--info);
  }

  p {
    color: var(--text-muted);
    font-weight: 700;
    line-height: 1.7;
  }

  ul {
    display: grid;
    gap: 7px;
    margin: 14px 0;
    padding: 0;
    list-style: none;
  }

  li {
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--bg-elevated) 82%, transparent);
    font-weight: 800;
  }

  small {
    color: var(--text-muted);
  }
}

.alert-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;

  span {
    color: var(--text-muted);
    font-size: 0.78rem;
    font-weight: 950;
  }

  h3 {
    margin: 4px 0 0;
  }

  strong {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: #fff;
    background: var(--primary);
  }
}

.alert-link {
  color: var(--primary);
  font-weight: 950;
}

.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-muted);
}

.audit-card {
  overflow: hidden;
}

.audit-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

  h3 {
    margin: 0;
  }

  p {
    margin: 4px 0 0;
    color: var(--text-muted);
  }
}

.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;

  input {
    min-width: 180px;
  }
}

.table-wrap {
  overflow: auto;

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 12px 10px;
    border-bottom: 1px solid var(--border);
    text-align: right;
    white-space: nowrap;
  }

  th {
    color: var(--text-muted);
    font-size: 0.84rem;
  }
}

.pill {
  display: inline-flex;
  padding: 5px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--primary);
  font-weight: 900;
}

.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 20px;
}

@media (max-width: 980px) {
  .ops-hero,
  .audit-head {
    align-items: stretch;
    flex-direction: column;
  }

  .summary-grid,
  .alerts-grid {
    grid-template-columns: 1fr;
  }

  .filters input,
  .filters .btn {
    flex: 1;
  }
}
</style>
