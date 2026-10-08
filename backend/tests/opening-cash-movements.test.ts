import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { query } from '../src/database/pool.ts';
import { calculateDynamicOpeningBalance } from '../src/services/openingBalanceService.ts';
import { getDashboardStats } from '../src/services/dashboardService.ts';
import { getProfitAndLoss } from '../src/services/plService.ts';
import { accountingService } from '../src/services/accountingService.ts';
const key = 'sales_opening_balance:1888-10';
const prefix = `OC-${randomUUID().slice(0, 8)}`;
const journalIds: number[] = [];
let userId: number;
let warehouseId: number;
let saleId: number;
let supplierId: number;
let partnerId: number;
beforeEach(async () => {
  userId = (await query('SELECT id FROM users ORDER BY id LIMIT 1')).rows[0].id;
  warehouseId = (await query("SELECT id FROM warehouses WHERE code='MAIN'")).rows[0].id;
  await query('INSERT INTO settings(key,value) VALUES($1,\'{"amount":1000}\'::jsonb)', [key]);
  saleId = (
    await query(
      `INSERT INTO sales(sale_number,sale_date,warehouse_id,user_id,total_amount,status,payment_status)
    VALUES($1,'1888-10-10',$2,$3,1000,'completed','unpaid') RETURNING id`,
      [`${prefix}-${randomUUID().slice(0, 8)}`, warehouseId, userId],
    )
  ).rows[0].id;
  supplierId = (
    await query('INSERT INTO suppliers(name_ar) VALUES($1) RETURNING id', [`${prefix}-supplier`])
  ).rows[0].id;
  partnerId = (
    await query('INSERT INTO partners(name_ar) VALUES($1) RETURNING id', [`${prefix}-partner`])
  ).rows[0].id;
});
afterEach(async () => {
  await query('DELETE FROM journal_entry_lines WHERE journal_entry_id=ANY($1::int[])', [
    journalIds,
  ]);
  await query('DELETE FROM journal_entries WHERE id=ANY($1::int[])', [journalIds.splice(0)]);
  await query('DELETE FROM payments WHERE payment_number LIKE $1', [`${prefix}%`]);
  await query('DELETE FROM expenses WHERE expense_number LIKE $1', [`${prefix}%`]);
  await query('DELETE FROM purchase_invoices WHERE invoice_number LIKE $1', [`${prefix}%`]);
  await query('DELETE FROM partner_drawings WHERE partner_id=$1', [partnerId]);
  await query('DELETE FROM partners WHERE id=$1', [partnerId]);
  await query('DELETE FROM sales WHERE id=$1', [saleId]);
  await query('DELETE FROM suppliers WHERE id=$1', [supplierId]);
  await query('DELETE FROM settings WHERE key=$1', [key]);
});
const balance = async () => {
  const opening = await calculateDynamicOpeningBalance('1888-11-01');
  expect((await getProfitAndLoss('1888-10-01', '1888-10-31')).cash_flow.closing).toBe(opening);
  expect(
    (await getDashboardStats({ range: 'custom', from_date: '1888-10-01', to_date: '1888-10-31' }))
      .realIncomeMonth,
  ).toBe(opening);
  return opening;
};
const payment = async (type: string, id: number, amount: number, method = 'cash') =>
  (
    await query(
      `INSERT INTO payments(payment_number,reference_type,reference_id,amount,payment_method,created_at)
    VALUES($1,$2,$3,$4,$5,'1888-10-10 12:00:00Z') RETURNING id`,
      [`${prefix}-${randomUUID().slice(0, 8)}`, type, id, amount, method],
    )
  ).rows[0].id;
const journal = async (
  amount: number,
  debitCash: boolean,
  type: Parameters<typeof accountingService.createJournalEntry>[0]['reference_type'] = 'manual',
  refId?: number,
  options: { status?: 'draft' | 'posted'; key?: string } = {},
) => {
  const entry = await accountingService.createJournalEntry({
    entry_date: '1888-10-10',
    reference_type: type,
    reference_id: refId,
    description: prefix,
    status: options.status,
    idempotency_key: options.key,
    created_by: userId,
    lines: [
      { account_code: '110101', debit: debitCash ? amount : 0, credit: debitCash ? 0 : amount },
      { account_code: '110201', debit: debitCash ? 0 : amount, credit: debitCash ? amount : 0 },
    ],
  });
  journalIds.push(entry.id);
  return entry.id;
};
it('does not turn unpaid sales or unpaid purchases into treasury movements', async () => {
  await query(
    `INSERT INTO purchase_invoices(invoice_number,invoice_date,warehouse_id,subtotal,total_amount,payment_status)
    VALUES($1,'1888-10-10',$2,200,200,'unpaid')`,
    [`${prefix}-purchase`, warehouseId],
  );
  expect(await balance()).toBe(1000);
});
it('carries only the collected part of a credit sale', async () => {
  await payment('sale', saleId, 200);
  expect(await balance()).toBe(1200);
});
it('deducts actual supplier payments', async () => {
  await payment('supplier', supplierId, 80);
  expect(await balance()).toBe(920);
});
it('does not deduct a noncash expense adjustment', async () => {
  await query(
    `INSERT INTO expenses(expense_number,title,amount,expense_date,payment_method)
    VALUES($1,$2,100,'1888-10-10','adjustment')`,
    [`${prefix}-adjustment`, prefix],
  );
  expect(await balance()).toBe(1000);
});
it('deducts partner drawings without a ledger entry', async () => {
  await query(
    `INSERT INTO partner_drawings(partner_id,amount,drawing_date) VALUES($1,40,'1888-10-10')`,
    [partnerId],
  );
  expect(await balance()).toBe(960);
});
it('includes posted treasury refunds and manual receipts', async () => {
  await journal(70, true);
  await journal(50, false, 'sale', saleId);
  expect(await balance()).toBe(1020);
});
it('counts a posted payment once while retaining legacy payments', async () => {
  const paymentId = await payment('sale', saleId, 200);
  await journal(200, true, 'payment', paymentId, { key: `payment:${paymentId}` });
  await payment('customer_deposit', saleId, 20);
  expect(await balance()).toBe(1220);
});

it('retains a legacy receipt when an unrelated posting has a colliding owner ID', async () => {
  const paymentId = await payment('sale', saleId, 200);
  await journal(70, true, 'payment', paymentId, { key: `${prefix}:other-receipt` });
  expect(await balance()).toBe(1270);
});

it('retains a later legacy receipt after the initial receipt was posted with the sale', async () => {
  await payment('sale', saleId, 40);
  await journal(40, true, 'sale', saleId, { key: `sale:${saleId}` });
  await payment('sale', saleId, 60);
  expect(await balance()).toBe(1100);
});
it('does not count a paid sale fallback again after its cash was posted', async () => {
  await query("UPDATE sales SET total_amount=100,payment_status='paid' WHERE id=$1", [saleId]);
  await journal(100, true, 'sale', saleId, { key: `sale:${saleId}` });
  expect(await balance()).toBe(1100);
});
it('does not count an expense again after its cash was posted', async () => {
  const expenseId = (
    await query(
      `INSERT INTO expenses(expense_number,title,amount,expense_date,payment_method)
    VALUES($1,$2,50,'1888-10-10','cash') RETURNING id`,
      [`${prefix}-expense`, prefix],
    )
  ).rows[0].id;
  await journal(50, false, 'expense', expenseId);
  expect(await balance()).toBe(950);
});
it('does not count drawings again after their cash was posted', async () => {
  const drawingId = (
    await query(
      "INSERT INTO partner_drawings(partner_id,amount,drawing_date) VALUES($1,40,'1888-10-10') RETURNING id",
      [partnerId],
    )
  ).rows[0].id;
  await journal(40, false, 'manual', drawingId, { key: `drawing:${drawingId}` });
  expect(await balance()).toBe(960);
});
it('excludes draft cash journal entries', async () => {
  await journal(70, true, 'manual', undefined, { status: 'draft' });
  expect(await balance()).toBe(1000);
});
it('reports electronic receipts separately from cash receipts', async () => {
  await payment('sale', saleId, 70, 'card');
  expect(await balance()).toBe(1070);
  const report = await getProfitAndLoss('1888-10-01', '1888-10-31');
  expect(report.cash_flow).toMatchObject({ cash_in: 70, cash_in_cash: 0, cash_in_electronic: 70 });
});
it('does not treat transfers between treasury accounts as external inflows or outflows', async () => {
  const entry = await accountingService.createJournalEntry({
    entry_date: '1888-10-10',
    description: prefix,
    lines: [
      { account_code: '110101', debit: 80, credit: 0 },
      { account_code: '110102', debit: 0, credit: 80 },
    ],
  });
  journalIds.push(entry.id);
  expect(await balance()).toBe(1000);
  expect((await getProfitAndLoss('1888-10-01', '1888-10-31')).cash_flow).toMatchObject({
    cash_in: 0,
    cash_out: 0,
  });
});
