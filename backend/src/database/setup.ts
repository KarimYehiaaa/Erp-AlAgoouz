/**
 * Initialize a local PostgreSQL database or migrate an existing endpoint.
 * Remote endpoints always go through the shared migration-approval guard.
 */
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import config from '../config/index.ts';
import { closePool } from './pool.ts';
import { databaseConnectionOptions, isLoopbackDatabaseConnection } from './connectionOptions.ts';
import { runMigrations } from '../../scripts/migrate.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localPgFile = path.resolve(__dirname, '../../.postgres.local');
if (!process.env.POSTGRES_PASSWORD && fs.existsSync(localPgFile)) {
  process.env.POSTGRES_PASSWORD = fs.readFileSync(localPgFile, 'utf8').trim();
}

const { Client } = pg;

/** Only decomposed loopback settings may create or alter local database roles. */
export const canAutoProvisionDatabase = (endpoint: {
  connectionString?: string | null;
  host?: string | null;
}): boolean =>
  !endpoint.connectionString &&
  isLoopbackDatabaseConnection({
    connectionString: endpoint.connectionString ?? undefined,
    host: endpoint.host,
  });

const quoteIdentifier = (value: string, label: string): string => {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error(`${label} contains unsupported characters.`);
  }
  return `"${value}"`;
};

const setupLocalDatabase = async (): Promise<void> => {
  const dbUser = String(config.db.user || '').trim();
  const dbPassword = String(config.db.password || '').trim();
  const dbName = String(config.db.database || '').trim();
  const adminUser = (process.env.POSTGRES_USER || 'postgres').trim();
  const adminPassword = (process.env.POSTGRES_PASSWORD || dbPassword).trim();
  if (!dbUser || !dbPassword || !dbName || !adminPassword) {
    throw new Error(
      'Local database setup requires DB_USER, DB_PASSWORD, DB_NAME, and POSTGRES_PASSWORD (or a matching DB_PASSWORD).',
    );
  }

  const safeUser = quoteIdentifier(dbUser, 'DB_USER');
  const safeDatabase = quoteIdentifier(dbName, 'DB_NAME');
  quoteIdentifier(adminUser, 'POSTGRES_USER');
  const safePassword = dbPassword.replace(/'/g, "''");
  const endpoint = databaseConnectionOptions();
  if ('connectionString' in endpoint && endpoint.connectionString) {
    throw new Error(
      'Automatic role and database provisioning is disabled for DATABASE_URL endpoints.',
    );
  }
  if (!('host' in endpoint)) {
    throw new Error('Local database provisioning requires decomposed connection settings.');
  }
  const localHost = endpoint.host || 'localhost';
  const localPort = endpoint.port || 5432;
  const admin = new Client({
    host: localHost,
    port: localPort,
    user: adminUser,
    password: adminPassword,
    database: 'postgres',
    ssl: endpoint.ssl,
  });

  await admin.connect();
  try {
    const userExists = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [dbUser]);
    if (!userExists.rowCount) {
      await admin.query(`CREATE USER ${safeUser} WITH PASSWORD '${safePassword}'`);
      console.log(`Created local application role ${dbUser}.`);
    } else if (dbUser !== adminUser) {
      await admin.query(`ALTER USER ${safeUser} WITH PASSWORD '${safePassword}'`);
    }

    const databaseExists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      dbName,
    ]);
    if (!databaseExists.rowCount) {
      await admin.query(`CREATE DATABASE ${safeDatabase} OWNER ${safeUser}`);
      console.log(`Created local database ${dbName}.`);
    }
    await admin.query(`GRANT ALL PRIVILEGES ON DATABASE ${safeDatabase} TO ${safeUser}`);
  } finally {
    await admin.end();
  }

  const databaseAdmin = new Client({
    host: localHost,
    port: localPort,
    user: adminUser,
    password: adminPassword,
    database: dbName,
    ssl: endpoint.ssl,
  });
  await databaseAdmin.connect();
  try {
    await databaseAdmin.query(`GRANT ALL ON SCHEMA public TO ${safeUser}`);
    await databaseAdmin.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${safeUser}`);
    await databaseAdmin.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${safeUser}`);
  } finally {
    await databaseAdmin.end();
  }
};

export const setupDatabase = async (): Promise<void> => {
  const endpoint = databaseConnectionOptions();
  if (!canAutoProvisionDatabase(endpoint)) {
    console.log(
      'Using the configured database endpoint. Remote schema changes require the coordinated migration approval.',
    );
    await runMigrations();
    return;
  }

  // Reuse an existing local database with the normal migration pipeline.
  // Provisioning is only attempted for PostgreSQL's precise missing-database error.
  const probe = new Client(endpoint);
  let needsProvisioning = false;
  try {
    await probe.connect();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (!['3D000', '28000'].includes(code || '')) throw error;
    needsProvisioning = true;
  } finally {
    await probe.end().catch(() => undefined);
  }

  if (needsProvisioning) await setupLocalDatabase();
  await runMigrations();
};

const main = async (): Promise<void> => {
  try {
    await setupDatabase();
    console.log('\nDatabase setup completed successfully.');
    console.log('Run the backend with: npm run dev -w backend');
  } finally {
    await closePool();
  }
};

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(
      '\nDatabase setup failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    process.exitCode = 1;
  });
}
