import { test, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { createExpense } from '../src/services/expenseService.ts';
import { roundMoney } from '../src/utils/money.js';
import { AppError } from '../src/types/errors.js';
import pool from '../src/database/pool.js';

afterAll(async () => {
  await pool.end();
});

test('يمنع تسجيل مصروف بقيمة سالبة', async () => {
  try {
    await createExpense({ amount: -500, title: 'Test Expense', category_id: 1 }, 1);
    assert.fail('يجب أن يرمي خطأ عند تمرير مبلغ سالب');
  } catch (err) {
    assert.equal(err instanceof AppError, true);
    assert.match(err.message, /أكبر من الصفر/);
  }
});

test('يمنع تسجيل مصروف بقيمة صفر', async () => {
  try {
    await createExpense({ amount: 0, title: 'Test Expense', category_id: 1 }, 1);
    assert.fail('يجب أن يرمي خطأ عند تمرير مبلغ صفر');
  } catch (err) {
    assert.equal(err instanceof AppError, true);
    assert.match(err.message, /أكبر من الصفر/);
  }
});

test('دقة الأرقام تعمل بشكل صحيح لتجنب مشكلة القروش', () => {
  const quantity = 1.005;
  const unitPrice = 100;
  // 1.005 * 100 = 100.49999999999999 in JS
  // roundMoney fixes this floating point math
  const total = roundMoney(quantity * unitPrice);
  assert.equal(total, 100.5); 
});
