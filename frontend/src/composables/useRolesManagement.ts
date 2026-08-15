import { ref } from 'vue';
import { users as api } from '@/api';

/**
 * تبعيات useRolesManagement المحقونة.
 */
export interface RolesManagementDeps {
  /** إظهار رسالة toast — نفس توقيع appStore.addToast */
  addToast: (
    _message: any,
    _type?: string,
    _duration?: number,
    _onUndo?: (() => void) | null,
  ) => void;
  /** إعادة تحميل البيانات بعد الحفظ/الحذف (عادةً refreshUsers من useUsersManagement) */
  reload: () => Promise<void>;
}

/**
 * composable لإدارة المناصب والأدوار — نموذج إنشاء/تعديل + حفظ + حذف.
 * الحالة كلها هنا (showRoleForm/editingRole/savingRole/roleForm) والـ view يمررها
 * إلى RolesManager.
 */
export function useRolesManagement(deps: RolesManagementDeps) {
  const { addToast, reload } = deps;

  const showRoleForm = ref(false);
  const editingRole = ref<any>(null);
  const savingRole = ref(false);
  const roleForm = ref({ name: '', name_ar: '', description: '' });

  const startCreateRole = () => {
    editingRole.value = null;
    roleForm.value = { name: '', name_ar: '', description: '' };
    showRoleForm.value = true;
  };

  const startEditRole = (role: any) => {
    editingRole.value = role;
    roleForm.value = {
      name: role.name,
      name_ar: role.name_ar,
      description: role.description || '',
    };
    showRoleForm.value = true;
  };

  const cancelRoleForm = () => {
    showRoleForm.value = false;
    editingRole.value = null;
    roleForm.value = { name: '', name_ar: '', description: '' };
  };

  const saveRole = async () => {
    if (!roleForm.value.name_ar?.trim()) {
      addToast('يرجى إدخال الاسم العربي للمنصب', 'error');
      return;
    }
    if (!editingRole.value && !roleForm.value.name?.trim()) {
      addToast('يرجى إدخال الاسم الإنجليزي للمنصب', 'error');
      return;
    }
    savingRole.value = true;
    try {
      if (editingRole.value) {
        await api.updateRole(editingRole.value.id, {
          name_ar: roleForm.value.name_ar,
          description: roleForm.value.description,
        });
        addToast('تم تعديل المنصب بنجاح ✅', 'success');
      } else {
        await api.createRole({
          name: roleForm.value.name,
          name_ar: roleForm.value.name_ar,
          description: roleForm.value.description,
        });
        addToast('تم إنشاء المنصب بنجاح ✅', 'success');
      }
      cancelRoleForm();
      await reload();
    } catch (e: any) {
      addToast(e?.response?.data?.message || e?.message || 'فشل حفظ المنصب', 'error');
    } finally {
      savingRole.value = false;
    }
  };

  const confirmDeleteRole = async (role: any) => {
    if (!confirm(`هل أنت متأكد من حذف منصب "${role.name_ar}"؟\nلا يمكن التراجع عن هذا الإجراء.`))
      return;
    try {
      await api.deleteRole(role.id);
      addToast('تم حذف المنصب بنجاح', 'success');
      await reload();
    } catch (e: any) {
      addToast(e?.response?.data?.message || e?.message || 'فشل حذف المنصب', 'error');
    }
  };

  return {
    showRoleForm,
    editingRole,
    savingRole,
    roleForm,
    startCreateRole,
    startEditRole,
    cancelRoleForm,
    saveRole,
    confirmDeleteRole,
  };
}
