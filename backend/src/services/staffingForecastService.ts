import { query } from '../database/pool.ts';

/**
 * خدمة تحليل كثافة المبيعات وتوقع فترات الازدحام والشيفتات المطلوبة
 */
export const getStaffingForecast = async (params: Record<string, any> = {}) => {
  const warehouseId = Number(params.warehouse_id) || 1;

  // 1. استعلام لحساب عدد الفواتير وإجمالي المبيعات لكل يوم ساعة بساعة لآخر 90 يوماً
  const sql = `
    SELECT 
      EXTRACT(DOW FROM created_at) AS dow,
      EXTRACT(HOUR FROM created_at) AS hour,
      COUNT(*) AS tx_count,
      COALESCE(SUM(total_amount), 0) AS total_revenue
    FROM sales
    WHERE status = 'completed' AND deleted_at IS NULL
      AND warehouse_id = $1
      AND created_at >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY dow, hour
    ORDER BY dow, hour
  `;

  const rows = (await query(sql, [warehouseId])).rows;

  // 90 يوماً تقابل حوالي 13 أسبوعاً تقريباً
  const WEEKS_COUNT = 13.0;

  // 2. تهيئة مصفوفة أيام الأسبوع وساعاتها (0 = الأحد، 6 = السبت)
  const density = {};
  for (let d = 0; d < 7; d++) {
    density[d] = {};
    // افتراض ساعات العمل من 8 صباحاً وحتى 12 منتصف الليل
    for (let h = 8; h <= 23; h++) {
      density[d][h] = {
        avg_transactions: 0.0,
        avg_revenue: 0.0,
        traffic_level: 'منخفض', // منخفض، متوسط، مرتفع
        recommended_staff: 1,
      };
    }
  }

  // 3. ملء المصفوفة بالبيانات التاريخية وحساب المتوسطات والتوصيات
  rows.forEach((row) => {
    const d = Number(row.dow);
    const h = Number(row.hour);

    // تسجيل الساعات التي تقع ضمن فترة التشغيل فقط
    if (density[d] && density[d][h]) {
      const avgTx = Number((Number(row.tx_count) / WEEKS_COUNT).toFixed(2));
      const avgRev = Number((Number(row.total_revenue) / WEEKS_COUNT).toFixed(2));

      let traffic = 'منخفض';
      let staff = 1;

      if (avgTx > 8) {
        traffic = 'مرتفع';
        staff = 3;
      } else if (avgTx > 3) {
        traffic = 'متوسط';
        staff = 2;
      }

      density[d][h] = {
        avg_transactions: avgTx,
        avg_revenue: avgRev,
        traffic_level: traffic,
        recommended_staff: staff,
      };
    }
  });

  // 4. استخراج أكثر الساعات ازدحاماً خلال الأسبوع بأكمله
  const allHours: any[] = [];
  const dayNamesAr = {
    0: 'الأحد',
    1: 'الإثنين',
    2: 'الثلاثاء',
    3: 'الأربعاء',
    4: 'الخميس',
    5: 'الجمعة',
    6: 'السبت',
  };

  for (let d = 0; d < 7; d++) {
    for (let h = 8; h <= 23; h++) {
      const hourData = density[d][h];
      allHours.push({
        day_index: d,
        day_name: dayNamesAr[d],
        hour: h,
        hour_formatted: `${h}:00`,
        avg_transactions: hourData.avg_transactions,
        avg_revenue: hourData.avg_revenue,
        traffic_level: hourData.traffic_level,
        recommended_staff: hourData.recommended_staff,
      });
    }
  }

  // فرز الساعات تنازلياً حسب الكثافة لاستخراج أعلى 5 ساعات ذروة
  const peakHours = [...allHours]
    .sort((a, b) => b.avg_transactions - a.avg_transactions)
    .filter((x) => x.avg_transactions > 0)
    .slice(0, 5);

  return {
    weeklyDensity: density,
    peakHours,
    dayNames: dayNamesAr,
  };
};
