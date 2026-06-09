import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'bin_al_ajouz',
  user: process.env.DB_USER || 'erp_user',
  password: process.env.DB_PASSWORD,
});

if (!process.env.DB_PASSWORD) {
  throw new Error('Missing DB_PASSWORD in backend/.env');
}

const password = process.argv[2] || 'Admin@123';
const hash = await bcrypt.hash(password, 10);

await pool.query(
  `UPDATE users SET password_hash = $1, is_active = TRUE WHERE username = 'admin'`,
  [hash]
);

console.log('✅ تم تحديث كلمة مرور admin');
console.log('   المستخدم: admin');
await pool.end();
