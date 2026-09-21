<template>
  <div>
    <div v-if="plLoading" class="loading-state card">⏳ جاري تحميل تقرير الربح والخسارة...</div>
    <div v-else-if="plError" class="error-msg">{{ plError }}</div>
    <template v-else-if="plData">
      <!-- ملاحظة طريقة حساب التكلفة -->
      <div v-if="plData.cogs_basis === 'purchases'" class="pl-notice card">
        <strong>ملاحظة:</strong> المبيعات مسجلة كإجمالي يومي بدون تفصيل أصناف، لذا يُستخدم
        <strong>إجمالي المشتريات</strong> كتقريب لتكلفة البضاعة المباعة.
      </div>

      <!-- KPIs الرئيسية -->
      <div class="kpi-grid kpi-grid-4">
        <div class="kpi-card">
          <div class="kpi-icon"><AppIcon name="wallet" :size="24" /></div>
          <div class="kpi-body">
            <div class="kpi-label">رصيد أول المدة</div>
            <div class="kpi-value">{{ formatMoney(plData.opening_balance) }}</div>
            <div class="kpi-sub">الفلوس المتاحة قبل الفترة</div>
          </div>
        </div>
        <div class="kpi-card sales">
          <div class="kpi-icon"><AppIcon name="sales" :size="24" /></div>
          <div class="kpi-body">
            <div class="kpi-label">صافي الإيرادات</div>
            <div class="kpi-value">{{ formatMoney(plData.revenue?.net) }}</div>
            <div class="kpi-sub">
              {{ plData.revenue?.count }} عملية · خصم {{ formatMoney(plData.revenue?.discounts) }}
            </div>
          </div>
        </div>
        <div class="kpi-card" :class="plData.gross_profit?.amount >= 0 ? 'profit' : 'danger'">
          <div class="kpi-icon"><AppIcon name="trendingUp" :size="24" /></div>
          <div class="kpi-body">
            <div class="kpi-label">هامش الربح الإجمالي</div>
            <div class="kpi-value">{{ formatMoney(plData.gross_profit?.amount) }}</div>
            <div class="kpi-sub">{{ plData.gross_profit?.margin }}% من الإيرادات</div>
          </div>
        </div>
        <div class="kpi-card" :class="plData.net_profit?.amount >= 0 ? 'profit' : 'danger'">
          <div class="kpi-icon">
            <AppIcon
              :name="plData.net_profit?.amount >= 0 ? 'trendingUp' : 'trendingDown'"
              :size="24"
            />
          </div>
          <div class="kpi-body">
            <div class="kpi-label">صافي الربح</div>
            <div class="kpi-value">{{ formatMoney(plData.net_profit?.amount) }}</div>
            <div class="kpi-sub">{{ plData.net_profit?.margin }}% هامش صافي</div>
          </div>
        </div>
      </div>

      <!-- KPI التدفق النقدي المنفصل -->
      <div class="kpi-grid kpi-grid-3 mt-0">
        <div class="kpi-card">
          <div class="kpi-icon"><AppIcon name="coffee" :size="24" /></div>
          <div class="kpi-body">
            <div class="kpi-label">تكلفة البضاعة</div>
            <div class="kpi-value">{{ formatMoney(plData.cogs?.total) }}</div>
            <div class="kpi-sub">{{ plData.purchases?.count }} فاتورة شراء</div>
          </div>
        </div>
        <div class="kpi-card expenses">
          <div class="kpi-icon"><AppIcon name="expenses" :size="24" /></div>
          <div class="kpi-body">
            <div class="kpi-label">المصاريف التشغيلية</div>
            <div class="kpi-value">{{ formatMoney(plData.operating_expenses?.total) }}</div>
            <div class="kpi-sub">{{ plData.operating_expenses?.count }} مصروف</div>
          </div>
        </div>
        <div class="kpi-card" :class="plData.cash_flow?.closing >= 0 ? 'profit' : 'danger'">
          <div class="kpi-icon"><AppIcon name="money" :size="24" /></div>
          <div class="kpi-body">
            <div class="kpi-label">رصيد آخر المدة</div>
            <div class="kpi-value">{{ formatMoney(plData.cash_flow?.closing) }}</div>
            <div class="kpi-sub">= بداية + مبيعات - مشتريات - مصاريف</div>
          </div>
        </div>
      </div>

      <!-- تفاصيل P&L -->
      <div class="grid grid-2 mt-4">
        <!-- قائمة الدخل المفصلة -->
        <div class="card pl-statement">
          <h3>قائمة الدخل</h3>
          <div class="pl-row pl-header"><span>البند</span><span>المبلغ</span></div>

          <div class="pl-section-title">الإيرادات</div>
          <div class="pl-row" v-for="(val, type) in plData.revenue?.by_type" :key="type">
            <span class="pl-indent">{{
              { branch: 'مبيعات المحل', wholesale: 'مبيعات جملة', pos: 'POS' }[type] || type
            }}</span>
            <span class="pl-amount">{{ formatMoney(val.revenue) }}</span>
          </div>
          <div v-if="plData.revenue?.returns > 0" class="pl-row pl-deduct">
            <span class="pl-indent">مرتجعات</span>
            <span class="pl-amount deduct">({{ formatMoney(plData.revenue.returns) }})</span>
          </div>
          <div class="pl-row pl-subtotal">
            <span>صافي الإيرادات</span>
            <span class="pl-amount bold">{{ formatMoney(plData.revenue?.net) }}</span>
          </div>

          <div class="pl-divider"></div>

          <div class="pl-section-title">تكلفة البضاعة المباعة</div>
          <div class="pl-row pl-deduct">
            <span class="pl-indent">المشتريات / تكلفة البضاعة</span>
            <span class="pl-amount deduct">({{ formatMoney(plData.cogs?.total) }})</span>
          </div>
          <div
            class="pl-row pl-subtotal"
            :class="plData.gross_profit?.amount >= 0 ? 'positive' : 'negative'"
          >
            <span>هامش الربح الإجمالي</span>
            <span class="pl-amount bold">{{ formatMoney(plData.gross_profit?.amount) }}</span>
          </div>

          <div class="pl-divider"></div>

          <div class="pl-section-title">المصاريف التشغيلية</div>
          <div
            class="pl-row pl-deduct"
            v-for="exp in plData.operating_expenses?.breakdown"
            :key="exp.category"
          >
            <span class="pl-indent">{{ exp.category }}</span>
            <span class="pl-amount deduct">({{ formatMoney(exp.total) }})</span>
          </div>
          <div class="pl-row pl-subtotal">
            <span>إجمالي المصاريف</span>
            <span class="pl-amount bold deduct"
              >({{ formatMoney(plData.operating_expenses?.total) }})</span
            >
          </div>

          <div class="pl-divider pl-divider-double"></div>
          <div
            class="pl-row pl-net"
            :class="plData.net_profit?.amount >= 0 ? 'positive' : 'negative'"
          >
            <span>صافي الربح</span>
            <span class="pl-amount bold-lg">{{ formatMoney(plData.net_profit?.amount) }}</span>
          </div>
        </div>

        <!-- التدفق النقدي -->
        <div class="card">
          <h3>التدفق النقدي</h3>
          <div class="pl-statement">
            <div class="pl-row pl-header"><span>البند</span><span>المبلغ</span></div>
            <div class="pl-row">
              <span>رصيد أول المدة</span>
              <span class="pl-amount">{{ formatMoney(plData.cash_flow?.opening) }}</span>
            </div>
            <div class="pl-row">
              <span class="pl-indent">+ إيرادات المبيعات</span>
              <span class="pl-amount positive">{{ formatMoney(plData.cash_flow?.revenue) }}</span>
            </div>
            <div class="pl-row pl-deduct">
              <span class="pl-indent">- مشتريات</span>
              <span class="pl-amount deduct">({{ formatMoney(plData.cash_flow?.purchases) }})</span>
            </div>
            <div class="pl-row pl-deduct">
              <span class="pl-indent">- مصاريف تشغيلية</span>
              <span class="pl-amount deduct">({{ formatMoney(plData.cash_flow?.expenses) }})</span>
            </div>
            <div class="pl-divider pl-divider-double"></div>
            <div
              class="pl-row pl-net"
              :class="plData.cash_flow?.closing >= 0 ? 'positive' : 'negative'"
            >
              <span>رصيد آخر المدة</span>
              <span class="pl-amount bold-lg">{{ formatMoney(plData.cash_flow?.closing) }}</span>
            </div>
          </div>

          <!-- المصاريف التشغيلية بنسبها -->
          <div class="mt-4" v-if="(plData.operating_expenses?.breakdown || []).length">
            <h4 class="pl-sub-title">توزيع المصاريف</h4>
            <div
              v-for="exp in plData.operating_expenses?.breakdown"
              :key="exp.category"
              class="expense-bar-row"
            >
              <span class="expense-label">{{ exp.category }}</span>
              <div class="expense-bar-wrap">
                <div
                  class="expense-bar"
                  :style="{
                    width:
                      plData.operating_expenses?.total > 0
                        ? ((exp.total / plData.operating_expenses.total) * 100).toFixed(1) + '%'
                        : '0%',
                  }"
                ></div>
              </div>
              <span class="expense-amount">{{ formatMoney(exp.total) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- الرسم البياني الشهري -->
      <div v-if="plTrend.length" class="card mt-4">
        <h3>الاتجاه الشهري — آخر {{ plTrend.length }} شهور</h3>
        <div class="table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>الشهر</th>
                <th>الإيرادات</th>
                <th>تكلفة البضاعة</th>
                <th>المصاريف</th>
                <th>هامش إجمالي</th>
                <th>صافي الربح</th>
                <th>هامش %</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in plTrend" :key="row.month">
                <td>{{ row.month?.slice(0, 7) }}</td>
                <td class="money">{{ formatMoney(row.revenue) }}</td>
                <td class="money muted">({{ formatMoney(row.cogs) }})</td>
                <td class="money muted">({{ formatMoney(row.expenses) }})</td>
                <td class="money" :class="row.gross_profit >= 0 ? 'profit-pos' : 'profit-neg'">
                  {{ formatMoney(row.gross_profit) }}
                </td>
                <td class="money" :class="row.net_profit >= 0 ? 'profit-pos' : 'profit-neg'">
                  {{ formatMoney(row.net_profit) }}
                </td>
                <td class="center" :class="row.net_margin >= 0 ? 'profit-pos' : 'profit-neg'">
                  {{ row.net_margin }}%
                </td>
              </tr>
              <!-- إجمالي الصف -->
              <tr class="pl-total-row">
                <td><strong>الإجمالي</strong></td>
                <td class="money bold">
                  {{ formatMoney(plTrend.reduce((s, r) => s + r.revenue, 0)) }}
                </td>
                <td class="money muted bold">
                  ({{ formatMoney(plTrend.reduce((s, r) => s + r.cogs, 0)) }})
                </td>
                <td class="money muted bold">
                  ({{ formatMoney(plTrend.reduce((s, r) => s + r.expenses, 0)) }})
                </td>
                <td
                  class="money bold"
                  :class="
                    plTrend.reduce((s, r) => s + r.gross_profit, 0) >= 0
                      ? 'profit-pos'
                      : 'profit-neg'
                  "
                >
                  {{ formatMoney(plTrend.reduce((s, r) => s + r.gross_profit, 0)) }}
                </td>
                <td
                  class="money bold"
                  :class="
                    plTrend.reduce((s, r) => s + r.net_profit, 0) >= 0 ? 'profit-pos' : 'profit-neg'
                  "
                >
                  {{ formatMoney(plTrend.reduce((s, r) => s + r.net_profit, 0)) }}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
    <div v-else class="empty-state card">
      <AppIcon name="reports" :size="48" />
      <p>اضغط تحديث لتحميل تقرير الربح والخسارة</p>
      <button class="btn btn-primary" @click="$emit('retry')">تحميل التقرير</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { formatMoney } from '@/utils/currency';

defineProps<{
  plData: any;
  plTrend: any[];
  plLoading: boolean;
  plError: string;
}>();

defineEmits<{
  (_e: 'retry'): void;
}>();
</script>

<style lang="scss" scoped>
@use './reportsShared.scss' as *;
</style>
