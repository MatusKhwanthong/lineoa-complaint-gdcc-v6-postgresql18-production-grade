BEGIN;

CREATE TEMP TABLE target_staff_users ON COMMIT DROP AS
SELECT id
FROM staff_users
WHERE username IN ('super_engineer', 'officer_engineer');

DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT
      c.conname,
      child_ns.nspname AS child_schema,
      child.relname AS child_table,
      child_col.attname AS child_column,
      child_col.attnotnull AS is_not_null
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
    JOIN LATERAL unnest(c.confkey) WITH ORDINALITY AS fk2(attnum, ord)
      ON fk2.ord = ck.ord
    JOIN pg_attribute child_col
      ON child_col.attrelid = child.oid
     AND child_col.attnum = ck.attnum
    JOIN pg_attribute parent_col
      ON parent_col.attrelid = parent.oid
     AND parent_col.attnum = fk2.attnum
    WHERE c.contype = 'f'
      AND parent_ns.nspname = current_schema()
      AND parent.relname = 'staff_users'
      AND parent_col.attname = 'id'
  LOOP
    IF fk.is_not_null THEN
      RAISE EXCEPTION
        'ลบไม่ได้: %.% คอลัมน์ % ของ constraint % เป็น NOT NULL',
        fk.child_schema, fk.child_table, fk.child_column, fk.conname;
    END IF;

    EXECUTE format(
      'UPDATE %I.%I SET %I = NULL WHERE %I IN (SELECT id FROM target_staff_users)',
      fk.child_schema,
      fk.child_table,
      fk.child_column,
      fk.child_column
    );
  END LOOP;
END
$$;

DELETE FROM staff_users
WHERE id IN (SELECT id FROM target_staff_users);

COMMIT;

SELECT username, display_name, role, is_active
FROM staff_users
ORDER BY username;
