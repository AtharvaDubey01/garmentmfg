// Creates a small, made-up data set for testing Daily Process Entry (development database, API on :6061).
// Run once with the app running:  node scripts/seed-daily-entry-test-data.mjs
// Uses the same API as the screens, so every record goes through the app's normal checks.
// Reuses existing Group A / Group B and the existing processes (Cutting, Stiching, kaj button, Pressing).
const API = 'http://localhost:6061/api';
let cookie = '';

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} failed: ${json?.message || res.status}`);
  return json;
}
const log = (s) => console.log('  ' + s);

// --- login
{
  const res = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ADMIN', password: 'Admin' }),
  });
  cookie = res.headers.get('set-cookie').split(';')[0];
}

// --- look up existing groups and processes by name
const groups = await call('GET', '/masters/employee-groups');
const groupId = (name) => {
  const g = groups.find((x) => x.ledgrpname === name);
  if (!g) throw new Error(`Group "${name}" not found`);
  return g.id;
};
const processes = await call('GET', '/masters/process-masters');
const processId = (name) => {
  const p = processes.find((x) => x.stkcategoryname === name);
  if (!p) throw new Error(`Process "${name}" not found`);
  return p.id;
};

console.log('Employees');
const employees = [
  ['Akhilesh', '101', 'Group A'],
  ['Anuj', '102', 'Group A'],
  ['Ramesh', '103', 'Group A'],
  ['Suresh', '104', 'Group A'],
  ['Mohan', '105', 'Group B'],
  ['Outside Work', '106', 'Group B'],
];
for (const [name, code, grp] of employees) {
  await call('POST', '/masters/employees', {
    operatorname: name, empcode: code, empgrp: groupId(grp), contactno: `90000001${code}`,
  });
  log(`${name} (code ${code}, ${grp})`);
}

console.log('Product');
await call('POST', '/masters/products', { stockitemname: 'Mens Formal Shirt', stockgroup: 3, unit: 1, stkcode: 'MFS-01' });
const product = (await call('GET', '/masters/products')).find((p) => p.stockitemname === 'Mens Formal Shirt');
log('Mens Formal Shirt');

console.log('Operations');
const opDefs = [
  // name, code, rate, process
  ['Shirt Cut', '11', 4, 'Cutting'],
  ['Side Taki U', '12', 55, 'Stiching'],
  ['Sleeve Bottom', '13', 55, 'Stiching'],
  ['Cuff Making', '14', 70, 'Stiching'],
  ['Kaj Button', '15', 6, 'kaj button'],
  ['Final Press', '16', 8, 'Pressing'],
];
for (const [name, code, rate, proc] of opDefs) {
  await call('POST', '/masters/operations', { operations: name, opcode: code, oprate: rate, processid: processId(proc) });
  log(`${name} (${proc}) ₹${rate}`);
}
const allOps = await call('GET', '/masters/operations');
const op = (name) => {
  const def = opDefs.find((d) => d[0] === name);
  const row = allOps.find((o) => o.operations === name);
  return { operations: row.id, processid: processId(def[3]), rate: def[2] };
};

console.log('Job orders and lots');
const jobOrder = (joborderno, lot, total, cut) => ({
  joborderno, joborderdate: '2026-10-24', customerid: product.id, style: 'MFS-WHITE',
  custdtl: 'Daman Garments', custorderno: `PO-${joborderno.split('/')[1]}`, custorderdate: '2026-10-20',
  totalqtypcs: total, fabriclotno: lot, cutqty: cut,
});
const lots = {};
for (const [jo, lot, total, cut] of [
  ['SHIRT/101', '40', 300, 200],
  ['SHIRT/101', '45', 300, 100],
  ['SHIRT/102', '50', 150, 150],
]) {
  lots[lot] = (await call('POST', '/transactions/job-orders', jobOrder(jo, lot, total, cut))).id;
  log(`${jo}  lot ${lot}  cut ${cut} of ${total}`);
}

console.log('Lot Operation Map');
const maps = {
  40: [[1, 'Shirt Cut'], [2, 'Side Taki U'], [3, 'Sleeve Bottom'], [4, 'Kaj Button'], [5, 'Final Press']],
  45: [[1, 'Shirt Cut'], [2, 'Cuff Making'], [3, 'Side Taki U'], [4, 'Kaj Button'], [5, 'Final Press']],
  50: [[10, 'Shirt Cut'], [20, 'Side Taki U'], [30, 'Cuff Making'], [40, 'Final Press']],
};
for (const [lot, steps] of Object.entries(maps)) {
  const d = await call('GET', `/transactions/lot-operations/lot-details/${lots[lot]}`);
  await call('POST', '/transactions/lot-operations', {
    lotno: lot, custdtl: d.custdtl, joborderno: d.joborderno, joborderdate: d.joborderdate,
    style: d.style, orderqty: d.totalqtypcs, custorderno: d.custorderno, custorderdt: d.custorderdate,
    prodname: d.stockitemname, proddtl: d.fabricdtls,
    operations: steps.map(([stepno, name]) => ({ stepno, ...op(name) })),
  });
  log(`lot ${lot}: ${steps.map(([s, n]) => `${s} ${n}`).join(' > ')}`);
}

console.log('\nDone.');
