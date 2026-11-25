-- Company Branding: the name and logo each company sees on the login page, the menu, the home page,
-- printed Job Orders / Lot Operation sheets and report exports. Set in Admin > Company Branding.
-- One row only (id = 1). No name / no logo = the app shows its own name and logo (GarmentMFG).
-- It lives in the database, so it is part of every backup and moves with an import.

CREATE TABLE IF NOT EXISTS app_branding (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    company_name varchar(200) NOT NULL DEFAULT '',
    logo bytea,                 -- the picture (PNG or JPG)
    logo_type varchar(20),      -- 'image/png' or 'image/jpeg'
    updated_on timestamp NOT NULL DEFAULT NOW(),
    updated_by varchar(50)
);

INSERT INTO app_branding (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
