import { query, getClient } from '../database/pool.js';
import type { PoolClient } from 'pg';

export interface BaseEntity {
  id: number;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date | null;
}

export abstract class BaseRepository<T extends BaseEntity> {
  protected abstract tableName: string;

  /**
   * Find a record by its primary ID.
   */
  async findById(id: number, client?: PoolClient): Promise<T | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = $1 AND deleted_at IS NULL`;
    const res = client ? await client.query(sql, [id]) : await query(sql, [id]);
    return res.rows[0] as T || null;
  }

  /**
   * Find all active records, with optional pagination.
   */
  async findAll(limit?: number, offset?: number, client?: PoolClient): Promise<T[]> {
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
    return res.rows as T[];
  }

  /**
   * Insert a new record.
   */
  async create(data: Partial<Omit<T, 'id'>>, client?: PoolClient): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(', ');
    const columns = keys.join(', ');

    const sql = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) RETURNING *`;
    const res = client ? await client.query(sql, values) : await query(sql, values);
    return res.rows[0] as T;
  }

  /**
   * Update an existing record.
   */
  async update(id: number, data: Partial<Omit<T, 'id'>>, client?: PoolClient): Promise<T | null> {
    const keys = Object.keys(data);
    if (keys.length === 0) return this.findById(id, client);

    const values = Object.values(data);
    const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(', ');
    
    // Add id as the last parameter
    values.push(id);
    
    const sql = `UPDATE ${this.tableName} SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} AND deleted_at IS NULL RETURNING *`;
    const res = client ? await client.query(sql, values) : await query(sql, values);
    return res.rows[0] as T || null;
  }

  /**
   * Soft delete a record.
   */
  async softDelete(id: number, client?: PoolClient): Promise<boolean> {
    const sql = `UPDATE ${this.tableName} SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`;
    const res = client ? await client.query(sql, [id]) : await query(sql, [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
