import { query } from '../database/pool.ts';
import { convertQty, normalizeUnit } from './productCostService.ts';

// Fit simple linear regression on a dataset
const fitLinearRegression = (y) => {
  const n = y.length;
  if (n === 0) return { slope: 0, intercept: 0 };

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += i + 1;
    sumY += y[i];
  }

  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const x = i + 1;
    num += (x - meanX) * (y[i] - meanY);
    den += (x - meanX) * (x - meanX);
  }

  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  return { slope, intercept };
};

/**
 * توقع الطلب المستقبلي على المنتجات بناءً على المبيعات التاريخية.
 * @param {Record<string, any>} [filters] عوامل التصفية (warehouse_id، الفترة...)
 * @returns {Promise<Record<string, any>>} نتائج التوقع
 */
export const getDemandForecast = async (filters: Record<string, any> = {}) => {
  const warehouseId = Number(filters.warehouse_id) || 1; // Default to first warehouse

  // 1. Fetch current available stock for all products in this warehouse
  const stockSql = `
    SELECT 
      p.id, p.sku, p.name_ar, p.unit, p.sale_price, p.purchase_price, p.category_id,
      pc.name_ar AS category_name,
      COALESCE((SELECT SUM(quantity) FROM inventory i WHERE i.product_id = p.id AND i.warehouse_id = $1), 0) AS stock_available,
      CASE WHEN r.id IS NOT NULL THEN TRUE ELSE FALSE END AS has_recipe,
      r.id AS recipe_id
    FROM products p
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    LEFT JOIN product_recipes r ON r.product_id = p.id AND r.deleted_at IS NULL AND r.is_active = TRUE
    WHERE p.deleted_at IS NULL
  `;
  const products = (await query(stockSql, [warehouseId])).rows;

  // 2. Fetch active recipe details
  const recipeItemsSql = `
    SELECT 
      ri.recipe_id, ri.ingredient_product_id, ri.quantity, ri.unit_code,
      ip.name_ar AS ingredient_name, ip.unit AS ingredient_unit
    FROM product_recipe_items ri
    JOIN product_recipes r ON r.id = ri.recipe_id
    JOIN products ip ON ip.id = ri.ingredient_product_id
    WHERE r.deleted_at IS NULL AND r.is_active = TRUE
  `;
  const recipeItems = (await query(recipeItemsSql)).rows;

  // Group recipe items by recipe_id
  const recipeMap = {};
  recipeItems.forEach((item) => {
    if (!recipeMap[item.recipe_id]) {
      recipeMap[item.recipe_id] = [];
    }
    recipeMap[item.recipe_id].push(item);
  });

  // 3. Fetch sales historical daily quantity sold for the last 90 days
  const salesSql = `
    SELECT 
      si.product_id,
      s.sale_date AS date,
      SUM(si.quantity) AS qty_sold
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.status = 'completed' AND s.deleted_at IS NULL
      AND s.warehouse_id = $1
      AND s.sale_date >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY si.product_id, s.sale_date
    ORDER BY si.product_id, s.sale_date ASC
  `;
  const rawSales = (await query(salesSql, [warehouseId])).rows;

  // Group raw sales by product_id
  const salesMap = {};
  rawSales.forEach((row) => {
    if (!salesMap[row.product_id]) {
      salesMap[row.product_id] = {};
    }
    salesMap[row.product_id][row.date] = Number(row.qty_sold);
  });

  // Generate date series for the last 90 days
  const dateList: any[] = [];
  const today = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    dateList.push(dateStr);
  }

  // Run forecasting for each product
  const forecasts = {};
  const forecastDays = 30;

  products.forEach((prod) => {
    const pSales = salesMap[prod.id] || {};

    // Create complete time-series array (fill zeros for missing days)
    const y = dateList.map((date) => pSales[date] || 0);
    const totalSold = y.reduce((sum, val) => sum + val, 0);

    if (totalSold === 0) {
      // No historical sales: forecast is 0
      forecasts[prod.id] = new Array(forecastDays).fill(0);
      return;
    }

    // Calculate Day-of-Week Seasonality Index (7 indices: 0 = Sunday, ..., 6 = Saturday)
    const weekdaySums = new Array(7).fill(0);
    const weekdayCounts = new Array(7).fill(0);

    dateList.forEach((dateStr, idx) => {
      const d = new Date(dateStr);
      const day = d.getDay();
      weekdaySums[day] += y[idx];
      weekdayCounts[day]++;
    });

    const overallAvg = totalSold / 90;
    const seasonalIndices = weekdaySums.map((sum, day) => {
      const count = weekdayCounts[day];
      if (count === 0 || overallAvg === 0) return 1;
      const dayAvg = sum / count;
      return dayAvg / overallAvg;
    });

    // Deseasonalize sales
    const deseasonalized = y.map((val, idx) => {
      const d = new Date(dateList[idx]);
      const day = d.getDay();
      const sIndex = seasonalIndices[day];
      return sIndex > 0 ? val / sIndex : val;
    });

    // Fit linear regression
    const { slope, intercept } = fitLinearRegression(deseasonalized);

    // حساب متوسط المبيعات الأخير لـ 14 يوماً لإعطاء وزن أكبر للتغيرات القريبة
    const recent14 = y.slice(-14);
    const recentAvg = recent14.reduce((sum, v) => sum + v, 0) / 14;

    // Predict next 30 days
    const predictions: any[] = [];
    for (let d = 1; d <= forecastDays; d++) {
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + d);
      const futureDay = futureDate.getDay();

      const futureX = 90 + d;
      const trendVal = slope * futureX + intercept;

      // دمج 70% من المتوسط التكيفي الأخير مع 30% من الاتجاه العام الخطي
      const baseDemand = 0.7 * recentAvg + 0.3 * Math.max(0, trendVal);
      const predictedVal = baseDemand * seasonalIndices[futureDay];
      predictions.push(Number(predictedVal.toFixed(3)));
    }

    forecasts[prod.id] = predictions;
  });

  // Group forecasting results for products
  const salesForecastResult: any[] = [];
  products.forEach((prod) => {
    const dailyForecast = forecasts[prod.id] || new Array(forecastDays).fill(0);
    const total7d = dailyForecast.slice(0, 7).reduce((sum, val) => sum + val, 0);
    const total30d = dailyForecast.reduce((sum, val) => sum + val, 0);

    if (total30d > 0) {
      salesForecastResult.push({
        product_id: prod.id,
        sku: prod.sku,
        name_ar: prod.name_ar,
        unit: prod.unit,
        sale_price: prod.sale_price,
        category_name: prod.category_name,
        forecast_7d: Number(total7d.toFixed(3)),
        forecast_30d: Number(total30d.toFixed(3)),
        daily_forecast: dailyForecast.slice(0, 7), // return next 7 days daily details
      });
    }
  });

  // 4. Expand ingredients consumption forecast based on recipes
  const ingredientDailyForecasts = {}; // keyed by ingredient_product_id -> array of 30 days forecast

  products.forEach((prod) => {
    if (prod.has_recipe && prod.recipe_id && recipeMap[prod.recipe_id]) {
      const prodForecast = forecasts[prod.id];
      if (!prodForecast) return;

      const ingredients = recipeMap[prod.recipe_id];
      ingredients.forEach((ing) => {
        if (!ingredientDailyForecasts[ing.ingredient_product_id]) {
          ingredientDailyForecasts[ing.ingredient_product_id] = new Array(forecastDays).fill(0);
        }

        // تحويل الكمية إلى وحدة المخزن الافتراضية للمادة الخام (مثلاً: جرام -> كيلو) لتطابق وحدة المخزون المتاح
        const fromUnit = normalizeUnit(ing.unit_code);
        const toUnit = normalizeUnit(ing.ingredient_unit);
        let convertedQty = Number(ing.quantity);
        if (fromUnit && toUnit) {
          const factor = convertQty(1, fromUnit, toUnit);
          if (factor !== null && factor !== 0) {
            convertedQty = Number(ing.quantity) * factor;
          }
        }

        for (let d = 0; d < forecastDays; d++) {
          ingredientDailyForecasts[ing.ingredient_product_id][d] += prodForecast[d] * convertedQty;
        }
      });
    }
  });

  // Format ingredients forecast results
  const ingredientsForecastResult: any[] = [];
  products.forEach((prod) => {
    const dailyForecast = ingredientDailyForecasts[prod.id];
    if (dailyForecast) {
      const total7d = dailyForecast.slice(0, 7).reduce((sum, val) => sum + val, 0);
      const total30d = dailyForecast.reduce((sum, val) => sum + val, 0);

      ingredientsForecastResult.push({
        product_id: prod.id,
        sku: prod.sku,
        name_ar: prod.name_ar,
        unit: prod.unit,
        category_name: prod.category_name,
        forecast_7d: Number(total7d.toFixed(3)),
        forecast_30d: Number(total30d.toFixed(3)),
        daily_forecast: dailyForecast.slice(0, 7).map((v) => Number(v.toFixed(3))),
      });
    }
  });

  // 5. Calculate Inventory Runway (both for sellable products and ingredients)
  const runwayResult: any[] = [];

  products.forEach((prod) => {
    // Current stock
    const currentStock = Number(prod.stock_available || 0);

    // Get projected daily consumption:
    // If it's an ingredient, use its ingredient forecast.
    // If it's a direct product, use its product sales forecast.
    const projectedDaily =
      ingredientDailyForecasts[prod.id] || forecasts[prod.id] || new Array(forecastDays).fill(0);

    const total30dDemand = projectedDaily.reduce((sum, val) => sum + val, 0);
    const avgDailyDemand = total30dDemand / forecastDays;

    if (avgDailyDemand === 0) {
      // No demand: runway is unlimited/safe
      runwayResult.push({
        product_id: prod.id,
        sku: prod.sku,
        name_ar: prod.name_ar,
        unit: prod.unit,
        category_name: prod.category_name,
        current_stock: currentStock,
        avg_daily_demand: 0,
        runway_days: 999, // safe indicator
        out_of_stock_date: 'مستقر',
      });
      return;
    }

    let runwayDays = 0;
    let outOfStockDateStr = 'مستمر (>30 يوم)';
    let tempStock = currentStock;

    for (let d = 0; d < forecastDays; d++) {
      const demand = projectedDaily[d] || 0;
      if (tempStock - demand <= 0) {
        runwayDays = d;
        const oosDate = new Date();
        oosDate.setDate(oosDate.getDate() + d);
        outOfStockDateStr = oosDate.toISOString().split('T')[0];
        break;
      }
      tempStock -= demand;
      if (d === forecastDays - 1) {
        // If stock is still positive after 30 days, estimate linearly
        runwayDays = Math.ceil(currentStock / avgDailyDemand);
        if (runwayDays > 30) {
          outOfStockDateStr = `أكثر من 30 يوم (~${runwayDays} يوم)`;
        } else {
          const oosDate = new Date();
          oosDate.setDate(oosDate.getDate() + runwayDays);
          outOfStockDateStr = oosDate.toISOString().split('T')[0];
        }
      }
    }

    runwayResult.push({
      product_id: prod.id,
      sku: prod.sku,
      name_ar: prod.name_ar,
      unit: prod.unit,
      category_name: prod.category_name,
      current_stock: currentStock,
      avg_daily_demand: Number(avgDailyDemand.toFixed(3)),
      runway_days: runwayDays,
      out_of_stock_date: outOfStockDateStr,
    });
  });

  // Sort runway results: lowest runway (highest risk) first
  runwayResult.sort((a, b) => a.runway_days - b.runway_days);

  return {
    salesForecast: salesForecastResult,
    ingredientsForecast: ingredientsForecastResult,
    inventoryRunway: runwayResult,
  };
};
