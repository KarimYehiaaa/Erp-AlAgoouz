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

// Usage: node src/database/reset-admin.js [username] [new_password]
const username = process.argv[2] || 'admin';
const password = process.argv[3] || process.env.ADMIN_RESET_PASSWORD;

if (!password) {
  throw new Error('Missing new admin password. Pass it as an argument or set ADMIN_RESET_PASSWORD.');
}

const hash = await bcrypt.hash(password, 10);

const res = await pool.query(
  `UPDATE users SET password_hash = $1, is_active = TRUE WHERE username = $2`,
  [hash, username]
);

if (res.rowCount === 0) {
  console.log(`⚠️ لم يتم العثور على مستخدم بالاسم: ${username}`);
  console.log(`   يمكنك تشغيل السكربت وتمرير اسم مستخدم صحيح: node src/database/reset-admin.js [username] [password]`);
} else {
  console.log(`✅ تم تحديث كلمة مرور الحساب بنجاح!`);
  console.log(`   المستخدم: ${username}`);
}

await pool.end();
