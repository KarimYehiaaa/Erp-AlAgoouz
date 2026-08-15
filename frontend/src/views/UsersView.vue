<template>
  <div class="users-page">
    <section class="page-header card">
      <div>
        <h2>المستخدمون والصلاحيات</h2>
        <p>عدّل بيانات المستخدمين، وحساباتهم والأدوار والصلاحيات المخصصة لهم من هنا.</p>
      </div>
      <div class="header-actions">
        <button
          v-permission="'users.add'"
          v-if="activeTab === 'users'"
          type="button"
          class="btn btn-add"
          @click="startCreate"
        >
          <AppIcon name="add" :size="16" /> إضافة مستخدم جديد
        </button>
        <button type="button" class="btn btn-outline" @click="refreshUsers" :disabled="loading">
          تحديث
        </button>
      </div>
    </section>

    <div class="tabs-container">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'users' }"
        @click="activeTab = 'users'"
      >
        <AppIcon name="users" :size="18" /> المستخدمون
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'roles' }"
        @click="activeTab = 'roles'"
      >
        <AppIcon name="shield" :size="18" /> الأدوار والصلاحيات
      </button>
    </div>

    <div v-show="activeTab === 'users'">
      <section class="users-layout">
        <!-- قائمة المستخدمين -->
        <UsersTable
          :filtered-users="filteredUsers"
          :roles="roles"
          :search-query="searchQuery"
          :selected-user-id="selectedUser?.id"
          :current-user-id="currentUserId"
          @update:search-query="searchQuery = $event"
          @edit="selectUser"
          @delete="deleteUser"
        />

        <!-- نموذج الإضافة والتعديل -->
        <UserForm
          :form="form"
          :is-create-mode="isCreateMode"
          :roles="roles"
          :validations="validations"
          :show-advanced-options="showAdvancedOptions"
          :show-password="showPassword"
          :strength-percent="strengthPercent"
          :strength-text="strengthText"
          :strength-color="strengthColor"
          :message="message"
          :error="error"
          :saving="saving"
          @save="saveUser"
          @cancel="resetForm"
          @toggle-advanced="showAdvancedOptions = !showAdvancedOptions"
          @toggle-password="showPassword = !showPassword"
          @validate-username="validateUsername"
          @validate-email="validateEmail"
          @password-input="evaluatePasswordStrength"
        />
      </section>

      <!-- Roles Management Section -->
      <RolesManager
        :roles="roles"
        :users="users"
        :show-role-form="showRoleForm"
        :editing-role="editingRole"
        :saving-role="savingRole"
        :role-form="roleForm"
        @create="startCreateRole"
        @cancel="cancelRoleForm"
        @save="saveRole"
        @edit-role="startEditRole"
        @delete-role="confirmDeleteRole"
      />
    </div>

    <!-- New Advanced RBAC UI -->
    <div v-if="activeTab === 'roles'">
      <RolesPermissions />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { users as api } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import RolesPermissions from '@/components/users/RolesPermissions.vue';
import UsersTable from '@/components/users/UsersTable.vue';
import UserForm from '@/components/users/UserForm.vue';
import RolesManager from '@/components/users/RolesManager.vue';

const activeTab = ref('users');

const authStore = useAuthStore();
const appStore = useAppStore();
const currentUserId = computed(() => authStore.user?.id);

const users = ref<any[]>([]);
const roles = ref<any[]>([]);
const loading = ref(false);
const saving = ref(false);
const showPassword = ref(false);
const showAdvancedOptions = ref(false);
const strengthPercent = ref(0);
const strengthText = ref('ضعيفة جداً ⚠️');
const strengthColor = ref('#dc2626');

// permissions matrix state
const permissions = ref<any[]>([]);
const selectedPermissionRole = ref<any>(null);
const selectedPermissionIds = ref<any[]>([]);

// roles management state
const showRoleForm = ref(false);
const editingRole = ref<any>(null);
const savingRole = ref(false);
const roleForm = ref({ name: '', name_ar: '', description: '' });

const validations = ref({
  username: { valid: null as boolean | null, msg: '' },
  email: { valid: null as boolean | null, msg: '' },
});

const validateUsername = () => {
  const val = form.value.username.trim();
  if (!val) {
    validations.value.username = { valid: false, msg: 'اسم المستخدم مطلوب' };
  } else if (val.length < 3) {
    validations.value.username = { valid: false, msg: 'يجب أن يكون 3 حروف على الأقل' };
  } else {
    validations.value.username = { valid: true, msg: 'اسم المستخدم متاح ✓' };
  }
};

const validateEmail = () => {
  const val = form.value.email.trim();
  if (!val) {
    validations.value.email = { valid: true, msg: '' };
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(val)) {
    validations.value.email = { valid: false, msg: 'صيغة البريد الإلكتروني غير صحيحة' };
  } else {
    validations.value.email = { valid: true, msg: 'بريد إلكتروني صالح ✓' };
  }
};

const evaluatePasswordStrength = () => {
  const pwd = form.value.password;
  if (!pwd) {
    strengthPercent.value = 0;
    strengthText.value = 'ضعيفة جداً ⚠️';
    strengthColor.value = '#dc2626';
    return;
  }
  let score = 0;
  if (pwd.length >= 6) score += 20;
  if (pwd.length >= 10) score += 20;
  if (/[A-Z]/.test(pwd)) score += 20;
  if (/[0-9]/.test(pwd)) score += 20;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 20;

  strengthPercent.value = score;
  if (score <= 40) {
    strengthText.value = 'ضعيفة ⚠️';
    strengthColor.value = '#dc2626';
  } else if (score <= 80) {
    strengthText.value = 'متوسطة ⚡';
    strengthColor.value = '#d97706';
  } else {
    strengthText.value = 'قوية جداً ✨';
    strengthColor.value = '#16a34a';
  }
};

const selectedUser = ref<any>(null);
const isCreateMode = ref(false);
const searchQuery = ref('');
const message = ref('');
const error = ref(false);

const form = ref({
  id: null as number | null,
  username: '',
  full_name: '',
  email: '',
  phone: '',
  role_id: null as number | null,
  is_active: true,
  password: '',
});

const filteredUsers = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return users.value;
  return users.value.filter(
    (u: any) =>
      u.username?.toLowerCase().includes(query) ||
      u.full_name?.toLowerCase().includes(query) ||
      u.email?.toLowerCase().includes(query),
  );
});

const handleRolePermissionChange = async () => {
  if (!selectedPermissionRole.value) return;
  const role = roles.value.find((r: any) => r.id === selectedPermissionRole.value);
  if (role?.name === 'admin') {
    selectedPermissionIds.value = permissions.value.map((p: any) => p.id);
    return;
  }
  try {
    const res = await api.rolePermissions(selectedPermissionRole.value);
    selectedPermissionIds.value = res.data || [];
  } catch (e: any) {
    console.error('Failed to load role permissions:', e);
    appStore.addToast('فشل تحميل صلاحيات هذا الدور', 'error');
  }
};

// =================== Roles Management ===================
const startCreateRole = () => {
  editingRole.value = null;
  roleForm.value = { name: '', name_ar: '', description: '' };
  showRoleForm.value = true;
};

const startEditRole = (role: any) => {
  editingRole.value = role;
  roleForm.value = { name: role.name, name_ar: role.name_ar, description: role.description || '' };
  showRoleForm.value = true;
};

const cancelRoleForm = () => {
  showRoleForm.value = false;
  editingRole.value = null;
  roleForm.value = { name: '', name_ar: '', description: '' };
};

const saveRole = async () => {
  if (!roleForm.value.name_ar?.trim()) {
    appStore.addToast('يرجى إدخال الاسم العربي للمنصب', 'error');
    return;
  }
  if (!editingRole.value && !roleForm.value.name?.trim()) {
    appStore.addToast('يرجى إدخال الاسم الإنجليزي للمنصب', 'error');
    return;
  }
  savingRole.value = true;
  try {
    if (editingRole.value) {
      await api.updateRole(editingRole.value.id, {
        name_ar: roleForm.value.name_ar,
        description: roleForm.value.description,
      });
      appStore.addToast('تم تعديل المنصب بنجاح ✅', 'success');
    } else {
      await api.createRole({
        name: roleForm.value.name,
        name_ar: roleForm.value.name_ar,
        description: roleForm.value.description,
      });
      appStore.addToast('تم إنشاء المنصب بنجاح ✅', 'success');
    }
    cancelRoleForm();
    await refreshUsers();
  } catch (e: any) {
    appStore.addToast(e?.response?.data?.message || e?.message || 'فشل حفظ المنصب', 'error');
  } finally {
    savingRole.value = false;
  }
};

const confirmDeleteRole = async (role: any) => {
  if (!confirm(`هل أنت متأكد من حذف منصب "${role.name_ar}"؟\nلا يمكن التراجع عن هذا الإجراء.`))
    return;
  try {
    await api.deleteRole(role.id);
    appStore.addToast('تم حذف المنصب بنجاح', 'success');
    await refreshUsers();
  } catch (e: any) {
    appStore.addToast(e?.response?.data?.message || e?.message || 'فشل حذف المنصب', 'error');
  }
};
// =================== End Roles Management ===================

const refreshUsers = async () => {
  loading.value = true;
  try {
    const [usersRes, rolesRes, permsRes] = await Promise.all([
      api.list(),
      api.roles(),
      api.permissions(),
    ]);
    users.value = usersRes.data || [];
    roles.value = rolesRes.data || [];
    permissions.value = permsRes.data || [];

    if (!selectedPermissionRole.value && roles.value.length) {
      const firstNonAdmin = roles.value.find((r: any) => r.name !== 'admin') || roles.value[0];
      selectedPermissionRole.value = firstNonAdmin.id;
      handleRolePermissionChange();
    }
  } catch (e: any) {
    console.error('Failed to load users:', e);
  } finally {
    loading.value = false;
  }
};

const startCreate = () => {
  isCreateMode.value = true;
  selectedUser.value = null;
  form.value = {
    id: null,
    username: '',
    full_name: '',
    email: '',
    phone: '',
    role_id: roles.value[0]?.id || null,
    is_active: true,
    password: '',
  };
  message.value = '';
  error.value = false;
};

const selectUser = (user: any) => {
  isCreateMode.value = false;
  selectedUser.value = user;
  form.value = {
    id: user.id,
    username: user.username || '',
    full_name: user.full_name || '',
    email: user.email || '',
    phone: user.phone || '',
    role_id: user.role_id || roles.value[0]?.id || null,
    is_active: !!user.is_active,
    password: '',
  };
  validations.value = {
    username: { valid: null, msg: '' },
    email: { valid: null, msg: '' },
  };
  strengthPercent.value = 0;
  message.value = '';
  error.value = false;
};

const resetForm = () => {
  selectedUser.value = null;
  isCreateMode.value = false;
  form.value = {
    id: null,
    username: '',
    full_name: '',
    email: '',
    phone: '',
    role_id: roles.value[0]?.id || null,
    is_active: true,
    password: '',
  };
  validations.value = {
    username: { valid: null, msg: '' },
    email: { valid: null, msg: '' },
  };
  strengthPercent.value = 0;
  message.value = '';
  error.value = false;
};

const saveUser = async () => {
  saving.value = true;
  message.value = '';
  error.value = false;
  try {
    const payload: Record<string, any> = {
      username: form.value.username?.trim() || null,
      full_name: form.value.full_name?.trim() || null,
      email: form.value.email?.trim() || null,
      phone: form.value.phone?.trim() || null,
      role_id: form.value.role_id,
      is_active: form.value.is_active,
    };
    if (form.value.password?.trim()) {
      payload.password = form.value.password.trim();
    }

    if (isCreateMode.value) {
      if (!payload.password) {
        throw new Error('كلمة المرور مطلوبة للمستخدم الجديد');
      }
      await api.create(payload);
      message.value = 'تم إنشاء المستخدم بنجاح';
    } else {
      await api.update(form.value.id, payload);
      message.value = 'تم تحديث بيانات المستخدم بنجاح';
    }

    await refreshUsers();

    if (!isCreateMode.value) {
      const updated = users.value.find((u: any) => u.id === form.value.id);
      if (updated) selectUser(updated);
    } else {
      resetForm();
    }
  } catch (e: any) {
    error.value = true;
    message.value = e.message || 'فشل حفظ التغييرات';
  } finally {
    saving.value = false;
  }
};

const deleteUser = async (user: any) => {
  if (user.id === currentUserId.value) {
    appStore.addToast('لا يمكنك حذف الحساب الحالي الذي تسجل به الدخول.', 'error');
    return;
  }
  const ok = confirm(
    `هل أنت متأكد من حذف المستخدم "${user.full_name || user.username}" نهائياً من النظام؟`,
  );
  if (!ok) return;

  saving.value = true;
  try {
    const userBackup = { ...user };
    await api.delete(user.id);
    if (selectedUser.value?.id === user.id || form.value.id === user.id) {
      resetForm();
    }
    await refreshUsers();

    appStore.addToast(
      `تم حذف المستخدم "${userBackup.username}" بنجاح`,
      'success',
      10000,
      async () => {
        try {
          const randomPassword =
            Math.random().toString(36).slice(-8) + '!Aa' + Math.floor(Math.random() * 10);
          const payload = {
            username: userBackup.username,
            full_name: userBackup.full_name,
            email: userBackup.email,
            phone: userBackup.phone,
            role_id: userBackup.role_id,
            is_active: userBackup.is_active,
            password: randomPassword,
          };
          await api.create(payload);
          appStore.addToast(
            `تم استعادة المستخدم "${userBackup.username}" بنجاح! كلمة المرور: ${randomPassword}`,
            'success',
            8000,
          );
          await refreshUsers();
        } catch (err: any) {
          appStore.addToast('فشل استعادة المستخدم: ' + err.message, 'error');
        }
      },
    );
  } catch (e: any) {
    appStore.addToast(e.message || 'فشل حذف المستخدم', 'error');
  } finally {
    saving.value = false;
  }
};

onMounted(refreshUsers);
</script>

<style scoped lang="scss">
.users-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  h2 {
    margin: 0;
    color: var(--primary-strong);
  }
  p {
    margin: 6px 0 0;
    color: var(--text-muted);
    font-size: 0.94rem;
  }
}
.header-actions {
  display: flex;
  gap: 10px;
}
.users-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(350px, 0.85fr);
  gap: 20px;
  align-items: start;
}

/* Tabs */
.tabs-container {
  display: flex;
  gap: 15px;
  margin-bottom: 25px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
}

.tab-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-family: inherit;
  font-size: 1.1rem;
  font-weight: 600;
  padding: 10px 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.tab-btn:hover {
  background: rgba(212, 154, 91, 0.05);
  color: var(--primary);
}

.tab-btn.active {
  color: var(--primary);
  background: rgba(212, 154, 91, 0.1);
  box-shadow: 0 4px 12px rgba(212, 154, 91, 0.1);
}

@media (max-width: 980px) {
  .users-layout {
    grid-template-columns: 1fr;
  }
}
</style>
