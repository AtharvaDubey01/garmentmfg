// Test: the two permanent logins (ADMIN, hidden KANVTECH support login) and backups.
// Run: node scripts/test-logins-and-backups.mjs <KANVTECH password>     (app must be running)
// Set the KANVTECH password first with: node server/tools/garmentmfg-support.js set-support-password
// Everything it changes is put back; the temporary "QA-LB" employee/login is removed at the end.
const API = process.env.GARMENTMFG_API || 'http://127.0.0.1:6061/api'; // 127.0.0.1: "localhost" lookups are slow on some Macs
const SUPPORT_PASSWORD = process.argv[2];
if (!SUPPORT_PASSWORD) { console.log('Give the KANVTECH password: node scripts/test-logins-and-backups.mjs <password>'); process.exit(1); }

let pass = 0, fail = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}   ${detail}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);

async function login(username, password) {
  const res = await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, cookie: res.headers.get('set-cookie')?.split(';')[0], json };
}
const as = (cookie) => async (method, path, body) => {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  const type = res.headers.get('content-type') || '';
  if (type.includes('json')) { try { json = await res.json(); } catch {} }
  return { status: res.status, ok: res.ok, json, res };
};
const msg = (r) => r.json?.message || JSON.stringify(r.json);

// ------------------------------------------------------------------
section('1. Logging in');
const adminLogin = await login('ADMIN', 'Admin');
check('ADMIN logs in', adminLogin.status === 200);
const admin = as(adminLogin.cookie);
const sup = await login('kanvtech', SUPPORT_PASSWORD);
check('KANVTECH logs in with its password (code in any case)', sup.status === 200 && sup.json?.user?.isAdmin === true, JSON.stringify(sup.json));
const support = as(sup.cookie);
check('KANVTECH with a wrong password is refused', (await login('KANVTECH', 'wrong-password')).status === 401);
check('KANVTECH with an empty password is refused', (await login('KANVTECH', '')).status === 400);

// ------------------------------------------------------------------
section('2. KANVTECH is invisible in the app (seen as ADMIN and as itself)');
for (const [who, call] of [['ADMIN', admin], ['KANVTECH', support]]) {
  const logins = (await call('GET', '/admin/logins')).json;
  check(`${who}: Create Login list has no KANVTECH`, Array.isArray(logins) && !logins.some((l) => /kanvtech/i.test(l.empcode)));
  const emps = (await call('GET', '/masters/employees')).json;
  check(`${who}: Employee list has no "Kanvtech Support"`, Array.isArray(emps) && !emps.some((e) => /kanvtech/i.test(e.empcode)));
  const noLogin = (await call('GET', '/admin/employees-without-login')).json;
  check(`${who}: "New Login" employee dropdown has no KANVTECH`, !noLogin.some((e) => /kanvtech/i.test(e.empcode)));
}
const groups = (await admin('GET', '/masters/employee-groups')).json;
const office = groups.find((g) => g.ledgrpname === 'Office Staff');
const inGroup = (await admin('GET', `/transactions/daily-entry/operators-by-group/${office.id}`)).json;
check('Daily Process Entry employee dropdown (Office Staff) has no KANVTECH', !inGroup.some((e) => /kanvtech/i.test(e.empcode)));
// find the hidden ids the hard way: try ids next to ADMIN's
const adminRow = (await admin('GET', '/admin/logins')).json.find((l) => l.empcode === 'ADMIN');
let probes = 0, leaked = [];
for (let id = 1; id <= Number(adminRow.id) + 50; id++) {
  const l = await admin('GET', `/admin/logins/${id}`);
  if (l.ok && /kanvtech/i.test(l.json.empcode)) leaked.push(`login ${id}`);
  probes++;
}
for (let id = 1; id <= Number(adminRow.empid) + 50; id++) {
  const e = await admin('GET', `/masters/employees/${id}`);
  if (e.ok && /kanvtech/i.test(e.json.empcode)) leaked.push(`employee ${id}`);
}
check(`opening logins / employees one by one never shows KANVTECH (${probes} ids tried)`, leaked.length === 0, leaked.join(', '));

// ------------------------------------------------------------------
section('3. KANVTECH can not be changed or removed from the app');
const me = (await support('GET', '/auth/me')).json.user;
let r = await admin('PUT', `/admin/logins/${me.id}`, { password: 'x', isadmin: 'NO', isactive: 'NO', rights: {} });
check('ADMIN editing the KANVTECH login: "not found"', r.status === 404, msg(r));
r = await admin('DELETE', `/admin/logins/${me.id}`);
check('ADMIN deleting the KANVTECH login: "not found"', r.status === 404, msg(r));
r = await admin('PUT', `/masters/employees/${me.empid}`, { operatorname: 'X', empcode: 'X', empgrp: office.id, contactno: '1' });
check('ADMIN editing the KANVTECH employee: "not found"', r.status === 404, msg(r));
r = await admin('DELETE', `/masters/employees/${me.empid}`);
check('ADMIN deleting the KANVTECH employee: "not found"', r.status === 404, msg(r));
check('KANVTECH still logs in afterwards', (await login('KANVTECH', SUPPORT_PASSWORD)).status === 200);

// ------------------------------------------------------------------
section('4. ADMIN is permanent (password can change)');
const adminLoginRow = (await admin('GET', `/admin/logins/${adminRow.id}`)).json;
const put = (call, body) => call('PUT', `/admin/logins/${adminRow.id}`, { password: adminLoginRow.password, isadmin: 'YES', isactive: 'YES', rights: {}, ...body });
r = await put(support, { isactive: 'NO' });
check('even KANVTECH can not deactivate ADMIN', r.status === 400 && /permanent/.test(msg(r)), msg(r));
r = await put(support, { isadmin: 'NO' });
check('even KANVTECH can not take admin away from ADMIN', r.status === 400 && /permanent/.test(msg(r)), msg(r));
r = await support('DELETE', `/admin/logins/${adminRow.id}`);
check('even KANVTECH can not delete the ADMIN login', r.status === 400 && /permanent/.test(msg(r)), msg(r));
r = await support('DELETE', `/masters/employees/${adminRow.empid}`);
check('ADMIN employee can not be deleted', r.status === 400 && /permanent/.test(msg(r)), msg(r));
const adminEmp = (await admin('GET', `/masters/employees/${adminRow.empid}`)).json;
r = await admin('PUT', `/masters/employees/${adminRow.empid}`, { ...adminEmp, empcode: 'BOSS' });
check("ADMIN's Employee Code (its username) can not be changed", r.status === 400 && /username/.test(msg(r)), msg(r));
r = await admin('PUT', `/masters/employees/${adminRow.empid}`, { ...adminEmp, operatorname: 'Admin Renamed' });
check("ADMIN's name can be changed", r.ok, msg(r));
await admin('PUT', `/masters/employees/${adminRow.empid}`, adminEmp);
r = await put(support, { password: 'TempAdmin1' });
check('KANVTECH can reset a forgotten ADMIN password', r.ok && (await login('ADMIN', 'TempAdmin1')).status === 200, msg(r));
r = await put(as((await login('ADMIN', 'TempAdmin1')).cookie), { password: adminLoginRow.password });
check('ADMIN can change its own password (set back)', r.ok && (await login('ADMIN', adminLoginRow.password)).status === 200, msg(r));

// ------------------------------------------------------------------
section('5. Backups (Admin > Backups)');
const before = (await admin('GET', '/admin/backups')).json;
check('backup list loads', Array.isArray(before));
r = await admin('POST', '/admin/backups');
check('"Back up now" makes a backup', r.status === 201 && /^garmentmfg-backup-\d{4}-\d{2}-\d{2}_\d{6}(-\d+)?\.backup$/.test(r.json?.name || ''), msg(r));
const made = r.json;
const after = (await admin('GET', '/admin/backups')).json;
check('new backup is first in the list', after[0]?.name === made.name);
const dl = await admin('GET', `/admin/backups/${made.name}/download`);
const bytes = Buffer.from(await dl.res.arrayBuffer());
check(`download gives the whole file (${bytes.length} bytes)`, dl.status === 200 && bytes.length === made.size && bytes.subarray(0, 5).toString() === 'PGDMP');
r = await admin('GET', '/admin/backups/..%2F..%2F.env/download');
check('download of anything else (e.g. ../../.env) is refused', r.status === 404);
r = await admin('GET', '/admin/backups/not-a-backup.backup/download');
check('unknown backup name: not found', r.status === 404);

// a non-admin login can not see or make backups
const grp = (await admin('GET', '/masters/employee-groups')).json[0];
await admin('POST', '/masters/employees', { operatorname: 'QA LB Clerk', empcode: 'QA-LB', empgrp: grp.id, contactno: '9000001234' });
const clerkEmp = (await admin('GET', '/masters/employees')).json.find((e) => e.empcode === 'QA-LB');
const made2 = await admin('POST', '/admin/logins', { empid: clerkEmp.id, password: 'clerk1', isadmin: false, isactive: true, rights: { 'reports.salary': ['view', 'print'] } });
const clerk = as((await login('QA-LB', 'clerk1')).cookie);
check('non-admin: backup list refused', (await clerk('GET', '/admin/backups')).status === 403);
check('non-admin: "Back up now" refused', (await clerk('POST', '/admin/backups')).status === 403);
check('non-admin: download refused', (await clerk('GET', `/admin/backups/${made.name}/download`)).status === 403);

// ------------------------------------------------------------------
section('Company Branding (name + logo)');
const pub = async (path) => fetch(API + path); // no login
const brand = async () => (await pub('/branding')).json();
// what is set now, so it is put back at the end
const b0 = await brand();
let logo0 = null;
if (b0.hasLogo) {
  const r0 = await pub('/branding/logo');
  logo0 = `data:${r0.headers.get('content-type')};base64,${Buffer.from(await r0.arrayBuffer()).toString('base64')}`;
}
check('branding can be read without a login (the login page needs it)', typeof b0.companyName === 'string' && typeof b0.hasLogo === 'boolean');
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const putBrand = (who, body) => who('PUT', '/admin/branding', body);
check('saving branding without a login is refused', (await as('')('PUT', '/admin/branding', { companyName: 'X' })).status === 401);
check('non-admin can not change branding', (await putBrand(clerk, { companyName: 'X' })).status === 403);
r = await putBrand(admin, { companyName: 'QA Branding Co', logo: `data:image/png;base64,${PNG_1PX}` });
const b1 = await brand();
check('admin saves a company name + PNG logo', r.ok && b1.companyName === 'QA Branding Co' && b1.hasLogo, msg(r));
check('the version changes on every save (pictures are not stale)', b1.version !== b0.version);
const logoRes = await pub('/branding/logo');
const logoBytes = Buffer.from(await logoRes.arrayBuffer());
check('the logo is served as the same PNG, without a login', logoRes.status === 200 && logoRes.headers.get('content-type') === 'image/png' && logoBytes.equals(Buffer.from(PNG_1PX, 'base64')));
r = await putBrand(admin, { companyName: 'QA Branding Co 2' });
check('changing only the name keeps the logo', r.ok && (await brand()).hasLogo && (await brand()).companyName === 'QA Branding Co 2', msg(r));
r = await putBrand(admin, { companyName: 'X', logo: `data:image/png;base64,${Buffer.from('not a picture').toString('base64')}` });
check('a file that only pretends to be a PNG is refused', r.status === 400 && /PNG or JPG/.test(msg(r)), msg(r));
r = await putBrand(admin, { companyName: 'X', logo: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
check('other picture types (GIF, SVG...) are refused', r.status === 400, msg(r));
const big = Buffer.alloc(1024 * 1024 + 10); Buffer.from(PNG_1PX, 'base64').copy(big);
r = await putBrand(admin, { companyName: 'X', logo: `data:image/png;base64,${big.toString('base64')}` });
check('a logo over 1 MB is refused', r.status === 400 && /too big/.test(msg(r)), msg(r));
r = await putBrand(admin, { companyName: 'X', logo: `data:image/png;base64,${'A'.repeat(4 * 1024 * 1024)}` });
check('an upload over 3 MB is refused before it is read', r.status === 413);
r = await putBrand(admin, { companyName: 'x'.repeat(201) });
check('a company name over 200 characters is refused', r.status === 400, msg(r));
check('after the refused tries, the saved branding is unchanged', (await brand()).companyName === 'QA Branding Co 2' && (await brand()).hasLogo);
r = await putBrand(admin, { companyName: '', logo: null });
const b2 = await brand();
check('"use the default": no name, no logo -> the app shows GarmentMFG', r.ok && b2.companyName === '' && !b2.hasLogo && (await pub('/branding/logo')).status === 404, msg(r));
r = await putBrand(admin, { companyName: b0.companyName, logo: logo0 });
const b3 = await brand();
check('branding put back as it was', r.ok && b3.companyName === b0.companyName && b3.hasLogo === b0.hasLogo, msg(r));

await admin('DELETE', `/admin/logins/${made2.json?.id}`);
await admin('DELETE', `/masters/employees/${clerkEmp.id}`);
check('temporary QA-LB clerk removed', !(await admin('GET', '/masters/employees')).json.some((e) => e.empcode === 'QA-LB'));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (failures.length) console.log('Failed:\n  ' + failures.join('\n  '));
process.exit(fail ? 1 : 0);
