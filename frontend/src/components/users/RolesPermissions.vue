<template>
  <div class="roles-permissions-wrapper">
    <div class="roles-layout">
      
      <!-- Permissions Matrix (Left Panel) -->
      <article class="card matrix-card">
        <div class="card-head">
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <h3>صلاحيات دور: <span class="highlight">{{ selectedRole ? selectedRole.name_ar : '...' }}</span></h3>
            <button class="btn btn-primary btn-save" @click="savePermissions" :disabled="loading || !selectedRole || isOwner(selectedRole)">
              <AppIcon name="save" :size="16" /> حفظ الصلاحيات
            </button>
          </div>
        </div>

        <div class="matrix-wrap" v-if="selectedRole">
          <table class="permissions-table">
            <thead>
              <tr>
                <th class="module-col">الشاشة</th>
                <th class="action-col">عرض</th>
                <th class="action-col">إضافة</th>
                <th class="action-col">تعديل</th>
                <th class="action-col">حذف</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="mod in modules" :key="mod.id">
                <td class="module-col">
                  <AppIcon :name="mod.icon" :size="18" /> {{ mod.title }}
                </td>
                <td class="action-col">
                  <label class="custom-check">
                    <input type="checkbox" :disabled="isOwner(selectedRole)" v-model="selectedPermissions" :value="`${mod.id}.view`" />
                    <span class="check-mark">
                      <svg viewBox="0 0 12 10" fill="none"><polyline points="1.5 5 4.5 8 10.5 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </span>
                  </label>
                </td>
                <td class="action-col">
                  <label class="custom-check">
                    <input type="checkbox" :disabled="isOwner(selectedRole)" v-model="selectedPermissions" :value="`${mod.id}.add`" />
                    <span class="check-mark">
                      <svg viewBox="0 0 12 10" fill="none"><polyline points="1.5 5 4.5 8 10.5 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </span>
                  </label>
                </td>
                <td class="action-col">
                  <label class="custom-check">
                    <input type="checkbox" :disabled="isOwner(selectedRole)" v-model="selectedPermissions" :value="`${mod.id}.edit`" />
                    <span class="check-mark">
                      <svg viewBox="0 0 12 10" fill="none"><polyline points="1.5 5 4.5 8 10.5 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </span>
                  </label>
                </td>
                <td class="action-col">
                  <label class="custom-check">
                    <input type="checkbox" :disabled="isOwner(selectedRole)" v-model="selectedPermissions" :value="`${mod.id}.delete`" />
                    <span class="check-mark">
                      <svg viewBox="0 0 12 10" fill="none"><polyline points="1.5 5 4.5 8 10.5 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </span>
                  </label>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="isOwner(selectedRole)" class="overlay-lock">
            <div class="lock-msg">
              <AppIcon name="lock" :size="32" />
              <p>صلاحيات المالك كاملة وغير قابلة للتعديل</p>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <p>الرجاء اختيار دور من القائمة الجانبية لعرض وتعديل صلاحياته.</p>
        </div>
      </article>

      <!-- Roles Sidebar (Right Panel) -->
      <article class="card sidebar-card">
        <div class="card-head">
          <h3>اختر الدور</h3>
        </div>
        <ul class="roles-list">
          <li v-for="role in roles" :key="role.id" 
              class="role-item" 
              :class="{ active: selectedRole?.id === role.id, 'is-owner': isOwner(role) }"
              @click="selectRole(role)">
            <div class="role-icon">
              <AppIcon name="shield" :size="20" />
            </div>
            <div class="role-info">
              <strong>{{ role.name_ar }}</strong>
              <small>{{ role.description }}</small>
            </div>
            <div class="role-badge-icon" v-if="isOwner(role)">
              <AppIcon name="lock" :size="14" />
            </div>
          </li>
        </ul>
      </article>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import api from '@/api/index';
import { useAppStore } from '@/stores/app';

const appStore = useAppStore();
const toast = { 
  success: (msg: string) => appStore.addToast(msg, 'success'), 
  error: (msg: string) => appStore.addToast(msg, 'error') 
};

const roles = ref<any[]>([]);
const allPermissions = ref<any[]>([]);
const selectedRole = ref<any>(null);
const selectedPermissions = ref<string[]>([]);
const loading = ref(false);

const modules = [
  { id: 'dashboard', title: 'الرئيسية', icon: 'dashboard' },
  { id: 'pos', title: 'شاشة البيع', icon: 'pos' },
  { id: 'products', title: 'المنتجات', icon: 'inventory_2' },
  { id: 'inventory', title: 'حركة المخزن', icon: 'sync_alt' },
  { id: 'customers', title: 'العملاء', icon: 'group' },
  { id: 'suppliers', title: 'الموردين', icon: 'local_shipping' },
  { id: 'reports', title: 'التقارير', icon: 'bar_chart' },
  { id: 'invoices', title: 'الفواتير', icon: 'receipt' },
  { id: 'expenses', title: 'المصروفات', icon: 'payments' },
  { id: 'settings', title: 'الإعدادات', icon: 'settings' },
  { id: 'shifts', title: 'الوردية', icon: 'lock_clock' },
  { id: 'users', title: 'المستخدمون', icon: 'manage_accounts' },
  { id: 'promotions', title: 'العروض الترويجية', icon: 'sell' }
];

const extractData = (res: any) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.data?.data)) return res.data.data;
  return [];
};

const loadData = async () => {
  try {
    const [rolesRes, permsRes] = await Promise.all([
      api.get('/roles'),
      api.get('/permissions')
    ]);
    roles.value = extractData(rolesRes);
    allPermissions.value = extractData(permsRes);
    if (roles.value.length) {
      selectRole(roles.value[0]);
    }
  } catch (error) {
    console.error('loadData error:', error);
    toast.error('فشل في تحميل الأدوار والصلاحيات');
  }
};

const selectRole = async (role: any) => {
  selectedRole.value = role;
  try {
    const res = await api.get(`/roles/${role.id}/permissions`);
    const rawList = extractData(res);
    
    // Map backend permission IDs or objects to string codes (e.g. 174 -> 'dashboard.view')
    selectedPermissions.value = rawList
      .map((item: any) => {
        const id = typeof item === 'number' ? item : (item.permission_id || item.id);
        const found = allPermissions.value.find((ap: any) => ap.id === Number(id));
        if (found) return found.code;
        if (typeof item === 'string') return item;
        return null;
      })
      .filter(Boolean) as string[];
  } catch (error) {
    console.error('selectRole error:', error);
    toast.error('فشل في تحميل صلاحيات الدور');
  }
};

const isOwner = (role: any) => {
  return role && (role.id === 1 || role.name === 'admin');
};

const savePermissions = async () => {
  if (!selectedRole.value || isOwner(selectedRole.value)) return;
  
  loading.value = true;
  try {
    // Map string codes (e.g. 'dashboard.view') to integer IDs (e.g. 174)
    const permIds = selectedPermissions.value
      .map((code: string) => {
        const found = allPermissions.value.find((ap: any) => ap.code === code);
        return found ? Number(found.id) : null;
      })
      .filter((id): id is number => typeof id === 'number' && !isNaN(id) && id > 0);

    await api.post(`/roles/${selectedRole.value.id}/permissions`, { permissionIds: permIds });
    toast.success('تم حفظ الصلاحيات بنجاح!');
  } catch (error) {
    console.error('savePermissions error:', error);
    toast.error('حدث خطأ أثناء حفظ الصلاحيات');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.roles-permissions-wrapper {
  margin-top: 15px;
}

.roles-layout {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 20px;
  align-items: flex-start;
}

@media (max-width: 1024px) {
  .roles-layout {
    grid-template-columns: 1fr;
    grid-template-areas: 
      "sidebar"
      "matrix";
  }
  
  .sidebar-card {
    grid-area: sidebar;
  }
  
  .matrix-card {
    grid-area: matrix;
  }
}

.matrix-card {
  min-height: 500px;
  position: relative;
}

.sidebar-card {
  min-height: 500px;
}

.highlight {
  color: var(--primary);
}

.btn-save {
  padding: 8px 16px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
}
.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.matrix-wrap {
  position: relative;
  overflow-x: auto;
  margin-top: 20px;
  border: 1px solid var(--border);
  border-radius: 12px;
}

.permissions-table {
  width: 100%;
  border-collapse: collapse;
}

.permissions-table th {
  background: rgba(212, 154, 91, 0.05);
  padding: 15px;
  font-weight: 700;
  color: var(--text-strong);
  border-bottom: 1px solid var(--border);
  text-align: center;
}

.permissions-table td {
  padding: 12px 15px;
  border-bottom: 1px solid var(--border);
  text-align: center;
}

.permissions-table tr:last-child td {
  border-bottom: none;
}

.permissions-table .module-col {
  text-align: right;
  width: 30%;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: none !important;
}
.permissions-table tr {
  border-bottom: 1px solid var(--border);
}

.roles-list {
  list-style: none;
  padding: 0;
  margin: 15px 0 0 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.role-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
  background: var(--card-bg);
}

.role-item:hover {
  border-color: var(--primary);
  background: rgba(212, 154, 91, 0.02);
}

.role-item.active {
  border-color: var(--primary);
  background: rgba(212, 154, 91, 0.08);
  box-shadow: 0 4px 12px rgba(212, 154, 91, 0.1);
}

.role-item.is-owner {
  border-color: rgba(255, 100, 100, 0.3);
}

.role-item.is-owner.active {
  background: rgba(255, 100, 100, 0.05);
  border-color: rgba(255, 100, 100, 0.5);
}

.role-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.role-info strong {
  font-size: 1rem;
  color: var(--text-strong);
}

.role-info small {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.role-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(212, 154, 91, 0.1);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.is-owner .role-icon {
  background: rgba(255, 100, 100, 0.1);
  color: #ff6464;
}

.role-badge-icon {
  color: #ff6464;
}

/* Custom Checkbox */
.custom-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  user-select: none;
}
.custom-check input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}
.check-mark {
  height: 22px;
  width: 22px;
  background-color: var(--bg-color);
  border: 1px solid var(--border);
  border-radius: 6px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.custom-check:hover input ~ .check-mark {
  border-color: var(--primary);
}
.custom-check input:checked ~ .check-mark {
  background-color: var(--primary);
  border-color: var(--primary);
}
.custom-check input:disabled ~ .check-mark {
  opacity: 0.5;
  cursor: not-allowed;
}
.check-mark svg {
  width: 14px;
  height: 14px;
  color: white;
  opacity: 0;
  transform: scale(0.5);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.custom-check input:checked ~ .check-mark svg {
  opacity: 1;
  transform: scale(1);
}

.overlay-lock {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(var(--bg-color-rgb), 0.7);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.lock-msg {
  text-align: center;
  background: var(--card-bg);
  padding: 20px 40px;
  border-radius: 12px;
  border: 1px solid rgba(255, 100, 100, 0.3);
  color: #ff6464;
  font-weight: 600;
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
}
.empty-state {
  text-align: center;
  padding: 50px;
  color: var(--text-muted);
}
</style>
