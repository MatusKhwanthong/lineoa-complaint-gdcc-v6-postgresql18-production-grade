BEGIN;

-- 1) เพิ่ม department_id ก่อน
ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS department_id uuid;

-- 2) เพิ่ม Foreign Key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_users_department_fk'
      AND conrelid = 'staff_users'::regclass
  ) THEN
    ALTER TABLE staff_users
      ADD CONSTRAINT staff_users_department_fk
      FOREIGN KEY (department_id)
      REFERENCES departments(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END
$$;

-- 3) สร้าง index ทั่วไป
CREATE INDEX IF NOT EXISTS staff_users_department_idx
  ON staff_users (department_id)
  WHERE department_id IS NOT NULL;

-- 4) ตรวจข้อมูลซ้ำ หลังมีคอลัมน์แล้ว
DO $$
DECLARE
  duplicate_record RECORD;
BEGIN
  SELECT
    department_id,
    role,
    COUNT(*) AS total
  INTO duplicate_record
  FROM staff_users
  WHERE department_id IS NOT NULL
    AND role IN ('officer', 'supervisor')
    AND is_active = TRUE
  GROUP BY department_id, role
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Duplicate active staff in department %, role %, total %',
      duplicate_record.department_id,
      duplicate_record.role,
      duplicate_record.total;
  END IF;
END
$$;

-- 5) 1 หน่วยงาน มี active officer ได้ 1 คน
CREATE UNIQUE INDEX IF NOT EXISTS
  staff_users_one_active_officer_per_department_idx
ON staff_users (department_id)
WHERE department_id IS NOT NULL
  AND role = 'officer'
  AND is_active = TRUE;

-- 6) 1 หน่วยงาน มี active supervisor ได้ 1 คน
CREATE UNIQUE INDEX IF NOT EXISTS
  staff_users_one_active_supervisor_per_department_idx
ON staff_users (department_id)
WHERE department_id IS NOT NULL
  AND role = 'supervisor'
  AND is_active = TRUE;

-- 7) Officer และ Supervisor ต้องมีหน่วยงาน
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_users_role_department_check'
      AND conrelid = 'staff_users'::regclass
  ) THEN
    ALTER TABLE staff_users
      ADD CONSTRAINT staff_users_role_department_check
      CHECK (
        role NOT IN ('officer', 'supervisor')
        OR department_id IS NOT NULL
      ) NOT VALID;
  END IF;
END
$$;

COMMIT;