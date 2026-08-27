<template>
  <div class="tab-content animate-fade-in">
    <div class="simulator-panel card">
      <div class="simulator-controls">
        <h3>محاكي تضخم أسعار المواد الخام (What-If)</h3>
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

      <div
        v-if="isSimulatorActive && simulationWarnings.length"
        class="simulator-warnings"
        role="alert"
        style="
          margin-top: 12px;
          padding: 10px 14px;
          border-radius: 8px;
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.45);
          color: #b45309;
          font-size: 0.85rem;
        "
      >
        <strong> تحذيرات تحويل الوحدات ({{ simulationWarnings.length }}):</strong>
        <ul style="margin: 6px 18px 0 0; padding: 0">
          <li v-for="(w, i) in simulationWarnings" :key="i">{{ w }}</li>
        </ul>
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
                <span v-if="p.has_recipe" class="badge-recipe"> وصفة</span>
                <span v-else class="badge-raw"> خامة</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div v-else class="empty-state card">
      <span></span>
      <p>قم بتفعيل محاكي التضخم لرؤية أثر الأسعار على المنتجات</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

/**
 * محاكي التضخم (What-If) — يحسب أثر ارتفاع أسعار الخامات داخلياً.
 *
 * @props products — كل المنتجات
 * @props recipesList — الوصفات (لحساب تكلفة المنتجات المركبة)
 * @props categories — التصنيفات
 * @props avgMargin — الهامش المتوسط الحالي
 * @props marginPct — حساب هامش منتج
 * @props formatMoney — تنسيق العملة
 * @emits (لا أحد — مستقل بالكامل)
 */
const props = defineProps<{
  products: any[];
  recipesList: any[];
  categories: any[];
  avgMargin: string;
  marginPct: (_p: any) => number;
  formatMoney: (_v: any) => string;
}>();

// ─── state ────────────────────────────────────────────────────────────────────
const isSimulatorActive = ref(false);
const simulatorCategory = ref('');
const inflationPercent = ref(10); // Default 10% inflation

// ─── unit helpers (مشتركة مع recipeCost) ─────────────────────────────────────
import { normalizeUnit, convertQty, unitPriceFor } from '@/utils/recipeCost';

const unitPriceChecked = (
  basePrice: number,
  productUnit: any,
  wantedUnit: any,
  label: string,
  warnings: string[],
): number => {
  const from = normalizeUnit(productUnit);
  const to = normalizeUnit(wantedUnit);
  if (!from || !to) {
    warnings.push(`${label}: وحدة غير معروفة (${productUnit} ← ${wantedUnit}) — تم تجاهل التكلفة`);
    return 0;
  }
  if (from !== to && convertQty(1, from, to) == null) {
    warnings.push(`${label}: تعذر التحويل بين الوحدتين (${from} ← ${to}) — تم تجاهل التكلفة`);
    return 0;
  }
  return unitPriceFor(basePrice, productUnit, wantedUnit);
};

// ─── computed ─────────────────────────────────────────────────────────────────
const simulatedProducts = computed(() => {
  if (!isSimulatorActive.value) return [];

  const productMap = new Map<number, any>();
  props.products.forEach((p: any) => productMap.set(Number(p.id), p));

  const recipeById = new Map<number, any>();
  props.recipesList.forEach((r: any) => recipeById.set(Number(r.id), r));

  const unitWarnings: string[] = [];

  const matchesCategory = (p: any) =>
    !simulatorCategory.value || p.category_id == simulatorCategory.value;

  // حساب تكراري memoized لتكلفة كل منتج بعد المحاكاة — يدعم الوصفات المتداخلة
  const memo = new Map<number, { cost: number; isInflated: boolean }>();
  const inProgress = new Set<number>();

  const resolveCost = (productId: number): { cost: number; isInflated: boolean } => {
    const cached = memo.get(productId);
    if (cached) return cached;

    const p = productMap.get(productId);
    if (!p) return { cost: 0, isInflated: false };

    // حارس دورات: وصفة تشير لنفسها بشكل دائري
    if (inProgress.has(productId)) {
      return { cost: Number(p.purchase_price || 0), isInflated: false };
    }
    inProgress.add(productId);

    let result: { cost: number; isInflated: boolean };
    const recipe = p.has_recipe && p.recipe_id ? recipeById.get(Number(p.recipe_id)) : null;

    if (recipe && Array.isArray(recipe.items) && recipe.items.length) {
      let totalRecipeCost = 0;
      let isInflated = false;
      recipe.items.forEach((item: any) => {
        const ingId = Number(item.ingredient_product_id);
        // تكلفة المكوّن بعد المحاكاة (شاملة وصفته الخاصة إن وجدت)
        const sub = resolveCost(ingId);
        if (sub.isInflated) isInflated = true;
        const ing = productMap.get(ingId);
        const ingStockUnit = ing ? ing.unit : item.ingredient_unit;
        const unitPrice = unitPriceChecked(
          sub.cost,
          ingStockUnit,
          item.unit_code,
          `${p.name_ar} ← مكوّن #${ingId}`,
          unitWarnings,
        );
        totalRecipeCost += Number(item.quantity || 0) * unitPrice;
      });
      result = { cost: Math.round(totalRecipeCost * 100) / 100, isInflated };
    } else {
      const inflatedPrice =
        Number(p.purchase_price || 0) *
        (1 + (matchesCategory(p) ? Number(inflationPercent.value) / 100 : 0));
      result = {
        cost: Math.round(inflatedPrice * 100) / 100,
        isInflated: matchesCategory(p),
      };
    }

    inProgress.delete(productId);
    memo.set(productId, result);
    return result;
  };

  const rows = props.products.map((p: any) => {
    const sim = resolveCost(Number(p.id));
    const sell = Number(p.sale_price || 0);
    const simulatedMargin = sell ? ((sell - sim.cost) / sell) * 100 : 0;
    return {
      ...p,
      simulated_cost: sim.cost,
      simulated_margin: simulatedMargin,
      is_inflated: sim.isInflated && Math.abs(sim.cost - Number(p.purchase_price || 0)) > 0.01,
    };
  });

  // إظهار تحذير واحد فقط لكل رسالة مكررة
  simulationWarnings.value = [...new Set(unitWarnings)];
  return rows;
});

const simulationWarnings = ref<string[]>([]);

const simulatedAvgMargin = computed(() => {
  if (!simulatedProducts.value.length) return '0.0';
  const sum = simulatedProducts.value.reduce((s: any, p: any) => s + p.simulated_margin, 0);
  return (sum / simulatedProducts.value.length).toFixed(1);
});

const avgMarginDiff = computed(() => {
  return Number(simulatedAvgMargin.value) - Number(props.avgMargin);
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
</script>

<style lang="scss" scoped>
@import './costsTable.css';

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

@media (max-width: 768px) {
  .simulator-panel {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
