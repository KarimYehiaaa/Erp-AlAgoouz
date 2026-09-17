<template>
  <div class="hr-page">
    <div class="page-header" style="margin-bottom: 24px">
      <div class="header-right">
        <p
          class="eyebrow"
          style="
            color: var(--primary);
            font-weight: 700;
            margin-bottom: 4px;
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          "
        >
          إدارة الموارد البشرية
        </p>
        <h1 style="font-size: 1.8rem; font-weight: 800; color: var(--text-strong)">
          الموظفين والحضور والمرتبات
        </h1>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom: 24px">
      <StatCard
        v-for="card in statCards"
        :key="card.label"
        :label="card.label"
        :value="card.value"
        :hint="card.hint"
        :icon="card.icon"
      />
    </div>

    <div v-if="error" class="alert error" style="margin-bottom: 16px">{{ error }}</div>
    <div v-if="success" class="alert success" style="margin-bottom: 16px">{{ success }}</div>

    <div style="margin-bottom: 24px">
      <nav class="hr-tabs" style="position: relative">
        <div
          class="tab-slider"
          :style="{
            transform:
              activeTab === 'employees'
                ? 'translateX(0)'
                : activeTab === 'attendance'
                  ? 'translateX(calc(-100% - 4px))'
                  : activeTab === 'advances'
                    ? 'translateX(calc(-200% - 8px))'
                    : 'translateX(calc(-300% - 12px))',
          }"
        ></div>
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          <span class="tab-icon"><AppIcon :name="tab.icon" /></span>
          <span class="tab-label">{{ tab.label }}</span>
        </button>
      </nav>
    </div>

    <div v-if="activeTab === 'employees'" class="tab-panel">
      <div class="card form-card" style="margin-bottom: 24px">
        <h3 style="margin-bottom: 16px; font-weight: 700">
          {{ editingEmployeeId ? ' تعديل بيانات الموظف' : ' تسجيل موظف جديد' }}
        </h3>
        <form @submit.prevent="saveEmployee">
          <div class="fields-grid">
            <div class="form-group">
              <label>اسم الموظف *</label>
              <input v-model="employeeForm.full_name" required placeholder="مثال: محمد أحمد" />
            </div>
            <div class="form-group">
              <label>الوظيفة</label>
              <input v-model="employeeForm.job_title" placeholder="مثال: محاسب أو عامل تشغيل" />
            </div>
            <div class="form-group">
              <label>رقم الهاتف</label>
              <input v-model="employeeForm.phone" placeholder="01xxxxxxxxx" />
            </div>
            <div class="form-group">
              <label>نوع الراتب</label>
              <select v-model="employeeForm.salary_type">
                <option value="monthly">راتب شهري</option>
                <option value="daily">راتب يومي</option>
                <option value="hourly">بالساعة</option>
              </select>
            </div>
            <div class="form-group">
              <label>الراتب الأساسي / الأجر اليومي</label>
              <input
                v-model.number="employeeForm.base_salary"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </div>
            <div class="form-group">
              <label>قيمة ساعة الإضافي</label>
              <input
                v-model.number="employeeForm.overtime_rate"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </div>
            <div class="form-group">
              <label>أيام العمل المطلوبة شهرياً</label>
              <input
                v-model.number="employeeForm.work_days_per_month"
                type="number"
                min="1"
                placeholder="26"
              />
            </div>
            <div class="form-group">
              <label>الشيفت المخصص</label>
              <select v-model="employeeForm.shift_id">
                <option :value="null">بدون شيفت</option>
                <option v-for="shift in shifts" :key="shift.id" :value="shift.id">
                  {{ shift.name_ar }}
                </option>
              </select>
            </div>
          </div>
          <div style="margin-top: 16px; display: flex; gap: 8px">
            <button
              v-permission="'hr.edit'"
              class="btn btn-primary"
              type="submit"
              :disabled="loading"
            >
              {{ editingEmployeeId ? 'تحديث البيانات' : 'إضافة الموظف' }}
            </button>
            <button
              v-if="editingEmployeeId"
              class="btn btn-outline"
              type="button"
              @click="resetEmployeeForm"
            >
              إلغاء التعديل
            </button>
          </div>
        </form>
      </div>

      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>الموظف</th>
              <th>الوظيفة</th>
              <th>الراتب الأساسي</th>
              <th>الشيفت</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading" v-for="i in 3" :key="'emp-sk-' + i">
              <td><div class="skeleton-shimmer" style="height: 18px; width: 140px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 100px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 90px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 50px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 110px"></div></td>
            </tr>
            <tr v-else v-for="employee in employees" :key="employee.id">
              <td>
                <strong>{{ employee.full_name }}</strong>
              </td>
              <td>{{ employee.job_title || '-' }}</td>
              <td>{{ formatMoney(employee.base_salary) }}</td>
              <td>{{ employee.shift_name || '-' }}</td>
              <td>
                <span class="pill" :class="employee.is_active ? 'success' : 'muted'">
                  {{ employee.is_active ? 'نشط' : 'موقوف' }}
                </span>
              </td>
              <td>
                <div class="row-actions">
                  <button
                    type="button"
                    class="btn btn-sm btn-outline"
                    @click="editEmployee(employee)"
                  >
                    تعديل
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-danger"
                    @click="deleteEmployee(employee)"
                    :disabled="loading"
                  >
                    حذف
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!loading && !employees.length">
              <td colspan="6" class="empty">لا يوجد موظفين بعد</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="activeTab === 'attendance'" class="tab-panel">
      <div class="card form-card" style="margin-bottom: 24px">
        <h3 style="margin-bottom: 16px; font-weight: 700">تسجيل حضور وانصراف الموظفين</h3>
        <form @submit.prevent="saveAttendance">
          <div class="fields-grid">
            <div class="form-group">
              <label>الموظف *</label>
              <select v-model="attendanceForm.employee_id" required>
                <option disabled value="">اختر الموظف</option>
                <option v-for="employee in employees" :key="employee.id" :value="employee.id">
                  {{ employee.full_name }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>من تاريخ *</label>
              <input v-model="attendanceForm.from_date" type="date" required />
            </div>
            <div class="form-group">
              <label>إلى تاريخ *</label>
              <input v-model="attendanceForm.to_date" type="date" required />
            </div>
            <div class="form-group">
              <label>توقيت الحضور</label>
              <input v-model="attendanceForm.check_in" type="datetime-local" />
            </div>
            <div class="form-group">
              <label>توقيت الانصراف</label>
              <input v-model="attendanceForm.check_out" type="datetime-local" />
            </div>
            <div class="form-group">
              <label>حالة الحضور *</label>
              <select v-model="attendanceForm.status" required>
                <option value="present">حاضر</option>
                <option value="absent">غائب</option>
                <option value="paid_leave">إجازة مدفوعة</option>
                <option value="unpaid_leave">إجازة غير مدفوعة</option>
                <option value="half_day">نصف يوم</option>
                <option value="weekly_off">عطلة أسبوعية</option>
              </select>
            </div>
            <div class="form-group full-width">
              <label>ملاحظات</label>
              <input v-model="attendanceForm.notes" placeholder="ملاحظات حول الحضور" />
            </div>
          </div>
          <div style="margin-top: 16px">
            <button
              v-permission="'hr.edit'"
              class="btn btn-primary"
              type="submit"
              :disabled="loading"
            >
              حفظ الحضور للأيام المحددة
            </button>
          </div>
        </form>
      </div>

      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الموظف</th>
              <th>الحالة</th>
              <th>ساعات العمل</th>
              <th>إضافي</th>
              <th>تأخير</th>
              <th>ملاحظات</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading" v-for="i in 3" :key="'att-sk-' + i">
              <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 120px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 60px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 90px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 90px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 100px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 40px"></div></td>
            </tr>
            <tr v-else v-for="row in attendance" :key="row.id">
              <td style="font-weight: 700">{{ row.work_date }}</td>
              <td>
                <strong>{{ row.employee_name }}</strong>
              </td>
              <td>
                <span class="pill" :class="row.status === 'present' ? 'success' : 'warning'">{{
                  attendanceLabel(row.status)
                }}</span>
              </td>
              <td style="font-weight: 800; color: var(--accent)">
                {{ formatNumber(row.regular_hours) }} ساعة
              </td>
              <td>{{ formatNumber(row.overtime_hours) }} ساعة</td>
              <td>{{ row.late_minutes }} دقيقة</td>
              <td style="font-size: 0.85rem; color: var(--text-muted)">{{ row.notes || '—' }}</td>
              <td>
                <button
                  type="button"
                  class="icon-btn danger"
                  @click="deleteAttendance(row)"
                  title="حذف الحضور"
                >
                  <AppIcon name="delete" :size="16" />
                </button>
              </td>
            </tr>
            <tr v-if="!loading && !attendance.length">
              <td colspan="8" class="empty">لا يوجد حضور مسجل لهذا الشهر</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="activeTab === 'advances'" class="tab-panel">
      <div class="card form-card" style="margin-bottom: 24px">
        <h3 style="margin-bottom: 16px; font-weight: 700">صرف سلفة جديدة</h3>
        <form @submit.prevent="createAdvance">
          <div class="fields-grid">
            <div class="form-group">
              <label>الموظف *</label>
              <select v-model="advanceForm.employee_id" required>
                <option disabled value="">اختر الموظف</option>
                <option v-for="employee in employees" :key="employee.id" :value="employee.id">
                  {{ employee.full_name }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>تاريخ السلفة *</label>
              <input v-model="advanceForm.advance_date" type="date" required />
            </div>
            <div class="form-group">
              <label>قيمة السلفة (جنيه) *</label>
              <input
                v-model.number="advanceForm.amount"
                type="number"
                min="1"
                step="0.01"
                required
                placeholder="0.00"
              />
            </div>
            <div class="form-group">
              <label>عدد الأقساط الشهرية</label>
              <input
                v-model.number="advanceForm.installments_count"
                type="number"
                min="1"
                placeholder="1"
              />
            </div>
            <div class="form-group full-width">
              <label>ملاحظات</label>
              <input v-model="advanceForm.notes" placeholder="ملاحظات وتفاصيل الدفع" />
            </div>
          </div>
          <div style="margin-top: 16px">
            <button
              v-permission="'hr.edit'"
              class="btn btn-primary"
              type="submit"
              :disabled="loading"
            >
              صرف السلفة وتسجيل مصروف
            </button>
          </div>
        </form>
      </div>

      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الموظف</th>
              <th>القيمة الإجمالية</th>
              <th>القسط الشهري</th>
              <th>المبلغ المتبقي</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading" v-for="i in 3" :key="'adv-sk-' + i">
              <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 120px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 60px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 40px"></div></td>
            </tr>
            <tr v-else v-for="advance in advances" :key="advance.id">
              <td>{{ advance.advance_date }}</td>
              <td>
                <strong>{{ advance.employee_name }}</strong>
              </td>
              <td>{{ formatMoney(advance.amount) }}</td>
              <td>{{ formatMoney(advance.installment_amount) }}</td>
              <td>
                <strong>{{ formatMoney(advance.remaining_amount) }}</strong>
              </td>
              <td>
                <span class="pill" :class="advance.status === 'closed' ? 'muted' : 'warning'">
                  {{ advance.status === 'closed' ? 'منتهية' : 'نشطة' }}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  class="icon-btn danger"
                  @click="deleteAdvance(advance)"
                  title="حذف السلفة"
                >
                  <AppIcon name="delete" :size="16" />
                </button>
              </td>
            </tr>
            <tr v-if="!loading && !advances.length">
              <td colspan="7" class="empty">لا توجد سلف نشطة</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="activeTab === 'payroll'" class="tab-panel">
      <div class="card payroll-controls-card" style="margin-bottom: 24px; padding: 20px">
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
          "
        >
          <div class="form-group" style="min-width: 200px; margin-bottom: 0">
            <label style="margin-bottom: 4px; font-weight: 700">شهر حساب المرتبات</label>
            <input
              v-model="periodMonth"
              type="month"
              @change="refreshAll"
              style="
                padding: 8px 12px;
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                background: var(--bg-elevated);
                color: var(--text-strong);
              "
            />
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap">
            <button
              type="button"
              class="btn btn-outline"
              @click="loadPayrollPreview"
              :disabled="loading"
            >
              معاينة الحساب
            </button>
            <button
              type="button"
              class="btn btn-primary"
              @click="createPayroll"
              :disabled="loading"
            >
              إنشاء / إعادة حساب المسير
            </button>
            <button
              v-if="selectedRun && selectedRun.status !== 'paid'"
              type="button"
              class="btn btn-danger"
              @click="payPayroll"
              :disabled="loading"
            >
              صرف المرتبات وتسجيل المصروف
            </button>
          </div>
        </div>
      </div>

      <section
        class="payroll-summary"
        style="margin-bottom: 24px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px"
      >
        <div
          class="kpi-card"
          style="
            display: flex;
            flex-direction: column;
            align-items: start;
            padding: 16px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
          "
        >
          <span style="font-size: 0.8rem; color: var(--text-muted)">إجمالي الرواتب</span>
          <strong
            style="font-size: 1.4rem; font-weight: 800; color: var(--text-strong); margin-top: 4px"
            >{{ formatMoney(payrollTotals.gross) }}</strong
          >
        </div>
        <div
          class="kpi-card"
          style="
            display: flex;
            flex-direction: column;
            align-items: start;
            padding: 16px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            border-color: color-mix(in srgb, var(--danger) 25%, var(--border));
          "
        >
          <span style="font-size: 0.8rem; color: var(--text-muted)">الخصومات والتأخير</span>
          <strong
            style="font-size: 1.4rem; font-weight: 800; color: var(--danger); margin-top: 4px"
            >{{ formatMoney(payrollTotals.deductions) }}</strong
          >
        </div>
        <div
          class="kpi-card"
          style="
            display: flex;
            flex-direction: column;
            align-items: start;
            padding: 16px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            border-color: color-mix(in srgb, var(--warning) 25%, var(--border));
          "
        >
          <span style="font-size: 0.8rem; color: var(--text-muted)">السلف المستقطعة</span>
          <strong
            style="font-size: 1.4rem; font-weight: 800; color: var(--warning); margin-top: 4px"
            >{{ formatMoney(payrollTotals.advances) }}</strong
          >
        </div>
        <div
          class="kpi-card"
          style="
            display: flex;
            flex-direction: column;
            align-items: start;
            padding: 16px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            border-color: color-mix(in srgb, var(--success) 25%, var(--border));
          "
        >
          <span style="font-size: 0.8rem; color: var(--text-muted)"
            >صافي المبالغ المستحقة للدفع</span
          >
          <strong
            style="font-size: 1.4rem; font-weight: 800; color: var(--success); margin-top: 4px"
            >{{ formatMoney(payrollTotals.net) }}</strong
          >
        </div>
      </section>

      <div class="card table-wrap" style="margin-bottom: 24px">
        <table>
          <thead>
            <tr>
              <th>الموظف</th>
              <th>أيام عمل</th>
              <th>أيام غياب</th>
              <th>إضافي (جنيه)</th>
              <th>خصم تأخير (جنيه)</th>
              <th>خصم السلف (جنيه)</th>
              <th>صافي المرتب</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading" v-for="i in 3" :key="'w-sk-' + i">
              <td><div class="skeleton-shimmer" style="height: 18px; width: 140px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 60px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 60px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 90px"></div></td>
            </tr>
            <tr v-else v-for="item in payrollItems" :key="item.employee_id || item.id">
              <td>
                <strong>{{ item.full_name || item.employee_name }}</strong>
              </td>
              <td>{{ item.worked_days }} يوم</td>
              <td>{{ item.absent_days }} يوم</td>
              <td>{{ formatMoney(item.overtime_amount) }}</td>
              <td>{{ formatMoney(item.late_deduction) }}</td>
              <td>{{ formatMoney(item.advance_deduction) }}</td>
              <td>
                <strong>{{ formatMoney(item.net_salary) }}</strong>
              </td>
            </tr>
            <tr v-if="!loading && !payrollItems.length">
              <td colspan="7" class="empty">اضغط معاينة الحساب لعرض تفاصيل المرتبات</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="runs-list-container" style="margin-top: 32px">
        <h4 style="margin-bottom: 12px; font-weight: 700">المسيرات السابقة والمحفوظة:</h4>
        <div style="display: flex; gap: 8px; flex-wrap: wrap">
          <button
            v-for="run in payrollRuns"
            :key="run.id"
            type="button"
            class="btn btn-sm"
            :class="selectedRun?.id === run.id ? 'btn-primary' : 'btn-outline'"
            @click="openRun(run.id)"
            style="display: flex; gap: 6px; align-items: center"
          >
            <span> {{ String(run.period_month).slice(0, 7) }}</span>
            <span
              class="pill"
              :class="run.status === 'paid' ? 'success' : 'warning'"
              style="font-size: 0.75rem; padding: 2px 6px"
            >
              {{ run.status === 'paid' ? 'مصروف' : 'مسودة' }}
            </span>
            <strong style="margin-inline-start: 6px">{{ formatMoney(run.total_net) }}</strong>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { hr } from '@/api';
import StatCard from '@/components/StatCard.vue';
import AppIcon from '@/components/AppIcon.vue';
import { formatMoney, formatNumber } from '@/utils/currency';

const today = new Date().toISOString().slice(0, 10);
const periodMonth = ref(new Date().toISOString().slice(0, 7));

// دالة مساعدة لحساب آخر يوم في الشهر المختار لمنع تداخل الحضور بين الشهور
const getMonthEnd = (yearMonthStr: any) => {
  if (!yearMonthStr) return today;
  const [year, month] = yearMonthStr.split('-').map(Number);
  const end = new Date(year, month, 0); // يوم 0 من الشهر التالي يعطي آخر يوم في الشهر الحالي
  return `${yearMonthStr}-${String(end.getDate()).padStart(2, '0')}`;
};

const activeTab = ref('employees');
const loading = ref(false);
const error = ref('');
const success = ref('');

const summary = ref<Record<string, any>>({});
const shifts = ref<any[]>([]);
const employees = ref<any[]>([]);
const attendance = ref<any[]>([]);
const advances = ref<any[]>([]);
const payrollRuns = ref<any[]>([]);
const payrollItems = ref<any[]>([]);
const payrollTotals = ref({ gross: 0, deductions: 0, advances: 0, net: 0 });
const selectedRun = ref<any>(null);
const editingEmployeeId = ref<any>(null);

const blankEmployeeForm = () => ({
  full_name: '',
  job_title: '',
  phone: '',
  salary_type: 'monthly',
  base_salary: null as number | null,
  overtime_rate: null as number | null,
  work_days_per_month: 26,
  shift_id: null,
});

const employeeForm = ref(blankEmployeeForm());

const attendanceForm = ref({
  employee_id: '',
  from_date: today,
  to_date: today,
  check_in: '',
  check_out: '',
  status: 'present',
  notes: '',
});

const advanceForm = ref({
  employee_id: '',
  advance_date: today,
  amount: null,
  installments_count: 1,
  notes: '',
});

const tabs = [
  { key: 'employees', label: 'الموظفين', icon: 'customers' },
  { key: 'attendance', label: 'الحضور والانصراف', icon: 'calendar' },
  { key: 'advances', label: 'السلف والأقساط', icon: 'coins' },
  { key: 'payroll', label: 'مسير المرتبات', icon: 'receipt' },
];

const statCards = computed(() => [
  {
    label: 'موظفين نشطين',
    value: summary.value.activeEmployees || 0,
    hint: 'داخل كشوف المرتبات',
    icon: 'customers',
  },
  {
    label: 'حضور اليوم',
    value: summary.value.todayPresent || 0,
    hint: `${summary.value.todayAbsent || 0} غياب`,
    icon: 'calendar',
  },
  {
    label: 'سلف مفتوحة',
    value: formatMoney(summary.value.openAdvances),
    hint: 'تخصم عند صرف المرتب',
    icon: 'coins',
  },
  {
    label: 'مسير الشهر',
    value: summary.value.payroll ? formatMoney(summary.value.payroll.total_net) : 'غير محسوب',
    hint: summary.value.payroll?.status === 'paid' ? 'مصروف' : 'مسودة',
    icon: 'receipt',
  },
]);

const runTask = async (task: () => Promise<any>, message = '') => {
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    const result = await task();
    if (message) success.value = message;
    return result;
  } catch (e: any) {
    error.value = e.message || 'حدث خطأ غير متوقع';
    return null;
  } finally {
    loading.value = false;
  }
};

const refreshAll = async () => {
  await runTask(async () => {
    const [summaryRes, shiftsRes, employeesRes, attendanceRes, advancesRes, runsRes] =
      await Promise.all([
        hr.summary({ period_month: periodMonth.value }),
        hr.shifts(),
        hr.employees({ active: true }),
        hr.attendance({
          from_date: `${periodMonth.value}-01`,
          to_date: getMonthEnd(periodMonth.value),
        }),
        hr.advances({}),
        hr.payrollRuns(),
      ]);
    summary.value = summaryRes.data || {};
    shifts.value = shiftsRes.data || [];
    employees.value = employeesRes.data || [];
    attendance.value = attendanceRes.data || [];
    advances.value = advancesRes.data || [];
    payrollRuns.value = runsRes.data || [];
  });
};

const saveEmployee = async () => {
  await runTask(
    async () => {
      if (editingEmployeeId.value) {
        await hr.updateEmployee(editingEmployeeId.value, employeeForm.value);
      } else {
        await hr.createEmployee(employeeForm.value);
      }
      resetEmployeeForm();
      await refreshAll();
    },
    editingEmployeeId.value ? 'تم تحديث الموظف بنجاح' : 'تم حفظ الموظف بنجاح',
  );
};

const editEmployee = (employee: any) => {
  editingEmployeeId.value = employee.id;
  employeeForm.value = {
    full_name: employee.full_name || '',
    job_title: employee.job_title || '',
    phone: employee.phone || '',
    salary_type: employee.salary_type || 'monthly',
    base_salary: Number(employee.base_salary || 0),
    overtime_rate: Number(employee.overtime_rate || 0),
    work_days_per_month: Number(employee.work_days_per_month || 26),
    shift_id: employee.shift_id || null,
  };
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const resetEmployeeForm = () => {
  editingEmployeeId.value = null;
  employeeForm.value = blankEmployeeForm();
};

const deleteEmployee = async (employee: any) => {
  const ok = window.confirm(
    `هل تريد حذف/إيقاف الموظف "${employee.full_name}"؟ سيظل تاريخ الحضور والمرتبات محفوظًا للمراجعة.`,
  );
  if (!ok) return;
  await runTask(async () => {
    await hr.deleteEmployee(employee.id);
    if (editingEmployeeId.value === employee.id) resetEmployeeForm();
    await refreshAll();
  }, 'تم حذف الموظف من القائمة النشطة');
};

const saveAttendance = async () => {
  if (!attendanceForm.value.employee_id) {
    alert('يرجى اختيار الموظف أولاً من القائمة');
    return;
  }
  await runTask(async () => {
    const payload = {
      ...attendanceForm.value,
      check_in: attendanceForm.value.check_in || null,
      check_out: attendanceForm.value.check_out || null,
      notes: attendanceForm.value.notes || null,
    };
    await hr.saveAttendance(payload);

    // Automatically switch month filter if saved attendance date is in another month
    if (payload.from_date && payload.from_date.slice(0, 7) !== periodMonth.value) {
      periodMonth.value = payload.from_date.slice(0, 7);
    }

    attendanceForm.value = { ...attendanceForm.value, check_in: '', check_out: '', notes: '' };
    await refreshAll();
  }, 'تم حفظ الحضور للأيام المحددة بنجاح');
};

const deleteAttendance = async (row: any) => {
  const ok = window.confirm(
    `هل أنت تأكد من حذف سجل حضور الموظف "${row.employee_name}" بتاريخ ${row.work_date}؟`,
  );
  if (!ok) return;
  await runTask(async () => {
    await hr.deleteAttendance(row.id);
    await refreshAll();
  }, 'تم حذف سجل الحضور بنجاح');
};

const createAdvance = async () => {
  await runTask(async () => {
    await hr.createAdvance(advanceForm.value);
    advanceForm.value = {
      employee_id: '',
      advance_date: today,
      amount: null,
      installments_count: 1,
      notes: '',
    };
    await refreshAll();
  }, 'تم صرف السلفة وتسجيلها كمصروف');
};

const deleteAdvance = async (advance: any) => {
  const ok = window.confirm(
    `هل أنت تأكد من حذف سلفة الموظف "${advance.employee_name}" بمبلغ ${advance.amount} جنيه؟`,
  );
  if (!ok) return;
  await runTask(async () => {
    await hr.deleteAdvance(advance.id);
    await refreshAll();
  }, 'تم حذف السلفة بنجاح');
};

const loadPayrollPreview = async () => {
  await runTask(async () => {
    const res = await hr.previewPayroll({ period_month: periodMonth.value });
    payrollItems.value = res.data.items || [];
    payrollTotals.value = res.data.totals || { gross: 0, deductions: 0, advances: 0, net: 0 };
    selectedRun.value = null;
  });
};

const createPayroll = async () => {
  await runTask(async () => {
    const res = await hr.createPayroll({ period_month: periodMonth.value });
    selectedRun.value = res.data;
    payrollItems.value = res.data.items || [];
    payrollTotals.value = {
      gross: res.data.total_gross,
      deductions: res.data.total_deductions,
      advances: res.data.total_advances,
      net: res.data.total_net,
    };
    await refreshAll();
  }, 'تم حساب مسير المرتبات');
};

const openRun = async (id: any) => {
  await runTask(async () => {
    const res = await hr.getPayroll(id);
    selectedRun.value = res.data;
    payrollItems.value = res.data.items || [];
    payrollTotals.value = {
      gross: res.data.total_gross,
      deductions: res.data.total_deductions,
      advances: res.data.total_advances,
      net: res.data.total_net,
    };
  });
};

const payPayroll = async () => {
  if (!selectedRun.value) return;
  await runTask(async () => {
    const res = await hr.payPayroll(selectedRun.value.id, { payment_method: 'cash' });
    selectedRun.value = res.data;
    payrollItems.value = res.data.items || [];
    await refreshAll();
  }, 'تم صرف المرتبات وتسجيل مصروف الصافي');
};

const attendanceLabel = (status: any) =>
  (
    ({
      present: 'حاضر',
      absent: 'غائب',
      paid_leave: 'إجازة مدفوعة',
      unpaid_leave: 'إجازة غير مدفوعة',
      half_day: 'نصف يوم',
      weekly_off: 'عطلة أسبوعية',
    }) as Record<string, string>
  )[status] || status;

onMounted(refreshAll);
</script>

<style lang="scss" scoped>
.hr-page {
  display: grid;
  gap: 20px;
}

/* Tabs */
.hr-tabs {
  position: relative;
  display: flex;
  background: var(--bg-soft);
  padding: 4px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  gap: 4px;
  width: fit-content;
  margin-bottom: 12px;
}
.tab-slider {
  position: absolute;
  top: 4px;
  bottom: 4px;
  right: 4px;
  width: calc(25% - 6px);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1;
}
.tab-btn {
  position: relative;
  z-index: 2;
  background: transparent !important;
  border: none !important;
  color: var(--text-muted);
  font-weight: 700;
  padding: 10px 18px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: color 0.28s ease;
  border-radius: var(--radius-md);

  &:hover {
    color: var(--text-strong);
  }

  &.active {
    color: var(--primary-dark) !important;
  }
}

/* Forms Grid Layout */
.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;

  .full-width {
    grid-column: 1 / -1;
  }
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-strong);
  }

  input,
  select {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 10px);
    background: var(--bg-elevated);
    color: var(--text-strong);
    font-size: 0.9rem;
    transition: var(--transition);

    &:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
    }
  }
}

/* Table styles overrides to match the premium style */
.table-wrap {
  overflow-x: auto;

  table {
    width: 100%;
    border-collapse: collapse;

    th {
      font-weight: 700;
      color: var(--text-muted);
      border-bottom: 2px solid var(--border);
      padding: 12px;
      text-align: start;
    }

    td {
      padding: 12px;
      border-bottom: 1px solid var(--border);
      color: var(--text-strong);
    }

    tr:hover td {
      background: color-mix(in srgb, var(--primary) 3%, transparent);
    }
  }
}

.row-actions {
  display: flex;
  gap: 8px;
}

.pill {
  font-size: 0.75rem;
  padding: 4px 8px;
  border-radius: var(--radius-xs, 4px);
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 700;

  &.muted {
    background: var(--border);
    color: var(--text-muted);
  }

  &.success {
    background: color-mix(in srgb, #27ae60 15%, transparent);
    color: #27ae60;
  }

  &.warning {
    background: color-mix(in srgb, #f39c12 15%, transparent);
    color: #f39c12;
  }
}
</style>
