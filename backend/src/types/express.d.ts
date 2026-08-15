/**
 * Express request augmentation for custom properties attached by middleware.
 * Imported implicitly via tsconfig include (src/**). Kept loose on purpose:
 * the codebase is plain JS and strictness is added incrementally.
 */
export {};

declare global {
  namespace Express {
    interface Request {
      /** Attached by authenticate() — row from users joined with roles. */
      user?: {
        id?: number;
        userId?: number;
        uuid?: string;
        username?: string;
        full_name?: string;
        email?: string;
        role_id?: number;
        role_name?: string;
        role_name_ar?: string;
        role?: string;
        jti?: string;
        [key: string]: unknown;
      };
      /** Attached by requestId() middleware. */
      requestId?: string;
      /** Attached by validate()/validateBody() middleware. */
      validated?: any;
    }
  }
}
