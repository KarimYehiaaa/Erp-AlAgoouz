import { getClient, query } from '../database/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { invalidateDashboardCache } from './dashboardService.js';
import { roundMoney, toNumber } from '../utils/money.js';



const getMonthBounds = (periodMonth) => {
  const raw = periodMonth || new Date().toISOString().slice(0, 7);
  const month = raw.length === 7 ? `${raw}-01` : raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-01$/.test(month)) throw new AppError('شهر المرتب يجب أن يكون بصيغة YYYY-MM', 400);
  return { month };
};

const ensureExpenseCategory = async (client, slug, nameAr) => {
  const existing = await client.query(`SELECT id FROM expense_categories WHERE slug = $1 LIMIT 1`, [slug]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await client.query(
    `INSERT INTO expense_categories (name_ar, slug, is_active) VALUES ($1, $2, TRUE) RETURNING id`,
    [nameAr, slug]
  );
  return created.rows[0].id;
};

const normalizeTime = (value) => {
  if (!value) return null;
  if (/^\d{2}:\d{2}$/.test(value)) return `${value}:00`;
  return value;
};

const datesBetween = (fromDate, toDate) => {
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate || fromDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new AppError('نطاق التاريخ غير صحيح', 400);
  if (end < start) throw new AppError('تاريخ النهاية يجب أن يكون بعد تاريخ البداية', 400);
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days > 31) throw new AppError('يمكن تسجيل الحضور حتى 31 يوم في العملية الواحدة', 400);
  return Array.from({ length: days }, (_, index) => {
    const current = new Date(start);
    current.setUTCDate(start.getUTCDate() + index);
    return current.toISOString().slice(0, 10);
  });
};

const mergeDateWithTime = (date, dateTimeValue) => {
  if (!dateTimeValue) return null;
  const time = String(dateTimeValue).includes('T')
    ? String(dateTimeValue).split('T')[1]
    : String(dateTimeValue);
  return `${date}T${time}`;
};

export const getHrSummary = async (periodMonth) => {
  const { month } = getMonthBounds(periodMonth);
  const [employees, todayAttendance, advances, payroll] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM employees WHERE deleted_at IS NULL AND is_active = TRUE`),
    query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'present')::int AS present,
        COUNT(*) FILTER (WHERE status = 'absent')::int AS absent
      FROM employee_attendance
      WHERE deleted_at IS NULL AND work_date = CURRENT_DATE
    `),
    query(`
      SELECT COALESCE(SUM(amount - COALESCE(installment_amount, amount) * paid_installments), 0)::numeric AS open_amount
      FROM employee_advances
      WHERE deleted_at IS NULL AND status = 'active'
    `),
    query(`
      SELECT status, total_net, total_advances
      FROM payroll_runs
      WHERE deleted_at IS NULL AND period_month = $1::date
      LIMIT 1
    `, [month]),
  ]);

  return {
    activeEmployees: employees.rows[0].count,
    todayPresent: todayAttendance.rows[0].present || 0,
    todayAbsent: todayAttendance.rows[0].absent || 0,
    openAdvances: roundMoney(advances.rows[0].open_amount),
    payroll: payroll.rows[0] || null,
  };
};

export const listShifts = async () => (
  await query(`SELECT * FROM employee_shifts WHERE deleted_at IS NULL ORDER BY id`)
).rows;

export const createShift = async (data) => {
  const result = await query(
    `INSERT INTO employee_shifts (name_ar, start_time, end_time, required_hours, grace_minutes, overtime_enabled, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      data.name_ar,
      normalizeTime(data.start_time) || '09:00:00',
      normalizeTime(data.end_time) || '17:00:00',
      toNumber(data.required_hours, 8),
      Math.max(0, Math.floor(toNumber(data.grace_minutes, 15))),
      data.overtime_enabled !== false,
      data.is_active !== false,
    ]
  );
  return result.rows[0];
};

export const listEmployees = async (filters = {}) => {
  const params = [];
  let sql = `
    SELECT e.*, s.name_ar AS shift_name, s.start_time, s.end_time
    FROM employees e
    LEFT JOIN employee_shifts s ON s.id = e.shift_id
    WHERE e.deleted_at IS NULL
  `;
  if (filters.active !== undefined && filters.active !== '') {
    params.push(filters.active === 'true' || filters.active === true);
    sql += ` AND e.is_active = $${params.length}`;
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    sql += ` AND (e.full_name ILIKE $${params.length} OR e.code ILIKE $${params.length} OR e.phone ILIKE $${params.length})`;
  }
  sql += ` ORDER BY e.is_active DESC, e.full_name`;
  return (await query(sql, params)).rows;
};

export const createEmployee = async (data) => {
  const result = await query(
    `INSERT INTO employees
      (code, full_name, job_title, phone, salary_type, base_salary, hourly_rate, overtime_rate,
       daily_required_hours, work_days_per_month, absence_deduction_type, shift_id, start_date, notes, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      data.code || `EMP-${Date.now()}`,
      data.full_name,
      data.job_title || null,
      data.phone || null,
      data.salary_type || 'monthly',
      roundMoney(data.base_salary),
      roundMoney(data.hourly_rate),
      roundMoney(data.overtime_rate),
      toNumber(data.daily_required_hours, 8),
      Math.max(1, Math.floor(toNumber(data.work_days_per_month, 26))),
      data.absence_deduction_type || 'daily',
      data.shift_id || null,
      data.start_date || new Date().toISOString().slice(0, 10),
      data.notes || null,
      data.is_active !== false,
    ]
  );
  return result.rows[0];
};

export const updateEmployee = async (id, data) => {
  const result = await query(
    `UPDATE employees SET
       code = COALESCE($1, code),
       full_name = COALESCE($2, full_name),
       job_title = $3,
       phone = $4,
       salary_type = COALESCE($5, salary_type),
       base_salary = COALESCE($6, base_salary),
       hourly_rate = COALESCE($7, hourly_rate),
       overtime_rate = COALESCE($8, overtime_rate),
       daily_required_hours = COALESCE($9, daily_required_hours),
       work_days_per_month = COALESCE($10, work_days_per_month),
       absence_deduction_type = COALESCE($11, absence_deduction_type),
       shift_id = $12,
       start_date = COALESCE($13, start_date),
       notes = $14,
       is_active = COALESCE($15, is_active)
     WHERE id = $16 AND deleted_at IS NULL
     RETURNING *`,
    [
      data.code || null,
      data.full_name || null,
      data.job_title || null,
      data.phone || null,
      data.salary_type || null,
      data.base_salary === undefined ? null : roundMoney(data.base_salary),
      data.hourly_rate === undefined ? null : roundMoney(data.hourly_rate),
      data.overtime_rate === undefined ? null : roundMoney(data.overtime_rate),
      data.daily_required_hours === undefined ? null : toNumber(data.daily_required_hours, 8),
      data.work_days_per_month === undefined ? null : Math.max(1, Math.floor(toNumber(data.work_days_per_month, 26))),
      data.absence_deduction_type || null,
      data.shift_id || null,
      data.start_date || null,
      data.notes || null,
      data.is_active,
      id,
    ]
  );
  if (!result.rows[0]) throw new AppError('الموظف غير موجود', 404);
  return result.rows[0];
};

export const deleteEmployee = async (id) => {
  await query(`UPDATE employees SET deleted_at = NOW(), is_active = FALSE WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return { deleted: true };
};

const calculateAttendanceFields = async (employeeId, workDate, checkIn, checkOut, status) => {
  if (['absent', 'unpaid_leave', 'weekly_off'].includes(status)) return { regularHours: 0, overtimeHours: 0, lateMinutes: 0 };
  const employee = (await query(`
    SELECT e.daily_required_hours, s.start_time, s.required_hours, s.grace_minutes, s.overtime_enabled
    FROM employees e
    LEFT JOIN employee_shifts s ON s.id = e.shift_id
    WHERE e.id = $1 AND e.deleted_at IS NULL
  `, [employeeId])).rows[0];
  if (!employee) throw new AppError('الموظف غير موجود', 404);

  const requiredHours = toNumber(employee.required_hours, toNumber(employee.daily_required_hours, 8));
  let regularHours = 0;
  let overtimeHours = 0;
  let lateMinutes = 0;

  if (status === 'paid_leave') {
    regularHours = requiredHours;
  } else if (status === 'half_day') {
    regularHours = roundMoney(requiredHours / 2);
  } else if (checkIn && checkOut) {
    const diffMs = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    const workedHours = Math.max(0, diffMs / 36e5);
    regularHours = Math.min(workedHours, requiredHours);
    overtimeHours = employee.overtime_enabled ? Math.max(0, workedHours - requiredHours) : 0;
  } else if (status === 'present') {
    regularHours = requiredHours;
  }

  if (checkIn && employee.start_time) {
    const expected = new Date(`${workDate}T${employee.start_time}`);
    const actual = new Date(checkIn);
    const grace = Math.max(0, Number(employee.grace_minutes || 0));
    lateMinutes = Math.max(0, Math.floor((actual.getTime() - expected.getTime()) / 60000) - grace);
  }

  return { regularHours: roundMoney(regularHours), overtimeHours: roundMoney(overtimeHours), lateMinutes };
};

export const listAttendance = async (filters = {}) => {
  const params = [];
  let sql = `
    SELECT a.*, TO_CHAR(a.work_date, 'YYYY-MM-DD') AS work_date, e.full_name AS employee_name, e.job_title
    FROM employee_attendance a
    JOIN employees e ON e.id = a.employee_id
    WHERE a.deleted_at IS NULL
  `;
  if (filters.from_date) { params.push(filters.from_date); sql += ` AND a.work_date >= $${params.length}::date`; }
  if (filters.to_date) { params.push(filters.to_date); sql += ` AND a.work_date <= $${params.length}::date`; }
  if (filters.employee_id) { params.push(filters.employee_id); sql += ` AND a.employee_id = $${params.length}`; }
  sql += ` ORDER BY a.work_date DESC, e.full_name LIMIT 300`;
  return (await query(sql, params)).rows;
};

export const saveAttendance = async (data, userId) => {
  const employeeId = Number(data.employee_id);
  if (!employeeId) throw new AppError('يرجى اختيار الموظف أولاً من القائمة', 400);

  const workDate = data.work_date || data.from_date || new Date().toISOString().slice(0, 10);
  const checkIn = data.check_in || null;
  const checkOut = data.check_out || null;
  const status = data.status || 'present';
  const calc = await calculateAttendanceFields(employeeId, workDate, checkIn, checkOut, status);
  const result = await query(
    `INSERT INTO employee_attendance
      (employee_id, work_date, check_in, check_out, status, regular_hours, overtime_hours, late_minutes, notes, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (employee_id, work_date)
     DO UPDATE SET
       check_in = EXCLUDED.check_in,
       check_out = EXCLUDED.check_out,
       status = EXCLUDED.status,
       regular_hours = EXCLUDED.regular_hours,
       overtime_hours = EXCLUDED.overtime_hours,
       late_minutes = EXCLUDED.late_minutes,
       notes = EXCLUDED.notes,
       user_id = EXCLUDED.user_id,
       deleted_at = NULL
     RETURNING *`,
    [employeeId, workDate, checkIn, checkOut, status, calc.regularHours, calc.overtimeHours, calc.lateMinutes, data.notes || null, userId]
  );
  return result.rows[0];
};

export const saveAttendanceRange = async (data, userId) => {
  const employeeId = Number(data.employee_id);
  if (!employeeId) throw new AppError('يرجى اختيار الموظف أولاً من القائمة', 400);

  const dates = datesBetween(data.from_date || data.work_date, data.to_date || data.from_date || data.work_date);
  if (!dates.length) return { count: 0, rows: [] };

  const employee = (await query(`
    SELECT e.daily_required_hours, s.start_time, s.required_hours, s.grace_minutes, s.overtime_enabled
    FROM employees e
    LEFT JOIN employee_shifts s ON s.id = e.shift_id
    WHERE e.id = $1 AND e.deleted_at IS NULL
  `, [employeeId])).rows[0];
  if (!employee) throw new AppError('الموظف غير موجود', 404);

  const requiredHours = toNumber(employee.required_hours, toNumber(employee.daily_required_hours, 8));
  const saved = [];

  for (const workDate of dates) {
    const checkIn = data.check_in ? mergeDateWithTime(workDate, data.check_in) : null;
    const checkOut = data.check_out ? mergeDateWithTime(workDate, data.check_out) : null;
    const status = data.status || 'present';

    let regularHours = 0;
    let overtimeHours = 0;
    let lateMinutes = 0;

    if (!['absent', 'unpaid_leave', 'weekly_off'].includes(status)) {
      if (status === 'paid_leave') {
        regularHours = requiredHours;
      } else if (status === 'half_day') {
        regularHours = roundMoney(requiredHours / 2);
      } else if (checkIn && checkOut) {
        const diffMs = new Date(checkOut).getTime() - new Date(checkIn).getTime();
        const workedHours = Math.max(0, diffMs / 36e5);
        regularHours = Math.min(workedHours, requiredHours);
        overtimeHours = employee.overtime_enabled ? Math.max(0, workedHours - requiredHours) : 0;
      } else if (status === 'present') {
        regularHours = requiredHours;
      }

      if (checkIn && employee.start_time) {
        const expected = new Date(`${workDate}T${employee.start_time}`);
        const actual = new Date(checkIn);
        const grace = Math.max(0, Number(employee.grace_minutes || 0));
        lateMinutes = Math.max(0, Math.floor((actual.getTime() - expected.getTime()) / 60000) - grace);
      }
    }

    const result = await query(
      `INSERT INTO employee_attendance
        (employee_id, work_date, check_in, check_out, status, regular_hours, overtime_hours, late_minutes, notes, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (employee_id, work_date)
       DO UPDATE SET
         check_in = EXCLUDED.check_in,
         check_out = EXCLUDED.check_out,
         status = EXCLUDED.status,
         regular_hours = EXCLUDED.regular_hours,
         overtime_hours = EXCLUDED.overtime_hours,
         late_minutes = EXCLUDED.late_minutes,
         notes = EXCLUDED.notes,
         user_id = EXCLUDED.user_id,
         deleted_at = NULL
       RETURNING *`,
      [data.employee_id, workDate, checkIn, checkOut, status, roundMoney(regularHours), roundMoney(overtimeHours), lateMinutes, data.notes || null, userId]
    );
    saved.push(result.rows[0]);
  }
  return { count: saved.length, rows: saved };
};

export const listAdvances = async (filters = {}) => {
  const params = [];
  let sql = `
    SELECT a.*, e.full_name AS employee_name,
      GREATEST(a.amount - COALESCE(a.installment_amount, a.amount) * a.paid_installments, 0) AS remaining_amount
    FROM employee_advances a
    JOIN employees e ON e.id = a.employee_id
    WHERE a.deleted_at IS NULL
  `;
  if (filters.employee_id) { params.push(filters.employee_id); sql += ` AND a.employee_id = $${params.length}`; }
  if (filters.status) { params.push(filters.status); sql += ` AND a.status = $${params.length}`; }
  sql += ` ORDER BY a.advance_date DESC, a.id DESC LIMIT 300`;
  return (await query(sql, params)).rows;
};

export const createAdvance = async (data, userId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const amount = roundMoney(data.amount);
    if (amount <= 0) throw new AppError('قيمة السلفة يجب أن تكون أكبر من صفر', 400);
    const installments = Math.max(1, Math.floor(toNumber(data.installments_count, 1)));
    const installmentAmount = roundMoney(data.installment_amount || amount / installments);
    const categoryId = await ensureExpenseCategory(client, 'employee-advances', 'سلف موظفين');
    const expense = await client.query(
      `INSERT INTO expenses (expense_number, category_id, title, amount, expense_date, payment_method, recurring, notes, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,FALSE,$7,$8) RETURNING id`,
      [`EXP-ADV-${Date.now()}`, categoryId, `سلفة موظف`, amount, data.advance_date || new Date(), data.payment_method || 'cash', data.notes || '', userId]
    );
    const result = await client.query(
      `INSERT INTO employee_advances
        (employee_id, advance_date, amount, installment_amount, installments_count, status, expense_id, notes, user_id)
       VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8) RETURNING *`,
      [data.employee_id, data.advance_date || new Date(), amount, installmentAmount, installments, expense.rows[0].id, data.notes || null, userId]
    );
    await client.query('COMMIT');
    invalidateDashboardCache();
    return result.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

const calculatePayrollItems = async (periodMonth) => {
  const { month } = getMonthBounds(periodMonth);
  const result = await query(`
    WITH bounds AS (
      SELECT $1::date AS start_date, ($1::date + INTERVAL '1 month - 1 day')::date AS end_date
    ),
    attendance AS (
      SELECT employee_id,
        COALESCE(SUM(CASE
          WHEN status IN ('present', 'paid_leave') THEN 1
          WHEN status = 'half_day' THEN 0.5
          ELSE 0
        END), 0)::numeric AS worked_days,
        COALESCE(SUM(CASE
          WHEN status IN ('absent', 'unpaid_leave') THEN 1
          WHEN status = 'half_day' THEN 0.5
          ELSE 0
        END), 0)::numeric AS absent_days,
        COALESCE(SUM(regular_hours), 0) AS regular_hours,
        COALESCE(SUM(overtime_hours), 0) AS overtime_hours,
        COALESCE(SUM(late_minutes), 0)::int AS late_minutes
      FROM employee_attendance, bounds
      WHERE deleted_at IS NULL AND work_date BETWEEN bounds.start_date AND bounds.end_date
      GROUP BY employee_id
    ),
    advances AS (
      SELECT employee_id,
        COALESCE(SUM(LEAST(COALESCE(installment_amount, amount), GREATEST(amount - COALESCE(installment_amount, amount) * paid_installments, 0))), 0) AS due_advance
      FROM employee_advances, bounds
      WHERE deleted_at IS NULL AND status = 'active' AND advance_date <= bounds.end_date
      GROUP BY employee_id
    )
    SELECT e.id AS employee_id, e.full_name, e.salary_type, e.base_salary, e.hourly_rate, e.overtime_rate,
      e.daily_required_hours, e.work_days_per_month,
      COALESCE(a.worked_days, 0)::numeric AS worked_days,
      COALESCE(a.absent_days, 0)::numeric AS absent_days,
      COALESCE(a.regular_hours, 0)::numeric AS regular_hours,
      COALESCE(a.overtime_hours, 0)::numeric AS overtime_hours,
      COALESCE(a.late_minutes, 0)::int AS late_minutes,
      COALESCE(adv.due_advance, 0)::numeric AS advance_deduction
    FROM employees e
    LEFT JOIN attendance a ON a.employee_id = e.id
    LEFT JOIN advances adv ON adv.employee_id = e.id
    WHERE e.deleted_at IS NULL AND e.is_active = TRUE
    ORDER BY e.full_name
  `, [month]);

  return result.rows.map((row) => {
    const baseSalary = roundMoney(row.base_salary);
    const workDaysPerMonth = Math.max(1, toNumber(row.work_days_per_month, 26));
    const workedDays = Math.min(toNumber(row.worked_days), workDaysPerMonth);
    const monthlyDailyRate = baseSalary / workDaysPerMonth;
    const dailyRate = row.salary_type === 'daily' ? baseSalary : monthlyDailyRate;
    const hourlyRate = row.salary_type === 'hourly'
      ? toNumber(row.hourly_rate)
      : dailyRate / Math.max(1, toNumber(row.daily_required_hours, 8));
    const overtimeAmount = roundMoney(toNumber(row.overtime_hours) * (toNumber(row.overtime_rate) || hourlyRate));
    const absenceDeduction = row.salary_type === 'monthly'
      ? roundMoney(Math.max(0, workDaysPerMonth - workedDays) * monthlyDailyRate)
      : 0;
    const lateDeduction = row.salary_type === 'hourly'
      ? 0
      : roundMoney((toNumber(row.late_minutes) / 60) * hourlyRate);
    let grossSalary;
    if (row.salary_type === 'hourly') {
      grossSalary = roundMoney(toNumber(row.regular_hours) * hourlyRate + overtimeAmount);
    } else if (row.salary_type === 'daily') {
      grossSalary = roundMoney(workedDays * dailyRate + overtimeAmount);
    } else {
      grossSalary = roundMoney(baseSalary + overtimeAmount);
    }
    const salaryBeforeAdvance = roundMoney(grossSalary - absenceDeduction - lateDeduction);
    const maxPossibleDeduction = Math.max(0, salaryBeforeAdvance);
    const advanceDeduction = Math.min(roundMoney(row.advance_deduction), maxPossibleDeduction);
    const netSalary = roundMoney(Math.max(0, salaryBeforeAdvance - advanceDeduction));
    return {
      ...row,
      base_salary: baseSalary,
      overtime_amount: overtimeAmount,
      absence_deduction: absenceDeduction,
      late_deduction: lateDeduction,
      advance_deduction: advanceDeduction,
      gross_salary: grossSalary,
      net_salary: netSalary,
    };
  });
};

export const previewPayroll = async (periodMonth) => {
  const { month } = getMonthBounds(periodMonth);
  const items = await calculatePayrollItems(month);
  return {
    period_month: month,
    items,
    totals: {
      gross: roundMoney(items.reduce((sum, item) => sum + item.gross_salary, 0)),
      deductions: roundMoney(items.reduce((sum, item) => sum + item.absence_deduction + item.late_deduction, 0)),
      advances: roundMoney(items.reduce((sum, item) => sum + item.advance_deduction, 0)),
      net: roundMoney(items.reduce((sum, item) => sum + item.net_salary, 0)),
    },
  };
};

export const createOrRecalculatePayroll = async (periodMonth, userId) => {
  const preview = await previewPayroll(periodMonth);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT * FROM payroll_runs WHERE period_month = $1::date AND deleted_at IS NULL LIMIT 1`,
      [preview.period_month]
    );
    if (existing.rows[0]?.status === 'paid') throw new AppError('لا يمكن إعادة حساب شهر تم صرفه بالفعل', 400);
    const run = await client.query(
      `INSERT INTO payroll_runs (period_month, status, total_gross, total_deductions, total_advances, total_net, user_id)
       VALUES ($1::date,'draft',$2,$3,$4,$5,$6)
       ON CONFLICT (period_month)
       DO UPDATE SET status = 'draft', total_gross = EXCLUDED.total_gross, total_deductions = EXCLUDED.total_deductions,
         total_advances = EXCLUDED.total_advances, total_net = EXCLUDED.total_net, user_id = EXCLUDED.user_id
       RETURNING *`,
      [preview.period_month, preview.totals.gross, preview.totals.deductions, preview.totals.advances, preview.totals.net, userId]
    );
    await client.query(`DELETE FROM payroll_items WHERE payroll_run_id = $1`, [run.rows[0].id]);
    for (const item of preview.items) {
      await client.query(
        `INSERT INTO payroll_items
          (payroll_run_id, employee_id, base_salary, worked_days, absent_days, regular_hours, overtime_hours,
           late_minutes, overtime_amount, absence_deduction, late_deduction, advance_deduction, gross_salary, net_salary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          run.rows[0].id, item.employee_id, item.base_salary, item.worked_days, item.absent_days,
          item.regular_hours, item.overtime_hours, item.late_minutes, item.overtime_amount,
          item.absence_deduction, item.late_deduction, item.advance_deduction, item.gross_salary, item.net_salary,
        ]
      );
    }
    await client.query('COMMIT');
    return getPayrollRun(run.rows[0].id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export const listPayrollRuns = async () => (
  await query(`SELECT * FROM payroll_runs WHERE deleted_at IS NULL ORDER BY period_month DESC LIMIT 36`)
).rows;

export const getPayrollRun = async (id) => {
  const run = (await query(`SELECT * FROM payroll_runs WHERE id = $1 AND deleted_at IS NULL`, [id])).rows[0];
  if (!run) throw new AppError('مسير المرتبات غير موجود', 404);
  const items = (await query(`
    SELECT pi.*, e.full_name AS employee_name, e.job_title
    FROM payroll_items pi
    JOIN employees e ON e.id = pi.employee_id
    WHERE pi.payroll_run_id = $1
    ORDER BY e.full_name
  `, [id])).rows;
  return { ...run, items };
};

const applyAdvanceDeductions = async (client, employeeId, amount) => {
  let remaining = roundMoney(amount);
  if (remaining <= 0) return;
  const advances = await client.query(`
    SELECT id, amount, installment_amount, paid_installments
    FROM employee_advances
    WHERE employee_id = $1 AND deleted_at IS NULL AND status = 'active'
    ORDER BY advance_date, id
  `, [employeeId]);
  for (const advance of advances.rows) {
    if (remaining <= 0) break;
    const installment = roundMoney(advance.installment_amount || advance.amount);
    const balance = roundMoney(advance.amount - installment * Number(advance.paid_installments));
    const deduction = Math.min(remaining, balance, installment);
    const newPaidInstallments = Math.round((Number(advance.paid_installments) + (deduction / installment)) * 10000) / 10000;
    const newBalance = roundMoney(balance - deduction);
    await client.query(
      `UPDATE employee_advances
       SET paid_installments = $1, status = CASE WHEN $2 <= 0.01 THEN 'closed' ELSE status END
       WHERE id = $3`,
      [newPaidInstallments, newBalance, advance.id]
    );
    remaining = roundMoney(remaining - deduction);
  }
};

export const payPayrollRun = async (id, userId, paymentMethod = 'cash') => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const run = (await client.query(`SELECT * FROM payroll_runs WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id])).rows[0];
    if (!run) throw new AppError('مسير المرتبات غير موجود', 404);
    if (run.status === 'paid') throw new AppError('تم صرف هذا المسير بالفعل', 400);
    const categoryId = await ensureExpenseCategory(client, 'salaries', 'مرتبات');
    const expense = await client.query(
      `INSERT INTO expenses (expense_number, category_id, title, amount, expense_date, payment_method, recurring, notes, user_id)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,FALSE,$6,$7) RETURNING id`,
      [`EXP-PAY-${Date.now()}`, categoryId, `صرف مرتبات ${String(run.period_month).slice(0, 7)}`, run.total_net, paymentMethod, 'مصروف صافى المرتبات بعد خصم السلف', userId]
    );
    const items = (await client.query(`SELECT employee_id, advance_deduction FROM payroll_items WHERE payroll_run_id = $1`, [id])).rows;
    for (const item of items) await applyAdvanceDeductions(client, item.employee_id, item.advance_deduction);
    const updated = await client.query(
      `UPDATE payroll_runs SET status = 'paid', paid_at = NOW(), expense_id = $1, user_id = $2 WHERE id = $3 RETURNING *`,
      [expense.rows[0].id, userId, id]
    );
    await client.query('COMMIT');
    invalidateDashboardCache();
    return getPayrollRun(updated.rows[0].id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export const deleteAttendance = async (id) => {
  await query(`UPDATE employee_attendance SET deleted_at = NOW() WHERE id = $1`, [id]);
  return null;
};

export const deleteAdvance = async (id) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const adv = (await client.query(`SELECT expense_id FROM employee_advances WHERE id = $1`, [id])).rows[0];
    if (adv?.expense_id) {
      await client.query(`UPDATE expenses SET deleted_at = NOW() WHERE id = $1`, [adv.expense_id]);
    }
    await client.query(`UPDATE employee_advances SET deleted_at = NOW() WHERE id = $1`, [id]);
    await client.query('COMMIT');
    invalidateDashboardCache();
    return null;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export const deletePayrollRun = async (id) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const run = (await client.query(`SELECT status, expense_id FROM payroll_runs WHERE id = $1 AND deleted_at IS NULL`, [id])).rows[0];
    if (!run) throw new AppError('مسير المرتبات غير موجود', 404);
    if (run.status === 'paid') throw new AppError('لا يمكن حذف مسير مرتبات تم صرفه بالفعل', 400);
    await client.query(`UPDATE payroll_runs SET deleted_at = NOW() WHERE id = $1`, [id]);
    await client.query(`DELETE FROM payroll_items WHERE payroll_run_id = $1`, [id]);
    await client.query('COMMIT');
    return null;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export const getAttendanceSummary = async (filters = {}) => {
  const params = [];
  let sql = `
    SELECT
      e.id, e.full_name, e.job_title, e.base_salary,
      COUNT(a.id) FILTER (WHERE a.status = 'present') AS days_present,
      COUNT(a.id) FILTER (WHERE a.status = 'absent')  AS days_absent,
      COUNT(a.id) FILTER (WHERE a.status = 'paid_leave') AS days_leave,
      COUNT(a.id) FILTER (WHERE a.status = 'half_day') AS days_half,
      COALESCE(SUM(a.late_minutes), 0)::int AS total_minutes_late
    FROM employees e
    LEFT JOIN employee_attendance a ON a.employee_id = e.id AND a.deleted_at IS NULL
  `;
  
  const joinConditions = [];
  if (filters.from_date) {
    params.push(filters.from_date);
    joinConditions.push(`a.work_date >= $${params.length}`);
  }
  if (filters.to_date) {
    params.push(filters.to_date);
    joinConditions.push(`a.work_date <= $${params.length}`);
  }
  if (joinConditions.length) {
    sql += ` AND ${joinConditions.join(' AND ')}`;
  }
  
  sql += `
    WHERE e.deleted_at IS NULL AND e.is_active = TRUE
    GROUP BY e.id, e.full_name, e.job_title, e.base_salary
    ORDER BY e.full_name
  `;
  
  return (await query(sql, params)).rows;
};
