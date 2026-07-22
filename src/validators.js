import { z } from 'zod';

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((value) => value || null);

export const complaintCreateSchema = z.object({
  categoryId: z.string().uuid('หมวดหมู่ไม่ถูกต้อง'),
  title: z.string().trim().min(5, 'กรุณาระบุหัวข้ออย่างน้อย 5 ตัวอักษร').max(200),
  description: z
    .string()
    .trim()
    .min(10, 'กรุณาระบุรายละเอียดอย่างน้อย 10 ตัวอักษร')
    .max(5000),
  locationText: optionalText(500),
  latitude: z.number().min(-90, 'ละติจูดไม่ถูกต้อง').max(90, 'ละติจูดไม่ถูกต้อง'),
  longitude: z.number().min(-180, 'ลองจิจูดไม่ถูกต้อง').max(180, 'ลองจิจูดไม่ถูกต้อง'),
  contactName: z.string().trim().min(2, 'กรุณาระบุชื่อผู้ติดต่อ').max(200),
  contactPhone: z
    .string()
    .trim()
    .min(8, 'เบอร์โทรศัพท์สั้นเกินไป')
    .max(20)
    .regex(/^[0-9+\-\s()]+$/, 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง'),
  contactEmail: optionalText(254).refine(
    (value) => value === null || z.string().email().safeParse(value).success,
    'รูปแบบอีเมลไม่ถูกต้อง',
  ),
  privacyConsent: z.literal(true, {
    errorMap: () => ({ message: 'กรุณายอมรับประกาศความเป็นส่วนตัว' }),
  }),
});

export const adminLoginSchema = z.object({
  username: z.string().trim().min(3).max(100),
  password: z.string().min(8).max(200),
});

export const statusUpdateSchema = z.object({
  status: z.enum([
    'new',
    'received',
    'assigned',
    'in_progress',
    'waiting_for_info',
    'completed',
    'rejected',
    'cancelled',
  ]),
  note: optionalText(2000),
});
