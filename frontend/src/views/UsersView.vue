<template>
  <div class="users-page">
    <section class="page-header card">
      <div>
        <h2>إدارة المستخدمين</h2>
        <p>عدّل بيانات المستخدمين، الصلاحيات، وحالة الحسابات من هنا.</p>
      </div>
      <div class="header-actions">
        <button type="button" class="btn btn-add" @click="startCreate">
          <AppIcon name="add" :size="16" /> إضافة مستخدم جديد
        </button>
        <button type="button" class="btn btn-outline" @click="refreshUsers" :disabled="loading">
          تحديث
        </button>
      </div>
    </section>

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
              <tr v-for="u in filteredUsers" :key="u.id" :class="{ active: selectedUser?.id === u.id }">
                <td>
                  <div class="user-info-cell">
                    <div class="user-avatar" :style="{ backgroundColor: getAvatarColor(u.full_name) }">
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
                  <span :class="['badge', u.is_active ? 'badge-success' : 'badge-danger']">
                    {{ u.is_active ? 'نشط' : 'معطل' }}
                  </span>
                </td>
                <td class="actions-cell">
                  <button type="button" class="btn btn-sm btn-edit" @click="selectUser(u)">
                    <AppIcon name="edit" :size="14" /> تعديل
                  </button>
                  <button
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
          💡 اضغط على زر "تعديل" بجانب أي مستخدم لفتح وتعديل بياناته، أو انقر على "+ إضافة مستخدم جديد" لإنشاء مستخدم.
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
                :style="validations.username.valid === false ? 'border-color: var(--danger);' : validations.username.valid === true ? 'border-color: #16a34a;' : ''"
              />
              <span v-if="validations.username.msg" :style="{ color: validations.username.valid ? '#16a34a' : 'var(--danger)', fontSize: '0.74rem', fontWeight: '800', marginTop: '4px', display: 'block' }">
                {{ validations.username.msg }}
              </span>
            </div>
            <div class="form-group">
              <label>الاسم الكامل *</label>
              <input v-model="form.full_name" type="text" required placeholder="مثال: كريم يحيى" />
            </div>
          </div>

          <!-- Progressive Disclosure Toggle -->
          <button 
            type="button" 
            @click="showAdvancedOptions = !showAdvancedOptions" 
            style="border: none; background: transparent; color: var(--accent); cursor: pointer; font-size: 0.84rem; font-weight: 800; display: flex; align-items: center; gap: 4px; margin: 12px 0; padding: 0;"
          >
            <span>{{ showAdvancedOptions ? '⚙️ إخفاء الخيارات الإضافية' : '⚙️ إظهار الخيارات الإضافية' }}</span>
          </button>

          <!-- Advanced/Secondary Fields (Progressive Disclosure) -->
          <div v-show="showAdvancedOptions" style="display: grid; gap: 14px; margin-bottom: 14px; border: 1px dashed var(--border); padding: 12px; border-radius: var(--radius-md);">
            <div class="grid grid-2">
              <div class="form-group">
                <label>البريد الإلكتروني</label>
                <input 
                  v-model="form.email" 
                  type="email" 
                  placeholder="example@domain.com" 
                  @blur="validateEmail"
                  :style="validations.email.valid === false ? 'border-color: var(--danger);' : validations.email.valid === true ? 'border-color: #16a34a;' : ''"
                />
                <span v-if="validations.email.msg" :style="{ color: validations.email.valid ? '#16a34a' : 'var(--danger)', fontSize: '0.74rem', fontWeight: '800', marginTop: '4px', display: 'block' }">
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
            <div class="password-input-wrapper" style="position: relative;">
              <input
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                :required="isCreateMode"
                :placeholder="isCreateMode ? 'ادخل كلمة المرور' : 'اتركها فارغة إذا لا تريد التغيير'"
                style="padding-left: 42px;"
                @input="evaluatePasswordStrength"
              />
              <button 
                type="button" 
                class="password-toggle-btn" 
                @click="showPassword = !showPassword"
                tabindex="-1"
                style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); border: none; background: transparent; color: var(--text-muted); cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; z-index: 5;"
              >
                <AppIcon :name="showPassword ? 'eyeOff' : 'eye'" :size="16" />
              </button>
            </div>
            <!-- Password Strength Bar Indicator -->
            <div v-if="form.password" class="password-strength-bar-container" style="margin-top: 8px;">
              <div style="background: var(--border); height: 4px; border-radius: 2px; overflow: hidden; width: 100%;">
                <div class="password-strength-bar" :style="{ width: strengthPercent + '%', backgroundColor: strengthColor }" style="height: 100%; transition: all 0.3s ease;"></div>
              </div>
              <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-muted); margin-top: 4px; display: block;">قوة كلمة المرور: <span :style="{ color: strengthColor }">{{ strengthText }}</span></span>
            </div>
          </div>

          <div v-if="message" class="message" :class="{ error: error }">{{ message }}</div>

          <div class="form-actions">
            <button type="button" class="btn btn-outline" @click="resetForm" :disabled="saving">
              إلغاء
            </button>
            <button type="submit" class="btn btn-save" :class="{ 'btn-loading': saving }" :disabled="saving">
              <AppIcon v-if="!saving" name="save" :size="16" />
              {{ saving ? 'جاري الحفظ...' : isCreateMode ? 'إنشاء حساب جديد' : 'حفظ التعديلات' }}
            </button>
          </div>
        </form>
      </article>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { users as api } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';

const authStore = useAuthStore();
const appStore = useAppStore();
const currentUserId = computed(() => authStore.user?.id);

const users = ref([]);
const roles = ref([]);
const loading = ref(false);
const saving = ref(false);
const showPassword = ref(false);
const showAdvancedOptions = ref(false);
const strengthPercent = ref(0);
const strengthText = ref('ضعيفة جداً ⚠️');
const strengthColor = ref('#dc2626');

const validations = ref({
  username: { valid: null, msg: '' },
  email: { valid: null, msg: '' }
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

const selectedUser = ref(null);
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
    (u) =>
      u.username?.toLowerCase().includes(query) ||
      u.full_name?.toLowerCase().includes(query) ||
      u.email?.toLowerCase().includes(query)
  );
});

const roleLabel = (roleId) => roles.value.find((r) => r.id === roleId)?.name_ar || '—';

const getInitials = (name) => {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const getAvatarColor = (name) => {
  if (!name) return '#5c3517';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 60%, 42%)`;
};

const refreshUsers = async () => {
  loading.value = true;
  try {
    const [usersRes, rolesRes] = await Promise.all([api.list(), api.roles()]);
    users.value = usersRes.data || [];
    roles.value = rolesRes.data || [];
  } catch (e) {
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

const selectUser = (user) => {
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
    email: { valid: null, msg: '' }
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
    email: { valid: null, msg: '' }
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
    const payload = {
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
      const updated = users.value.find((u) => u.id === form.value.id);
      if (updated) selectUser(updated);
    } else {
      resetForm();
    }
  } catch (e) {
    error.value = true;
    message.value = e.message || 'فشل حفظ التغييرات';
  } finally {
    saving.value = false;
  }
};

const deleteUser = async (user) => {
  if (user.id === currentUserId.value) {
    appStore.addToast('لا يمكنك حذف الحساب الحالي الذي تسجل به الدخول.', 'error');
    return;
  }
  const ok = confirm(`هل أنت متأكد من حذف المستخدم "${user.full_name || user.username}" نهائياً من النظام؟`);
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
          const payload = {
            username: userBackup.username,
            full_name: userBackup.full_name,
            email: userBackup.email,
            phone: userBackup.phone,
            role_id: userBackup.role_id,
            is_active: userBackup.is_active,
            password: 'RestoredUser@123'
          };
          await api.create(payload);
          appStore.addToast(`تم استعادة المستخدم "${userBackup.username}" بنجاح! كلمة المرور: RestoredUser@123`, 'success', 8000);
          await refreshUsers();
        } catch (err) {
          appStore.addToast('فشل استعادة المستخدم: ' + err.message, 'error');
        }
      }
    );
  } catch (e) {
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
  h2 { margin: 0; color: var(--primary-strong); }
  p { margin: 6px 0 0; color: var(--text-muted); font-size: 0.94rem; }
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
  h3 { margin: 0; font-size: 1.15rem; color: var(--primary); }
  span { color: var(--text-muted); font-size: 0.85rem; font-weight: 700; }
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
    th, td {
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
      td { border-bottom-color: var(--primary-soft); }
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
    box-shadow: 0 4px 10px rgba(0,0,0,0.12);
  }
  .user-names {
    display: flex;
    flex-direction: column;
    strong { color: var(--text-strong); font-size: 0.92rem; }
    small { color: var(--text-muted); font-size: 0.78rem; font-weight: 700; margin-top: 2px; }
  }
}
.contact-info-cell {
  display: flex;
  flex-direction: column;
  font-size: 0.86rem;
  color: var(--text);
  small { color: var(--text-muted); font-size: 0.76rem; font-weight: 700; margin-top: 2px; }
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
  padding: 34px !important;
  font-size: 0.92rem;
  font-weight: 700;
}
@media (max-width: 980px) {
  .users-layout {
    grid-template-columns: 1fr;
  }
}
</style>
