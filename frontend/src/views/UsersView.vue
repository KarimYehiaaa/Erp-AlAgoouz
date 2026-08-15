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
        <article class="card table-card">
          <div class="card-head search-head">
            <div class="title-info">
              <h3>قائمة المستخدمين</h3>
              <span>{{ filteredUsers.length }} مستخدم</span>
            </div>
            <div class="search-box">
              <input
                v-model="searchQuery"
                type="text"
                placeholder="البحث باسم المستخدم أو الاسم..."
                class="search-input"
              />
            </div>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المستخدم</th>
                  <th>البريد والهاتف</th>
                  <th>الدور</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="u in filteredUsers"
                  :key="u.id"
                  :class="{ active: selectedUser?.id === u.id }"
                >
                  <td>
                    <div class="user-info-cell">
                      <div
                        class="user-avatar"
                        :style="{ backgroundColor: getAvatarColor(u.full_name) }"
                      >
                        {{ getInitials(u.full_name) }}
                      </div>
                      <div class="user-names">
                        <strong>{{ u.full_name }}</strong>
                        <small>@{{ u.username }}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="contact-info-cell">
                      <div>{{ u.email || '—' }}</div>
                      <small v-if="u.phone">{{ u.phone }}</small>
                    </div>
                  </td>
                  <td>
                    <span class="role-badge">{{ roleLabel(u.role_id) }}</span>
                  </td>
                  <td>
                    <span style="display: inline-flex; align-items: center; gap: 8px">
                      <span
                        :class="['status-dot-pulse', u.is_active ? 'success' : 'danger']"
                      ></span>
                      <span style="font-size: 0.82rem; font-weight: 800; color: var(--text-strong)">
                        {{ u.is_active ? 'نشط' : 'معطل' }}
                      </span>
                    </span>
                  </td>
                  <td class="actions-cell">
                    <button
                      v-permission="'users.edit'"
                      type="button"
                      class="btn btn-sm btn-edit"
                      @click="selectUser(u)"
                    >
                      <AppIcon name="edit" :size="14" /> تعديل
                    </button>
                    <button
                      v-permission="'users.delete'"
                      type="button"
                      class="btn btn-sm btn-delete"
                      @click="deleteUser(u)"
                      :disabled="u.id === currentUserId"
                      :title="u.id === currentUserId ? 'لا يمكنك حذف نفسك' : 'حذف المستخدم'"
                    >
                      <AppIcon name="delete" :size="14" /> حذف
                    </button>
                  </td>
                </tr>
                <tr v-if="!filteredUsers.length">
                  <td colspan="5" class="empty">
                    {{ searchQuery ? 'لا توجد نتائج بحث مطابقة' : 'لا يوجد مستخدمين' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <!-- نموذج الإضافة والتعديل -->
        <article class="card form-card">
          <div class="card-head">
            <h3>
              {{
                isCreateMode
                  ? 'إنشاء مستخدم جديد'
                  : form.id
                    ? `تعديل: ${form.full_name || form.username}`
                    : 'إدارة المستخدمين'
              }}
            </h3>
            <span v-if="form.id && !isCreateMode">ID: {{ form.id }}</span>
          </div>

          <p v-if="!form.id && !isCreateMode" class="hint-state">
            💡 اضغط على زر "تعديل" بجانب أي مستخدم لفتح وتعديل بياناته، أو انقر على "+ إضافة مستخدم
            جديد" لإنشاء مستخدم.
          </p>

          <form v-else class="user-form" @submit.prevent="saveUser">
            <div class="grid grid-2">
              <div class="form-group">
                <label>اسم الدخول *</label>
                <input
                  v-model="form.username"
                  type="text"
                  required
                  placeholder="مثال: karim"
                  @blur="validateUsername"
                  :style="
                    validations.username.valid === false
                      ? 'border-color: var(--danger);'
                      : validations.username.valid === true
                        ? 'border-color: #16a34a;'
                        : ''
                  "
                />
                <span
                  v-if="validations.username.msg"
                  :style="{
                    color: validations.username.valid ? '#16a34a' : 'var(--danger)',
                    fontSize: '0.74rem',
                    fontWeight: '800',
                    marginTop: '4px',
                    display: 'block',
                  }"
                >
                  {{ validations.username.msg }}
                </span>
              </div>
              <div class="form-group">
                <label>الاسم الكامل *</label>
                <input
                  v-model="form.full_name"
                  type="text"
                  required
                  placeholder="مثال: كريم يحيى"
                />
              </div>
            </div>

            <!-- Progressive Disclosure Toggle -->
            <button
              type="button"
              @click="showAdvancedOptions = !showAdvancedOptions"
              style="
                border: none;
                background: transparent;
                color: var(--accent);
                cursor: pointer;
                font-size: 0.84rem;
                font-weight: 800;
                display: flex;
                align-items: center;
                gap: 4px;
                margin: 12px 0;
                padding: 0;
              "
            >
              <span>{{
                showAdvancedOptions ? '⚙️ إخفاء الخيارات الإضافية' : '⚙️ إظهار الخيارات الإضافية'
              }}</span>
            </button>

            <!-- Advanced/Secondary Fields (Progressive Disclosure) -->
            <div
              v-show="showAdvancedOptions"
              style="
                display: grid;
                gap: 14px;
                margin-bottom: 14px;
                border: 1px dashed var(--border);
                padding: 12px;
                border-radius: var(--radius-md);
              "
            >
              <div class="grid grid-2">
                <div class="form-group">
                  <label>البريد الإلكتروني</label>
                  <input
                    v-model="form.email"
                    type="email"
                    placeholder="example@domain.com"
                    @blur="validateEmail"
                    :style="
                      validations.email.valid === false
                        ? 'border-color: var(--danger);'
                        : validations.email.valid === true
                          ? 'border-color: #16a34a;'
                          : ''
                    "
                  />
                  <span
                    v-if="validations.email.msg"
                    :style="{
                      color: validations.email.valid ? '#16a34a' : 'var(--danger)',
                      fontSize: '0.74rem',
                      fontWeight: '800',
                      marginTop: '4px',
                      display: 'block',
                    }"
                  >
                    {{ validations.email.msg }}
                  </span>
                </div>
                <div class="form-group">
                  <label>الهاتف</label>
                  <input v-model="form.phone" type="text" placeholder="01XXXXXXXXX" />
                </div>
              </div>

              <div class="grid grid-2">
                <div class="form-group">
                  <label>الدور *</label>
                  <select v-model.number="form.role_id" required>
                    <option v-for="role in roles" :key="role.id" :value="role.id">
                      {{ role.name_ar }}
                    </option>
                  </select>
                </div>
                <div class="form-group checkbox-group">
                  <label class="checkbox-label">
                    <input v-model="form.is_active" type="checkbox" />
                    الحساب نشط (تمكين تسجيل الدخول)
                  </label>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label>{{ isCreateMode ? 'كلمة المرور *' : 'كلمة المرور الجديدة' }}</label>
              <div class="password-input-wrapper" style="position: relative">
                <input
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  :required="isCreateMode"
                  :placeholder="
                    isCreateMode ? 'ادخل كلمة المرور' : 'اتركها فارغة إذا لا تريد التغيير'
                  "
                  style="padding-left: 42px"
                  @input="evaluatePasswordStrength"
                />
                <button
                  type="button"
                  class="password-toggle-btn"
                  @click="showPassword = !showPassword"
                  tabindex="-1"
                  style="
                    position: absolute;
                    left: 10px;
                    top: 50%;
                    transform: translateY(-50%);
                    border: none;
                    background: transparent;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 5;
                  "
                >
                  <AppIcon :name="showPassword ? 'eyeOff' : 'eye'" :size="16" />
                </button>
              </div>
              <!-- Password Strength Bar Indicator -->
              <div
                v-if="form.password"
                class="password-strength-bar-container"
                style="margin-top: 8px"
              >
                <div
                  style="
                    background: var(--border);
                    height: 4px;
                    border-radius: 2px;
                    overflow: hidden;
                    width: 100%;
                  "
                >
                  <div
                    class="password-strength-bar"
                    :style="{ width: strengthPercent + '%', backgroundColor: strengthColor }"
                    style="height: 100%; transition: all 0.3s ease"
                  ></div>
                </div>
                <span
                  style="
                    font-size: 0.72rem;
                    font-weight: 700;
                    color: var(--text-muted);
                    margin-top: 4px;
                    display: block;
                  "
                  >قوة كلمة المرور:
                  <span :style="{ color: strengthColor }">{{ strengthText }}</span></span
                >
              </div>
            </div>

            <div v-if="message" class="message" :class="{ error: error }">{{ message }}</div>

            <div class="form-actions">
              <button type="button" class="btn btn-outline" @click="resetForm" :disabled="saving">
                إلغاء
              </button>
              <button
                type="submit"
                class="btn btn-save"
                :class="{ 'btn-loading': saving }"
                :disabled="saving"
              >
                <AppIcon v-if="!saving" name="save" :size="16" />
                {{ saving ? 'جاري الحفظ...' : isCreateMode ? 'إنشاء حساب جديد' : 'حفظ التعديلات' }}
              </button>
            </div>
          </form>
        </article>
      </section>

      <!-- Roles Management Section -->
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
              🏷️ إدارة المناصب والأدوار
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--text-muted)">
              أنشئ وعدّل وحذف المناصب في النظام
            </p>
          </div>
          <button
            v-if="!showRoleForm"
            type="button"
            class="btn btn-add"
            @click="startCreateRole"
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
            style="
              margin: 0 0 16px 0;
              font-size: 0.95rem;
              font-weight: 800;
              color: var(--primary-dark);
            "
          >
            {{ editingRole ? '✏️ تعديل منصب: ' + editingRole.name_ar : '➕ إنشاء منصب جديد' }}
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
              <label class="form-label"
                >الاسم العربي <span style="color: var(--danger)">*</span></label
              >
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
              @click="cancelRoleForm"
              :disabled="savingRole"
            >
              إلغاء
            </button>
            <button
              type="button"
              class="btn btn-save"
              @click="saveRole"
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
          <table
            class="data-table"
            style="width: 100%; border-collapse: collapse; font-size: 0.85rem"
          >
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
                  style="
                    padding: 10px 14px;
                    text-align: right;
                    border-bottom: 2px solid var(--border);
                  "
                >
                  #
                </th>
                <th
                  style="
                    padding: 10px 14px;
                    text-align: right;
                    border-bottom: 2px solid var(--border);
                  "
                >
                  المنصب
                </th>
                <th
                  style="
                    padding: 10px 14px;
                    text-align: right;
                    border-bottom: 2px solid var(--border);
                  "
                >
                  الاسم الإنجليزي
                </th>
                <th
                  style="
                    padding: 10px 14px;
                    text-align: right;
                    border-bottom: 2px solid var(--border);
                  "
                >
                  الوصف
                </th>
                <th
                  style="
                    padding: 10px 14px;
                    text-align: right;
                    border-bottom: 2px solid var(--border);
                  "
                >
                  عدد المستخدمين
                </th>
                <th
                  style="
                    padding: 10px 14px;
                    text-align: center;
                    border-bottom: 2px solid var(--border);
                  "
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
                  <span style="font-weight: 850; color: var(--text-strong)">{{
                    role.name_ar
                  }}</span>
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
                      @click="startEditRole(role)"
                      :disabled="role.name === 'admin'"
                      style="padding: 4px 10px; font-size: 0.78rem; border-radius: var(--radius-sm)"
                      :style="role.name === 'admin' ? 'opacity: 0.4; cursor: not-allowed;' : ''"
                      title="تعديل المنصب"
                    >
                      ✏️ تعديل
                    </button>
                    <button
                      type="button"
                      class="btn btn-danger"
                      @click="confirmDeleteRole(role)"
                      :disabled="
                        role.name === 'admin' ||
                        users.filter((u) => u.role_id === role.id).length > 0
                      "
                      style="padding: 4px 10px; font-size: 0.78rem; border-radius: var(--radius-sm)"
                      :style="
                        role.name === 'admin' ||
                        users.filter((u) => u.role_id === role.id).length > 0
                          ? 'opacity: 0.4; cursor: not-allowed;'
                          : ''
                      "
                      :title="
                        users.filter((u) => u.role_id === role.id).length > 0
                          ? 'لا يمكن حذف منصب مرتبط بمستخدمين'
                          : 'حذف المنصب'
                      "
                    >
                      🗑️ حذف
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
  id: null,
  username: '',
  full_name: '',
  email: '',
  phone: '',
  role_id: null,
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

const roleLabel = (roleId: any) => roles.value.find((r: any) => r.id === roleId)?.name_ar || '—';

const getInitials = (name: any) => {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const getAvatarColor = (name: any) => {
  if (!name) return '#5c3517';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 60%, 42%)`;
};

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
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
  h3 {
    margin: 0;
    font-size: 1.15rem;
    color: var(--primary);
  }
  span {
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 700;
  }
}
.search-head {
  flex-wrap: wrap;
  gap: 12px;
}
.title-info {
  display: flex;
  align-items: center;
  gap: 10px;
}
.search-box {
  flex: 1;
  max-width: 320px;
  min-width: 200px;
  .search-input {
    width: 100%;
    padding: 8px 12px;
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    font-size: 0.88rem;
    transition: var(--transition);
    &:focus {
      outline: none;
      border-color: var(--primary);
    }
  }
}
.table-wrap {
  overflow: auto;
  table {
    width: 100%;
    border-collapse: collapse;
    th,
    td {
      padding: 14px 12px;
      border-bottom: 1px solid var(--border);
      text-align: right;
    }
    th {
      color: var(--text-muted);
      font-size: 0.82rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    tr.active {
      background: color-mix(in srgb, var(--primary) 7%, transparent);
      td {
        border-bottom-color: var(--primary-soft);
      }
    }
  }
}
.user-info-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  .user-avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 0.9rem;
    font-weight: 900;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
  }
  .user-names {
    display: flex;
    flex-direction: column;
    strong {
      color: var(--text-strong);
      font-size: 0.92rem;
    }
    small {
      color: var(--text-muted);
      font-size: 0.78rem;
      font-weight: 700;
      margin-top: 2px;
    }
  }
}
.contact-info-cell {
  display: flex;
  flex-direction: column;
  font-size: 0.86rem;
  color: var(--text);
  small {
    color: var(--text-muted);
    font-size: 0.76rem;
    font-weight: 700;
    margin-top: 2px;
  }
}
.role-badge {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--primary);
  font-size: 0.8rem;
  font-weight: 800;
}
.actions-cell {
  white-space: nowrap;
  .btn {
    margin-left: 6px;
    font-weight: 800;
    &.btn-outline-danger {
      color: var(--danger);
      border-color: color-mix(in srgb, var(--danger) 30%, transparent);
      &:hover:not(:disabled) {
        background: color-mix(in srgb, var(--danger) 8%, transparent);
      }
      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }
  }
}
.hint-state {
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.8;
  padding: 24px;
  border: 2px dashed var(--border);
  border-radius: var(--radius-sm);
  text-align: center;
  background: var(--bg);
}
.user-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.checkbox-group {
  display: flex;
  align-items: flex-end;
  min-height: 42px;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  font-size: 0.88rem;
  cursor: pointer;
  color: var(--text-strong);
}
.message {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--success) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--success) 24%, transparent);
  color: var(--success);
  font-size: 0.88rem;
  font-weight: 800;
  &.error {
    background: color-mix(in srgb, var(--danger) 8%, transparent);
    border-color: color-mix(in srgb, var(--danger) 24%, transparent);
    color: var(--danger);
  }
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
  .btn {
    min-width: 100px;
  }
}
.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 30px;
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

.module-group {
  border: 1px solid var(--card-border) !important;
  border-radius: var(--radius-lg);
  padding: 16px;
  background: var(--card-bg) !important;
  backdrop-filter: blur(12px) saturate(1.08);
  box-shadow: var(--shadow-xs);
  transition:
    transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.28s ease;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--accent) 7%, transparent) 0%,
      transparent 45%
    );
    opacity: 0;
    transition: opacity 0.35s ease;
    pointer-events: none;
    z-index: 1;
  }

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: -150%;
    width: 50%;
    height: 100%;
    background: linear-gradient(
      to right,
      rgba(255, 255, 255, 0) 0%,
      color-mix(in srgb, var(--accent) 18%, rgba(255, 255, 255, 0.28)) 50%,
      rgba(255, 255, 255, 0) 100%
    );
    transform: skewX(-25deg);
    pointer-events: none;
    z-index: 2;
    transition: none;
  }

  &:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-md);
    border-color: color-mix(in srgb, var(--accent) 30%, var(--card-border));

    &::before {
      opacity: 1;
    }
    &::after {
      left: 150%;
      transition: left 0.85s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
  }
}
@media (max-width: 980px) {
  .users-layout {
    grid-template-columns: 1fr;
  }
}
</style>
