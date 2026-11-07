// Seeds only an admin user. Set ADMIN_PHONE / ADMIN_PASSWORD env vars.
import bcrypt from 'bcryptjs';
import { db, pool } from './index';
import { users } from './schema';
(async () => {
  const phone = process.env.ADMIN_PHONE, pw = process.env.ADMIN_PASSWORD;
  if (!phone || !pw) throw new Error('Set ADMIN_PHONE and ADMIN_PASSWORD');
  await db.insert(users).values({ phone, name: 'Admin', passwordHash: await bcrypt.hash(pw, 12), role: 'admin', country: 'QA', phoneVerified: true }).onConflictDoNothing();
  console.log('admin seeded'); await pool.end();
})();
