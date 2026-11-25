-- Removes only the QA test data created by scripts/test-production-flow.mjs
-- Run: psql -d garmentmfg -f scripts/test-production-flow-cleanup.sql
BEGIN;
CREATE TEMP TABLE qa_jo AS SELECT id FROM joborderbooking WHERE joborderno ILIKE 'QA/%' OR fabriclotno ILIKE 'QA-%';
CREATE TEMP TABLE qa_map AS SELECT id FROM operationmappingheader WHERE lotno ILIKE 'QA-%';
CREATE TEMP TABLE qa_emp AS SELECT id FROM operatormaster WHERE empcode ILIKE 'QA-W%';
CREATE TEMP TABLE qa_hdr AS SELECT id FROM monthentryheader WHERE empid IN (SELECT id FROM qa_emp);
DELETE FROM monthentrydetail WHERE headerid IN (SELECT id FROM qa_hdr) OR lotno ILIKE 'QA-%';
DELETE FROM dailyattandance WHERE empcode IN (SELECT id FROM qa_emp);
DELETE FROM monthentryheader WHERE id IN (SELECT id FROM qa_hdr);
DELETE FROM material_issue WHERE lotno ILIKE 'QA-%' OR joborderid IN (SELECT id FROM qa_jo);
DELETE FROM joborder_operations WHERE joborderid IN (SELECT id FROM qa_map) OR batchname ILIKE 'QA-%';
DELETE FROM operationmappingheader WHERE id IN (SELECT id FROM qa_map);
DELETE FROM joborderbooking WHERE id IN (SELECT id FROM qa_jo);
DELETE FROM login WHERE empid IN (SELECT id FROM qa_emp);
DELETE FROM operatormaster WHERE id IN (SELECT id FROM qa_emp);
DELETE FROM ledgergroup WHERE ledgrpname ILIKE 'QA %';
DELETE FROM operationrate WHERE operations ILIKE 'QA %';
DELETE FROM stkcategory WHERE stkcategoryname ILIKE 'QA %';
DELETE FROM product WHERE stockitemname ILIKE 'QA %';
DELETE FROM unit WHERE unitname ILIKE 'QA %';
DELETE FROM stkgroupmaster WHERE stkgrpname ILIKE 'QA %';
DELETE FROM company WHERE compname ILIKE 'QA %';
-- previous_data rows for records that no longer exist
DELETE FROM previous_data p WHERE NOT EXISTS (
  SELECT 1 FROM (
    SELECT 'material_issue' t, id FROM material_issue UNION ALL
    SELECT 'monthentrydetail', id FROM monthentrydetail UNION ALL
    SELECT 'monthentryheader', id FROM monthentryheader UNION ALL
    SELECT 'joborder_operations', id FROM joborder_operations UNION ALL
    SELECT 'operationmappingheader', id FROM operationmappingheader UNION ALL
    SELECT 'joborderbooking', id FROM joborderbooking UNION ALL
    SELECT 'operatormaster', id FROM operatormaster UNION ALL
    SELECT 'dailyattandance', id FROM dailyattandance UNION ALL
    SELECT 'ledgergroup', id FROM ledgergroup UNION ALL
    SELECT 'operationrate', id FROM operationrate UNION ALL
    SELECT 'stkcategory', id FROM stkcategory UNION ALL
    SELECT 'product', id FROM product UNION ALL
    SELECT 'unit', id FROM unit UNION ALL
    SELECT 'stkgroupmaster', id FROM stkgroupmaster UNION ALL
    SELECT 'company', id FROM company
  ) live WHERE live.t = p.table_name AND live.id = p.record_id
) AND p.table_name IN ('material_issue','monthentrydetail','monthentryheader','joborder_operations',
  'operationmappingheader','joborderbooking','operatormaster','dailyattandance','ledgergroup','operationrate','stkcategory','product','unit','stkgroupmaster','company');
COMMIT;
