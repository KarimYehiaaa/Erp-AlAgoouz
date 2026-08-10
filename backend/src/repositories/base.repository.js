import { query } from "../database/pool.js";
class BaseRepository {
  /**
   * Find a record by its primary ID.
   */
  async findById(id, client) {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = $1 AND deleted_at IS NULL`;
    const res = client ? await client.query(sql, [id]) : await query(sql, [id]);
    return res.rows[0] || null;
  }
  /**
   * Find all active records, with optional pagination.
   */
  async findAll(limit, offset, client) {
    let sql = `SELECT * FROM ${this.tableName} WHERE deleted_at IS NULL ORDER BY created_at DESC`;
    const params = [];
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
   * Insert a new record.
   */
  async create(data, client) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(", ");
    const columns = keys.join(", ");
    const sql = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) RETURNING *`;
    const res = client ? await client.query(sql, values) : await query(sql, values);
    return res.rows[0];
  }
  /**
   * Update an existing record.
   */
  async update(id, data, client) {
    const keys = Object.keys(data);
    if (keys.length === 0) return this.findById(id, client);
    const values = Object.values(data);
    const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(", ");
    values.push(id);
    const sql = `UPDATE ${this.tableName} SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} AND deleted_at IS NULL RETURNING *`;
    const res = client ? await client.query(sql, values) : await query(sql, values);
    return res.rows[0] || null;
  }
  /**
   * Soft delete a record.
   */
  async softDelete(id, client) {
    const sql = `UPDATE ${this.tableName} SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`;
    const res = client ? await client.query(sql, [id]) : await query(sql, [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
export {
  BaseRepository
};
