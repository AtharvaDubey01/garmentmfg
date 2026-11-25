-- Migration: 005_users_rights.sql
-- Logins belong to employees, and each login has its own rights.
--
--   login.empid    = the employee (operatormaster.id). Username = that employee's code.
--   login.password = plain text, visible to admins on Admin > Create Login (single company, kept simple on purpose)
--   login.isadmin  = 'YES' / 'NO'. Admins can do everything and manage logins.
--   login.isactive = 'YES' / 'NO'. Inactive logins can't log in (e.g. the person left).
--   login.rights   = what this person may do, e.g.
--                    {"masters.employee": ["view","create","edit"], "transactions.lotMap": ["view","changeRates"]}
--                    Screen keys and actions are listed in server/src/permissions.js.
--
-- Also creates the first admin: employee "Admin" (code ADMIN) in group "Office Staff",
-- and turns the old admin@gmail.com login into username ADMIN, password Admin.
-- The other old e-mail test logins are removed (usernames are employee codes now).
--
-- Apply:  psql -d garmentmfg -f server/db/005_users_rights.sql   (safe to run again)

ALTER TABLE login ADD COLUMN IF NOT EXISTS empid bigint;
ALTER TABLE login ADD COLUMN IF NOT EXISTS isadmin varchar(3) NOT NULL DEFAULT 'NO';
ALTER TABLE login ADD COLUMN IF NOT EXISTS isactive varchar(3) NOT NULL DEFAULT 'YES';
ALTER TABLE login ADD COLUMN IF NOT EXISTS rights jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS idx_login_empid ON login(empid);

-- Group for office staff (people who don't work on the line)
INSERT INTO ledgergroup (ledgrpname, isdeleted, enterby, createdon)
SELECT 'Office Staff', 'NO', 'setup', NOW()
WHERE NOT EXISTS (SELECT 1 FROM ledgergroup WHERE LOWER(TRIM(ledgrpname)) = 'office staff' AND TRIM(isdeleted) = 'NO');

-- The first admin employee
INSERT INTO operatormaster (operatorname, empcode, empgrp, contactno, isdeleted, enterby, createdon)
SELECT 'Admin', 'ADMIN',
       (SELECT id FROM ledgergroup WHERE LOWER(TRIM(ledgrpname)) = 'office staff' AND TRIM(isdeleted) = 'NO' ORDER BY id LIMIT 1),
       '0000000000', 'NO', 'setup', NOW()
WHERE NOT EXISTS (SELECT 1 FROM operatormaster WHERE UPPER(TRIM(empcode)) = 'ADMIN' AND TRIM(isdeleted) = 'NO');

-- Old admin@gmail.com login -> ADMIN / Admin
UPDATE login SET
  empid = (SELECT id FROM operatormaster WHERE UPPER(TRIM(empcode)) = 'ADMIN' AND TRIM(isdeleted) = 'NO' ORDER BY id LIMIT 1),
  loginid = 'ADMIN',
  password = 'Admin',
  isadmin = 'YES',
  isactive = 'YES'
WHERE LOWER(loginid) = 'admin@gmail.com';

-- If there was no admin@gmail.com login, still make sure an ADMIN login exists
INSERT INTO login (loginid, password, role, empid, isadmin, isactive)
SELECT 'ADMIN', 'Admin', 'admin',
       (SELECT id FROM operatormaster WHERE UPPER(TRIM(empcode)) = 'ADMIN' AND TRIM(isdeleted) = 'NO' ORDER BY id LIMIT 1),
       'YES', 'YES'
WHERE NOT EXISTS (SELECT 1 FROM login WHERE isadmin = 'YES' AND empid IS NOT NULL);

-- Old e-mail logins that aren't linked to an employee
DELETE FROM login WHERE empid IS NULL;
