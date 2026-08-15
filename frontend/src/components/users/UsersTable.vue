<template>
  <article class="card table-card">
    <div class="card-head search-head">
      <div class="title-info">
        <h3>قائمة المستخدمين</h3>
        <span>{{ filteredUsers.length }} مستخدم</span>
      </div>
      <div class="search-box">
        <input
          :value="searchQuery"
          type="text"
          placeholder="البحث باسم المستخدم أو الاسم..."
          class="search-input"
          @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
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
          <tr v-for="u in filteredUsers" :key="u.id" :class="{ active: selectedUserId === u.id }">
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
              <span style="display: inline-flex; align-items: center; gap: 8px">
                <span :class="['status-dot-pulse', u.is_active ? 'success' : 'danger']"></span>
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
                @click="$emit('edit', u)"
              >
                <AppIcon name="edit" :size="14" /> تعديل
              </button>
              <button
                v-permission="'users.delete'"
                type="button"
                class="btn btn-sm btn-delete"
                @click="$emit('delete', u)"
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
</template>

<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';

/**
 * جدول المستخدمين — يعرض القائمة مع البحث وأزرار التعديل والحذف.
 *
 * @props filteredUsers   المستخدمون بعد الفلترة (بحث) — تُحسب في الأب
 * @props roles           الأدوار (لترجمة role_id إلى اسم عربي)
 * @props searchQuery     نص البحث الحالي
 * @props selectedUserId  id المستخدم المحدد (لتظليل الصف)
 * @props currentUserId   id المستخدم الحالي (منع حذف النفس)
 *
 * @emits update:searchQuery  تحديث نص البحث (v-model في الأب)
 * @emits edit               اختيار مستخدم للتعديل
 * @emits delete             طلب حذف مستخدم
 */
const props = defineProps<{
  filteredUsers: any[];
  roles: any[];
  searchQuery: string;
  selectedUserId: number | null | undefined;
  currentUserId: number | undefined;
}>();

defineEmits<{
  'update:searchQuery': [value: string];
  edit: [user: any];
  delete: [user: any];
}>();

const roleLabel = (roleId: any) => props.roles.find((r: any) => r.id === roleId)?.name_ar || '—';

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
</script>

<style lang="scss" scoped>
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
.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 30px;
}
</style>
