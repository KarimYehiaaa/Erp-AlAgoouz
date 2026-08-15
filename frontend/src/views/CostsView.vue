<template>
  <div class="costs-page">
    <!-- Header -->
    <div class="page-header card">
      <div class="header-title">
        <span class="header-icon">🧪</span>
        <div>
          <h2>تكاليف المنتجات والوصفات</h2>
          <p>تحليل التكاليف، هوامش الربح، محاكاة التضخم، تعديل الأسعار، والتحكم في الهدر</p>
        </div>
      </div>
      <div class="header-meta">
        <div class="meta-item">
          <span class="meta-label">إجمالي المنتجات</span>
          <span class="meta-value">{{ products.length }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">متوسط هامش الربح</span>
          <span class="meta-value">{{ avgMargin }}%</span>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="costs-tabs card">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'analysis' }"
        @click="activeTab = 'analysis'"
      >
        📊 تحليل هوامش الربح
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'simulator' }"
        @click="activeTab = 'simulator'"
      >
        🔮 محاكي التضخم (What-If)
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'bulk_adjust' }"
        @click="activeTab = 'bulk_adjust'"
      >
        ⚙️ تعديل الأسعار جماعياً
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'wastage' }"
        @click="activeTab = 'wastage'"
      >
        ⚠️ تقرير الهدر والفواقد
      </button>
    </div>

    <!-- TAB 1: MARGIN ANALYSIS -->
    <div v-if="activeTab === 'analysis'" class="tab-content animate-fade-in">
      <!-- Filters -->
      <div class="filters-bar card">
        <div class="filter-group search-group">
          <input
            v-model="search"
            type="text"
            placeholder="🔍 بحث باسم المنتج أو الكود..."
            class="search-input"
          />
        </div>
        <div class="filter-group">
          <select v-model="selectedCategory">
            <option value="">كل التصنيفات</option>
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">
              {{ cat.name_ar }}
            </option>
          </select>
        </div>
        <div class="filter-group">
          <select v-model="sortBy">
            <option value="name">ترتيب: الاسم</option>
            <option value="margin_desc">ترتيب: أعلى هامش</option>
            <option value="margin_asc">ترتيب: أقل هامش</option>
            <option value="sales_desc">ترتيب: أكثر مبيعاً</option>
            <option value="profit_desc">ترتيب: أعلى ربح</option>
          </select>
        </div>
        <div class="filter-group toggle-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="showLowMarginOnly" />
            <span>عرض الهوامش المنخفضة فقط (&lt; 25%)</span>
          </label>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-4 summary-row">
        <div class="summary-card">
          <div class="summary-icon">💰</div>
          <div class="summary-body">
            <div class="summary-label">إجمالي المبيعات</div>
            <div class="summary-value">{{ formatMoney(totalSales) }}</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon">📦</div>
          <div class="summary-body">
            <div class="summary-label">إجمالي التكلفة</div>
            <div class="summary-value">{{ formatMoney(totalCost) }}</div>
          </div>
        </div>
        <div class="summary-card profit">
          <div class="summary-icon">📈</div>
          <div class="summary-body">
            <div class="summary-label">إجمالي الربح</div>
            <div class="summary-value">{{ formatMoney(totalProfit) }}</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon">🔢</div>
          <div class="summary-body">
            <div class="summary-label">إجمالي الوحدات المباعة</div>
            <div class="summary-value">{{ totalUnitsSold.toLocaleString('en-GB') }}</div>
          </div>
        </div>
      </div>

      <!-- Products Cost Table -->
      <div class="card table-card">
        <div v-if="loading" class="loading-state">⏳ جاري تحميل البيانات...</div>
        <div v-else-if="!filteredProducts.length" class="empty-state">
          <span>🔍</span>
          <p>لا توجد منتجات مطابقة</p>
        </div>
        <div v-else class="table-wrap">
          <table class="costs-table">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>التصنيف</th>
                <th>الوحدة</th>
                <th>سعر التكلفة</th>
                <th>سعر البيع</th>
                <th>هامش الربح</th>
                <th>الكمية المباعة</th>
                <th>إجمالي الإيراد</th>
                <th>إجمالي التكلفة</th>
                <th>صافي الربح</th>
                <th>وصفة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in filteredProducts"
                :key="p.id"
                :class="[rowClass(p), { 'row-alert': marginPct(p) < 25 }]"
              >
                <td class="product-name-cell">
                  <div class="product-name-wrap">
                    <span
                      v-if="marginPct(p) < 25"
                      class="alert-indicator"
                      title="هامش ربح منخفض أقل من 25%"
                      >⚠️</span
                    >
                    <div>
                      <div class="product-name">{{ p.name_ar }}</div>
                      <div class="product-sku">{{ p.sku }}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="category-badge">{{ p.category_name || '—' }}</span>
                </td>
                <td>{{ unitLabel(p.unit) }}</td>
                <td class="price-cell">
                  {{ formatMoney(p.purchase_price) }}
                  <span class="cost-source-badge" :class="p.cost_source">{{
                    p.cost_source === 'recipe' ? 'وصفة' : 'شراء'
                  }}</span>
                </td>
                <td class="price-cell">{{ formatMoney(p.sale_price) }}</td>
                <td>
                  <div class="margin-bar-wrap">
                    <div
                      class="margin-bar"
                      :style="{ width: Math.max(0, Math.min(marginPct(p), 100)) + '%' }"
                      :class="marginClass(p)"
                    ></div>
                    <span class="margin-label" :class="marginClass(p)"
                      >{{ marginPct(p).toFixed(1) }}%</span
                    >
                  </div>
                </td>
                <td class="number-cell">{{ formatQty(p.total_qty_sold) }}</td>
                <td class="price-cell">{{ formatMoney(p.total_revenue) }}</td>
                <td class="price-cell muted">{{ formatMoney(p.total_cost_sold) }}</td>
                <td
                  class="price-cell"
                  :class="p.net_profit >= 0 ? 'profit-positive' : 'profit-negative'"
                >
                  {{ formatMoney(p.net_profit) }}
                </td>
                <td>
                  <button
                    v-if="p.has_recipe"
                    class="recipe-btn has-recipe"
                    @click="openRecipeBreakdown(p.recipe_id)"
                  >
                    🧾 {{ p.recipe_items_count }} مكونات
                  </button>
                  <span v-else class="recipe-badge no-recipe">شراء مباشر</span>
                </td>
                <td>
                  <button class="btn-edit-price" @click="openEdit(p)">✏️ تعديل</button>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="totals-row">
                <td colspan="6"><strong>الإجمالي</strong></td>
                <td class="number-cell">
                  <strong>{{ totalUnitsSold.toLocaleString('en-GB') }}</strong>
                </td>
                <td class="price-cell">
                  <strong>{{ formatMoney(totalSales) }}</strong>
                </td>
                <td class="price-cell muted">
                  <strong>{{ formatMoney(totalCost) }}</strong>
                </td>
                <td class="price-cell profit-positive">
                  <strong>{{ formatMoney(totalProfit) }}</strong>
                </td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 2: INFLATION SIMULATOR -->
    <div v-if="activeTab === 'simulator'" class="tab-content animate-fade-in">
      <div class="simulator-panel card">
        <div class="simulator-controls">
          <h3>🔮 محاكي تضخم أسعار المواد الخام (What-If)</h3>
          <p>
            قم بمحاكاة أثر ارتفاع أسعار المواد الخام على تكلفة منتجاتك وهامش الربح فورياً دون حفظ في
            قاعدة البيانات.
          </p>

          <div class="simulator-form">
            <div class="form-group">
              <label>تطبيق المحاكاة</label>
              <label class="switch">
                <input type="checkbox" v-model="isSimulatorActive" />
                <span class="slider round"></span>
              </label>
            </div>
            <div class="form-group">
              <label>فئة الخامات المراد تعديلها</label>
              <select v-model="simulatorCategory" :disabled="!isSimulatorActive">
                <option value="">كل الفئات</option>
                <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                  {{ cat.name_ar }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label
                >نسبة الارتفاع المتوقعة:
                <strong class="percent-val">{{ inflationPercent }}%</strong></label
              >
              <input
                type="range"
                min="-50"
                max="100"
                step="5"
                v-model.number="inflationPercent"
                :disabled="!isSimulatorActive"
                class="range-slider"
              />
            </div>
          </div>
        </div>

        <div class="simulator-summary" v-if="isSimulatorActive">
          <div class="metric">
            <span class="label">الهامش المتوسط قبل</span>
            <span class="value">{{ avgMargin }}%</span>
          </div>
          <div class="metric">
            <span class="label">الهامش المتوسط المحاكى</span>
            <span class="value" :class="simulatedAvgMarginClass">{{ simulatedAvgMargin }}%</span>
          </div>
          <div class="metric">
            <span class="label">مقدار التغير</span>
            <span class="value" :class="avgMarginDiff >= 0 ? 'diff-up' : 'diff-down'">
              {{ avgMarginDiff >= 0 ? '+' : '' }}{{ avgMarginDiff.toFixed(1) }}%
            </span>
          </div>
        </div>
      </div>

      <!-- Simulated Products Table -->
      <div class="card table-card" v-if="isSimulatorActive">
        <div class="table-header-desc">
          <h4>نتائج المحاكاة لمنتجات الوصفات والإنتاج</h4>
          <span class="badge-recipe">وضع المحاكاة نشط</span>
        </div>
        <div class="table-wrap">
          <table class="costs-table simulator-table">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>التكلفة الأصلية</th>
                <th>التكلفة المحاكاة</th>
                <th>التغير في التكلفة</th>
                <th>الهامش الأصلي</th>
                <th>الهامش المحاكى</th>
                <th>الأثر على الهامش</th>
                <th>النوع</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in simulatedProducts"
                :key="p.id"
                :class="{ 'row-alert': p.simulated_margin < 25, 'row-simulated': p.is_inflated }"
              >
                <td class="product-name-cell">
                  <strong>{{ p.name_ar }}</strong>
                  <span class="product-sku">{{ p.sku }}</span>
                </td>
                <td class="price-cell">{{ formatMoney(p.purchase_price) }}</td>
                <td
                  class="price-cell text-bold"
                  :class="{ 'price-up': p.simulated_cost > p.purchase_price }"
                >
                  {{ formatMoney(p.simulated_cost) }}
                </td>
                <td class="price-cell" :class="{ 'price-up': p.simulated_cost > p.purchase_price }">
                  {{ p.simulated_cost > p.purchase_price ? '+' : ''
                  }}{{ formatMoney(p.simulated_cost - p.purchase_price) }}
                </td>
                <td class="price-cell">{{ marginPct(p).toFixed(1) }}%</td>
                <td
                  class="price-cell text-bold"
                  :class="simulatedProductMarginClass(p.simulated_margin)"
                >
                  {{ p.simulated_margin.toFixed(1) }}%
                </td>
                <td
                  class="price-cell text-bold"
                  :class="
                    p.simulated_margin - marginPct(p) >= 0 ? 'profit-positive' : 'profit-negative'
                  "
                >
                  {{ p.simulated_margin - marginPct(p) >= 0 ? '+' : ''
                  }}{{ (p.simulated_margin - marginPct(p)).toFixed(1) }}%
                </td>
                <td>
                  <span v-if="p.has_recipe" class="badge-recipe">🧾 وصفة</span>
                  <span v-else class="badge-raw">📦 خامة</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else class="empty-state card">
        <span>🔮</span>
        <p>قم بتفعيل محاكي التضخم لرؤية أثر الأسعار على المنتجات</p>
      </div>
    </div>

    <!-- TAB 3: BULK PRICE ADJUSTER -->
    <div v-if="activeTab === 'bulk_adjust'" class="tab-content animate-fade-in">
      <div class="adjuster-card card">
        <div class="adjuster-header">
          <h3>⚙️ تعديل الأسعار الجماعي للمنتجات</h3>
          <p>تتيح لك هذه الأداة تعديل أسعار مجموعة من المنتجات دفعة واحدة في قاعدة البيانات.</p>
        </div>

        <div class="adjuster-warning alert alert-warning">
          <strong>⚠️ تنبيه هام:</strong> التعديلات التي تقوم بها هنا هي تعديلات فعلية ونهائية وسيتم
          كتابتها مباشرة في قاعدة البيانات. يرجى مراجعة الحقول وتأكيد القرار قبل الضغط على زر
          التطبيق.
        </div>

        <div class="adjuster-form-wrap">
          <div class="form-grid">
            <div class="form-group">
              <label>التصنيف المستهدف</label>
              <select v-model="adjustCategory">
                <option value="">كل المنتجات (النظام بالكامل)</option>
                <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                  {{ cat.name_ar }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>السعر المراد تعديله</label>
              <select v-model="adjustType">
                <option value="sale">سعر البيع (Sale Price)</option>
                <option value="purchase">سعر الشراء / التكلفة الأساسية (Purchase Price)</option>
              </select>
            </div>
            <div class="form-group">
              <label>طريقة التعديل</label>
              <select v-model="adjustMode">
                <option value="percent">نسبة مئوية (%)</option>
                <option value="fixed">قيمة ثابتة (ج.م)</option>
              </select>
            </div>
            <div class="form-group">
              <label>قيمة التعديل (يمكن أن تكون سالبة للخصم)</label>
              <input
                type="number"
                step="0.01"
                v-model.number="adjustValue"
                placeholder="مثال: 10 أو -5"
              />
            </div>
          </div>

          <div class="adjuster-actions">
            <button
              class="btn btn-primary btn-large"
              :disabled="adjustingPrices || adjustValue === 0"
              @click="applyBulkAdjustment"
            >
              {{
                adjustingPrices ? 'جاري تطبيق التعديل الجماعي...' : 'تطبيق التعديل الجماعي فوراً'
              }}
            </button>
          </div>

          <div v-if="adjustSuccess" class="alert alert-success mt-15 animate-fade-in">
            {{ adjustSuccess }}
          </div>
          <div v-if="adjustError" class="alert alert-danger mt-15 animate-fade-in">
            {{ adjustError }}
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 4: WASTAGE REPORT -->
    <div v-if="activeTab === 'wastage'" class="tab-content animate-fade-in">
      <div class="filters-bar card">
        <div class="filter-group">
          <label class="inline-label">من تاريخ</label>
          <input type="date" v-model="wastageFromDate" class="date-input" />
        </div>
        <div class="filter-group">
          <label class="inline-label">إلى تاريخ</label>
          <input type="date" v-model="wastageToDate" class="date-input" />
        </div>
        <div class="filter-group reset-group">
          <button
            class="btn btn-outline"
            @click="
              wastageFromDate = '';
              wastageToDate = '';
            "
          >
            تفريغ الفلتر
          </button>
        </div>
      </div>

      <!-- High Wastage Warning Alert -->
      <div v-if="highWastageItems.length" class="alert alert-danger animate-fade-in">
        <strong>⚠️ تنبيه هدر مرتفع:</strong> هناك منتجات تجاوزت نسبة الفاقد بها 15% خلال هذه الفترة:
        <ul>
          <li v-for="item in highWastageItems" :key="item.id">
            {{ item.name }} (نسبة الفاقد: {{ computeWastePct(item).toFixed(1) }}%) - الهدر الفعلي:
            {{ item.actual_waste }} {{ item.unit }}
          </li>
        </ul>
      </div>

      <!-- Wastage Table -->
      <div class="card table-card">
        <div v-if="loadingWastage" class="loading-state">⏳ جاري حساب الهدر والفواقد...</div>
        <div v-else-if="!wastageReport.length" class="empty-state">
          <span>📉</span>
          <p>لا توجد حركات استهلاك أو تسويات هدر خلال الفترة المحددة</p>
        </div>
        <div v-else class="table-wrap">
          <table class="costs-table">
            <thead>
              <tr>
                <th>اسم الخامة / المنتج</th>
                <th>التصنيف</th>
                <th>الوحدة</th>
                <th>الاستهلاك النظري (المبيعات والإنتاج)</th>
                <th>الهدر والفاقد الفعلي (التسويات)</th>
                <th>إجمالي المنصرف والضائع</th>
                <th>نسبة الهدر</th>
                <th>حالة الهدر</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in wastageReport" :key="row.id">
                <td>
                  <strong>{{ row.name }}</strong>
                </td>
                <td>
                  <span class="category-badge">{{ row.category || '—' }}</span>
                </td>
                <td>{{ unitLabel(row.unit) }}</td>
                <td class="number-cell">{{ formatQty(row.theoretical_consumption) }}</td>
                <td class="number-cell text-danger">{{ formatQty(row.actual_waste) }}</td>
                <td class="number-cell">
                  {{ formatQty(row.theoretical_consumption + row.actual_waste) }}
                </td>
                <td class="price-cell text-bold">{{ computeWastePct(row).toFixed(1) }}%</td>
                <td>
                  <span :class="['waste-badge', wasteStatusClass(row)]">
                    {{ wasteStatusLabel(row) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Edit Price Modal -->
    <div v-if="editingProduct" class="modal-overlay" @click.self="editingProduct = null">
      <div class="modal-card">
        <h3>✏️ تعديل أسعار: {{ editingProduct.name_ar }}</h3>
        <div class="form-group">
          <label>سعر الشراء / التكلفة (ج.م)</label>
          <input v-model.number="editForm.purchase_price" type="number" min="0" step="0.01" />
        </div>
        <div class="form-group">
          <label>سعر البيع (ج.م)</label>
          <input v-model.number="editForm.sale_price" type="number" min="0" step="0.01" />
        </div>
        <div class="modal-preview">
          <span>هامش الربح المتوقع:</span>
          <strong :class="editMarginClass">{{ editMarginPct.toFixed(1) }}%</strong>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" :disabled="savingPrice" @click="savePrice">
            {{ savingPrice ? 'جاري الحفظ...' : 'حفظ' }}
          </button>
          <button class="btn btn-outline" @click="editingProduct = null">إلغاء</button>
        </div>
        <p v-if="priceError" class="error-msg">{{ priceError }}</p>
      </div>
    </div>

    <!-- Recipe Breakdown Modal (Cost Breakdown Analyzer) -->
    <div
      v-if="selectedRecipe || loadingRecipe"
      class="modal-overlay"
      @click.self="selectedRecipe = null"
    >
      <div class="modal-card recipe-breakdown-card">
        <div v-if="loadingRecipe" class="loading-state">⏳ جاري تحميل تفاصيل الوصفة...</div>
        <div v-else-if="recipeError" class="error-state">
          <span>❌</span>
          <p>{{ recipeError }}</p>
          <button class="btn btn-outline" @click="selectedRecipe = null">إغلاق</button>
        </div>
        <div v-else-if="selectedRecipe">
          <div class="modal-header">
            <h3>🔬 محلل مكونات التكلفة: {{ selectedRecipe.product_name }}</h3>
            <span class="recipe-sku-badge">{{ selectedRecipe.product_sku }}</span>
          </div>

          <div class="recipe-summary-box">
            <div class="summary-item">
              <span class="label">إجمالي تكلفة المكونات</span>
              <strong class="val">{{ formatMoney(selectedRecipe.estimated_total_cost) }}</strong>
            </div>
            <div class="summary-item">
              <span class="label">سعر البيع الحالي</span>
              <strong class="val">{{
                formatMoney(getProductSalePrice(selectedRecipe.product_id))
              }}</strong>
            </div>
            <div class="summary-item">
              <span class="label">هامش الربح للوصفة</span>
              <strong class="val profit-positive"
                >{{ getRecipeMargin(selectedRecipe).toFixed(1) }}%</strong
              >
            </div>
          </div>

          <h4>مساهمة كل مكون في التكلفة الإجمالية:</h4>
          <div class="ingredient-analysis-list">
            <div
              v-for="item in selectedRecipe.items"
              :key="item.id"
              class="ingredient-analysis-row"
            >
              <div class="ing-info">
                <span class="ing-name">{{ item.ingredient_name }}</span>
                <span class="ing-qty"
                  >{{ item.quantity }} {{ unitLabel(item.unit_code) }} ×
                  {{ formatMoney(item.ingredient_unit_price) }}</span
                >
              </div>
              <div class="ing-cost-wrap">
                <span class="ing-cost">{{ formatMoney(item.estimated_cost) }}</span>
                <span class="ing-pct"
                  >{{
                    computeContributionPct(
                      item.estimated_cost,
                      selectedRecipe.estimated_total_cost,
                    )
                  }}%</span
                >
              </div>
              <div class="progress-bar-container">
                <div
                  class="progress-bar"
                  :style="{
                    width:
                      computeContributionPct(
                        item.estimated_cost,
                        selectedRecipe.estimated_total_cost,
                      ) + '%',
                  }"
                  :class="
                    contributionClass(
                      computeContributionPct(
                        item.estimated_cost,
                        selectedRecipe.estimated_total_cost,
                      ),
                    )
                  "
                ></div>
              </div>
            </div>
          </div>

          <div class="modal-actions mt-20">
            <button class="btn btn-outline" @click="selectedRecipe = null">إغلاق المحلل</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { products as productsApi, recipes as recipesApi, reports as reportsApi } from '@/api';
import { formatMoney } from '@/utils/currency';
import { useProductMeta } from '@/composables/useProductMeta';

const { categories, loadMeta, unitLabel } = useProductMeta();

// ─── Tabs ────────────────────────────────────────────────────────────────────
const activeTab = ref('analysis'); // 'analysis' | 'simulator' | 'bulk_adjust' | 'wastage'

// ─── State ───────────────────────────────────────────────────────────────────
const loading = ref(false);
const products = ref<any[]>([]);
const recipesList = ref<any[]>([]);
const wastageReport = ref<any[]>([]);
const loadingWastage = ref(false);

const search = ref('');
const selectedCategory = ref('');
const sortBy = ref('name');

// Low Margin Toggle
const showLowMarginOnly = ref(false);

// Edit Price Modal
const editingProduct = ref<any>(null);
const editForm = ref({ purchase_price: 0, sale_price: 0 });
const savingPrice = ref(false);
const priceError = ref('');

// Recipe Breakdown Modal
const selectedRecipe = ref<any>(null);
const loadingRecipe = ref(false);
const recipeError = ref('');

// Inflation Simulator State
const isSimulatorActive = ref(false);
const simulatorCategory = ref('');
const inflationPercent = ref(10); // Default 10% inflation

// Bulk Adjuster State
const adjustCategory = ref('');
const adjustType = ref('sale'); // 'sale' | 'purchase'
const adjustMode = ref('percent'); // 'percent' | 'fixed'
const adjustValue = ref(0);
const adjustingPrices = ref(false);
const adjustSuccess = ref('');
const adjustError = ref('');

// Wastage Report Dates
const wastageFromDate = ref('');
const wastageToDate = ref('');

// ─── Unit Helpers for Simulator ──────────────────────────────────────────────
const UNIT_ALIASES = {
  kg: 'kg',
  kilo: 'kg',
  كيلو: 'kg',
  كجم: 'kg',
  g: 'g',
  gram: 'g',
  جرام: 'g',
  l: 'l',
  liter: 'l',
  litre: 'l',
  لتر: 'l',
  ml: 'ml',
  milli: 'ml',
  مل: 'ml',
  count: 'count',
  unit: 'count',
  piece: 'count',
  pieces: 'count',
  عدد: 'count',
  قطعة: 'count',
};

const normalizeUnitLocal = (u: any) => {
  const key = String(u || '')
    .trim()
    .toLowerCase() as keyof typeof UNIT_ALIASES;
  return UNIT_ALIASES[key] || null;
};

const convertQtyLocal = (qty: any, fromUnit: any, toUnit: any) => {
  if (fromUnit === toUnit) return qty;
  if (fromUnit === 'kg' && toUnit === 'g') return qty * 1000;
  if (fromUnit === 'g' && toUnit === 'kg') return qty / 1000;
  if (fromUnit === 'l' && toUnit === 'ml') return qty * 1000;
  if (fromUnit === 'ml' && toUnit === 'l') return qty / 1000;
  return null;
};

const unitPriceForLocal = (purchasePrice: any, productUnit: any, wantedUnit: any) => {
  const fromUnit = normalizeUnitLocal(productUnit);
  const toUnit = normalizeUnitLocal(wantedUnit);
  if (!fromUnit || !toUnit) return 0;
  const converted = convertQtyLocal(1, fromUnit, toUnit);
  if (converted == null || converted === 0) return 0;
  return Number(purchasePrice || 0) / converted;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const marginPct = (p: any) => {
  const buy = Number(p.purchase_price || 0);
  const sell = Number(p.sale_price || 0);
  if (!sell) return 0;
  return ((sell - buy) / sell) * 100;
};

const marginClass = (p: any) => {
  const m = marginPct(p);
  if (m >= 40) return 'margin-high';
  if (m >= 20) return 'margin-mid';
  return 'margin-low';
};

const rowClass = (p: any) => {
  if (!p.has_recipe && p.total_qty_sold > 0) return 'row-no-recipe';
  return '';
};

const formatQty = (v: any) => {
  const n = Number(v || 0);
  return n % 1 === 0 ? n.toLocaleString('en-GB') : n.toFixed(3);
};

// ─── Computed Properties ──────────────────────────────────────────────────────
const filteredProducts = computed(() => {
  let list = products.value;
  if (selectedCategory.value)
    list = list.filter((p: any) => p.category_id == selectedCategory.value);
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter(
      (p: any) => p.name_ar.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q),
    );
  }
  if (showLowMarginOnly.value) {
    list = list.filter((p: any) => marginPct(p) < 25);
  }
  return [...list].sort((a: any, b: any) => {
    if (sortBy.value === 'margin_desc') return marginPct(b) - marginPct(a);
    if (sortBy.value === 'margin_asc') return marginPct(a) - marginPct(b);
    if (sortBy.value === 'sales_desc')
      return Number(b.total_qty_sold || 0) - Number(a.total_qty_sold || 0);
    if (sortBy.value === 'profit_desc')
      return Number(b.net_profit || 0) - Number(a.net_profit || 0);
    return (a.name_ar || '').localeCompare(b.name_ar || '', 'ar');
  });
});

const totalSales = computed(() =>
  filteredProducts.value.reduce((s: any, p: any) => s + Number(p.total_revenue || 0), 0),
);
const totalCost = computed(() =>
  filteredProducts.value.reduce((s: any, p: any) => s + Number(p.total_cost_sold || 0), 0),
);
const totalProfit = computed(() =>
  filteredProducts.value.reduce((s: any, p: any) => s + Number(p.net_profit || 0), 0),
);
const totalUnitsSold = computed(() =>
  filteredProducts.value.reduce((s: any, p: any) => s + Number(p.total_qty_sold || 0), 0),
);
const avgMargin = computed(() => {
  if (!filteredProducts.value.length) return '0.0';
  const sum = filteredProducts.value.reduce((s: any, p: any) => s + marginPct(p), 0);
  return (sum / filteredProducts.value.length).toFixed(1);
});

// Edit modal margin computed
const editMarginPct = computed(() => {
  const buy = Number(editForm.value.purchase_price || 0);
  const sell = Number(editForm.value.sale_price || 0);
  if (!sell) return 0;
  return ((sell - buy) / sell) * 100;
});
const editMarginClass = computed(() => {
  const m = editMarginPct.value;
  if (m >= 40) return 'margin-high';
  if (m >= 20) return 'margin-mid';
  return 'margin-low';
});

// ─── Inflation Simulator Logic ────────────────────────────────────────────────
const simulatedProducts = computed(() => {
  if (!isSimulatorActive.value) return [];

  // Build a map of simulated purchase prices for raw materials (non-recipes)
  const simulatedPriceMap = new Map();
  products.value.forEach((p: any) => {
    let price = Number(p.purchase_price || 0);
    let isInflated = false;

    // Check if product matches category filter
    const matchesCategory = !simulatorCategory.value || p.category_id == simulatorCategory.value;

    if (matchesCategory) {
      price = price * (1 + Number(inflationPercent.value) / 100);
      isInflated = true;
    }

    simulatedPriceMap.set(p.id, { price, isInflated });
  });

  // Now, calculate simulated costs for all products (dynamic recipes)
  return products.value.map((p: any) => {
    let simulatedCost = Number(p.purchase_price || 0);
    let isInflated = false;

    if (p.has_recipe && p.recipe_id) {
      // Find the recipe
      const recipe = recipesList.value.find((r: any) => r.id === p.recipe_id);
      if (recipe && recipe.items) {
        let totalRecipeCost = 0;
        recipe.items.forEach((item: any) => {
          const ingredientId = Number(item.ingredient_product_id);
          const ingredientSim = simulatedPriceMap.get(ingredientId);
          const ingredientPrice = ingredientSim
            ? ingredientSim.price
            : Number(item.ingredient_purchase_price || 0);
          if (ingredientSim?.is_inflated) {
            isInflated = true;
          }

          const unitPrice = unitPriceForLocal(
            ingredientPrice,
            item.ingredient_unit,
            item.unit_code,
          );
          totalRecipeCost += Number(item.quantity || 0) * unitPrice;
        });
        simulatedCost = Math.round(totalRecipeCost * 100) / 100;
      }
    } else {
      // It's a raw material or direct sell product
      const sim = simulatedPriceMap.get(p.id);
      if (sim) {
        simulatedCost = Math.round(sim.price * 100) / 100;
        isInflated = sim.is_inflated;
      }
    }

    const sell = Number(p.sale_price || 0);
    const simulatedMargin = sell ? ((sell - simulatedCost) / sell) * 100 : 0;

    return {
      ...p,
      simulated_cost: simulatedCost,
      simulated_margin: simulatedMargin,
      is_inflated: isInflated && Math.abs(simulatedCost - Number(p.purchase_price || 0)) > 0.01,
    };
  });
});

const simulatedAvgMargin = computed(() => {
  if (!simulatedProducts.value.length) return '0.0';
  const sum = simulatedProducts.value.reduce((s: any, p: any) => s + p.simulated_margin, 0);
  return (sum / simulatedProducts.value.length).toFixed(1);
});

const avgMarginDiff = computed(() => {
  return Number(simulatedAvgMargin.value) - Number(avgMargin.value);
});

const simulatedAvgMarginClass = computed(() => {
  const m = Number(simulatedAvgMargin.value);
  if (m >= 40) return 'margin-high';
  if (m >= 20) return 'margin-mid';
  return 'margin-low';
});

const simulatedProductMarginClass = (m: any) => {
  if (m >= 40) return 'margin-high';
  if (m >= 20) return 'margin-mid';
  return 'margin-low';
};

// ─── Cost Breakdown Analyzer Modal Helpers ────────────────────────────────────
const getProductSalePrice = (productId: any) => {
  const p = products.value.find((prod: any) => prod.id === productId);
  return p ? Number(p.sale_price || 0) : 0;
};

const getRecipeMargin = (recipe: any) => {
  const sell = getProductSalePrice(recipe.product_id);
  const cost = Number(recipe.estimated_total_cost || 0);
  if (!sell) return 0;
  return ((sell - cost) / sell) * 100;
};

const computeContributionPct = (itemCost: any, totalCost: any) => {
  if (!totalCost) return '0.0';
  return ((Number(itemCost) / Number(totalCost)) * 100).toFixed(1);
};

const contributionClass = (pctStr: any) => {
  const pct = Number(pctStr);
  if (pct >= 50) return 'contrib-high';
  if (pct >= 20) return 'contrib-mid';
  return 'contrib-low';
};

// ─── Wastage Report Helpers ──────────────────────────────────────────────────
const computeWastePct = (row: any) => {
  const theoretical = Number(row.theoretical_consumption || 0);
  const waste = Number(row.actual_waste || 0);
  const total = theoretical + waste;
  if (!total) return 0;
  return (waste / total) * 100;
};

const wasteStatusLabel = (row: any) => {
  const pct = computeWastePct(row);
  if (pct < 5) return 'ممتاز (آمن)';
  if (pct < 15) return 'مقبول (متوسط)';
  return 'مرتفع (خطر ⚠️)';
};

const wasteStatusClass = (row: any) => {
  const pct = computeWastePct(row);
  if (pct < 5) return 'waste-safe';
  if (pct < 15) return 'waste-warning';
  return 'waste-danger';
};

const highWastageItems = computed(() => {
  return wastageReport.value.filter((row: any) => computeWastePct(row) >= 15);
});

// ─── Data Loading ─────────────────────────────────────────────────────────────
const load = async () => {
  loading.value = true;
  try {
    const [prodRes, recRes] = await Promise.all([
      productsApi.costsReport(),
      recipesApi.listRecipes().catch(() => ({ data: [] })),
    ]);
    products.value = prodRes.data || [];
    recipesList.value = recRes.data || [];
    await loadMeta();
  } catch (e: any) {
    console.error('فشل تحميل التكاليف والوصفات:', e.message);
  } finally {
    loading.value = false;
  }
};

const loadWastageReport = async () => {
  loadingWastage.value = true;
  try {
    const res = await reportsApi('wastage', {
      from_date: wastageFromDate.value || null,
      to_date: wastageToDate.value || null,
    });
    wastageReport.value = res.data || [];
  } catch (e: any) {
    console.error('فشل تحميل تقرير الهدر:', e.message);
  } finally {
    loadingWastage.value = false;
  }
};

// Watch activeTab to load wastage report when entering wastage tab
watch(activeTab, (newTab: any) => {
  if (newTab === 'wastage' && !wastageReport.value.length) {
    loadWastageReport();
  }
});

// Watch dates for wastage report
watch([wastageFromDate, wastageToDate], loadWastageReport);

// ─── Edit Price Modal Actions ─────────────────────────────────────────────────
const openEdit = (product: any) => {
  editingProduct.value = product;
  editForm.value = {
    purchase_price: Number(product.purchase_price || 0),
    sale_price: Number(product.sale_price || 0),
  };
  priceError.value = '';
};

const savePrice = async () => {
  priceError.value = '';
  if (!editForm.value.sale_price || editForm.value.sale_price <= 0) {
    priceError.value = 'سعر البيع يجب أن يكون أكبر من صفر';
    return;
  }
  savingPrice.value = true;
  try {
    await productsApi.update(editingProduct.value.id, {
      purchase_price: editForm.value.purchase_price,
      sale_price: editForm.value.sale_price,
    });
    editingProduct.value = null;
    await load();
  } catch (e: any) {
    priceError.value = e.message || 'فشل الحفظ';
  } finally {
    savingPrice.value = false;
  }
};

// ─── Cost Breakdown Analyzer Actions ──────────────────────────────────────────
const openRecipeBreakdown = async (recipeId: any) => {
  loadingRecipe.value = true;
  recipeError.value = '';
  selectedRecipe.value = {}; // Opens modal immediately in loading state
  try {
    const res = await recipesApi.getRecipe(recipeId);
    selectedRecipe.value = res.data;
  } catch (e: any) {
    recipeError.value = e.message || 'فشل تحميل تفاصيل الوصفة';
  } finally {
    loadingRecipe.value = false;
  }
};

// ─── Bulk Price Adjuster Actions ──────────────────────────────────────────────
const applyBulkAdjustment = async () => {
  adjustSuccess.value = '';
  adjustError.value = '';

  if (adjustValue.value === 0) {
    adjustError.value = 'يرجى إدخال قيمة تعديل غير صفرية';
    return;
  }

  const confirmMsg = `هل أنت متأكد من تعديل أسعار ${adjustType.value === 'sale' ? 'البيع' : 'الشراء'} لجميع منتجات ${adjustCategory.value ? 'التصنيف المختار' : 'النظام بالكامل'} بمقدار ${adjustValue.value}${adjustMode.value === 'percent' ? '%' : ' ج.م'}؟ هذا التعديل نهائي ويؤثر مباشرة في قاعدة البيانات.`;
  if (!confirm(confirmMsg)) return;

  adjustingPrices.value = true;
  try {
    const res = await productsApi.bulkAdjustPrices({
      category_id: adjustCategory.value || null,
      type: adjustType.value,
      adjust_type: adjustMode.value,
      value: adjustValue.value,
    });
    adjustSuccess.value = `تم تعديل أسعار ${res.data?.updatedCount || 0} منتجات بنجاح.`;
    adjustValue.value = 0;
    await load();
  } catch (e: any) {
    adjustError.value = e.message || 'فشل تعديل الأسعار جماعياً';
  } finally {
    adjustingPrices.value = false;
  }
};

onMounted(load);
</script>

<style lang="scss" scoped>
.costs-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  .header-title {
    display: flex;
    align-items: center;
    gap: 14px;
    .header-icon {
      font-size: 2rem;
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
  .header-meta {
    display: flex;
    gap: 24px;
  }
  .meta-item {
    text-align: center;
    .meta-label {
      display: block;
      font-size: 0.78rem;
      color: var(--text-muted);
    }
    .meta-value {
      display: block;
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--primary-dark);
    }
  }
}

/* Tab Navigation */
.costs-tabs {
  display: flex;
  gap: 8px;
  padding: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-x: auto;

  .tab-btn {
    padding: 10px 20px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-muted);
    border-radius: var(--radius);
    transition: all 0.2s ease;
    white-space: nowrap;

    &:hover {
      background: var(--bg);
      color: var(--primary-dark);
    }

    &.active {
      background: rgba(30, 41, 59, 0.06);
      color: var(--primary-dark);
      border-bottom: 2px solid var(--primary-dark);
    }
  }
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.animate-fade-in {
  animation: fadeIn 0.25s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.filters-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  .filter-group {
    flex: 1;
    min-width: 160px;
  }
  .search-input,
  select {
    width: 100%;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    font-size: 0.9rem;
  }
}

/* Summary Cards */
.summary-row {
  gap: 14px;
}
.summary-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  &.profit {
    border-color: rgba(46, 125, 79, 0.3);
    background: rgba(46, 125, 79, 0.04);
  }
  .summary-icon {
    font-size: 1.8rem;
  }
  .summary-label {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-bottom: 4px;
  }
  .summary-value {
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--primary-dark);
  }
}

/* Table */
.table-card {
  overflow: hidden;
}
.table-wrap {
  overflow-x: auto;
}
.costs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  th {
    background: var(--bg);
    padding: 11px 12px;
    text-align: right;
    font-weight: 700;
    color: var(--text-muted);
    font-size: 0.8rem;
    border-bottom: 2px solid var(--border);
    white-space: nowrap;
  }
  td {
    padding: 11px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  tr:hover td {
    background: rgba(0, 0, 0, 0.01);
  }
  .product-name-cell {
    .product-name {
      font-weight: 600;
    }
    .product-sku {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-family: monospace;
    }
  }
  .price-cell {
    font-weight: 600;
    white-space: nowrap;
  }
  .number-cell {
    text-align: center;
  }
  .muted {
    color: var(--text-muted);
    font-weight: 400;
  }
  .profit-positive {
    color: #2e7d4f;
  }
  .profit-negative {
    color: #b42318;
  }
  .row-no-recipe td {
    background: rgba(241, 196, 15, 0.03);
  }
}

.category-badge {
  background: var(--bg);
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 0.78rem;
  border: 1px solid var(--border);
  white-space: nowrap;
}

/* Margin bar */
.margin-bar-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 100px;
}
.margin-bar {
  height: 6px;
  border-radius: 3px;
  transition: width 0.3s;
  min-width: 4px;
}
.margin-label {
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;
}
.margin-high {
  background: #2e7d4f;
  color: #2e7d4f;
}
.margin-mid {
  background: #f59e0b;
  color: #b45309;
}
.margin-low {
  background: #b42318;
  color: #b42318;
}

/* Recipe badge & buttons */
.recipe-badge {
  padding: 3px 8px;
  border-radius: 20px;
  font-size: 0.78rem;
  white-space: nowrap;
}
.has-recipe {
  background: rgba(46, 125, 79, 0.1);
  color: #2e7d4f;
  border: 1px solid rgba(46, 125, 79, 0.2);
}
.no-recipe {
  background: var(--bg);
  color: var(--text-muted);
  border: 1px solid var(--border);
}

.recipe-btn {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;

  &.has-recipe {
    background: rgba(46, 125, 79, 0.08);
    color: #2e7d4f;
    border-color: rgba(46, 125, 79, 0.2);

    &:hover {
      background: rgba(46, 125, 79, 0.15);
    }
  }
}

.row-alert {
  background: rgba(180, 35, 24, 0.02) !important;
}

.product-name-wrap {
  display: flex;
  align-items: center;
  gap: 8px;

  .alert-indicator {
    font-size: 1.1rem;
    cursor: help;
  }
}

.btn-edit-price {
  padding: 4px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--primary-dark);
  transition: all 0.2s;

  &:hover {
    background: var(--border);
  }
}

/* Cost Source Badge */
.cost-source-badge {
  display: inline-block;
  font-size: 0.68rem;
  padding: 1px 4px;
  border-radius: 3px;
  margin-right: 4px;
  font-weight: 600;

  &.recipe {
    background: rgba(46, 125, 79, 0.1);
    color: #2e7d4f;
  }

  &.purchase_price,
  &.purchase {
    background: rgba(30, 41, 59, 0.08);
    color: var(--text-muted);
  }
}

/* Totals row */
.totals-row td {
  background: var(--bg);
  border-top: 2px solid var(--border);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 28px;
  width: min(420px, 92vw);
  box-shadow: var(--shadow-lg);
  h3 {
    margin: 0 0 20px;
    color: var(--primary-dark);
  }
  .modal-preview {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: var(--bg);
    border-radius: var(--radius);
    margin: 12px 0 20px;
    font-size: 0.9rem;
  }
  .modal-actions {
    display: flex;
    gap: 10px;
  }
  .error-msg {
    color: #b42318;
    margin-top: 10px;
    font-size: 0.88rem;
  }
}

.recipe-breakdown-card {
  width: min(540px, 95vw) !important;
  max-height: 90vh;
  overflow-y: auto;

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding-bottom: 12px;
    margin-bottom: 16px;

    h3 {
      margin: 0;
    }
  }

  .recipe-sku-badge {
    background: var(--bg);
    border: 1px solid var(--border);
    padding: 3px 8px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
}

.recipe-summary-box {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  background: var(--bg);
  padding: 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  margin-bottom: 20px;

  .summary-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;

    .label {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-bottom: 4px;
    }

    .val {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--primary-dark);
    }
  }
}

.ingredient-analysis-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 10px;
}

.ingredient-analysis-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);

  .ing-info {
    display: flex;
    justify-content: space-between;

    .ing-name {
      font-weight: 600;
      color: var(--primary-dark);
    }

    .ing-qty {
      font-size: 0.78rem;
      color: var(--text-muted);
    }
  }

  .ing-cost-wrap {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;

    .ing-cost {
      font-weight: 600;
    }

    .ing-pct {
      color: var(--text-muted);
      font-weight: 700;
    }
  }

  .progress-bar-container {
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;

    .progress-bar {
      height: 100%;
      border-radius: 3px;

      &.contrib-low {
        background: #2e7d4f;
      }
      &.contrib-mid {
        background: #f59e0b;
      }
      &.contrib-high {
        background: #b42318;
      }
    }
  }
}

/* Simulator styling */
.simulator-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  padding: 24px;
  margin-bottom: 20px;

  .simulator-controls {
    flex: 1;
    min-width: 300px;

    h3 {
      margin: 0 0 8px 0;
      color: var(--primary-dark);
    }
    p {
      margin: 0 0 20px 0;
      font-size: 0.88rem;
      color: var(--text-muted);
    }
  }

  .simulator-form {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    align-items: center;

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 180px;

      label {
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--text-muted);
      }
      .percent-val {
        color: #b42318;
        font-size: 0.95rem;
      }
    }
  }

  .simulator-summary {
    display: flex;
    gap: 20px;
    background: var(--bg);
    padding: 16px 24px;
    border-radius: var(--radius);
    border: 1px solid var(--border);

    .metric {
      display: flex;
      flex-direction: column;
      align-items: center;

      .label {
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-bottom: 4px;
      }
      .value {
        font-size: 1.3rem;
        font-weight: 800;

        &.margin-high {
          color: #2e7d4f;
        }
        &.margin-mid {
          color: #f59e0b;
        }
        &.margin-low {
          color: #b42318;
        }

        &.diff-up {
          color: #2e7d4f;
        }
        &.diff-down {
          color: #b42318;
        }
      }
    }
  }
}

.table-header-desc {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);

  h4 {
    margin: 0;
    color: var(--primary-dark);
  }
}

.row-simulated {
  background: rgba(245, 158, 11, 0.02) !important;
}

.price-up {
  color: #b42318;
  font-weight: 700;
}
.text-bold {
  font-weight: 700;
}

.badge-recipe,
.badge-raw {
  display: inline-block;
  padding: 2px 6px;
  font-size: 0.72rem;
  border-radius: 4px;
  font-weight: 600;
}
.badge-recipe {
  background: rgba(46, 125, 79, 0.1);
  color: #2e7d4f;
}
.badge-raw {
  background: rgba(30, 41, 59, 0.08);
  color: var(--text-muted);
}

/* Switch styling */
.switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 24px;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.4s;
}
.slider:before {
  position: absolute;
  content: '';
  height: 16px;
  width: 16px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: 0.4s;
}
input:checked + .slider {
  background-color: #2e7d4f;
}
input:focus + .slider {
  box-shadow: 0 0 1px #2e7d4f;
}
input:checked + .slider:before {
  transform: translateX(26px);
}
.slider.round {
  border-radius: 34px;
}
.slider.round:before {
  border-radius: 50%;
}

/* Range Slider */
.range-slider {
  -webkit-appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--border);
  outline: none;
  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #2e7d4f;
    cursor: pointer;
    transition: transform 0.1s;
    &:hover {
      transform: scale(1.2);
    }
  }
}

/* Adjuster card */
.adjuster-card {
  padding: 24px;
  .adjuster-header {
    margin-bottom: 20px;
    h3 {
      margin: 0 0 6px 0;
      color: var(--primary-dark);
    }
    p {
      margin: 0;
      font-size: 0.88rem;
      color: var(--text-muted);
    }
  }
}

.alert {
  padding: 12px 16px;
  border-radius: var(--radius);
  font-size: 0.88rem;
  line-height: 1.5;
  margin-bottom: 20px;
  &.alert-warning {
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: #b45309;
  }
  &.alert-danger {
    background: rgba(180, 35, 24, 0.06);
    border: 1px solid rgba(180, 35, 24, 0.2);
    color: #b42318;
  }
  &.alert-success {
    background: rgba(46, 125, 79, 0.08);
    border: 1px solid rgba(46, 125, 79, 0.3);
    color: #2e7d4f;
  }
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.adjuster-actions {
  display: flex;
  justify-content: flex-end;
}
.btn-large {
  padding: 12px 28px;
  font-size: 1rem;
}

/* Wastage view styling */
.inline-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
  display: block;
}
.date-input {
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  width: 100%;
}
.reset-group {
  display: flex;
  align-items: flex-end;
}

.waste-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 700;
  &.waste-safe {
    background: rgba(46, 125, 79, 0.1);
    color: #2e7d4f;
  }
  &.waste-warning {
    background: rgba(245, 158, 11, 0.1);
    color: #b45309;
  }
  &.waste-danger {
    background: rgba(180, 35, 24, 0.1);
    color: #b42318;
  }
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--primary-dark);
  user-select: none;
  input {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }
}
.toggle-group {
  display: flex;
  align-items: center;
  height: 100%;
  padding-top: 15px;
}
.search-group {
  flex: 1.5 !important;
}
.mt-15 {
  margin-top: 15px;
}
.mt-20 {
  margin-top: 20px;
}

.loading-state,
.empty-state,
.error-state {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
  span {
    font-size: 2rem;
    display: block;
    margin-bottom: 8px;
  }
}

@media (max-width: 768px) {
  .summary-row {
    grid-template-columns: 1fr 1fr;
  }
  .simulator-panel {
    flex-direction: column;
    align-items: stretch;
  }
  .recipe-summary-box {
    grid-template-columns: 1fr;
  }
}
</style>
