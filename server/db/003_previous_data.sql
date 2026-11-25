-- Migration: 003_previous_data.sql
-- Keeps ONE previous copy of every edited record, so we can see what it was before the last change.
--
-- How it works:
--   * The real table always holds the latest data.
--   * previous_data holds the version just before the latest change (one row per record, never more).
--   * Every edit overwrites that record's row here, so this table never grows beyond one row per record.
--   * Soft delete (isdeleted = 'YES') is an edit, so it is saved here too.
--   * Edits that change nothing except alterby/alteredon are ignored (they would wipe the real previous copy).
--
-- To look up what lot id 3 was before its last change:
--   SELECT * FROM previous_data WHERE table_name = 'joborderbooking' AND record_id = 3;
--
-- Apply:  psql -d garmentmfg -f server/db/003_previous_data.sql   (safe to run again)
-- To track a new table, add its name to the list at the bottom and run this file again.

CREATE TABLE IF NOT EXISTS "previous_data" (
    "table_name" varchar(100) NOT NULL,   -- which table the record belongs to
    "record_id"  bigint NOT NULL,         -- the record's id in that table
    "old_data"   jsonb NOT NULL,          -- all columns as they were before the change
    "changed_by" varchar(250),            -- who made the change (alterby of the new row)
    "changed_on" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action"     varchar(10) NOT NULL,    -- UPDATE or DELETE
    PRIMARY KEY ("table_name", "record_id")
);

CREATE OR REPLACE FUNCTION save_previous_data() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Skip edits where nothing real changed
    IF (to_jsonb(OLD) - 'alterby' - 'alteredon') = (to_jsonb(NEW) - 'alterby' - 'alteredon') THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO previous_data (table_name, record_id, old_data, changed_by, changed_on, action)
  VALUES (
    TG_TABLE_NAME,
    OLD.id,
    to_jsonb(OLD),
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(NEW) ->> 'alterby' ELSE current_user END,
    NOW(),
    TG_OP
  )
  ON CONFLICT (table_name, record_id) DO UPDATE SET
    old_data   = EXCLUDED.old_data,
    changed_by = EXCLUDED.changed_by,
    changed_on = EXCLUDED.changed_on,
    action     = EXCLUDED.action;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to every table we want to track.
-- (login is left out on purpose so password hashes are never copied.)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'brandmaster', 'colormaster', 'company', 'dailyattandance', 'dailyentry', 'godown',
    'joborder_operations', 'joborderbooking', 'joborderprocess', 'ledaddress', 'ledger',
    'ledgergroup', 'material_issue', 'monthentrydetail', 'monthentryheader',
    'operationmappingheader', 'operationrate', 'operatormaster', 'orderdetails', 'product',
    'stkcategory', 'stkgroupmaster', 'stockopening', 'unit'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_previous_data ON %I;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_previous_data AFTER UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION save_previous_data();', t);
  END LOOP;
END;
$$;
