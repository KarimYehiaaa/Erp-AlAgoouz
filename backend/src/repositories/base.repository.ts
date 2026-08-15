import { query } from '../database/pool.ts';
/**
 * قاعدة مشتركة لعمليات CRUD على الجداول (مع الحذف الناعم والترقيم).
 * تُوسَّع من قبل الـ repositories الخاصة بكل كيان عبر تحديد {@link BaseRepository#tableName}.
 */
class BaseRepository {
  /** @type {string} */
  tableName;
  /**
   * جلب سجل حسب معرّفه الأساسي (مع تجاهل المحذوف ناعمًا).
   * @param {number} id معرّف السجل
   * @param {import('pg').PoolClient} [client] اتصال معاملة اختياري (داخل transaction)
   * @returns {Promise<Record<string, any> | null>} السجل أو null
   */
  async findById(id, client) {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = $1 AND deleted_at IS NULL`;
    const res = client ? await client.query(sql, [id]) : await query(sql, [id]);
    return res.rows[0] || null;
  }
  /**
   * جلب كل السجلات النشطة مع ترقيم اختياري.
   * @param {number} [limit] الحد الأقصى للنتائج
   * @param {number} [offset] نقطة البداية
   * @param {import('pg').PoolClient} [client] اتصال معاملة اختياري
   * @returns {Promise<Array<Record<string, any>>>} السجلات
   */
  async findAll(limit, offset, client) {
    let sql = `SELECT * FROM ${this.tableName} WHERE deleted_at IS NULL ORDER BY created_at DESC`;
    const params: any[] = [];
    if (limit) {
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (offset) {
      params.push(offset);
      sql += ` OFFSET $${params.length}`;
    }
    const res = client ? await client.query(sql, params) : await query(sql, params);
    return res.rows;
  }
  /**
   * إنشاء سجل جديد وإرجاعه.
   * @param {Record<string, any>} data قيم الأعمدة
   * @param {import('pg').PoolClient} [client] اتصال معاملة اختياري
   * @returns {Promise<Record<string, any>>} السجل المنشأ
   */
  async create(data, client) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(', ');
    const columns = keys.join(', ');
    const sql = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) RETURNING *`;
    const res = client ? await client.query(sql, values) : await query(sql, values);
    return res.rows[0];
  }
  /**
   * تحديث سجل موجود (الأعمدة الممررة فقط) وإرجاعه.
   * @param {number} id معرّف السجل
   * @param {Record<string, any>} data القيم الجديدة
   * @param {import('pg').PoolClient} [client] اتصال معاملة اختياري
   * @returns {Promise<Record<string, any> | null>} السجل المحدّث أو null
   */
  async update(id, data, client) {
    const keys = Object.keys(data);
    if (keys.length === 0) return this.findById(id, client);
    const values = Object.values(data);
    const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(', ');
    values.push(id);
    const sql = `UPDATE ${this.tableName} SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} AND deleted_at IS NULL RETURNING *`;
    const res = client ? await client.query(sql, values) : await query(sql, values);
    return res.rows[0] || null;
  }
  /**
   * حذف ناعم لسجل (تعيين deleted_at).
   * @param {number} id معرّف السجل
   * @param {import('pg').PoolClient} [client] اتصال معاملة اختياري
   * @returns {Promise<boolean>} true إذا حُذف السجل
   */
  async softDelete(id, client) {
    const sql = `UPDATE ${this.tableName} SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`;
    const res = client ? await client.query(sql, [id]) : await query(sql, [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
export { BaseRepository };
