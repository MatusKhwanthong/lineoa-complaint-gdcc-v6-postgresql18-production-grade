import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import config from '../config.js';
import { pool } from '../db.js';
import { ApiError } from '../errors.js';
import { requireAdmin, requireRoles, isElevatedStaff } from '../middleware/admin-auth.js';
import { adminLoginSchema, statusUpdateSchema } from '../validators.js';
import { notifyStatusChanged } from '../services/notifications.js';
import { sendStoredImage } from '../services/uploads.js';

const router = Router();


async function writeAudit(req, action, entityType, entityId = null, detail = {}) {
  await pool.query(
    `INSERT INTO audit_logs (actor_staff_user_id, action, entity_type, entity_id, detail, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [req.admin?.id || null, action, entityType, entityId, JSON.stringify(detail), req.ip || null, req.get('user-agent') || null],
  );
}

const allowedTransitions = {
  new: ['received', 'rejected', 'cancelled'],
  received: ['assigned', 'in_progress', 'waiting_for_info', 'rejected', 'cancelled'],
  assigned: ['in_progress', 'waiting_for_info', 'completed', 'cancelled'],
  in_progress: ['waiting_for_info', 'completed', 'cancelled'],
  waiting_for_info: ['received', 'assigned', 'in_progress', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: [],
};

router.post('/login', async (req, res) => {
  const parsed = adminLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  const result = await pool.query(
    `SELECT id, username, password_hash, display_name, role, is_active
       FROM staff_users
      WHERE lower(username) = lower($1)
      LIMIT 1`,
    [parsed.data.username],
  );

  const user = result.rows[0];
  if (!user || !user.is_active) {
    throw new ApiError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  const isValid = await bcrypt.compare(parsed.data.password, user.password_hash);
  if (!isValid) {
    throw new ApiError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  await pool.query(
    `UPDATE staff_users SET last_login_at = current_timestamp WHERE id = $1`,
    [user.id],
  );

  const token = jwt.sign(
    {
      username: user.username,
      displayName: user.display_name,
      role: user.role,
    },
    config.jwtSecret,
    {
      subject: user.id,
      issuer: 'lineoa-complaint-gdcc',
      audience: 'complaint-admin',
      expiresIn: config.jwtExpiresIn,
    },
  );

  res.json({
    success: true,
    data: {
      token,
      user: {
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      },
    },
  });
});

router.use(requireAdmin);

router.get('/me', (req, res) => {
  res.json({ success: true, data: req.admin });
});

router.get('/attachments/:id', async (req, res) => {
  const idResult = z.string().uuid().safeParse(req.params.id);
  if (!idResult.success) throw new ApiError(400, 'รหัสรูปภาพไม่ถูกต้อง');

  const result = await pool.query(
    `SELECT id, storage_key, mime_type
       FROM complaint_attachments
      WHERE id = $1`,
    [req.params.id],
  );

  if (result.rowCount === 0) throw new ApiError(404, 'ไม่พบรูปภาพ');
  return sendStoredImage(res, result.rows[0]);
});

router.get('/complaints', async (req, res) => {
  const querySchema = z.object({
    status: z.string().optional(),
    search: z.string().max(200).optional(),
    mine: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  });

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(400, 'ตัวกรองไม่ถูกต้อง');
  }

  const { status, search, mine, page, limit } = parsed.data;
  const conditions = [];
  const values = [];

  if (status) {
    values.push(status);
    conditions.push(`c.status::text = $${values.length}`);
  }

  // ?mine=true = ดูเฉพาะเรื่องที่ตัวเองถูกมอบหมาย (ใช้ได้ทุก role,
  // แต่เป็นมุมมองหลักของ officer เพราะแก้สถานะได้แค่เรื่องของตัวเอง)
  if (mine) {
    values.push(req.admin.id);
    conditions.push(`c.assigned_staff_user_id = $${values.length}`);
  }

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(
      c.reference_no ILIKE $${values.length}
      OR c.title ILIKE $${values.length}
      OR c.contact_name ILIKE $${values.length}
      OR c.contact_phone ILIKE $${values.length}
    )`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    `SELECT count(*)::integer AS total FROM complaints c ${where}`,
    values,
  );

  values.push(limit);
  const limitPlaceholder = `$${values.length}`;
  values.push(offset);
  const offsetPlaceholder = `$${values.length}`;

  const result = await pool.query(
    `SELECT
        c.id,
        c.reference_no,
        c.title,
        c.description,
        c.location_text,
        c.latitude,
        c.longitude,
        c.status,
        c.contact_name,
        c.contact_phone,
        c.contact_email,
        c.line_display_name,
        c.created_at,
        c.updated_at,
        c.assigned_staff_user_id,
        cc.name_th AS category_name,
        d.name_th AS department_name,
        su.display_name AS assigned_staff_name,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', a.id,
                'originalName', a.original_name,
                'mimeType', a.mime_type,
                'sizeBytes', a.size_bytes,
                'width', a.width,
                'height', a.height
              )
              ORDER BY a.sort_order, a.created_at
            ),
            '[]'::json
          )
          FROM complaint_attachments a
          WHERE a.complaint_id = c.id
        ) AS attachments
       FROM complaints c
       JOIN complaint_categories cc ON cc.id = c.category_id
       LEFT JOIN departments d ON d.id = c.department_id
       LEFT JOIN staff_users su ON su.id = c.assigned_staff_user_id
       ${where}
      ORDER BY c.created_at DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    values,
  );

  // บอก frontend ว่าแต่ละเรื่องแก้สถานะได้ไหม (officer แก้ได้เฉพาะของตัวเอง)
  const rows = result.rows.map((row) => ({
    ...row,
    canEditStatus: isElevatedStaff(req.admin) || row.assigned_staff_user_id === req.admin.id,
  }));

  res.json({
    success: true,
    data: rows,
    pagination: {
      page,
      limit,
      total: countResult.rows[0].total,
      totalPages: Math.ceil(countResult.rows[0].total / limit),
    },
  });
});

router.get('/complaints/:id', async (req, res) => {
  const idResult = z.string().uuid().safeParse(req.params.id);
  if (!idResult.success) throw new ApiError(400, 'รหัสรายการไม่ถูกต้อง');

  const result = await pool.query(
    `SELECT
        c.*,
        cc.name_th AS category_name,
        d.name_th AS department_name,
        su.display_name AS assigned_staff_name,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', a.id,
                'originalName', a.original_name,
                'mimeType', a.mime_type,
                'sizeBytes', a.size_bytes,
                'width', a.width,
                'height', a.height
              )
              ORDER BY a.sort_order, a.created_at
            ),
            '[]'::json
          )
          FROM complaint_attachments a
          WHERE a.complaint_id = c.id
        ) AS attachments
       FROM complaints c
       JOIN complaint_categories cc ON cc.id = c.category_id
      LEFT JOIN departments d ON d.id = c.department_id
      LEFT JOIN staff_users su ON su.id = c.assigned_staff_user_id
      WHERE c.id = $1`,
    [req.params.id],
  );

  if (result.rowCount === 0) throw new ApiError(404, 'ไม่พบรายการ');

  const history = await pool.query(
    `SELECT
        h.old_status,
        h.new_status,
        h.note,
        h.actor_type,
        h.created_at,
        s.display_name AS staff_name
       FROM complaint_status_history h
       LEFT JOIN staff_users s ON s.id = h.actor_staff_user_id
      WHERE h.complaint_id = $1
      ORDER BY h.created_at ASC`,
    [req.params.id],
  );

  const complaint = result.rows[0];
  const canEditStatus = isElevatedStaff(req.admin) || complaint.assigned_staff_user_id === req.admin.id;

  res.json({
    success: true,
    data: { ...complaint, canEditStatus, history: history.rows },
  });
});

router.patch('/complaints/:id/status', async (req, res) => {
  const idResult = z.string().uuid().safeParse(req.params.id);
  if (!idResult.success) throw new ApiError(400, 'รหัสรายการไม่ถูกต้อง');

  const parsed = statusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'ข้อมูลสถานะไม่ถูกต้อง', parsed.error.flatten());
  }

  const client = await pool.connect();
  let complaint;

  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      `SELECT * FROM complaints WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );

    if (currentResult.rowCount === 0) {
      throw new ApiError(404, 'ไม่พบรายการ');
    }

    const current = currentResult.rows[0];
    const nextStatus = parsed.data.status;

    // Officer แก้สถานะได้เฉพาะเรื่องที่ตัวเองถูกมอบหมาย
    // supervisor แก้ไม่ได้ทุกเรื่อง
    // admin แก้ได้ทุกเรื่อง
    if (!isElevatedStaff(req.admin) && current.assigned_staff_user_id !== req.admin.id) {
      throw new ApiError(403, 'คุณสามารถแก้ไขได้เฉพาะเรื่องที่ได้รับมอบหมายเท่านั้น');
    }

    if (nextStatus !== current.status) {
      const validNextStatuses = allowedTransitions[current.status] || [];
      if (!validNextStatuses.includes(nextStatus)) {
        throw new ApiError(
          409,
          `ไม่สามารถเปลี่ยนสถานะจาก ${current.status} เป็น ${nextStatus} ได้`,
        );
      }
    }

    const updateResult = await client.query(
      `UPDATE complaints
          SET status = $1,
              updated_at = current_timestamp
        WHERE id = $2
        RETURNING *`,
      [nextStatus, req.params.id],
    );
    complaint = updateResult.rows[0];

    await client.query(
      `INSERT INTO complaint_status_history (
          complaint_id,
          old_status,
          new_status,
          note,
          actor_type,
          actor_staff_user_id
       ) VALUES ($1, $2, $3, $4, 'staff', $5)`,
      [
        complaint.id,
        current.status,
        nextStatus,
        parsed.data.note,
        req.admin.id,
      ],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await writeAudit(req, 'complaint.status.update', 'complaint', complaint.id, { status: complaint.status, note: parsed.data.note });

  await notifyStatusChanged(complaint, parsed.data.note);

  res.json({
    success: true,
    message: 'ปรับปรุงสถานะเรียบร้อย',
    data: {
      id: complaint.id,
      referenceNo: complaint.reference_no,
      status: complaint.status,
      updatedAt: complaint.updated_at,
    },
  });
});



router.get('/dashboard', async (req, res) => {
  const [summary, recent, categories, departments, statusBreakdown, monthlyTrend, urgentCases, mapCases] = await Promise.all([
    pool.query(`
      SELECT
        count(*)::integer AS total,
        count(*) FILTER (WHERE status IN ('new','received'))::integer AS pending,
        count(*) FILTER (WHERE status IN ('assigned','in_progress','waiting_for_info'))::integer AS in_progress,
        count(*) FILTER (WHERE status = 'completed')::integer AS completed,
        count(*) FILTER (WHERE due_at IS NOT NULL AND due_at < current_timestamp AND status NOT IN ('completed','rejected','cancelled'))::integer AS overdue,
        count(*) FILTER (WHERE created_at >= date_trunc('month', current_timestamp))::integer AS this_month,
        count(*) FILTER (WHERE priority IN ('high','urgent') AND status NOT IN ('completed','rejected','cancelled'))::integer AS high_priority,
        COALESCE(round(avg(EXTRACT(EPOCH FROM (COALESCE(completed_at, current_timestamp) - created_at)) / 86400)::numeric, 1), 0) AS avg_days
      FROM complaints
    `),
    pool.query(`
      SELECT c.id, c.reference_no, c.title, c.status, c.priority, c.created_at,
             c.due_at, cc.name_th AS category_name, d.name_th AS department_name
      FROM complaints c
      JOIN complaint_categories cc ON cc.id = c.category_id
      LEFT JOIN departments d ON d.id = c.department_id
      ORDER BY c.created_at DESC
      LIMIT 8
    `),
    pool.query(`
      SELECT cc.name_th AS label, count(c.id)::integer AS value
      FROM complaint_categories cc
      LEFT JOIN complaints c ON c.category_id = cc.id
      WHERE cc.is_active = true
      GROUP BY cc.id, cc.name_th, cc.sort_order
      ORDER BY value DESC, cc.sort_order
      LIMIT 8
    `),
    pool.query(`
      SELECT d.name_th AS label, count(c.id)::integer AS value
      FROM departments d
      LEFT JOIN complaints c ON c.department_id = d.id
      WHERE d.is_active = true
      GROUP BY d.id, d.name_th
      ORDER BY value DESC, d.name_th
    `),
    pool.query(`
      SELECT status::text AS label, count(*)::integer AS value
      FROM complaints
      GROUP BY status
      ORDER BY value DESC
    `),
    pool.query(`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', current_timestamp) - interval '5 months',
          date_trunc('month', current_timestamp),
          interval '1 month'
        ) AS month_start
      )
      SELECT to_char(m.month_start, 'YYYY-MM') AS month,
             count(c.id)::integer AS received,
             count(c.id) FILTER (WHERE c.status = 'completed')::integer AS completed
      FROM months m
      LEFT JOIN complaints c ON date_trunc('month', c.created_at) = m.month_start
      GROUP BY m.month_start
      ORDER BY m.month_start
    `),
    pool.query(`
      SELECT c.id, c.reference_no, c.title, c.status, c.priority, c.due_at,
             d.name_th AS department_name
      FROM complaints c
      LEFT JOIN departments d ON d.id = c.department_id
      WHERE c.status NOT IN ('completed','rejected','cancelled')
        AND (c.priority IN ('high','urgent') OR (c.due_at IS NOT NULL AND c.due_at < current_timestamp + interval '2 days'))
      ORDER BY CASE c.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
               c.due_at NULLS LAST
      LIMIT 6
    `),
    pool.query(`
      SELECT c.id, c.reference_no, c.title, c.status, c.latitude, c.longitude,
             c.location_text, cc.name_th AS category_name
      FROM complaints c
      JOIN complaint_categories cc ON cc.id = c.category_id
      WHERE c.latitude IS NOT NULL AND c.longitude IS NOT NULL
      ORDER BY c.created_at DESC
      LIMIT 100
    `),
  ]);

  res.json({
    success: true,
    data: {
      summary: summary.rows[0],
      recent: recent.rows,
      categoryBreakdown: categories.rows,
      departmentBreakdown: departments.rows,
      statusBreakdown: statusBreakdown.rows,
      monthlyTrend: monthlyTrend.rows,
      urgentCases: urgentCases.rows,
      mapCases: mapCases.rows,
    },
  });
});

router.get('/departments', async (req, res) => {
  const result = await pool.query(
    `SELECT id, code, name_th FROM departments WHERE is_active = true ORDER BY name_th`,
  );
  res.json({ success: true, data: result.rows });
});

router.get('/staff', requireRoles('admin', 'supervisor'), async (req, res) => {
  const result = await pool.query(
    `SELECT id, username, display_name, role FROM staff_users WHERE is_active = true ORDER BY display_name`,
  );
  res.json({ success: true, data: result.rows });
});

router.patch('/complaints/:id/assignment', requireRoles('admin', 'supervisor'), async (req, res) => {
  const idResult = z.string().uuid().safeParse(req.params.id);
  if (!idResult.success) throw new ApiError(400, 'รหัสรายการไม่ถูกต้อง');

  const schema = z.object({
    departmentId: z.string().uuid().nullable().optional(),
    staffUserId: z.string().uuid().nullable().optional(),
    priority: z.enum(['low','normal','high','urgent']).default('normal'),
    dueAt: z.string().datetime().nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'ข้อมูลมอบหมายไม่ถูกต้อง', parsed.error.flatten());

  const result = await pool.query(
    `UPDATE complaints
        SET department_id = $1,
            assigned_staff_user_id = $2,
            priority = $3,
            due_at = $4,
            status = CASE WHEN status IN ('new','received') THEN 'assigned'::complaint_status ELSE status END,
            updated_at = current_timestamp
      WHERE id = $5
      RETURNING *`,
    [parsed.data.departmentId ?? null, parsed.data.staffUserId ?? null, parsed.data.priority, parsed.data.dueAt ?? null, req.params.id],
  );
  if (result.rowCount === 0) throw new ApiError(404, 'ไม่พบรายการ');

  await pool.query(
    `INSERT INTO complaint_status_history (
      complaint_id, old_status, new_status, note, actor_type, actor_staff_user_id
    ) VALUES ($1, NULL, $2, $3, 'staff', $4)`,
    [req.params.id, result.rows[0].status, parsed.data.note || 'มอบหมายหน่วยงาน/เจ้าหน้าที่', req.admin.id],
  );

  await writeAudit(req, 'complaint.assignment.update', 'complaint', req.params.id, parsed.data);
  res.json({ success: true, message: 'มอบหมายงานเรียบร้อย', data: result.rows[0] });
});


router.get('/governance/categories', requireRoles('admin','supervisor'), async (req, res) => {
  const result = await pool.query(`SELECT id, code, name_th, sla_hours, is_active, created_at, updated_at FROM complaint_categories ORDER BY sort_order, name_th`);
  res.json({ success: true, data: result.rows });
});

router.post('/governance/categories', requireRoles('admin'), async (req, res) => {
  const schema = z.object({ code: z.string().trim().min(2).max(50).regex(/^[A-Z0-9_]+$/), nameTh: z.string().trim().min(2).max(200), slaHours: z.coerce.number().int().min(1).max(8760).default(72) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'ข้อมูลหมวดหมู่ไม่ถูกต้อง', parsed.error.flatten());
  const result = await pool.query(`INSERT INTO complaint_categories (code,name_th,sla_hours) VALUES ($1,$2,$3) RETURNING *`, [parsed.data.code, parsed.data.nameTh, parsed.data.slaHours]);
  await writeAudit(req, 'category.create', 'complaint_category', result.rows[0].id, parsed.data);
  res.status(201).json({ success:true, data:result.rows[0] });
});

router.patch('/governance/categories/:id', requireRoles('admin'), async (req, res) => {
  const schema = z.object({ nameTh: z.string().trim().min(2).max(200), slaHours: z.coerce.number().int().min(1).max(8760), isActive: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'ข้อมูลหมวดหมู่ไม่ถูกต้อง', parsed.error.flatten());
  const result = await pool.query(`UPDATE complaint_categories SET name_th=$1,sla_hours=$2,is_active=$3,updated_at=current_timestamp WHERE id=$4 RETURNING *`, [parsed.data.nameTh,parsed.data.slaHours,parsed.data.isActive,req.params.id]);
  if (!result.rowCount) throw new ApiError(404,'ไม่พบหมวดหมู่');
  await writeAudit(req, 'category.update', 'complaint_category', req.params.id, parsed.data);
  res.json({ success:true, data:result.rows[0] });
});

router.get('/governance/departments', requireRoles('admin','supervisor'), async (req, res) => {
  const result = await pool.query(`SELECT id, code, name_th, is_active, created_at, updated_at FROM departments ORDER BY name_th`);
  res.json({ success:true, data:result.rows });
});

router.post('/governance/departments', requireRoles('admin'), async (req, res) => {
  const schema=z.object({code:z.string().trim().min(2).max(50).regex(/^[A-Z0-9_]+$/),nameTh:z.string().trim().min(2).max(200)});
  const parsed=schema.safeParse(req.body); if(!parsed.success) throw new ApiError(400,'ข้อมูลหน่วยงานไม่ถูกต้อง',parsed.error.flatten());
  const result=await pool.query(`INSERT INTO departments (code,name_th) VALUES ($1,$2) RETURNING *`,[parsed.data.code,parsed.data.nameTh]);
  await writeAudit(req,'department.create','department',result.rows[0].id,parsed.data);
  res.status(201).json({success:true,data:result.rows[0]});
});

router.patch('/governance/departments/:id', requireRoles('admin'), async (req, res) => {
  const schema=z.object({nameTh:z.string().trim().min(2).max(200),isActive:z.boolean()});
  const parsed=schema.safeParse(req.body); if(!parsed.success) throw new ApiError(400,'ข้อมูลหน่วยงานไม่ถูกต้อง',parsed.error.flatten());
  const result=await pool.query(`UPDATE departments SET name_th=$1,is_active=$2,updated_at=current_timestamp WHERE id=$3 RETURNING *`,[parsed.data.nameTh,parsed.data.isActive,req.params.id]);
  if(!result.rowCount) throw new ApiError(404,'ไม่พบหน่วยงาน');
  await writeAudit(req,'department.update','department',req.params.id,parsed.data);
  res.json({success:true,data:result.rows[0]});
});

router.get('/governance/users', requireRoles('admin'), async (req, res) => {
  const result=await pool.query(`SELECT id,username,display_name,role,is_active,last_login_at,created_at FROM staff_users ORDER BY display_name`);
  res.json({success:true,data:result.rows});
});

router.post('/governance/users', requireRoles('admin'), async (req, res) => {
  const schema=z.object({username:z.string().trim().min(3).max(100),password:z.string().min(12).max(200),displayName:z.string().trim().min(2).max(200),role:z.enum(['officer','supervisor','admin'])});
  const parsed=schema.safeParse(req.body); if(!parsed.success) throw new ApiError(400,'ข้อมูลผู้ใช้งานไม่ถูกต้อง',parsed.error.flatten());
  const hash=await bcrypt.hash(parsed.data.password,12);
  const result=await pool.query(`INSERT INTO staff_users (username,password_hash,display_name,role) VALUES ($1,$2,$3,$4) RETURNING id,username,display_name,role,is_active,created_at`,[parsed.data.username,hash,parsed.data.displayName,parsed.data.role]);
  await writeAudit(req,'staff.create','staff_user',result.rows[0].id,{username:parsed.data.username,displayName:parsed.data.displayName,role:parsed.data.role});
  res.status(201).json({success:true,data:result.rows[0]});
});

router.patch('/governance/users/:id', requireRoles('admin'), async (req, res) => {
  const schema=z.object({displayName:z.string().trim().min(2).max(200),role:z.enum(['officer','supervisor','admin']),isActive:z.boolean(),password:z.string().min(12).max(200).nullable().optional()});
  const parsed=schema.safeParse(req.body); if(!parsed.success) throw new ApiError(400,'ข้อมูลผู้ใช้งานไม่ถูกต้อง',parsed.error.flatten());
  let result;
  if(parsed.data.password){const hash=await bcrypt.hash(parsed.data.password,12);result=await pool.query(`UPDATE staff_users SET display_name=$1,role=$2,is_active=$3,password_hash=$4,updated_at=current_timestamp WHERE id=$5 RETURNING id,username,display_name,role,is_active`,[parsed.data.displayName,parsed.data.role,parsed.data.isActive,hash,req.params.id]);}
  else{result=await pool.query(`UPDATE staff_users SET display_name=$1,role=$2,is_active=$3,updated_at=current_timestamp WHERE id=$4 RETURNING id,username,display_name,role,is_active`,[parsed.data.displayName,parsed.data.role,parsed.data.isActive,req.params.id]);}
  if(!result.rowCount) throw new ApiError(404,'ไม่พบผู้ใช้งาน');
  await writeAudit(req,'staff.update','staff_user',req.params.id,{displayName:parsed.data.displayName,role:parsed.data.role,isActive:parsed.data.isActive,passwordChanged:Boolean(parsed.data.password)});
  res.json({success:true,data:result.rows[0]});
});

router.get('/governance/audit-logs', requireRoles('admin','supervisor'), async (req, res) => {
  const result=await pool.query(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.detail,a.ip_address,a.created_at,s.display_name AS actor_name FROM audit_logs a LEFT JOIN staff_users s ON s.id=a.actor_staff_user_id ORDER BY a.created_at DESC LIMIT 200`);
  res.json({success:true,data:result.rows});
});

router.get('/reports/export.csv', requireRoles('admin', 'supervisor'), async (req, res) => {
  const result=await pool.query(`SELECT c.reference_no,c.title,cc.name_th AS category,c.status,c.priority,c.contact_name,c.contact_phone,c.location_text,d.name_th AS department,su.display_name AS assigned_staff,c.created_at,c.due_at,c.completed_at FROM complaints c JOIN complaint_categories cc ON cc.id=c.category_id LEFT JOIN departments d ON d.id=c.department_id LEFT JOIN staff_users su ON su.id=c.assigned_staff_user_id ORDER BY c.created_at DESC`);
  const headers=['reference_no','title','category','status','priority','contact_name','contact_phone','location_text','department','assigned_staff','created_at','due_at','completed_at'];
  const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  const csv='\ufeff'+[headers.join(','),...result.rows.map(r=>headers.map(h=>esc(r[h])).join(','))].join('\n');
  await writeAudit(req,'report.export.csv','report',null,{rows:result.rowCount});
  res.setHeader('content-type','text/csv; charset=utf-8'); res.setHeader('content-disposition','attachment; filename="complaints-report.csv"'); res.send(csv);
});

export default router;
