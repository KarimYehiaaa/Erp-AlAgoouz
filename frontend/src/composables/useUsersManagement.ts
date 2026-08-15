import { computed, ref } from 'vue';
import { users as api } from '@/api';
import {
  buildUserPayload,
  emptyUserForm,
  filterUsersByQuery,
  generateRestorePassword,
  pickDefaultRoleId,
  userToForm,
} from '@/utils/userForm';

/**
 * تبعيات useUsersManagement المحقونة — لسهولة الاختبار وفصل المنطق عن UI.
 */
export interface UsersManagementDeps {
  /** دالة استخراج id المستخدم الحالي (يمنع حذف النفس) */
  getCurrentUserId: () => number | undefined;
  /** إظهار رسالة toast — نفس توقيع appStore.addToast */
  addToast: (
    _message: any,
    _type?: string,
    _duration?: number,
    _onUndo?: (() => void) | null,
  ) => void;
}

/**
 * composable لإدارة المستخدمين — CRUD كامل + بحث + مصفوفة الصلاحيات.
 * حالة النموذج ورسائل الحفظ ومصفوفة الأدوار كلها هنا، والـ view يبقى منسّقًا
 * يمرر الدوال للمكوّنات (UsersTable/UserForm).
 */
export function useUsersManagement(deps: UsersManagementDeps) {
  const { getCurrentUserId, addToast } = deps;

  const users = ref<any[]>([]);
  const roles = ref<any[]>([]);
  const permissions = ref<any[]>([]);
  const loading = ref(false);
  const saving = ref(false);

  const selectedUser = ref<any>(null);
  const isCreateMode = ref(false);
  const searchQuery = ref('');
  const message = ref('');
  const error = ref(false);

  const form = ref<any>(emptyUserForm());

  // permissions matrix state
  const selectedPermissionRole = ref<any>(null);
  const selectedPermissionIds = ref<any[]>([]);

  const currentUserId = computed(() => getCurrentUserId());

  const filteredUsers = computed(() => filterUsersByQuery(users.value, searchQuery.value));

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
      addToast('فشل تحميل صلاحيات هذا الدور', 'error');
    }
  };

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
    form.value = emptyUserForm(pickDefaultRoleId(roles.value));
    message.value = '';
    error.value = false;
  };

  const selectUser = (user: any) => {
    isCreateMode.value = false;
    selectedUser.value = user;
    form.value = userToForm(user, pickDefaultRoleId(roles.value));
    message.value = '';
    error.value = false;
  };

  const resetForm = () => {
    selectedUser.value = null;
    isCreateMode.value = false;
    form.value = emptyUserForm(pickDefaultRoleId(roles.value));
    message.value = '';
    error.value = false;
  };

  const saveUser = async () => {
    saving.value = true;
    message.value = '';
    error.value = false;
    try {
      const payload = buildUserPayload(form.value);

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
      addToast('لا يمكنك حذف الحساب الحالي الذي تسجل به الدخول.', 'error');
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

      addToast(`تم حذف المستخدم "${userBackup.username}" بنجاح`, 'success', 10000, async () => {
        try {
          const payload = {
            ...buildUserPayload(userToForm(userBackup)),
            password: generateRestorePassword(),
          };
          await api.create(payload);
          addToast(
            `تم استعادة المستخدم "${userBackup.username}" بنجاح! كلمة المرور: ${payload.password}`,
            'success',
            8000,
          );
          await refreshUsers();
        } catch (err: any) {
          addToast('فشل استعادة المستخدم: ' + err.message, 'error');
        }
      });
    } catch (e: any) {
      addToast(e.message || 'فشل حذف المستخدم', 'error');
    } finally {
      saving.value = false;
    }
  };

  return {
    users,
    roles,
    permissions,
    loading,
    saving,
    selectedUser,
    isCreateMode,
    searchQuery,
    message,
    error,
    form,
    selectedPermissionRole,
    selectedPermissionIds,
    currentUserId,
    filteredUsers,
    refreshUsers,
    startCreate,
    selectUser,
    resetForm,
    saveUser,
    deleteUser,
    handleRolePermissionChange,
  };
}
