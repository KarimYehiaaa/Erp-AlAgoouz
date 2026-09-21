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
          @click="onStartCreate"
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
          :warehouses="warehouses"
          :search-query="searchQuery"
          :selected-user-id="selectedUser?.id"
          :current-user-id="currentUserId"
          @update:search-query="searchQuery = $event"
          @edit="onSelectUser"
          @delete="deleteUser"
        />

        <!-- نموذج الإضافة والتعديل -->
        <UserForm
          :form="form"
          :is-create-mode="isCreateMode"
          :roles="roles"
          :warehouses="warehouses"
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
          @cancel="onResetForm"
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
import { onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import RolesPermissions from '@/components/users/RolesPermissions.vue';
import UsersTable from '@/components/users/UsersTable.vue';
import UserForm from '@/components/users/UserForm.vue';
import RolesManager from '@/components/users/RolesManager.vue';
import { useUserFormValidation } from '@/composables/useUserFormValidation';
import { useUsersManagement } from '@/composables/useUsersManagement';
import { useRolesManagement } from '@/composables/useRolesManagement';

const activeTab = ref('users');

const authStore = useAuthStore();
const appStore = useAppStore();

const showPassword = ref(false);
const showAdvancedOptions = ref(false);

// منطق التحقق وقوة كلمة المرور — composable خالص (useUserFormValidation)
const {
  validations,
  strengthPercent,
  strengthText,
  strengthColor,
  validateUsername,
  validateEmail,
  evaluatePasswordStrength,
  resetValidations,
} = useUserFormValidation();

// إدارة المستخدمين (CRUD + بحث + مصفوفة الصلاحيات) — composable
const usersMgr = useUsersManagement({
  getCurrentUserId: () => authStore.user?.id,
  addToast: (msg, type, duration, onUndo) => appStore.addToast(msg, type, duration, onUndo),
});

// إدارة المناصب والأدوار — composable مرتبط بإعادة تحميل المستخدمين
const rolesMgr = useRolesManagement({
  addToast: (msg, type, duration, onUndo) => appStore.addToast(msg, type, duration, onUndo),
  reload: usersMgr.refreshUsers,
});

// كشف حالة ودوال composables للقالب (بنمط التفكيك المستخدم في باقي الشاشات)
const {
  users,
  roles,
  warehouses,
  loading,
  saving,
  selectedUser,
  isCreateMode,
  searchQuery,
  message,
  error,
  form,
  currentUserId,
  filteredUsers,
  refreshUsers,
  startCreate,
  selectUser,
  resetForm,
  saveUser,
  deleteUser,
} = usersMgr;

const {
  showRoleForm,
  editingRole,
  savingRole,
  roleForm,
  startCreateRole,
  startEditRole,
  cancelRoleForm,
  saveRole,
  confirmDeleteRole,
} = rolesMgr;

// أغلفة تعيد ضبط التحقق عند فتح/إغلاق/تبديل النموذج (المنطق الأصلي كان يستدعي resetValidations)
const onStartCreate = () => {
  resetValidations();
  startCreate();
};
const onSelectUser = (u: any) => {
  resetValidations();
  selectUser(u);
};
const onResetForm = () => {
  resetValidations();
  resetForm();
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
