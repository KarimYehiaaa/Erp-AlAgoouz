<template>
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
      💡 اضغط على زر "تعديل" بجانب أي مستخدم لفتح وتعديل بياناته، أو انقر على "+ إضافة مستخدم جديد"
      لإنشاء مستخدم.
    </p>

    <form v-else class="user-form" @submit.prevent="$emit('save')">
      <div class="grid grid-2">
        <div class="form-group">
          <label>اسم الدخول *</label>
          <input
            v-model="form.username"
            type="text"
            required
            placeholder="مثال: karim"
            @blur="$emit('validateUsername')"
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
          <input v-model="form.full_name" type="text" required placeholder="مثال: كريم يحيى" />
        </div>
      </div>

      <!-- Progressive Disclosure Toggle -->
      <button
        type="button"
        @click="$emit('toggleAdvanced')"
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
              @blur="$emit('validateEmail')"
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
            :placeholder="isCreateMode ? 'ادخل كلمة المرور' : 'اتركها فارغة إذا لا تريد التغيير'"
            style="padding-left: 42px"
            @input="$emit('passwordInput')"
          />
          <button
            type="button"
            class="password-toggle-btn"
            @click="$emit('togglePassword')"
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
        <div v-if="form.password" class="password-strength-bar-container" style="margin-top: 8px">
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

      <div v-if="message" class="message" :class="{ error }">{{ message }}</div>

      <div class="form-actions">
        <button type="button" class="btn btn-outline" @click="$emit('cancel')" :disabled="saving">
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
</template>

<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';

/**
 * نموذج إنشاء/تعديل المستخدم — كل الحقول مع التحقق اللحظي ومؤشر قوة كلمة المرور.
 *
 * النموذج mutatable عبر v-model على `form` (كائن يُمرَّر من الأب ليُعدَّل مباشرة)
 * — وهو النمط المعتمد للمودالات المعقدة التي تحتفظ الأب بحالتها فيها.
 *
 * @props form               كائن النموذج الحالي (v-model غير مباشر — يُعدَّل مباشرة)
 * @props isCreateMode       وضع الإنشاء الجديد أم التعديل
 * @props roles              قائمة الأدوار لاختيار الدور
 * @props validations        نتائج التحقق (username/email) مع الرسائل
 * @props showAdvancedOptions  إظهار الحقول الإضافية (progressive disclosure)
 * @props showPassword       إظهار كلمة المرور
 * @props strengthPercent/Text/Color  مؤشر قوة كلمة المرور
 * @props message/error      رسالة الحفظ (نجاح/خطأ)
 * @props saving             حالة الجاري الحفظ
 *
 * @emits save / cancel / toggleAdvanced / togglePassword / validateUsername /
 *        validateEmail / passwordInput
 */
defineProps<{
  form: any;
  isCreateMode: boolean;
  roles: any[];
  validations: {
    username: { valid: boolean | null; msg: string };
    email: { valid: boolean | null; msg: string };
  };
  showAdvancedOptions: boolean;
  showPassword: boolean;
  strengthPercent: number;
  strengthText: string;
  strengthColor: string;
  message: string;
  error: boolean;
  saving: boolean;
}>();

defineEmits<{
  save: [];
  cancel: [];
  toggleAdvanced: [];
  togglePassword: [];
  validateUsername: [];
  validateEmail: [];
  passwordInput: [];
}>();
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
</style>
