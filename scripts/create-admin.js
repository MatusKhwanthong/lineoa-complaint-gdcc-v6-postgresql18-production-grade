import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../src/db.js';

const inputSchema = z.object({
  username: z.string().trim().min(3).max(100),
  password: z.string().min(12).max(200),
  displayName: z.string().trim().min(2).max(200),
  role: z.enum(['officer', 'supervisor', 'admin']),
});

const [username, password, displayName, role = 'admin'] = process.argv.slice(2);
const parsed = inputSchema.safeParse({ username, password, displayName, role });

if (!parsed.success) {
  console.error(
    'วิธีใช้: npm run admin:create -- <username> <passwordอย่างน้อย12ตัว> "<ชื่อแสดงผล>" <officer|supervisor|admin>',
  );
  process.exit(1);
}

try {
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const result = await pool.query(
    `INSERT INTO staff_users (username, password_hash, display_name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (username)
     DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       display_name = EXCLUDED.display_name,
       role = EXCLUDED.role,
       is_active = true,
       updated_at = current_timestamp
     RETURNING id, username, display_name, role`,
    [
      parsed.data.username,
      passwordHash,
      parsed.data.displayName,
      parsed.data.role,
    ],
  );

  console.log('Admin account ready:', result.rows[0]);
} finally {
  await pool.end();
}
