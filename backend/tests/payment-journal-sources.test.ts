import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { query, getClient } from '../src/database/pool.ts';
import { createDailySale, updateSale, returnSale } from '../src/services/salesService.ts';
import { recordPayment, recordSalePayment } from '../src/services/customerService.ts';
import { linkPaymentJournalSources } from '../src/services/paymentJournalSources.ts';
import { bankReconciliationService as bank } from '../src/services/bankReconciliationService.ts';
import { getTreasuryMovementTotals } from '../src/services/treasuryMovementService.ts';
import { businessToday } from '../src/utils/localDate.ts';

let userId: number;
let customerId: number;
let warehouseId: number;
const saleIds: number[] = [];
const recIds: number[] = [];
beforeEach(async () => {
  const marker = randomUUID().replaceAll('-', '').slice(0, 20);
  userId = (
    await query(
      `INSERT INTO users(username,password_hash,full_name,role_id,is_active)
    SELECT $1,'fixture-hash','receipt source fixture',id,true FROM roles WHERE name='admin' RETURNING id`,
      [marker],
    )
  ).rows[0].id;
  customerId = (
    await query(
      "INSERT INTO customers(code,name_ar) VALUES($1,'receipt source fixture') RETURNING id",
      [marker],
    )
  ).rows[0].id;
  warehouseId = (
    await query(
      "INSERT INTO warehouses(code,name_ar) VALUES($1,'receipt source fixture') RETURNING id",
      [marker],
    )
  ).rows[0].id;
});
afterEach(async () => {
  await query('DELETE FROM bank_reconciliations WHERE id=ANY($1::int[])', [recIds]);
  recIds.length = 0;
  await query('DELETE FROM payments WHERE user_id=$1', [userId]);
  await query(
    'DELETE FROM journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE created_by=$1)',
    [userId],
  );
  await query('DELETE FROM journal_entries WHERE created_by=$1', [userId]);
  await query(
    'DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE sale_id=ANY($1::int[]))',
    [saleIds],
  );
  await query('DELETE FROM invoices WHERE sale_id=ANY($1::int[])', [saleIds]);
  await query('DELETE FROM sale_items WHERE sale_id=ANY($1::int[])', [saleIds]);
  await query('DELETE FROM sales WHERE id=ANY($1::int[])', [saleIds]);
  await query('DELETE FROM activity_logs WHERE user_id=$1', [userId]);
  await query('DELETE FROM audit_logs WHERE user_id=$1', [userId]);
  await query('DELETE FROM customers WHERE id=$1', [customerId]);
  await query('DELETE FROM warehouses WHERE id=$1', [warehouseId]);
  await query('DELETE FROM users WHERE id=$1', [userId]);
  saleIds.length = 0;
});
async function sale(total: number, paid = 0, method = 'bank') {
  const created = await createDailySale(
    {
      sale_type: 'wholesale',
      customer_id: customerId,
      warehouse_id: warehouseId,
      sale_date: '1893-04-10',
      total_amount: total,
      payment_method: method,
      payment_status: paid === total ? 'paid' : paid ? 'partial' : 'unpaid',
      paid_amount: paid,
    },
    userId,
  );
  saleIds.push(created.id);
  return created.id;
}
async function bankMovement() {
  return Number(
    (
      await query(
        `SELECT COALESCE(SUM(l.debit-l.credit),0) AS amount
    FROM journal_entry_lines l JOIN journal_entries je ON je.id=l.journal_entry_id
    JOIN accounts a ON a.id=l.account_id WHERE je.created_by=$1 AND je.status='posted' AND a.code='110103'`,
        [userId],
      )
    ).rows[0].amount,
  );
}
it('counts a backdated FIFO/advance receipt only on its posted business date', async () => {
  const today = businessToday();
  const currentBefore = await getTreasuryMovementTotals(today, today, query);
  const historicalBefore = await getTreasuryMovementTotals('1893-04-11', '1893-04-11', query);
  await sale(50);
  await sale(75);
  await recordPayment(customerId, {
    amount: 150,
    payment_method: 'bank',
    user_id: userId,
    payment_date: '1893-04-11',
  });
  expect(await getTreasuryMovementTotals(today, today, query)).toEqual(currentBefore);
  const historical = await getTreasuryMovementTotals('1893-04-11', '1893-04-11', query);
  expect(historical.net - historicalBefore.net).toBe(150);
  expect(historical.cashIn - historicalBefore.cashIn).toBe(150);
  expect(historical.cashInElectronic - historicalBefore.cashInElectronic).toBe(150);
});
it('counts a standalone installment once while preserving initial-sale receipt coverage', async () => {
  const today = businessToday();
  const before = await getTreasuryMovementTotals(today, today, query);
  const id = await sale(50, 20);
  await recordSalePayment(id, {
    amount: 30,
    payment_method: 'bank',
    user_id: userId,
    payment_date: today,
  });
  const result = await getTreasuryMovementTotals(today, today, query);
  expect(result.net - before.net).toBe(30);
  expect(result.cashIn - before.cashIn).toBe(30);
  expect(result.cashInElectronic - before.cashInElectronic).toBe(30);
});
it('recognizes a legacy installment by its receipt key after source metadata is lost', async () => {
  const today = businessToday();
  const before = await getTreasuryMovementTotals(today, today, query);
  const id = await sale(50, 20);
  await recordSalePayment(id, {
    amount: 30,
    payment_method: 'bank',
    user_id: userId,
    payment_date: today,
  });
  await query('UPDATE payments SET journal_entry_id=NULL WHERE user_id=$1', [userId]);
  const result = await getTreasuryMovementTotals(today, today, query);
  expect(result.net - before.net).toBe(30);
  expect(result.cashInElectronic - before.cashInElectronic).toBe(30);
});
it.each([false, true])(
  'includes an unposted legacy installment without consuming initial coverage twice (initial legacy=%s)',
  async (legacy) => {
    const today = businessToday();
    const before = await getTreasuryMovementTotals(today, today, query);
    const id = await sale(50, 20);
    if (legacy) await query('UPDATE payments SET journal_entry_id=NULL WHERE user_id=$1', [userId]);
    await recordSalePayment(id, {
      amount: 30,
      payment_method: 'bank',
      user_id: userId,
      payment_date: today,
    });
    await query(
      `DELETE FROM journal_entry_lines WHERE journal_entry_id IN (
      SELECT id FROM journal_entries WHERE created_by=$1 AND reference_type='payment')`,
      [userId],
    );
    await query("DELETE FROM journal_entries WHERE created_by=$1 AND reference_type='payment'", [
      userId,
    ]);
    const result = await getTreasuryMovementTotals(today, today, query);
    expect(result.net - before.net).toBe(30);
    expect(result.cashInElectronic - before.cashInElectronic).toBe(30);
  },
);
it.each([false, true])(
  'preserves reconciled initial receipts during edits (legacy=%s)',
  async (legacy) => {
    const id = await sale(50, 50);
    const payment = (
      await query(
        "SELECT id,journal_entry_id FROM payments WHERE reference_type='sale' AND reference_id=$1",
        [id],
      )
    ).rows[0];
    const accountId = (await query("SELECT id FROM accounts WHERE code='110103'")).rows[0].id;
    const rec = await bank.createReconciliation(userId, {
      account_id: accountId,
      statement_date: '1893-04-30',
      statement_balance: 50,
      status: 'draft',
    });
    recIds.push(rec.id);
    const tx = (
      await query(
        `INSERT INTO bank_statement_transactions(reconciliation_id,transaction_date,credit,amount)
    VALUES($1,'1893-04-10',50,50) RETURNING id`,
        [rec.id],
      )
    ).rows[0].id;
    await bank.matchTransaction(tx, { payment_id: payment.id });
    if (legacy)
      await query(
        'UPDATE bank_statement_transactions SET matched_journal_entry_id=NULL WHERE id=$1',
        [tx],
      );
    await expect(
      updateSale(
        id,
        {
          sale_type: 'wholesale',
          customer_id: customerId,
          total_amount: 50,
          payments: [],
          payment_status: 'unpaid',
        },
        userId,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(
      (await query('SELECT amount,journal_entry_id FROM payments WHERE id=$1', [payment.id]))
        .rows[0],
    ).toEqual({ amount: 50, journal_entry_id: payment.journal_entry_id });
    expect(await bankMovement()).toBe(50);
    expect((await bank.getStatementTransactions(rec.id))[0].matched_payment_id).toBe(payment.id);
  },
);
it('links every FIFO allocation and advance to one receipt journal', async () => {
  await sale(50);
  await sale(75);
  await recordPayment(customerId, {
    amount: 150,
    payment_method: 'bank',
    user_id: userId,
    payment_date: '1893-04-11',
  });
  const rows = (
    await query('SELECT amount,journal_entry_id FROM payments WHERE user_id=$1 ORDER BY id', [
      userId,
    ])
  ).rows;
  expect(rows.map((row) => Number(row.amount))).toEqual([50, 75, 25]);
  expect(new Set(rows.map((row) => row.journal_entry_id)).size).toBe(1);
  expect(rows[0].journal_entry_id).toBeTypeOf('number');
  expect(await bankMovement()).toBe(150);
});
it.each([0, 20])(
  'does not repost separately collected bank receipts when editing a sale with initial payment %s',
  async (paid) => {
    const id = await sale(50, paid);
    await recordSalePayment(id, {
      amount: 50 - paid,
      payment_method: 'bank',
      user_id: userId,
      payment_date: '1893-04-11',
    });
    expect(await bankMovement()).toBe(50);
    await updateSale(
      id,
      { sale_type: 'wholesale', customer_id: customerId, total_amount: 50, notes: 'fixture edit' },
      userId,
    );
    expect(await bankMovement()).toBe(50);
    const receipt = (
      await query(
        "SELECT journal_entry_id FROM payments WHERE reference_type='sale' AND reference_id=$1 AND payment_number LIKE 'PAY-S%'",
        [id],
      )
    ).rows[0];
    expect(receipt.journal_entry_id).toBeTypeOf('number');
  },
);
it('backfills legacy grouped receipts by their receipt key and owner', async () => {
  await sale(50);
  await sale(75);
  await recordPayment(customerId, {
    amount: 150,
    payment_method: 'bank',
    user_id: userId,
    payment_date: '1893-04-11',
  });
  const before = (
    await query('SELECT id,journal_entry_id FROM payments WHERE user_id=$1 ORDER BY id', [userId])
  ).rows;
  await query('UPDATE payments SET journal_entry_id=NULL WHERE user_id=$1', [userId]);
  await query(
    readFileSync(new URL('../migrations/099_payment_journal_sources.sql', import.meta.url), 'utf8'),
  );
  expect(
    (await query('SELECT id,journal_entry_id FROM payments WHERE user_id=$1 ORDER BY id', [userId]))
      .rows,
  ).toEqual(before);
});
it('backfills a standalone sale receipt by its event key rather than its sale ID', async () => {
  const id = await sale(50);
  await recordSalePayment(id, {
    amount: 50,
    payment_method: 'bank',
    user_id: userId,
    payment_date: '1893-04-11',
  });
  const before = (
    await query('SELECT id,journal_entry_id FROM payments WHERE user_id=$1', [userId])
  ).rows;
  await query('UPDATE payments SET journal_entry_id=NULL WHERE user_id=$1', [userId]);
  await query(
    readFileSync(new URL('../migrations/099_payment_journal_sources.sql', import.meta.url), 'utf8'),
  );
  expect(
    (await query('SELECT id,journal_entry_id FROM payments WHERE user_id=$1', [userId])).rows,
  ).toEqual(before);
});
it('rolls back source assignments when one requested allocation is missing', async () => {
  const id = await sale(50, 50);
  const payment = (
    await query('SELECT payment_number FROM payments WHERE reference_id=$1 AND user_id=$2', [
      id,
      userId,
    ])
  ).rows[0];
  const journal = (
    await query("SELECT id FROM journal_entries WHERE created_by=$1 AND reference_type='sale'", [
      userId,
    ])
  ).rows[0];
  const client = await getClient();
  try {
    await client.query('UPDATE payments SET journal_entry_id=NULL WHERE user_id=$1', [userId]);
    await client.query('BEGIN');
    await expect(
      linkPaymentJournalSources(client, [payment.payment_number, 'missing-fixture'], journal.id),
    ).rejects.toMatchObject({ statusCode: 409 });
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
  expect(
    (await query('SELECT journal_entry_id FROM payments WHERE user_id=$1', [userId])).rows[0]
      .journal_entry_id,
  ).toBeNull();
});
it.each(['reduce', 'change method'])(
  'rejects a sale edit that would %s a separately posted collection',
  async (kind) => {
    const id = await sale(50);
    await recordSalePayment(id, {
      amount: 50,
      payment_method: 'bank',
      user_id: userId,
      payment_date: '1893-04-11',
    });
    const before = (await query('SELECT * FROM payments WHERE user_id=$1 ORDER BY id', [userId]))
      .rows;
    const change =
      kind === 'reduce'
        ? { paid_amount: 40, payment_status: 'partial', payment_method: 'bank' }
        : {
            payments: [{ payment_method: 'cash', amount: 50 }],
            paid_amount: 50,
            payment_status: 'paid',
          };
    await expect(
      updateSale(
        id,
        { sale_type: 'wholesale', customer_id: customerId, total_amount: 50, ...change },
        userId,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(
      (await query('SELECT * FROM payments WHERE user_id=$1 ORDER BY id', [userId])).rows,
    ).toEqual(before);
    expect(await bankMovement()).toBe(50);
  },
);
it('can reduce an initial collection while retaining a later posted receipt', async () => {
  const id = await sale(100, 40);
  await recordSalePayment(id, {
    amount: 60,
    payment_method: 'bank',
    user_id: userId,
    payment_date: '1893-04-11',
  });
  await updateSale(
    id,
    {
      sale_type: 'wholesale',
      customer_id: customerId,
      total_amount: 100,
      paid_amount: 80,
      payment_status: 'partial',
      payment_method: 'bank',
    },
    userId,
  );
  expect(await bankMovement()).toBe(80);
  expect(
    (await query('SELECT amount FROM payments WHERE user_id=$1 ORDER BY id', [userId])).rows.map(
      (row) => Number(row.amount),
    ),
  ).toEqual([20, 60]);
});
it('matches a real FIFO collection and advance from an imported bank statement', async () => {
  await sale(50);
  await sale(75);
  await recordPayment(customerId, {
    amount: 150,
    payment_method: 'bank',
    user_id: userId,
    payment_date: '1893-04-11',
  });
  const account = (await query("SELECT id FROM accounts WHERE code='110103'")).rows[0].id;
  const rec = await bank.createReconciliation(userId, {
    account_id: account,
    statement_date: '1893-04-30',
    statement_balance: await bank.getLedgerBalanceAsOfDate(account, '1893-04-30'),
    status: 'draft',
  });
  recIds.push(rec.id);
  await bank.importBankStatement(
    rec.id,
    Buffer.from(
      'Date,Description,Debit,Credit\n1893-04-11,first,0,50\n1893-04-11,second,0,75\n1893-04-11,advance,0,25',
    ),
    'receipt.csv',
  );
  expect((await bank.autoMatchTransactions(rec.id)).matched_count).toBe(3);
  const source = (
    await query('SELECT DISTINCT journal_entry_id FROM payments WHERE user_id=$1', [userId])
  ).rows[0].journal_entry_id;
  expect(
    (await bank.getStatementTransactions(rec.id)).map((tx) => tx.matched_journal_entry_id),
  ).toEqual([source, source, source]);
  expect((await bank.finalizeReconciliation(rec.id, userId)).status).toBe('completed');
});
it.each([
  ['bank_transfer', '110104'],
  ['vodafone_cash', '110104'],
  ['drawer', '110102'],
])(
  'posts initial %s receipts to account %s and preserves their journal link',
  async (method, code) => {
    await sale(50, 50, method);
    const payment = (
      await query('SELECT journal_entry_id FROM payments WHERE user_id=$1', [userId])
    ).rows[0];
    expect(payment.journal_entry_id).toBeTypeOf('number');
    expect(
      Number(
        (
          await query(
            `SELECT SUM(l.debit-l.credit) AS amount FROM journal_entry_lines l
    JOIN accounts a ON a.id=l.account_id WHERE l.journal_entry_id=$1 AND a.code=$2`,
            [payment.journal_entry_id, code],
          )
        ).rows[0].amount,
      ),
    ).toBe(50);
  },
);
it('backfills initial receipts by document posting while preserving existing source assignments', async () => {
  const id = await sale(50, 20);
  await recordSalePayment(id, {
    amount: 30,
    payment_method: 'bank',
    user_id: userId,
    payment_date: '1893-04-11',
  });
  const before = (
    await query('SELECT id,journal_entry_id FROM payments WHERE user_id=$1 ORDER BY id', [userId])
  ).rows;
  await query(
    "UPDATE payments SET journal_entry_id=NULL WHERE user_id=$1 AND payment_number NOT LIKE 'PAY-S%'",
    [userId],
  );
  await query(
    readFileSync(
      new URL('../migrations/100_initial_receipt_journal_sources.sql', import.meta.url),
      'utf8',
    ),
  );
  expect(
    (await query('SELECT id,journal_entry_id FROM payments WHERE user_id=$1 ORDER BY id', [userId]))
      .rows,
  ).toEqual(before);
});
it.each([
  ['bank_transfer', '110104'],
  ['vodafone_cash', '110104'],
  ['drawer', '110102'],
  ['cash', '110101'],
])('refunds a wholesale %s collection from its original account %s', async (method, code) => {
  const id = await sale(50, 50, method);
  await returnSale(id, userId, 'receipt routing fixture');
  expect(
    Number(
      (
        await query(
          `SELECT SUM(l.debit-l.credit) AS amount FROM journal_entry_lines l
    JOIN journal_entries je ON je.id=l.journal_entry_id JOIN accounts a ON a.id=l.account_id
    WHERE je.created_by=$1 AND je.status='posted' AND a.code=$2`,
          [userId, code],
        )
      ).rows[0].amount,
    ),
  ).toBe(0);
});
