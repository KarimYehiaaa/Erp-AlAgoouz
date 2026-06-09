<template>
  <div class="users-page">
    <section class="page-header card">
      <div>
        <h2>إدارة المستخدمين</h2>
        <p>عدّل بيانات المستخدمين والصلاحيات والحالة من هنا.</p>
      </div>
      <button type="button" class="btn btn-outline" @click="refreshUsers" :disabled="loading">
        تحديث
      </button>
    </section>

    <section class="users-layout">
      <article class="card table-card">
        <div class="card-head">
          <h3>قائمة المستخدمين</h3>
          <span>{{ users.length }} مستخدم</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>اسم الدخول</th>
                <th>الاسم</th>
                <th>البريد</th>
                <th>الدور</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.id" :class="{ active: selectedUser?.id === u.id }">
                <td>{{ u.username }}</td>
                <td>{{ u.full_name }}</td>
                <td>{{ u.email || '-' }}</td>
                <td>{{ roleLabel(u.role_id) }}</td>
                <td>
                  <span :class="['badge', u.is_active ? 'badge-success' : 'badge-danger']">
                    {{ u.is_active ? 'نشط' : 'معطل' }}
                  </span>
                </td>
                <td>
                  <button type="button" class="btn btn-sm btn-outline" @click="selectUser(u)">
                    تعديل
                  </button>
                </td>
              </tr>
              <tr v-if="!users.length">
                <td colspan="6" class="empty">لا توجد مستخدمين</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="card form-card">
        <div class="card-head">
          <h3>{{ form.id ? `تعديل: ${form.full_name || form.username || 'مستخدم'}` : 'اختر مستخدمًا للتعديل' }}</h3>
          <span v-if="form.id">ID: {{ form.id }}</span>
        </div>

        <p v-if="!form.id" class="hint">اضغط على زر "تعديل" بجانب أي مستخدم لفتح بياناته هنا.</p>

        <form v-else class="user-form" @submit.prevent="saveUser">
          <div class="grid grid-2">
            <div class="form-group">
              <label>اسم الدخول</label>
              <input v-model="form.username" type="text" required />
            </div>
            <div class="form-group">
              <label>الاسم الكامل</label>
              <input v-model="form.full_name" type="text" required />
            </div>
          </div>

          <div class="grid grid-2">
            <div class="form-group">
              <label>البريد</label>
              <input v-model="form.email" type="email" />
            </div>
            <div class="form-group">
              <label>الهاتف</label>
              <input v-model="form.phone" type="text" />
            </div>
          </div>

          <div class="grid grid-2">
            <div class="form-group">
              <label>الدور</label>
              <select v-model.number="form.role_id" required>
                <option v-for="role in roles" :key="role.id" :value="role.id">
                  {{ role.name_ar }}
                </option>
              </select>
            </div>
            <div class="form-group checkbox-group">
              <label class="checkbox-label">
                <input v-model="form.is_active" type="checkbox" />
                مستخدم نشط
              </label>
            </div>
          </div>

          <div class="form-group">
            <label>كلمة المرور الجديدة</label>
            <input v-model="form.password" type="password" placeholder="اتركها فارغة إذا لا تريد التغيير" />
          </div>

          <div v-if="message" class="message" :class="{ error: error }">{{ message }}</div>

          <div class="actions">
            <button type="button" class="btn btn-outline" @click="resetForm">إلغاء</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'جاري الحفظ...' : 'حفظ التعديلات' }}
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

const users = ref([]);
const roles = ref([]);
const loading = ref(false);
const saving = ref(false);
const selectedUser = ref(null);
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

const roleLabel = (roleId) => roles.value.find((r) => r.id === roleId)?.name_ar || '-';

const refreshUsers = async () => {
  loading.value = true;
  try {
    const [usersRes, rolesRes] = await Promise.all([api.list(), api.roles()]);
    users.value = usersRes.data || [];
    roles.value = rolesRes.data || [];
    if (!form.value.role_id && roles.value.length) {
      form.value.role_id = roles.value[0].id;
    }
  } finally {
    loading.value = false;
  }
};

const selectUser = (user) => {
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
  message.value = '';
  error.value = false;
};

const resetForm = () => {
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

const saveUser = async () => {
  if (!form.value.id) return;
  saving.value = true;
  message.value = '';
  error.value = false;
  try {
    await api.update(form.value.id, {
      username: form.value.username?.trim() || null,
      full_name: form.value.full_name?.trim() || null,
      email: form.value.email?.trim() || null,
      phone: form.value.phone?.trim() || null,
      role_id: form.value.role_id,
      is_active: form.value.is_active,
      password: form.value.password?.trim() || undefined,
    });
    message.value = 'تم تحديث المستخدم بنجاح';
    await refreshUsers();
    const updated = users.value.find((u) => u.id === form.value.id);
    if (updated) selectUser(updated);
    if (!form.value.password) form.value.password = '';
  } catch (e) {
    error.value = true;
    message.value = e.message || 'فشل تحديث المستخدم';
  } finally {
    saving.value = false;
  }
};

onMounted(refreshUsers);
</script>

<style scoped lang="scss">
.users-page { display: flex; flex-direction: column; gap: 16px; }
.page-header {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  h2 { margin: 0; }
  p { margin: 4px 0 0; color: var(--text-muted); }
}
.users-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.9fr);
  gap: 16px;
  align-items: start;
}
.card-head {
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
  margin-bottom: 12px;
  h3 { margin: 0; }
  span { color: var(--text-muted); font-size: 0.85rem; }
}
.table-wrap {
  overflow: auto;
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 12px 10px; border-bottom: 1px solid var(--border); text-align: right; }
  th { color: var(--text-muted); font-size: 0.85rem; }
  tr.active { background: color-mix(in srgb, var(--primary) 6%, transparent); }
}
.form-card .hint { color: var(--text-muted); margin: 0; }
.user-form { display: flex; flex-direction: column; gap: 14px; }
.checkbox-group { display: flex; align-items: flex-end; }
.checkbox-label { display: flex; align-items: center; gap: 8px; font-weight: 700; }
.message {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--success) 10%, transparent);
  color: var(--success);
  &.error {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
  }
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
.empty { text-align: center; color: var(--text-muted); padding: 20px; }
@media (max-width: 900px) {
  .users-layout { grid-template-columns: 1fr; }
}
</style>
