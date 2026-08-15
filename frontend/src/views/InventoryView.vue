<template>
  <div class="inventory-page">
    <!-- Header -->
    <div class="page-header">
      <div class="tabs inline-tabs">
        <button :class="{ active: tab === 'stock' }" @click="tab = 'stock'">📦 المخزون</button>
        <button :class="{ active: tab === 'return' }" @click="tab = 'return'">
          📥 استرداد بـ Excel
        </button>
        <button :class="{ active: tab === 'movements' }" @click="tab = 'movements'">
          📋 حركة المخزون
        </button>
      </div>
      <div class="header-actions">
        <select v-model="warehouseId" @change="load" class="warehouse-select">
          <option value="">كل المخازن</option>
          <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name_ar }}</option>
        </select>
        <button
          v-permission="'inventory.edit'"
          v-if="tab === 'stock'"
          class="btn btn-outline"
          @click="openTransferModal"
        >
          🔄 تحويل جديد
        </button>
      </div>
    </div>

    <p v-if="msg" :class="['msg', err ? 'err' : 'ok']">{{ msg }}</p>

    <!-- ===== STOCK TAB ===== -->
    <template v-if="tab === 'stock'">
      <!-- Inventory Valuation Summary Cards -->
      <div class="grid grid-3" style="margin-bottom: 16px; gap: 12px">
        <div
          class="card"
          style="
            padding: 14px;
            background: linear-gradient(
              135deg,
              rgba(59, 130, 246, 0.08) 0%,
              rgba(59, 130, 246, 0.02) 100%
            );
            border: 1px solid rgba(59, 130, 246, 0.2);
          "
        >
          <span style="font-size: 0.8rem; font-weight: 700; color: #64748b"
            >💵 إجمالي تقييم رصيد المخزون (بالتكلفة)</span
          >
          <h3 style="margin: 4px 0 0 0; font-size: 1.25rem; font-weight: 800; color: #1e3a8a">
            {{ formatMoney(totalInventoryValue) }}
          </h3>
        </div>
        <div
          class="card"
          style="
            padding: 14px;
            background: linear-gradient(
              135deg,
              rgba(16, 185, 129, 0.08) 0%,
              rgba(16, 185, 129, 0.02) 100%
            );
            border: 1px solid rgba(16, 185, 129, 0.2);
          "
        >
          <span style="font-size: 0.8rem; font-weight: 700; color: #64748b"
            >🏢 قيمة مخزون الرئيسي</span
          >
          <h3 style="margin: 4px 0 0 0; font-size: 1.25rem; font-weight: 800; color: #065f46">
            {{ formatMoney(mainWarehouseValue) }}
          </h3>
        </div>
        <div
          class="card"
          style="
            padding: 14px;
            background: linear-gradient(
              135deg,
              rgba(245, 158, 11, 0.08) 0%,
              rgba(245, 158, 11, 0.02) 100%
            );
            border: 1px solid rgba(245, 158, 11, 0.2);
          "
        >
          <span style="font-size: 0.8rem; font-weight: 700; color: #64748b"
            >🏪 قيمة مخزون الفرع / المحل</span
          >
          <h3 style="margin: 4px 0 0 0; font-size: 1.25rem; font-weight: 800; color: #92400e">
            {{ formatMoney(branchWarehouseValue) }}
          </h3>
        </div>
      </div>

      <BaseTable
        :items="items"
        :columns="stockColumns"
        :loading="loading"
        empty-message="لا توجد بيانات مخزون"
        :row-class="(i) => [{ 'row-low': i.is_low }, { 'row-highlight': isHighlighted(i) }]"
      >
        <template #cell-name_ar="{ item }">
          <div class="product-name">
            {{ item.name_ar }}
            <span v-if="item.has_active_recipe" class="recipe-chip">وصفة</span>
          </div>
        </template>
        <template #cell-sku="{ item }">
          <span class="mono">{{ item.sku || '—' }}</span>
        </template>
        <template #cell-purchase_price="{ item }">
          <span class="mono" style="font-weight: 700; color: #475569">
            {{ formatMoney(item.purchase_price || 0) }}
          </span>
        </template>
        <template #cell-total_quantity="{ item }">
          <span class="qty qty-total" :class="{ 'qty-low': item.is_low }">
            <strong>{{
              fmtQty(item.total_quantity !== undefined ? item.total_quantity : item.quantity)
            }}</strong>
          </span>
        </template>
        <template #cell-stock_value="{ item }">
          <span class="mono" style="font-weight: 800; color: var(--accent, #c77a2f)">
            {{ formatMoney(getItemStockValue(item)) }}
          </span>
        </template>
        <template #cell-main_quantity="{ item }">
          <span class="pill pill-main"> 🏢 {{ fmtQty(getMainQty(item)) }} </span>
        </template>
        <template #cell-branch_quantity="{ item }">
          <span class="pill pill-branch"> 🏪 {{ fmtQty(getBranchQty(item)) }} </span>
        </template>
        <template #cell-min_stock="{ item }">
          <span class="min-stock-tag" title="الحد الأدنى محسوب ومطبق بناءً على إجمالي رصيد المنشأة">
            {{ fmtQty(item.min_stock || 0) }}
          </span>
        </template>
        <template #cell-status="{ item }">
          <span :class="['badge', item.is_low ? 'badge-danger' : 'badge-success']">
            {{ item.is_low ? '⚠️ أقل من الحد الأدنى' : '✅ متوفر بالكامل' }}
          </span>
        </template>
        <template #cell-actions="{ item }">
          <button
            v-permission="'inventory.edit'"
            class="icon-btn"
            title="تحويل بين المخزن الرئيسي وصالة البيع"
            @click="openTransferProduct(item)"
          >
            🔄
          </button>
          <button
            v-permission="'inventory.edit'"
            class="icon-btn"
            :class="{ disabled: item.has_active_recipe }"
            :disabled="item.has_active_recipe"
            :title="
              item.has_active_recipe ? 'منتج وصفة نشطة: يتم تحديثه من مكونات الوصفة فقط' : 'تعديل'
            "
            @click="openEdit(item)"
          >
            ✎
          </button>
          <button
            v-permission="'inventory.edit'"
            class="icon-btn btn-danger"
            title="تسجيل هالك"
            @click="openWastage(item)"
          >
            🗑️
          </button>
        </template>
      </BaseTable>
    </template>

    <!-- ===== EXCEL RETURN TAB ===== -->
    <template v-if="tab === 'return'">
      <div class="excel-return-page">
        <!-- Info Card -->
        <div class="card info-card">
          <div class="info-icon">📥</div>
          <div class="info-body">
            <h3>استرداد المخزون بالجملة عبر Excel</h3>
            <p>
              حمّل القالب — فيه كل المنتجات جاهزة بالكود والاسم والمخزون الحالي. اكتب الكمية
              المُستردة فقط لكل منتج، ثم ارفع الملف.
            </p>
          </div>
        </div>

        <!-- Steps -->
        <div class="steps-row">
          <div class="step-card">
            <div class="step-num">1</div>
            <div class="step-body">
              <strong>حمّل القالب</strong>
              <span>فيه كل المنتجات جاهزة — كود + اسم + مخزون حالي</span>
            </div>
          </div>
          <div class="step-arrow">←</div>
          <div class="step-card">
            <div class="step-num">2</div>
            <div class="step-body">
              <strong>اكتب الكمية</strong>
              <span>في عمود "كمية_الاسترداد" فقط — اترك الباقي فارغاً</span>
            </div>
          </div>
          <div class="step-arrow">←</div>
          <div class="step-card">
            <div class="step-num">3</div>
            <div class="step-body">
              <strong>افحص ثم ارفع</strong>
              <span>افحص الملف أولاً للتأكد، ثم ارفعه للتنفيذ</span>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="card actions-card">
          <div class="action-group">
            <div class="action-label">
              <span class="action-num">1</span>
              <strong>تحميل القالب</strong>
              <small>اختر المخزن لتصفية المنتجات (اختياري)</small>
            </div>
            <div class="action-controls">
              <select v-model="returnWarehouseId" class="warehouse-select">
                <option value="">كل المخازن</option>
                <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name_ar }}</option>
              </select>
              <button
                class="btn btn-primary"
                :disabled="downloadingTemplate"
                @click="downloadTemplate"
              >
                {{ downloadingTemplate ? '⏳ جاري التحميل...' : '📥 تحميل القالب' }}
              </button>
            </div>
          </div>

          <div class="action-divider"></div>

          <div class="action-group">
            <div class="action-label">
              <span class="action-num">2</span>
              <strong>فحص الملف قبل الرفع</strong>
              <small>تحقق من صحة البيانات بدون تنفيذ</small>
            </div>
            <div class="action-controls">
              <label class="btn btn-outline file-btn">
                🔍 فحص الملف
                <input type="file" accept=".xlsx,.xls" hidden @change="onValidate" />
              </label>
            </div>
          </div>

          <div class="action-divider"></div>

          <div class="action-group">
            <div class="action-label">
              <span class="action-num">3</span>
              <strong>رفع وتنفيذ الاسترداد</strong>
              <small>سيتم إضافة الكميات للمخزون فوراً</small>
            </div>
            <div class="action-controls">
              <label class="btn btn-success file-btn">
                📤 رفع وتنفيذ
                <input type="file" accept=".xlsx,.xls" hidden @change="onImport" />
              </label>
            </div>
          </div>
        </div>

        <!-- Result -->
        <div
          v-if="excelResult"
          class="card result-card"
          :class="excelResult.ok === false ? 'result-err' : 'result-ok'"
        >
          <div class="result-header">
            <span class="result-icon">{{
              excelResult.ok === false ? '❌' : excelResult.success !== undefined ? '✅' : '🔍'
            }}</span>
            <div>
              <strong>{{ excelResult.title }}</strong>
              <p>{{ excelResult.summary }}</p>
            </div>
          </div>

          <!-- معاينة الفحص -->
          <div v-if="excelResult.preview?.length" class="result-preview">
            <h4>معاينة (أول 5 منتجات صالحة):</h4>
            <table class="inv-table">
              <thead>
                <tr>
                  <th>الكود</th>
                  <th>المنتج</th>
                  <th>المخزن</th>
                  <th>الكمية</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(p, idx) in excelResult.preview" :key="`${p.sku}-${idx}`">
                  <td class="mono">{{ p.sku }}</td>
                  <td>{{ p.product_name }}</td>
                  <td>{{ p.warehouse_name || '—' }}</td>
                  <td class="qty">+{{ p.quantity }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- نتائج الاستيراد -->
          <div v-if="excelResult.details?.length" class="result-preview">
            <h4>المنتجات التي تم استردادها ({{ excelResult.details.length }}):</h4>
            <table class="inv-table">
              <thead>
                <tr>
                  <th>الكود</th>
                  <th>المنتج</th>
                  <th>المخزن</th>
                  <th>الكمية المُستردة</th>
                  <th>المخزون الجديد</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(d, idx) in excelResult.details" :key="`${d.sku}-${idx}`">
                  <td class="mono">{{ d.sku }}</td>
                  <td>{{ d.product_name }}</td>
                  <td>{{ d.warehouse_name || '—' }}</td>
                  <td class="qty success-text">+{{ d.quantity }}</td>
                  <td class="qty">{{ d.new_stock }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- الأخطاء -->
          <div
            v-if="excelResult.errors?.length || excelResult.failed?.length"
            class="result-errors"
          >
            <h4>⚠️ مشاكل ({{ (excelResult.errors || excelResult.failed || []).length }}):</h4>
            <ul>
              <li v-for="(e, i) in excelResult.errors || excelResult.failed || []" :key="i">
                {{ typeof e === 'string' ? e : `سطر ${e.row} — ${e.sku}: ${e.message}` }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== MOVEMENTS TAB ===== -->
    <template v-if="tab === 'movements'">
      <div class="card table-wrap">
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 14px;
            flex-wrap: wrap;
            gap: 10px;
          "
        >
          <h3 style="margin: 0">📋 سجل حركة المخزون</h3>
          <div style="display: flex; align-items: center; gap: 8px">
            <label style="font-size: 0.84rem; font-weight: 700">تصفية الحركات:</label>
            <select
              v-model="movementTypeFilter"
              class="warehouse-select"
              style="font-size: 0.85rem"
            >
              <option value="">كل الحركات</option>
              <option value="transfer">🔄 التحويلات فقط</option>
              <option value="sale">🛒 مبيعات</option>
              <option value="purchase">📥 مشتريات</option>
              <option value="wastage">🗑️ هالك</option>
              <option value="adjustment">✏️ تعديل مخزون</option>
            </select>
          </div>
        </div>

        <BaseTable
          :items="filteredMovements"
          :columns="movementsColumns"
          empty-message="لا توجد حركات"
        >
          <template #cell-product_name="{ item }">
            <div style="display: flex; flex-direction: column">
              <strong style="font-size: 0.9rem">{{ item.product_name }}</strong>
              <small class="mono" style="color: #888" v-if="item.product_sku">{{
                item.product_sku
              }}</small>
            </div>
          </template>
          <template #cell-movement_type="{ item }">
            <span :class="['move-badge', item.movement_type]">{{
              movementLabel(item.movement_type)
            }}</span>
          </template>
          <template #cell-quantity="{ item }">
            <span class="qty">{{ fmtQty(item.quantity) }}</span>
          </template>
          <template #cell-from_warehouse="{ item }">
            {{ item.from_warehouse || '—' }}
          </template>
          <template #cell-to_warehouse="{ item }">
            {{ item.to_warehouse || '—' }}
          </template>
          <template #cell-user_name="{ item }">
            {{ item.user_name || '—' }}
          </template>
          <template #cell-created_at="{ item }">
            {{ new Date(item.created_at).toLocaleString('en-GB') }}
          </template>
          <template #cell-actions="{ item }">
            <button
              v-if="item.movement_type === 'transfer'"
              class="icon-btn"
              title="طباعة إذن التحويل المخزني"
              @click="printTransferVoucherFromMovement(item)"
            >
              🖨️
            </button>
          </template>
        </BaseTable>
      </div>
    </template>

    <!-- Edit Modal -->
    <div v-if="showEdit" class="modal" @click.self="showEdit = false">
      <div class="card modal-content" style="max-width: 550px">
        <h3>✏️ تعديل الكميات وتوزيع المخزون</h3>
        <form @submit.prevent="saveEdit">
          <div class="form-group">
            <label>اسم المنتج</label>
            <input :value="editForm.name_ar" disabled style="font-weight: 700" />
          </div>

          <div class="form-group">
            <label>الحد الأدنى الإجمالي للمخزون (للتنبيه)</label>
            <input
              v-model.number="editForm.min_stock"
              type="number"
              min="0"
              step="0.001"
              required
              placeholder="مثال: 5"
            />
          </div>

          <div class="form-group" v-if="warehouses.length" style="margin-top: 10px">
            <div
              style="
                background: var(--bg-elevated, rgba(255, 255, 255, 0.03));
                border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
                padding: 14px;
                border-radius: 12px;
              "
            >
              <label
                style="
                  font-weight: 800;
                  font-size: 0.92rem;
                  color: var(--accent, #c77a2f);
                  margin-bottom: 4px;
                  display: flex;
                  align-items: center;
                  gap: 6px;
                "
              >
                📦 توزيع رصيد المخزون بالمنشأة
              </label>
              <small
                style="
                  display: block;
                  color: var(--text-muted, #888);
                  font-size: 0.78rem;
                  margin-bottom: 12px;
                "
              >
                حدد الكميات المتاحة في المخزن الرئيسي وفي مخزن المحل / الفرع:
              </small>
              <div class="grid grid-2" style="gap: 12px">
                <div v-for="w in warehouses" :key="w.id" class="form-group" style="margin: 0">
                  <label
                    style="
                      font-size: 0.82rem;
                      font-weight: 700;
                      display: flex;
                      align-items: center;
                      justify-content: space-between;
                      margin-bottom: 4px;
                    "
                  >
                    <span>{{ w.name_ar }}</span>
                    <span
                      v-if="
                        w.type === 'main' ||
                        w.code === 'MAIN' ||
                        (w.name_ar && w.name_ar.includes('رئيسي'))
                      "
                      style="
                        font-size: 0.72rem;
                        color: #3b82f6;
                        font-weight: 800;
                        background: rgba(59, 130, 246, 0.1);
                        padding: 2px 6px;
                        border-radius: 4px;
                      "
                      >🏢 مخزن رئيسي</span
                    >
                    <span
                      v-else
                      style="
                        font-size: 0.72rem;
                        color: #10b981;
                        font-weight: 800;
                        background: rgba(16, 185, 129, 0.1);
                        padding: 2px 6px;
                        border-radius: 4px;
                      "
                      >🏪 مخزن المحل / الفرع</span
                    >
                  </label>
                  <input
                    v-model.number="editForm.warehouse_stocks[w.id]"
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="أدخل الكمية..."
                    style="font-weight: 700; font-size: 1rem"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="modal-actions" style="margin-top: 16px">
            <button type="button" class="btn btn-outline" @click="showEdit = false">إلغاء</button>
            <button type="submit" class="btn btn-primary" :disabled="savingEdit">
              {{ savingEdit ? 'جاري الحفظ...' : 'حفظ التعديلات' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Transfer Modal -->
    <div v-if="showTransfer" class="modal" @click.self="showTransfer = false">
      <div class="card modal-content" style="max-width: 650px">
        <h3>🔄 تحويل بين المخازن وإذن نقل مخزني</h3>

        <!-- Mode Switcher -->
        <div class="tabs inline-tabs" style="margin-bottom: 14px">
          <button
            type="button"
            :class="{ active: transferMode === 'single' }"
            @click="transferMode = 'single'"
          >
            📦 تحويل صنف فردي
          </button>
          <button
            type="button"
            :class="{ active: transferMode === 'batch' }"
            @click="transferMode = 'batch'"
          >
            📋 إذن تحويل متعدد البنود
          </button>
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap">
          <button
            type="button"
            class="btn btn-sm btn-outline"
            style="
              font-size: 0.78rem;
              font-weight: 800;
              color: #3b82f6;
              border-color: rgba(59, 130, 246, 0.3);
            "
            @click="setTransferDirection('main', 'store')"
          >
            🏢 من الرئيسي ➔ 🏪 للفرع
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline"
            style="
              font-size: 0.78rem;
              font-weight: 800;
              color: #10b981;
              border-color: rgba(16, 185, 129, 0.3);
            "
            @click="setTransferDirection('store', 'main')"
          >
            🏪 من الفرع ➔ 🏢 للرئيسي
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline"
            style="font-size: 0.78rem; font-weight: 700"
            @click="swapTransferDirection"
          >
            🔄 عكس الاتجاه
          </button>
        </div>

        <form @submit.prevent="doTransfer">
          <div class="grid grid-2" style="gap: 12px">
            <div class="form-group">
              <label>من مخزن (المصدر) *</label>
              <select v-model.number="transfer.from_warehouse_id" required>
                <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name_ar }}</option>
              </select>
            </div>

            <div class="form-group">
              <label>إلى مخزن (الوجهة) *</label>
              <select v-model.number="transfer.to_warehouse_id" required>
                <option
                  v-for="w in warehouses"
                  :key="w.id"
                  :value="w.id"
                  :disabled="w.id === transfer.from_warehouse_id"
                >
                  {{ w.name_ar }}
                </option>
              </select>
            </div>
          </div>

          <!-- SINGLE ITEM MODE -->
          <template v-if="transferMode === 'single'">
            <div class="form-group">
              <label>المنتج (المصدر) *</label>
              <select
                v-model.number="transfer.product_id"
                required
                :disabled="loadingTransferProducts"
              >
                <option :value="null" disabled>
                  {{
                    loadingTransferProducts ? 'جاري تحميل المنتجات المتاحة...' : 'اختر منتج المصدر'
                  }}
                </option>
                <option v-for="p in transferProducts" :key="p.product_id" :value="p.product_id">
                  {{ p.name_ar }} (المتاح: {{ fmtQty(p.quantity) }})
                </option>
              </select>
            </div>

            <div class="form-group">
              <label>المنتج (الوجهة) *</label>
              <select v-model.number="transfer.to_product_id" required>
                <option :value="null" disabled>اختر منتج الوجهة</option>
                <option v-for="p in allProducts" :key="p.id" :value="p.id">
                  {{ p.name_ar }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label>الكمية المراد تحويلها *</label>
              <input
                v-model.number="transfer.quantity"
                type="number"
                min="0.001"
                step="0.001"
                required
              />
              <div
                v-if="selectedTransferProduct"
                style="
                  margin-top: 8px;
                  display: flex;
                  flex-direction: column;
                  gap: 6px;
                  font-size: 0.82rem;
                  font-weight: 700;
                "
              >
                <small style="color: #2e7d4f; display: block">
                  ℹ️ الكمية المتوفرة حالياً في مخزن المصدر:
                  {{ fmtQty(selectedTransferProduct.quantity) }}
                </small>
                <small style="color: #64748b; display: block">
                  ℹ️ الكمية المتوفرة حالياً في مخزن الوجهة:
                  {{
                    fmtQty(selectedTransferDestProduct ? selectedTransferDestProduct.quantity : 0)
                  }}
                </small>
              </div>
            </div>
          </template>

          <!-- BATCH ITEMS MODE -->
          <template v-else>
            <div style="margin-top: 10px; margin-bottom: 12px">
              <div
                style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-bottom: 8px;
                "
              >
                <label style="font-weight: 800; font-size: 0.9rem; color: var(--accent, #c77a2f)">
                  📋 بنود إذن التحويل المخزني ({{ batchItems.length }})
                </label>
                <button type="button" class="btn btn-sm btn-outline" @click="addBatchRow">
                  + إضافة بند للإذن
                </button>
              </div>

              <div
                v-for="(bItem, idx) in batchItems"
                :key="idx"
                style="
                  display: flex;
                  gap: 8px;
                  align-items: center;
                  background: var(--bg-elevated, rgba(255, 255, 255, 0.03));
                  padding: 8px;
                  border-radius: 8px;
                  margin-bottom: 8px;
                "
              >
                <div style="flex: 2">
                  <select v-model.number="bItem.product_id" required style="font-size: 0.84rem">
                    <option :value="null" disabled>اختر المنتج</option>
                    <option v-for="p in transferProducts" :key="p.product_id" :value="p.product_id">
                      {{ p.name_ar }} (المتاح: {{ fmtQty(p.quantity) }})
                    </option>
                  </select>
                </div>
                <div style="flex: 1">
                  <input
                    v-model.number="bItem.quantity"
                    type="number"
                    min="0.001"
                    step="0.001"
                    placeholder="الكمية..."
                    required
                    style="font-size: 0.84rem"
                  />
                </div>
                <button
                  type="button"
                  class="icon-btn btn-danger"
                  title="حذف البند"
                  :disabled="batchItems.length <= 1"
                  @click="removeBatchRow(idx)"
                >
                  ✕
                </button>
              </div>
            </div>
          </template>

          <div class="modal-actions">
            <button type="button" class="btn btn-outline" @click="showTransfer = false">
              إلغاء
            </button>
            <button type="submit" class="btn btn-primary" :disabled="loadingTransferProducts">
              <AppIcon name="save" :size="16" /> تنفيذ وإخراج إذن التحويل
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Printable Transfer Voucher Document Modal -->
    <div v-if="showVoucherModal" class="modal" @click.self="showVoucherModal = false">
      <div class="card modal-content transfer-voucher-doc" style="max-width: 650px; padding: 24px">
        <div
          class="voucher-header"
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid var(--border, #ccc);
            padding-bottom: 12px;
            margin-bottom: 16px;
          "
        >
          <div>
            <h2
              style="margin: 0; font-size: 1.3rem; font-weight: 800; color: var(--accent, #c77a2f)"
            >
              بن العجوز ERP
            </h2>
            <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: #666">
              إذن نقل وتحويل مخزني رسمي
            </p>
          </div>
          <div style="text-align: left">
            <span
              class="badge badge-info"
              style="font-size: 0.9rem; font-weight: 800; padding: 4px 10px"
              >{{ currentVoucher?.transfer_number || 'TRF-VOUCHER' }}</span
            >
            <small style="display: block; margin-top: 4px; color: #888">{{
              formatDateTime(currentVoucher?.created_at || Date.now())
            }}</small>
          </div>
        </div>

        <div
          class="voucher-meta"
          style="
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            background: rgba(0, 0, 0, 0.03);
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 16px;
          "
        >
          <div>
            <strong style="display: block; font-size: 0.8rem; color: #666"
              >من مخزن (المصدر):</strong
            >
            <span style="color: #3b82f6; font-weight: 800; font-size: 1rem">{{
              currentVoucher?.from_warehouse_name
            }}</span>
          </div>
          <div>
            <strong style="display: block; font-size: 0.8rem; color: #666"
              >إلى مخزن (الوجهة):</strong
            >
            <span style="color: #10b981; font-weight: 800; font-size: 1rem">{{
              currentVoucher?.to_warehouse_name
            }}</span>
          </div>
        </div>

        <table
          class="inv-table"
          style="width: 100%; border-collapse: collapse; margin-bottom: 20px"
        >
          <thead>
            <tr style="background: var(--bg-elevated, #f4f4f4); text-align: right">
              <th style="padding: 8px">#</th>
              <th style="padding: 8px">المنتج</th>
              <th style="padding: 8px">الكود</th>
              <th style="padding: 8px">الكمية المحولة</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(it, idx) in (currentVoucher?.items as any[]) || []"
              :key="idx"
              style="border-bottom: 1px solid rgba(0, 0, 0, 0.05)"
            >
              <td style="padding: 8px">{{ idx + 1 }}</td>
              <td style="padding: 8px; font-weight: 700">{{ it.product_name }}</td>
              <td style="padding: 8px" class="mono">{{ it.sku || '—' }}</td>
              <td style="padding: 8px; font-weight: 800; color: #2e7d4f">
                {{ fmtQty(it.quantity) }}
              </td>
            </tr>
          </tbody>
        </table>

        <div
          class="voucher-signatures"
          style="
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px dashed #ccc;
            text-align: center;
          "
        >
          <div>
            <small style="display: block; color: #666; margin-bottom: 24px"
              >توقيع المُسلّم (أمين مخزن المصدر)</small
            >
            <span>........................................</span>
          </div>
          <div>
            <small style="display: block; color: #666; margin-bottom: 24px"
              >توقيع المستلم (مسؤول مخزن الوجهة)</small
            >
            <span>........................................</span>
          </div>
        </div>

        <div
          class="modal-actions no-print"
          style="margin-top: 24px; display: flex; justify-content: space-between"
        >
          <button type="button" class="btn btn-outline" @click="showVoucherModal = false">
            إغلاق
          </button>
          <button type="button" class="btn btn-primary" @click="printVoucher">
            🖨️ طباعة إذن التحويل
          </button>
        </div>
      </div>
    </div>

    <!-- Wastage Modal -->
    <div v-if="showWastage" class="modal" @click.self="showWastage = false">
      <div class="card modal-content border-danger">
        <h3 class="text-danger">🗑️ تسجيل إعدام / هالك</h3>
        <p style="margin-bottom: 15px; font-size: 0.9em; color: #666">
          سيتم إنقاص هذه الكمية من المخزون وتحميل تكلفتها على المصروفات (قسم الهالك).
        </p>
        <form @submit.prevent="saveWastage">
          <div class="form-group">
            <label>المنتج</label><input :value="wastageForm.name_ar" disabled />
          </div>
          <div class="form-group">
            <label>الكمية المتاحة</label><input :value="fmtQty(wastageForm.current_qty)" disabled />
          </div>
          <div class="form-group">
            <label>كمية الهالك</label
            ><input
              v-model.number="wastageForm.quantity"
              type="number"
              min="0.001"
              :max="wastageForm.current_qty"
              step="0.001"
              required
            />
          </div>
          <div class="form-group">
            <label>السبب / ملاحظات</label
            ><input
              v-model="wastageForm.notes"
              required
              placeholder="مثال: انتهاء صلاحية، انسكاب..."
            />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" @click="showWastage = false">
              إلغاء
            </button>
            <button type="submit" class="btn btn-danger" :disabled="savingWastage">
              {{ savingWastage ? 'جاري التسجيل...' : 'تسجيل هالك' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue';
import { onBeforeUnmount } from 'vue';
import { inventory as inventoryApi, products as productsApi } from '@/api';
import BaseTable from '@/components/ui/BaseTable.vue';
import { formatMoney } from '@/utils/currency';
import { formatDateTime } from '@/utils/formatters';

const tab = ref('stock');
const items = ref<any[]>([]);
const loading = ref(false);
const movements = ref<any[]>([]);
const warehouses = ref<any[]>([]);
const warehouseId = ref('');
const returnWarehouseId = ref('');
const showTransfer = ref(false);
const showEdit = ref(false);
const showWastage = ref(false);
const savingEdit = ref(false);
const savingWastage = ref(false);
const downloadingTemplate = ref(false);
const msg = ref('');
const err = ref(false);
const excelResult = ref<any>(null);
const highlighted = ref<Record<string, any>>({});

const stockColumns = [
  { key: 'name_ar', label: 'المنتج' },
  { key: 'sku', label: 'الكود' },
  { key: 'purchase_price', label: 'سعر الشراء' },
  { key: 'total_quantity', label: 'إجمالي الكمية' },
  { key: 'stock_value', label: 'قيمة المخزون' },
  { key: 'main_quantity', label: 'المخزن الرئيسي' },
  { key: 'branch_quantity', label: 'مخزن الفرع' },
  { key: 'min_stock', label: 'الحد الأدنى' },
  { key: 'status', label: 'الحالة' },
  { key: 'actions', label: '', align: 'right' },
];

const getItemStockValue = (item: any) => {
  const qty = Number(item.total_quantity !== undefined ? item.total_quantity : item.quantity || 0);
  const cost = Number(item.purchase_price || 0);
  return qty * cost;
};

const totalInventoryValue = computed(() => {
  return items.value.reduce((sum: any, i: any) => sum + getItemStockValue(i), 0);
});

const mainWarehouseValue = computed(() => {
  return items.value.reduce((sum: any, i: any) => {
    const qty = Number(getMainQty(i) || 0);
    const cost = Number(i.purchase_price || 0);
    return sum + qty * cost;
  }, 0);
});

const branchWarehouseValue = computed(() => {
  return items.value.reduce((sum: any, i: any) => {
    const qty = Number(getBranchQty(i) || 0);
    const cost = Number(i.purchase_price || 0);
    return sum + qty * cost;
  }, 0);
});

const getMainQty = (item: any) => {
  if (item.main_quantity !== undefined && item.main_quantity !== null) return item.main_quantity;
  if (item.warehouse_breakdown && Array.isArray(item.warehouse_breakdown)) {
    const mainW = item.warehouse_breakdown.find(
      (w: any) =>
        w.warehouse_type === 'main' || (w.warehouse_name && w.warehouse_name.includes('رئيسي')),
    );
    if (mainW) return mainW.quantity;
  }
  return item.warehouse_name && item.warehouse_name.includes('رئيسي') ? item.quantity : 0;
};

const getBranchQty = (item: any) => {
  if (item.branch_quantity !== undefined && item.branch_quantity !== null)
    return item.branch_quantity;
  if (item.warehouse_breakdown && Array.isArray(item.warehouse_breakdown)) {
    const branchW = item.warehouse_breakdown.find(
      (w: any) =>
        w.warehouse_type !== 'main' && (!w.warehouse_name || !w.warehouse_name.includes('رئيسي')),
    );
    if (branchW) return branchW.quantity;
  }
  return item.warehouse_name && !item.warehouse_name.includes('رئيسي') ? item.quantity : 0;
};

const movementsColumns = [
  { key: 'product_name', label: 'المنتج' },
  { key: 'movement_type', label: 'النوع' },
  { key: 'quantity', label: 'الكمية' },
  { key: 'from_warehouse', label: 'من' },
  { key: 'to_warehouse', label: 'إلى' },
  { key: 'user_name', label: 'بواسطة' },
  { key: 'created_at', label: 'التاريخ' },
  { key: 'actions', label: 'إذن', align: 'right' },
];

const editForm = ref({
  id: null,
  product_id: null,
  name_ar: '',
  min_stock: 0,
  warehouse_stocks: {} as Record<string, number>,
});
const wastageForm = ref({
  product_id: null,
  warehouse_id: null,
  name_ar: '',
  current_qty: 0,
  quantity: 0,
  notes: '',
});
const transfer = ref({
  product_id: null,
  to_product_id: null,
  from_warehouse_id: null,
  to_warehouse_id: null,
  quantity: 1,
});

const transferMode = ref('single'); // 'single' | 'batch'
const batchItems = ref([{ product_id: null, to_product_id: null, quantity: 1, notes: '' }]);
const showVoucherModal = ref(false);
const currentVoucher = ref<Record<string, any> | null>(null);
const movementTypeFilter = ref('');

const filteredMovements = computed(() => {
  if (!movementTypeFilter.value) return movements.value;
  return movements.value.filter((m: any) => m.movement_type === movementTypeFilter.value);
});

const transferProducts = ref<any[]>([]);
const transferDestProducts = ref<any[]>([]);
const allProducts = ref<any[]>([]);
const loadingTransferProducts = ref(false);

const selectedTransferProduct = computed(() => {
  return transferProducts.value.find((p: any) => p.product_id === transfer.value.product_id);
});

const selectedTransferDestProduct = computed(() => {
  if (!transfer.value.to_product_id) return null;
  const targetId = Number(transfer.value.to_product_id);
  const found = transferDestProducts.value.find(
    (p: any) => Number(p.product_id || p.id) === targetId,
  );
  return found || { quantity: 0 };
});

const loadAllProducts = async () => {
  try {
    const res = await productsApi.list({ limit: 1000 });
    allProducts.value = (res.data || []).filter(
      (p: any) => p.is_active !== false && !p.has_active_recipe,
    );
  } catch (e: any) {
    console.error('Error loading products list:', e);
  }
};

const loadTransferProducts = async () => {
  if (!showTransfer.value) return; // Guard: only load when modal is open
  const fromWhId = transfer.value.from_warehouse_id;
  loadingTransferProducts.value = true;
  try {
    if (!allProducts.value.length) {
      await loadAllProducts();
    }
    const invMap = new Map();
    if (fromWhId) {
      const res = await inventoryApi.list({ warehouse_id: fromWhId });
      (res.data || []).forEach((inv: any) => {
        invMap.set(Number(inv.product_id), Number(inv.quantity || 0));
      });
    }

    transferProducts.value = allProducts.value.map((prod: any) => {
      let qty = 0;
      if (invMap.has(prod.id)) {
        qty = invMap.get(prod.id);
      } else if (prod.warehouse_breakdown && Array.isArray(prod.warehouse_breakdown)) {
        const wh = prod.warehouse_breakdown.find(
          (w: any) => Number(w.warehouse_id) === Number(fromWhId),
        );
        if (wh) qty = Number(wh.quantity || 0);
      }
      return {
        product_id: prod.id,
        id: prod.id,
        name_ar: prod.name_ar,
        sku: prod.sku,
        quantity: qty,
      };
    });
  } catch (e: any) {
    console.error('Error loading transfer products:', e);
    transferProducts.value = allProducts.value.map((prod: any) => ({
      product_id: prod.id,
      id: prod.id,
      name_ar: prod.name_ar,
      sku: prod.sku,
      quantity: 0,
    }));
  } finally {
    loadingTransferProducts.value = false;
  }
};

const loadTransferDestProducts = async () => {
  if (!showTransfer.value) return;
  const toWhId = transfer.value.to_warehouse_id;
  if (!toWhId) {
    transferDestProducts.value = [];
    return;
  }
  try {
    const res = await inventoryApi.list({ warehouse_id: toWhId });
    transferDestProducts.value = res.data || [];
  } catch (e: any) {
    console.error('Error loading destination products:', e);
  }
};

watch(
  () => transfer.value.from_warehouse_id,
  (newVal: any) => {
    if (newVal && warehouses.value.length === 2) {
      const otherWh = warehouses.value.find((w: any) => w.id !== newVal);
      if (otherWh) {
        transfer.value.to_warehouse_id = otherWh.id;
      }
    }
    loadTransferProducts();
    loadTransferDestProducts();
    transfer.value.product_id = null;
    transfer.value.to_product_id = null;
  },
);

watch(
  () => transfer.value.to_warehouse_id,
  () => {
    loadTransferDestProducts();
  },
);

watch(
  () => transfer.value.product_id,
  (newVal: any) => {
    transfer.value.to_product_id = newVal;
  },
);

const swapTransferDirection = () => {
  const temp = transfer.value.from_warehouse_id;
  transfer.value.from_warehouse_id = transfer.value.to_warehouse_id;
  transfer.value.to_warehouse_id = temp;
};

const setTransferDirection = (fromType: any, toType: any) => {
  const fromW = warehouses.value.find((w: any) =>
    fromType === 'main'
      ? w.type === 'main' || w.code === 'MAIN' || (w.name_ar && w.name_ar.includes('رئيسي'))
      : w.type === 'store' ||
        w.code === 'STORE' ||
        (w.name_ar && (w.name_ar.includes('فرع') || w.name_ar.includes('محل'))),
  );
  const toW = warehouses.value.find((w: any) =>
    toType === 'main'
      ? w.type === 'main' || w.code === 'MAIN' || (w.name_ar && w.name_ar.includes('رئيسي'))
      : w.type === 'store' ||
        w.code === 'STORE' ||
        (w.name_ar && (w.name_ar.includes('فرع') || w.name_ar.includes('محل'))),
  );
  if (fromW && toW) {
    transfer.value.from_warehouse_id = fromW.id;
    transfer.value.to_warehouse_id = toW.id;
  }
};

const openTransferProduct = (item: any) => {
  openTransferModal();
  setTimeout(() => {
    transfer.value.product_id = item.product_id;
    transfer.value.to_product_id = item.product_id;
  }, 100);
};

const openTransferModal = () => {
  if (warehouses.value.length) {
    transfer.value.from_warehouse_id = warehouses.value[0].id;
    transfer.value.to_warehouse_id = warehouses.value[1]?.id || warehouses.value[0].id;
    transfer.value.product_id = null;
    transfer.value.to_product_id = null;
    transfer.value.quantity = 1;

    showTransfer.value = true; // Set flag first so queries pass the guard
    loadTransferProducts();
    loadTransferDestProducts();
    loadAllProducts();
  } else {
    showTransfer.value = true;
  }
};

const fmtQty = (v: any) => {
  const n = Number(v || 0);
  return n % 1 === 0 ? n.toLocaleString('en-GB') : n.toFixed(3);
};
const movementLabel = (t: any) =>
  (
    ({
      sale: 'بيع',
      purchase: 'شراء',
      purchase_reversal: 'عكس شراء',
      transfer: 'تحويل',
      adjustment: 'تعديل',
      wastage: 'هالك',
      return: 'استرداد',
      consumption: 'استهلاك',
      production: 'إنتاج',
      opening_production: 'رصيد افتتاحي إنتاجي',
    }) as Record<string, string>
  )[t] ||
  t ||
  '—';

const setMsg = (text: any, isErr = false) => {
  msg.value = text;
  err.value = isErr;
};

const load = async () => {
  loading.value = true;
  const params = warehouseId.value ? { warehouse_id: warehouseId.value } : {};
  try {
    const [inv, mov, wh] = await Promise.all([
      inventoryApi.list(params),
      inventoryApi.movements({ limit: 50 }),
      inventoryApi.warehouses(),
    ]);
    items.value = inv.data || [];
    movements.value = mov.data || [];
    warehouses.value = wh.data || [];
    if (!transfer.value.from_warehouse_id && wh.data?.length) {
      transfer.value.from_warehouse_id = wh.data[0].id;
      transfer.value.to_warehouse_id = wh.data[1]?.id || wh.data[0].id;
    }
    setMsg('', false);
  } catch (e: any) {
    items.value = [];
    movements.value = [];
    setMsg(e.message || 'فشل تحميل بيانات المخزون.', true);
  } finally {
    loading.value = false;
  }
};

// Listen for cross-view inventory updates (e.g., after producing a recipe)
const onInventoryUpdated = (ev: any) => {
  try {
    const wid = ev?.detail?.warehouse_id;
    const pid = ev?.detail?.product_id;
    // if user has filtered to a specific warehouse, only reload when it matches
    if (!warehouseId.value || !wid || Number(warehouseId.value) === Number(wid)) {
      load();
    }
    // highlight the produced product row for visibility
    if (pid && wid) {
      const key = `${pid}-${wid}`;
      highlighted.value[key] = Date.now();
      // remove highlight after 5s
      setTimeout(() => {
        delete highlighted.value[key];
        highlighted.value = { ...highlighted.value };
      }, 5000);
    }
  } catch (e: any) {
    console.warn('inventory-updated handler error', e);
  }
};

onMounted(() => window.addEventListener('inventory-updated', onInventoryUpdated));
onBeforeUnmount(() => window.removeEventListener('inventory-updated', onInventoryUpdated));

const openEdit = async (row: any) => {
  if (!warehouses.value.length) {
    try {
      const wh = await inventoryApi.warehouses();
      warehouses.value = wh.data || [];
    } catch (e: any) {
      console.error('Failed to load warehouses:', e);
    }
  }

  const stocksObj: Record<string, number> = {};
  warehouses.value.forEach((w: any) => {
    stocksObj[w.id] = 0;
  });

  const breakdownList = Array.isArray(row.warehouse_breakdown)
    ? row.warehouse_breakdown
    : typeof row.warehouse_breakdown === 'string'
      ? JSON.parse(row.warehouse_breakdown)
      : [];

  if (breakdownList.length > 0) {
    breakdownList.forEach((wb: any) => {
      if (wb.warehouse_id) {
        stocksObj[wb.warehouse_id] = Number(wb.quantity || 0);
      }
    });
  } else if (row.warehouse_id) {
    stocksObj[row.warehouse_id] = Number(row.quantity || 0);
  }

  editForm.value = {
    id: row.id,
    product_id: row.product_id,
    name_ar: row.name_ar,
    min_stock: Number(row.min_stock || 0),
    warehouse_stocks: stocksObj,
  };
  showEdit.value = true;
};

const isHighlighted = (row: any) => {
  const key = `${row.product_id}-${row.warehouse_id}`;
  return Boolean(highlighted.value[key]);
};

const saveEdit = async () => {
  const min_stock = Number(editForm.value.min_stock);
  if (isNaN(min_stock) || min_stock < 0) {
    setMsg('أدخل حد أدنى صحيح للمخزون.', true);
    return;
  }
  savingEdit.value = true;
  try {
    const whEntries = Object.entries(editForm.value.warehouse_stocks || {});
    for (let i = 0; i < whEntries.length; i++) {
      const [whIdStr, qtyVal] = whEntries[i]!;
      const whId = Number(whIdStr);
      const targetQty = Number(qtyVal || 0);
      await inventoryApi.adjust({
        product_id: editForm.value.product_id,
        warehouse_id: whId,
        quantity: targetQty,
        min_stock: i === 0 ? min_stock : undefined,
        notes: 'تعديل يدوي من شاشة المخزون',
      });
    }
    showEdit.value = false;
    setMsg(`تم حفظ تعديل مخزون ${editForm.value.name_ar} بنجاح.`);
    await load();
  } catch (e: any) {
    setMsg(e.message || 'فشل حفظ التعديل.', true);
  } finally {
    savingEdit.value = false;
  }
};

const openWastage = (row: any) => {
  wastageForm.value = {
    product_id: row.product_id,
    warehouse_id: row.warehouse_id,
    name_ar: row.name_ar,
    current_qty: Number(row.quantity || 0),
    quantity: 0,
    notes: '',
  };
  showWastage.value = true;
};

const saveWastage = async () => {
  const qty = Number(wastageForm.value.quantity);
  if (isNaN(qty) || qty <= 0 || qty > wastageForm.value.current_qty) {
    setMsg('الكمية غير صحيحة أو أكبر من المتاح.', true);
    return;
  }
  savingWastage.value = true;
  try {
    const targetQty = wastageForm.value.current_qty - qty;
    await inventoryApi.adjust({
      product_id: wastageForm.value.product_id,
      warehouse_id: wastageForm.value.warehouse_id,
      quantity: targetQty,
      movement_type: 'wastage',
      notes: wastageForm.value.notes,
    });
    showWastage.value = false;
    setMsg(`تم تسجيل هالك لـ ${wastageForm.value.name_ar} بنجاح.`);
    await load();
  } catch (e: any) {
    setMsg(e.message || 'فشل تسجيل الهالك.', true);
  } finally {
    savingWastage.value = false;
  }
};

const addBatchRow = () => {
  batchItems.value.push({ product_id: null, to_product_id: null, quantity: 1, notes: '' });
};

const removeBatchRow = (idx: any) => {
  if (batchItems.value.length > 1) {
    batchItems.value.splice(idx, 1);
  }
};

const printVoucher = () => {
  window.print();
};

const printTransferVoucherFromMovement = (item: any) => {
  const matchCode = item.notes?.match(/TRF-\d{4}-\d+/);
  const code = matchCode ? matchCode[0] : `TRF-${item.id}`;
  currentVoucher.value = {
    transfer_number: code,
    from_warehouse_name: item.from_warehouse || 'المخزن المصدر',
    to_warehouse_name: item.to_warehouse || 'مخزن الوجهة',
    created_at: item.created_at,
    items: [
      {
        product_name: item.product_name,
        sku: item.product_sku || '',
        quantity: item.quantity,
      },
    ],
  };
  showVoucherModal.value = true;
};

const doTransfer = async () => {
  if (!transfer.value.from_warehouse_id || !transfer.value.to_warehouse_id) {
    setMsg('يرجى تحديد المخزن المصدر والوجهة.', true);
    return;
  }
  if (transfer.value.from_warehouse_id === transfer.value.to_warehouse_id) {
    setMsg('لا يمكن التحويل لنفس المخزن.', true);
    return;
  }

  let payload: Record<string, any> = {};

  if (transferMode.value === 'single') {
    const selectedProd = selectedTransferProduct.value;
    if (!selectedProd) {
      setMsg('يرجى اختيار منتج المصدر أولاً.', true);
      return;
    }
    if (!transfer.value.to_product_id) {
      setMsg('يرجى اختيار منتج الوجهة.', true);
      return;
    }
    if (transfer.value.quantity > Number(selectedProd.quantity)) {
      setMsg('الكمية المراد تحويلها أكبر من الكمية المتوفرة في المخزن المحدد.', true);
      return;
    }
    payload = {
      from_warehouse_id: transfer.value.from_warehouse_id,
      to_warehouse_id: transfer.value.to_warehouse_id,
      product_id: transfer.value.product_id,
      to_product_id: transfer.value.to_product_id,
      quantity: transfer.value.quantity,
      notes: 'تحويل يدوي بين المخازن',
    };
  } else {
    // Batch Mode
    const validItems = batchItems.value.filter(
      (it: any) => it.product_id && Number(it.quantity) > 0,
    );
    if (!validItems.length) {
      setMsg('يرجى تحديد منتج واحد على الأقل بكمية صحيحة.', true);
      return;
    }
    payload = {
      from_warehouse_id: transfer.value.from_warehouse_id,
      to_warehouse_id: transfer.value.to_warehouse_id,
      items: validItems.map((it: any) => ({
        product_id: it.product_id,
        to_product_id: it.to_product_id || it.product_id,
        quantity: Number(it.quantity),
        notes: it.notes || '',
      })),
    };
  }

  try {
    const res = await inventoryApi.transfer(payload);
    const fromW = warehouses.value.find((w: any) => w.id === transfer.value.from_warehouse_id);
    const toW = warehouses.value.find((w: any) => w.id === transfer.value.to_warehouse_id);

    const voucherItems =
      transferMode.value === 'single'
        ? [
            {
              product_name: selectedTransferProduct.value?.name_ar || 'منتج',
              sku: selectedTransferProduct.value?.sku || '',
              quantity: transfer.value.quantity,
            },
          ]
        : payload.items.map((it: any) => {
            const p =
              transferProducts.value.find((x: any) => x.product_id === it.product_id) ||
              allProducts.value.find((x: any) => x.id === it.product_id);
            return {
              product_name: p?.name_ar || `منتج ${it.product_id}`,
              sku: p?.sku || '',
              quantity: it.quantity,
            };
          });

    currentVoucher.value = {
      transfer_number: (res?.data as any)?.transfer_number || `TRF-${Date.now()}`,
      from_warehouse_name: fromW?.name_ar || 'المخزن المصدر',
      to_warehouse_name: toW?.name_ar || 'مخزن الوجهة',
      created_at: res?.data?.created_at || new Date().toISOString(),
      items: voucherItems,
    };

    showTransfer.value = false;
    showVoucherModal.value = true;
    setMsg('تم تنفيذ إذن التحويل بنجاح.');
    await load();
  } catch (e: any) {
    setMsg(e.message || 'فشل تحويل المخزون.', true);
  }
};

// ── Excel Return ──
const downloadTemplate = async () => {
  downloadingTemplate.value = true;
  try {
    const blob = (await inventoryApi.downloadReturnTemplate(
      returnWarehouseId.value ?? undefined,
    )) as unknown as Blob;
    const url = URL.createObjectURL(new Blob([blob]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory-return-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    setMsg(e.message || 'فشل تحميل القالب.', true);
  } finally {
    downloadingTemplate.value = false;
  }
};

const onValidate = async (e: any) => {
  const file = e.target.files?.[0];
  if (!file) return;
  excelResult.value = null;
  try {
    const res = await inventoryApi.validateReturnExcel(file);
    const d = res?.data || res;
    const success = Number(d.success || 0);
    excelResult.value = {
      ok: success > 0,
      title: success > 0 ? `✅ تم استرداد ${success} منتج بنجاح` : `❌ لم يتم تطبيق أي صف صالح`,
      summary: `${d.skipped || 0} صف تم تخطيه · ${d.failed?.length || 0} فشل`,
      details: d.details || [],
      failed: d.failed || [],
    };
    if (success > 0) {
      setMsg(`تم استرداد ${success} منتج للمخزون.`);
      await load();
    }
  } catch (e: any) {
    excelResult.value = {
      ok: false,
      title: 'فشل فحص الملف',
      summary: e.message,
      errors: [e.message],
    };
  }
  e.target.value = '';
};

const onImport = async (e: any) => {
  const file = e.target.files?.[0];
  if (!file) return;
  excelResult.value = null;
  try {
    const res = await inventoryApi.importReturnExcel(file, returnWarehouseId.value ?? undefined);
    const d = res?.data || res;
    excelResult.value = {
      ok: true,
      title: `✅ تم استرداد ${d.success} منتج بنجاح`,
      summary: `${d.skipped || 0} صف تم تخطيه · ${d.failed?.length || 0} فشل`,
      details: d.details || [],
      failed: d.failed || [],
    };
    if (d.success > 0) {
      setMsg(`تم استرداد ${d.success} منتج للمخزون.`);
      await load();
    }
  } catch (e: any) {
    excelResult.value = {
      ok: false,
      title: 'فشل الاستيراد',
      summary: e.message,
      errors: [e.message],
    };
  }
  e.target.value = '';
};

onMounted(load);
</script>

<style lang="scss" scoped>
.inventory-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
}

.inline-tabs {
  display: flex;
  gap: 6px;
  button {
    padding: 9px 16px;
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    cursor: pointer;
    font-weight: 700;
    font-size: 0.88rem;
    transition: var(--transition);
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

.warehouse-select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  font-size: 0.9rem;
}

/* Table */
.table-wrap {
  overflow-x: auto;
}
.inv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  th {
    background: var(--bg);
    padding: 10px 12px;
    text-align: right;
    font-weight: 700;
    color: var(--text-muted);
    font-size: 0.8rem;
    border-bottom: 2px solid var(--border);
    white-space: nowrap;
  }
  td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  tr:last-child td {
    border-bottom: 0;
  }
  tr:hover td {
    background: color-mix(in srgb, var(--primary) 3%, var(--bg-elevated));
  }
  .row-low td {
    background: color-mix(in srgb, var(--danger) 4%, var(--bg-elevated));
  }
}
.product-name {
  font-weight: 700;
}
.recipe-chip {
  display: inline-flex;
  align-items: center;
  margin-inline-start: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--info) 25%, transparent);
  background: color-mix(in srgb, var(--info) 10%, transparent);
  color: var(--info);
  font-size: 0.72rem;
  font-weight: 800;
}
.mono {
  font-family: monospace;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.qty {
  font-weight: 700;
}
.qty-low {
  color: var(--danger);
}
.success-text {
  color: #2e7d4f;
}
.empty {
  text-align: center;
  padding: 32px;
  color: var(--text-muted);
}

/* Movement badges */
.move-badge {
  padding: 3px 8px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  &.sale {
    background: rgba(46, 125, 79, 0.12);
    color: #2e7d4f;
  }
  &.purchase {
    background: rgba(99, 102, 241, 0.12);
    color: #4f46e5;
  }
  &.purchase_reversal {
    background: rgba(180, 35, 24, 0.12);
    color: #b42318;
  }
  &.transfer {
    background: rgba(8, 145, 178, 0.12);
    color: #0891b2;
  }
  &.adjustment {
    background: rgba(180, 83, 9, 0.12);
    color: #b45309;
  }
  &.return {
    background: rgba(46, 125, 79, 0.12);
    color: #2e7d4f;
  }
  &.consumption {
    background: rgba(180, 35, 24, 0.12);
    color: #b42318;
  }
  &.production {
    background: rgba(46, 125, 79, 0.12);
    color: #2e7d4f;
  }
  &.opening_production {
    background: rgba(180, 83, 9, 0.12);
    color: #b45309;
  }
}

/* Excel Return Page */
.excel-return-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  .info-icon {
    font-size: 2.5rem;
    flex-shrink: 0;
  }
  h3 {
    margin: 0 0 6px;
    color: var(--primary-dark);
  }
  p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.6;
  }
}

.steps-row {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  .step-card {
    flex: 1;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 18px;
    background: var(--bg-card);
    .step-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--primary);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.9rem;
      flex-shrink: 0;
    }
    strong {
      display: block;
      font-size: 0.9rem;
      color: var(--primary-dark);
      margin-bottom: 3px;
    }
    span {
      font-size: 0.8rem;
      color: var(--text-muted);
    }
  }
  .step-arrow {
    padding: 0 8px;
    color: var(--text-muted);
    font-size: 1.2rem;
    flex-shrink: 0;
  }
}

.actions-card {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  overflow: hidden;
}
.action-group {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  flex-wrap: wrap;
  .action-label {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    .action-num {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: var(--primary);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.82rem;
      flex-shrink: 0;
    }
    strong {
      font-size: 0.95rem;
      color: var(--text-strong);
    }
    small {
      display: block;
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 2px;
    }
  }
  .action-controls {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
}
.action-divider {
  height: 1px;
  background: var(--border);
  margin: 0;
}

.file-btn {
  cursor: pointer;
  position: relative;
  overflow: hidden;
  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
}
.btn-success {
  background: linear-gradient(135deg, #2e7d4f, #1a5c38);
  color: #fff;
  border: none;
  padding: 9px 18px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-weight: 700;
  font-size: 0.9rem;
  transition: var(--transition);
  &:hover {
    opacity: 0.9;
  }
}

/* Result Card */
.result-card {
  border-radius: var(--radius-md);
  overflow: hidden;
  &.result-ok {
    border: 1px solid rgba(46, 125, 79, 0.3);
    background: rgba(46, 125, 79, 0.04);
  }
  &.result-err {
    border: 1px solid rgba(180, 35, 24, 0.3);
    background: rgba(180, 35, 24, 0.04);
  }
  .result-header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 18px 20px;
    .result-icon {
      font-size: 1.8rem;
      flex-shrink: 0;
    }
    strong {
      display: block;
      font-size: 1rem;
      color: var(--text-strong);
      margin-bottom: 4px;
    }
    p {
      margin: 0;
      font-size: 0.88rem;
      color: var(--text-muted);
    }
  }
  .result-preview {
    padding: 0 20px 16px;
    h4 {
      margin: 0 0 10px;
      font-size: 0.9rem;
      color: var(--text-strong);
    }
  }
  .result-errors {
    padding: 0 20px 16px;
    h4 {
      margin: 0 0 8px;
      font-size: 0.9rem;
      color: var(--danger);
    }
    ul {
      margin: 0;
      padding-right: 20px;
      li {
        font-size: 0.85rem;
        color: var(--danger);
        margin: 4px 0;
      }
    }
  }
}

/* Modals */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-content {
  max-width: 440px;
  width: 90%;
}
.modal-actions {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.icon-btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  background: var(--bg-elevated);
  cursor: pointer;
  transition: var(--transition);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;

  &:hover {
    background: var(--bg);
    border-color: var(--primary-soft);
  }

  &.disabled,
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    filter: grayscale(1);
  }

  &.disabled:hover,
  &:disabled:hover {
    background: var(--bg-elevated);
    border-color: var(--border);
  }
}

.msg {
  font-weight: 700;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
}
.msg.ok {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
}
.msg.err {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
}

@media (max-width: 768px) {
  .steps-row {
    flex-direction: column;
    .step-arrow {
      transform: rotate(90deg);
    }
  }
  .action-group {
    flex-direction: column;
    align-items: flex-start;
  }
}

/* Highlight produced row briefly */
.row-highlight td {
  animation: inv-highlight 1s ease-in-out 0s 3;
}
@keyframes inv-highlight {
  0% {
    background: color-mix(in srgb, var(--success) 35%, transparent);
  }
  100% {
    background: transparent;
  }
}

.breakdown-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.pill {
  font-size: 0.78rem;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--bg-elevated, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  color: var(--text, #ccc);
  white-space: nowrap;
}
.pill-main {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.25);
  color: #3b82f6;
}
.pill-branch {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.25);
  color: #10b981;
}
.qty-total {
  font-size: 1.05rem;
  font-weight: 900;
  color: var(--accent, #c77a2f);
}
</style>
