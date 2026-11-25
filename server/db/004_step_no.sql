-- Migration: 004_step_no.sql
-- Adds "Step No." to each operation mapped to a lot (Lot Operation Map screen).
-- Step No. is the order the lot moves through its operations: 1, then 2, then 3...
-- Material Issue uses it to know which step comes before which.
--
-- Apply:  psql -d garmentmfg -f server/db/004_step_no.sql   (safe to run again)

ALTER TABLE joborder_operations ADD COLUMN IF NOT EXISTS stepno integer;

-- Give existing active rows a step number in the order they were added (1, 2, 3... per lot).
-- Only fills rows that don't have one yet.
UPDATE joborder_operations o
SET stepno = s.n
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY joborderid ORDER BY id) AS n
  FROM joborder_operations
  WHERE isdeleted = 'NO'
) s
WHERE o.id = s.id AND o.stepno IS NULL;
