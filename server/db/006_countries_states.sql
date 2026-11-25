-- Migration: 006_countries_states.sql
-- Starting data every installation needs: the country and its states (used on the Company screen).
-- Adds only what is missing, so it is safe to run again.

INSERT INTO country (country) SELECT 'India' WHERE NOT EXISTS (SELECT 1 FROM country WHERE country = 'India');

INSERT INTO statemaster (statename)
SELECT s FROM (VALUES
  ('Andhra Pradesh'),
  ('Arunachal Pradesh'),
  ('Assam'),
  ('Bihar'),
  ('Chhattisgarh'),
  ('Goa'),
  ('Gujarat'),
  ('Haryana'),
  ('Himachal Pradesh'),
  ('Jharkhand'),
  ('Karnataka'),
  ('Kerala'),
  ('Madhya Pradesh'),
  ('Maharashtra'),
  ('Manipur'),
  ('Meghalaya'),
  ('Mizoram'),
  ('Nagaland'),
  ('Odisha'),
  ('Punjab'),
  ('Rajasthan'),
  ('Sikkim'),
  ('Tamil Nadu'),
  ('Telangana'),
  ('Tripura'),
  ('Uttar Pradesh'),
  ('Uttarakhand'),
  ('West Bengal'),
  ('Andaman and Nicobar Islands'),
  ('Chandigarh'),
  ('Dadra and Nagar Haveli and Daman and Diu'),
  ('Delhi'),
  ('Jammu and Kashmir'),
  ('Ladakh'),
  ('Lakshadweep'),
  ('Puducherry')
) AS v(s)
WHERE NOT EXISTS (SELECT 1 FROM statemaster m WHERE m.statename = v.s);
