import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localPgFile = path.join(__dirname, '../../.postgres.local');
if (!process.env.POSTGRES_PASSWORD && fs.existsSync(localPgFile)) {
  process.env.POSTGRES_PASSWORD = fs.readFileSync(localPgFile, 'utf8').trim();
}

const { Client } = pg;

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'erp_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'bin_al_ajouz',
});

async function main() {
  await client.connect();
  console.log('CONNECTED TO DATABASE FOR MIGRATIONS');

  // Create schema_migrations table if not exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Check if users table exists (indicates db is already setup)
  const usersTableExists = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'users'
    )
  `);

  const dbIsSetup = usersTableExists.rows[0].exists;

  // Read migrations directory
  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  // Get applied migrations
  const appliedRes = await client.query(`SELECT version FROM schema_migrations`);
  const applied = new Set(appliedRes.rows.map((row) => row.version));

  // If db is setup but schema_migrations is empty, mark 001-009 as applied
  if (dbIsSetup && applied.size === 0) {
    console.log('Database is already set up. Seeding schema_migrations table with initial migrations (001-009)...');
    for (const file of files) {
      if (file < '010_phase1_fixes.sql') {
        await client.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [file]);
        applied.add(file);
        console.log(`  → Marked ${file} as applied.`);
      }
    }
  }

  // Apply pending migrations
  for (const file of files) {
    if (!applied.has(file)) {
      console.log(`Applying migration: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [file]);
        await client.query('COMMIT');
        console.log(`Successfully applied migration: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error applying migration ${file}:`, err.message);
        process.exit(1);
      }
    } else {
      console.log(`Migration ${file} is already applied.`);
    }
  }

  console.log('ALL MIGRATIONS PROCESSED.');
  await client.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
