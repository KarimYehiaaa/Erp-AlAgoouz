<template>
  <div class="branch-sales-page">

    <!-- Header -->
    <div class="page-header card">
      <div class="header-title">
        <span class="header-icon">🏪</span>
        <div>
          <h2>شاشة مبيعات الفرع</h2>
          <p>إدخال مبيعات محل البيع مع خصم المخزون تلقائياً</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn btn-outline" @click="showMode = 'manual'" :class="{ active: showMode === 'manual' }">
          ✏️ إدخال يدوي
        </button>
        <button class="btn btn-outline" @click="showMode = 'excel'" :class="{ active: showMode === 'excel' }">
          📊 رفع Excel
        </button>
        <button class="btn btn-outline" @click="openCountsModal">
          🔢 خصم من تعداد
        </button>
      </div>
    </div>

    <!-- Stats Row -->
    <div class="grid grid-3 stats-row">
      <StatCard label="مبيعات اليوم" :value="todayTotal" icon="💰" />
      <StatCard label="عدد الفواتير اليوم" :value="todayCount" icon="🧾" format="number" />
      <StatCard label="آخر عملية بيع" :value="lastSaleTime" icon="🕐" format="text" />
    </div>

    <!-- Manual Entry Mode -->
    <div v-if="showMode === 'manual'" class="manual-mode">
      <div class="grid grid-2 main-grid">

        <!-- Products Panel -->
        <div class="card products-panel">
          <div class="panel-header">
            <h3>🛍️ منتجات الفرع</h3>
            <div class="panel-filters">
              <input v-model="productSearch" type="text" placeholder="بحث عن منتج..." class="search-input" @input="filterProducts" />
              <select v-model="selectedCategory" @change="filterProducts" class="category-select">
                <option value="">كل التصنيفات</option>
                <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name_ar }}</option>
              </select>
            </div>
          </div>

          <div v-if="loadingProducts" class="loading-state">⏳ جاري تحميل المنتجات...</div>
          <div v-else-if="!filteredProducts.length" class="empty-state">
            <span>🔍</span>
            <p>لا توجد منتجات مطابقة</p>
          </div>
          <div v-else class="products-grid">
            <div
              v-for="product in filteredProducts"
              :key="product.id"
              class="product-card"
              :class="{
                'no-recipe': !product.has_recipe,
                'low-stock': hasLowIngredients(product),
                'selected': isInCart(product.id)
              }"
              @click="addToCart(product)"
            >
              <div class="product-name">{{ product.name_ar }}</div>
              <div class="product-meta">
                <span class="product-price">{{ formatMoney(product.sale_price) }}</span>
                <span class="product-cat">{{ product.category_name || '—' }}</span>
              </div>
              <div class="product-status">
                <span v-if="!product.has_recipe" class="badge badge-info" title="بدون وصفة - سيتم خصم المنتج نفسه من المخزون">خصم مباشر</span>
                <span v-else-if="hasLowIngredients(product)" class="badge badge-warning">⚠️ مخزون منخفض</span>
                <span v-else class="badge badge-success">✓ متاح</span>
              </div>
              <div v-if="isInCart(product.id)" class="cart-qty-badge">
                {{ getCartQty(product.id) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Cart & Form Panel -->
        <div class="card cart-panel">
          <h3>🛒 سلة المبيعات</h3>

          <!-- Cart Items -->
          <div v-if="!cart.length" class="empty-cart">
            <span>🛒</span>
            <p>اضغط على منتج لإضافته</p>
          </div>
          <div v-else class="cart-items">
            <div v-for="(item, idx) in cart" :key="item.product_id" class="cart-item">
              <div class="cart-item-info">
                <span class="cart-item-name">{{ item.name_ar }}</span>
                <span class="cart-item-price">{{ formatMoney(item.unit_price) }}</span>
              </div>
              <div class="cart-item-controls">
                <button class="qty-btn" @click="decreaseQty(idx)">−</button>
                <input
                  v-model.number="item.quantity"
                  type="number"
                  min="0.1"
                  step="0.1"
                  class="qty-input"
                  @change="validateQty(idx)"
                />
                <button class="qty-btn" @click="increaseQty(idx)">+</button>
                <button class="remove-btn" @click="removeFromCart(idx)">🗑️</button>
              </div>
              <div class="cart-item-total">{{ formatMoney(item.quantity * item.unit_price) }}</div>
            </div>
          </div>

          <!-- Cart Summary -->
          <div v-if="cart.length" class="cart-summary">
            <div class="summary-row">
              <span>المجموع الفرعي</span>
              <span>{{ formatMoney(cartSubtotal) }}</span>
            </div>
            <div class="summary-row discount-row">
              <span>خصم (ج.م)</span>
              <input v-model.number="saleForm.discount_amount" type="number" min="0" step="0.01" class="discount-input" />
            </div>
            <div class="summary-row total-row">
              <span>الإجمالي</span>
              <span class="total-amount">{{ formatMoney(cartTotal) }}</span>
            </div>
          </div>

          <!-- Sale Form -->
          <form @submit.prevent="submitManualSale" class="sale-form">
            <div class="form-row">
              <div class="form-group">
                <label>تاريخ البيع *</label>
                <input v-model="saleForm.sale_date" type="date" required />
              </div>
              <div class="form-group">
                <label>طريقة الدفع</label>
                <select v-model="saleForm.payment_method">
                  <option value="cash">نقدي</option>
                  <option value="card">بطاقة</option>
                  <option value="transfer">تحويل</option>
                  <option value="credit">آجل</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>ملاحظات</label>
              <textarea v-model="saleForm.notes" rows="2" placeholder="ملاحظات اختيارية..."></textarea>
            </div>

            <div v-if="saleError" class="alert alert-danger">{{ saleError }}</div>

            <button
              type="submit"
              class="btn btn-primary btn-submit"
              :disabled="saving || !cart.length"
            >
              {{ saving ? '⏳ جاري الحفظ...' : `💾 تسجيل البيع (${formatMoney(cartTotal)})` }}
            </button>
            <button type="button" class="btn btn-outline btn-clear" @click="clearCart" :disabled="!cart.length">
              🗑️ مسح السلة
            </button>
          </form>
        </div>
      </div>
    </div>

    <!-- Excel Mode -->
    <div v-if="showMode === 'excel'" class="excel-mode card">
      <h3>📊 استيراد مبيعات الفرع من Excel</h3>
      <p class="excel-note">
        حمّل القالب — فيه كل منتجات الفرع جاهزة بالكود والاسم والسعر.
        اكتب الكمية فقط لكل منتج بيع، ثم ارفع الملف.
      </p>

      <div class="excel-actions">
        <button class="btn btn-primary" @click="downloadBranchTemplate" :disabled="downloadingTemplate">
          {{ downloadingTemplate ? '⏳ جاري التحميل...' : '📥 تحميل القالب (منتجات جاهزة)' }}
        </button>
        <label class="btn btn-outline import-label">
          🔍 فحص الملف قبل الرفع
          <input type="file" accept=".xlsx,.xls" hidden @change="onValidateExcel" />
        </label>
        <label class="btn btn-outline import-label">
          📤 رفع واستيراد
          <input type="file" accept=".xlsx,.xls" hidden @change="onImportExcel" />
        </label>
      </div>

      <!-- نتيجة الفحص / الاستيراد -->
      <div v-if="excelMsg" class="import-result" :class="{ 'import-err': excelErr }">
        <p class="import-msg">{{ excelMsg }}</p>
        <ul v-if="excelDetails.length" class="import-details">
          <li v-for="(d, i) in excelDetails" :key="i">{{ d }}</li>
        </ul>
      </div>

      <!-- شرح الخطوات -->
      <div class="excel-steps">
        <div class="step">
          <div class="step-num">1</div>
          <div class="step-body">
            <strong>حمّل القالب</strong>
            <span>فيه كل منتجات الفرع جاهزة — كود + اسم + سعر</span>
          </div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div class="step-body">
            <strong>اكتب الكمية</strong>
            <span>في عمود «الكمية» فقط للمنتجات التي بيعت — اترك الباقي فارغاً</span>
          </div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div class="step-body">
            <strong>ارفع الملف</strong>
            <span>سيتم خصم المخزون تلقائياً بناءً على وصفة كل منتج</span>
          </div>
        </div>
      </div>

      <!-- معاينة المنتجات في القالب -->
      <details class="excel-guide" open>
        <summary>👁️ معاينة شكل القالب ({{ allProducts.length }} منتج)</summary>
        <div class="guide-table-wrap">
          <table class="guide-table">
            <thead>
              <tr>
                <th>تاريخ_البيع</th>
                <th>كود_المنتج</th>
                <th>اسم_المنتج</th>
                <th>التصنيف</th>
                <th>سعر_البيع</th>
                <th style="background:#2e7d4f">الكمية ← اكتبها هنا</th>
                <th>طريقة_الدفع</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in allProducts.slice(0, 8)" :key="p.id">
                <td class="muted">{{ todayStr }}</td>
                <td><code>{{ p.sku }}</code></td>
                <td>{{ p.name_ar }}</td>
                <td class="muted">{{ p.category_name || '—' }}</td>
                <td>{{ formatMoney(p.sale_price) }}</td>
                <td class="qty-col">___</td>
                <td class="muted">cash</td>
              </tr>
              <tr v-if="allProducts.length > 8">
                <td colspan="7" class="more-row">... و {{ allProducts.length - 8 }} منتج آخر في القالب</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="guide-note">⚠️ لا تعدّل عمود «كود_المنتج» — هو المرجع الأساسي للاستيراد</p>
      </details>
    </div>

    <!-- Counts Modal -->
    <div v-if="countsModal" class="modal" @click.self="countsModal = false">
      <div class="card modal-content counts-modal">
        <h3>🔢 خصم من تعداد المنتجات</h3>
        <p class="muted">أدخل الكميات المباعة لكل منتج وسيتم خصم المخزون تلقائياً (بناءً على الوصفة إن وجدت).</p>
        <div class="counts-table-wrap">
          <table class="counts-table">
            <thead>
              <tr><th>الكود</th><th>المنتج</th><th>التصنيف</th><th>سعر البيع</th><th style="width:120px">الكمية</th></tr>
            </thead>
            <tbody>
              <tr v-for="p in allProducts" :key="p.id">
                <td><code>{{ p.sku }}</code></td>
                <td>{{ p.name_ar }}</td>
                <td class="muted">{{ p.category_name || '—' }}</td>
                <td>{{ formatMoney(p.sale_price) }}</td>
                <td><input type="number" min="0" step="0.001" v-model.number="counts[p.id]" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" @click="countsModal = false">إلغاء</button>
          <button class="btn btn-primary" @click="submitCounts">تنفيذ الخصم</button>
        </div>
      </div>
    </div>

    <!-- Today's Sales History -->
    <div class="card sales-history">
      <div class="history-header">
        <h3>📋 سجل مبيعات الفرع</h3>
        <div class="history-filters">
          <input v-model="historyFilters.from_date" type="date" @change="loadHistory" />
          <span>إلى</span>
          <input v-model="historyFilters.to_date" type="date" @change="loadHistory" />
        </div>
      </div>

      <div v-if="loadingHistory" class="loading-state">⏳ جاري التحميل...</div>
      <div v-else class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th>رقم البيع</th>
              <th>التاريخ</th>
              <th>المنتجات</th>
              <th>الإجمالي</th>
              <th>الدفع</th>
              <th>الحالة</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sale in salesHistory" :key="sale.id">
              <td class="sale-number">{{ sale.sale_number }}</td>
              <td>{{ formatDate(sale.sale_date) }}</td>
              <td>
                <span class="items-count">{{ sale.items_count || 0 }} منتج</span>
              </td>
              <td class="amount">{{ formatMoney(sale.total_amount) }}</td>
              <td>
                <span :class="paymentBadge(sale.payment_status)">{{ paymentLabel(sale.payment_status) }}</span>
              </td>
              <td>
                <span :class="statusBadge(sale.status)">{{ statusLabel(sale.status) }}</span>
              </td>
              <td>
                <button
                  v-if="sale.status === 'completed'"
                  class="btn-sm btn-danger"
                  @click="returnSale(sale)"
                  title="استرداد"
                >↩️</button>
              </td>
            </tr>
            <tr v-if="!salesHistory.length">
              <td colspan="7" class="empty">لا توجد مبيعات في هذه الفترة</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import StatCard from '@/components/StatCard.vue';
import { sales as salesApi, products as productsApi } from '@/api';
import { formatMoney } from '@/utils/currency';
import { useProductMeta } from '@/composables/useProductMeta';

// ─── helpers ───────────────────────────────────────────────────────────────
const localTodayYmd = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const today = localTodayYmd();

const formatDate = (d) => {
  const val = d?.split?.('T')?.[0] || d;
  if (!val) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, day] = val.split('-');
    return `${day}/${m}/${y}`;
  }
  return new Date(val).toLocaleDateString('en-GB');
};

const { categories, loadMeta } = useProductMeta();

// ─── state ─────────────────────────────────────────────────────────────────
const showMode = ref('manual');
const loadingProducts = ref(false);
const loadingHistory = ref(false);
const saving = ref(false);
const saleError = ref('');
const downloadingTemplate = ref(false);
const todayStr = today;

const allProducts = ref([]);
const filteredProducts = ref([]);
const productSearch = ref('');
const selectedCategory = ref('');

const cart = ref([]);
const saleForm = ref({
  sale_date: today,
  payment_method: 'cash',
  discount_amount: 0,
  warehouse_id: null,
  notes: '',
});

const salesHistory = ref([]);
const historyFilters = ref({ from_date: today.slice(0, 8) + '01', to_date: today });

// Excel state
const excelMsg = ref('');
const excelErr = ref(false);
const excelDetails = ref([]);
const countsModal = ref(false);
const counts = ref({});

// ─── computed ──────────────────────────────────────────────────────────────
const cartSubtotal = computed(() =>
  cart.value.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
);
const cartTotal = computed(() =>
  Math.max(0, cartSubtotal.value - (saleForm.value.discount_amount || 0))
);

const todayTotal = computed(() =>
  salesHistory.value
    .filter((s) => s.status === 'completed' && (s.sale_date || '').startsWith(today))
    .reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0)
);
const todayCount = computed(() =>
  salesHistory.value.filter((s) => s.status === 'completed' && (s.sale_date || '').startsWith(today)).length
);
const lastSaleTime = computed(() => {
  const todaySales = salesHistory.value.filter((s) => (s.sale_date || '').startsWith(today));
  if (!todaySales.length) return '—';
  const last = todaySales[0];
  const d = new Date(last.created_at);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
});

// ─── product helpers ────────────────────────────────────────────────────────
const hasLowIngredients = (product) => {
  if (!product.has_recipe || !Array.isArray(product.recipe_items)) return false;
  return product.recipe_items.some((ri) => {
    const needed = Number(ri.quantity);
    const available = Number(ri.stock_available || 0);
    return available < needed;
  });
};

const isInCart = (productId) => cart.value.some((i) => i.product_id === productId);
const getCartQty = (productId) => {
  const item = cart.value.find((i) => i.product_id === productId);
  return item ? item.quantity : 0;
};

// ─── product actions ────────────────────────────────────────────────────────
const filterProducts = () => {
  let list = allProducts.value;
  if (selectedCategory.value) {
    list = list.filter((p) => p.category_id == selectedCategory.value);
  }
  if (productSearch.value.trim()) {
    const q = productSearch.value.trim().toLowerCase();
    list = list.filter((p) => p.name_ar.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
  }
  filteredProducts.value = list;
};

const loadProducts = async () => {
  loadingProducts.value = true;
  try {
    const params = {};
    if (saleForm.value.warehouse_id) params.warehouse_id = saleForm.value.warehouse_id;
    const prodRes = await productsApi.branchProducts(params);
    allProducts.value = prodRes.data;
    await loadMeta();
    filterProducts();
  } catch (e) {
    console.error('فشل تحميل المنتجات:', e.message);
  } finally {
    loadingProducts.value = false;
  }
};

// reload products when selected warehouse for the sale changes
watch(() => saleForm.value.warehouse_id, (v, o) => {
  if (v !== o) loadProducts();
});

// ─── cart actions ───────────────────────────────────────────────────────────
const addToCart = (product) => {
  const existing = cart.value.find((i) => i.product_id === product.id);
  if (existing) {
    existing.quantity = parseFloat((existing.quantity + 1).toFixed(3));
  } else {
    // set sale warehouse from product primary_warehouse_id if not set
    if (!saleForm.value.warehouse_id && product.primary_warehouse_id) {
      saleForm.value.warehouse_id = product.primary_warehouse_id;
    }
    cart.value.push({
      product_id: product.id,
      name_ar: product.name_ar,
      unit_price: parseFloat(product.sale_price || 0),
      quantity: 1,
      has_recipe: product.has_recipe,
    });
  }
};

const increaseQty = (idx) => {
  cart.value[idx].quantity = parseFloat((cart.value[idx].quantity + 1).toFixed(3));
};
const decreaseQty = (idx) => {
  if (cart.value[idx].quantity > 0.1) {
    cart.value[idx].quantity = parseFloat((cart.value[idx].quantity - 1).toFixed(3));
  } else {
    cart.value.splice(idx, 1);
  }
};
const validateQty = (idx) => {
  const qty = parseFloat(cart.value[idx].quantity);
  if (!qty || qty <= 0) cart.value.splice(idx, 1);
};
const removeFromCart = (idx) => cart.value.splice(idx, 1);
const clearCart = () => {
  cart.value = [];
  saleForm.value.discount_amount = 0;
  saleForm.value.notes = '';
  saleForm.value.warehouse_id = null;
  saleError.value = '';
};

// ─── submit sale ────────────────────────────────────────────────────────────
const submitManualSale = async () => {
  if (!cart.value.length) return;
  saleError.value = '';

  saving.value = true;
  try {
    await salesApi.create({
      sale_type: 'branch',
      sale_date: saleForm.value.sale_date,
      warehouse_id: saleForm.value.warehouse_id || null,
      payment_method: saleForm.value.payment_method,
      payment_status: 'paid',
      discount_amount: saleForm.value.discount_amount || 0,
      notes: saleForm.value.notes || null,
      items: cart.value.map((i) => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        discount_amount: 0,
      })),
    });
    clearCart();
    await Promise.all([loadHistory(), loadProducts()]);
  } catch (e) {
    saleError.value = e.message || 'فشل تسجيل البيع';
  } finally {
    saving.value = false;
  }
};

// ─── history ────────────────────────────────────────────────────────────────
const loadHistory = async () => {
  loadingHistory.value = true;
  try {
    const res = await salesApi.list({
      sale_type: 'branch',
      entry_mode: 'pos',
      from_date: historyFilters.value.from_date,
      to_date: historyFilters.value.to_date,
      limit: 100,
    });
    salesHistory.value = res.data;
  } catch (e) {
    console.error('فشل تحميل السجل:', e.message);
  } finally {
    loadingHistory.value = false;
  }
};

const returnSale = async (sale) => {
  if (!confirm(`تأكيد استرداد البيع ${sale.sale_number}؟ سيتم إرجاع المخزون.`)) return;
  try {
    await salesApi.return(sale.id, { notes: 'استرداد من شاشة مبيعات الفرع' });
    await Promise.all([loadHistory(), loadProducts()]);
  } catch (e) {
    alert(e.message || 'فشل الاسترداد');
  }
};

// ─── badge helpers ──────────────────────────────────────────────────────────
const statusLabel = (s) => ({ completed: 'مكتمل', returned: 'مسترد', cancelled: 'ملغي' }[s] || s);
const statusBadge = (s) => ['badge', s === 'completed' ? 'badge-success' : s === 'returned' ? 'badge-danger' : 'badge-warning'];
const paymentLabel = (s) => ({ paid: 'مدفوع', unpaid: 'غير مدفوع', partial: 'جزئي', refunded: 'مسترد' }[s] || s);
const paymentBadge = (s) => ['badge', s === 'paid' ? 'badge-success' : s === 'unpaid' ? 'badge-danger' : 'badge-warning'];

// ─── Excel ──────────────────────────────────────────────────────────────────
const downloadBranchTemplate = async () => {
  downloadingTemplate.value = true;
  try {
    const blob = await salesApi.downloadBranchTemplate();
    const url = URL.createObjectURL(new Blob([blob]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'branch-sales-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(e.message || 'فشل تحميل القالب');
  } finally {
    downloadingTemplate.value = false;
  }
};

const onValidateExcel = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  excelMsg.value = 'جاري فحص الملف...';
  excelErr.value = false;
  excelDetails.value = [];
  try {
    const res = await salesApi.branchValidateExcel(file);
    const d = res.data;
    excelMsg.value = d.ok
      ? `✅ الملف سليم: ${d.itemCount} منتج في ${d.groupCount} فاتورة جاهزة للاستيراد`
      : '❌ الملف فيه أخطاء — راجع القائمة أدناه';
    excelErr.value = !d.ok;
    excelDetails.value = [
      ...(d.parseErrors || []).map((err) => `سطر ${err.row}: ${err.message}`),
      ...(d.preview || []).map((p) => `✓ ${p.sale_date} — ${p.items_count} منتج: ${p.sample}`),
    ];
  } catch (err) {
    excelErr.value = true;
    excelMsg.value = err.message || 'فشل فحص الملف';
  }
  e.target.value = '';
};

const onImportExcel = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  excelMsg.value = 'جاري الاستيراد...';
  excelErr.value = false;
  excelDetails.value = [];
  try {
    const res = await salesApi.branchImportExcel(file);
    const d = res.data;
    excelMsg.value = `✅ تم استيراد ${d.success} فاتورة (${d.itemsImported || 0} منتج)` +
      (d.failed?.length ? ` — فشل ${d.failed.length}` : '');
    excelDetails.value = [
      ...(d.parseErrors || []).map((err) => `تحذير سطر ${err.row}: ${err.message}`),
      ...(d.failed || []).map((err) => `❌ ${err.sale_date}: ${err.message}`),
    ];
    excelErr.value = d.success === 0;
    await Promise.all([loadHistory(), loadProducts()]);
  } catch (err) {
    excelErr.value = true;
    excelMsg.value = err.message || 'فشل الاستيراد';
  }
  e.target.value = '';
};

onMounted(() => {
// ─── lifecycle ──────────────────────────────────────────────────────────────
import { onBeforeUnmount } from 'vue';

const onInventoryUpdated = (e) => {
  try {
    loadProducts();
    // history doesn't need full reload for stock changes
  } catch (err) {
    console.warn('inventory-updated handler error', err);
  }
};

onMounted(() => {
  loadProducts();
  loadHistory();
  window.addEventListener('inventory-updated', onInventoryUpdated);
});

onBeforeUnmount(() => {
  window.removeEventListener('inventory-updated', onInventoryUpdated);
});

const openCountsModal = () => {
  // initialize counts map with zeroes
  counts.value = {};
  for (const p of allProducts.value) counts.value[p.id] = 0;
  countsModal.value = true;
};

const submitCounts = async () => {
  const items = [];
  for (const [pid, qty] of Object.entries(counts.value || {})) {
    const q = Number(qty || 0);
    if (q > 0) {
      const prod = allProducts.value.find((x) => String(x.id) === String(pid));
      items.push({ product_id: Number(pid), quantity: q, unit_price: prod ? Number(prod.sale_price || 0) : 0 });
    }
  }
  if (!items.length) {
    alert('أدخل كميات على الأقل لمنتج واحد.');
    return;
  }

  countsModal.value = false;
  try {
    saving.value = true;
    await salesApi.create({
      sale_type: 'branch',
      sale_date: saleForm.value.sale_date,
      warehouse_id: saleForm.value.warehouse_id || null,
      payment_method: saleForm.value.payment_method || 'cash',
      payment_status: 'paid',
      discount_amount: 0,
      notes: 'خصم حسب تعداد المنتجات',
      items,
    });
    counts.value = {};
    await Promise.all([loadHistory(), loadProducts()]);
  } catch (e) {
    alert(e.message || 'فشل تنفيذ الخصم من التعداد');
  } finally {
    saving.value = false;
  }
};
</script>

<style lang="scss" scoped>
.branch-sales-page { display: flex; flex-direction: column; gap: 20px; }

/* Header */
.page-header {
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;
  .header-title { display: flex; align-items: center; gap: 14px;
    .header-icon { font-size: 2rem; }
    h2 { margin: 0; font-size: 1.3rem; color: var(--primary-dark); }
    p { margin: 4px 0 0; font-size: 0.85rem; color: var(--text-muted); }
  }
  .header-actions { display: flex; gap: 8px; }
}

/* Mode toggle */
.btn-outline {
  padding: 8px 18px; border: 2px solid var(--border); border-radius: var(--radius);
  background: var(--bg-card); cursor: pointer; font-weight: 600; transition: var(--transition);
  &.active, &:hover { background: var(--primary); color: #fff; border-color: var(--primary); }
}

/* Stats */
.stats-row { margin-bottom: 4px; }

/* Main grid */
.main-grid { align-items: start; }

/* Products Panel */
.products-panel {
  .panel-header {
    display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;
    h3 { margin: 0; color: var(--primary-dark); }
    .panel-filters { display: flex; gap: 8px; flex-wrap: wrap; }
  }
  .search-input, .category-select {
    flex: 1; min-width: 120px; padding: 8px 12px; border: 1px solid var(--border);
    border-radius: var(--radius); background: var(--bg); font-size: 0.9rem;
  }
}

.products-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px;
  max-height: 520px; overflow-y: auto; padding: 4px;
}

.product-card {
  position: relative; padding: 12px; border: 2px solid var(--border); border-radius: var(--radius);
  cursor: pointer; transition: var(--transition); background: var(--bg-card); text-align: center;
  &:hover { border-color: var(--primary); transform: translateY(-2px); box-shadow: var(--shadow-sm); }
  &.selected { border-color: var(--primary); background: rgba(var(--primary-rgb, 100,60,20), 0.06); }
  &.no-recipe { border-style: dashed; }
  &.low-stock { border-color: #f59e0b; }
  .product-name { font-weight: 700; font-size: 0.88rem; margin-bottom: 6px; line-height: 1.3; }
  .product-meta { display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px; }
  .product-price { font-weight: 700; color: var(--primary-dark); }
  .product-status { margin-top: 4px; }
  .cart-qty-badge {
    position: absolute; top: -8px; left: -8px; background: var(--primary); color: #fff;
    border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center;
    justify-content: center; font-size: 0.75rem; font-weight: 800;
  }
}

/* Cart Panel */
.cart-panel {
  h3 { margin-bottom: 16px; color: var(--primary-dark); }
  .empty-cart { text-align: center; padding: 40px 20px; color: var(--text-muted);
    span { font-size: 2.5rem; display: block; margin-bottom: 8px; }
  }
}

.cart-items { max-height: 280px; overflow-y: auto; margin-bottom: 12px; }
.cart-item {
  display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid var(--border);
  border-radius: var(--radius); margin-bottom: 8px; background: var(--bg);
  .cart-item-info { display: flex; justify-content: space-between; align-items: center;
    .cart-item-name { font-weight: 600; font-size: 0.9rem; }
    .cart-item-price { color: var(--text-muted); font-size: 0.85rem; }
  }
  .cart-item-controls { display: flex; align-items: center; gap: 6px; }
  .qty-btn {
    width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 6px;
    background: var(--bg-card); cursor: pointer; font-size: 1rem; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    &:hover { background: var(--primary); color: #fff; }
  }
  .qty-input { width: 60px; text-align: center; padding: 4px; border: 1px solid var(--border); border-radius: 6px; }
  .remove-btn { background: none; border: none; cursor: pointer; font-size: 1rem; margin-right: auto; }
  .cart-item-total { font-weight: 700; color: var(--primary-dark); text-align: left; font-size: 0.95rem; }
}

.cart-summary {
  border-top: 2px solid var(--border); padding-top: 12px; margin-bottom: 16px;
  .summary-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 0.9rem; }
  .discount-row .discount-input { width: 90px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; text-align: center; }
  .total-row { font-weight: 800; font-size: 1.05rem; border-top: 1px solid var(--border); padding-top: 8px; margin-top: 4px; }
  .total-amount { color: var(--primary-dark); font-size: 1.15rem; }
}

.sale-form {
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .btn-submit { width: 100%; margin-bottom: 8px; padding: 12px; font-size: 1rem; }
  .btn-clear { width: 100%; }
}

.alert-danger { background: rgba(180,35,24,0.08); border: 1px solid rgba(180,35,24,0.3); color: #b42318; padding: 10px 14px; border-radius: var(--radius); margin-bottom: 12px; font-size: 0.9rem; }

/* Excel Mode */
.excel-mode {
  h3 { margin-bottom: 8px; color: var(--primary-dark); }
  .excel-note { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px; }
  .excel-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
  .import-label { cursor: pointer; }
}

/* Steps */
.excel-steps {
  display: flex; gap: 0; margin-bottom: 20px; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden;
  .step {
    flex: 1; display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px;
    border-left: 1px solid var(--border);
    &:last-child { border-left: none; }
    .step-num {
      width: 28px; height: 28px; border-radius: 50%; background: var(--primary); color: #fff;
      display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.9rem; flex-shrink: 0;
    }
    .step-body {
      display: flex; flex-direction: column; gap: 3px;
      strong { font-size: 0.9rem; color: var(--primary-dark); }
      span { font-size: 0.8rem; color: var(--text-muted); }
    }
  }
}

.import-result { padding: 12px; border-radius: var(--radius); background: rgba(46,125,79,0.08); border: 1px solid rgba(46,125,79,0.3);
  &.import-err { background: rgba(180,35,24,0.08); border-color: rgba(180,35,24,0.3); }
  .import-msg { margin: 0 0 8px; font-weight: 700; }
  .import-details { margin: 0; padding-right: 20px; font-size: 0.88rem; li { margin: 3px 0; } }
}

.excel-guide {
  margin-top: 16px; border: 1px solid var(--border); border-radius: var(--radius); padding: 12px;
  summary { cursor: pointer; font-weight: 700; color: var(--primary-dark); margin-bottom: 8px; }
  .guide-note { color: var(--text-muted); font-size: 0.85rem; margin-top: 10px; }
  .guide-table-wrap { overflow-x: auto; margin-top: 10px; }
  .guide-table {
    width: 100%; border-collapse: collapse; font-size: 0.82rem;
    th, td { border: 1px solid var(--border); padding: 7px 10px; text-align: right; }
    th { background: var(--primary); color: #fff; }
    .muted { color: var(--text-muted); }
    .qty-col { background: rgba(46,125,79,0.08); font-weight: 700; color: #2e7d4f; text-align: center; }
    .more-row { text-align: center; color: var(--text-muted); font-style: italic; }
    code { background: var(--bg); padding: 1px 5px; border-radius: 4px; font-size: 0.8rem; }
  }
}

/* History */
.sales-history {
  .history-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;
    h3 { margin: 0; color: var(--primary-dark); }
    .history-filters { display: flex; align-items: center; gap: 8px; font-size: 0.9rem;
      input { padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius); }
    }
  }
  .history-table-wrap { overflow-x: auto; }
}

.history-table { width: 100%; border-collapse: collapse; font-size: 0.9rem;
  th, td { padding: 10px 12px; text-align: right; border-bottom: 1px solid var(--border); }
  th { background: var(--bg); font-weight: 700; color: var(--text-muted); font-size: 0.82rem; }
  .sale-number { font-family: monospace; font-size: 0.82rem; color: var(--text-muted); }
  .amount { font-weight: 700; color: var(--primary-dark); }
  .items-count { background: var(--bg); padding: 2px 8px; border-radius: 20px; font-size: 0.8rem; }
  .empty { text-align: center; color: var(--text-muted); padding: 24px; }
}

.btn-sm { padding: 4px 10px; border: none; border-radius: 6px; cursor: pointer; font-size: 0.82rem; }
.btn-danger { background: rgba(180,35,24,0.1); color: #b42318; border: 1px solid rgba(180,35,24,0.3);
  &:hover { background: #b42318; color: #fff; }
}

.loading-state { text-align: center; padding: 32px; color: var(--text-muted); font-size: 1rem; }
.empty-state { text-align: center; padding: 32px; color: var(--text-muted);
  span { font-size: 2rem; display: block; margin-bottom: 8px; }
}

@media (max-width: 900px) {
  .main-grid { grid-template-columns: 1fr; }
  .products-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
}
</style>
