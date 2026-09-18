import { query, getClient } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { getProfitAndLoss } from './plService.ts';
import { roundMoney } from '../utils/money.ts';
import logger from './loggerService.ts';

export interface PartnerInput {
  name_ar: string;
  phone?: string;
  share_percentage: number;
  capital_contribution?: number;
  opening_balance?: number;
  notes?: string;
  is_active?: boolean;
}

export interface DrawingInput {
  partner_id: number;
  amount: number;
  drawing_date?: string;
  source_type?: string;
  warehouse_id?: number | null;
  recipient_name?: string;
  payment_method?: string;
  voucher_number?: string;
  notes?: string;
}

/**
 * جلب قائمة الشركاء مع إجمالي المسحوبات الحالية والرصيد
 */
export const getPartners = async () => {
  const result = await query(`
    SELECT
      p.*,
      COALESCE(d.total_drawings, 0) AS total_drawings,
      COALESCE(d.drawings_count, 0) AS drawings_count,
      COALESCE(d.last_drawing_date, NULL) AS last_drawing_date
    FROM partners p
    LEFT JOIN (
      SELECT
        partner_id,
        SUM(amount) AS total_drawings,
        COUNT(*)::int AS drawings_count,
        MAX(drawing_date) AS last_drawing_date
      FROM partner_drawings
      GROUP BY partner_id
    ) d ON d.partner_id = p.id
    ORDER BY p.is_active DESC, p.share_percentage DESC, p.id ASC
  `);

  return result.rows.map((row) => ({
    ...row,
    share_percentage: Number(row.share_percentage || 0),
    capital_contribution: Number(row.capital_contribution || 0),
    opening_balance: Number(row.opening_balance || 0),
    total_drawings: Number(row.total_drawings || 0),
    drawings_count: Number(row.drawings_count || 0),
  }));
};

/**
 * جلب شريك محدد مع تاريخ مسحوباته
 */
export const getPartnerById = async (id: number) => {
  const partnerRes = await query(`SELECT * FROM partners WHERE id = $1`, [id]);
  if (!partnerRes.rows.length) {
    throw new AppError('الشريك غير موجود', 404);
  }

  const partner = partnerRes.rows[0];
  const drawingsRes = await query(
    `SELECT d.*, b.name_ar as warehouse_name, COALESCE(u.full_name, u.username) as created_by_name
     FROM partner_drawings d
     LEFT JOIN warehouses b ON b.id = d.warehouse_id
     LEFT JOIN users u ON u.id = d.created_by
     WHERE d.partner_id = $1
     ORDER BY d.drawing_date DESC, d.id DESC
     LIMIT 50`,
    [id],
  );

  return {
    ...partner,
    share_percentage: Number(partner.share_percentage || 0),
    capital_contribution: Number(partner.capital_contribution || 0),
    opening_balance: Number(partner.opening_balance || 0),
    drawings: drawingsRes.rows.map((d) => ({
      ...d,
      amount: Number(d.amount || 0),
    })),
  };
};

/**
 * إضافة شريك جديد مع التحقق من مجموع النسب
 */
export const createPartner = async (data: PartnerInput) => {
  if (!data.name_ar || !data.name_ar.trim()) {
    throw new AppError('اسم الشريك مطلوب', 400);
  }

  const share = Number(data.share_percentage || 0);
  if (share < 0 || share > 100) {
    throw new AppError('نسبة الشراكة يجب أن تكون بين 0% و 100%', 400);
  }

  // فحص مجموع النسب الحالية للشركاء النشطين
  const totalShareRes = await query(`
    SELECT COALESCE(SUM(share_percentage), 0) as total_share
    FROM partners
    WHERE is_active = true
  `);
  const currentTotal = Number(totalShareRes.rows[0]?.total_share || 0);

  if (currentTotal + share > 100.01) {
    throw new AppError(
      `مجموع نسب الشركاء سيتجاوز 100% (المجموع الحالي: ${currentTotal}% + النسبة المدخلة: ${share}% = ${currentTotal + share}%)`,
      400,
    );
  }

  const res = await query(
    `INSERT INTO partners (name_ar, phone, share_percentage, capital_contribution, opening_balance, notes, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.name_ar.trim(),
      data.phone?.trim() || null,
      share,
      Number(data.capital_contribution || 0),
      Number(data.opening_balance || 0),
      data.notes?.trim() || null,
      data.is_active !== undefined ? data.is_active : true,
    ],
  );

  logger.info(`[Partners] تم إضافة شريك جديد: ${data.name_ar} بنسبة ${share}%`);
  return res.rows[0];
};

/**
 * تعديل بيانات شريك
 */
export const updatePartner = async (id: number, data: Partial<PartnerInput>) => {
  const existing = await query(`SELECT * FROM partners WHERE id = $1`, [id]);
  if (!existing.rows.length) {
    throw new AppError('الشريك غير موجود', 404);
  }

  const prev = existing.rows[0];
  const share =
    data.share_percentage !== undefined
      ? Number(data.share_percentage)
      : Number(prev.share_percentage);

  if (share < 0 || share > 100) {
    throw new AppError('نسبة الشراكة يجب أن تكون بين 0% و 100%', 400);
  }

  // فحص مجموع النسب مع استثناء الشريك الحالي
  const totalShareRes = await query(
    `
    SELECT COALESCE(SUM(share_percentage), 0) as total_share
    FROM partners
    WHERE is_active = true AND id != $1
  `,
    [id],
  );
  const otherTotal = Number(totalShareRes.rows[0]?.total_share || 0);

  const isActive = data.is_active !== undefined ? data.is_active : prev.is_active;
  if (isActive && otherTotal + share > 100.01) {
    throw new AppError(
      `مجموع نسب الشركاء سيتجاوز 100% (المجموع للآخرين: ${otherTotal}% + النسبة: ${share}%)`,
      400,
    );
  }

  const res = await query(
    `UPDATE partners
     SET name_ar = COALESCE($1, name_ar),
         phone = COALESCE($2, phone),
         share_percentage = COALESCE($3, share_percentage),
         capital_contribution = COALESCE($4, capital_contribution),
         opening_balance = COALESCE($5, opening_balance),
         notes = COALESCE($6, notes),
         is_active = COALESCE($7, is_active),
         updated_at = NOW()
     WHERE id = $8
     RETURNING *`,
    [
      data.name_ar ? data.name_ar.trim() : null,
      data.phone !== undefined ? data.phone.trim() : null,
      data.share_percentage !== undefined ? share : null,
      data.capital_contribution !== undefined ? Number(data.capital_contribution) : null,
      data.opening_balance !== undefined ? Number(data.opening_balance) : null,
      data.notes !== undefined ? data.notes.trim() : null,
      data.is_active !== undefined ? data.is_active : null,
      id,
    ],
  );

  return res.rows[0];
};

/**
 * حذف أو تعطيل شريك
 */
export const deletePartner = async (id: number) => {
  const checkDrawings = await query(
    `SELECT COUNT(*)::int as count FROM partner_drawings WHERE partner_id = $1`,
    [id],
  );
  if (checkDrawings.rows[0].count > 0) {
    // إذا كان له مسحوبات سابقة نقوم بتعطيله بدلاً من حذفه للحفاظ على السجلات المالية
    await query(`UPDATE partners SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
    return { message: 'تم تعطيل الشريك بدلاً من حذفه لوجود مسحوبات مالية مسجلة باسمه' };
  }

  await query(`DELETE FROM partners WHERE id = $1`, [id]);
  return { message: 'تم حذف الشريك بنجاح' };
};

/**
 * جلب سجل سندات مسحوبات الشركاء مع الفلاتر
 */
export const getPartnerDrawings = async (filters: {
  partner_id?: number;
  from_date?: string;
  to_date?: string;
  warehouse_id?: number;
  source_type?: string;
}) => {
  const conditions: string[] = [];
  const params: any[] = [];
  let pIdx = 1;

  if (filters.partner_id) {
    conditions.push(`d.partner_id = $${pIdx++}`);
    params.push(filters.partner_id);
  }

  if (filters.from_date) {
    conditions.push(`d.drawing_date >= $${pIdx++}::date`);
    params.push(filters.from_date);
  }

  if (filters.to_date) {
    conditions.push(`d.drawing_date <= $${pIdx++}::date`);
    params.push(filters.to_date);
  }

  if (filters.warehouse_id) {
    conditions.push(`d.warehouse_id = $${pIdx++}`);
    params.push(filters.warehouse_id);
  }

  if (filters.source_type) {
    conditions.push(`d.source_type = $${pIdx++}`);
    params.push(filters.source_type);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const listQuery = `
    SELECT
      d.*,
      p.name_ar AS partner_name,
      p.phone AS partner_phone,
      p.share_percentage AS partner_share,
      b.name_ar AS warehouse_name,
      COALESCE(u.full_name, u.username) AS created_by_name
    FROM partner_drawings d
    JOIN partners p ON p.id = d.partner_id
    LEFT JOIN warehouses b ON b.id = d.warehouse_id
    LEFT JOIN users u ON u.id = d.created_by
    ${whereClause}
    ORDER BY d.drawing_date DESC, d.id DESC
  `;

  const totalQuery = `
    SELECT
      COALESCE(SUM(d.amount), 0) AS total_amount,
      COUNT(*)::int AS count
    FROM partner_drawings d
    ${whereClause}
  `;

  const [listRes, totalRes] = await Promise.all([
    query(listQuery, params),
    query(totalQuery, params),
  ]);

  return {
    drawings: listRes.rows.map((row) => ({
      ...row,
      amount: Number(row.amount || 0),
      partner_share: Number(row.partner_share || 0),
    })),
    total_amount: Number(totalRes.rows[0]?.total_amount || 0),
    count: Number(totalRes.rows[0]?.count || 0),
  };
};

/**
 * إنشاء سند مسحوبات شريك جديد
 */
export const createPartnerDrawing = async (data: DrawingInput, userId: number) => {
  if (!data.partner_id) {
    throw new AppError('الشريك مطلوب', 400);
  }

  const amount = Number(data.amount || 0);
  if (!amount || amount <= 0) {
    throw new AppError('المبلغ يجب أن يكون أكبر من الصفر', 400);
  }

  const partnerRes = await query(`SELECT * FROM partners WHERE id = $1`, [data.partner_id]);
  if (!partnerRes.rows.length) {
    throw new AppError('الشريك غير موجود', 404);
  }
  const partner = partnerRes.rows[0];

  const voucherNum =
    data.voucher_number ||
    `DRW-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const res = await client.query(
      `INSERT INTO partner_drawings (
        partner_id, amount, drawing_date, source_type, warehouse_id, recipient_name, payment_method, voucher_number, notes, created_by
      ) VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        data.partner_id,
        amount,
        data.drawing_date || null,
        data.source_type || 'cash_drawer',
        data.warehouse_id || null,
        data.recipient_name || partner.name_ar,
        data.payment_method || 'cash',
        voucherNum,
        data.notes?.trim() || null,
        userId,
      ],
    );

    const drawing = res.rows[0];
    logger.info(
      `[Partner Drawings] تم تسجيل سند صرف مسحوبات بقيمة ${amount} ج.م للشريك (${partner.name_ar}) سند رقم ${voucherNum}`,
    );

    const { accountingService } = await import('./accountingService.ts');
    await accountingService.postPartnerDrawingJournalEntry(client, {
      id: drawing.id,
      voucher_number: voucherNum,
      partner_id: drawing.partner_id,
      amount,
      source_type: drawing.source_type,
      payment_method: drawing.payment_method,
      notes: drawing.notes,
      user_id: userId,
    });

    await client.query('COMMIT');
    return {
      ...drawing,
      amount: Number(drawing.amount),
      partner_name: partner.name_ar,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * حذف سند مسحوبات
 */
export const deletePartnerDrawing = async (id: number) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const existing = await client.query(`SELECT * FROM partner_drawings WHERE id = $1 FOR UPDATE`, [
      id,
    ]);
    if (!existing.rows.length) {
      throw new AppError('سند المسحوبات غير موجود', 404);
    }

    await client.query(`DELETE FROM partner_drawings WHERE id = $1`, [id]);

    const { accountingService } = await import('./accountingService.ts');
    await accountingService.deleteJournalEntryByReference('manual', id, client);

    await client.query('COMMIT');
    return { message: 'تم حذف سند المسحوبات بنجاح وتعديل رصيد الشريك' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * تسوية وتوزيع الأرباح التلقائية للفترة
 */
export const getProfitSettlement = async (fromDate: string, toDate: string) => {
  if (!fromDate || !toDate) {
    throw new AppError('fromDate و toDate مطلوبان', 400);
  }

  // 1. حساب صافي الربح الحقيقي من موديول الـ P&L
  const pl = await getProfitAndLoss(fromDate, toDate);
  const netProfit =
    typeof pl.net_profit === 'object'
      ? Number(pl.net_profit?.amount || 0)
      : Number(pl.net_profit || pl.netProfit || 0);
  const revenue =
    typeof pl.revenue === 'object'
      ? Number(pl.revenue?.net ?? pl.revenue?.gross ?? 0)
      : Number(pl.revenue || 0);
  const cogs = typeof pl.cogs === 'object' ? Number(pl.cogs?.total || 0) : Number(pl.cogs || 0);
  const grossProfit =
    typeof pl.gross_profit === 'object'
      ? Number(pl.gross_profit?.amount || 0)
      : Number(pl.gross_profit || pl.grossProfit || 0);
  const totalExpenses =
    typeof pl.operating_expenses === 'object'
      ? Number(pl.operating_expenses?.total || 0)
      : Number(pl.totalExpenses || pl.total_expenses || 0);

  // 2. جلب الشركاء النشطين
  const partnersRes = await query(`
    SELECT * FROM partners WHERE is_active = true ORDER BY share_percentage DESC, id ASC
  `);
  const activePartners = partnersRes.rows;

  // 3. جلب مسحوبات كل شريك في الفترة المحددة
  const drawingsRes = await query(
    `SELECT partner_id, SUM(amount) as period_drawings, COUNT(*)::int as drawings_count
     FROM partner_drawings
     WHERE drawing_date BETWEEN $1::date AND $2::date
     GROUP BY partner_id`,
    [fromDate, toDate],
  );

  const drawingsMap = new Map<number, { amount: number; count: number }>();
  drawingsRes.rows.forEach((r) => {
    drawingsMap.set(Number(r.partner_id), {
      amount: Number(r.period_drawings || 0),
      count: Number(r.drawings_count || 0),
    });
  });

  let totalDrawingsPeriod = 0;
  let totalDistributedProfit = 0;

  // 4. بناء التوزيع والتسوية لكل شريك
  const partnersBreakdown = activePartners.map((p) => {
    const sharePct = Number(p.share_percentage || 0);
    // حصة الشريك من الأرباح
    const shareAmount = roundMoney((netProfit * sharePct) / 100);
    totalDistributedProfit += shareAmount;

    // مسحوبات الشريك في الفترة
    const drawingInfo = drawingsMap.get(Number(p.id)) || { amount: 0, count: 0 };
    const drawingsAmount = roundMoney(drawingInfo.amount);
    totalDrawingsPeriod += drawingsAmount;

    // المتبقي الصافي في الخزينة بعد خصم المسحوبات
    const netBalance = roundMoney(shareAmount - drawingsAmount);

    let status: 'payable' | 'overdrawn' | 'settled' = 'settled';
    if (netBalance > 0.01) {
      status = 'payable'; // له رصيد متبقي يسحبه
    } else if (netBalance < -0.01) {
      status = 'overdrawn'; // سحب أكثر من نصيبه (مدين)
    }

    return {
      id: p.id,
      name_ar: p.name_ar,
      phone: p.phone,
      share_percentage: sharePct,
      share_profit_amount: shareAmount,
      period_drawings: drawingsAmount,
      drawings_count: drawingInfo.count,
      net_balance: netBalance,
      status,
    };
  });

  // المتبقي في الخزينة من الأرباح الإجمالية بعد خصم جميع مسحوبات الشركاء
  const netUndistributedCash = roundMoney(netProfit - totalDrawingsPeriod);

  return {
    period: {
      from_date: fromDate,
      to_date: toDate,
    },
    pl_summary: {
      revenue,
      cogs,
      gross_profit: grossProfit,
      total_expenses: totalExpenses,
      net_profit: netProfit,
    },
    settlement_summary: {
      total_partners: activePartners.length,
      total_share_percentage: activePartners.reduce(
        (acc, p) => acc + Number(p.share_percentage || 0),
        0,
      ),
      total_drawings: roundMoney(totalDrawingsPeriod),
      total_distributed_profit: roundMoney(totalDistributedProfit),
      net_undistributed_cash: netUndistributedCash,
    },
    partners: partnersBreakdown,
  };
};
