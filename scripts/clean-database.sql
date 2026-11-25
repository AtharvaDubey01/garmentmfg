-- !! WIPES ALL WORK DATA !!  A fresh, empty start for the app (e.g. before handing it over).
-- Keeps only: countries, states, the two permanent logins (ADMIN and the hidden KANVTECH support
-- login) with their employee records and their group ("Office Staff").
-- Everything else is removed (and Company Branding goes back to the default): companies, employee groups, employees, units, product groups, products,
-- departments (Process Master), operations, job orders, lot maps, daily entries, material issue,
-- attendance, change history. New records start again from ID 1.
-- Take a backup first:  pg_dump -d garmentmfg --clean --if-exists -f <backup file>.sql
-- Run:                   psql -d garmentmfg -f scripts/clean-database.sql
BEGIN;

-- 1. Work and transactions
DELETE FROM material_issue;
DELETE FROM monthentrydetail;
DELETE FROM monthentryheader;
DELETE FROM dailyattandance;
DELETE FROM dailyentry;
DELETE FROM joborder_operations;
DELETE FROM operationmappingheader;
DELETE FROM joborderprocess;
DELETE FROM orderdetails;
DELETE FROM stockopening;
DELETE FROM joborderbooking;

-- 2. Masters
DELETE FROM operationrate;
DELETE FROM product;
DELETE FROM stkgroupmaster;
DELETE FROM stkcategory;
DELETE FROM unit;
DELETE FROM company;
-- company name + logo back to the app's own (GarmentMFG); the table exists from set-up file 008
UPDATE app_branding SET company_name = '', logo = NULL, logo_type = NULL, updated_on = NOW(), updated_by = NULL;
DELETE FROM ledaddress;
DELETE FROM ledger;
DELETE FROM godown;
DELETE FROM brandmaster;
DELETE FROM colormaster;

-- 3. People: keep only the permanent logins (ADMIN, KANVTECH), their employees and their group
DELETE FROM login WHERE permanent <> 'YES';
DELETE FROM operatormaster WHERE id NOT IN (SELECT empid FROM login WHERE permanent = 'YES');
DELETE FROM ledgergroup WHERE id NOT IN (
  SELECT o.empgrp FROM operatormaster o JOIN login l ON l.empid = o.id WHERE l.permanent = 'YES'
);

-- 4. Change history last: the history trigger writes a row for each record deleted above
DELETE FROM previous_data;

-- 5. Number new records from where the kept rows end (empty tables start at 1)
DO $$
DECLARE
  t record;
  seq text;
  top bigint;
BEGIN
  FOR t IN SELECT c.table_name FROM information_schema.columns c
           JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
           WHERE c.table_schema = 'public' AND c.column_name = 'id' AND tb.table_type = 'BASE TABLE'
  LOOP
    seq := pg_get_serial_sequence(quote_ident(t.table_name), 'id');
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM %I', t.table_name) INTO top;
      PERFORM setval(seq, top + 1, false);
    END IF;
  END LOOP;
END $$;

COMMIT;
