-- Removes only the simulated data made by scripts/simulate-real-data.mjs
-- (job orders "SIM/...", lots 201-208, workers "SIM01".."SIM13", operations with code "SIM..")
-- Run: psql -d garmentmfg -f scripts/simulate-real-data-cleanup.sql
BEGIN;
CREATE TEMP TABLE sim_lots AS SELECT fabriclotno AS lotno FROM joborderbooking WHERE joborderno LIKE 'SIM/%';
CREATE TEMP TABLE sim_emp AS SELECT id FROM operatormaster WHERE empcode LIKE 'SIM%';
CREATE TEMP TABLE sim_hdr AS SELECT id FROM monthentryheader WHERE empid IN (SELECT id FROM sim_emp);
DELETE FROM monthentrydetail WHERE headerid IN (SELECT id FROM sim_hdr) OR TRIM(lotno) IN (SELECT lotno FROM sim_lots);
DELETE FROM dailyattandance WHERE empcode IN (SELECT id FROM sim_emp);
DELETE FROM monthentryheader WHERE id IN (SELECT id FROM sim_hdr);
DELETE FROM material_issue WHERE TRIM(lotno) IN (SELECT lotno FROM sim_lots);
DELETE FROM joborder_operations WHERE TRIM(batchname) IN (SELECT lotno FROM sim_lots);
DELETE FROM operationmappingheader WHERE TRIM(lotno) IN (SELECT lotno FROM sim_lots);
DELETE FROM joborderbooking WHERE joborderno LIKE 'SIM/%';
DELETE FROM login WHERE empid IN (SELECT id FROM sim_emp);
DELETE FROM operatormaster WHERE id IN (SELECT id FROM sim_emp);
DELETE FROM operationrate WHERE opcode LIKE 'SIM%';
-- history rows (previous_data) of records that no longer exist
DELETE FROM previous_data p WHERE p.table_name IN ('material_issue','monthentrydetail','monthentryheader','joborder_operations',
  'operationmappingheader','joborderbooking','operatormaster','dailyattandance','operationrate')
AND NOT EXISTS (
  SELECT 1 FROM (
    SELECT 'material_issue' t, id FROM material_issue UNION ALL
    SELECT 'monthentrydetail', id FROM monthentrydetail UNION ALL
    SELECT 'monthentryheader', id FROM monthentryheader UNION ALL
    SELECT 'joborder_operations', id FROM joborder_operations UNION ALL
    SELECT 'operationmappingheader', id FROM operationmappingheader UNION ALL
    SELECT 'joborderbooking', id FROM joborderbooking UNION ALL
    SELECT 'operatormaster', id FROM operatormaster UNION ALL
    SELECT 'dailyattandance', id FROM dailyattandance UNION ALL
    SELECT 'operationrate', id FROM operationrate
  ) live WHERE live.t = p.table_name AND live.id = p.record_id);
COMMIT;
