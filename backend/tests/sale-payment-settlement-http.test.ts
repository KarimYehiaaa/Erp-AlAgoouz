import { beforeAll, afterAll, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import app from '../src/app.ts';
import { getClient, query } from '../src/database/pool.ts';
import { accountingService } from '../src/services/accountingService.ts';
import { recalculateCustomerBalance } from '../src/services/customerBalanceService.ts';
import {
  getCustomerStatement,
  getCustomers,
  recordPayment,
} from '../src/services/customerService.ts';
import { businessToday } from '../src/utils/localDate.ts';

let server: http.Server;
let baseUrl: string;
let token: string;
let userId: number;
let warehouseId: number;
let customerId: number;
const extraCustomerIds: number[] = [];
const marker = randomUUID().slice(0, 12);
async function request(path: string, body: unknown, authenticated = true, method = 'POST') {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
beforeAll(async () => {
  const role = await query("SELECT id FROM roles WHERE name='admin' LIMIT 1");
  const hash = await bcrypt.hash('SettlementFixture123!', 10);
  const user = await query(
    `INSERT INTO users (username,password_hash,full_name,role_id,is_active)
    VALUES ($1,$2,'تسوية اختبار',$3,TRUE) RETURNING id`,
    [`SET-${marker}`, hash, role.rows[0].id],
  );
  userId = user.rows[0].id;
  warehouseId = (
    await query(
      "INSERT INTO warehouses (code,name_ar,is_active) VALUES ($1,'مخزن تسوية',TRUE) RETURNING id",
      [`S-${marker}`],
    )
  ).rows[0].id;
  customerId = (
    await query(
      "INSERT INTO customers (code,name_ar,opening_balance,balance,current_balance) VALUES ($1,'عميل تسوية',0,0,0) RETURNING id",
      [`C-${marker}`],
    )
  ).rows[0].id;
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const login = await request(
    '/auth/login',
    { username: `SET-${marker}`, password: 'SettlementFixture123!' },
    false,
  );
  expect(login.status).toBe(200);
  token = login.body.data.token;
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (warehouseId) {
    const sales = (
      await query('SELECT id FROM sales WHERE warehouse_id=$1', [warehouseId])
    ).rows.map((r: { id: number }) => r.id);
    if (sales.length) {
      await query(
        "DELETE FROM journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE reference_type='sale' AND reference_id=ANY($1::text[]))",
        [sales],
      );
      await query(
        "DELETE FROM journal_entries WHERE reference_type='sale' AND reference_id=ANY($1::text[])",
        [sales],
      );
      await query(
        "DELETE FROM payments WHERE (reference_type='sale' AND reference_id=ANY($1::int[])) OR (reference_type='invoice' AND reference_id IN (SELECT id FROM invoices WHERE sale_id=ANY($1::int[])))",
        [sales],
      );
      await query(
        'DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE sale_id=ANY($1::int[]))',
        [sales],
      );
      await query('DELETE FROM invoices WHERE sale_id=ANY($1::int[])', [sales]);
      await query('DELETE FROM sales WHERE id=ANY($1::int[])', [sales]);
    }
    await query('DELETE FROM warehouses WHERE id=$1', [warehouseId]);
  }
  if (customerId) await query('DELETE FROM customers WHERE id=$1', [customerId]);
  if (extraCustomerIds.length)
    await query('DELETE FROM customers WHERE id=ANY($1::int[])', [extraCustomerIds]);
  if (userId) {
    await query(
      'DELETE FROM journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE created_by=$1)',
      [userId],
    );
    await query('DELETE FROM journal_entries WHERE created_by=$1', [userId]);
    await query('DELETE FROM payments WHERE user_id=$1', [userId]);
    await query('DELETE FROM audit_logs WHERE user_id=$1', [userId]);
    await query('DELETE FROM activity_logs WHERE user_id=$1', [userId]);
    await query('DELETE FROM refresh_tokens WHERE user_id=$1', [userId]);
    await query('DELETE FROM users WHERE id=$1', [userId]);
  }
});

it.each([
  {
    name: 'anonymous unpaid sale',
    input: { payment_method: 'credit', payment_status: 'unpaid' },
    paid: 0,
    debt: 100,
    status: 'unpaid',
    customer: false,
  },
  {
    name: 'legacy desktop full credit marked partial zero',
    input: { payment_method: 'credit', payment_status: 'partial', paid_amount: 0 },
    paid: 0,
    debt: 100,
    status: 'unpaid',
    customer: true,
  },
  {
    name: 'mixed cash and credit',
    input: {
      payment_method: 'split',
      payment_status: 'paid',
      payments: [
        { payment_method: 'cash', amount: 40 },
        { payment_method: 'credit', amount: 60 },
      ],
    },
    paid: 40,
    debt: 60,
    status: 'partial',
    customer: true,
  },
  {
    name: 'partial cash array marked paid',
    input: {
      payment_method: 'cash',
      payment_status: 'paid',
      payments: [{ payment_method: 'cash', amount: 40 }],
    },
    paid: 40,
    debt: 60,
    status: 'partial',
    customer: false,
  },
  {
    name: 'fully collected cash',
    input: { payment_method: 'cash', payment_status: 'paid' },
    paid: 100,
    debt: 0,
    status: 'paid',
    customer: true,
  },
])('posts actual collection and receivables for $name', async (testCase) => {
  const syncId = randomUUID();
  const payload = {
    sync_id: syncId,
    sale_type: 'retail',
    sale_date: businessToday(),
    warehouse_id: warehouseId,
    total_amount: 100,
    customer_id: testCase.customer ? customerId : undefined,
    ...testCase.input,
  };
  const response = await request('/sales', payload);
  expect([200, 201]).toContain(response.status);
  const saleId = response.body.data.id;
  const actual = (await query('SELECT payment_status FROM sales WHERE id=$1', [saleId])).rows[0];
  expect(actual.payment_status).toBe(testCase.status);
  const invoices = (await query('SELECT payment_status FROM invoices WHERE sale_id=$1', [saleId]))
    .rows;
  expect(invoices).toEqual([{ payment_status: testCase.status }]);
  const payments = (
    await query(
      "SELECT payment_method,amount FROM payments WHERE reference_type='sale' AND reference_id=$1",
      [saleId],
    )
  ).rows;
  expect(payments.every((p: { payment_method: string }) => p.payment_method !== 'credit')).toBe(
    true,
  );
  expect(payments.reduce((sum: number, p: { amount: number }) => sum + Number(p.amount), 0)).toBe(
    testCase.paid,
  );
  const lines = (
    await query(
      `SELECT a.code,SUM(l.debit)::numeric debit,SUM(l.credit)::numeric credit FROM journal_entry_lines l
    JOIN journal_entries j ON j.id=l.journal_entry_id JOIN accounts a ON a.id=l.account_id
    WHERE j.reference_type='sale' AND j.reference_id=$1 GROUP BY a.code`,
      [saleId],
    )
  ).rows;
  expect(
    lines
      .filter((l: { code: string }) => ['110101', '110102', '110103', '110104'].includes(l.code))
      .reduce((sum: number, l: { debit: number }) => sum + Number(l.debit), 0),
  ).toBe(testCase.paid);
  expect(Number(lines.find((l: { code: string }) => l.code === '110201')?.debit || 0)).toBe(
    testCase.debt,
  );
  expect(lines.reduce((sum: number, l: { debit: number }) => sum + Number(l.debit), 0)).toBe(100);
  expect(lines.reduce((sum: number, l: { credit: number }) => sum + Number(l.credit), 0)).toBe(100);
  const replay = await request('/sales', payload);
  expect([200, 201]).toContain(replay.status);
  expect(replay.body.data.id).toBe(saleId);
  expect(
    (
      await query(
        "SELECT COUNT(*)::int count FROM journal_entries WHERE reference_type='sale' AND reference_id=$1",
        [saleId],
      )
    ).rows[0].count,
  ).toBe(1);
});
it('rejects ambiguous positive payment on a credit-only sale without actual collection methods', async () => {
  const syncId = randomUUID();
  const response = await request('/sales', {
    sync_id: syncId,
    sale_type: 'retail',
    warehouse_id: warehouseId,
    total_amount: 100,
    payment_method: 'credit',
    payment_status: 'partial',
    paid_amount: 10,
    customer_id: customerId,
  });
  expect(response.status).toBe(400);
  expect((await query('SELECT id FROM sales WHERE sync_id=$1', [syncId])).rows).toHaveLength(0);
});

it('returns an already committed offline sale before validating legacy settlement fields', async () => {
  const payload = {
    sync_id: randomUUID(),
    sale_type: 'retail',
    warehouse_id: warehouseId,
    total_amount: 100,
    payment_method: 'cash',
    payment_status: 'paid',
  };
  const original = await request('/sales', payload);
  expect(original.status).toBe(200);
  const replay = await request('/sales', {
    ...payload,
    payment_method: 'credit',
    payment_status: 'partial',
    paid_amount: 10,
  });
  expect(replay.status).toBe(200);
  expect(replay.body.data.id).toBe(original.body.data.id);
  expect(
    (
      await query(
        "SELECT SUM(amount)::numeric total FROM payments WHERE reference_type='sale' AND reference_id=$1",
        [original.body.data.id],
      )
    ).rows[0].total,
  ).toBe(100);
});

it.each([
  { method: 'credit', payments: undefined, paid: 0, debt: 100, account: '110102' },
  {
    method: 'split',
    payments: [
      { payment_method: 'cash', amount: 40 },
      { payment_method: 'credit', amount: 60 },
    ],
    paid: 40,
    debt: 60,
    account: '110102',
  },
  { method: 'card', payments: undefined, paid: 100, debt: 0, account: '110103' },
  {
    method: 'cash',
    payments: [{ payment_method: 'cash', amount: 0.01 }],
    paid: 0.01,
    debt: 99.99,
    account: '110102',
  },
])(
  'preserves the saved collections and receivables when editing a $method sale',
  async (testCase) => {
    const created = await request('/sales', {
      sync_id: randomUUID(),
      sale_type: 'retail',
      warehouse_id: warehouseId,
      total_amount: 100,
      payment_method: testCase.method,
      payments: testCase.payments,
      customer_id: customerId,
    });
    expect(created.status).toBe(200);
    const saleId = created.body.data.id;
    const edited = await request(
      `/sales/${saleId}`,
      {
        sale_type: 'retail',
        warehouse_id: warehouseId,
        customer_id: customerId,
        notes: 'تعديل الملاحظات فقط',
      },
      true,
      'PUT',
    );
    expect(edited.status).toBe(200);
    const expectedStatus =
      testCase.paid === 100 ? 'paid' : testCase.paid > 0 ? 'partial' : 'unpaid';
    expect(
      (await query('SELECT payment_status FROM sales WHERE id=$1', [saleId])).rows[0]
        .payment_status,
    ).toBe(expectedStatus);
    const lines = (
      await query(
        `SELECT a.code,SUM(l.debit)::numeric debit FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id
    JOIN accounts a ON a.id=l.account_id WHERE j.reference_type='sale' AND j.reference_id=$1 GROUP BY a.code`,
        [saleId],
      )
    ).rows;
    expect(
      Number(lines.find((line: { code: string }) => line.code === testCase.account)?.debit || 0),
    ).toBe(testCase.paid);
    expect(Number(lines.find((line: { code: string }) => line.code === '110201')?.debit || 0)).toBe(
      testCase.debt,
    );
    expect(
      lines
        .filter((line: { code: string }) =>
          ['110101', '110102', '110103', '110104'].includes(line.code),
        )
        .reduce((sum: number, line: { debit: number }) => sum + Number(line.debit), 0),
    ).toBe(testCase.paid);
  },
);

it('counts invoice collections, ignores legacy credit rows, and rolls back an over-collected edit', async () => {
  const created = await request('/sales', {
    sync_id: randomUUID(),
    sale_type: 'retail',
    warehouse_id: warehouseId,
    total_amount: 100,
    payment_method: 'credit',
    customer_id: customerId,
  });
  expect(created.status).toBe(200);
  const saleId = created.body.data.id;
  const invoiceId = (await query('SELECT id FROM invoices WHERE sale_id=$1', [saleId])).rows[0].id;
  await query(
    `INSERT INTO payments (payment_number,reference_type,reference_id,amount,payment_method,user_id)
    VALUES ($1,'invoice',$2,40,'card',$3),($4,'sale',$5,60,'credit',$3)`,
    [`INVSET-${marker}`, invoiceId, userId, `OLDCR-${marker}`, saleId],
  );
  const edited = await request(
    `/sales/${saleId}`,
    {
      sale_type: 'retail',
      warehouse_id: warehouseId,
      customer_id: customerId,
      notes: 'تحصيل مرتبط بالفاتورة',
    },
    true,
    'PUT',
  );
  expect(edited.status).toBe(200);
  expect(
    (await query('SELECT payment_status FROM sales WHERE id=$1', [saleId])).rows[0].payment_status,
  ).toBe('partial');
  const lines = (
    await query(
      `SELECT a.code,SUM(l.debit)::numeric debit FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id
    JOIN accounts a ON a.id=l.account_id WHERE j.reference_type='sale' AND j.reference_id=$1 GROUP BY a.code`,
      [saleId],
    )
  ).rows;
  expect(Number(lines.find((line: { code: string }) => line.code === '110103')?.debit)).toBe(40);
  expect(Number(lines.find((line: { code: string }) => line.code === '110201')?.debit)).toBe(60);
  const rejected = await request(
    `/sales/${saleId}`,
    { sale_type: 'retail', warehouse_id: warehouseId, customer_id: customerId, total_amount: 30 },
    true,
    'PUT',
  );
  expect(rejected.status).toBe(409);
  expect(
    (await query('SELECT total_amount FROM sales WHERE id=$1', [saleId])).rows[0].total_amount,
  ).toBe(100);
  expect(
    (
      await query(
        "SELECT amount FROM payments WHERE reference_type='invoice' AND reference_id=$1",
        [invoiceId],
      )
    ).rows[0].amount,
  ).toBe(40);
});

it('posts legacy mixed credit allocations directly to receivables, without a customer', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const sale = (
      await client.query(
        `INSERT INTO sales (sale_number,sale_type,sale_date,total_amount,payment_status,user_id,warehouse_id)
      VALUES ($1,'retail',$2,100,'partial',$3,$4) RETURNING *`,
        [`DIRECT-${marker}`, businessToday(), userId, warehouseId],
      )
    ).rows[0];
    await accountingService.postSaleJournalEntry(client, {
      ...sale,
      payments: [
        { payment_method: 'cash', amount: 40 },
        { payment_method: 'credit', amount: 60 },
      ],
    });
    const lines = (
      await client.query(
        `SELECT a.code,SUM(l.debit)::numeric debit FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id
      JOIN accounts a ON a.id=l.account_id WHERE j.reference_type='sale' AND j.reference_id=$1 GROUP BY a.code`,
        [sale.id],
      )
    ).rows;
    expect(Number(lines.find((line: { code: string }) => line.code === '110102')?.debit)).toBe(40);
    expect(Number(lines.find((line: { code: string }) => line.code === '110201')?.debit)).toBe(60);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

it('refunds a historical anonymous credit sale back out of receivables, not cash', async () => {
  const created = await request('/sales', {
    sync_id: randomUUID(),
    sale_type: 'retail',
    warehouse_id: warehouseId,
    total_amount: 100,
    payment_method: 'credit',
  });
  expect(created.status).toBe(200);
  const saleId = created.body.data.id;
  await query(
    `INSERT INTO payments (payment_number,reference_type,reference_id,amount,payment_method,user_id)
     VALUES ($1,'sale',$2,100,'credit',$3)`,
    [`LEGACY-CREDIT-${marker}-${saleId}`, saleId, userId],
  );
  const returned = await request(`/sales/${saleId}/return`, { notes: 'اختبار عكس الآجل' });
  expect(returned.status).toBe(200);
  const lines = (
    await query(
      `SELECT a.code,SUM(l.debit)::numeric debit,SUM(l.credit)::numeric credit
       FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id
       JOIN accounts a ON a.id=l.account_id
       WHERE j.reference_type='sale' AND j.reference_id=$1
       GROUP BY a.code`,
      [saleId],
    )
  ).rows;
  expect(Number(lines.find((line: { code: string }) => line.code === '110201')?.credit)).toBe(100);
  expect(Number(lines.find((line: { code: string }) => line.code === '110102')?.credit || 0)).toBe(
    0,
  );
});

it('rejects positive credit-only collection when explicitly editing settlement', async () => {
  const created = await request('/sales', {
    sync_id: randomUUID(),
    sale_type: 'retail',
    warehouse_id: warehouseId,
    total_amount: 100,
    payment_method: 'credit',
    customer_id: customerId,
  });
  expect(created.status).toBe(200);
  const saleId = created.body.data.id;
  const edited = await request(
    `/sales/${saleId}`,
    {
      sale_type: 'retail',
      warehouse_id: warehouseId,
      customer_id: customerId,
      payment_method: 'credit',
      payment_status: 'partial',
      paid_amount: 10,
    },
    true,
    'PUT',
  );
  expect(edited.status).toBe(400);
  expect(
    (
      await query("SELECT id FROM payments WHERE reference_type='sale' AND reference_id=$1", [
        saleId,
      ])
    ).rows,
  ).toHaveLength(0);
  expect(
    (await query('SELECT payment_status FROM sales WHERE id=$1', [saleId])).rows[0].payment_status,
  ).toBe('unpaid');
});

it('applies mixed settlement edits by actual receipt method while retaining unchanged receipt IDs', async () => {
  const created = await request('/sales', {
    sync_id: randomUUID(),
    sale_type: 'retail',
    warehouse_id: warehouseId,
    total_amount: 100,
    payments: [{ payment_method: 'cash', amount: 20 }],
    customer_id: customerId,
  });
  expect(created.status).toBe(200);
  const saleId = created.body.data.id;
  const originalReceipt = (
    await query("SELECT id FROM payments WHERE reference_type='sale' AND reference_id=$1", [saleId])
  ).rows[0].id;
  const edited = await request(
    `/sales/${saleId}`,
    {
      sale_type: 'retail',
      warehouse_id: warehouseId,
      customer_id: customerId,
      payment_method: 'split',
      payment_status: 'paid',
      payments: [
        { payment_method: 'cash', amount: 40 },
        { payment_method: 'card', amount: 30 },
        { payment_method: 'credit', amount: 30 },
      ],
    },
    true,
    'PUT',
  );
  expect(edited.status).toBe(200);
  const receipts = (
    await query(
      "SELECT id,payment_method,amount FROM payments WHERE reference_type='sale' AND reference_id=$1",
      [saleId],
    )
  ).rows;
  expect(receipts.some((row: { id: number }) => row.id === originalReceipt)).toBe(true);
  expect(
    receipts
      .filter((row: { payment_method: string }) => row.payment_method === 'cash')
      .reduce((sum: number, row: { amount: number }) => sum + Number(row.amount), 0),
  ).toBe(40);
  expect(
    receipts
      .filter((row: { payment_method: string }) => row.payment_method === 'card')
      .reduce((sum: number, row: { amount: number }) => sum + Number(row.amount), 0),
  ).toBe(30);
  expect(
    receipts.some((row: { payment_method: string }) =>
      ['credit', 'split'].includes(row.payment_method),
    ),
  ).toBe(false);
  expect(
    (await query('SELECT payment_status FROM sales WHERE id=$1', [saleId])).rows[0].payment_status,
  ).toBe('partial');
  const reduction = await request(
    `/sales/${saleId}`,
    {
      sale_type: 'retail',
      warehouse_id: warehouseId,
      customer_id: customerId,
      payments: [
        { payment_method: 'cash', amount: 20 },
        { payment_method: 'credit', amount: 80 },
      ],
    },
    true,
    'PUT',
  );
  expect(reduction.status).toBe(200);
  const remaining = (
    await query(
      "SELECT id,payment_method,amount FROM payments WHERE reference_type='sale' AND reference_id=$1",
      [saleId],
    )
  ).rows;
  expect(remaining).toEqual([{ id: originalReceipt, payment_method: 'cash', amount: 20 }]);
});

it.each(['credit', 'split'])(
  'rejects a %s method as a standalone customer receipt',
  async (method) => {
    const response = await request(`/customers/${customerId}/payment`, {
      amount: 10,
      payment_method: method,
    });
    expect(response.status).toBe(400);
  },
);

it('keeps legacy credit rows out of customer balances, statements, and payment allocation', async () => {
  const legacyCustomerId = (
    await query(
      "INSERT INTO customers (code,name_ar,opening_balance,balance,current_balance) VALUES ($1,'عميل رصيد قديم',0,0,0) RETURNING id",
      [`LC-${marker}`],
    )
  ).rows[0].id;
  extraCustomerIds.push(legacyCustomerId);
  const created = await request('/sales', {
    sync_id: randomUUID(),
    sale_type: 'wholesale',
    warehouse_id: warehouseId,
    total_amount: 100,
    payment_method: 'credit',
    customer_id: legacyCustomerId,
  });
  expect(created.status).toBe(200);
  const saleId = created.body.data.id;
  await query('UPDATE sales SET payment_status=$1 WHERE id=$2', ['paid', saleId]);
  await query(
    "INSERT INTO payments (payment_number,reference_type,reference_id,amount,payment_method,user_id) VALUES ($1,'sale',$2,20,'cash',$3),($4,'sale',$2,80,'credit',$3)",
    [`LEGACY-CASH-${marker}`, saleId, userId, `LEGACY-CREDIT-${marker}`],
  );
  await query(
    "INSERT INTO payments (payment_number,reference_type,reference_id,amount,payment_method,user_id) VALUES ($1,'customer_advance',$2,15,'credit',$3)",
    [`LEGACY-ADVANCE-CREDIT-${marker}`, legacyCustomerId, userId],
  );
  await recalculateCustomerBalance(query, legacyCustomerId);
  let storedBalance = Number(
    (await query('SELECT balance FROM customers WHERE id=$1', [legacyCustomerId])).rows[0].balance,
  );
  expect(storedBalance).toBe(80);
  let statement = await getCustomerStatement(legacyCustomerId);
  expect(statement.summary.total_paid).toBe(20);
  expect(statement.summary.total_balance).toBe(80);
  const customerSummary = (await getCustomers({ limit: 10000 })).find(
    (row) => row.id === legacyCustomerId,
  );
  expect(Number(customerSummary.total_paid)).toBe(20);
  expect(Number(customerSummary.total_balance)).toBe(80);
  const collected = await recordPayment(legacyCustomerId, {
    amount: 10,
    payment_method: 'cash',
    user_id: userId,
  });
  expect(collected.allocations).toEqual([
    expect.objectContaining({ entry_type: 'sale', id: saleId, amount: 10 }),
  ]);
  const actualRows = (
    await query(
      "SELECT amount,payment_method FROM payments WHERE reference_type='sale' AND reference_id=$1 AND LOWER(TRIM(COALESCE(payment_method,'cash'))) <> 'credit'",
      [saleId],
    )
  ).rows;
  expect(
    actualRows.reduce((sum: number, row: { amount: number }) => sum + Number(row.amount), 0),
  ).toBe(30);
  expect(
    actualRows.every((row: { payment_method: string }) => row.payment_method !== 'credit'),
  ).toBe(true);
  await recalculateCustomerBalance(query, legacyCustomerId);
  storedBalance = Number(
    (await query('SELECT balance FROM customers WHERE id=$1', [legacyCustomerId])).rows[0].balance,
  );
  expect(storedBalance).toBe(70);
  statement = await getCustomerStatement(legacyCustomerId);
  expect(statement.summary.total_paid).toBe(30);
  expect(statement.summary.total_balance).toBe(70);

  const openingCustomerId = (
    await query(
      "INSERT INTO customers (code,name_ar,opening_balance,balance,current_balance) VALUES ($1,'عميل رصيد افتتاحي قديم',100,100,100) RETURNING id",
      [`LO-${marker}`],
    )
  ).rows[0].id;
  extraCustomerIds.push(openingCustomerId);
  await query(
    "INSERT INTO payments (payment_number,reference_type,reference_id,amount,payment_method,user_id) VALUES ($1,'customer_opening',$2,80,'credit',$3)",
    [`LEGACY-OPENING-CREDIT-${marker}`, openingCustomerId, userId],
  );
  await recalculateCustomerBalance(query, openingCustomerId);
  const openingStatement = await getCustomerStatement(openingCustomerId);
  expect(openingStatement.summary.total_paid).toBe(0);
  expect(openingStatement.summary.total_balance).toBe(100);
  const openingCollection = await recordPayment(openingCustomerId, {
    amount: 50,
    payment_method: 'cash',
    user_id: userId,
  });
  expect(openingCollection.allocations).toEqual([
    expect.objectContaining({ entry_type: 'opening_balance', id: openingCustomerId, amount: 50 }),
  ]);
  await recalculateCustomerBalance(query, openingCustomerId);
  const settledOpeningStatement = await getCustomerStatement(openingCustomerId);
  expect(settledOpeningStatement.summary.total_paid).toBe(50);
  expect(settledOpeningStatement.summary.total_balance).toBe(50);
});

it.each(['credit', 'split'])('rejects a %s method as a standalone sale receipt', async (method) => {
  const created = await request('/sales', {
    sync_id: randomUUID(),
    sale_type: 'retail',
    warehouse_id: warehouseId,
    total_amount: 100,
    payment_method: 'credit',
    customer_id: customerId,
  });
  expect(created.status).toBe(200);
  const saleId = created.body.data.id;
  const response = await request(`/customers/sales/${saleId}/payment`, {
    amount: 10,
    payment_method: method,
  });
  expect(response.status).toBe(400);
  expect(
    (
      await query("SELECT id FROM payments WHERE reference_type='sale' AND reference_id=$1", [
        saleId,
      ])
    ).rows,
  ).toHaveLength(0);
  expect(
    (await query('SELECT payment_status FROM sales WHERE id=$1', [saleId])).rows[0].payment_status,
  ).toBe('unpaid');
});

it.each(['credit', 'split'])(
  'rejects direct customer journal posting for the %s method',
  async (method) => {
    await expect(
      accountingService.postCustomerPaymentJournalEntry(null, {
        id: customerId,
        amount: 10,
        payment_method: method,
        user_id: userId,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  },
);

it.each(['credit', 'split'])(
  'rejects direct standalone payment journal posting for the %s method',
  async (method) => {
    await expect(
      accountingService.postPaymentJournalEntry(null, {
        id: customerId,
        payment_number: `REJECT-${method}-${marker}`,
        reference_type: 'sale',
        amount: 10,
        payment_method: method,
        user_id: userId,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  },
);

it.each([
  { method: 'CARD', normalized: 'card', account: '110103' },
  { method: 'transfer', normalized: 'transfer', account: '110104' },
])(
  'collects a real $method payment into its account and credits the receivable',
  async (testCase) => {
    const created = await request('/sales', {
      sync_id: randomUUID(),
      sale_type: 'retail',
      warehouse_id: warehouseId,
      total_amount: 100,
      payment_method: 'credit',
      customer_id: customerId,
    });
    expect(created.status).toBe(200);
    const saleId = created.body.data.id;
    const paid = await request(`/customers/sales/${saleId}/payment`, {
      amount: 10,
      payment_method: testCase.method,
    });
    expect(paid.status).toBe(200);
    const receipt = (
      await query(
        "SELECT payment_number,payment_method,amount FROM payments WHERE reference_type='sale' AND reference_id=$1",
        [saleId],
      )
    ).rows[0];
    expect(receipt.payment_method).toBe(testCase.normalized);
    expect(receipt.amount).toBe(10);
    expect(
      (await query('SELECT payment_status FROM sales WHERE id=$1', [saleId])).rows[0]
        .payment_status,
    ).toBe('partial');
    const lines = (
      await query(
        `SELECT a.code,SUM(l.debit)::numeric debit,SUM(l.credit)::numeric credit FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id
    JOIN accounts a ON a.id=l.account_id WHERE j.idempotency_key=$1 GROUP BY a.code`,
        [`customer_payment:${receipt.payment_number}`],
      )
    ).rows;
    expect(
      Number(lines.find((line: { code: string }) => line.code === testCase.account)?.debit),
    ).toBe(10);
    expect(Number(lines.find((line: { code: string }) => line.code === '110201')?.credit)).toBe(10);
    expect(
      lines.reduce((sum: number, line: { debit: number }) => sum + Number(line.debit), 0),
    ).toBe(10);
    expect(
      lines.reduce((sum: number, line: { credit: number }) => sum + Number(line.credit), 0),
    ).toBe(10);
  },
);
