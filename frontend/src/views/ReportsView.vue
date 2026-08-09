<template>
  <div class="reports-page">
    <!-- Header -->
    <div class="reports-header card">
      <div class="header-title">
        <span class="header-icon">📊</span>
        <div>
          <h2>التقارير الشاملة</h2>
          <p>ملخص كامل لكل أقسام النظام — مبيعات، مخزون، أرباح، مصروفات، عملاء، مشتريات</p>
        </div>
      </div>
      <div class="header-filters">
        <div class="form-group">
          <label>من</label>
          <input v-model="filters.from_date" type="date" />
        </div>
        <div class="form-group">
          <label>إلى</label>
          <input v-model="filters.to_date" type="date" />
        </div>
        <div class="form-group month-picker-group">
          <label>&nbsp;</label>
          <div class="month-filter-btn" title="اختر الشهر بالكامل">
            <AppIcon name="calendar" :size="18" />
            <input type="month" class="month-picker-overlay" @change="selectMonth" />
          </div>
        </div>
        <div class="quick-dates">
          <button @click="setQuick('today')">اليوم</button>
          <button @click="setQuick('week')">أسبوع</button>
          <button @click="setQuick('month')">شهر</button>
          <button @click="setQuick('year')">سنة</button>
          <button @click="setQuick('all')">الكل</button>
        </div>
        <button class="btn btn-primary" :disabled="loading" @click="loadActiveTab">
          {{ loading ? '⏳' : '🔄 تحديث' }}
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="report-tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        :class="['tab-btn', { active: activeTab === t.id }]"
        @click="loadTab(t.id)"
      >
        <span class="tab-icon">{{ t.icon }}</span>
        <span>{{ t.label }}</span>
      </button>
    </div>

    <div v-if="error" class="error-msg">⚠️ {{ error }}</div>
    <div v-if="loading" class="loading-state card">⏳ جاري تحميل التقرير...</div>

    <!-- ===== SUMMARY TAB ===== -->
    <template v-if="!loading && activeTab === 'summary'">
      <div class="kpi-grid">
        <div class="kpi-card sales">
          <div class="kpi-icon">💰</div>
          <div class="kpi-body">
            <div class="kpi-label">إجمالي المبيعات</div>
            <div class="kpi-value">{{ formatMoney(summary.sales?.total_sales || 0) }}</div>
            <div class="kpi-sub">{{ summary.sales?.sales_count || 0 }} عملية بيع</div>
          </div>
        </div>
        <div class="kpi-card profit">
          <div class="kpi-icon">📈</div>
          <div class="kpi-body">
            <div class="kpi-label">صافي الأرباح</div>
            <div class="kpi-value">{{ formatMoney(summary.sales?.total_profit || 0) }}</div>
            <div class="kpi-sub">{{ profitMarginPct }}% هامش ربح</div>
          </div>
        </div>
        <div class="kpi-card expenses">
          <div class="kpi-icon">💸</div>
          <div class="kpi-body">
            <div class="kpi-label">إجمالي المصروفات</div>
            <div class="kpi-value">{{ formatMoney(summary.expenses?.total_expenses || 0) }}</div>
            <div class="kpi-sub">{{ summary.expenses?.expenses_count || 0 }} مصروف</div>
          </div>
        </div>
        <div class="kpi-card cashflow" :class="summary.cashFlow >= 0 ? 'positive' : 'negative'">
          <div class="kpi-icon">{{ summary.cashFlow >= 0 ? '✅' : '⚠️' }}</div>
          <div class="kpi-body">
            <div class="kpi-label">التدفق النقدي</div>
            <div class="kpi-value">{{ formatMoney(summary.cashFlow || 0) }}</div>
            <div class="kpi-sub">مبيعات − مصروفات</div>
          </div>
        </div>
        <div class="kpi-card inventory">
          <div class="kpi-icon">📦</div>
          <div class="kpi-body">
            <div class="kpi-label">المنتجات</div>
            <div class="kpi-value">{{ summary.inventory?.products || 0 }}</div>
            <div class="kpi-sub">{{ summary.inventory?.warehouses || 0 }} مخزن</div>
          </div>
        </div>
        <div class="kpi-card customers">
          <div class="kpi-icon">👥</div>
          <div class="kpi-body">
            <div class="kpi-label">العملاء النشطون</div>
            <div class="kpi-value">{{ summary.customersCount || 0 }}</div>
            <div class="kpi-sub">{{ summary.unpaidInvoices?.count || 0 }} فاتورة غير مدفوعة</div>
          </div>
        </div>
      </div>

      <div class="grid grid-2 mt-4">
        <div class="card">
          <h3>🏆 أعلى المنتجات مبيعاً</h3>
          <table class="report-table">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>الكمية</th>
                <th>الإيراد</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in summary.topProducts || []" :key="row.name_ar">
                <td>{{ row.name_ar }}</td>
                <td>{{ fmtQty(row.qty) }}</td>
                <td class="money">{{ formatMoney(row.revenue || 0) }}</td>
              </tr>
              <tr v-if="!(summary.topProducts || []).length">
                <td colspan="3" class="empty">لا توجد بيانات</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <h3>⚠️ تنبيهات المخزون المنخفض</h3>
          <table class="report-table">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>المخزون</th>
                <th>الحد الأدنى</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in summary.lowStock || []" :key="row.product_id">
                <td>{{ row.name_ar }}</td>
                <td class="danger-text">{{ fmtQty(row.total_quantity) }}</td>
                <td>{{ row.min_stock }}</td>
              </tr>
              <tr v-if="!(summary.lowStock || []).length">
                <td colspan="3" class="empty">✅ لا توجد تنبيهات</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- ===== P&L TAB ===== -->
    <template v-if="activeTab === 'pl'">
      <div v-if="plLoading" class="loading-state card">⏳ جاري تحميل تقرير الربح والخسارة...</div>
      <div v-else-if="plError" class="error-msg">⚠️ {{ plError }}</div>
      <template v-else-if="plData">
        <!-- ملاحظة طريقة حساب التكلفة -->
        <div v-if="plData.cogs_basis === 'purchases'" class="pl-notice card">
          💡 <strong>ملاحظة:</strong> المبيعات مسجلة كإجمالي يومي بدون تفصيل أصناف، لذا يُستخدم
          <strong>إجمالي المشتريات</strong> كتقريب لتكلفة البضاعة المباعة.
        </div>

        <!-- KPIs الرئيسية -->
        <div class="kpi-grid kpi-grid-4">
          <div class="kpi-card">
            <div class="kpi-icon">🏦</div>
            <div class="kpi-body">
              <div class="kpi-label">رصيد أول المدة</div>
              <div class="kpi-value">{{ formatMoney(plData.opening_balance) }}</div>
              <div class="kpi-sub">الفلوس المتاحة قبل الفترة</div>
            </div>
          </div>
          <div class="kpi-card sales">
            <div class="kpi-icon">💰</div>
            <div class="kpi-body">
              <div class="kpi-label">صافي الإيرادات</div>
              <div class="kpi-value">{{ formatMoney(plData.revenue?.net) }}</div>
              <div class="kpi-sub">
                {{ plData.revenue?.count }} عملية · خصم {{ formatMoney(plData.revenue?.discounts) }}
              </div>
            </div>
          </div>
          <div class="kpi-card" :class="plData.gross_profit?.amount >= 0 ? 'profit' : 'danger'">
            <div class="kpi-icon">📈</div>
            <div class="kpi-body">
              <div class="kpi-label">هامش الربح الإجمالي</div>
              <div class="kpi-value">{{ formatMoney(plData.gross_profit?.amount) }}</div>
              <div class="kpi-sub">{{ plData.gross_profit?.margin }}% من الإيرادات</div>
            </div>
          </div>
          <div class="kpi-card" :class="plData.net_profit?.amount >= 0 ? 'profit' : 'danger'">
            <div class="kpi-icon">{{ plData.net_profit?.amount >= 0 ? '✅' : '⚠️' }}</div>
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
            <div class="kpi-icon">🛒</div>
            <div class="kpi-body">
              <div class="kpi-label">تكلفة البضاعة</div>
              <div class="kpi-value">{{ formatMoney(plData.cogs?.total) }}</div>
              <div class="kpi-sub">{{ plData.purchases?.count }} فاتورة شراء</div>
            </div>
          </div>
          <div class="kpi-card expenses">
            <div class="kpi-icon">💸</div>
            <div class="kpi-body">
              <div class="kpi-label">المصاريف التشغيلية</div>
              <div class="kpi-value">{{ formatMoney(plData.operating_expenses?.total) }}</div>
              <div class="kpi-sub">{{ plData.operating_expenses?.count }} مصروف</div>
            </div>
          </div>
          <div class="kpi-card" :class="plData.cash_flow?.closing >= 0 ? 'profit' : 'danger'">
            <div class="kpi-icon">💵</div>
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
            <h3>📋 قائمة الدخل</h3>
            <div class="pl-row pl-header"><span>البند</span><span>المبلغ</span></div>

            <div class="pl-section-title">الإيرادات</div>
            <div class="pl-row" v-for="(val, type) in plData.revenue?.by_type" :key="type">
              <span class="pl-indent">{{
                { branch: 'مبيعات فرع', wholesale: 'مبيعات جملة', pos: 'POS' }[type] || type
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
            <h3>💵 التدفق النقدي</h3>
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
                <span class="pl-amount deduct"
                  >({{ formatMoney(plData.cash_flow?.purchases) }})</span
                >
              </div>
              <div class="pl-row pl-deduct">
                <span class="pl-indent">- مصاريف تشغيلية</span>
                <span class="pl-amount deduct"
                  >({{ formatMoney(plData.cash_flow?.expenses) }})</span
                >
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
          <h3>📈 الاتجاه الشهري — آخر {{ plTrend.length }} شهور</h3>
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
                      plTrend.reduce((s, r) => s + r.net_profit, 0) >= 0
                        ? 'profit-pos'
                        : 'profit-neg'
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
        <span>📊</span>
        <p>اضغط تحديث لتحميل تقرير الربح والخسارة</p>
        <button class="btn btn-primary" @click="loadTab('pl')">تحميل التقرير</button>
      </div>
    </template>

    <!-- ===== SALES TAB ===== -->
    <template v-if="!loading && activeTab === 'sales'">
      <div class="kpi-grid kpi-grid-3">
        <div class="kpi-card sales">
          <div class="kpi-icon">💰</div>
          <div class="kpi-body">
            <div class="kpi-label">إجمالي المبيعات</div>
            <div class="kpi-value">{{ formatMoney(salesTotal) }}</div>
          </div>
        </div>
        <div class="kpi-card profit">
          <div class="kpi-icon">📈</div>
          <div class="kpi-body">
            <div class="kpi-label">إجمالي الأرباح</div>
            <div class="kpi-value">{{ formatMoney(salesProfit) }}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon">🧾</div>
          <div class="kpi-body">
            <div class="kpi-label">عدد العمليات</div>
            <div class="kpi-value">{{ salesCount }}</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="table-header">
          <h3>📋 تفاصيل المبيعات</h3>
          <div class="type-filter">
            <button :class="{ active: salesFilter === '' }" @click="salesFilter = ''">الكل</button>
            <button :class="{ active: salesFilter === 'branch' }" @click="salesFilter = 'branch'">
              فرع
            </button>
            <button
              :class="{ active: salesFilter === 'wholesale' }"
              @click="salesFilter = 'wholesale'"
            >
              جملة
            </button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>العدد</th>
                <th>المبيعات</th>
                <th>التكلفة</th>
                <th>الربح</th>
                <th>الهامش</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredSalesRows" :key="`${row.date}-${row.sale_type}`">
                <td>{{ row.date }}</td>
                <td>
                  <span :class="['type-badge', row.sale_type]">{{
                    saleTypeLabel(row.sale_type)
                  }}</span>
                </td>
                <td class="center">{{ row.count }}</td>
                <td class="money">{{ formatMoney(row.total || 0) }}</td>
                <td class="money muted">{{ formatMoney(row.cost || 0) }}</td>
                <td class="money" :class="row.profit >= 0 ? 'profit-pos' : 'profit-neg'">
                  {{ formatMoney(row.profit || 0) }}
                </td>
                <td class="center">
                  {{ row.total > 0 ? ((row.profit / row.total) * 100).toFixed(1) : 0 }}%
                </td>
              </tr>
              <tr v-if="!filteredSalesRows.length">
                <td colspan="7" class="empty">لا توجد بيانات مبيعات</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- ===== INVENTORY TAB ===== -->
    <template v-if="!loading && activeTab === 'inventory'">
      <div class="kpi-grid kpi-grid-3">
        <div class="kpi-card inventory">
          <div class="kpi-icon">📦</div>
          <div class="kpi-body">
            <div class="kpi-label">إجمالي المنتجات</div>
            <div class="kpi-value">{{ (reportData.inventory?.products || []).length }}</div>
          </div>
        </div>
        <div class="kpi-card danger">
          <div class="kpi-icon">⚠️</div>
          <div class="kpi-body">
            <div class="kpi-label">منتجات منخفضة</div>
            <div class="kpi-value">{{ lowStockCount }}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon">🏭</div>
          <div class="kpi-body">
            <div class="kpi-label">قيمة المخزون</div>
            <div class="kpi-value">{{ formatMoney(totalInventoryValue) }}</div>
          </div>
        </div>
      </div>
      <div class="grid grid-2 mt-4">
        <div class="card">
          <h3>🏭 قيمة المخزون بالمستودع</h3>
          <table class="report-table">
            <thead>
              <tr>
                <th>المستودع</th>
                <th>المنتجات</th>
                <th>القيمة</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in reportData.inventory?.warehouseValue || []"
                :key="row.warehouse_name"
              >
                <td>{{ row.warehouse_name }}</td>
                <td class="center">{{ row.products_count }}</td>
                <td class="money">{{ formatMoney(row.total_value || 0) }}</td>
              </tr>
              <tr v-if="!(reportData.inventory?.warehouseValue || []).length">
                <td colspan="3" class="empty">لا توجد بيانات</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <h3>⚠️ المنتجات المنخفضة</h3>
          <table class="report-table">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>المخزون</th>
                <th>الحد الأدنى</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in lowStockProducts" :key="row.product_id">
                <td>{{ row.name_ar }}</td>
                <td class="danger-text">{{ fmtQty(row.total_quantity) }}</td>
                <td>{{ row.min_stock }}</td>
              </tr>
              <tr v-if="!lowStockProducts.length">
                <td colspan="3" class="empty">✅ لا توجد تنبيهات</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="card mt-4">
        <h3>📋 كل المنتجات</h3>
        <div class="table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>SKU</th>
                <th>التصنيف</th>
                <th>المخزون</th>
                <th>الحد الأدنى</th>
                <th>سعر الشراء</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in reportData.inventory?.products || []" :key="row.product_id">
                <td>{{ row.name_ar }}</td>
                <td class="mono">{{ row.sku }}</td>
                <td>{{ row.category_name || '—' }}</td>
                <td>{{ fmtQty(row.total_quantity) }}</td>
                <td>{{ row.min_stock }}</td>
                <td class="money">{{ formatMoney(row.purchase_price || 0) }}</td>
                <td>
                  <span :class="['status-badge', row.is_low_stock ? 'danger' : 'success']">{{
                    row.is_low_stock ? 'منخفض' : 'طبيعي'
                  }}</span>
                </td>
              </tr>
              <tr v-if="!(reportData.inventory?.products || []).length">
                <td colspan="7" class="empty">لا توجد بيانات</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- ===== PROFIT TAB ===== -->
    <template v-if="!loading && activeTab === 'profit'">
      <div class="kpi-grid kpi-grid-3">
        <div class="kpi-card profit">
          <div class="kpi-icon">📈</div>
          <div class="kpi-body">
            <div class="kpi-label">إجمالي الإيرادات</div>
            <div class="kpi-value">{{ formatMoney(profitTotalRevenue) }}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon">💼</div>
          <div class="kpi-body">
            <div class="kpi-label">إجمالي التكلفة</div>
            <div class="kpi-value">{{ formatMoney(profitTotalCost) }}</div>
          </div>
        </div>
        <div class="kpi-card" :class="profitTotalNet >= 0 ? 'profit' : 'danger'">
          <div class="kpi-icon">{{ profitTotalNet >= 0 ? '✅' : '❌' }}</div>
          <div class="kpi-body">
            <div class="kpi-label">صافي الربح</div>
            <div class="kpi-value">{{ formatMoney(profitTotalNet) }}</div>
          </div>
        </div>
      </div>
      <div class="grid grid-2 mt-4">
        <div class="card">
          <h3>📊 الأرباح اليومية</h3>
          <div class="table-wrap">
            <table class="report-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الإيراد</th>
                  <th>التكلفة</th>
                  <th>الربح</th>
                  <th>الهامش</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in reportData.profit?.daily || []" :key="row.date">
                  <td>{{ row.date }}</td>
                  <td class="money">{{ formatMoney(row.revenue || 0) }}</td>
                  <td class="money muted">{{ formatMoney(row.cost || 0) }}</td>
                  <td class="money" :class="row.profit >= 0 ? 'profit-pos' : 'profit-neg'">
                    {{ formatMoney(row.profit || 0) }}
                  </td>
                  <td class="center">{{ row.margin_pct || 0 }}%</td>
                </tr>
                <tr v-if="!(reportData.profit?.daily || []).length">
                  <td colspan="5" class="empty">لا توجد بيانات</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <h3>🗂️ الأرباح حسب التصنيف</h3>
          <table class="report-table">
            <thead>
              <tr>
                <th>التصنيف</th>
                <th>المنتجات</th>
                <th>الإيراد</th>
                <th>الربح</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in reportData.profit?.byCategory || []" :key="row.category_name">
                <td>{{ row.category_name || 'بدون تصنيف' }}</td>
                <td class="center">{{ row.products_count }}</td>
                <td class="money">{{ formatMoney(row.total_revenue || 0) }}</td>
                <td class="money" :class="row.net_profit >= 0 ? 'profit-pos' : 'profit-neg'">
                  {{ formatMoney(row.net_profit || 0) }}
                </td>
              </tr>
              <tr v-if="!(reportData.profit?.byCategory || []).length">
                <td colspan="4" class="empty">لا توجد بيانات</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- ===== EXPENSES TAB ===== -->
    <template v-if="!loading && activeTab === 'expenses'">
      <div class="kpi-grid kpi-grid-3">
        <div class="kpi-card expenses">
          <div class="kpi-icon">💸</div>
          <div class="kpi-body">
            <div class="kpi-label">إجمالي المصروفات</div>
            <div class="kpi-value">{{ formatMoney(expensesTotal) }}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon">📂</div>
          <div class="kpi-body">
            <div class="kpi-label">عدد التصنيفات</div>
            <div class="kpi-value">{{ (reportData.expenses?.byCategory || []).length }}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon">🧾</div>
          <div class="kpi-body">
            <div class="kpi-label">عدد المصروفات</div>
            <div class="kpi-value">{{ expensesCount }}</div>
          </div>
        </div>
      </div>
      <div class="grid grid-2 mt-4">
        <div class="card">
          <h3>📂 حسب التصنيف</h3>
          <table class="report-table">
            <thead>
              <tr>
                <th>التصنيف</th>
                <th>العدد</th>
                <th>الإجمالي</th>
                <th>النسبة</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in reportData.expenses?.byCategory || []" :key="row.category">
                <td>{{ row.category }}</td>
                <td class="center">{{ row.count }}</td>
                <td class="money">{{ formatMoney(row.total || 0) }}</td>
                <td class="center">
                  {{ expensesTotal > 0 ? ((row.total / expensesTotal) * 100).toFixed(1) : 0 }}%
                </td>
              </tr>
              <tr v-if="!(reportData.expenses?.byCategory || []).length">
                <td colspan="4" class="empty">لا توجد مصروفات</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <h3>📅 حسب الشهر</h3>
          <table class="report-table">
            <thead>
              <tr>
                <th>الشهر</th>
                <th>العدد</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in reportData.expenses?.monthly || []" :key="row.month">
                <td>{{ row.month }}</td>
                <td class="center">{{ row.count }}</td>
                <td class="money">{{ formatMoney(row.total || 0) }}</td>
              </tr>
              <tr v-if="!(reportData.expenses?.monthly || []).length">
                <td colspan="3" class="empty">لا توجد بيانات</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="card mt-4">
        <h3>🕐 آخر المصروفات</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th>العنوان</th>
              <th>التصنيف</th>
              <th>التاريخ</th>
              <th>المبلغ</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in reportData.expenses?.recent || []"
              :key="`${row.title}-${row.expense_date}`"
            >
              <td>{{ row.title }}</td>
              <td>{{ row.category }}</td>
              <td>{{ row.expense_date }}</td>
              <td class="money">{{ formatMoney(row.amount || 0) }}</td>
            </tr>
            <tr v-if="!(reportData.expenses?.recent || []).length">
              <td colspan="4" class="empty">لا توجد بيانات</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ===== PURCHASES TAB ===== -->
    <template v-if="!loading && activeTab === 'purchases'">
      <div class="kpi-grid kpi-grid-3">
        <div class="kpi-card">
          <div class="kpi-icon">🛒</div>
          <div class="kpi-body">
            <div class="kpi-label">إجمالي المشتريات</div>
            <div class="kpi-value">
              {{ formatMoney(reportData.purchases?.summary?.total_amount || 0) }}
            </div>
            <div class="kpi-sub">
              {{ reportData.purchases?.summary?.invoices_count || 0 }} فاتورة
            </div>
          </div>
        </div>
        <div class="kpi-card profit">
          <div class="kpi-icon">✅</div>
          <div class="kpi-body">
            <div class="kpi-label">المدفوع</div>
            <div class="kpi-value">
              {{ formatMoney(reportData.purchases?.summary?.paid_amount || 0) }}
            </div>
          </div>
        </div>
        <div class="kpi-card danger">
          <div class="kpi-icon">⏳</div>
          <div class="kpi-body">
            <div class="kpi-label">المتبقي</div>
            <div class="kpi-value">
              {{ formatMoney(reportData.purchases?.summary?.unpaid_amount || 0) }}
            </div>
          </div>
        </div>
      </div>
      <div class="grid grid-2 mt-4">
        <div class="card">
          <h3>🏢 حسب المورد</h3>
          <table class="report-table">
            <thead>
              <tr>
                <th>المورد</th>
                <th>الفواتير</th>
                <th>الإجمالي</th>
                <th>المدفوع</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in reportData.purchases?.bySupplier || []" :key="row.supplier_name">
                <td>{{ row.supplier_name }}</td>
                <td class="center">{{ row.invoices_count }}</td>
                <td class="money">{{ formatMoney(row.total_amount || 0) }}</td>
                <td class="money profit-pos">{{ formatMoney(row.paid_amount || 0) }}</td>
              </tr>
              <tr v-if="!(reportData.purchases?.bySupplier || []).length">
                <td colspan="4" class="empty">لا توجد بيانات</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <h3>🕐 آخر الفواتير</h3>
          <table class="report-table">
            <thead>
              <tr>
                <th>الفاتورة</th>
                <th>المورد</th>
                <th>الإجمالي</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in reportData.purchases?.recent || []" :key="row.invoice_number">
                <td class="mono">{{ row.invoice_number }}</td>
                <td>{{ row.supplier_name }}</td>
                <td class="money">{{ formatMoney(row.total_amount || 0) }}</td>
                <td>
                  <span :class="['status-badge', row.status === 'paid' ? 'success' : 'warning']">{{
                    purchaseStatusLabel(row.status)
                  }}</span>
                </td>
              </tr>
              <tr v-if="!(reportData.purchases?.recent || []).length">
                <td colspan="4" class="empty">لا توجد بيانات</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- ===== CUSTOMERS TAB ===== -->
    <template v-if="!loading && activeTab === 'customers'">
      <div class="kpi-grid kpi-grid-3">
        <div class="kpi-card customers">
          <div class="kpi-icon">👥</div>
          <div class="kpi-body">
            <div class="kpi-label">أعلى عميل إنفاقاً</div>
            <div class="kpi-value">
              {{ reportData.customers?.topCustomers?.[0]?.name_ar || '—' }}
            </div>
            <div class="kpi-sub">
              {{ formatMoney(reportData.customers?.topCustomers?.[0]?.total_spent || 0) }}
            </div>
          </div>
        </div>
        <div class="kpi-card danger">
          <div class="kpi-icon">📄</div>
          <div class="kpi-body">
            <div class="kpi-label">فواتير غير مدفوعة</div>
            <div class="kpi-value">{{ (reportData.customers?.unpaidInvoices || []).length }}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon">💳</div>
          <div class="kpi-body">
            <div class="kpi-label">إجمالي مشتريات العملاء</div>
            <div class="kpi-value">{{ formatMoney(customersTotal) }}</div>
          </div>
        </div>
      </div>
      <div class="grid grid-2 mt-4">
        <div class="card">
          <h3>🏆 أعلى العملاء إنفاقاً</h3>
          <table class="report-table">
            <thead>
              <tr>
                <th>العميل</th>
                <th>النوع</th>
                <th>المشتريات</th>
                <th>الإجمالي</th>
                <th>الرصيد</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in reportData.customers?.topCustomers || []" :key="row.name_ar">
                <td>{{ row.name_ar }}</td>
                <td>
                  <span :class="['type-badge', row.customer_type]">{{
                    customerTypeLabel(row.customer_type)
                  }}</span>
                </td>
                <td class="center">{{ row.sales_count }}</td>
                <td class="money">{{ formatMoney(row.total_spent || 0) }}</td>
                <td class="money" :class="row.balance < 0 ? 'profit-neg' : ''">
                  {{ formatMoney(row.balance || 0) }}
                </td>
              </tr>
              <tr v-if="!(reportData.customers?.topCustomers || []).length">
                <td colspan="5" class="empty">لا توجد بيانات</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <h3>⏳ فواتير غير مدفوعة</h3>
          <table class="report-table">
            <thead>
              <tr>
                <th>الفاتورة</th>
                <th>العميل</th>
                <th>المبلغ</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in reportData.customers?.unpaidInvoices || []"
                :key="row.invoice_number"
              >
                <td class="mono">{{ row.invoice_number }}</td>
                <td>{{ row.customer_name || '—' }}</td>
                <td class="money danger-text">{{ formatMoney(row.total_amount || 0) }}</td>
                <td>
                  <span
                    :class="[
                      'status-badge',
                      row.payment_status === 'partial' ? 'warning' : 'danger',
                    ]"
                    >{{ paymentStatusLabel(row.payment_status) }}</span
                  >
                </td>
              </tr>
              <tr v-if="!(reportData.customers?.unpaidInvoices || []).length">
                <td colspan="4" class="empty">✅ لا توجد فواتير معلقة</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { reports as reportsApi, pl as plApi } from '@/api';
import { formatMoney } from '@/utils/currency';

const tabs = [
  { id: 'summary', icon: '🏠', label: 'الملخص العام' },
  { id: 'pl', icon: '📊', label: 'الربح والخسارة' },
  { id: 'sales', icon: '💰', label: 'المبيعات' },
  { id: 'inventory', icon: '📦', label: 'المخزون' },
  { id: 'profit', icon: '📈', label: 'الأرباح' },
  { id: 'expenses', icon: '💸', label: 'المصروفات' },
  { id: 'purchases', icon: '🛒', label: 'المشتريات' },
  { id: 'customers', icon: '👥', label: 'العملاء' },
];

const activeTab = ref('summary');
const loading = ref(false);
const error = ref('');
const summary = ref({});
const salesFilter = ref('');
const reportData = reactive({
  sales: [],
  inventory: {},
  profit: {},
  expenses: {},
  purchases: {},
  customers: {},
});

// ── P&L state ──
const plData = ref(null);
const plTrend = ref([]);
const plLoading = ref(false);
const plError = ref('');

const today = new Date();
const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
const filters = reactive({ from_date: firstOfMonth, to_date: todayStr });

// ── quick date helpers ──
const selectMonth = (event) => {
  const value = event.target.value;
  if (!value) return;
  const [year, month] = value.split('-').map(Number);
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  filters.from_date = fromDate;
  filters.to_date = toDate;
  loadActiveTab();
};

const setQuick = (range) => {
  const now = new Date();
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (range === 'today') {
    filters.from_date = fmt(now);
    filters.to_date = fmt(now);
  } else if (range === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    filters.from_date = fmt(d);
    filters.to_date = fmt(now);
  } else if (range === 'month') {
    filters.from_date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    filters.to_date = fmt(now);
  } else if (range === 'year') {
    filters.from_date = `${now.getFullYear()}-01-01`;
    filters.to_date = fmt(now);
  } else {
    filters.from_date = '';
    filters.to_date = '';
  }
  loadActiveTab();
};

// ── label helpers ──
const saleTypeLabel = (t) => ({ branch: 'فرع', wholesale: 'جملة', pos: 'POS' })[t] || t || '—';
const customerTypeLabel = (t) => ({ retail: 'تجزئة', wholesale: 'جملة' })[t] || t || '—';
const purchaseStatusLabel = (s) =>
  ({ paid: 'مدفوع', pending: 'معلق', partial: 'جزئي' })[s] || s || '—';
const paymentStatusLabel = (s) =>
  ({ unpaid: 'غير مدفوع', partial: 'جزئي', paid: 'مدفوع' })[s] || s || '—';
const fmtQty = (v) => {
  const n = Number(v || 0);
  return n % 1 === 0 ? n.toLocaleString('en-GB') : n.toFixed(2);
};

// ── computed ──
const profitMarginPct = computed(() => {
  const s = Number(summary.value.sales?.total_sales || 0);
  const p = Number(summary.value.sales?.total_profit || 0);
  return s > 0 ? ((p / s) * 100).toFixed(1) : '0.0';
});

const filteredSalesRows = computed(() => {
  const rows = reportData.sales || [];
  return salesFilter.value ? rows.filter((r) => r.sale_type === salesFilter.value) : rows;
});
const salesTotal = computed(() =>
  filteredSalesRows.value.reduce((s, r) => s + Number(r.total || 0), 0),
);
const salesProfit = computed(() =>
  filteredSalesRows.value.reduce((s, r) => s + Number(r.profit || 0), 0),
);
const salesCount = computed(() =>
  filteredSalesRows.value.reduce((s, r) => s + Number(r.count || 0), 0),
);

const lowStockProducts = computed(() =>
  (reportData.inventory?.products || []).filter((p) => p.is_low_stock),
);
const lowStockCount = computed(() => lowStockProducts.value.length);
const totalInventoryValue = computed(() =>
  (reportData.inventory?.warehouseValue || []).reduce((s, r) => s + Number(r.total_value || 0), 0),
);

const profitTotalRevenue = computed(() =>
  (reportData.profit?.daily || []).reduce((s, r) => s + Number(r.revenue || 0), 0),
);
const profitTotalCost = computed(() =>
  (reportData.profit?.daily || []).reduce((s, r) => s + Number(r.cost || 0), 0),
);
const profitTotalNet = computed(() =>
  (reportData.profit?.daily || []).reduce((s, r) => s + Number(r.profit || 0), 0),
);

const expensesTotal = computed(() =>
  (reportData.expenses?.byCategory || []).reduce((s, r) => s + Number(r.total || 0), 0),
);
const expensesCount = computed(() =>
  (reportData.expenses?.byCategory || []).reduce((s, r) => s + Number(r.count || 0), 0),
);

const customersTotal = computed(() =>
  (reportData.customers?.topCustomers || []).reduce((s, r) => s + Number(r.total_spent || 0), 0),
);

// ── data loading ──
const buildParams = () => {
  const p = {};
  if (filters.from_date) p.from_date = filters.from_date;
  if (filters.to_date) p.to_date = filters.to_date;
  return p;
};

const loadTab = async (tabId) => {
  activeTab.value = tabId;
  error.value = '';

  // P&L tab له logic منفصل
  if (tabId === 'pl') {
    plError.value = '';
    plLoading.value = true;
    try {
      const [reportRes, trendRes] = await Promise.all([
        plApi.monthly({ from_date: filters.from_date, to_date: filters.to_date }),
        plApi.trend(6),
      ]);
      plData.value = reportRes?.data || reportRes || null;
      plTrend.value = trendRes?.data || trendRes || [];
    } catch (e) {
      plError.value = e?.message || 'تعذر تحميل تقرير الربح والخسارة';
    } finally {
      plLoading.value = false;
    }
    return;
  }

  loading.value = true;
  try {
    const params = buildParams();
    if (tabId === 'summary') {
      const res = await reportsApi('summary', params);
      summary.value = res?.data || res || {};
    } else {
      const res = await reportsApi(tabId, params);
      reportData[tabId] = res?.data || res || {};
    }
  } catch (e) {
    error.value = e?.message || 'تعذر تحميل التقرير';
  } finally {
    loading.value = false;
  }
};

const loadActiveTab = () => loadTab(activeTab.value);
onMounted(() => loadTab('summary'));
</script>

<style lang="scss" scoped>
.reports-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── P&L Styles ── */
.pl-notice {
  background: color-mix(in srgb, var(--info) 8%, var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--info) 25%, var(--border));
  border-radius: var(--radius-md);
  padding: 12px 16px;
  font-size: 0.88rem;
  color: var(--text-strong);
}

.pl-statement {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-size: 0.88rem;
}

.pl-header {
  display: flex;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--bg);
  border-radius: 8px 8px 0 0;
  font-weight: 800;
  font-size: 0.78rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.pl-section-title {
  font-weight: 800;
  font-size: 0.78rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 10px 10px 4px;
}

.pl-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 10px;
  border-radius: 6px;
  transition: background 0.1s;
  &:hover {
    background: color-mix(in srgb, var(--primary) 4%, transparent);
  }
}

.pl-indent {
  padding-right: 12px;
  color: var(--text);
}
.pl-amount {
  font-weight: 600;
  color: var(--text-strong);
  font-variant-numeric: tabular-nums;
}
.pl-amount.deduct {
  color: var(--danger);
}
.pl-amount.positive {
  color: var(--success);
}
.pl-amount.bold {
  font-weight: 800;
}
.pl-amount.bold-lg {
  font-size: 1.1rem;
  font-weight: 900;
}

.pl-subtotal {
  background: color-mix(in srgb, var(--primary) 5%, var(--bg));
  border-radius: 8px;
  padding: 9px 12px;
  margin: 4px 0;
  &.positive .pl-amount {
    color: var(--success);
  }
  &.negative .pl-amount {
    color: var(--danger);
  }
}

.pl-deduct {
  opacity: 0.85;
}

.pl-net {
  padding: 12px 12px;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 800;
  &.positive {
    background: color-mix(in srgb, var(--success) 10%, var(--bg));
  }
  &.negative {
    background: color-mix(in srgb, var(--danger) 10%, var(--bg));
  }
  .pl-amount {
    font-size: 1.15rem;
  }
}

.pl-divider {
  height: 1px;
  background: var(--border);
  margin: 8px 0;
  &.pl-divider-double {
    height: 3px;
    background: linear-gradient(90deg, var(--border), var(--primary-soft), var(--border));
    margin: 12px 0;
  }
}

.pl-sub-title {
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.expense-bar-row {
  display: grid;
  grid-template-columns: 110px 1fr 90px;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 0.82rem;
}
.expense-label {
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.expense-bar-wrap {
  height: 8px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
}
.expense-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), var(--primary-soft));
  border-radius: 4px;
  transition: width 0.4s ease;
}
.expense-amount {
  text-align: end;
  font-weight: 700;
  color: var(--text-strong);
}

.pl-total-row {
  background: color-mix(in srgb, var(--primary) 6%, var(--bg));
  font-weight: 800;
  td {
    border-top: 2px solid var(--border-strong) !important;
  }
}

/* Header */
.reports-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  .header-title {
    display: flex;
    align-items: center;
    gap: 14px;
    .header-icon {
      font-size: 2.2rem;
    }
    h2 {
      margin: 0;
      font-size: 1.3rem;
      color: var(--primary-dark);
    }
    p {
      margin: 4px 0 0;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
  }
  .header-filters {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    flex-wrap: wrap;
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
      label {
        font-size: 0.75rem;
        color: var(--text-muted);
        font-weight: 700;
      }
      input {
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--bg);
        font-size: 0.88rem;
      }
    }
    .month-picker-group {
      border: none !important;
      background: transparent !important;
      padding: 0 !important;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .month-filter-btn {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-elevated);
      cursor: pointer;
      transition: all 0.2s;
    }
    .month-filter-btn:hover {
      background: var(--bg-hover);
      border-color: var(--primary);
      color: var(--primary);
    }
    .month-picker-overlay {
      position: absolute;
      inset: 0;
      opacity: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }
  }
  .quick-dates {
    display: flex;
    gap: 4px;
    button {
      padding: 7px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-elevated);
      cursor: pointer;
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--text-muted);
      transition: var(--transition);
      &:hover {
        border-color: var(--primary);
        color: var(--primary-dark);
      }
    }
  }
}

/* Tabs */
.report-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  .tab-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    cursor: pointer;
    font-weight: 700;
    font-size: 0.88rem;
    transition: var(--transition);
    .tab-icon {
      font-size: 1rem;
    }
    &:hover {
      border-color: var(--primary-soft);
    }
    &.active {
      background: linear-gradient(135deg, var(--primary), var(--primary-strong));
      color: #fff;
      border-color: transparent;
      box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 35%, transparent);
    }
  }
}

/* KPI Cards */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
  &.kpi-grid-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.kpi-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: var(--transition);
  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md, var(--shadow-sm));
  }
  .kpi-icon {
    font-size: 1.8rem;
    flex-shrink: 0;
  }
  .kpi-label {
    font-size: 0.78rem;
    color: var(--text-muted);
    margin-bottom: 4px;
    font-weight: 600;
  }
  .kpi-value {
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--text-strong);
  }
  .kpi-sub {
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-top: 3px;
  }
  &.sales {
    border-color: color-mix(in srgb, #2e7d4f 30%, var(--border));
    background: color-mix(in srgb, #2e7d4f 4%, var(--bg-card));
  }
  &.profit {
    border-color: color-mix(in srgb, #1d6fa4 30%, var(--border));
    background: color-mix(in srgb, #1d6fa4 4%, var(--bg-card));
  }
  &.expenses {
    border-color: color-mix(in srgb, #b45309 30%, var(--border));
    background: color-mix(in srgb, #b45309 4%, var(--bg-card));
  }
  &.inventory {
    border-color: color-mix(in srgb, #6366f1 30%, var(--border));
    background: color-mix(in srgb, #6366f1 4%, var(--bg-card));
  }
  &.customers {
    border-color: color-mix(in srgb, #0891b2 30%, var(--border));
    background: color-mix(in srgb, #0891b2 4%, var(--bg-card));
  }
  &.danger {
    border-color: color-mix(in srgb, var(--danger) 30%, var(--border));
    background: color-mix(in srgb, var(--danger) 4%, var(--bg-card));
  }
  &.cashflow.positive {
    border-color: color-mix(in srgb, #2e7d4f 30%, var(--border));
  }
  &.cashflow.negative {
    border-color: color-mix(in srgb, var(--danger) 30%, var(--border));
  }
}

/* Tables */
.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  h3 {
    margin: 0;
  }
}
.type-filter {
  display: flex;
  gap: 4px;
  button {
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--bg);
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text-muted);
    transition: var(--transition);
    &.active {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }
  }
}
.table-wrap {
  overflow-x: auto;
}
.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  th {
    background: var(--bg);
    padding: 10px 10px;
    text-align: right;
    font-weight: 700;
    color: var(--text-muted);
    font-size: 0.8rem;
    border-bottom: 2px solid var(--border);
    white-space: nowrap;
  }
  td {
    padding: 10px 10px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  tr:last-child td {
    border-bottom: 0;
  }
  tr:hover td {
    background: color-mix(in srgb, var(--primary) 3%, var(--bg-elevated));
  }
}
.money {
  font-weight: 700;
  white-space: nowrap;
}
.muted {
  color: var(--text-muted);
  font-weight: 400;
}
.center {
  text-align: center;
}
.mono {
  font-family: monospace;
  font-size: 0.82rem;
}
.profit-pos {
  color: #2e7d4f;
}
.profit-neg {
  color: var(--danger);
}
.danger-text {
  color: var(--danger);
  font-weight: 700;
}
.empty {
  text-align: center;
  padding: 24px;
  color: var(--text-muted);
  font-size: 0.88rem;
}

/* Badges */
.type-badge {
  padding: 3px 8px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  &.branch {
    background: rgba(46, 125, 79, 0.12);
    color: #2e7d4f;
  }
  &.wholesale {
    background: rgba(99, 102, 241, 0.12);
    color: #4f46e5;
  }
  &.retail {
    background: rgba(8, 145, 178, 0.12);
    color: #0891b2;
  }
}
.status-badge {
  padding: 3px 8px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  &.success {
    background: rgba(46, 125, 79, 0.12);
    color: #2e7d4f;
  }
  &.warning {
    background: rgba(180, 83, 9, 0.12);
    color: #b45309;
  }
  &.danger {
    background: rgba(180, 35, 24, 0.12);
    color: #b42318;
  }
}

/* Misc */
.mt-4 {
  margin-top: 4px;
}
.loading-state {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
  font-size: 1rem;
}
.error-msg {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
  padding: 10px 14px;
  border-radius: var(--radius-sm);
}

@media (max-width: 1100px) {
  .kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 700px) {
  .kpi-grid,
  .kpi-grid.kpi-grid-3 {
    grid-template-columns: 1fr 1fr;
  }
  .reports-header {
    flex-direction: column;
  }
  .header-filters {
    width: 100%;
  }
}
</style>
