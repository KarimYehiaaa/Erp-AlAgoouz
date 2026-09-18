<template>
  <div class="purchases-expenses-page">
    <!-- Tabs Navigation -->
    <div class="hub-tabs">
      <button
        type="button"
        class="hub-tab"
        :class="{ active: activeTab === 'purchases' }"
        @click="switchTab('purchases')"
      >
        <AppIcon name="purchases" :size="16" />
        <span>فاتورة مشتريات</span>
      </button>
      <button
        type="button"
        class="hub-tab"
        :class="{ active: activeTab === 'orders' }"
        @click="switchTab('orders')"
      >
        <AppIcon name="purchases" :size="16" />
        <span>أوامر الشراء والاستلام</span>
      </button>
      <button
        type="button"
        class="hub-tab"
        :class="{ active: activeTab === 'returns' }"
        @click="switchTab('returns')"
      >
        <AppIcon name="history" :size="16" />
        <span>مرتجعات المشتريات</span>
      </button>
      <button
        type="button"
        class="hub-tab"
        :class="{ active: activeTab === 'expenses' }"
        @click="switchTab('expenses')"
      >
        <AppIcon name="expenses" :size="16" />
        <span>المصروفات العامة</span>
      </button>
      <button
        type="button"
        class="hub-tab"
        :class="{ active: activeTab === 'suppliers' }"
        @click="switchTab('suppliers')"
      >
        <AppIcon name="suppliers" :size="16" />
        <span>الموردين والمديونيات</span>
      </button>
      <button
        type="button"
        class="hub-tab"
        :class="{ active: activeTab === 'partners' }"
        @click="switchTab('partners')"
      >
        <AppIcon name="money" :size="16" />
        <span>جاري ومسحوبات الشركاء</span>
      </button>
    </div>

    <!-- ==============================================
         TAB CONTENT (wrapped in transition)
         ============================================== -->
    <Transition name="hub-fade" mode="out-in">
      <div :key="activeTab">
        <!-- ==============================================
             1. PURCHASES TAB
             ============================================== -->
        <div v-if="activeTab === 'purchases'" class="tab-content">
          <Teleport to="body" :disabled="!editingInvoiceId">
            <div
              :class="{ 'modal-overlay': editingInvoiceId }"
              @click.self="editingInvoiceId ? cancelPurchaseEdit() : null"
            >
              <div class="card form-card" :class="{ 'modal-card': editingInvoiceId }">
                <h3>{{ editingInvoiceId ? 'تعديل فاتورة مشتريات' : 'إدخال فاتورة مشتريات' }}</h3>

                <div class="invoice-meta-panel grid grid-3">
                  <div class="form-group">
                    <label>تاريخ الفاتورة</label>
                    <input v-model="purchaseForm.invoice_date" type="date" class="field-like" />
                  </div>
                  <div class="form-group">
                    <label>المورد</label>
                    <select v-model.number="purchaseForm.supplier_id" class="field-like">
                      <option :value="null">— بدون مورد —</option>
                      <option v-for="s in suppliersList" :key="s.id" :value="s.id">
                        {{ s.name_ar }}
                      </option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>ملاحظات الفاتورة</label>
                    <input
                      v-model="purchaseForm.notes"
                      class="field-like"
                      placeholder="ملاحظات إضافية..."
                    />
                  </div>
                </div>

                <table class="items-table">
                  <thead>
                    <tr>
                      <th>المنتج</th>
                      <th>المخزن</th>
                      <th>الوحدة</th>
                      <th style="width: 120px">الكمية</th>
                      <th style="width: 140px">السعر</th>
                      <th style="width: 150px">الإجمالي</th>
                      <th style="width: 50px">حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(item, i) in purchaseForm.items" :key="i">
                      <td>
                        <select
                          v-model.number="item.product_id"
                          class="field-like"
                          @change="onProductChange(item)"
                        >
                          <option :value="null">اختر المنتج</option>
                          <option v-for="p in products" :key="p.id" :value="p.id">
                            {{ p.name_ar }} ({{ unitLabel(p.unit) }})
                          </option>
                        </select>
                      </td>
                      <td>
                        <span class="warehouse-chip" :class="{ missing: !item.warehouse_name }">
                          {{ item.warehouse_name || 'حدد المنتج' }}
                        </span>
                      </td>
                      <td>
                        <select v-model="item.unit" class="field-like">
                          <option v-for="u in unitNames(item.unit)" :key="u" :value="u">
                            {{ unitLabel(u) }}
                          </option>
                        </select>
                      </td>
                      <td>
                        <input
                          v-model="item.quantity"
                          class="field-like"
                          type="text"
                          inputmode="decimal"
                          style="text-align: center"
                        />
                      </td>
                      <td>
                        <input
                          v-model="item.unit_price"
                          class="field-like"
                          type="text"
                          inputmode="decimal"
                          style="text-align: center"
                        />
                      </td>
                      <td class="amount-cell">
                        {{ formatMoney(toDecimal(item.quantity) * toDecimal(item.unit_price)) }}
                      </td>
                      <td>
                        <button
                          type="button"
                          class="icon-btn danger"
                          @click="removePurchaseItem(i)"
                          :disabled="purchaseForm.items.length === 1"
                          title="حذف هذا الصنف"
                        >
                          <AppIcon name="delete" :size="16" />
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div class="invoice-summary-bar">
                  <button type="button" class="btn btn-outline" @click="addPurchaseItem">
                    <AppIcon name="plus" :size="16" />
                    <span>إضافة صنف</span>
                  </button>
                  <div class="invoice-total-badge">
                    <span class="total-label">إجمالي الفاتورة:</span>
                    <span class="total-value">{{ formatMoney(purchaseTotalAmount) }}</span>
                  </div>
                </div>

                <div class="actions">
                  <button
                    class="btn btn-primary"
                    :disabled="purchasesSaving"
                    @click="savePurchaseInvoice"
                  >
                    {{
                      purchasesSaving
                        ? 'جاري الحفظ...'
                        : editingInvoiceId
                          ? 'حفظ التعديل'
                          : 'حفظ الفاتورة'
                    }}
                  </button>
                  <button
                    v-if="editingInvoiceId"
                    type="button"
                    class="btn btn-outline"
                    :disabled="purchasesSaving"
                    @click="cancelPurchaseEdit"
                  >
                    إلغاء التعديل
                  </button>
                </div>

                <p v-if="purchasesMsg" :class="['msg', purchasesErr ? 'err' : 'ok']">
                  {{ purchasesMsg }}
                </p>
              </div>
            </div>
          </Teleport>

          <div class="card">
            <div class="card-header-row">
              <h3>آخر فواتير المشتريات</h3>
              <div class="purchases-filters">
                <div class="filter-group">
                  <label>من</label>
                  <input
                    v-model="purchasesFilters.from_date"
                    type="date"
                    @change="loadPurchasesOnly"
                  />
                </div>
                <div class="filter-group">
                  <label>إلى</label>
                  <input
                    v-model="purchasesFilters.to_date"
                    type="date"
                    @change="loadPurchasesOnly"
                  />
                </div>
                <div class="month-filter-btn" title="اختر الشهر بالكامل">
                  <AppIcon name="calendar" :size="18" />
                  <input type="month" class="month-picker-overlay" @change="selectPurchasesMonth" />
                </div>
              </div>
            </div>

            <!-- Quick Dashboard for Selected Period Purchases -->
            <div class="grid grid-2" style="margin-bottom: 20px">
              <StatCard
                label="إجمالي قيمة مشتريات الفترة"
                :value="periodPurchasesTotal"
                icon="money"
              />
              <StatCard
                label="عدد فواتير المشتريات بالفترة"
                :value="periodPurchasesCount"
                icon="receipt"
                format="number"
              />
            </div>

            <table class="items-table">
              <thead>
                <tr>
                  <th>رقم الفاتورة</th>
                  <th>التاريخ</th>
                  <th>المورد</th>
                  <th>المخزن</th>
                  <th>الإجمالي</th>
                  <th>بنود</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loadingPurchases" v-for="i in 3" :key="'p-sk-' + i">
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 70px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 120px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 90px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 60px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 30px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 50px"></div></td>
                </tr>
                <tr v-else v-for="inv in invoices" :key="inv.id">
                  <td>{{ inv.invoice_number }}</td>
                  <td>{{ inv.invoice_date }}</td>
                  <td>{{ inv.supplier_name || '—' }}</td>
                  <td>{{ inv.warehouse_name }}</td>
                  <td>{{ formatMoney(inv.total_amount) }}</td>
                  <td>{{ inv.items?.length || 0 }}</td>
                  <td>
                    <button
                      v-permission="'inventory.edit'"
                      type="button"
                      class="icon-btn warning"
                      @click="openReturnModal(inv)"
                      title="تسجيل مرتجع مشتريات (إشعار خصم)"
                    >
                      <AppIcon name="history" :size="16" />
                    </button>
                    <button
                      v-permission="'inventory.edit'"
                      type="button"
                      class="icon-btn"
                      @click="editInvoice(inv)"
                      :disabled="purchasesSaving"
                      title="تعديل"
                    >
                      <AppIcon name="edit" :size="16" />
                    </button>
                    <button
                      v-permission="'inventory.delete'"
                      type="button"
                      class="icon-btn danger"
                      @click="deleteInvoice(inv.id, inv.invoice_number)"
                      :disabled="purchasesSaving"
                      title="حذف"
                    >
                      <AppIcon name="delete" :size="16" />
                    </button>
                  </td>
                </tr>
                <tr v-if="!loadingPurchases && !invoices.length">
                  <td colspan="7">لا توجد بيانات</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ==============================================
             1.5 PURCHASE ORDERS & RECEIVING TAB
             ============================================== -->
        <div v-else-if="activeTab === 'orders'" class="tab-content">
          <div class="card">
            <div class="card-header-row mb-4">
              <div>
                <h3>أوامر الشراء والاستلام المخزني (Purchase Orders & GRN)</h3>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin: 4px 0 0">
                  تخطيط المشتريات، اعتماد الطلبات، استلام البضائع، والتحويل المباشر لفواتير مرحلة
                  دفترياً
                </p>
              </div>
              <div class="purchases-filters">
                <div class="filter-group">
                  <label>الحالة</label>
                  <select v-model="ordersFilterStatus" @change="loadOrdersOnly" class="field-like">
                    <option value="">كل الحالات</option>
                    <option value="draft">مسودة (Draft)</option>
                    <option value="approved">معتمد (Approved)</option>
                    <option value="partially_received">مستلم جزئياً</option>
                    <option value="received">مستلم بالكامل</option>
                    <option value="cancelled">ملغي</option>
                  </select>
                </div>
                <button type="button" class="btn btn-primary" @click="openNewPoModal">
                  <AppIcon name="plus" :size="16" />
                  <span>+ أمر شراء جديد</span>
                </button>
              </div>
            </div>

            <!-- Table of Purchase Orders -->
            <div class="table-container">
              <table class="items-table">
                <thead>
                  <tr>
                    <th>رقم الأمر</th>
                    <th>المورد</th>
                    <th>المخزن</th>
                    <th>تاريخ الطلب</th>
                    <th>تاريخ التوقع</th>
                    <th>الإجمالي</th>
                    <th>الحالة</th>
                    <th>البنود المستلمة</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="loadingOrders">
                    <td
                      colspan="9"
                      style="text-align: center; padding: 24px; color: var(--text-muted)"
                    >
                      ⏳ جاري تحميل أوامر الشراء...
                    </td>
                  </tr>
                  <tr v-else-if="!purchaseOrdersList.length">
                    <td
                      colspan="9"
                      style="text-align: center; padding: 24px; color: var(--text-muted)"
                    >
                      لا توجد أوامر شراء مسجلة حالياً
                    </td>
                  </tr>
                  <tr v-else v-for="po in purchaseOrdersList" :key="po.id">
                    <td>
                      <strong>{{ po.po_number }}</strong>
                    </td>
                    <td>{{ po.supplier_name || '—' }}</td>
                    <td>{{ po.warehouse_name || '—' }}</td>
                    <td>{{ po.order_date }}</td>
                    <td>{{ po.expected_date || '—' }}</td>
                    <td class="num-cell" style="font-weight: bold; color: var(--primary)">
                      {{ formatMoney(po.total_amount) }}
                    </td>
                    <td>
                      <span class="type-pill" :class="getPoStatusClass(po.status)">
                        {{ getPoStatusLabel(po.status) }}
                      </span>
                    </td>
                    <td>
                      {{ getPoReceivedSummary(po) }}
                    </td>
                    <td>
                      <div style="display: flex; gap: 6px; align-items: center">
                        <button
                          v-if="po.status === 'draft'"
                          type="button"
                          class="btn btn-sm btn-primary"
                          @click="approveOrder(po.id)"
                          title="اعتماد أمر الشراء"
                        >
                          اعتماد
                        </button>
                        <button
                          v-if="po.status === 'approved' || po.status === 'partially_received'"
                          type="button"
                          class="btn btn-sm btn-success"
                          @click="openReceiveModal(po)"
                          title="تسجيل استلام بضاعة"
                        >
                          استلام
                        </button>
                        <button
                          v-if="po.status === 'draft' || po.status === 'approved'"
                          type="button"
                          class="btn btn-sm btn-outline danger"
                          @click="cancelOrder(po.id)"
                          title="إلغاء أمر الشراء"
                        >
                          إلغاء
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ==============================================
             2. PURCHASE RETURNS TAB
             ============================================== -->
        <div v-else-if="activeTab === 'returns'" class="tab-content">
          <div class="card">
            <div class="card-header-row">
              <div>
                <h3>مرتجعات المشتريات وإشعارات الخصم (Debit Notes)</h3>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin: 4px 0 0">
                  إدارة المرتجعات للموردين مع الخصم التلقائي من المخزون والترحيل المحاسبي
                </p>
              </div>
              <div class="purchases-filters">
                <div class="filter-group">
                  <label>من</label>
                  <input v-model="returnsFilters.from_date" type="date" @change="loadReturnsOnly" />
                </div>
                <div class="filter-group">
                  <label>إلى</label>
                  <input v-model="returnsFilters.to_date" type="date" @change="loadReturnsOnly" />
                </div>
                <div class="month-filter-btn" title="اختر الشهر بالكامل">
                  <AppIcon name="calendar" :size="18" />
                  <input type="month" class="month-picker-overlay" @change="selectReturnsMonth" />
                </div>
                <button
                  v-permission="'inventory.edit'"
                  type="button"
                  class="btn btn-primary"
                  @click="openReturnModal()"
                >
                  <AppIcon name="plus" :size="16" />
                  <span>تسجيل مرتجع مشتريات</span>
                </button>
              </div>
            </div>

            <!-- Quick Stats for Returns -->
            <div class="grid grid-2" style="margin-bottom: 20px">
              <StatCard
                label="إجمالي قيمة المرتجعات للفترة"
                :value="periodReturnsTotal"
                icon="money"
              />
              <StatCard
                label="عدد إشعارات الخصم والمرتجعات"
                :value="periodReturnsCount"
                icon="history"
                format="number"
              />
            </div>

            <div
              v-if="returnsMsg"
              :class="['notice', returnsErr ? 'error' : 'success']"
              style="margin-bottom: 16px"
            >
              {{ returnsMsg }}
            </div>

            <table class="items-table">
              <thead>
                <tr>
                  <th>رقم المرتجع</th>
                  <th>تاريخ المرتجع</th>
                  <th>فاتورة الشراء الأصلية</th>
                  <th>المورد</th>
                  <th>المخزن</th>
                  <th>المبلغ المسترد</th>
                  <th>عدد البنود</th>
                  <th>ملاحظات</th>
                  <th style="width: 70px"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loadingReturns" v-for="i in 3" :key="'r-sk-' + i">
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 120px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 30px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 100px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 40px"></div></td>
                </tr>
                <tr v-else v-for="ret in returnsList" :key="ret.id">
                  <td>
                    <strong>{{ ret.return_number }}</strong>
                  </td>
                  <td>{{ String(ret.return_date || '').slice(0, 10) }}</td>
                  <td>
                    <code>{{
                      ret.purchase_invoice_number || 'PUR-' + ret.purchase_invoice_id
                    }}</code>
                  </td>
                  <td>{{ ret.supplier_name || '—' }}</td>
                  <td>{{ ret.warehouse_name || '—' }}</td>
                  <td
                    class="text-danger"
                    style="font-weight: 700; direction: ltr; text-align: left"
                  >
                    {{ formatMoney(ret.total_amount) }}
                  </td>
                  <td>{{ ret.items_count || ret.items?.length || 0 }}</td>
                  <td
                    class="text-muted"
                    style="
                      max-width: 180px;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      white-space: nowrap;
                    "
                  >
                    {{ ret.notes || ret.reason || '—' }}
                  </td>
                  <td>
                    <button
                      type="button"
                      class="icon-btn"
                      @click="viewReturnDetail(ret)"
                      title="عرض التفاصيل والقيد"
                    >
                      <AppIcon name="eye" :size="16" />
                    </button>
                  </td>
                </tr>
                <tr v-if="!loadingReturns && !returnsList.length">
                  <td
                    colspan="9"
                    style="text-align: center; padding: 24px; color: var(--text-muted)"
                  >
                    لا توجد مرتجعات مشتريات مسجلة في هذه الفترة
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ==============================================
         3. EXPENSES TAB
         ============================================== -->
        <div v-else-if="activeTab === 'expenses' && canManageExpenses" class="tab-content">
          <div class="card-header-row mb-4">
            <div class="purchases-filters">
              <div class="filter-group">
                <label>من تاريخ</label>
                <input v-model="expensesFilters.from_date" type="date" @change="loadExpensesOnly" />
              </div>
              <div class="filter-group">
                <label>إلى تاريخ</label>
                <input v-model="expensesFilters.to_date" type="date" @change="loadExpensesOnly" />
              </div>
              <div class="month-filter-btn" title="اختر الشهر بالكامل">
                <AppIcon name="calendar" :size="18" />
                <input type="month" class="month-picker-overlay" @change="selectExpensesMonth" />
              </div>
            </div>
            <div class="actions" style="margin-bottom: 20px">
              <button
                v-permission="'expenses.add'"
                class="btn btn-primary"
                @click="openExpenseCreate"
              >
                + مصروف جديد
              </button>
            </div>
          </div>

          <!-- Expenses Summary Stat Cards -->
          <div class="grid grid-4" style="gap: 16px; margin-bottom: 20px">
            <StatCard
              label="إجمالي المصروفات"
              :value="formatMoney(periodExpensesTotal)"
              icon="cash"
              format="currency"
            />
            <StatCard
              label="المصروفات الثابتة (إيجار/مرتبات/كهرباء)"
              :value="formatMoney(periodFixedExpensesTotal)"
              icon="building"
              format="currency"
            />
            <StatCard
              label="المصروفات المتغيرة والتشغيلية"
              :value="formatMoney(periodVariableExpensesTotal)"
              icon="wallet"
              format="currency"
            />
            <StatCard
              label="عدد بنود المصروفات بالفترة"
              :value="periodExpensesCount"
              icon="receipt"
              format="number"
            />
          </div>

          <!-- Filter Tabs by Expense Nature -->
          <div class="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div class="hub-tabs">
              <button
                type="button"
                class="hub-tab"
                :class="{ active: expenseTypeFilter === 'all' }"
                @click="expenseTypeFilter = 'all'"
              >
                <AppIcon name="receipt" :size="16" /> كافة المصروفات ({{ expensesList.length }})
              </button>
              <button
                type="button"
                class="hub-tab"
                :class="{ active: expenseTypeFilter === 'fixed' }"
                @click="expenseTypeFilter = 'fixed'"
              >
                <AppIcon name="building" :size="16" /> المصروفات الثابتة ({{
                  periodFixedExpensesTotal ? formatMoney(periodFixedExpensesTotal) : '0'
                }})
              </button>
              <button
                type="button"
                class="hub-tab"
                :class="{ active: expenseTypeFilter === 'variable' }"
                @click="expenseTypeFilter = 'variable'"
              >
                <AppIcon name="zap" :size="16" /> المصروفات المتغيرة ({{
                  periodVariableExpensesTotal ? formatMoney(periodVariableExpensesTotal) : '0'
                }})
              </button>
            </div>
          </div>

          <div class="card table-wrap">
            <table class="items-table">
              <thead>
                <tr>
                  <th>البند</th>
                  <th>التصنيف</th>
                  <th>النوع</th>
                  <th>المبلغ</th>
                  <th>التاريخ</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loadingExpenses" v-for="i in 3" :key="'e-sk-' + i">
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 140px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 100px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 60px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
                  <td><div class="skeleton-shimmer" style="height: 18px; width: 50px"></div></td>
                </tr>
                <tr v-else v-for="e in filteredExpensesList" :key="e.id">
                  <td style="font-weight: 700">{{ e.title }}</td>
                  <td>{{ e.category_name }}</td>
                  <td>
                    <span
                      v-if="e.is_fixed"
                      class="badge badge-info"
                      style="font-size: 0.75rem; padding: 3px 8px"
                    >
                      <AppIcon name="building" :size="12" /> ثابت
                    </span>
                    <span
                      v-else
                      class="badge badge-neutral"
                      style="font-size: 0.75rem; padding: 3px 8px"
                    >
                      <AppIcon name="zap" :size="12" /> متغير
                    </span>
                  </td>
                  <td style="font-weight: 800; color: var(--accent)">
                    {{ formatMoney(e.amount) }}
                  </td>
                  <td>{{ e.expense_date }}</td>
                  <td class="actions">
                    <button
                      v-permission="'expenses.edit'"
                      type="button"
                      class="icon-btn"
                      @click="openExpenseEdit(e)"
                      title="تعديل"
                    >
                      <AppIcon name="edit" :size="16" />
                    </button>
                    <button
                      v-permission="'expenses.delete'"
                      type="button"
                      class="icon-btn danger"
                      @click="removeExpense(e)"
                      title="حذف"
                    >
                      <AppIcon name="delete" :size="16" />
                    </button>
                  </td>
                </tr>
                <tr v-if="!loadingExpenses && !expensesList.length">
                  <td colspan="6">لا توجد مصروفات مسجلة</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Expense Modal Form -->
          <div v-if="showExpenseForm" class="modal-overlay" @click.self="showExpenseForm = false">
            <div class="card modal-card" style="width: min(500px, 90vw); margin-inline: auto">
              <h3>{{ expenseForm.id ? 'تعديل' : 'إضافة' }} مصروف</h3>
              <form @submit.prevent="saveExpense">
                <div class="form-group" style="margin-bottom: 12px">
                  <label>البند</label>
                  <input
                    v-model="expenseForm.title"
                    class="field-like"
                    placeholder="مثال: إيجار المحل، فاتورة كهرباء، شراء أدوات..."
                    required
                    @blur="suggestExpenseCategory"
                  />
                </div>
                <div class="form-group" style="margin-bottom: 12px">
                  <label>التصنيف</label>
                  <select
                    v-model="expenseForm.category_id"
                    class="field-like"
                    @change="onExpenseCategoryChange"
                  >
                    <option v-for="c in expenseCategories" :key="c.id" :value="c.id">
                      {{ c.name_ar }}
                    </option>
                  </select>
                </div>
                <div class="form-group" style="margin-bottom: 12px">
                  <label
                    style="
                      display: flex;
                      align-items: center;
                      justify-content: space-between;
                      font-weight: 700;
                    "
                  >
                    <span>طبيعة المصروف</span>
                    <span
                      v-if="expenseForm.is_fixed"
                      style="color: var(--info); font-size: 0.78rem; font-weight: 800"
                    >
                      مصروف ثابت (Overhead)</span
                    >
                    <span
                      v-else
                      style="color: var(--text-muted); font-size: 0.78rem; font-weight: 700"
                    >
                      مصروف متغير / تشغيلي</span
                    >
                  </label>
                  <select v-model="expenseForm.is_fixed" class="field-like">
                    <option :value="false">
                      مصروف متغير / تشغيلي (ضيافة، صيانة طارئة، نقل...)
                    </option>
                    <option :value="true">
                      مصروف ثابت / شهري (إيجار، مرتبات، كهرباء، مرافق...)
                    </option>
                  </select>
                </div>
                <div class="form-group" style="margin-bottom: 12px">
                  <label>المبلغ</label>
                  <input
                    v-model.number="expenseForm.amount"
                    class="field-like"
                    type="number"
                    step="0.01"
                    required
                  />
                </div>
                <div class="form-group" style="margin-bottom: 16px">
                  <label>تاريخ المصروف</label>
                  <input v-model="expenseForm.expense_date" class="field-like" type="date" />
                </div>
                <div class="actions">
                  <button type="submit" class="btn btn-primary" :disabled="expensesSaving">
                    {{ expensesSaving ? 'جاري الحفظ...' : 'حفظ' }}
                  </button>
                  <button type="button" class="btn btn-outline" @click="showExpenseForm = false">
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <!-- ==============================================
         3. SUPPLIERS TAB
         ============================================== -->
        <div v-else-if="activeTab === 'suppliers'" class="tab-view-container">
          <SuppliersView />
        </div>

        <!-- ==============================================
         4. PARTNERS TAB
         ============================================== -->
        <div v-else-if="activeTab === 'partners'" class="tab-view-container">
          <PartnersView />
        </div>
      </div>
    </Transition>

    <!-- ==============================================
         MODAL: CREATE PURCHASE RETURN
         ============================================== -->
    <Teleport to="body">
      <div v-if="showReturnModal" class="modal-overlay" @click.self="closeReturnModal">
        <div class="card modal-card">
          <div class="card-header-row">
            <div>
              <h3>تسجيل مرتجع مشتريات (إشعار خصم)</h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin: 4px 0 0">
                سيتم خصم الكميات من المخزون تلقائياً وتخفيض مديونية المورد وتوليد قيد اليومية العكسي
              </p>
            </div>
            <button type="button" class="icon-btn" @click="closeReturnModal">✕</button>
          </div>

          <form @submit.prevent="submitPurchaseReturn">
            <div class="invoice-meta-panel grid grid-3">
              <div class="form-group">
                <label>فاتورة الشراء الأصلية *</label>
                <select
                  v-model.number="returnForm.purchase_invoice_id"
                  class="field-like"
                  :disabled="!!selectedInvoiceForReturn"
                  required
                  @change="onReturnInvoiceChange"
                >
                  <option :value="null">— اختر فاتورة الشراء المراد إرجاعها —</option>
                  <option v-for="inv in invoices" :key="inv.id" :value="inv.id">
                    {{ inv.invoice_number }} — {{ inv.supplier_name || 'بدون مورد' }} ({{
                      formatMoney(inv.total_amount)
                    }})
                  </option>
                </select>
              </div>

              <div class="form-group">
                <label>تاريخ المرتجع *</label>
                <input v-model="returnForm.return_date" type="date" class="field-like" required />
              </div>

              <div class="form-group">
                <label>سبب الإرجاع / ملاحظات</label>
                <input
                  v-model="returnForm.notes"
                  type="text"
                  class="field-like"
                  placeholder="مثال: تلف جزء من البضاعة / عيوب جودة..."
                />
              </div>
            </div>

            <div v-if="returnFormItems.length" style="margin-bottom: 20px">
              <h4 style="margin-bottom: 12px; font-size: 0.95rem">
                بنود الفاتورة والكميات المراد إرجاعها:
              </h4>
              <table class="items-table">
                <thead>
                  <tr>
                    <th>المنتج</th>
                    <th>الوحدة</th>
                    <th style="width: 110px">الكمية بالفاتورة</th>
                    <th style="width: 120px">سعر الوحدة</th>
                    <th style="width: 140px">الكمية المرتجعة *</th>
                    <th style="width: 140px">المبلغ المسترد</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, idx) in returnFormItems" :key="idx">
                    <td>
                      <strong>{{ item.product_name }}</strong>
                    </td>
                    <td>{{ unitLabel(item.unit) }}</td>
                    <td>{{ item.invoiced_qty }}</td>
                    <td style="direction: ltr; text-align: left">
                      {{ formatMoney(item.unit_price) }}
                    </td>
                    <td>
                      <input
                        v-model.number="item.return_qty"
                        type="number"
                        step="0.01"
                        min="0"
                        :max="item.invoiced_qty"
                        class="field-like"
                        style="direction: ltr; font-weight: bold"
                        placeholder="0"
                      />
                    </td>
                    <td
                      style="
                        direction: ltr;
                        text-align: left;
                        font-weight: 700;
                        color: var(--danger);
                      "
                    >
                      {{
                        formatMoney((Number(item.return_qty) || 0) * (Number(item.unit_price) || 0))
                      }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div
              v-else-if="returnForm.purchase_invoice_id"
              class="card"
              style="text-align: center; padding: 20px; color: var(--text-muted)"
            >
              لا توجد بنود متاحة للإرجاع في هذه الفاتورة
            </div>

            <div class="invoice-summary-bar">
              <div
                class="invoice-total-badge"
                style="
                  border-color: var(--danger);
                  background: color-mix(in srgb, var(--danger) 8%, var(--bg-elevated));
                "
              >
                <span class="total-label">إجمالي قيمة المرتجع:</span>
                <span class="total-value" style="color: var(--danger)">{{
                  formatMoney(totalReturnCalculated)
                }}</span>
              </div>
              <div class="actions">
                <button
                  type="submit"
                  class="btn btn-primary"
                  :disabled="returnSubmitting || totalReturnCalculated <= 0"
                >
                  {{ returnSubmitting ? 'جاري تسجيل المرتجع...' : 'تأكيد وترحيل المرتجع' }}
                </button>
                <button type="button" class="btn btn-outline" @click="closeReturnModal">
                  إلغاء
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- ==============================================
         MODAL: VIEW RETURN DETAILS
         ============================================== -->
    <Teleport to="body">
      <div
        v-if="showReturnDetailModal"
        class="modal-overlay"
        @click.self="showReturnDetailModal = false"
      >
        <div class="card modal-card">
          <div class="card-header-row">
            <div>
              <h3>
                تفاصيل مرتجع مشتريات <code>{{ selectedReturnDetail?.return_number }}</code>
              </h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin: 4px 0 0">
                تاريخ: {{ String(selectedReturnDetail?.return_date || '').slice(0, 10) }} | المورد:
                {{ selectedReturnDetail?.supplier_name || 'بدون مورد' }}
              </p>
            </div>
            <button type="button" class="icon-btn" @click="showReturnDetailModal = false">✕</button>
          </div>

          <div class="invoice-meta-panel grid grid-3" style="margin-bottom: 16px">
            <div>
              <strong>فاتورة الشراء الأصلية:</strong>
              {{
                selectedReturnDetail?.purchase_invoice_number ||
                'PUR-' + selectedReturnDetail?.purchase_invoice_id
              }}
            </div>
            <div>
              <strong>المخزن:</strong>
              {{ selectedReturnDetail?.warehouse_name || 'المخزن الرئيسي' }}
            </div>
            <div>
              <strong>إجمالي القيمة المستردة:</strong>
              <span style="color: var(--danger); font-weight: bold">{{
                formatMoney(selectedReturnDetail?.total_amount)
              }}</span>
            </div>
            <div style="grid-column: span 3" v-if="selectedReturnDetail?.notes">
              <strong>ملاحظات:</strong> {{ selectedReturnDetail.notes }}
            </div>
          </div>

          <table class="items-table" style="margin-bottom: 20px">
            <thead>
              <tr>
                <th>الصنف</th>
                <th>الوحدة</th>
                <th>الكمية المرتجعة</th>
                <th>سعر الوحدة</th>
                <th>المبلغ الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in selectedReturnDetail?.items || []" :key="item.id">
                <td>{{ item.product_name }}</td>
                <td>{{ unitLabel(item.unit) }}</td>
                <td>
                  <strong>{{ item.quantity }}</strong>
                </td>
                <td style="direction: ltr; text-align: left">{{ formatMoney(item.unit_price) }}</td>
                <td
                  style="direction: ltr; text-align: left; font-weight: bold; color: var(--danger)"
                >
                  {{ formatMoney(item.total_amount) }}
                </td>
              </tr>
            </tbody>
          </table>

          <div class="actions" style="justify-content: flex-end">
            <button type="button" class="btn btn-outline" @click="showReturnDetailModal = false">
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ==============================================
         MODAL: CREATE PURCHASE ORDER
         ============================================== -->
    <Teleport to="body">
      <div v-if="showNewPoModal" class="modal-overlay" @click.self="showNewPoModal = false">
        <div class="card modal-card" style="max-width: 800px; width: 95%">
          <div class="card-header-row">
            <div>
              <h3>إنشاء أمر شراء جديد (Purchase Order)</h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin: 4px 0 0">
                تسجيل طلب شراء تخطيطي لاعتماده واستلام بضائعه لاحقاً
              </p>
            </div>
            <button type="button" class="icon-btn" @click="showNewPoModal = false">✕</button>
          </div>

          <form @submit.prevent="submitCreatePo">
            <div class="invoice-meta-panel grid grid-3 mb-3">
              <div class="form-group">
                <label>المورد</label>
                <select v-model.number="newPoForm.supplier_id" class="field-like">
                  <option :value="null">— بدون مورد محدد —</option>
                  <option v-for="s in suppliersList" :key="s.id" :value="s.id">
                    {{ s.name_ar }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>تاريخ الطلب</label>
                <input v-model="newPoForm.order_date" type="date" class="field-like" required />
              </div>
              <div class="form-group">
                <label>تاريخ التوريد المتوقع</label>
                <input v-model="newPoForm.expected_date" type="date" class="field-like" />
              </div>
            </div>

            <div class="form-group mb-3">
              <label>ملاحظات أمر الشراء</label>
              <input
                v-model="newPoForm.notes"
                type="text"
                class="field-like"
                placeholder="ملاحظات توضيحية..."
              />
            </div>

            <div class="table-container mb-3">
              <table class="items-table">
                <thead>
                  <tr>
                    <th style="width: 40%">المنتج</th>
                    <th style="width: 20%">الكمية</th>
                    <th style="width: 20%">سعر الوحدة المتوقع</th>
                    <th style="width: 15%">الإجمالي</th>
                    <th style="width: 5%">حذف</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(it, idx) in newPoForm.items" :key="idx">
                    <td>
                      <select v-model.number="it.product_id" class="field-like" required>
                        <option :value="null">— اختر المنتج —</option>
                        <option v-for="p in products" :key="p.id" :value="p.id">
                          {{ p.name_ar }} ({{ unitLabel(p.unit) }})
                        </option>
                      </select>
                    </td>
                    <td>
                      <input
                        v-model.number="it.quantity"
                        type="number"
                        step="0.01"
                        min="0.01"
                        class="field-like num-cell"
                        required
                      />
                    </td>
                    <td>
                      <input
                        v-model.number="it.unit_price"
                        type="number"
                        step="0.01"
                        min="0"
                        class="field-like num-cell"
                        required
                      />
                    </td>
                    <td class="num-cell font-bold">
                      {{ formatMoney((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)) }}
                    </td>
                    <td>
                      <button
                        type="button"
                        class="icon-btn danger"
                        :disabled="newPoForm.items.length <= 1"
                        @click="removePoLine(idx)"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div class="mt-2">
                <button type="button" class="btn btn-secondary btn-sm" @click="addPoLine">
                  <AppIcon name="plus" :size="14" />
                  <span>إضافة صنف آخر</span>
                </button>
              </div>
            </div>

            <div class="invoice-summary-bar">
              <div class="invoice-total-badge">
                <span class="total-label">إجمالي أمر الشراء:</span>
                <span class="total-value">{{ formatMoney(newPoTotalCalculated) }}</span>
              </div>
              <div class="actions">
                <button
                  type="submit"
                  class="btn btn-primary"
                  :disabled="poSubmitting || newPoTotalCalculated <= 0"
                >
                  {{ poSubmitting ? 'جاري الحفظ...' : 'حفظ أمر الشراء' }}
                </button>
                <button type="button" class="btn btn-outline" @click="showNewPoModal = false">
                  إلغاء
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- ==============================================
         MODAL: RECEIVE GOODS (استلام البضاعة / GRN)
         ============================================== -->
    <Teleport to="body">
      <div v-if="showReceiveModal" class="modal-overlay" @click.self="showReceiveModal = false">
        <div class="card modal-card" style="max-width: 800px; width: 95%">
          <div class="card-header-row">
            <div>
              <h3>
                استلام بضاعة أمر شراء <code>{{ activePoForReceive?.po_number }}</code>
              </h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin: 4px 0 0">
                تسجيل الكميات الفعلية المستلمة في المخزن وإمكانية التحويل التلقائي لفاتورة مشتريات
              </p>
            </div>
            <button type="button" class="icon-btn" @click="showReceiveModal = false">✕</button>
          </div>

          <form @submit.prevent="submitReceiveGoods">
            <div class="table-container mb-3">
              <table class="items-table">
                <thead>
                  <tr>
                    <th>المنتج</th>
                    <th>الكمية المطلوبة</th>
                    <th>المستلم سابقاً</th>
                    <th>المتبقي</th>
                    <th style="width: 150px">الكمية المستلمة الآن</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in receiveLines" :key="line.item_id">
                    <td>
                      <strong>{{ line.product_name }}</strong>
                    </td>
                    <td>{{ line.ordered }}</td>
                    <td>{{ line.received }}</td>
                    <td>
                      <span class="badge bg-warning-light">{{ line.remaining }}</span>
                    </td>
                    <td>
                      <input
                        v-model.number="line.quantity_to_receive"
                        type="number"
                        step="0.01"
                        min="0"
                        :max="line.remaining"
                        class="field-like num-cell"
                        required
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="form-group mb-3">
              <label>ملاحظات الاستلام</label>
              <input
                v-model="receiveNotes"
                type="text"
                class="field-like"
                placeholder="ملاحظات الفحص والاستلام..."
              />
            </div>

            <div
              class="form-group mb-4"
              style="background: var(--bg-hover); padding: 12px; border-radius: 8px"
            >
              <label
                style="
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  cursor: pointer;
                  font-weight: 600;
                "
              >
                <input
                  v-model="receiveConvertToInvoice"
                  type="checkbox"
                  style="width: 18px; height: 18px"
                />
                <span
                  >تحويل الاستلام تلقائياً إلى فاتورة مشتريات وترحيل القيد للأستاذ العام ومستحقات
                  المورد</span
                >
              </label>
            </div>

            <div class="invoice-summary-bar">
              <div class="actions" style="width: 100%; justify-content: flex-end">
                <button type="submit" class="btn btn-primary" :disabled="receiveSubmitting">
                  {{ receiveSubmitting ? 'جاري تسجيل الاستلام...' : 'تأكيد استلام البضاعة' }}
                </button>
                <button type="button" class="btn btn-outline" @click="showReceiveModal = false">
                  إلغاء
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  products as productsApi,
  purchases as purchasesApi,
  suppliers as suppliersApi,
  expenses as expensesApi,
  accountingApi,
  type PurchaseOrder,
} from '@/api';
import { formatMoney } from '@/utils/currency';
import { useProductMeta } from '@/composables/useProductMeta';
import { useAuthStore } from '@/stores/auth';
import AppIcon from '@/components/AppIcon.vue';
import StatCard from '@/components/StatCard.vue';
import SuppliersView from '@/views/SuppliersView.vue';
import PartnersView from '@/views/PartnersView.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// Permissions
const canManagePurchases = computed(() => authStore.hasPermission('inventory.manage'));
const canManageExpenses = computed(() => authStore.hasPermission('expenses.manage'));

const loadingPurchases = ref(false);
const loadingExpenses = ref(false);

// Active Tab
const activeTab = ref(String(route.query.tab || 'purchases'));

watch(
  () => route.query.tab,
  (newTab) => {
    if (newTab && newTab !== activeTab.value) {
      activeTab.value = String(newTab);
      if (newTab === 'purchases') loadPurchasesOnly();
      else if (newTab === 'orders') loadOrdersOnly();
      else if (newTab === 'returns') loadReturnsOnly();
      else if (newTab === 'expenses') loadExpensesOnly();
    }
  },
);

const switchTab = (tab: any) => {
  activeTab.value = tab;
  router.replace({ query: { ...route.query, tab } }).catch(() => {});
  if (tab === 'purchases') loadPurchasesOnly();
  else if (tab === 'orders') loadOrdersOnly();
  else if (tab === 'returns') loadReturnsOnly();
  else if (tab === 'expenses') loadExpensesOnly();
};

// Common Date Handlers
const todayStr = new Date().toISOString().split('T')[0]!;
const firstDayOfMonth = todayStr.slice(0, 8) + '01';

// Number normalization helpers
const normalizeDigits = (value: any) =>
  String(value ?? '')
    .replace(/[٠-٩]/g, (digit: any) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(digit)] || digit)
    .replace(/[۰-۹]/g, (digit: any) => '0123456789'['۰۱۲۳۴۵٦۷۸۹'.indexOf(digit)] || digit);

const toDecimal = (value: any, fallback = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const text = normalizeDigits(value).trim().replace(/[٫,]/g, '.');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// PURCHASES LOGIC
const { loadMeta, unitLabel, unitNames } = useProductMeta();

const products = ref<any[]>([]);
const invoices = ref<any[]>([]);
const suppliersList = ref<any[]>([]);
const purchasesSaving = ref(false);
const purchasesMsg = ref('');
const purchasesErr = ref(false);
const editingInvoiceId = ref<any>(null);

const purchasesFilters = ref({
  from_date: firstDayOfMonth,
  to_date: todayStr,
  limit: 200,
});

const emptyItem = () => ({
  product_id: null,
  warehouse_name: '',
  unit: unitNames()[0] || 'قطعة',
  quantity: 1,
  unit_price: 0,
});
const purchaseForm = ref({
  invoice_date: todayStr,
  supplier_id: null,
  notes: '',
  items: [emptyItem()],
});

const purchaseTotalAmount = computed(() =>
  purchaseForm.value.items.reduce(
    (s: any, x: any) => s + toDecimal(x.quantity) * toDecimal(x.unit_price),
    0,
  ),
);

const periodPurchasesTotal = computed(() => {
  return invoices.value.reduce((sum: any, inv: any) => sum + Number(inv.total_amount || 0), 0);
});

const periodPurchasesCount = computed(() => {
  return invoices.value.length;
});

const selectPurchasesMonth = (event: any) => {
  const value = event.target.value;
  if (!value) return;
  const [year, month] = value.split('-').map(Number);
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  purchasesFilters.value.from_date = fromDate;
  purchasesFilters.value.to_date = toDate;
  loadPurchasesOnly();
};

const loadPurchasesOnly = async () => {
  if (!canManagePurchases.value) return;
  loadingPurchases.value = true;
  try {
    const [p, inv, sup] = await Promise.all([
      productsApi.list({ limit: 1000 }),
      purchasesApi.list({
        from_date: purchasesFilters.value.from_date,
        to_date: purchasesFilters.value.to_date,
        limit: purchasesFilters.value.limit,
      }),
      suppliersApi.list(),
    ]);
    products.value = p.data || [];
    invoices.value = inv.data || [];
    suppliersList.value = sup.data || [];
    await loadMeta();
  } catch (err: any) {
    console.error('Failed to load purchases:', err);
  } finally {
    loadingPurchases.value = false;
  }
};

const onProductChange = (item: any) => {
  const p = products.value.find((x: any) => x.id === item.product_id);
  if (!p) return;
  item.warehouse_name = p.primary_warehouse_name || '';
  item.unit = p.unit || 'count';
  item.unit_price = Number(p.purchase_price) || 0;
};

const addPurchaseItem = () => purchaseForm.value.items.push(emptyItem());
const removePurchaseItem = (i: any) => purchaseForm.value.items.splice(i, 1);

const resetPurchasesForm = () => {
  editingInvoiceId.value = null;
  purchaseForm.value = {
    invoice_date: todayStr,
    supplier_id: null,
    notes: '',
    items: [emptyItem()],
  };
};

const editInvoice = (invoice: any) => {
  editingInvoiceId.value = invoice.id;
  purchaseForm.value = {
    invoice_date: String(invoice.invoice_date || '').slice(0, 10),
    supplier_id: invoice.supplier_id || null,
    notes: invoice.notes || '',
    items: (invoice.items || []).map((item: any) => ({
      product_id: item.product_id,
      warehouse_name: item.warehouse_name || '',
      unit: item.unit || 'count',
      quantity: item.quantity ?? 1,
      unit_price: item.unit_price ?? 0,
    })),
  };
  if (!purchaseForm.value.items.length) purchaseForm.value.items = [emptyItem()];
  purchasesMsg.value = `جاري تعديل فاتورة ${invoice.invoice_number}`;
  purchasesErr.value = false;
};

const cancelPurchaseEdit = () => {
  resetPurchasesForm();
  purchasesMsg.value = '';
  purchasesErr.value = false;
};

const deleteInvoice = async (id: any, invoiceNumber: any) => {
  if (!id) return;
  const ok = confirm(`هل تريد حذف فاتورة المشتريات ${invoiceNumber}?`);
  if (!ok) return;

  purchasesMsg.value = '';
  purchasesErr.value = false;
  purchasesSaving.value = true;
  try {
    await purchasesApi.delete(id);
    purchasesMsg.value = 'تم حذف فاتورة المشتريات وتحديث المخزون';
    await loadPurchasesOnly();
  } catch (e: any) {
    purchasesErr.value = true;
    purchasesMsg.value = e.message || 'فشل الحذف';
  } finally {
    purchasesSaving.value = false;
  }
};

const savePurchaseInvoice = async () => {
  if (purchasesSaving.value) return;
  purchasesMsg.value = '';
  purchasesErr.value = false;
  purchasesSaving.value = true;
  try {
    const items = purchaseForm.value.items
      .filter((x: any) => x.product_id && toDecimal(x.quantity) > 0)
      .map((x: any) => ({
        ...x,
        quantity: toDecimal(x.quantity),
        unit_price: toDecimal(x.unit_price),
      }));
    if (!items.length) throw new Error('أضف صنفًا واحدًا على الأقل');

    // منع تكرار نفس الصنف في أكثر من سطر بفاتورة الشراء
    const seenProductIds = new Set<any>();
    for (const item of items) {
      if (seenProductIds.has(item.product_id)) {
        const prod = products.value.find((p: any) => p.id === item.product_id);
        const prodName = prod ? prod.name_ar || prod.name : `رقم ${item.product_id}`;
        throw new Error(
          `تم تكرار اختيار الصنف (${prodName}) في أكثر من سطر، يرجى دمج الكميات في سطر واحد.`,
        );
      }
      seenProductIds.add(item.product_id);
    }

    const payload = {
      invoice_date: purchaseForm.value.invoice_date,
      supplier_id: purchaseForm.value.supplier_id || null,
      notes: purchaseForm.value.notes,
      items,
    };
    if (editingInvoiceId.value) {
      const res = await purchasesApi.update(editingInvoiceId.value, payload);
      const shortages = res?.data?.shortages || [];
      purchasesMsg.value = shortages.length
        ? `تم تعديل فاتورة المشتريات، مع وجود ${shortages.length} بند لم يتم عكس كامل كميته من المخزون القديم`
        : 'تم تعديل فاتورة المشتريات وتحديث المخزون';
    } else {
      await purchasesApi.create(payload);
      purchasesMsg.value = 'تم حفظ فاتورة المشتريات وتحديث المخزون';
    }
    resetPurchasesForm();
    await loadPurchasesOnly();
  } catch (e: any) {
    purchasesErr.value = true;
    purchasesMsg.value = e.message || 'فشل الحفظ';
  } finally {
    purchasesSaving.value = false;
  }
};

// PURCHASE RETURNS LOGIC
const returnsList = ref<any[]>([]);
const loadingReturns = ref(false);
const returnsMsg = ref('');
const returnsErr = ref(false);
const showReturnModal = ref(false);
const showReturnDetailModal = ref(false);
const selectedInvoiceForReturn = ref<any>(null);
const selectedReturnDetail = ref<any>(null);
const returnSubmitting = ref(false);

const returnsFilters = ref({
  from_date: firstDayOfMonth,
  to_date: todayStr,
  limit: 100,
});

const returnForm = ref({
  purchase_invoice_id: null as number | null,
  return_date: todayStr,
  notes: '',
});

const returnFormItems = ref<
  Array<{
    purchase_invoice_item_id?: number;
    product_id: number;
    product_name: string;
    unit: string;
    invoiced_qty: number;
    unit_price: number;
    return_qty: number;
  }>
>([]);

const totalReturnCalculated = computed(() => {
  return returnFormItems.value.reduce((s, it) => {
    const q = Number(it.return_qty) || 0;
    const p = Number(it.unit_price) || 0;
    return s + q * p;
  }, 0);
});

const periodReturnsTotal = computed(() => {
  return returnsList.value.reduce(
    (sum: number, ret: any) => sum + Number(ret.total_amount || 0),
    0,
  );
});

const periodReturnsCount = computed(() => {
  return returnsList.value.length;
});

const selectReturnsMonth = (event: any) => {
  const value = event.target.value;
  if (!value) return;
  const [year, month] = value.split('-').map(Number);
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  returnsFilters.value.from_date = fromDate;
  returnsFilters.value.to_date = toDate;
  loadReturnsOnly();
};

const loadReturnsOnly = async () => {
  loadingReturns.value = true;
  try {
    const res = await accountingApi.getPurchaseReturns({
      from_date: returnsFilters.value.from_date,
      to_date: returnsFilters.value.to_date,
      limit: returnsFilters.value.limit,
    });
    returnsList.value = res.data || (res as any) || [];
  } catch (err: any) {
    console.error('Failed to load purchase returns:', err);
  } finally {
    loadingReturns.value = false;
  }
};

const openReturnModal = (invoice?: any) => {
  if (invoice) {
    selectedInvoiceForReturn.value = invoice;
    returnForm.value = {
      purchase_invoice_id: invoice.id,
      return_date: todayStr,
      notes: '',
    };
    returnFormItems.value = (invoice.items || []).map((it: any) => ({
      purchase_invoice_item_id: it.id,
      product_id: it.product_id,
      product_name: it.product_name,
      unit: it.unit || 'count',
      invoiced_qty: Number(it.quantity) || 0,
      unit_price: Number(it.unit_price) || 0,
      return_qty: 0,
    }));
  } else {
    selectedInvoiceForReturn.value = null;
    returnForm.value = {
      purchase_invoice_id: null,
      return_date: todayStr,
      notes: '',
    };
    returnFormItems.value = [];
    if (!invoices.value.length) {
      loadPurchasesOnly();
    }
  }
  showReturnModal.value = true;
};

const onReturnInvoiceChange = () => {
  const inv = invoices.value.find((x: any) => x.id === returnForm.value.purchase_invoice_id);
  if (!inv) {
    returnFormItems.value = [];
    return;
  }
  returnFormItems.value = (inv.items || []).map((it: any) => ({
    purchase_invoice_item_id: it.id,
    product_id: it.product_id,
    product_name: it.product_name,
    unit: it.unit || 'count',
    invoiced_qty: Number(it.quantity) || 0,
    unit_price: Number(it.unit_price) || 0,
    return_qty: 0,
  }));
};

const closeReturnModal = () => {
  showReturnModal.value = false;
  selectedInvoiceForReturn.value = null;
  returnForm.value = {
    purchase_invoice_id: null,
    return_date: todayStr,
    notes: '',
  };
  returnFormItems.value = [];
};

const submitPurchaseReturn = async () => {
  if (!returnForm.value.purchase_invoice_id) return;
  const itemsToReturn = returnFormItems.value
    .filter((it) => Number(it.return_qty) > 0)
    .map((it) => ({
      purchase_invoice_item_id: it.purchase_invoice_item_id,
      product_id: it.product_id,
      quantity: Number(it.return_qty),
      unit_price: Number(it.unit_price),
    }));

  if (!itemsToReturn.length) {
    window.alert('يرجى إدخال كمية أكبر من صفر لصنف واحد على الأقل مراد إرجاعه');
    return;
  }

  returnSubmitting.value = true;
  try {
    await accountingApi.createPurchaseReturn({
      purchase_invoice_id: returnForm.value.purchase_invoice_id,
      return_date: returnForm.value.return_date,
      notes: returnForm.value.notes,
      items: itemsToReturn,
    });
    returnsMsg.value = 'تم تسجيل مرتجع المشتريات وتحديث رصيد المورد والمخزون بنجاح';
    returnsErr.value = false;
    closeReturnModal();
    await loadReturnsOnly();
    await loadPurchasesOnly();
  } catch (err: any) {
    window.alert(err?.response?.data?.message || err?.message || 'فشل في تسجيل مرتجع المشتريات');
  } finally {
    returnSubmitting.value = false;
  }
};

const viewReturnDetail = async (ret: any) => {
  try {
    const res = await accountingApi.getPurchaseReturnById(ret.id);
    selectedReturnDetail.value = res.data || res;
    showReturnDetailModal.value = true;
  } catch (err: any) {
    console.error('Failed to get return details:', err);
    selectedReturnDetail.value = ret;
    showReturnDetailModal.value = true;
  }
};

// EXPENSES LOGIC
const expensesList = ref<any[]>([]);
const expenseCategories = ref<any[]>([]);
const expensesSaving = ref(false);
const expenseTypeFilter = ref('all');

const periodExpensesTotal = computed(() => {
  return expensesList.value.reduce((sum: any, e: any) => sum + Number(e.amount || 0), 0);
});

const periodFixedExpensesTotal = computed(() => {
  return expensesList.value
    .filter((e: any) => e.is_fixed)
    .reduce((sum: any, e: any) => sum + Number(e.amount || 0), 0);
});

const periodVariableExpensesTotal = computed(() => {
  return expensesList.value
    .filter((e: any) => !e.is_fixed)
    .reduce((sum: any, e: any) => sum + Number(e.amount || 0), 0);
});

const periodExpensesCount = computed(() => {
  return expensesList.value.length;
});

const filteredExpensesList = computed(() => {
  if (expenseTypeFilter.value === 'fixed') {
    return expensesList.value.filter((e: any) => Boolean(e.is_fixed));
  }
  if (expenseTypeFilter.value === 'variable') {
    return expensesList.value.filter((e: any) => !e.is_fixed);
  }
  return expensesList.value;
});

const expensesFilters = ref({
  from_date: firstDayOfMonth,
  to_date: todayStr,
});

const showExpenseForm = ref(false);
const expenseForm = ref({
  id: null,
  title: '',
  category_id: 1,
  is_fixed: false,
  amount: 0,
  expense_date: todayStr,
});

const resetExpenseForm = () => {
  const firstCat = expenseCategories.value[0];
  expenseForm.value = {
    id: null,
    title: '',
    category_id: firstCat?.id || 1,
    is_fixed: firstCat ? Boolean(firstCat.is_fixed) : false,
    amount: 0,
    expense_date: todayStr,
  };
};

const onExpenseCategoryChange = () => {
  const cat = expenseCategories.value.find(
    (c: any) => Number(c.id) === Number(expenseForm.value.category_id),
  );
  if (cat) {
    expenseForm.value.is_fixed = Boolean(cat.is_fixed);
  }
};

const openExpenseCreate = () => {
  resetExpenseForm();
  showExpenseForm.value = true;
};

const openExpenseEdit = (row: any) => {
  expenseForm.value = {
    id: row.id,
    title: row.title,
    category_id: row.category_id,
    is_fixed: row.is_fixed === true || String(row.is_fixed) === 'true',
    amount: Number(row.amount || 0),
    expense_date: String(row.expense_date || '').slice(0, 10),
  };
  showExpenseForm.value = true;
};

const selectExpensesMonth = (event: any) => {
  const value = event.target.value;
  if (!value) return;
  const [year, month] = value.split('-').map(Number);
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  expensesFilters.value.from_date = fromDate;
  expensesFilters.value.to_date = toDate;
  loadExpensesOnly();
};

const loadExpensesOnly = async () => {
  if (!canManageExpenses.value) return;
  loadingExpenses.value = true;
  try {
    const [listRes, c] = await Promise.all([
      expensesApi.list({
        from_date: expensesFilters.value.from_date,
        to_date: expensesFilters.value.to_date,
        limit: 1000,
      }),
      expensesApi.categories(),
    ]);

    expensesList.value = listRes.data || [];
    expenseCategories.value = c.data || [];
  } catch (err: any) {
    console.error('Failed to load expenses:', err);
  } finally {
    loadingExpenses.value = false;
  }
};

const suggestExpenseCategory = async () => {
  const title = expenseForm.value.title?.trim();
  if (!title || title.length < 3) return;
  try {
    const res = await expensesApi.suggestCategory(title);
    if (res.data?.category_id) {
      const exists = expenseCategories.value.some((c: any) => c.id === res.data.category_id);
      if (exists) {
        expenseForm.value.category_id = res.data.category_id;
        onExpenseCategoryChange();
      }
    }
  } catch (err: any) {
    console.error('Failed to suggest category:', err);
  }
};

const saveExpense = async () => {
  expensesSaving.value = true;
  try {
    const payload = {
      ...expenseForm.value,
      is_fixed:
        expenseForm.value.is_fixed === true || String(expenseForm.value.is_fixed) === 'true',
    };
    if (expenseForm.value.id) await expensesApi.update(expenseForm.value.id, payload);
    else await expensesApi.create(payload);
    showExpenseForm.value = false;
    resetExpenseForm();
    await loadExpensesOnly();
  } catch (e: any) {
    window.alert(e.message || 'فشل حفظ المصروف');
  } finally {
    expensesSaving.value = false;
  }
};

const removeExpense = async (row: any) => {
  if (!window.confirm(`تأكيد حذف المصروف: ${row.title} ؟`)) return;
  try {
    await expensesApi.delete(row.id);
    await loadExpensesOnly();
  } catch (e: any) {
    window.alert(e.message || 'فشل حذف المصروف');
  }
};

// PURCHASE ORDERS LOGIC
const loadingOrders = ref(false);
const purchaseOrdersList = ref<PurchaseOrder[]>([]);
const ordersFilterStatus = ref('');
const showNewPoModal = ref(false);
const poSubmitting = ref(false);

const newPoForm = ref({
  supplier_id: null as number | null,
  order_date: todayStr,
  expected_date: '',
  notes: '',
  items: [{ product_id: null as number | null, quantity: 1, unit_price: 0 }],
});

const newPoTotalCalculated = computed(() => {
  return newPoForm.value.items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    0,
  );
});

const addPoLine = () => {
  newPoForm.value.items.push({
    product_id: null,
    quantity: 1,
    unit_price: 0,
  });
};

const removePoLine = (idx: number) => {
  if (newPoForm.value.items.length > 1) {
    newPoForm.value.items.splice(idx, 1);
  }
};

const openNewPoModal = () => {
  newPoForm.value = {
    supplier_id: null,
    order_date: todayStr,
    expected_date: '',
    notes: '',
    items: [{ product_id: null, quantity: 1, unit_price: 0 }],
  };
  showNewPoModal.value = true;
};

const loadOrdersOnly = async () => {
  loadingOrders.value = true;
  try {
    const res = await accountingApi.listPurchaseOrders({
      status: ordersFilterStatus.value || undefined,
    });
    purchaseOrdersList.value = (res as any).data || res || [];
  } catch (err: any) {
    console.error('Failed to load purchase orders:', err);
  } finally {
    loadingOrders.value = false;
  }
};

const submitCreatePo = async () => {
  const validItems = newPoForm.value.items.filter((it) => it.product_id && Number(it.quantity) > 0);
  if (validItems.length === 0) {
    window.alert('يجب إضافة بند واحد على الأقل بكمية صالحة');
    return;
  }
  poSubmitting.value = true;
  try {
    await accountingApi.createPurchaseOrder({
      supplier_id: newPoForm.value.supplier_id || undefined,
      order_date: newPoForm.value.order_date,
      expected_date: newPoForm.value.expected_date || undefined,
      notes: newPoForm.value.notes,
      items: validItems.map((it) => ({
        product_id: it.product_id!,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price || 0),
      })),
    });
    showNewPoModal.value = false;
    await loadOrdersOnly();
    window.alert('تم إنشاء أمر الشراء بنجاح');
  } catch (err: any) {
    window.alert(err?.response?.data?.message || err?.message || 'فشل إنشاء أمر الشراء');
  } finally {
    poSubmitting.value = false;
  }
};

const approveOrder = async (id: number) => {
  if (!confirm('هل تريد بالتأكيد اعتماد أمر الشراء هذا؟')) return;
  try {
    await accountingApi.approvePurchaseOrder(id);
    await loadOrdersOnly();
    window.alert('تم اعتماد أمر الشراء بنجاح');
  } catch (err: any) {
    window.alert(err?.response?.data?.message || err?.message || 'فشل اعتماد أمر الشراء');
  }
};

const cancelOrder = async (id: number) => {
  if (!confirm('هل تريد بالتأكيد إلغاء أمر الشراء هذا؟')) return;
  try {
    await accountingApi.cancelPurchaseOrder(id);
    await loadOrdersOnly();
    window.alert('تم إلغاء أمر الشراء بنجاح');
  } catch (err: any) {
    window.alert(err?.response?.data?.message || err?.message || 'فشل إلغاء أمر الشراء');
  }
};

// RECEIVING GOODS
const showReceiveModal = ref(false);
const receiveSubmitting = ref(false);
const activePoForReceive = ref<PurchaseOrder | null>(null);
const receiveLines = ref<
  Array<{
    item_id: number;
    product_name: string;
    ordered: number;
    received: number;
    remaining: number;
    quantity_to_receive: number;
  }>
>([]);
const receiveConvertToInvoice = ref(true);
const receiveNotes = ref('');

const openReceiveModal = (po: PurchaseOrder) => {
  activePoForReceive.value = po;
  receiveNotes.value = '';
  receiveConvertToInvoice.value = true;
  receiveLines.value = (po.items || []).map((it) => {
    const rem = Math.max(0, Number(it.quantity) - Number(it.received_quantity || 0));
    return {
      item_id: it.id!,
      product_name: it.product_name || `صنف #${it.product_id}`,
      ordered: Number(it.quantity),
      received: Number(it.received_quantity || 0),
      remaining: rem,
      quantity_to_receive: rem,
    };
  });
  showReceiveModal.value = true;
};

const submitReceiveGoods = async () => {
  if (!activePoForReceive.value) return;
  const itemsToReceive = receiveLines.value
    .filter((l) => Number(l.quantity_to_receive) > 0)
    .map((l) => ({
      item_id: l.item_id,
      quantity_to_receive: Number(l.quantity_to_receive),
    }));

  if (itemsToReceive.length === 0) {
    window.alert('يجب تحديد كمية مستلمة أكبر من صفر لبند واحد على الأقل');
    return;
  }

  receiveSubmitting.value = true;
  try {
    await accountingApi.receiveGoods(activePoForReceive.value.id, {
      items: itemsToReceive,
      convertToInvoice: receiveConvertToInvoice.value,
      notes: receiveNotes.value,
    });
    showReceiveModal.value = false;
    await loadOrdersOnly();
    if (receiveConvertToInvoice.value) {
      await loadPurchasesOnly();
      window.alert('تم استلام البضاعة وإنشاء فاتورة المشتريات وترحيلها محاسبياً بنجاح');
    } else {
      window.alert('تم تسجيل استلام البضاعة في المخزن بنجاح');
    }
  } catch (err: any) {
    window.alert(err?.response?.data?.message || err?.message || 'فشل استلام البضاعة');
  } finally {
    receiveSubmitting.value = false;
  }
};

const getPoStatusLabel = (status: string) => {
  switch (status) {
    case 'draft':
      return 'مسودة (Draft)';
    case 'approved':
      return 'معتمد';
    case 'partially_received':
      return 'مستلم جزئياً';
    case 'received':
      return 'مستلم بالكامل';
    case 'cancelled':
      return 'ملغي';
    default:
      return status;
  }
};

const getPoStatusClass = (status: string) => {
  switch (status) {
    case 'draft':
      return 'liability';
    case 'approved':
      return 'asset';
    case 'partially_received':
      return 'equity';
    case 'received':
      return 'revenue';
    case 'cancelled':
      return 'expense';
    default:
      return '';
  }
};

const getPoReceivedSummary = (po: PurchaseOrder) => {
  if (!po.items || !po.items.length) return '—';
  const totalQty = po.items.reduce((s, it) => s + Number(it.quantity || 0), 0);
  const recQty = po.items.reduce((s, it) => s + Number(it.received_quantity || 0), 0);
  return `${recQty} / ${totalQty}`;
};

// On Mounted Load
onMounted(() => {
  if (activeTab.value === 'purchases') loadPurchasesOnly();
  else if (activeTab.value === 'orders') loadOrdersOnly();
  else if (activeTab.value === 'returns') loadReturnsOnly();
  else loadExpensesOnly();
});
</script>

<style lang="scss" scoped>
.purchases-expenses-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Tabs Design */
.tabs-container {
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
  width: calc(50% - 6px);
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
  padding: 10px 20px;
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

.items-table {
  width: 100%;
}
.items-table th,
.items-table td {
  padding: 8px;
  text-align: right;
  vertical-align: middle;
}
.items-table input,
.items-table select {
  width: 100%;
}
.amount-cell {
  font-weight: 700;
  color: var(--text-strong);
  text-align: left !important;
  padding-left: 12px !important;
}
.field-like {
  width: 100%;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  font-size: 0.9rem;
  font-weight: 600;
  transition: var(--transition);
  &:focus {
    outline: none;
    border-color: var(--primary);
  }
}
.warehouse-chip {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--info) 10%, var(--bg-elevated));
  border: 1px solid color-mix(in srgb, var(--info) 24%, transparent);
  color: var(--text-strong);
  font-weight: 700;
  white-space: nowrap;
}
.warehouse-chip.missing {
  background: var(--bg-elevated);
  border-color: var(--border);
  color: var(--text-muted);
}
.actions {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.total {
  font-weight: 800;
  color: var(--text-strong);
}
.msg.ok {
  color: var(--success);
  font-weight: 700;
}
.msg.err {
  color: var(--danger);
  font-weight: 700;
}

/* Modal and form card */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.modal-card {
  width: min(900px, 95vw);
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-xl);
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 24px;
}
.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
  h3 {
    margin: 0;
  }
}
.purchases-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  .filter-group {
    display: flex;
    align-items: center;
    gap: 6px;
    label {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 700;
    }
    input {
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-elevated);
      font-size: 0.88rem;
    }
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

.invoice-meta-panel {
  background: var(--bg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 24px;
  gap: 16px;
}
.invoice-summary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  margin-bottom: 24px;
}
.invoice-total-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: color-mix(in srgb, var(--success) 8%, var(--bg-elevated));
  border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
  border-radius: var(--radius-md);
}
.invoice-total-badge .total-label {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-weight: 700;
}
.invoice-total-badge .total-value {
  font-size: 1.35rem;
  font-weight: 900;
  color: var(--success);
}
</style>
