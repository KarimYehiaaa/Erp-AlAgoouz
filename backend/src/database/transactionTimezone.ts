import { BUSINESS_TIMEZONE } from '../utils/localDate.ts';

type QueryClient = { query: (...args: any[]) => any; end?: () => Promise<void> };
const timezoneSql = `SET LOCAL timezone = '${BUSINESS_TIMEZONE}'`;

// Inspect keywords only. Comments, quoted identifiers and string/dollar literals
// can contain words such as BEGIN/CONCURRENTLY and semicolons without being SQL.
const sqlKeywords = (sql: string): string => {
  let keywords = '';
  for (let index = 0; index < sql.length;) {
    if (sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index + 2);
      index = end < 0 ? sql.length : end + 1;
      keywords += ' ';
    } else if (sql.startsWith('/*', index)) {
      let depth = 1;
      index += 2;
      while (index < sql.length && depth > 0) {
        if (sql.startsWith('/*', index)) {
          depth++;
          index += 2;
        } else if (sql.startsWith('*/', index)) {
          depth--;
          index += 2;
        } else index++;
      }
      keywords += ' ';
    } else if (sql[index] === "'" || sql[index] === '"') {
      const quote = sql[index];
      const escapedString = quote === "'" && /(?:^|\W)[eE]$/.test(sql.slice(0, index));
      index++;
      while (index < sql.length) {
        if (escapedString && sql[index] === '\\') index += 2;
        else if (sql[index] === quote && sql[index + 1] === quote) index += 2;
        else if (sql[index++] === quote) break;
      }
      keywords += ' ';
    } else {
      const dollarQuote =
        sql[index] === '$' && /^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/.exec(sql.slice(index));
      if (dollarQuote) {
        const end = sql.indexOf(dollarQuote[0], index + dollarQuote[0].length);
        index = end < 0 ? sql.length : end + dollarQuote[0].length;
        keywords += ' ';
      } else keywords += sql[index++];
    }
  }
  return keywords.trim();
};

// These operations require autocommit and do not use a business calendar date.
// Keep maintenanceService's VACUUM and installation/maintenance DDL semantics.
const requiresAutocommit = (sql: string): boolean =>
  /^(?:VACUUM\b|(?:CREATE|DROP)\s+(?:DATABASE|TABLESPACE)\b|ALTER\s+SYSTEM\b)/i.test(sql) ||
  /^(?:CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b|DROP\s+INDEX\s+CONCURRENTLY\b|REINDEX\b[\s\S]*\bCONCURRENTLY\b)/i.test(
    sql,
  );

/**
 * Supabase transaction pooling lends a backend for one transaction only.
 * Set Cairo inside that transaction, including one-statement business queries.
 * The queue preserves pg's same-client ordering for Promise and callback callers.
 */
export const installTransactionTimezone = (
  client: QueryClient,
  options: {
    transactionPooling?: boolean;
    beforeTransaction?: (query: (...args: any[]) => any) => Promise<void>;
    assertUsable?: () => void;
  } = {},
): void => {
  const transactionPooling = options.transactionPooling ?? true;
  const rawQuery = client.query.bind(client);
  let inTransaction = false;
  let unusable = false;
  let tail: Promise<unknown> = Promise.resolve();

  client.query = (input: any, values?: any, callback?: any) => {
    const onComplete =
      typeof values === 'function'
        ? values
        : (callback ?? (typeof input?.callback === 'function' ? input.callback : undefined));
    const params = typeof values === 'function' ? undefined : values;
    const queryInput =
      typeof input === 'object' && input !== null ? { ...input, callback: undefined } : input;

    const operation = tail.then(async () => {
      if (unusable) {
        throw new Error('[DB Pool] Transaction rollback failed; a new connection is required.');
      }
      const originalSql = typeof queryInput === 'string' ? queryInput : queryInput?.text;
      if (typeof originalSql !== 'string' || typeof input?.submit === 'function') {
        throw new Error(
          '[DB Pool] Transaction mode requires a SQL string or a query config with text.',
        );
      }
      if (transactionPooling && queryInput?.name) {
        throw new Error('[DB Pool] Named prepared queries require a session or direct connection.');
      }
      const sql = sqlKeywords(originalSql);
      if (
        transactionPooling &&
        (/\bpg_(?:try_)?advisory_(?:lock|unlock)(?:_shared)?\s*\(/i.test(sql) ||
          /^(?:LISTEN|UNLISTEN|PREPARE|DEALLOCATE|DISCARD)\b/i.test(sql))
      ) {
        throw new Error('[DB Pool] Session state requires a session or direct connection.');
      }
      const execute = () => rawQuery(queryInput, params);
      const beginsTransaction = /^(?:BEGIN\b|START\s+TRANSACTION\b)/i.test(sql);
      const endsTransaction =
        /^(?:COMMIT|END|ROLLBACK|ABORT)(?:\s+(?:WORK|TRANSACTION))?(?:\s+AND\s+(?:NO\s+)?CHAIN)?\s*;?\s*$/i.test(
          sql,
        );
      const rollsBack = /^(?:ROLLBACK|ABORT)\b/i.test(sql);
      if (!rollsBack) options.assertUsable?.();
      const prepareTransaction = async () => {
        await options.beforeTransaction?.(rawQuery);
        if (transactionPooling) await rawQuery(timezoneSql);
      };
      if (beginsTransaction) {
        // Multi-command transaction control could execute dates before SET LOCAL.
        if (sql.replace(/;\s*$/, '').includes(';')) {
          throw new Error('[DB Pool] Send BEGIN as a separate query in transaction mode.');
        }
        const result = await execute();
        inTransaction = true;
        await prepareTransaction();
        return result;
      }
      if (endsTransaction) {
        const result = await execute();
        inTransaction = /\sAND\s+CHAIN\s*;?\s*$/i.test(sql);
        if (inTransaction) await prepareTransaction();
        return result;
      }
      // A plain SET persists after COMMIT and could affect another pooler client.
      if (
        transactionPooling &&
        (/^RESET\b/i.test(sql) ||
          /^SET\b(?!\s+(?:LOCAL|TRANSACTION|CONSTRAINTS)\b)/i.test(sql) ||
          (!inTransaction && /^SET\b/i.test(sql)))
      ) {
        throw new Error(
          '[DB Pool] Use SET LOCAL inside an explicit transaction, or a session connection.',
        );
      }
      if (inTransaction) return await execute();
      if (requiresAutocommit(sql)) return await execute();
      // Preserve session configuration commands on session/direct endpoints.
      if (
        !transactionPooling &&
        /^(?:SET|RESET|LISTEN|UNLISTEN|PREPARE|DEALLOCATE|DISCARD)\b/i.test(sql)
      )
        return await execute();

      await rawQuery('BEGIN');
      inTransaction = true;
      try {
        await prepareTransaction();
        const result = await execute();
        options.assertUsable?.();
        await rawQuery('COMMIT');
        inTransaction = false;
        return result;
      } catch (error) {
        try {
          await rawQuery('ROLLBACK');
          inTransaction = false;
        } catch {
          // Discard a client with unknown transaction state even when its caller
          // releases it without an error. pg-pool removes an ending connection.
          unusable = true;
          await client.end?.().catch(() => undefined);
        }
        throw error;
      }
    });
    // Recover the queue after an error so a caller can issue ROLLBACK.
    tail = operation.catch(() => undefined);
    if (typeof onComplete === 'function') {
      operation.then(
        (result) => onComplete(null, result),
        (error) => onComplete(error),
      );
      return undefined;
    }
    return operation;
  };
};
