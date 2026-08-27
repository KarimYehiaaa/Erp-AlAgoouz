<template>
  <section class="card" style="margin-top: 24px">
    <div
      class="card-head"
      style="
        border-bottom: 1px solid var(--border);
        padding-bottom: 12px;
        margin-bottom: 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      "
    >
      <div class="title-info">
        <h3 style="margin: 0; font-size: 1.1rem; font-weight: 850; color: var(--text-strong)">
          إدارة المناصب والأدوار
        </h3>
        <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--text-muted)">
          أنشئ وعدّل وحذف المناصب في النظام
        </p>
      </div>
      <button
        v-if="!showRoleForm"
        type="button"
        class="btn btn-add"
        @click="$emit('create')"
        style="
          min-width: 140px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.85rem;
        "
      >
        <AppIcon name="add" :size="15" /> إضافة منصب جديد
      </button>
    </div>

    <!-- Role Form (create / edit) -->
    <div
      v-if="showRoleForm"
      class="role-form-card"
      style="
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 20px;
        margin-bottom: 18px;
      "
    >
      <h4
        style="margin: 0 0 16px 0; font-size: 0.95rem; font-weight: 800; color: var(--primary-dark)"
      >
        {{ editingRole ? ' تعديل منصب: ' + editingRole.name_ar : ' إنشاء منصب جديد' }}
      </h4>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px">
        <div class="form-group" v-if="!editingRole">
          <label class="form-label"
            >الاسم الإنجليزي <span style="color: var(--danger)">*</span></label
          >
          <input
            v-model="roleForm.name"
            type="text"
            class="form-input"
            placeholder="مثال: supervisor"
            style="direction: ltr; font-family: monospace"
          />
          <small style="color: var(--text-muted); font-size: 0.72rem"
            >حروف إنجليزية وأرقام وشرطة سفلية فقط</small
          >
        </div>
        <div class="form-group">
          <label class="form-label">الاسم العربي <span style="color: var(--danger)">*</span></label>
          <input
            v-model="roleForm.name_ar"
            type="text"
            class="form-input"
            placeholder="مثال: مشرف"
          />
        </div>
        <div class="form-group" :style="editingRole ? 'grid-column: span 2' : ''">
          <label class="form-label">الوصف (اختياري)</label>
          <input
            v-model="roleForm.description"
            type="text"
            class="form-input"
            placeholder="وصف مختصر لصلاحيات هذا المنصب"
          />
        </div>
      </div>

      <div
        class="form-actions"
        style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 10px"
      >
        <button
          type="button"
          class="btn btn-outline"
          @click="$emit('cancel')"
          :disabled="savingRole"
        >
          إلغاء
        </button>
        <button
          type="button"
          class="btn btn-save"
          @click="$emit('save')"
          :disabled="savingRole"
          style="
            min-width: 130px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
          "
        >
          <AppIcon v-if="!savingRole" name="save" :size="15" />
          {{ savingRole ? 'جاري الحفظ...' : editingRole ? 'حفظ التعديلات' : 'إنشاء المنصب' }}
        </button>
      </div>
    </div>

    <!-- Roles Table -->
    <div style="overflow-x: auto">
      <table class="data-table" style="width: 100%; border-collapse: collapse; font-size: 0.85rem">
        <thead>
          <tr
            style="
              background: var(--bg-elevated);
              color: var(--text-muted);
              font-size: 0.78rem;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.04em;
            "
          >
            <th
              style="padding: 10px 14px; text-align: right; border-bottom: 2px solid var(--border)"
            >
              #
            </th>
            <th
              style="padding: 10px 14px; text-align: right; border-bottom: 2px solid var(--border)"
            >
              المنصب
            </th>
            <th
              style="padding: 10px 14px; text-align: right; border-bottom: 2px solid var(--border)"
            >
              الاسم الإنجليزي
            </th>
            <th
              style="padding: 10px 14px; text-align: right; border-bottom: 2px solid var(--border)"
            >
              الوصف
            </th>
            <th
              style="padding: 10px 14px; text-align: right; border-bottom: 2px solid var(--border)"
            >
              عدد المستخدمين
            </th>
            <th
              style="padding: 10px 14px; text-align: center; border-bottom: 2px solid var(--border)"
            >
              الإجراءات
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="role in roles"
            :key="role.id"
            style="border-bottom: 1px solid var(--border); transition: background 0.15s"
            @mouseover="
              ($event.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'
            "
            @mouseleave="($event.currentTarget as HTMLElement).style.background = 'transparent'"
          >
            <td style="padding: 12px 14px; color: var(--text-muted); font-size: 0.78rem">
              {{ role.id }}
            </td>
            <td style="padding: 12px 14px">
              <span style="font-weight: 850; color: var(--text-strong)">{{ role.name_ar }}</span>
              <span
                v-if="role.name === 'admin'"
                style="
                  display: inline-block;
                  background: var(--danger);
                  color: #fff;
                  font-size: 0.65rem;
                  padding: 1px 6px;
                  border-radius: 20px;
                  font-weight: 800;
                  margin-right: 6px;
                "
                >محمي</span
              >
            </td>
            <td
              style="
                padding: 12px 14px;
                direction: ltr;
                font-family: monospace;
                color: var(--text-muted);
                font-size: 0.8rem;
              "
            >
              {{ role.name }}
            </td>
            <td style="padding: 12px 14px; color: var(--text-muted); font-size: 0.82rem">
              {{ role.description || '—' }}
            </td>
            <td style="padding: 12px 14px; text-align: center">
              <span
                style="
                  background: var(--primary-soft);
                  color: var(--primary-dark);
                  padding: 2px 10px;
                  border-radius: 20px;
                  font-weight: 800;
                  font-size: 0.8rem;
                "
              >
                {{ users.filter((u) => u.role_id === role.id).length }}
              </span>
            </td>
            <td style="padding: 12px 14px; text-align: center">
              <div style="display: inline-flex; gap: 8px">
                <button
                  type="button"
                  class="btn btn-outline"
                  @click="$emit('editRole', role)"
                  :disabled="role.name === 'admin'"
                  style="padding: 4px 10px; font-size: 0.78rem; border-radius: var(--radius-sm)"
                  :style="role.name === 'admin' ? 'opacity: 0.4; cursor: not-allowed;' : ''"
                  title="تعديل المنصب"
                >
                  تعديل
                </button>
                <button
                  type="button"
                  class="btn btn-danger"
                  @click="$emit('deleteRole', role)"
                  :disabled="
                    role.name === 'admin' || users.filter((u) => u.role_id === role.id).length > 0
                  "
                  style="padding: 4px 10px; font-size: 0.78rem; border-radius: var(--radius-sm)"
                  :style="
                    role.name === 'admin' || users.filter((u) => u.role_id === role.id).length > 0
                      ? 'opacity: 0.4; cursor: not-allowed;'
                      : ''
                  "
                  :title="
                    users.filter((u) => u.role_id === role.id).length > 0
                      ? 'لا يمكن حذف منصب مرتبط بمستخدمين'
                      : 'حذف المنصب'
                  "
                >
                  حذف
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!roles.length">
            <td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted)">
              لا توجد مناصب
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';

/**
 * إدارة المناصب والأدوار — نموذج إنشاء/تعديل منصب + جدول المناصب مع الحذف.
 * الحالة كلها في الأب (roles/users/showRoleForm/editingRole/savingRole/roleForm)
 * وهذا المكوّن عرضي: يبعث events ويعرض ما يُمرَّر إليه.
 *
 * @props roles        قائمة المناصب
 * @props users        قائمة المستخدمين (لحساب عدد المستخدمين لكل منصب)
 * @props showRoleForm هل نموذج المنصب ظاهر
 * @props editingRole  المنصب الجاري تعديله (null = إنشاء جديد)
 * @props savingRole   حالة حفظ المنصب
 * @props roleForm     كائن حقول النموذج (v-model غير مباشر — يُعدَّل مباشرة)
 *
 * @emits create / cancel / save / editRole / deleteRole
 */
defineProps<{
  roles: any[];
  users: any[];
  showRoleForm: boolean;
  editingRole: any;
  savingRole: boolean;
  roleForm: { name: string; name_ar: string; description: string };
}>();

defineEmits<{
  create: [];
  cancel: [];
  save: [];
  editRole: [role: any];
  deleteRole: [role: any];
}>();
</script>
