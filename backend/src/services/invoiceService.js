import { getClient } from "../database/pool.js";
import { AppError } from "../types/errors.js";
import { parseLocalizedNumber } from "../utils/numberParsing.js";
import { roundMoney } from "../utils/money.js";
import { recalculateCustomerBalance } from "./customerBalanceService.js";
import { getDefaultWarehouseId } from "./warehouseService.js";
import { ensureInventoryRow } from "./inventoryService.js";
const generateInvoiceNumber = async (client) => {
  const settings = await client.query(`SELECT value FROM settings WHERE key = 'invoice'`);
  const config = settings.rows[0]?.value || { prefix: "INV" };
  const res = await client.query(`SELECT nextval('seq_invoices_number') AS next_val`);
  return `${config.prefix || "INV"}-${String(res.rows[0].next_val).padStart(5, "0")}`;
};
const parseInvoiceData = (data = {}) => {
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) throw new AppError("\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0646\u0648\u062F \u0641\u064A \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629");
  let subtotal = 0;
  const parsedItems = items.map((item, idx) => {
    if (!item.product_id) {
      throw new AppError(`\u0627\u0644\u0628\u0646\u062F \u0631\u0642\u0645 ${idx + 1}: \u064A\u062C\u0628 \u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0646\u062A\u062C \u0645\u0633\u062C\u0644 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629`);
    }
    const productId = Number(item.product_id);
    const qty = parseLocalizedNumber(item.quantity);
    const price = parseLocalizedNumber(item.unit_price);
    const disc = parseLocalizedNumber(item.discount_amount ?? 0, 0);
    if (!Number.isFinite(qty) || qty <= 0) throw new AppError(`\u0627\u0644\u0628\u0646\u062F \u0631\u0642\u0645 ${idx + 1}: \u0627\u0644\u0643\u0645\u064A\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631`);
    if (!Number.isFinite(price) || price < 0) throw new AppError(`\u0627\u0644\u0628\u0646\u062F \u0631\u0642\u0645 ${idx + 1}: \u0627\u0644\u0633\u0639\u0631 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0628\u0627\u0644\u0633\u0627\u0644\u0628`);
    if (!Number.isFinite(disc) || disc < 0) throw new AppError(`\u0627\u0644\u0628\u0646\u062F \u0631\u0642\u0645 ${idx + 1}: \u0627\u0644\u062E\u0635\u0645 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0628\u0627\u0644\u0633\u0627\u0644\u0628`);
    if (disc > roundMoney(qty * price)) throw new AppError(`\u0627\u0644\u0628\u0646\u062F \u0631\u0642\u0645 ${idx + 1}: \u0627\u0644\u062E\u0635\u0645 \u064A\u062A\u062C\u0627\u0648\u0632 \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0628\u0646\u062F`);
    const lineTotal = qty * price - disc;
    subtotal += lineTotal;
    return {
      product_id: productId,
      description: item.description || item.product_name || "\u0648\u0635\u0641 \u0627\u0644\u0628\u0646\u062F",
      quantity: qty,
      unit_price: price,
      discount_amount: disc,
      total_amount: roundMoney(lineTotal),
      sort_order: idx
    };
  });
  const deductInvoiceInventory2 = async (client, invoiceId, items2, userId, invoiceNumber) => {
    const defaultWhId = await getDefaultWarehouseId((text, params) => client.query(text, params));
    for (const item of items2) {
      if (!item.product_id) continue;
      const productId = Number(item.product_id);
      const qty = Number(item.quantity || 0);
      if (qty <= 0) continue;
      const stockRes = await client.query(
        `SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory WHERE product_id = $1`,
        [productId]
      );
      const globalTotal = Number(stockRes.rows[0]?.total || 0);
      const productRes = await client.query(`SELECT name_ar, primary_warehouse_id FROM products WHERE id = $1`, [productId]);
      const pName = productRes.rows[0]?.name_ar || "\u0627\u0644\u0645\u0646\u062A\u062C";
      if (globalTotal < qty - 1e-4) {
        throw new AppError(`\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u062E\u0632\u0648\u0646 \u0643\u0627\u0641\u064D \u0644\u0644\u0645\u0646\u062A\u062C (${pName}). \u0627\u0644\u0645\u0637\u0644\u0648\u0628 ${qty} \u0648\u0627\u0644\u0645\u062A\u0627\u062D \u0643\u0644\u064A\u0627\u064B \u0628\u0627\u0644\u0645\u0646\u0634\u0623\u0629 ${globalTotal}`);
      }
      const targetWhId = productRes.rows[0]?.primary_warehouse_id || defaultWhId;
      let remainingNeeded = qty;
      if (targetWhId) {
        await ensureInventoryRow(client, productId, targetWhId);
        const lock = await client.query(
          `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`,
          [productId, targetWhId]
        );
        const avail = Number(lock.rows[0]?.quantity || 0);
        if (avail > 0) {
          const deductQty = Math.min(avail, remainingNeeded);
          await client.query(
            `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`,
            [deductQty, productId, targetWhId]
          );
          await client.query(
            `INSERT INTO stock_movements (product_id, from_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
           VALUES ($1, $2, 'sale', $3, 'invoice', $4, $5, $6)`,
            [productId, targetWhId, deductQty, invoiceId, userId, `\u0635\u0631\u0641 \u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0628\u064A\u0639\u0627\u062A ${invoiceNumber}`]
          );
          remainingNeeded -= deductQty;
        }
      }
      if (remainingNeeded > 1e-4) {
        const otherWhs = await client.query(
          `SELECT warehouse_id, quantity FROM inventory WHERE product_id = $1 AND warehouse_id != $2 AND quantity > 0 ORDER BY quantity DESC FOR UPDATE`,
          [productId, targetWhId || 0]
        );
        for (const row of otherWhs.rows) {
          if (remainingNeeded <= 1e-4) break;
          const avail = Number(row.quantity || 0);
          const deductQty = Math.min(avail, remainingNeeded);
          await client.query(
            `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`,
            [deductQty, productId, row.warehouse_id]
          );
          await client.query(
            `INSERT INTO stock_movements (product_id, from_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
           VALUES ($1, $2, 'sale', $3, 'invoice', $4, $5, $6)`,
            [productId, row.warehouse_id, deductQty, invoiceId, userId, `\u0635\u0631\u0641 \u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0628\u064A\u0639\u0627\u062A ${invoiceNumber}`]
          );
          remainingNeeded -= deductQty;
        }
      }
    }
  };
  const restoreInvoiceInventory2 = async (client, invoiceId, userId, invoiceNumber) => {
    const movements = (await client.query(
      `SELECT * FROM stock_movements WHERE reference_type = 'invoice' AND reference_id = $1 AND movement_type = 'sale'`,
      [invoiceId]
    )).rows;
    for (const m of movements) {
      await client.query(
        `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`,
        [m.quantity, m.product_id, m.from_warehouse_id]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, to_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
       VALUES ($1, $2, 'return', $3, 'invoice', $4, $5, $6)`,
        [m.product_id, m.from_warehouse_id, m.quantity, invoiceId, userId, `\u0625\u0639\u0627\u062F\u0629 \u0645\u062E\u0632\u0648\u0646 \u0625\u062B\u0631 \u0625\u0644\u063A\u0627\u0621/\u062A\u0639\u062F\u064A\u0644 \u0641\u0627\u062A\u0648\u0631\u0629 ${invoiceNumber}`]
      );
    }
  };
  const discountPercent = parseLocalizedNumber(data.discount_percent ?? 0, 0);
  const percentDiscount = subtotal * discountPercent / 100;
  const fixedDiscount = parseLocalizedNumber(data.discount_amount ?? 0, 0);
  const discountAmount = roundMoney(percentDiscount + fixedDiscount);
  if (discountAmount < 0) throw new AppError("\u0627\u0644\u062E\u0635\u0645 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0623\u0642\u0644 \u0645\u0646 \u0635\u0641\u0631");
  if (discountAmount > subtotal) throw new AppError("\u0627\u0644\u062E\u0635\u0645 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u064A\u062A\u062C\u0627\u0648\u0632 \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0628\u0646\u0648\u062F");
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxPercent = parseLocalizedNumber(data.tax_percent ?? 0, 0);
  const taxAmount = data.tax_enabled ? roundMoney(afterDiscount * taxPercent / 100) : 0;
  const totalAmount = roundMoney(afterDiscount + taxAmount);
  return {
    items: parsedItems,
    subtotal: roundMoney(subtotal),
    discountAmount,
    taxAmount,
    totalAmount,
    paymentStatus: data.payment_status || "paid"
  };
};
const getInvoices = async (filters = {}) => {
  return await invoicesRepository.getInvoicesList(filters);
};
const getInvoiceById = async (id) => {
  return await invoicesRepository.getInvoiceDetails(id);
};
const createInvoice = async (data, userId) => {
  const { items: parsedItems, subtotal, discountAmount, taxAmount, totalAmount, paymentStatus } = parseInvoiceData(data);
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const invoiceNumber = await generateInvoiceNumber(client);
    const invResult = await client.query(
      `INSERT INTO invoices (
        invoice_number, sale_id, customer_id, invoice_type, subtotal, discount_amount,
        tax_amount, total_amount, payment_status, issued_at, due_date, notes, user_id, qr_data
      ) VALUES ($1,$2,$3,'manual',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        invoiceNumber,
        null,
        data.customer_id || null,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        paymentStatus,
        data.issued_at || /* @__PURE__ */ new Date(),
        data.due_date || null,
        data.notes || null,
        userId,
        `INV:${invoiceNumber}`
      ]
    );
    const invoice = invResult.rows[0];
    for (const item of parsedItems) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, discount_amount, total_amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [invoice.id, item.product_id, item.description, item.quantity, item.unit_price, item.discount_amount, item.total_amount, item.sort_order]
      );
    }
    await deductInvoiceInventory(client, invoice.id, parsedItems, userId, invoiceNumber);
    const stamp = Date.now();
    if (paymentStatus === "paid") {
      const payNum = `PAY-INV${invoice.id}-${stamp}`;
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
         VALUES ($1, 'invoice', $2, $3, $4, $5, $6)`,
        [payNum, invoice.id, totalAmount, data.payment_method || "cash", data.notes || null, userId]
      );
    } else if (paymentStatus === "partial" && Number(data.paid_amount) > 0) {
      const paidAmt = Math.min(totalAmount, Number(data.paid_amount));
      const payNum = `PAY-INV${invoice.id}-${stamp}`;
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
         VALUES ($1, 'invoice', $2, $3, $4, $5, $6)`,
        [payNum, invoice.id, paidAmt, data.payment_method || "cash", data.notes || null, userId]
      );
    }
    if (data.customer_id) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), data.customer_id);
    }
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'invoices',$2,$3)`,
      [userId, `\u0625\u0646\u0634\u0627\u0621 \u0641\u0627\u062A\u0648\u0631\u0629 ${invoiceNumber}`, JSON.stringify({ invoice_id: invoice.id, total: totalAmount })]
    );
    await client.query("COMMIT");
    return getInvoiceById(invoice.id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};
const updateInvoice = async (id, data, userId) => {
  const { items: parsedItems, subtotal, discountAmount, taxAmount, totalAmount, paymentStatus } = parseInvoiceData(data);
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const invRes = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    const invoice = invRes.rows[0];
    if (!invoice) throw new AppError("\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629", 404);
    if (invoice.sale_id) throw new AppError("\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0639\u062F\u064A\u0644 \u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0631\u062A\u0628\u0637\u0629 \u0628\u0639\u0645\u0644\u064A\u0629 \u0628\u064A\u0639", 400);
    await client.query(
      `UPDATE invoices SET
        customer_id = $1,
        subtotal = $2,
        discount_amount = $3,
        tax_amount = $4,
        total_amount = $5,
        payment_status = $6,
        issued_at = $7,
        due_date = $8,
        notes = $9,
        user_id = $10
       WHERE id = $11`,
      [
        data.customer_id || null,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        paymentStatus,
        data.issued_at || invoice.issued_at || /* @__PURE__ */ new Date(),
        data.due_date || null,
        data.notes || null,
        userId,
        id
      ]
    );
    await restoreInvoiceInventory(client, id, userId, invoice.invoice_number);
    await client.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [id]);
    for (const item of parsedItems) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, discount_amount, total_amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, item.product_id, item.description, item.quantity, item.unit_price, item.discount_amount, item.total_amount, item.sort_order]
      );
    }
    await deductInvoiceInventory(client, id, parsedItems, userId, invoice.invoice_number);
    const existingPaid = (await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE reference_type = 'invoice' AND reference_id = $1`,
      [id]
    )).rows[0].total;
    if (paymentStatus === "paid" && Number(existingPaid) < totalAmount - 0.01) {
      const remainingToPay = totalAmount - Number(existingPaid);
      const payNum = `PAY-INV${id}-${Date.now()}`;
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
         VALUES ($1, 'invoice', $2, $3, $4, $5, $6)`,
        [payNum, id, remainingToPay, data.payment_method || "cash", data.notes || null, userId]
      );
    }
    const oldCustomerId = invoice.customer_id;
    const newCustomerId = data.customer_id || null;
    if (oldCustomerId) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), oldCustomerId);
    }
    if (newCustomerId && newCustomerId !== oldCustomerId) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), newCustomerId);
    }
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'invoices',$2,$3)`,
      [userId, `\u062A\u0639\u062F\u064A\u0644 \u0641\u0627\u062A\u0648\u0631\u0629 ${invoice.invoice_number}`, JSON.stringify({ invoice_id: id, total: totalAmount })]
    );
    await client.query("COMMIT");
    return getInvoiceById(id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};
const deleteInvoice = async (id, userId = null) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const invRes = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    const invoice = invRes.rows[0];
    if (!invoice) throw new AppError("\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629", 404);
    if (invoice.sale_id) {
      throw new AppError("\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u0630\u0641 \u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0631\u062A\u0628\u0637\u0629 \u0628\u0639\u0645\u0644\u064A\u0629 \u0628\u064A\u0639", 400);
    }
    await restoreInvoiceInventory(client, id, userId, invoice.invoice_number);
    await client.query(`UPDATE invoices SET deleted_at = NOW() WHERE id = $1`, [id]);
    if (invoice.customer_id) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), invoice.customer_id);
    }
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'invoices',$2,$3)`,
      [userId, `\u062D\u0630\u0641 \u0641\u0627\u062A\u0648\u0631\u0629 ${invoice.invoice_number}`, JSON.stringify({ invoice_id: id })]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};
export {
  createInvoice,
  deleteInvoice,
  getInvoiceById,
  getInvoices,
  parseInvoiceData,
  updateInvoice
};
