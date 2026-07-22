BEGIN;

-- ผูกหมวดหมู่กับหน่วยงานรับผิดชอบ
ALTER TABLE complaint_categories
  ADD COLUMN IF NOT EXISTS department_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'complaint_categories_department_fk'
  ) THEN
    ALTER TABLE complaint_categories
      ADD CONSTRAINT complaint_categories_department_fk
      FOREIGN KEY (department_id)
      REFERENCES departments(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS complaint_categories_department_idx
  ON complaint_categories (department_id)
  WHERE department_id IS NOT NULL;

-- กำหนดหน่วยงานเริ่มต้นให้หมวดหมู่เดิม
UPDATE complaint_categories c
SET department_id = d.id
FROM departments d
WHERE
  (c.code IN ('ROAD', 'LIGHT') AND d.code = 'ENGINEERING')
  OR (c.code = 'WASTE' AND d.code = 'PUBLIC_WORKS')
  OR (c.code = 'DRAIN' AND d.code = 'ENGINEERING')
  OR (c.code IN ('PUBLIC_HEALTH', 'ENVIRONMENT')
      AND d.code = 'PUBLIC_HEALTH')
  OR (c.code = 'TRAFFIC' AND d.code = 'TRAFFIC')
  OR (c.code = 'OTHER' AND d.code = 'CENTRAL');

-- เติมหน่วยงานให้เรื่องเก่าที่ยังไม่มี department_id
UPDATE complaints cp
SET department_id = cc.department_id
FROM complaint_categories cc
WHERE cp.category_id = cc.id
  AND cp.department_id IS NULL
  AND cc.department_id IS NOT NULL;

COMMIT;