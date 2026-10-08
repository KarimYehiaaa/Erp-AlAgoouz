export interface SalePaymentAllocation {
  payment_method?: string;
  amount: number | string;
}

export interface SaleSettlementInput {
  total_amount: number;
  payment_method?: string;
  payment_status?: string;
  paid_amount?: number | string;
  payments?: SalePaymentAllocation[] | null;
}

const cents = (value: number | string): number => {
  const amount = Number(value);
  const result = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(result) || amount < 0)
    throw new RangeError('مبلغ الدفع غير صالح');
  return result;
};

/** Credit allocations are receivables; only actual collections become payment records. */
export function resolveSaleSettlement(input: SaleSettlementInput) {
  const total = cents(input.total_amount);
  const method = (input.payment_method || 'cash').trim().toLowerCase();
  const payments: { payment_method: string; amount: number }[] = [];
  let paid = 0;
  if (input.payments?.length) {
    let allocated = 0;
    for (const row of input.payments) {
      const amount = cents(row.amount);
      if (amount === 0) throw new RangeError('مبلغ الدفعة يجب أن يكون قرشًا واحدًا على الأقل');
      allocated += amount;
      if (!Number.isSafeInteger(allocated) || allocated > total)
        throw new RangeError('إجمالي توزيع الدفع لا يمكن أن يتجاوز إجمالي الفاتورة');
      const rowMethod = (row.payment_method || 'cash').trim().toLowerCase();
      if (rowMethod !== 'credit') {
        paid += amount;
        payments.push({ payment_method: rowMethod, amount: amount / 100 });
      }
    }
  } else {
    const rawPaid = cents(input.paid_amount ?? 0);
    if (method === 'credit') {
      if (rawPaid > 0)
        throw new RangeError('حدد طرق التحصيل الفعلية للدفع الجزئي؛ الآجل ليس دفعة نقدية');
    } else {
      if (method === 'split') throw new RangeError('حدد توزيع طرق الدفع المختلط');
      const status = input.payment_status || 'paid';
      if (!['paid', 'partial', 'unpaid'].includes(status))
        throw new RangeError('حالة الدفع المحددة غير صحيحة');
      paid = status === 'paid' ? total : status === 'unpaid' ? 0 : rawPaid;
      if (status === 'partial' && (paid <= 0 || paid >= total))
        throw new RangeError(
          'المبلغ المدفوع جزئيًا يجب أن يكون أكبر من صفر وأقل من إجمالي الفاتورة',
        );
      if (paid > 0) payments.push({ payment_method: method, amount: paid / 100 });
    }
  }
  return {
    paid_amount: paid / 100,
    outstanding_amount: (total - paid) / 100,
    payment_status: (paid === total ? 'paid' : paid > 0 ? 'partial' : 'unpaid') as
      'paid' | 'partial' | 'unpaid',
    payments,
  };
}
