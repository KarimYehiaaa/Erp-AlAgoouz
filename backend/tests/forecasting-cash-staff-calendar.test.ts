import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';

const fixtures = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/database/pool.ts', () => ({ query: fixtures.query }));
import { getCashFlowProjection } from '../src/services/cashFlowProjectionService.ts';
import { getStaffingForecast } from '../src/services/staffingForecastService.ts';

const occurrences = Array.from({ length: 7 }, (_, dow) => ({ dow, occ: dow === 2 ? 12 : 13 }));
function arrangeCash(firstRead?: () => void, balance = 10000) {
  fixtures.query
    .mockImplementationOnce(async () => {
      firstRead?.();
      return { rows: [{ val: balance }] };
    })
    .mockResolvedValueOnce({ rows: [{ dow: 2, total_in: 1200, total_out: 180 }] })
    .mockResolvedValueOnce({ rows: occurrences });
}
beforeEach(() => {
  fixtures.query.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-04T22:30:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it.each(['UTC', 'America/Los_Angeles', 'Africa/Cairo'])(
  'projects the same Cairo day and weekday on a host in %s',
  async (timezone) => {
    vi.stubEnv('TZ', timezone);
    arrangeCash();
    const report = await getCashFlowProjection({ warehouse_id: 2 });
    expect(report.dailyPoints).toHaveLength(30);
    expect(report.dailyPoints[0]).toMatchObject({
      date: '2026-10-06',
      day_name: 'الثلاثاء',
      projected_in: 100,
      projected_out: 15,
    });
    expect(report.dailyPoints[29].date).toBe('2026-11-04');
    expect(fixtures.query.mock.calls[0][1]).toEqual(['2026-10-05']);
    expect(fixtures.query.mock.calls[1][1]).toEqual(['2026-07-08', '2026-10-05']);
    expect(fixtures.query.mock.calls[2][1]).toEqual(['2026-07-08', '2026-10-05']);
  },
);
it('keeps one cash-flow report day when database reads cross Cairo midnight', async () => {
  vi.stubEnv('TZ', 'UTC');
  vi.setSystemTime(new Date('2026-10-04T20:59:59Z'));
  arrangeCash(() => {
    vi.setSystemTime(new Date('2026-10-04T21:00:01Z'));
  });
  const report = await getCashFlowProjection({ warehouse_id: 2 });
  expect(report.dailyPoints[0]).toMatchObject({ date: '2026-10-05', day_name: 'الإثنين' });
  expect(fixtures.query.mock.calls[1][1]).toEqual(['2026-07-07', '2026-10-04']);
});
it('describes a zero opening balance accurately without calling it negative', async () => {
  arrangeCash(undefined, 0);
  const report = await getCashFlowProjection({ warehouse_id: 2 });
  expect(report.currentBalance).toBe(0);
  expect(report.runwayDays).toBe(0);
  expect(report.status).toBe('danger');
  expect(report.warningMsg).toContain('غير موجب');
});
it('uses posted cash-account balances and movements instead of gross sales and unpaid costs', async () => {
  fixtures.query
    .mockResolvedValueOnce({ rows: [{ val: 500 }] })
    .mockResolvedValueOnce({ rows: [{ dow: 2, total_in: 1200, total_out: 180 }] })
    .mockResolvedValueOnce({ rows: occurrences });
  const report = await getCashFlowProjection({ warehouse_id: 2 });
  expect(report.currentBalance).toBe(500);
  expect(report.dailyPoints[0]).toMatchObject({ projected_in: 100, projected_out: 15 });
  expect(fixtures.query).toHaveBeenCalledTimes(3);
  expect(fixtures.query.mock.calls[0][0]).toContain('journal_entry_lines');
  expect(fixtures.query.mock.calls[0][0]).toContain("e.status = 'posted'");
  expect(fixtures.query.mock.calls[1][0]).toContain('journal_entry_lines');
  expect(fixtures.query.mock.calls[1][0]).toContain("e.reference_type IS DISTINCT FROM 'transfer'");
});
it('normalizes staffing by actual weekday occurrences instead of 13 for every day', async () => {
  fixtures.query
    .mockResolvedValueOnce({ rows: [{ dow: 2, hour: 23, tx_count: 12, total_revenue: 1200 }] })
    .mockResolvedValueOnce({ rows: occurrences });
  const report = await getStaffingForecast({ warehouse_id: 2 });
  expect(report.weeklyDensity[2][23]).toMatchObject({ avg_transactions: 1, avg_revenue: 100 });
  expect(report.peakHours[0]).toMatchObject({ day_name: 'الثلاثاء', hour: 23 });
  expect(fixtures.query.mock.calls[0][1]).toEqual([2, '2026-07-08', '2026-10-05', 'Africa/Cairo']);
  expect(fixtures.query.mock.calls[1][1]).toEqual(['2026-07-08', '2026-10-05']);
});
it('captures the staffing day before a midnight-crossing first query', async () => {
  vi.setSystemTime(new Date('2026-10-04T20:59:59Z'));
  fixtures.query
    .mockImplementationOnce(async () => {
      vi.setSystemTime(new Date('2026-10-04T21:00:01Z'));
      return { rows: [] };
    })
    .mockResolvedValueOnce({ rows: occurrences });
  await getStaffingForecast({ warehouse_id: 2 });
  expect(fixtures.query.mock.calls[0][1]).toEqual([2, '2026-07-07', '2026-10-04', 'Africa/Cairo']);
  expect(fixtures.query.mock.calls[1][1]).toEqual(['2026-07-07', '2026-10-04']);
});
it('keeps cash-flow calendar dates identical across Cairo daylight-saving fallback', async () => {
  const reports: Awaited<ReturnType<typeof getCashFlowProjection>>[] = [];
  for (const timezone of ['UTC', 'America/Los_Angeles', 'Africa/Cairo']) {
    vi.stubEnv('TZ', timezone);
    vi.setSystemTime(new Date('2026-10-29T21:30:00Z'));
    fixtures.query.mockReset();
    arrangeCash();
    reports.push(await getCashFlowProjection({ warehouse_id: 2 }));
  }
  expect(reports[0]!.dailyPoints[0]).toMatchObject({ date: '2026-10-30', day_name: 'الجمعة' });
  expect(reports[0]!.dailyPoints[29].date).toBe('2026-11-28');
  expect(reports[1]).toEqual(reports[0]);
  expect(reports[2]).toEqual(reports[0]);
});
it('aggregates both repeated Cairo 23:30 instants and respects DST window boundaries in PostgreSQL', async () => {
  vi.setSystemTime(new Date('2026-10-30T00:30:00Z'));
  const { getClient } = await vi.importActual<{ getClient: () => Promise<PoolClient> }>(
    '../src/database/pool.ts',
  );
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      'CREATE TEMP TABLE sales (LIKE public.sales INCLUDING DEFAULTS) ON COMMIT DROP',
    );
    for (const [index, created, saleDate] of [
      [0, '2026-10-29T20:30:00Z', '2026-10-29'],
      [1, '2026-10-29T21:30:00Z', '2026-10-29'],
      [2, '2026-10-30T22:00:00Z', '2026-10-31'],
      [3, '2026-08-01T21:00:00Z', '2026-08-02'],
      [4, '2026-08-01T20:59:59Z', '2026-08-01'],
    ] as const) {
      await client.query(
        `INSERT INTO sales (sale_number,sale_type,entry_mode,sale_date,created_at,warehouse_id,user_id,total_amount,status)
        VALUES ($1,'retail','pos',$2,$3,9001,1,130,'completed')`,
        [`DST-${index}`, saleDate, created],
      );
    }
    fixtures.query.mockImplementation((sql: string, params?: unknown[]) =>
      client.query(sql, params),
    );
    const reports: Awaited<ReturnType<typeof getStaffingForecast>>[] = [];
    for (const timezone of ['UTC', 'America/Los_Angeles', 'Africa/Cairo']) {
      await client.query("SELECT set_config('TimeZone',$1,true)", [timezone]);
      const start = fixtures.query.mock.calls.length;
      reports.push(await getStaffingForecast({ warehouse_id: 9001 }));
      const buckets = (await fixtures.query.mock.results[start].value).rows;
      expect(buckets).toEqual([
        { dow: 0, hour: 0, tx_count: '1', total_revenue: 130 },
        { dow: 4, hour: 23, tx_count: '2', total_revenue: 260 },
      ]);
      expect(reports.at(-1)!.peakHours).toHaveLength(1);
      expect(reports.at(-1)!.weeklyDensity[4][23]).toMatchObject({
        avg_transactions: 0.15,
        avg_revenue: 20,
      });
    }
    expect(reports[1]).toEqual(reports[0]);
    expect(reports[2]).toEqual(reports[0]);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
it('runs actual calendar and Cairo hour SQL independently of PostgreSQL session timezone', async () => {
  const { getClient } = await vi.importActual<{ getClient: () => Promise<PoolClient> }>(
    '../src/database/pool.ts',
  );
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Clone current real column types/defaults; only this connection sees these fixtures.
    for (const table of [
      'warehouses',
      'sales',
      'accounts',
      'journal_entries',
      'journal_entry_lines',
    ]) {
      await client.query(
        `CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS) ON COMMIT DROP`,
      );
    }
    await client.query(
      "INSERT INTO warehouses (id,code,name_ar,is_active) VALUES (9001,'CAL','تقويم',TRUE),(9002,'OTHER','آخر',TRUE)",
    );
    const sales = [
      ['old', '2026-07-07', '2026-07-07T19:00:00Z', 9001, 'completed', 90000],
      ['first', '2026-07-08', '2026-07-08T19:00:00Z', 9001, 'completed', 130],
      ['last', '2026-10-05', '2026-10-05T20:00:00Z', 9001, 'completed', 130],
      ['next', '2026-10-06', '2026-10-05T21:00:00Z', 9001, 'completed', 90000],
      ['foreign', '2026-10-05', '2026-10-05T20:00:00Z', 9002, 'completed', 90000],
      ['cancelled', '2026-10-05', '2026-10-05T20:00:00Z', 9001, 'cancelled', 90000],
    ] as const;
    for (const [number, date, created, warehouse, status, amount] of sales) {
      await client.query(
        `INSERT INTO sales (sale_number,sale_type,entry_mode,sale_date,created_at,warehouse_id,user_id,status,total_amount)
        VALUES ($1,'retail','pos',$2,$3,$4,1,$5,$6)`,
        [number, date, created, warehouse, status, amount],
      );
    }
    await client.query(
      "INSERT INTO accounts (id,code,name_ar,account_type,normal_balance) VALUES (1,'110101','الخزينة','asset','debit')",
    );
    await client.query(
      `INSERT INTO journal_entries (id,entry_number,entry_date,status,reference_type,description)
       VALUES (1,'OPEN','2026-07-07','posted','opening','opening cash'),
              (2,'SALE','2026-10-05','posted','sale','cash sale'),
              (3,'EXP','2026-10-05','posted','expense','cash expense'),
              (4,'TRANSFER','2026-10-05','posted','transfer','internal cash transfer'),
              (5,'DRAFT','2026-10-05','draft','sale','unposted receipt'),
              (6,'VOID','2026-10-05','voided','expense','voided payment')`,
    );
    await client.query(
      `INSERT INTO journal_entry_lines (journal_entry_id,account_id,debit,credit)
       VALUES (1,1,50000,0), (2,1,130,0), (3,1,0,40),
              (4,1,300,0), (4,1,0,300), (5,1,9000,0), (6,1,0,1000)`,
    );
    fixtures.query.mockImplementation((sql: string, params?: unknown[]) =>
      client.query(sql, params),
    );
    const reports: Awaited<ReturnType<typeof getCashFlowProjection>>[] = [];
    const staffing: Awaited<ReturnType<typeof getStaffingForecast>>[] = [];
    for (const timezone of ['UTC', 'America/Los_Angeles', 'Africa/Cairo']) {
      await client.query("SELECT set_config('TimeZone',$1,true)", [timezone]);
      const start = fixtures.query.mock.calls.length;
      reports.push(await getCashFlowProjection({ warehouse_id: 9001 }));
      const cashDensity = (await fixtures.query.mock.results[start + 1].value).rows;
      expect(cashDensity).toEqual([{ dow: 1, total_in: 130, total_out: 40 }]);
      expect(reports.at(-1)!.currentBalance).toBe(50090);
      expect(reports.at(-1)!.dailyPoints[6]).toMatchObject({
        date: '2026-10-12',
        projected_in: 10,
        projected_out: 3.08,
      });
      staffing.push(await getStaffingForecast({ warehouse_id: 9001 }));
      expect(staffing.at(-1)!.weeklyDensity[1][23]).toMatchObject({
        avg_transactions: 0.08,
        avg_revenue: 10,
      });
      expect(staffing.at(-1)!.weeklyDensity[3][22]).toMatchObject({
        avg_transactions: 0.08,
        avg_revenue: 10,
      });
      expect(staffing.at(-1)!.peakHours).toHaveLength(2);
    }
    expect(reports[1]).toEqual(reports[0]);
    expect(reports[2]).toEqual(reports[0]);
    expect(staffing[1]).toEqual(staffing[0]);
    expect(staffing[2]).toEqual(staffing[0]);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
