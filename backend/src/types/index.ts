import type { Request } from 'express';

/** مستخدم مُصادق عليه من JWT */
export interface AuthUser {
  userId: number;
  role: string;
  jti: string;
}

/** طلب Express مع بيانات المستخدم */
export interface AuthRequest extends Request {
  user?: AuthUser;
}

/** استجابة API موحدة */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: PaginationMeta;
}

/** بيانات الصفحات */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** نتيجة قاعدة البيانات */
export interface DbResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

/** خيارات الترحيل (Pagination) */
export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

// ═══════════════════════════════════════════
// أنواع الكيانات (Entity Types)
// ═══════════════════════════════════════════

export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_id: number;
  role_name?: string;
  is_active: boolean;
  last_login: Date | null;
  password_changed_at: Date | null;
  created_at: Date;
}

export interface Product {
  id: number;
  name: string;
  name_ar?: string;
  sku: string | null;
  barcode: string | null;
  category_id: number | null;
  purchase_price: number;
  selling_price: number;
  unit: string;
  min_stock: number;
  is_active: boolean;
  has_recipe: boolean;
}

export interface Sale {
  id: number;
  sale_number: string;
  customer_id: number | null;
  sale_type: 'pos' | 'wholesale' | 'branch';
  total_amount: number;
  discount_amount: number;
  tax_amount: number;
  net_amount: number;
  payment_method: string;
  status: string;
  notes: string | null;
  created_by: number;
  created_at: Date;
}

export interface InventoryItem {
  product_id: number;
  warehouse_id: number;
  quantity: number;
  reserved_quantity: number;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  balance: number;
  credit_limit: number;
  is_active: boolean;
}

export type { z } from 'zod';
