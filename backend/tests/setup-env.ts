// Validate the resolved config before test modules can create a database pool.
import config from '../src/config/index.ts';
import { assertSafeTestDatabase } from '../scripts/testDatabaseSafety.ts';

assertSafeTestDatabase(config.db);
