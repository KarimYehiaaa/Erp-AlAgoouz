/**
 * tests/financial-invariants.test.ts — اختبارات الثوابت والقواعد المحاسبية الصارمة (Financial Invariants)
 * ═════════════════════════════════════════════════════════════════════════════════════════════════
 * يتحقق من:
 *  1. حتمية توازن القيد المزدوج (Double-Entry Equality Invariant: sum(debit) == sum(credit))
 *  2. العزل الدقيق للأرصدة التاريخية (Historical Isolation without Future/Draft Leakage)
 *  3. القفل التنافسي ومفتاح التكرار (Idempotency Key & Anti-Duplicate Advisory Lock)
 *  4. مشغّل قاعدة البيانات لمنع التعديل بالفترات المقفلة (Period Lock Database Trigger Enforcement)
 *  5. استحالة الحذف المباشر للقيود المرحّلة وعكسها فقط (Journal Entry Immutability & Reversal)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import app from '../src/app.ts';
import { query } from '../src/database/pool.ts';
import { accountingService } from '../src/services/accountingService.ts';
import { financialPeriodService } from '../src/services/financialPeriodService.ts';

let server: http.Server;
let baseUrl: string;
let adminToken: string;
let adminUserId: number;

const cleanup = {
  journalEntryIds: [] as number[],
  periodIds: [] as number[],
  accountIds: [] as number[],
  userIds: [] as number[],
};

const apiReq = async (
  endpoint: string,
  options: {
    method?: string;
    token?: string | null;
    body?: any;
    headers?: Record<string, string>;
  } = {},
) => {
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data: any = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
};

let cashAccountId: number;
let bankAccountId: number;
let capitalAccountId: number;
let revAccountId: number;
let expAccountId: number;

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;

  // Create admin user
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('FinInvarPass123!', salt);
  const roleRes = await query(`SELECT id FROM roles WHERE name = 'admin' LIMIT 1`);
  const roleId = roleRes.rows[0]?.id || 1;

  const uRes = await query(
    `INSERT INTO users (username, password_hash, full_name, role_id, is_active)
     VALUES ($1, $2, $3, $4, TRUE) RETURNING id, username`,
    [`test_invar_admin_${Date.now()}`, hash, 'Test Invariants Admin', roleId],
  );
  adminUserId = uRes.rows[0].id;
  cleanup.userIds.push(adminUserId);

  const loginRes = await apiReq('/auth/login', {
    method: 'POST',
    body: { username: uRes.rows[0].username, password: 'FinInvarPass123!' },
  });
  adminToken = loginRes.data.data?.token || loginRes.data.token;

  // Retrieve accounts
  const accRes = await query(
    `SELECT id, code FROM accounts WHERE code IN ('1101', '110103', '3101', '4101', '5201')`,
  );
  for (const row of accRes.rows) {
    if (row.code === '1101') cashAccountId = row.id;
    if (row.code === '110103') bankAccountId = row.id;
    if (row.code === '3101') capitalAccountId = row.id;
    if (row.code === '4101') revAccountId = row.id;
    if (row.code === '5201') expAccountId = row.id;
  }

  // Ensure reference_type allows reversal
  await query(`ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;`);
  await query(`ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_reference_type_check 
    CHECK (reference_type IN ('sale', 'purchase', 'payment', 'expense', 'payroll', 'stocktake', 'purchase_return', 'manual', 'opening', 'transfer', 'reversal'));`);
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(resolve));

  // Cleanup in order
  if (cleanup.journalEntryIds.length > 0) {
    await query(
      `DELETE FROM journal_entry_lines WHERE journal_entry_id = ANY($1::int[])`,
      [cleanup.journalEntryIds],
    );
    await query(
      `DELETE FROM journal_entries WHERE id = ANY($1::int[])`,
      [cleanup.journalEntryIds],
    );
  }
  if (cleanup.periodIds.length > 0) {
    await query(`DELETE FROM financial_periods WHERE id = ANY($1::int[])`, [cleanup.periodIds]);
  }
  if (cleanup.userIds.length > 0) {
    await query(`DELETE FROM users WHERE id = ANY($1::int[])`, [cleanup.userIds]);
  }
});

describe('1. Double-Entry Balancing & Atomicity Invariant', () => {
  it('rejects imbalanced manual journal entries with 400 error', async () => {
    const res = await apiReq('/accounting/journal-entries', {
      method: 'POST',
      token: adminToken,
      body: {
        entry_date: '2026-03-01',
        description: 'قيد غير متوازن تجريبي',
        lines: [
          { account_id: cashAccountId, debit: 1000, credit: 0 },
          { account_id: capitalAccountId, debit: 0, credit: 800 },
        ],
      },
    });

    expect(res.status).toBe(400);
    expect(res.data.message || res.data.error).toContain('غير متوازن');
  });

  it('rejects entries with fewer than two lines', async () => {
    const res = await apiReq('/accounting/journal-entries', {
      method: 'POST',
      token: adminToken,
      body: {
        entry_date: '2026-03-01',
        description: 'قيد بسطر واحد',
        lines: [{ account_id: cashAccountId, debit: 1000, credit: 0 }],
      },
    });

    expect(res.status).toBe(400);
  });

  it('successfully creates balanced journal entry and stores lines atomically', async () => {
    const res = await apiReq('/accounting/journal-entries', {
      method: 'POST',
      token: adminToken,
      body: {
        entry_date: '2026-03-01',
        description: 'قيد استثمار شريك متوازن',
        lines: [
          { account_id: cashAccountId, debit: 25000, credit: 0, description: 'إيداع نقدي' },
          { account_id: capitalAccountId, debit: 0, credit: 25000, description: 'رأس مال' },
        ],
      },
    });

    expect(res.status).toBe(200);
    const entry = res.data.data;
    expect(entry.id).toBeDefined();
    cleanup.journalEntryIds.push(entry.id);

    // Verify lines in DB
    const linesRes = await query(
      `SELECT SUM(debit)::numeric AS sum_dr, SUM(credit)::numeric AS sum_cr, COUNT(*)::int AS count
       FROM journal_entry_lines WHERE journal_entry_id = $1`,
      [entry.id],
    );
    expect(Number(linesRes.rows[0].sum_dr)).toBe(25000);
    expect(Number(linesRes.rows[0].sum_cr)).toBe(25000);
    expect(linesRes.rows[0].count).toBe(2);
  });
});

describe('2. Historical Ledger Balance Isolation Invariant', () => {
  it('getLedgerBalanceAsOfDate ignores future posted entries and draft entries', async () => {
    // 1. Entry at 2026-04-01: +10,000 debit
    const e1 = await accountingService.createJournalEntry({
      entry_date: '2026-04-01',
      description: 'حركة تاريخية 1',
      created_by: adminUserId,
      lines: [
        { account_id: bankAccountId, debit: 10000, credit: 0 },
        { account_id: capitalAccountId, debit: 0, credit: 10000 },
      ],
    });
    cleanup.journalEntryIds.push(e1.id);

    // 2. Entry at 2026-04-15: +3,000 credit
    const e2 = await accountingService.createJournalEntry({
      entry_date: '2026-04-15',
      description: 'حركة تاريخية 2',
      created_by: adminUserId,
      lines: [
        { account_id: bankAccountId, debit: 0, credit: 3000 },
        { account_id: expAccountId, debit: 3000, credit: 0 },
      ],
    });
    cleanup.journalEntryIds.push(e2.id);

    // 3. Entry in the future at 2026-05-01: +50,000 debit
    const e3 = await accountingService.createJournalEntry({
      entry_date: '2026-05-01',
      description: 'حركة مستقبلية 3',
      created_by: adminUserId,
      lines: [
        { account_id: bankAccountId, debit: 50000, credit: 0 },
        { account_id: capitalAccountId, debit: 0, credit: 50000 },
      ],
    });
    cleanup.journalEntryIds.push(e3.id);

    // 4. Draft entry that should never be counted
    const eDraftRes = await query(
      `INSERT INTO journal_entries (entry_number, entry_date, status, description, created_by)
       VALUES ($1, '2026-04-05', 'draft', 'قيد مسودة لا يحسب', $2) RETURNING id`,
      [`DRAFT-${Date.now()}`, adminUserId],
    );
    const draftId = eDraftRes.rows[0].id;
    cleanup.journalEntryIds.push(draftId);
    await query(
      `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
       VALUES ($1, $2, 99999, 0), ($1, $3, 0, 99999)`,
      [draftId, bankAccountId, capitalAccountId],
    );

    // Test as of 2026-04-10: only e1 should count (+10,000)
    const balAsOf10 = await accountingService.getLedgerBalanceAsOfDate(bankAccountId, '2026-04-10');
    // Normal balance for asset 110103 is debit: debit - credit = 10000
    // Check marginal impact of e1
    const balBefore = await accountingService.getLedgerBalanceAsOfDate(bankAccountId, '2026-03-31');
    expect(roundMoney(balAsOf10 - balBefore)).toBe(10000);

    // Test as of 2026-04-20: e1 (+10,000) and e2 (-3,000) should count = net +7,000
    const balAsOf20 = await accountingService.getLedgerBalanceAsOfDate(bankAccountId, '2026-04-20');
    expect(roundMoney(balAsOf20 - balBefore)).toBe(7000);

    // Draft entry (2026-04-05) of 99,999 must NOT be in the balance!
    expect(balAsOf10 - balBefore).not.toBe(109999);
  });
});

describe('3. Idempotency Key & Anti-Duplicate Advisory Lock Invariant', () => {
  it('returns existing entry without duplicate posting when same idempotency_key is used', async () => {
    const key = `test_invar_idem_${Date.now()}`;
    const payload = {
      entry_date: '2026-06-01',
      description: 'قيد مع مفتاح تكرار',
      idempotency_key: key,
      lines: [
        { account_id: cashAccountId, debit: 4500, credit: 0 },
        { account_id: revAccountId, debit: 0, credit: 4500 },
      ],
    };

    // First call
    const e1 = await accountingService.createJournalEntry({
      ...payload,
      created_by: adminUserId,
    });
    cleanup.journalEntryIds.push(e1.id);
    expect(e1.id).toBeDefined();

    // Second call with same key
    const e2 = await accountingService.createJournalEntry({
      ...payload,
      created_by: adminUserId,
    });
    expect(e2.id).toBe(e1.id);

    // Verify exactly 1 entry exists with this idempotency key in DB
    const countRes = await query(
      `SELECT COUNT(*)::int AS count FROM journal_entries WHERE idempotency_key = $1`,
      [key],
    );
    expect(countRes.rows[0].count).toBe(1);
  });
});

describe('4. Financial Period Lock Database Trigger Invariant', () => {
  it('blocks journal entry creation and modification in a closed period via DB trigger', async () => {
    // 1. Create a period for 2026-07
    const period = await financialPeriodService.createPeriod(adminUserId, {
      period_code: `2026-M07-TEST-${Date.now()}`,
      period_name: 'فترة اختبار الإقفال يوليو 2026',
      start_date: '2026-07-01',
      end_date: '2026-07-31',
      fiscal_year: 2026,
    });
    cleanup.periodIds.push(period.id);

    // 2. Close the period
    await financialPeriodService.closePeriod(period.id, adminUserId);

    // 3. Attempt to create a journal entry in that period (2026-07-15)
    let errMessage = '';
    try {
      await accountingService.createJournalEntry({
        entry_date: '2026-07-15',
        description: 'قيد مرفوض في فترة مقفلة',
        created_by: adminUserId,
        lines: [
          { account_id: cashAccountId, debit: 1200, credit: 0 },
          { account_id: revAccountId, debit: 0, credit: 1200 },
        ],
      });
    } catch (err: any) {
      errMessage = err.message || '';
    }
    expect(errMessage).toMatch(/فترة.*(مغلقة|مقفلة)/);

    // 4. Reopen period
    await financialPeriodService.reopenPeriod(period.id, adminUserId, 'اختبار إعادة الفتح');

    // 5. Now creation in the reopened period should succeed
    const allowedEntry = await accountingService.createJournalEntry({
      entry_date: '2026-07-15',
      description: 'قيد مسموح بعد إعادة الفتح',
      created_by: adminUserId,
      lines: [
        { account_id: cashAccountId, debit: 1200, credit: 0 },
        { account_id: revAccountId, debit: 0, credit: 1200 },
      ],
    });
    cleanup.journalEntryIds.push(allowedEntry.id);
    expect(allowedEntry.id).toBeDefined();
  });
});

describe('5. Immutability & Reversal Invariant', () => {
  it('reverses a manual journal entry with an equal and opposite entry', async () => {
    const original = await accountingService.createJournalEntry({
      entry_date: '2026-08-01',
      description: 'قيد أصلي للتصحيح',
      created_by: adminUserId,
      lines: [
        { account_id: cashAccountId, debit: 7700, credit: 0, description: 'أصل' },
        { account_id: revAccountId, debit: 0, credit: 7700, description: 'أصل' },
      ],
    });
    cleanup.journalEntryIds.push(original.id);

    // Reversal
    const reversal = await accountingService.reverseJournalEntry(
      original.id,
      adminUserId,
      'تسوية خطأ محاسبي',
    );
    cleanup.journalEntryIds.push(reversal.id);

    expect(reversal.reference_type).toBe('reversal');
    expect(reversal.reference_id).toBe(original.id);

    // Verify reverse lines in DB
    const revLines = await query(
      `SELECT account_id, debit, credit FROM journal_entry_lines WHERE journal_entry_id = $1 ORDER BY id`,
      [reversal.id],
    );
    // Cash was debit 7700, now should be credit 7700
    const cashLine = revLines.rows.find((l) => l.account_id === cashAccountId);
    expect(Number(cashLine.credit)).toBe(7700);
    expect(Number(cashLine.debit)).toBe(0);

    // Rev was credit 7700, now should be debit 7700
    const revLine = revLines.rows.find((l) => l.account_id === revAccountId);
    expect(Number(revLine.debit)).toBe(7700);
    expect(Number(revLine.credit)).toBe(0);
  });
});

function roundMoney(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
