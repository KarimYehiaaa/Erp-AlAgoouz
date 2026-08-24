import bcrypt from 'bcryptjs';
import pool from './pool.ts';

// حماية: منع إعادة تعيين المدير في الإنتاج إلا بتجاوز صريح
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_ADMIN_RESET !== 'true') {
  throw new Error(
    '⛔ Admin reset is blocked in production. Set ALLOW_ADMIN_RESET=true explicitly to override.',
  );
}

// Usage: node src/database/reset-admin.ts [username] [new_password]
const username = process.argv[2] || 'admin';
const password = process.argv[3] || process.env.ADMIN_RESET_PASSWORD;

if (!password) {
  throw new Error(
    'Missing new admin password. Pass it as an argument or set ADMIN_RESET_PASSWORD.',
  );
}

const hash = await bcrypt.hash(password, 10);

const res = await pool.query(
  `UPDATE users SET password_hash = $1, is_active = TRUE WHERE username = $2`,
  [hash, username],
);

if (res.rowCount === 0) {
  console.log(`⚠️ لم يتم العثور على مستخدم بالاسم: ${username}`);
  console.log(
    `   يمكنك تشغيل السكربت وتمرير اسم مستخدم صحيح: node src/database/reset-admin.ts [username] [password]`,
  );
} else {
  console.log(`✅ تم تحديث كلمة مرور الحساب بنجاح!`);
  console.log(`   المستخدم: ${username}`);
}

await pool.end();
