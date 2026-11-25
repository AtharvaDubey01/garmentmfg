// Full production-flow test for GarmentMFG (API on :6061), one section per part of the app:
//   Masters -> Job Order Booking -> Lot Operation Map -> Daily Process Entry -> Monthly grid totals
//   -> Material Issue (only finished pieces move) -> locks -> second lot
// Run:   node scripts/test-production-flow.mjs              (app must be running; creates QA* data)
// Clean: psql -d garmentmfg -f scripts/test-production-flow-cleanup.sql
// Uses the same API as the screens. Prints PASS/FAIL for every check and a summary at the end.
const API = process.env.GARMENTMFG_API || 'http://127.0.0.1:6061/api'; // 127.0.0.1: "localhost" lookups are slow on some Macs
let cookie = '';
let pass = 0, fail = 0;
const failures = [];

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, ok: res.ok, json };
}
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}  ${detail}`); }
}
const msg = (r) => (r.json && r.json.message) || JSON.stringify(r.json);
const section = (t) => console.log(`\n=== ${t} ===`);

// --- login
{
  const res = await fetch(API + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ADMIN', password: 'Admin' }),
  });
  cookie = res.headers.get('set-cookie').split(';')[0];
}

// ---------------------------------------------------------------------------
section('1. Masters: group, workers, product, processes, operations');
let r = await call('POST', '/masters/employee-groups', { ledgrpname: 'QA Group' });
check('create group "QA Group"', r.ok, msg(r));
const groupId = (await call('GET', '/masters/employee-groups')).json.find((g) => g.ledgrpname === 'QA Group')?.id;
const workerNames = ['QA Worker A', 'QA Worker B', 'QA Worker C', 'QA Outside Work'];
for (const [i, name] of workerNames.entries()) {
  r = await call('POST', '/masters/employees', { operatorname: name, empcode: `QA-W${i + 1}`, empgrp: groupId, contactno: `900000990${i}` });
  check(`create worker "${name}"`, r.ok, msg(r));
}
const emps = (await call('GET', '/masters/employees')).json;
const W = Object.fromEntries(workerNames.map((n) => [n, emps.find((e) => e.operatorname === n)?.id]));
check('all 4 QA workers found', Object.values(W).every(Boolean), JSON.stringify(W));

// its own unit and product group, so the test also works on an empty database
r = await call('POST', '/masters/units', { unitname: 'QA Base Unit', unittype: 'Simple', decimalplaces: 0 });
check('create unit "QA Base Unit"', r.ok, msg(r));
r = await call('POST', '/masters/product-groups', { stkgrpname: 'QA Base Group' });
check('create product group "QA Base Group"', r.ok, msg(r));
const baseUnitId = (await call('GET', '/masters/units')).json.find((u) => u.unitname === 'QA Base Unit')?.id;
const baseGroupId = (await call('GET', '/masters/product-groups')).json.find((g) => g.stkgrpname === 'QA Base Group')?.id;
const prod = await call('POST', '/masters/products', { stockitemname: 'QA Formal Shirt', stockgroup: baseGroupId, unit: baseUnitId, stkcode: 'QA-FS-01' });
check('create product "QA Formal Shirt"', prod.ok, msg(prod));
const productId = (await call('GET', '/masters/products')).json.find((p) => p.stockitemname === 'QA Formal Shirt')?.id;

const processNames = ['QA Cutting', 'QA Stitching', 'QA Kaj Button', 'QA Pressing', 'QA Packing'];
for (const n of processNames) {
  r = await call('POST', '/masters/process-masters', { stkcategoryname: n });
  check(`create process "${n}"`, r.ok, msg(r));
}
r = await call('POST', '/masters/process-masters', { stkcategoryname: 'QA Cutting' });
check('duplicate process is rejected', !r.ok, msg(r));
const procs = (await call('GET', '/masters/process-masters')).json;
const pid = Object.fromEntries(processNames.map((n) => [n, procs.find((p) => p.stkcategoryname === n)?.id]));

const opDefs = [
  ['QA Shirt Cut', 'QA01', 2, 'QA Cutting'],
  ['QA Body Stitch', 'QA02', 6, 'QA Stitching'],
  ['QA Kaj Button', 'QA03', 3, 'QA Kaj Button'],
  ['QA Press', 'QA04', 1, 'QA Pressing'],
  ['QA Pack', 'QA05', 0.5, 'QA Packing'],
];
for (const [name, code, rate, proc] of opDefs) {
  r = await call('POST', '/masters/operations', { operations: name, opcode: code, oprate: rate, processid: pid[proc] });
  check(`create operation "${name}" @ ₹${rate}`, r.ok, msg(r));
}
const allOps = (await call('GET', '/masters/operations')).json;
const oid = Object.fromEntries(opDefs.map(([n]) => [n, allOps.find((o) => o.operations === n)?.id]));

// ---------------------------------------------------------------------------
section('2. Job Order Booking: order of 500, cut in lots');
const jo = (over) => ({
  joborderno: 'QA/JO/001', joborderdate: '2026-10-23', customerid: productId, style: 'QA-STYLE-FS',
  custdtl: 'QA Buyer Pvt Ltd', custorderno: 'PO-QA-77', custorderdate: '2026-10-20', totalqtypcs: 500, ...over,
});
r = await call('POST', '/transactions/job-orders', jo({ fabriclotno: 'QA-L0', cutqty: 600 }));
check('first lot cutting 600 of a 500 order is rejected', !r.ok, msg(r));
r = await call('POST', '/transactions/job-orders', jo({ fabriclotno: 'QA-L0', cutqty: 150.5 }));
check('cut qty 150.5 is rejected (whole pieces only)', !r.ok && /whole number/.test(msg(r)), msg(r));
r = await call('POST', '/transactions/job-orders', jo({ fabriclotno: 'QA-L0', cutqty: -5 }));
check('negative cut qty is rejected', !r.ok, msg(r));
const l1 = await call('POST', '/transactions/job-orders', jo({ fabriclotno: 'QA-L1', cutqty: 300 }));
check('lot QA-L1 cut 300 of 500 saved', l1.ok, msg(l1));
let bal = (await call('GET', '/transactions/job-orders/cut-balance?joborderno=QA/JO/001')).json;
check('balance shows 200 left', bal.balance === 200, JSON.stringify(bal));
r = await call('POST', '/transactions/job-orders', jo({ fabriclotno: 'QA-L2', cutqty: 250, totalqtypcs: 9999 }));
check('lot QA-L2 cutting 250 (only 200 left) is rejected', !r.ok, msg(r));
const l2 = await call('POST', '/transactions/job-orders', jo({ fabriclotno: 'QA-L2', cutqty: 200, totalqtypcs: 9999 }));
check('lot QA-L2 cut 200 saved (exactly the balance)', l2.ok, msg(l2));
let l2row = (await call('GET', `/transactions/job-orders/${l2.json?.id}`)).json;
check('QA-L2 kept the order total 500 (ignored the 9999 sent)', parseFloat(l2row.totalqtypcs) === 500, l2row.totalqtypcs);
r = await call('POST', '/transactions/job-orders', jo({ fabriclotno: 'QA-L3', cutqty: 1 }));
check('third lot is rejected (order fully cut)', !r.ok, msg(r));
r = await call('POST', '/transactions/job-orders', jo({ joborderno: 'QA/JO/002', fabriclotno: 'qa-l1', cutqty: 10 }));
check('duplicate lot no. (different case) is rejected', !r.ok, msg(r));
check('QA/JO/001 appears in the "existing job order" dropdown', (await call('GET', '/transactions/job-orders/unique-nos')).json.includes('QA/JO/001'));

const l1Id = l1.json?.id, l2Id = l2.json?.id;
let l1row = (await call('GET', `/transactions/job-orders/${l1Id}`)).json;
r = await call('PUT', `/transactions/job-orders/${l1Id}`, { ...l1row, cutqty: 350 });
check('editing QA-L1 to cut 350 (would make 550/500) is rejected', !r.ok, msg(r));
r = await call('PUT', `/transactions/job-orders/${l1Id}`, { ...l1row, cutqty: 299.5 });
check('editing QA-L1 cut qty to 299.5 is rejected (whole pieces only)', !r.ok && /whole number/.test(msg(r)), msg(r));
r = await call('PUT', `/transactions/job-orders/${l1Id}`, { ...l1row, cutqty: '300.00' });
check('saving cut qty "300.00" (how the database sends it back) is accepted', r.ok, msg(r));
r = await call('PUT', `/transactions/job-orders/${l1Id}`, { ...l1row, totalqtypcs: 600 });
check('raising order total to 600 on QA-L1 saved', r.ok, msg(r));
l2row = (await call('GET', `/transactions/job-orders/${l2Id}`)).json;
check('QA-L2 order total synced to 600 too', parseFloat(l2row.totalqtypcs) === 600, l2row.totalqtypcs);
r = await call('PUT', `/transactions/job-orders/${l1Id}`, { ...l1row, totalqtypcs: 400 });
check('lowering order total to 400 (below 500 already cut) is rejected', !r.ok, msg(r));
r = await call('PUT', `/transactions/job-orders/${l1Id}`, { ...l1row, totalqtypcs: 500 });
check('setting order total back to 500 saved', r.ok, msg(r));

section('2b. Order details can be fixed until a lot is used, and go to every lot of the order');
l1row = (await call('GET', `/transactions/job-orders/${l1Id}`)).json;
check('QA/JO/001 (2 lots, nothing on them yet) is not in use', l1row.order_in_use === null && l1row.lot_count === 2, `${l1row.order_in_use} / ${l1row.lot_count} lots`);
l2row = (await call('GET', `/transactions/job-orders/${l2Id}`)).json;
r = await call('PUT', `/transactions/job-orders/${l2Id}`, { ...l2row, fabricdtls: '[QA-L2] QA Buyer Pvt Ltd # QA-STYLE-FS # QA Formal Shirt' });
check('QA-L2 product details saved the way the form makes them', r.ok, msg(r));
r = await call('PUT', `/transactions/job-orders/${l1Id}`, { ...l1row, style: 'QA-STYLE-FIX', custdtl: 'QA Buyer Fixed', custorderno: 'PO-QA-78', custorderdate: '2026-10-21', fabricdtls: 'typed by hand' });
check('fixing style, buyer and customer order on QA-L1 (no work yet) saved', r.ok, msg(r));
l2row = (await call('GET', `/transactions/job-orders/${l2Id}`)).json;
check('QA-L2 (same order) got the fixed style, buyer and customer order', l2row.style === 'QA-STYLE-FIX' && l2row.custdtl === 'QA Buyer Fixed' && l2row.custorderno === 'PO-QA-78' && l2row.custorderdate === '2026-10-21', JSON.stringify([l2row.style, l2row.custdtl, l2row.custorderno, l2row.custorderdate]));
check('QA-L2 product details followed the fix', l2row.fabricdtls === '[QA-L2] QA Buyer Fixed # QA-STYLE-FIX # QA Formal Shirt', l2row.fabricdtls);
l1row = (await call('GET', `/transactions/job-orders/${l1Id}`)).json;
check('QA-L1 keeps the product details typed by hand', l1row.fabricdtls === 'typed by hand', l1row.fabricdtls);
r = await call('PUT', `/transactions/job-orders/${l1Id}`, { ...l1row, style: 'QA-STYLE-FS', custdtl: 'QA Buyer Pvt Ltd', custorderno: 'PO-QA-77', custorderdate: '2026-10-20', fabricdtls: '' });
check('order details put back on QA-L1', r.ok, msg(r));
l2row = (await call('GET', `/transactions/job-orders/${l2Id}`)).json;
check('QA-L2 is back too', l2row.style === 'QA-STYLE-FS' && l2row.custdtl === 'QA Buyer Pvt Ltd' && l2row.custorderno === 'PO-QA-77' && l2row.fabricdtls === '[QA-L2] QA Buyer Pvt Ltd # QA-STYLE-FS # QA Formal Shirt', JSON.stringify([l2row.style, l2row.custdtl, l2row.fabricdtls]));
r = await call('PUT', `/transactions/job-orders/${l2Id}`, { ...l2row, fabricdtls: '' });
check('QA-L2 product details cleared again (only Product Details changed)', r.ok, msg(r));

// ---------------------------------------------------------------------------
section('3. Lot Operation Map: steps with gaps');
const lotDetail = (await call('GET', `/transactions/lot-operations/lot-details/${l1Id}`)).json;
const mapHeader = {
  lotno: 'QA-L1', custdtl: lotDetail.custdtl, joborderno: lotDetail.joborderno, joborderdate: lotDetail.joborderdate,
  style: lotDetail.style, orderqty: lotDetail.totalqtypcs, custorderno: lotDetail.custorderno,
  custorderdt: lotDetail.custorderdate, prodname: lotDetail.stockitemname, proddtl: lotDetail.fabricdtls,
};
const row = (step, name) => {
  const d = opDefs.find((o) => o[0] === name);
  return { stepno: step, processid: pid[d[3]], operations: oid[name], rate: d[2] };
};
const l1Ops = [row(10, 'QA Shirt Cut'), row(20, 'QA Body Stitch'), row(30, 'QA Kaj Button'), row(40, 'QA Press'), row(50, 'QA Pack')];
r = await call('POST', '/transactions/lot-operations', { ...mapHeader, operations: [row(10, 'QA Shirt Cut'), row(10, 'QA Body Stitch')] });
check('two operations with Step 10 is rejected', !r.ok, msg(r));
r = await call('POST', '/transactions/lot-operations', { ...mapHeader, operations: [row(10, 'QA Shirt Cut'), row(20, 'QA Shirt Cut')] });
check('same operation twice is rejected', !r.ok, msg(r));
r = await call('POST', '/transactions/lot-operations', { ...mapHeader, operations: [{ ...row(10, 'QA Shirt Cut'), stepno: '' }] });
check('missing Step No. is rejected', !r.ok, msg(r));
const map1 = await call('POST', '/transactions/lot-operations', { ...mapHeader, operations: l1Ops });
check('QA-L1 mapped with steps 10/20/30/40/50', map1.ok, msg(map1));
const map1Id = map1.json?.id;
r = await call('POST', '/transactions/lot-operations', { ...mapHeader, operations: l1Ops });
check('mapping the same lot twice is rejected', !r.ok, msg(r));
const reloaded = (await call('GET', `/transactions/lot-operations/${map1Id}`)).json;
check('reopened map is in step order', reloaded.operations.map((o) => o.stepno).join(',') === '10,20,30,40,50');
l1row = (await call('GET', `/transactions/job-orders/${l1Id}`)).json;
check('once QA-L1 is mapped, QA/JO/001 is in use', /Lot QA-L1 is already used in Lot Operation Map/.test(l1row.order_in_use || ''), l1row.order_in_use);
r = await call('PUT', `/transactions/job-orders/${l1Id}`, { ...l1row, style: 'QA-OTHER' });
check('changing the style once QA-L1 is mapped is rejected', !r.ok && /Style can't be changed/.test(msg(r)), msg(r));
l2row = (await call('GET', `/transactions/job-orders/${l2Id}`)).json;
r = await call('PUT', `/transactions/job-orders/${l2Id}`, { ...l2row, custdtl: 'QA Other Buyer' });
check('...also from QA-L2 (same order, not mapped itself)', !r.ok && /Lot QA-L1/.test(msg(r)), msg(r));
r = await call('PUT', `/transactions/job-orders/${l2Id}`, { ...l2row, totalqtypcs: 600 });
check('changing Total Order Qty once a lot is mapped is rejected', !r.ok && /Total Order Qty can't be changed/.test(msg(r)), msg(r));
r = await call('PUT', `/transactions/job-orders/${l1Id}`, { ...l1row });
check('saving QA-L1 without changing the order details still works', r.ok, msg(r));
r = await call('DELETE', `/transactions/job-orders/${l1Id}`);
check('deleting QA-L1 with only its lot map (no work yet) is rejected', !r.ok && /Lot Operation Map/.test(msg(r)), msg(r));

const map2 = await call('POST', '/transactions/lot-operations', { ...mapHeader, lotno: 'QA-L2', operations: [row(1, 'QA Shirt Cut'), row(2, 'QA Press'), row(3, 'QA Body Stitch')] });
check('QA-L2 mapped (cut, press, stitch: wrong order on purpose)', map2.ok, msg(map2));
const map2Id = map2.json?.id;
let m2 = (await call('GET', `/transactions/lot-operations/${map2Id}`)).json;
r = await call('PUT', `/transactions/lot-operations/${map2Id}`, {
  ...m2.header, operations: m2.operations.map((o) => ({ ...o, stepno: o.opname === 'QA Press' ? 3 : o.opname === 'QA Body Stitch' ? 2 : 1 })),
});
check('QA-L2 reordered before any work (allowed)', r.ok, msg(r));
m2 = (await call('GET', `/transactions/lot-operations/${map2Id}`)).json;
check('QA-L2 order is now cut, stitch, press', m2.operations.map((o) => o.opname).join(' > ') === 'QA Shirt Cut > QA Body Stitch > QA Press');

// ---------------------------------------------------------------------------
// Helpers for Daily Process Entry and Material Issue
const days = (map) => { const o = {}; for (let d = 1; d <= 31; d++) o[`d${d}`] = map[d] ?? 0; return o; };
const header = (worker, month = 'October') => ({ monthName: month, yearName: 2026, empId: W[worker], ledGrpId: groupId });
// One row at a time (admin-only server call kept for this test; the screen that used it was removed)
const logRow = (worker, op, dayMap, lot = 'QA-L1', extra = {}) =>
  call('POST', '/transactions/daily-entry/save', { ...header(worker, extra.month), lotNo: lot, processId: oid[op], processName: op, ...days(dayMap), ...extra });
// Monthly grid ("Daily Process Entry")
const logGrid = (worker, rows, month = 'October') =>
  call('POST', '/transactions/daily-entry/save-matrix', {
    ...header(worker, month),
    rows: rows.map((x) => ({ id: x.id || 0, lotNo: x.lot || 'QA-L1', processId: oid[x.op], processName: x.op, ...days(x.days) })),
  });
const quota = async (op, lot = 'QA-L1', exclude = 0) =>
  (await call('GET', `/transactions/daily-entry/operation-quota/${lot}/${oid[op]}?excludeDetailId=${exclude}`)).json;
const headerId = async (worker, month = 'October') =>
  (await call('GET', `/transactions/daily-entry/header-search?month=${month}&year=2026&groupId=${groupId}&empId=${W[worker]}`)).json.id;
const sheet = async (worker, month = 'October') => (await call('GET', `/transactions/daily-entry/details-by-header/${await headerId(worker, month)}`)).json;
const steps = async (lot = 'QA-L1') => (await call('GET', `/transactions/material-issue/lot-details/${lot}`)).json.steps;
const send = (op, qty, lot = 'QA-L1') =>
  call('POST', '/transactions/material-issue/save', { lotNo: lot, operationId: oid[op], qty, issueDate: '2026-10-23', remark: 'QA' });
// step:received/done/sent/canSend
const fmt = (ss) => ss.map((s) => `${s.stepno}:${s.received}/${s.done}/${s.sent}/${s.available}`).join('  ');

// ---------------------------------------------------------------------------
section('4. Daily Process Entry: workers can only log what their step received');
const dd = (await call('GET', '/transactions/daily-entry/operations-by-lot/QA-L1')).json;
check('operation dropdown is in step order with step numbers', dd.map((o) => o.stepno).join(',') === '10,20,30,40,50', JSON.stringify(dd.map((o) => o.stepno)));
let q = await quota('QA Shirt Cut');
check('cutting (first step) received = cut qty 300', q.received === 300 && q.remainingAllowed === 300, JSON.stringify(q));
r = await logRow('QA Worker A', 'QA Shirt Cut', { 1: 120, 2: 80 });
check('one-row form: Worker A logs 200 cutting', r.ok, msg(r));
r = await logRow('QA Worker B', 'QA Shirt Cut', { 2: 150 });
check('Worker B 150 rejected (only 100 left)', !r.ok && /max 100/.test(msg(r)), msg(r));
check('rejected save did not leave an empty month header for Worker B', (await headerId('QA Worker B')) === 0);
r = await logGrid('QA Worker B', [{ op: 'QA Shirt Cut', days: { 2: 60 } }, { op: 'QA Shirt Cut', days: { 3: 50 } }]);
check('grid: two rows of the same step in one sheet are added together (60+50 > 100)', !r.ok, msg(r));
r = await logGrid('QA Worker B', [{ op: 'QA Shirt Cut', days: { 2: 60, 3: 40 } }]);
check('grid: Worker B logs exactly the 100 left', r.ok, msg(r));
r = await logRow('QA Worker C', 'QA Shirt Cut', { 4: 1 });
check('Worker C 1 more rejected (all 300 logged)', !r.ok, msg(r));
r = await logRow('QA Worker C', 'QA Body Stitch', { 4: 1 });
check('stitching before cutting sends anything is rejected', !r.ok && /received 0/.test(msg(r)), msg(r));
r = await logRow('QA Worker C', 'QA Body Stitch', { 4: 1 }, 'QA-L2');
check('logging on another lot\'s step that received nothing is rejected', !r.ok, msg(r));

section('4b. Daily Process Entry: editing and bad input');
const aCut = (await sheet('QA Worker A')).find((x) => String(x.processid) === String(oid['QA Shirt Cut']));
q = await quota('QA Shirt Cut', 'QA-L1', aCut.id);
check('quota while editing Worker A row: others 100, max 200', q.loggedByOthers === 100 && q.remainingAllowed === 200, JSON.stringify(q));
r = await logRow('QA Worker A', 'QA Shirt Cut', { 1: 120, 2: 81 }, 'QA-L1', { detailId: aCut.id });
check('edit Worker A 200 -> 201 rejected', !r.ok, msg(r));
r = await logRow('QA Worker A', 'QA Shirt Cut', { 1: 120, 2: 80 });
check('saving again without the row id updates the same row', r.ok, msg(r));
check('Worker A still has one cutting row', (await sheet('QA Worker A')).filter((x) => String(x.processid) === String(oid['QA Shirt Cut'])).length === 1);
r = await logRow('QA Worker C', 'QA Shirt Cut', { 5: 2.5 });
check('2.5 pieces rejected', !r.ok, msg(r));
r = await logGrid('QA Worker C', [{ op: 'QA Shirt Cut', days: { 5: -3 } }]);
check('negative pieces rejected', !r.ok, msg(r));
r = await call('POST', '/transactions/daily-entry/save', { ...header('QA Worker C'), lotNo: 'QA-L1', processId: allOps.find((o) => o.operations === 'BACK FRONT KACHA')?.id || 999999, ...days({ 5: 1 }) });
check('operation not mapped to the lot rejected', !r.ok, msg(r));
r = await logRow('QA Worker C', 'QA Shirt Cut', { 5: 1 }, 'qa-l1');
check('lot typed in lower case is still checked (all 300 used)', !r.ok, msg(r));

// ---------------------------------------------------------------------------
section('5. Monthly grid: Total / Rate / Amount follow the Lot Operation Map rate');
let aRows = await sheet('QA Worker A');
check('Worker A row: 200 x ₹2 = ₹400', Number(aRows[0].totalqty) === 200 && Number(aRows[0].rate) === 2 && Number(aRows[0].amount) === 400, JSON.stringify(aRows[0]));
const m1 = (await call('GET', `/transactions/lot-operations/${map1Id}`)).json;
const putMap = (opsList) => call('PUT', `/transactions/lot-operations/${map1Id}`, { ...m1.header, operations: opsList });
r = await putMap(m1.operations.map((o) => (o.stepno === 10 ? { ...o, rate: 2.5 } : o)));
check('admin changes QA-L1 cutting rate ₹2 -> ₹2.50', r.ok, msg(r));
aRows = await sheet('QA Worker A');
check('Worker A amount follows: 200 x ₹2.50 = ₹500', Number(aRows[0].amount) === 500, aRows[0].amount);
const bRows = await sheet('QA Worker B');
check('Worker B amount follows too: 100 x ₹2.50 = ₹250', Number(bRows[0].amount) === 250, bRows[0].amount);
r = await putMap(m1.operations);
check('rate set back to ₹2', r.ok, msg(r));

// ---------------------------------------------------------------------------
section('6. Material Issue: a step can only send pieces its workers finished');
let s = await steps();
check('start: cutting 300 received / 300 done / 0 sent / 300 can send', fmt(s).startsWith('10:300/300/0/300'), fmt(s));
r = await send('QA Shirt Cut', 120);
check('Mon: cutting sends 120', r.ok, msg(r));
r = await send('QA Body Stitch', 1);
check('Tue: stitching can\'t send anything (received 120, workers finished 0)', !r.ok && /finished 0/.test(msg(r)), msg(r));
console.log('     message:', msg(r));
r = await logRow('QA Worker A', 'QA Body Stitch', { 6: 60, 7: 40 });
check('Tue: Worker A logs 100 stitching', r.ok, msg(r));
r = await logRow('QA Worker B', 'QA Body Stitch', { 7: 21 });
check('Tue: Worker B 21 more stitching rejected (stitching received only 120)', !r.ok, msg(r));
r = await send('QA Body Stitch', 101);
check('Tue: stitching sending 101 (workers finished 100) rejected', !r.ok, msg(r));
r = await send('QA Body Stitch', 100);
check('Tue: stitching sends 100', r.ok, msg(r));
r = await logGrid('QA Worker C', [{ op: 'QA Kaj Button', days: { 8: 80 } }]);
check('Wed: Worker C logs 80 kaj button', r.ok, msg(r));
r = await send('QA Kaj Button', 80);
check('Wed: kaj button sends 80', r.ok, msg(r));
r = await logRow('QA Outside Work', 'QA Press', { 9: 80 });
check('Wed: "QA Outside Work" logs 80 pressing (treated like any worker)', r.ok, msg(r));
r = await send('QA Press', 80);
check('Wed: pressing sends 80', r.ok, msg(r));
r = await logRow('QA Worker C', 'QA Pack', { 10: 50 });
check('Thu: Worker C logs 50 packing', r.ok, msg(r));
r = await send('QA Pack', 50);
check('Thu: packing sends 50 (finished)', r.ok, msg(r));
s = await steps();
check('after Thu: 10:300/300/120/180  20:120/100/100/0  30:100/80/80/0  40:80/80/80/0  50:80/50/50/0',
  fmt(s) === '10:300/300/120/180  20:120/100/100/0  30:100/80/80/0  40:80/80/80/0  50:80/50/50/0', fmt(s));
r = await send('QA Shirt Cut', 180);
check('Fri: cutting sends the remaining 180', r.ok, msg(r));
r = await send('QA Shirt Cut', 1);
check('Fri: cutting can\'t send 1 more (all 300 sent)', !r.ok, msg(r));
q = await quota('QA Body Stitch');
check('Daily Process Entry: stitching now received 300, 100 logged, 200 left', q.received === 300 && q.remainingAllowed === 200, JSON.stringify(q));
s = await steps();
check('Material Issue shows the same numbers as Daily Process Entry', s[1].received === q.received && s[1].done === q.loggedByOthers, fmt(s));

section('6b. Material Issue: bad input and editing slips');
r = await send('QA Body Stitch', 0);
check('qty 0 rejected', !r.ok, msg(r));
r = await send('QA Body Stitch', -5);
check('negative qty rejected', !r.ok, msg(r));
r = await send('QA Body Stitch', 'abc');
check('text qty rejected', !r.ok, msg(r));
r = await send('QA Body Stitch', 2.5);
check('half a piece rejected', !r.ok, msg(r));
r = await call('POST', '/transactions/material-issue/save', { lotNo: 'NO-SUCH-LOT', operationId: oid['QA Shirt Cut'], qty: 1 });
check('unknown lot rejected', !r.ok, msg(r));
r = await send('QA Pack', 1, 'QA-L2');
check('operation not mapped to that lot rejected', !r.ok, msg(r));
const slips = (await call('GET', '/transactions/material-issue/list?lotNo=QA-L1')).json.data;
const slipOf = (opName, qty) => slips.find((x) => x.operation_name === opName && parseFloat(x.qty) === qty);
check('slip list shows step numbers', slips.every((x) => x.stepno !== null));
r = await call('PUT', `/transactions/material-issue/item/${slipOf('QA Body Stitch', 100).id}`, { qty: 101 });
check('editing stitching slip 100 -> 101 rejected (workers finished 100)', !r.ok, msg(r));
r = await call('PUT', `/transactions/material-issue/item/${slipOf('QA Shirt Cut', 120).id}`, { qty: 300 });
check('editing cutting slip 120 -> 300 rejected (only 300 finished, 180 in other slips)', !r.ok, msg(r));
r = await call('PUT', `/transactions/material-issue/item/${slipOf('QA Shirt Cut', 120).id}`, { qty: 110 });
check('editing cutting slip 120 -> 110 saved', r.ok, msg(r));
s = await steps();
check('stitching received drops to 290 automatically', s[1].received === 290, fmt(s));
r = await call('DELETE', `/transactions/material-issue/item/${slipOf('QA Press', 80).id}`);
check('deleting pressing slip rejected (packing already sent 50 of it)', !r.ok, msg(r));
r = await call('PUT', `/transactions/material-issue/item/${slipOf('QA Pack', 50).id}`, { qty: 0 });
check('editing a slip to 0 rejected (use Delete)', !r.ok, msg(r));
r = await call('DELETE', `/transactions/material-issue/item/${slipOf('QA Pack', 50).id}`);
check('deleting packing slip (last step) allowed', r.ok, msg(r));
r = await call('DELETE', `/transactions/material-issue/item/${slipOf('QA Pack', 50).id}`);
check('deleting the same slip again says not found', r.status === 404, msg(r));
r = await send('QA Pack', 50);
check('packing re-sends 50', r.ok, msg(r));

section('6c. Two clerks at the same moment');
r = await logRow('QA Worker B', 'QA Body Stitch', { 11: 40 });
check('Worker B logs 40 more stitching (done 140, sent 100, can send 40)', r.ok, msg(r));
let [a, b] = await Promise.all([send('QA Body Stitch', 30), send('QA Body Stitch', 30)]);
check('only one of two parallel sends of 30 (can send 40) accepted', [a.ok, b.ok].filter(Boolean).length === 1, `${a.status} ${b.status}`);
q = await quota('QA Body Stitch');
[a, b] = await Promise.all([
  // two workers with no stitching row yet (saving an existing row again replaces its days)
  logRow('QA Worker C', 'QA Body Stitch', { 12: Math.floor(q.remainingAllowed / 2) + 1 }),
  logRow('QA Outside Work', 'QA Body Stitch', { 12: Math.floor(q.remainingAllowed / 2) + 1 }),
]);
check(`only one of two parallel daily entries (${q.remainingAllowed} left) accepted`, [a.ok, b.ok].filter(Boolean).length === 1, `${a.status} ${b.status}`);
s = await steps();
check('no step ever has done > received or sent > done', s.every((x) => x.done <= x.received && x.sent <= x.done), fmt(s));

// ---------------------------------------------------------------------------
section('7. Locks once pieces have moved');
r = await putMap(m1.operations.map((o) => (o.stepno === 30 ? { ...o, stepno: 35 } : o)));
check('renumbering a step rejected', !r.ok, msg(r));
r = await putMap(m1.operations.filter((o) => o.stepno !== 40));
check('removing a step rejected', !r.ok, msg(r));
r = await putMap(m1.operations.map((o) => (o.stepno === 20 ? { ...o, rate: 6.5 } : o)));
check('changing a rate still allowed', r.ok, msg(r));
r = await call('DELETE', `/transactions/lot-operations/${map1Id}`);
check('deleting the lot map rejected', !r.ok, msg(r));
l1row = (await call('GET', `/transactions/job-orders/${l1Id}`)).json;
r = await call('PUT', `/transactions/job-orders/${l1Id}`, { ...l1row, cutqty: 200 });
check('lowering cut qty below what cutting sent (290) rejected', !r.ok, msg(r));
r = await call('PUT', `/transactions/job-orders/${l1Id}`, { ...l1row, lotclosed: 'Yes' });
check('closing lot QA-L1 saved', r.ok, msg(r));
check('closed lot not in Material Issue lot dropdown', !(await call('GET', '/transactions/material-issue/active-lots')).json.some((x) => x.fabriclotno === 'QA-L1'));
r = await send('QA Body Stitch', 1);
check('sending on a closed lot rejected', !r.ok, msg(r));
r = await call('PUT', `/transactions/job-orders/${l1Id}`, { ...l1row, lotclosed: 'No' });
check('re-opening lot QA-L1 saved', r.ok, msg(r));
r = await call('PUT', `/transactions/job-orders/${l1Id}`, { ...l1row, fabriclotno: 'QA-L1-RENAMED' });
check('renaming a lot in use rejected', !r.ok, msg(r));
r = await call('DELETE', `/transactions/job-orders/${l1Id}`);
check('deleting a lot with slips rejected', !r.ok, msg(r));

// ---------------------------------------------------------------------------
section('8. Second lot is independent, and work can span months');
s = await steps('QA-L2');
check('QA-L2 starts fresh: 1:200/0/0/0', fmt(s) === '1:200/0/0/0  2:0/0/0/0  3:0/0/0/0', fmt(s));
r = await send('QA Shirt Cut', 1, 'QA-L2');
check('QA-L2 cutting can\'t send before anyone logs cutting', !r.ok, msg(r));
r = await logRow('QA Worker A', 'QA Shirt Cut', { 28: 120 }, 'QA-L2', { month: 'September' });
check('Worker A logs 120 QA-L2 cutting in September', r.ok, msg(r));
r = await logRow('QA Worker A', 'QA Shirt Cut', { 2: 81 }, 'QA-L2');
check('October entry of 81 rejected (only 80 left across both months)', !r.ok, msg(r));
r = await logRow('QA Worker A', 'QA Shirt Cut', { 2: 80 }, 'QA-L2');
check('October entry of 80 saved', r.ok, msg(r));
r = await send('QA Shirt Cut', 200, 'QA-L2');
check('QA-L2 cutting sends all 200', r.ok, msg(r));
s = await steps('QA-L2');
check('QA-L2: 1:200/200/200/0  2:200/0/0/0', fmt(s).startsWith('1:200/200/200/0  2:200/0/0/0'), fmt(s));
s = await steps('QA-L1');
console.log('  final QA-L1:', fmt(s));

// ---------------------------------------------------------------------------
section('9. Fixing mistakes: pieces that already moved on can\'t be taken back');
// QA-L2 now: cutting 200 received / 200 done (Worker A: 120 Sept + 80 Oct) / 200 sent; stitching received 200.
const rowOf = async (worker, op, lot, month = 'October') =>
  (await sheet(worker, month)).find((x) => x.lotno === lot && String(x.processid) === String(oid[op]));
let aOct = await rowOf('QA Worker A', 'QA Shirt Cut', 'QA-L2');
q = await quota('QA Shirt Cut', 'QA-L2', aOct.id);
check('quota shows a minimum: cutting sent 200, others 120, so this entry needs >= 80', q.minForThisEntry === 80, JSON.stringify(q));
r = await logRow('QA Worker A', 'QA Shirt Cut', { 2: 79 }, 'QA-L2', { detailId: aOct.id });
check('daily edit: Worker A Oct cutting 80 -> 79 rejected (200 already sent ahead)', !r.ok && /can't go below 200/.test(msg(r)), msg(r));
console.log('     message:', msg(r));
r = await call('DELETE', `/transactions/daily-entry/detail/${aOct.id}`);
check('daily delete (one-row form): deleting that row rejected', !r.ok, msg(r));
r = await call('DELETE', `/transactions/daily-entry/header/${await headerId('QA Worker A', 'September')}`);
check('deleting Worker A\'s whole September sheet rejected (its 120 pcs already moved on)', !r.ok, msg(r));
r = await call('POST', '/transactions/daily-entry/save-matrix', {
  ...header('QA Worker A'), rows: [], deletedRowIds: [aOct.id],
});
check('grid: removing that row from the sheet rejected', !r.ok, msg(r));
check('Worker A Oct row is still there with 80', Number((await rowOf('QA Worker A', 'QA Shirt Cut', 'QA-L2')).totalqty) === 80);

r = await logRow('QA Worker B', 'QA Body Stitch', { 14: 150 }, 'QA-L2');
check('Worker B logs 150 stitching on QA-L2', r.ok, msg(r));
const l2Slips = (await call('GET', '/transactions/material-issue/list?lotNo=QA-L2')).json.data;
const cutSlip = l2Slips.find((x) => x.operation_name === 'QA Shirt Cut');
r = await call('PUT', `/transactions/material-issue/item/${cutSlip.id}`, { qty: 149 });
check('slip edit: cutting slip 200 -> 149 rejected (stitching workers already logged 150)', !r.ok && /logged 150/.test(msg(r)), msg(r));
console.log('     message:', msg(r));
r = await call('DELETE', `/transactions/material-issue/item/${cutSlip.id}`);
check('slip delete: cutting slip delete rejected', !r.ok, msg(r));
r = await call('PUT', `/transactions/material-issue/item/${cutSlip.id}`, { qty: 150 });
check('slip edit: cutting slip 200 -> 150 allowed (exactly what stitching logged)', r.ok, msg(r));
s = await steps('QA-L2');
check('QA-L2 now 1:200/200/150/50  2:150/150/0/150', fmt(s).startsWith('1:200/200/150/50  2:150/150/0/150'), fmt(s));
r = await logRow('QA Worker B', 'QA Body Stitch', { 14: 151 }, 'QA-L2');
check('Worker B stitching 150 -> 151 rejected (stitching now received 150)', !r.ok, msg(r));

l2row = (await call('GET', `/transactions/job-orders/${l2Id}`)).json;
r = await call('PUT', `/transactions/job-orders/${l2Id}`, { ...l2row, cutqty: 199 });
check('cut qty 200 -> 199 rejected (cutting workers already logged 200)', !r.ok && /logged 200/.test(msg(r)), msg(r));

section('9b. Fixing mistakes that ARE allowed');
r = await logRow('QA Worker B', 'QA Body Stitch', { 14: 100 }, 'QA-L2');
check('Worker B stitching 150 -> 100 allowed (stitching sent nothing yet)', r.ok, msg(r));
r = await call('PUT', `/transactions/material-issue/item/${cutSlip.id}`, { qty: 100 });
check('now the cutting slip can go down to 100', r.ok, msg(r));
r = await logRow('QA Worker A', 'QA Shirt Cut', { 2: 79 }, 'QA-L2', { detailId: aOct.id });
check('and Worker A Oct cutting 80 -> 79 is allowed (cutting only sent 100)', r.ok, msg(r));
r = await send('QA Body Stitch', 100, 'QA-L2');
check('stitching sends its 100', r.ok, msg(r));
const bStitch = await rowOf('QA Worker B', 'QA Body Stitch', 'QA-L2');
r = await call('DELETE', `/transactions/daily-entry/detail/${bStitch.id}`);
check('deleting Worker B stitching row now rejected (those 100 were sent ahead)', !r.ok, msg(r));
s = await steps('QA-L2');
check('no step on QA-L2 has done > received or sent > done', s.every((x) => x.done <= x.received && x.sent <= x.done), fmt(s));

section('9c. Daily work alone locks the lot (no slips yet)');
r = await call('POST', '/transactions/job-orders', jo({ joborderno: 'QA/JO/002', fabriclotno: 'QA-L4', cutqty: 50, totalqtypcs: 50 }));
check('new order QA/JO/002 lot QA-L4 cut 50', r.ok, msg(r));
const l4Id = r.json?.id;
const l4d = (await call('GET', `/transactions/lot-operations/lot-details/${l4Id}`)).json;
r = await call('POST', '/transactions/lot-operations', {
  ...mapHeader, lotno: 'QA-L4', joborderno: l4d.joborderno, orderqty: l4d.totalqtypcs,
  operations: [row(1, 'QA Shirt Cut'), row(2, 'QA Body Stitch')],
});
check('QA-L4 mapped: 1 cut, 2 stitch', r.ok, msg(r));
const map4Id = r.json?.id;
r = await logRow('QA Worker C', 'QA Shirt Cut', { 20: 10 }, 'QA-L4');
check('Worker C logs 10 cutting on QA-L4 (no slips at all)', r.ok, msg(r));
let m4 = (await call('GET', `/transactions/lot-operations/${map4Id}`)).json;
r = await call('PUT', `/transactions/lot-operations/${map4Id}`, { ...m4.header, operations: m4.operations.map((o) => ({ ...o, stepno: o.stepno === 1 ? 2 : 1 })) });
check('renumbering QA-L4 steps rejected (workers logged work)', !r.ok && /Work has started/.test(msg(r)), msg(r));
r = await call('DELETE', `/transactions/lot-operations/${map4Id}`);
check('deleting QA-L4 lot map rejected', !r.ok, msg(r));
let l4row = (await call('GET', `/transactions/job-orders/${l4Id}`)).json;
r = await call('PUT', `/transactions/job-orders/${l4Id}`, { ...l4row, fabriclotno: 'QA-L4X' });
check('renaming QA-L4 rejected', !r.ok, msg(r));
r = await call('DELETE', `/transactions/job-orders/${l4Id}`);
check('deleting QA-L4 job order rejected', !r.ok, msg(r));
r = await call('PUT', `/transactions/job-orders/${l4Id}`, { ...l4row, cutqty: 9 });
check('QA-L4 cut qty 50 -> 9 rejected (10 already logged)', !r.ok, msg(r));
const cRow = await rowOf('QA Worker C', 'QA Shirt Cut', 'QA-L4');
r = await call('DELETE', `/transactions/daily-entry/detail/${cRow.id}`);
check('deleting the only QA-L4 entry allowed (nothing was sent ahead)', r.ok, msg(r));
m4 = (await call('GET', `/transactions/lot-operations/${map4Id}`)).json;
r = await call('PUT', `/transactions/lot-operations/${map4Id}`, { ...m4.header, operations: m4.operations.map((o) => ({ ...o, stepno: o.stepno === 1 ? 2 : 1 })) });
check('with no work left, renumbering QA-L4 is allowed again', r.ok, msg(r));

section('9d. Final consistency check on every QA lot');
for (const lot of ['QA-L1', 'QA-L2', 'QA-L4']) {
  s = await steps(lot);
  check(`${lot}: every step has sent <= done <= received`, s.every((x) => x.sent <= x.done && x.done <= x.received), fmt(s));
}

// ---------------------------------------------------------------------------
section('10. Reports match what was logged in Daily Process Entry');
const report = async (name, qs) => (await call('GET', `/reports/${name}?${new URLSearchParams(qs)}`)).json;
const rowPieces = (x) => { let t = 0; for (let d = 1; d <= 31; d++) t += Number(x[`d${d}`] || 0); return t; };
// What the daily entry screens hold for every QA worker in a month (deleted rows are already left out)
const loggedRows = async (month) => {
  const all = [];
  for (const w of workerNames) {
    const id = await headerId(w, month);
    if (id) all.push(...(await sheet(w, month)).map((x) => ({ ...x, worker: w })));
  }
  return all;
};
const sum = (list, fn) => list.reduce((a, x) => a + fn(x), 0);
const qaFilter = (month) => ({ year: '2026', month, group: 'QA Group' });

// A row saved with the lot typed in lower case must still show up in the reports
// (section 9c swapped QA-L4's steps, so QA Body Stitch is its first step now)
r = await logRow('QA Worker C', 'QA Body Stitch', { 20: 5 }, 'qa-l4');
check('Worker C logs 5 on lot "qa-l4" (typed in lower case)', r.ok, msg(r));

const octRows = await loggedRows('October');
const octPieces = sum(octRows, (x) => Number(x.totalqty));
const octAmount = sum(octRows, (x) => Number(x.amount));

let pw = await report('process-work', qaFilter('October'));
check('Process Work: only QA Group rows when filtered', pw.length > 0 && pw.every((x) => x.ledgrpname === 'QA Group'), JSON.stringify(pw.map((x) => x.ledgrpname)));
check(`Process Work: total pieces = ${octPieces} (same as Daily Process Entry)`, sum(pw, (x) => Number(x.totalqty)) === octPieces, sum(pw, (x) => Number(x.totalqty)));
check(`Process Work: total amount = ₹${octAmount}`, Math.abs(sum(pw, (x) => Number(x.totamt)) - octAmount) < 0.01, sum(pw, (x) => Number(x.totamt)));
check('Process Work: every row amount = qty x rate', pw.every((x) => Math.abs(Number(x.totalqty) * Number(x.rate) - Number(x.totamt)) < 0.01));
check('Process Work: lower-case lot row is included', pw.some((x) => x.lotno === 'qa-l4' && Number(x.totalqty) === 5), JSON.stringify(pw.map((x) => x.lotno)));
check('Process Work: shows operation names, not text saved with the entry', pw.every((x) => opDefs.some((o) => o[0] === x.processname)), JSON.stringify([...new Set(pw.map((x) => x.processname))]));

let dp = await report('daily-process', qaFilter('October'));
check(`Daily Process: one row per daily entry row (${octRows.length})`, dp.length === octRows.length, dp.length);
check('Daily Process: day-by-day pieces match the entries', dp.every((x) => octRows.some((e) => e.worker === x.operatorname && e.lotno === x.lotno && rowPieces(e) === rowPieces(x) && Number(x.totalqty) === rowPieces(x))));
check(`Daily Process: total amount = ₹${octAmount}`, Math.abs(sum(dp, (x) => Number(x.totamt)) - octAmount) < 0.01, sum(dp, (x) => Number(x.totamt)));
const dpAllMonths = await report('daily-process', { year: '2026', group: 'QA Group' });
check('Daily Process: "All Months" includes September and October', ['September', 'October'].every((m) => dpAllMonths.some((x) => x.monthname === m)), JSON.stringify([...new Set(dpAllMonths.map((x) => x.monthname))]));
const dpAllGroups = await report('daily-process', { year: '2026', month: 'October' });
check('Daily Process: "All Groups" includes the QA rows', dpAllGroups.filter((x) => x.ledgrpname === 'QA Group').length === octRows.length);
check('Daily Process: a month with no entries is empty (not an error)', Array.isArray(await report('daily-process', { year: '2030', month: 'August' })));

console.log('  Lotwise Groupwise');
const lg = await report('lot-group-qty', { year: '2026' });
check('Lotwise: one column per employee group (incl. "QA Group")', Array.isArray(lg.groups) && lg.groups.includes('QA Group'), JSON.stringify(lg.groups));
for (const lot of ['QA-L1', 'QA-L2', 'QA-L4']) {
  const expected = sum(octRows.filter((x) => x.lotno.toLowerCase() === lot.toLowerCase()), (x) => Number(x.totalqty));
  const got = lg.rows.find((x) => x.monthname === 'October' && x.lotno === lot);
  check(`Lotwise: ${lot} October QA Group = ${expected} (deleted rows not counted)`, (got ? got.groups['QA Group'] || 0 : 0) === expected, JSON.stringify(got));
}
check('Lotwise: each row total = sum of its group columns', lg.rows.every((x) => Math.abs(Object.values(x.groups).reduce((a, b) => a + b, 0) - x.totalqty) < 0.01));

console.log('  Salary (days and amount straight from Daily Process Entry, no Update Attendance needed)');
const salaryMatches = async (month) => {
  const sal = await report('salary', qaFilter(month));
  const rows = await loggedRows(month);
  const workers = [...new Set(rows.map((x) => x.worker))];
  check(`Salary ${month}: every QA worker who logged pieces is listed (${workers.length})`, sal.length === workers.length, JSON.stringify(sal.map((x) => x.operatorname)));
  for (const w of workers) {
    const mine = rows.filter((x) => x.worker === w);
    const amount = sum(mine, (x) => Number(x.amount));
    // a day counts once even if the worker logged on several lots/steps that day
    const daysWorked = [...Array(31).keys()].filter((i) => mine.some((x) => Number(x[`d${i + 1}`]) > 0)).length;
    const row = sal.find((x) => x.operatorname === w);
    check(`Salary ${month}: ${w} = ${daysWorked} days, ₹${amount}`, row && Number(row.totaldays) === daysWorked && Math.abs(Number(row.totamt) - amount) < 0.01, JSON.stringify(row));
  }
  return sal;
};
const salOct = await salaryMatches('October');
const salSep = await salaryMatches('September');
check('Salary: amounts match Process Work for the same month', Math.abs(sum(salOct, (x) => Number(x.totamt)) - octAmount) < 0.01);

// A worker who logs on two lots on the same day: that day counts once
const before = salOct.find((x) => x.operatorname === 'QA Worker C');
r = await logRow('QA Worker C', 'QA Body Stitch', { 20: 5, 21: 1 }, 'qa-l4');
check('Worker C adds day 21 on lot qa-l4', r.ok, msg(r));
const afterC = (await report('salary', qaFilter('October'))).find((x) => x.operatorname === 'QA Worker C');
const cRowsNow = (await loggedRows('October')).filter((x) => x.worker === 'QA Worker C');
const cDays = [...Array(31).keys()].filter((i) => cRowsNow.some((x) => Number(x[`d${i + 1}`]) > 0)).length;
check(`Salary updates straight away: Worker C now ${cDays} days`, afterC && Number(afterC.totaldays) === cDays && (!before || cDays >= Number(before.totaldays)), JSON.stringify(afterC));

// Update Attendance still works for the Spine export, and doesn't change Salary.
// It fills attendance for EVERY worker with entries that month, so only run it on a QA-only month.
const sepAll = await report('daily-process', { year: '2026', month: 'September' });
if (sepAll.some((x) => x.ledgrpname !== 'QA Group')) {
  console.log('  SKIP  Update Attendance checks: September 2026 has non-QA entries, not touching attendance');
} else {
  r = await call('POST', '/utility/attendance/update', { month: 'September', year: '2026' });
  check('Update Attendance for September 2026 still works (for the Spine export)', r.ok, msg(r));
  r = await call('POST', '/utility/attendance/update', { month: 'September', year: '2026' });
  const salSepAfter = await report('salary', qaFilter('September'));
  check('Salary is the same after running Update Attendance (twice)', JSON.stringify(salSepAfter) === JSON.stringify(salSep), JSON.stringify(salSepAfter));
  const spine = (await call('GET', '/utility/spine-attendance?month=September&year=2026')).json;
  const spineQa = Array.isArray(spine) ? spine.filter((x) => Object.values(W).map(String).includes(String(x.empcode)) || /^QA-W/.test(x.empcode)) : [];
  check('Spine Attendance export works for a 30-day month (September: 30 days, no "31 September")',
    Array.isArray(spine) && spine.length > 0 && spine.length % 30 === 0 && spine.every((x) => !x.attdt.startsWith('31-')), JSON.stringify(spine).slice(0, 200));
  const sepWorkerDays = (await loggedRows('September')).filter((x) => x.worker === 'QA Worker A');
  const presentDays = [...Array(30).keys()].filter((i) => sepWorkerDays.some((x) => Number(x[`d${i + 1}`]) > 0)).length;
  check(`Spine Attendance: QA Worker A present (DP) on ${presentDays} days, same as Salary`,
    spineQa.filter((x) => x.dp === 'DP').length === presentDays && presentDays === Number(salSep.find((x) => x.operatorname === 'QA Worker A')?.totaldays), JSON.stringify(spineQa.filter((x) => x.dp === 'DP')));
}

// ---------------------------------------------------------------------------
section('11. Update Attendance (saved copy) and the Spine export (always live from entries)');
// Runs only on a month with nothing but QA entries (Update Attendance touches every worker that month).
const augAll = await report('daily-process', { year: '2026', month: 'August' });
const augSaved = (await call('GET', '/utility/attendance/records?month=August&year=2026')).json;
if (augAll.some((x) => x.ledgrpname !== 'QA Group') || augSaved.length > 0) {
  console.log('  SKIP  August 2026 already has other entries or attendance, not touching it');
} else {
  const records = async () => (await call('GET', '/utility/attendance/records?month=August&year=2026')).json;
  const preview = async () => (await call('GET', '/utility/attendance/preview?month=August&year=2026')).json;
  // QA-L4's first step (QA Body Stitch) has received 50 and sent nothing, so this entry can be deleted later
  r = await logRow('QA Outside Work', 'QA Body Stitch', { 3: 2, 9: 1 }, 'QA-L4', { month: 'August' });
  check('Outside Work logs pieces on Aug 3 and Aug 9', r.ok, msg(r));
  let pv = await preview();
  check('Search before updating: nothing saved yet, entries show 1 operator', (await records()).length === 0 && pv.length === 1 && pv[0].calculatedDays === 2, JSON.stringify(pv));
  const outsideCode = emps.find((e) => e.operatorname === 'QA Outside Work')?.empcode;
  const spineOf = async () => (await call('GET', '/utility/spine-attendance?month=August&year=2026')).json.filter((x) => x.empcode === outsideCode);
  const dpDays = (rows) => rows.filter((x) => x.dp === 'DP').map((x) => Number(x.attdt.slice(0, 2))).join(',');
  const rateBodyStitch = opDefs.find((o) => o[0] === 'QA Body Stitch')[2];
  let sp = await spineOf();
  check('Spine without Update Attendance: 31 days, DP on 3 and 9', sp.length === 31 && dpDays(sp) === '3,9', JSON.stringify(sp.filter((x) => x.dp === 'DP')));
  check(`Spine amounts: day 3 = ${2 * rateBodyStitch}, day 9 = ${rateBodyStitch}, other days 0`,
    sp.every((x) => Number(x.amt) === (x.attdt.startsWith('03-') ? 2 * rateBodyStitch : x.attdt.startsWith('09-') ? rateBodyStitch : 0)), JSON.stringify(sp.filter((x) => Number(x.amt) > 0)));
  // change the entry: day 9 -> 0, day 12 -> 4; Spine follows at once, the saved copy doesn't
  const augId = (await sheet('QA Outside Work', 'August'))[0].id;
  r = await logRow('QA Outside Work', 'QA Body Stitch', { 3: 2, 12: 4 }, 'QA-L4', { month: 'August', detailId: augId });
  check('Outside Work entry changed (day 9 -> 0, day 12 -> 4)', r.ok, msg(r));
  sp = await spineOf();
  check('Spine follows straight away: DP on 3 and 12, day 9 ABS', dpDays(sp) === '3,12', dpDays(sp));
  check('Spine: every DP day has pay and every ABS day has none', sp.every((x) => (x.dp === 'DP') === (Number(x.amt) > 0)));
  const salAug = (await report('salary', qaFilter('August'))).find((x) => x.operatorname === 'QA Outside Work');
  check('Spine total pay = Salary for the month', Math.abs(sp.reduce((a, x) => a + Number(x.amt), 0) - Number(salAug?.totamt)) < 0.01 && sp.filter((x) => x.dp === 'DP').length === Number(salAug?.totaldays), JSON.stringify(salAug));
  r = await call('POST', '/utility/attendance/update', { month: 'August', year: '2026' });
  let rec = await records();
  check('Update Attendance saves Outside Work: present on days 3 and 12 only (2 days)',
    r.ok && rec.length === 1 && Number(rec[0].totaldays) === 2 && rec[0].d3 === 1 && rec[0].d12 === 1 && rec[0].d9 === 0, JSON.stringify(rec));
  const augRow = (await sheet('QA Outside Work', 'August'))[0];
  r = await call('DELETE', `/transactions/daily-entry/detail/${augRow.id}`);
  check('Outside Work August entry deleted', r.ok, msg(r));
  check('Search now shows the saved attendance is out of date (saved 1, entries 0)', (await records()).length === 1 && (await preview()).length === 0);
  check('Spine already drops Outside Work (no Update needed)', (await spineOf()).length === 0);
  r = await call('POST', '/utility/attendance/update', { month: 'August', year: '2026' });
  check('Update Attendance removes the old attendance of a worker with no entries left', r.ok && (await records()).length === 0 && /Removed old attendance for 1/.test(msg(r)), msg(r));
  const spineAug = (await call('GET', '/utility/spine-attendance?month=August&year=2026')).json;
  check('Spine export no longer shows Outside Work as present in August', Array.isArray(spineAug) && !spineAug.some((x) => x.dp === 'DP'), JSON.stringify(spineAug).slice(0, 200));
}

// ---------------------------------------------------------------------------
section('12. Reports in another year (January 2027) and the Lotwise filters');
// QA-L4's first step (QA Body Stitch) received 50 and has room left
r = await call('POST', '/transactions/daily-entry/save', {
  monthName: 'January', yearName: 2027, empId: W['QA Worker B'], ledGrpId: groupId,
  lotNo: 'QA-L4', processId: oid['QA Body Stitch'], processName: 'QA Body Stitch', ...days({ 4: 3 }),
});
check('Worker B logs 3 pcs on 4 Jan 2027 (QA-L4)', r.ok, msg(r));
const jan27 = { year: '2027', month: 'January', group: 'QA Group' };
const rateStitch = opDefs.find((o) => o[0] === 'QA Body Stitch')[2];
pw = await report('process-work', jan27);
check('Process Work 2027: shows the January 2027 row', pw.length === 1 && Number(pw[0].totalqty) === 3 && pw[0].yearname === '2027', JSON.stringify(pw));
dp = await report('daily-process', jan27);
check('Daily Process 2027: shows it, with 3 pcs on day 4', dp.length === 1 && Number(dp[0].d4) === 3, JSON.stringify(dp));
check('Daily Process 2026 January: does not include the 2027 row', !(await report('daily-process', { year: '2026', month: 'January', group: 'QA Group' })).some((x) => x.yearname === '2027'));
const sal27 = (await report('salary', jan27)).find((x) => x.operatorname === 'QA Worker B');
check(`Salary 2027: Worker B 1 day, ₹${3 * rateStitch}`, sal27 && sal27.totaldays === 1 && Number(sal27.totamt) === 3 * rateStitch, JSON.stringify(sal27));
const spine27 = (await call('GET', '/utility/spine-attendance?month=January&year=2027')).json.filter((x) => x.empcode === emps.find((e) => e.operatorname === 'QA Worker B')?.empcode);
check('Spine January 2027: 31 days, DP on 04-Jan-2027 only', spine27.length === 31 && spine27.filter((x) => x.dp === 'DP').map((x) => x.attdt).join() === '04-Jan-2027', JSON.stringify(spine27.filter((x) => x.dp === 'DP')));

console.log('  Lotwise filters');
let lw = await report('lot-group-qty', jan27);
check('Lotwise 2027 January + QA Group: one row (QA-L4) with 3 pcs', lw.rows.length === 1 && lw.rows[0].lotno === 'QA-L4' && lw.rows[0].groups['QA Group'] === 3 && lw.rows[0].yearname === '2027', JSON.stringify(lw.rows));
check('Lotwise with a group picked: only that group\'s column', JSON.stringify(lw.groups) === JSON.stringify(['QA Group']), JSON.stringify(lw.groups));
lw = await report('lot-group-qty', { year: '2027', month: 'January' });
check('Lotwise All Groups: every active group is a column', lw.groups.includes('QA Group') && lw.groups.length > 1, JSON.stringify(lw.groups));
lw = await report('lot-group-qty', { year: '2026', month: 'October', group: 'QA Group' });
check('Lotwise October 2026: no 2027 or other-month rows', lw.rows.length > 0 && lw.rows.every((x) => x.yearname === '2026' && x.monthname === 'October'), JSON.stringify(lw.rows.map((x) => x.yearname + ' ' + x.monthname)));
lw = await report('lot-group-qty', { year: '2027', group: 'QA Group' });
check('Lotwise 2027 + All Months: includes January 2027', lw.rows.some((x) => x.monthname === 'January' && x.yearname === '2027'));
lw = await report('lot-group-qty', { group: 'QA Group' });
check('Lotwise with Year left empty: shows 2026 and 2027', ['2026', '2027'].every((y) => lw.rows.some((x) => x.yearname === y)), JSON.stringify([...new Set(lw.rows.map((x) => x.yearname))]));
lw = await report('lot-group-qty', { year: '2031', month: 'March' });
check('Lotwise for a month with no data: empty, not an error', Array.isArray(lw.rows) && lw.rows.length === 0);

// ---------------------------------------------------------------------------
section('13. Masters: edit, delete, and records that are in use');
const list = async (path) => (await call('GET', `/masters/${path}`)).json;
const idOf = async (path, field, name) => (await list(path)).find((x) => x[field] === name)?.id;
const del = (path, id) => call('DELETE', `/masters/${path}/${id}`);
const inUseMsg = (res, where) => !res.ok && res.status === 400 && msg(res).includes(where) && /can't be deleted/.test(msg(res));

console.log('  Deleting something that is in use is refused (work must not vanish from reports)');
const salBefore = await report('salary', qaFilter('October'));
r = await del('employees', W['QA Worker A']);
check('delete worker with month sheets refused', inUseMsg(r, 'Daily Process Entry'), msg(r));
console.log('     message:', msg(r));
r = await del('employee-groups', groupId);
check('delete group that has workers refused', inUseMsg(r, 'Employees'), msg(r));
r = await del('operations', oid['QA Shirt Cut']);
check('delete operation used in a lot map refused', inUseMsg(r, 'Lot Operation Map'), msg(r));
r = await del('process-masters', pid['QA Cutting']);
check('delete process that has operations refused', inUseMsg(r, 'Operations'), msg(r));
r = await del('products', productId);
check('delete product used by a job order refused', inUseMsg(r, 'Job Order Booking'), msg(r));
r = await del('units', baseUnitId);
check('delete unit used by products refused', inUseMsg(r, 'Products'), msg(r));
r = await del('product-groups', baseGroupId);
check('delete product group used by products refused', inUseMsg(r, 'Products'), msg(r));
check('after the refused deletes, Salary is exactly the same', JSON.stringify(await report('salary', qaFilter('October'))) === JSON.stringify(salBefore));
check('QA Worker A still active in the employee list', (await list('employees')).some((e) => e.operatorname === 'QA Worker A'));

console.log('  Editing names flows through everywhere');
const empA = (await call('GET', `/masters/employees/${W['QA Worker A']}`)).json;
r = await call('PUT', `/masters/employees/${W['QA Worker A']}`, { ...empA, operatorname: 'QA Worker A Renamed' });
check('rename worker saved', r.ok, msg(r));
check('reports show the new worker name', (await report('salary', qaFilter('October'))).some((x) => x.operatorname === 'QA Worker A Renamed'));
r = await call('PUT', `/masters/employees/${W['QA Worker A']}`, { ...empA });
check('worker name set back', r.ok, msg(r));

const qaRowsBeforeRename = (await report('process-work', qaFilter('October'))).length;
r = await call('PUT', `/masters/employee-groups/${groupId}`, { ledgrpname: 'QA Group Renamed' });
check('rename group saved', r.ok, msg(r));
const renamedRows = (await report('process-work', { year: '2026', month: 'October', group: 'QA Group Renamed' })).length;
check(`reports filter by the new group name (same ${qaRowsBeforeRename} rows as before the rename)`, qaRowsBeforeRename > 0 && renamedRows === qaRowsBeforeRename, `${renamedRows}`);
check('Lotwise column uses the new group name', (await report('lot-group-qty', { year: '2026', month: 'October' })).groups.includes('QA Group Renamed'));
r = await call('PUT', `/masters/employee-groups/${groupId}`, { ledgrpname: 'QA Group' });
check('group name set back', r.ok, msg(r));

const opStitch = (await call('GET', `/masters/operations/${oid['QA Body Stitch']}`)).json;
r = await call('PUT', `/masters/operations/${oid['QA Body Stitch']}`, { ...opStitch, operations: 'QA Body Stitch Renamed', oprate: 99 });
check('rename operation + change its default rate saved', r.ok, msg(r));
const pwRenamed = await report('process-work', qaFilter('October'));
check('Process Work shows the new operation name', pwRenamed.some((x) => x.processname === 'QA Body Stitch Renamed'));
check('Material Issue step shows the new operation name', (await steps('QA-L1')).some((x) => x.operation_name === 'QA Body Stitch Renamed'));
check('changing the default rate in Masters does NOT change lot rates (rates belong to Lot Operation Map)',
  pwRenamed.filter((x) => x.processname === 'QA Body Stitch Renamed').every((x) => Number(x.rate) !== 99));
r = await call('PUT', `/masters/operations/${oid['QA Body Stitch']}`, { ...opStitch });
check('operation set back', r.ok, msg(r));

console.log('  Create, edit and delete records nobody uses (all 8 masters)');
r = await call('POST', '/masters/units', { unitname: 'QA Unit', unittype: 'Simple', formalname: 'QA Units', uqc: 'QAU', decimalplaces: 0 });
check('Unit: create', r.ok, msg(r));
const unitId = await idOf('units', 'unitname', 'QA Unit');
r = await call('POST', '/masters/units', { unitname: 'qa unit', unittype: 'Simple', decimalplaces: 0 });
check('Unit: duplicate name refused', !r.ok, msg(r));
r = await call('PUT', `/masters/units/${unitId}`, { unitname: 'QA Unit Edited', unittype: 'Simple', formalname: 'QA Units', uqc: 'QAU', decimalplaces: 2 });
check('Unit: edit', r.ok && (await list('units')).some((u) => u.unitname === 'QA Unit Edited'), msg(r));

r = await call('POST', '/masters/product-groups', { stkgrpname: 'QA Product Group' });
check('Product Group: create', r.ok, msg(r));
const pgId = await idOf('product-groups', 'stkgrpname', 'QA Product Group');
r = await call('PUT', `/masters/product-groups/${pgId}`, { stkgrpname: 'QA Product Group Edited' });
check('Product Group: edit', r.ok && (await list('product-groups')).some((g) => g.stkgrpname === 'QA Product Group Edited'), msg(r));

r = await call('POST', '/masters/products', { stockitemname: 'QA Spare Product', stockgroup: pgId, unit: unitId, stkcode: 'QA-SP-01' });
check('Product: create (using the QA unit and group)', r.ok, msg(r));
const spareProdId = await idOf('products', 'stockitemname', 'QA Spare Product');
r = await del('units', unitId);
check('Unit: delete refused while a product uses it', inUseMsg(r, 'Products'), msg(r));
r = await del('product-groups', pgId);
check('Product Group: delete refused while a product uses it', inUseMsg(r, 'Products'), msg(r));
const spareProd = (await call('GET', `/masters/products/${spareProdId}`)).json;
r = await call('PUT', `/masters/products/${spareProdId}`, { ...spareProd, stockitemname: 'QA Spare Product Edited' });
check('Product: edit', r.ok && (await list('products')).some((p) => p.stockitemname === 'QA Spare Product Edited'), msg(r));
r = await del('products', spareProdId);
check('Product: delete (no job orders use it)', r.ok, msg(r));
r = await del('units', unitId);
check('Unit: delete once no product uses it', r.ok, msg(r));
r = await del('product-groups', pgId);
check('Product Group: delete once no product uses it', r.ok, msg(r));
check('deleted Unit / Product Group / Product are gone from their lists',
  !(await list('units')).some((u) => u.id === unitId) && !(await list('product-groups')).some((g) => g.id === pgId) && !(await list('products')).some((p) => p.id === spareProdId));

r = await call('POST', '/masters/employee-groups', { ledgrpname: 'QA Spare Group' });
check('Employee Group: create', r.ok, msg(r));
const spareGroupId = await idOf('employee-groups', 'ledgrpname', 'QA Spare Group');
r = await call('POST', '/masters/employees', { operatorname: 'QA Spare Worker', empcode: 'QA-W9', empgrp: spareGroupId, contactno: '9000009999' });
check('Employee: create', r.ok, msg(r));
const spareWorkerId = await idOf('employees', 'operatorname', 'QA Spare Worker');
r = await call('POST', '/masters/employees', { operatorname: 'QA Other', empcode: 'qa-w9', empgrp: spareGroupId, contactno: '9000009998' });
check('Employee: duplicate code refused', !r.ok, msg(r));
r = await call('PUT', `/masters/employees/${spareWorkerId}`, { operatorname: 'QA Spare Worker Edited', empcode: 'QA-W9', empgrp: spareGroupId, contactno: '9000009999' });
check('Employee: edit', r.ok && (await list('employees')).some((e) => e.operatorname === 'QA Spare Worker Edited'), msg(r));
r = await del('employee-groups', spareGroupId);
check('Employee Group: delete refused while it has a worker', inUseMsg(r, 'Employees'), msg(r));
r = await del('employees', spareWorkerId);
check('Employee: delete (no month sheets)', r.ok, msg(r));
r = await del('employee-groups', spareGroupId);
check('Employee Group: delete once empty', r.ok, msg(r));

r = await call('POST', '/masters/process-masters', { stkcategoryname: 'QA Spare Process' });
check('Process Master: create', r.ok, msg(r));
const spareProcId = await idOf('process-masters', 'stkcategoryname', 'QA Spare Process');
r = await call('POST', '/masters/operations', { operations: 'QA Spare Op', opcode: 'QA99', oprate: 1, processid: spareProcId });
check('Operation: create', r.ok, msg(r));
const spareOpId = await idOf('operations', 'operations', 'QA Spare Op');
r = await call('PUT', `/masters/process-masters/${spareProcId}`, { stkcategoryname: 'QA Spare Process Edited' });
check('Process Master: edit', r.ok, msg(r));
r = await call('PUT', `/masters/operations/${spareOpId}`, { operations: 'QA Spare Op Edited', opcode: 'QA99', oprate: 2, processid: spareProcId });
check('Operation: edit', r.ok, msg(r));
r = await del('process-masters', spareProcId);
check('Process Master: delete refused while it has an operation', inUseMsg(r, 'Operations'), msg(r));
r = await del('operations', spareOpId);
check('Operation: delete (not mapped to any lot)', r.ok, msg(r));
r = await del('process-masters', spareProcId);
check('Process Master: delete once it has no operations', r.ok, msg(r));

const stateId = (await call('GET', '/masters/lookups/states')).json[0]?.id;
r = await call('POST', '/masters/companies', { compname: 'QA Company', cmpaddr1: 'QA Street 1', cmpstate: stateId, cmpcountry: 1, cmpcity: 'QA City' });
check('Company: create', r.ok, msg(r));
const companyId = await idOf('companies', 'compname', 'QA Company');
const comp = (await call('GET', `/masters/companies/${companyId}`)).json;
r = await call('PUT', `/masters/companies/${companyId}`, { ...comp, compname: 'QA Company Edited' });
check('Company: edit', r.ok && (await list('companies')).some((c) => c.compname === 'QA Company Edited'), msg(r));
r = await del('companies', companyId);
check('Company: delete (nothing uses companies)', r.ok, msg(r));

// ---------------------------------------------------------------------------
section('14. Process Entry Report (list of month sheets): search and filters');
const sheets = async (q) => (await call('GET', `/transactions/daily-entry/list?${new URLSearchParams({ limit: '100', ...q })}`)).json;
let pl = await sheets({ search: 'QA Worker A' });
check('search by worker name finds only that worker\'s sheets (Sep + Oct)', pl.data.length === 2 && pl.data.every((x) => x.operatorname === 'QA Worker A'), JSON.stringify(pl.data.map((x) => x.operatorname + ' ' + x.monthname)));
pl = await sheets({ search: 'qa-w2' });
check('search by employee code (any case) finds Worker B (Oct 2026 + Jan 2027)', pl.data.length === 2 && pl.data.every((x) => x.operatorname === 'QA Worker B'), JSON.stringify(pl.data.map((x) => x.operatorname + ' ' + x.monthname)));
pl = await sheets({ year: '2026', month: 'October', groupId: String(groupId) });
const octSheetRows = await loggedRows('October');
check('Year + Month + Group filters: one sheet per QA worker in October', pl.data.length === new Set(octSheetRows.map((x) => x.worker)).size, JSON.stringify(pl.data.map((x) => x.operatorname)));
check('each sheet\'s Total Qty = that worker\'s October pieces (deleted rows not counted)',
  pl.data.every((x) => Number(x.totalqty) === sum(octSheetRows.filter((e) => e.worker === x.operatorname), (e) => Number(e.totalqty))));
check('month in lower case gives the same sheets', (await sheets({ year: '2026', month: 'october', groupId: String(groupId) })).data.length === pl.data.length);
check('year 2027 finds Worker B\'s January 2027 sheet', (await sheets({ year: '2027', groupId: String(groupId) })).data.some((x) => x.operatorname === 'QA Worker B' && x.monthname === 'January'));
r = await call('GET', '/transactions/daily-entry/list?year=abc');
check('year "abc" gives a plain message, not a database error', r.status === 400 && /4 digits/.test(msg(r)), msg(r));
const p1 = (await call('GET', `/transactions/daily-entry/list?groupId=${groupId}&limit=2&page=1`)).json;
const p2 = (await call('GET', `/transactions/daily-entry/list?groupId=${groupId}&limit=2&page=2`)).json;
check('pages: 2 per page, page 2 has different sheets, same total count',
  p1.data.length === 2 && p2.data.length > 0 && !p2.data.some((x) => p1.data.some((y) => y.id === x.id)) && p1.pagination.totalCount === p2.pagination.totalCount, JSON.stringify([p1.pagination, p2.pagination]));
check('total pages = total sheets / 2, rounded up', p1.pagination.totalPages === Math.ceil(p1.pagination.totalCount / 2));

// ---------------------------------------------------------------------------
section('15. Print sheets: Lot Operation Print shows the same steps as Material Issue');
for (const lot of ['QA-L1', 'QA-L2', 'QA-L4']) {
  const printed = (await call('GET', `/transactions/lot-operations/by-lot/${lot}`)).json;
  const mi = await steps(lot);
  check(`${lot}: print sheet has ${mi.length} steps in step order, same operations and rates`,
    printed.length === mi.length && printed.every((p, i) => p.stepno === mi[i].stepno && p.opname === mi[i].operation_name && Number(p.rate) === mi[i].rate && p.stkcategoryname === mi[i].process_name),
    JSON.stringify(printed.map((p) => [p.stepno, p.opname, p.rate, p.stkcategoryname])) + ' vs ' + JSON.stringify(mi.map((x) => [x.stepno, x.operation_name, x.rate, x.process_name])));
}
const mapForPrint = (await call('GET', '/transactions/lot-operations')).json.find((m) => m.lotno === 'QA-L1');
const mapDetail = (await call('GET', `/transactions/lot-operations/${mapForPrint.id}`)).json;
check('Lot Operation Map loads each step with its operation and process name (used by its Print button)',
  mapDetail.operations.length > 0 && mapDetail.operations.every((o) => o.opname && o.processname));
const joPrint = (await call('GET', `/transactions/job-orders/${l1Id}`)).json;
check('Job Order print data: lot, order no., product, cut qty are all there', joPrint.fabriclotno === 'QA-L1' && joPrint.joborderno === 'QA/JO/001' && joPrint.stockitemname === 'QA Formal Shirt' && Number(joPrint.cutqty) > 0, JSON.stringify(joPrint));

// ---------------------------------------------------------------------------
section('16. Excel export: heading rows, real numbers, leading zeros kept (uses the app\'s own export code)');
{
  const { exportToExcel } = await import(new URL('../client/src/utils/exportUtils.ts', import.meta.url));
  const XLSX = await import(new URL('../client/node_modules/xlsx/xlsx.mjs', import.meta.url));
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  XLSX.set_fs(fs);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'garmentmfg-xlsx-'));
  const here = process.cwd();
  process.chdir(dir);
  const salRows = await report('salary', qaFilter('October'));
  exportToExcel({
    filename: 'Salary', title: 'QA Clothing - Salary Report', subtitle: 'October 2026', sheetName: 'Salary Report', data: [...salRows, { yearname: '2026', monthname: 'October', ledgrpname: 'x', empcode: '001', operatorname: 'Zero Code', totaldays: 1, totamt: '0.50' }],
    columns: [
      { header: 'Emp Code', key: 'empcode' }, { header: 'Employee Name', key: 'operatorname' },
      { header: 'Total Days', key: 'totaldays' },
      { header: 'Amount', key: 'totamt', render: (x) => Number(x.totamt || 0).toFixed(2) },
    ],
  });
  const file = fs.readdirSync(dir).find((f) => f.endsWith('.xlsx'));
  const ws = XLSX.readFile(path.join(dir, file), { cellNF: true }).Sheets['Salary Report'];
  process.chdir(here);
  const n = salRows.length;
  const first = 5; // rows 1-2: the heading, 3: empty, 4: column headers, then the data
  check('Excel heading: title in A1, second line in A2, column headers in row 4', ws?.A1?.v === 'QA Clothing - Salary Report' && ws?.A2?.v === 'October 2026' && ws?.A4?.v === 'Emp Code', JSON.stringify([ws?.A1?.v, ws?.A2?.v, ws?.A4?.v]));
  check('Excel heading spread across the whole table (merged A to D)', (ws?.['!merges'] || []).filter((m) => m.s.c === 0 && m.e.c === 3).length === 2);
  const amounts = [...Array(n).keys()].map((i) => ws[`D${i + first}`]);
  check('Excel file created with one line per Salary row', !!file && ws[`B${n + first}`]?.v === 'Zero Code');
  check('Amount cells are real numbers (Excel can SUM them)', amounts.every((c) => c.t === 'n'), JSON.stringify(amounts.map((c) => c.t)));
  check('Amount cells still show 2 decimals', amounts.every((c) => c.z === '0.00'), JSON.stringify(amounts.map((c) => c.z)));
  check('Excel SUM of Amount = Salary total', Math.abs(amounts.reduce((a, c) => a + c.v, 0) - sum(salRows, (x) => Number(x.totamt))) < 0.01);
  check('code "001" stays "001" (leading zeros kept)', ws[`A${n + first}`].v === '001' && ws[`A${n + first}`].t === 's', JSON.stringify(ws[`A${n + first}`]));
  check('0.50 becomes the number 0.5 shown as 0.50', ws[`D${n + first}`].v === 0.5 && XLSX.utils.format_cell(ws[`D${n + first}`]) === '0.50');
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
section('17. Users & Rights (Admin > Create Login)');
// A request as another login (separate cookie from ADMIN's)
const loginAs = async (code, password) => {
  const res = await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: code, password }) });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};
const callAs = async (who, method, path, body) => {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Cookie: who }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, ok: res.ok, json };
};
const empNow = (await call('GET', '/masters/employees')).json;
const empId = (name) => empNow.find((e) => e.operatorname === name)?.id;
const codeOf = (name) => empNow.find((e) => e.operatorname === name)?.empcode;
const loginIdOf = async (name) => (await call('GET', '/admin/logins')).json.find((l) => l.operatorname === name)?.id;
const setRights = async (name, rights, extra = {}) => {
  const l = (await call('GET', `/admin/logins/${await loginIdOf(name)}`)).json;
  return call('PUT', `/admin/logins/${l.id}`, { password: l.password, isadmin: l.isadmin, isactive: l.isactive, rights, ...extra });
};

console.log('  Creating logins');
r = await call('GET', '/admin/employees-without-login');
check('employees without a login include QA Worker C, not ADMIN', r.json.some((e) => e.operatorname === 'QA Worker C') && !r.json.some((e) => e.empcode === 'ADMIN'));
r = await call('POST', '/admin/logins', { empid: empId('QA Worker C'), password: '' });
check('login without a password refused', !r.ok, msg(r));
r = await call('POST', '/admin/logins', {
  empid: empId('QA Worker C'), password: 'clerk1', isadmin: false, isactive: true,
  rights: { 'transactions.dailyEntry': ['create'], 'transactions.materialIssue': ['view'], 'no.such.screen': ['view'], 'masters.unit': ['fly'] },
});
check('admin creates a clerk login for QA Worker C', r.ok, msg(r));
r = await call('POST', '/admin/logins', { empid: empId('QA Worker C'), password: 'x' });
check('a second login for the same employee refused', !r.ok && /already has a login/.test(msg(r)), msg(r));
const clerkRow = (await call('GET', '/admin/logins')).json.find((l) => l.operatorname === 'QA Worker C');
check('login list shows the code as username and the password', clerkRow?.empcode === codeOf('QA Worker C') && clerkRow?.password === 'clerk1', JSON.stringify(clerkRow));
check('rights cleaned: "create" also gets "view"; unknown screens/actions dropped',
  JSON.stringify(clerkRow.rights) === JSON.stringify({ 'transactions.materialIssue': ['view'], 'transactions.dailyEntry': ['view', 'create'] })
  || JSON.stringify(Object.keys(clerkRow.rights).sort()) === JSON.stringify(['transactions.dailyEntry', 'transactions.materialIssue']) && clerkRow.rights['transactions.dailyEntry'].join() === 'view,create',
  JSON.stringify(clerkRow.rights));

console.log('  Logging in');
let lr = await loginAs(codeOf('QA Worker C'), 'wrong');
check('wrong password refused', !lr.ok, msg(lr));
lr = await loginAs(codeOf('QA Worker C').toLowerCase(), 'clerk1');
check('clerk logs in with the employee code (any case)', lr.ok && lr.json.user.username === codeOf('QA Worker C') && lr.json.user.isAdmin === false, JSON.stringify(lr.json));
let clerk = lr.cookie;
r = await callAs(clerk, 'GET', '/auth/me');
check('/auth/me gives the clerk\'s rights for the screens to use', r.json.user.rights['transactions.dailyEntry']?.includes('create') && !r.json.user.rights['reports.salary']);

console.log('  What the clerk can and can\'t do');
const stitchRate = opDefs.find((o) => o[0] === 'QA Body Stitch')[2];
const decSheet = (rows, extra = {}) => callAs(clerk, 'POST', '/transactions/daily-entry/save-matrix', {
  monthName: 'December', yearName: 2026, empId: W['QA Worker A'], ledGrpId: groupId,
  rows: rows.map((x) => ({ id: x.id || 0, lotNo: 'QA-L4', processId: oid['QA Body Stitch'], processName: 'QA Body Stitch', remark: x.remark || '', ...days(x.days) })), ...extra,
});
r = await decSheet([{ days: { 1: 2 } }]);
check('clerk (Create) adds a new row to a December sheet', r.ok, msg(r));
const decRow = (await sheet('QA Worker A', 'December'))[0];
r = await decSheet([{ id: decRow.id, days: { 1: 2 } }]);
check('clerk saves the sheet again unchanged (no Edit needed)', r.ok, msg(r));
r = await decSheet([{ id: decRow.id, days: { 1: 3 } }]);
check('clerk changing a saved row refused (no Edit)', r.status === 403 && /change Daily Process Entry/.test(msg(r)), msg(r));
console.log('     message:', msg(r));
r = await decSheet([], { deletedRowIds: [decRow.id] });
check('clerk removing a saved row refused (no Delete)', r.status === 403, msg(r));
r = await callAs(clerk, 'DELETE', `/transactions/daily-entry/header/${await headerId('QA Worker A', 'December')}`);
check('clerk deleting a whole sheet refused', r.status === 403, msg(r));
r = await callAs(clerk, 'POST', '/transactions/daily-entry/save', { monthName: 'December', yearName: 2026, empId: W['QA Worker A'], ledGrpId: groupId, lotNo: 'QA-L4', processId: oid['QA Body Stitch'], processName: 'x', ...days({ 2: 1 }) });
check('clerk on the one-row save refused (admin only now)', r.status === 403, msg(r));
check('refused saves changed nothing', Number((await sheet('QA Worker A', 'December'))[0].totalqty) === 2);
r = await callAs(clerk, 'GET', '/transactions/material-issue/lot-details/QA-L1');
check('clerk can view Material Issue', r.ok);
r = await callAs(clerk, 'POST', '/transactions/material-issue/save', { lotNo: 'QA-L4', operationId: oid['QA Body Stitch'], qty: 1 });
check('clerk sending pieces refused (no Create on Material Issue)', r.status === 403, msg(r));
r = await callAs(clerk, 'GET', '/reports/salary?year=2026&month=October');
check('clerk opening Salary report refused', r.status === 403, msg(r));
r = await callAs(clerk, 'POST', '/masters/units', { unitname: 'QA Nope', unittype: 'Simple', decimalplaces: 0 });
check('clerk adding a Unit refused', r.status === 403, msg(r));
for (const path of ['/admin/logins', '/admin/screens', '/admin/employees-without-login']) {
  r = await callAs(clerk, 'GET', path);
  check(`clerk opening ${path} refused (admins only)`, r.status === 403, msg(r));
}
r = await callAs(clerk, 'GET', '/masters/products');
check('clerk can\'t read the product list (no Product or Job Order view)', r.status === 403, msg(r));

console.log('  Rights change at once (no new login needed)');
r = await setRights('QA Worker C', { 'transactions.dailyEntry': ['view', 'create'], 'reports.salary': ['view'] });
check('admin gives the clerk Salary view', r.ok, msg(r));
r = await callAs(clerk, 'GET', '/reports/salary?year=2026&month=October');
check('clerk\'s very next request can open Salary', r.ok, msg(r));

console.log('  Special rights');
r = await setRights('QA Worker C', { 'transactions.lotMap': ['view', 'edit'] });
const mapQ1 = (await call('GET', '/transactions/lot-operations')).json.find((m) => m.lotno === 'QA-L1');
const mapQ1d = (await call('GET', `/transactions/lot-operations/${mapQ1.id}`)).json;
const firstStepRate = Number(mapQ1d.operations[0].rate);
r = await callAs(clerk, 'PUT', `/transactions/lot-operations/${mapQ1.id}`, { ...mapQ1d.header, operations: mapQ1d.operations });
check('Lot Map Edit without "Change rates": saving with the same rates allowed', r.ok, msg(r));
r = await callAs(clerk, 'PUT', `/transactions/lot-operations/${mapQ1.id}`, { ...mapQ1d.header, operations: mapQ1d.operations.map((o, i) => (i === 0 ? { ...o, rate: firstStepRate + 1 } : o)) });
check('changing a rate refused without "Change rates"', r.status === 403 && /Change rates/.test(msg(r)), msg(r));
console.log('     message:', msg(r));
r = await setRights('QA Worker C', { 'transactions.lotMap': ['view', 'edit', 'changeRates'] });
r = await callAs(clerk, 'PUT', `/transactions/lot-operations/${mapQ1.id}`, { ...mapQ1d.header, operations: mapQ1d.operations.map((o, i) => (i === 0 ? { ...o, rate: firstStepRate + 1 } : o)) });
check('with "Change rates" the rate change is allowed', r.ok, msg(r));
r = await callAs(clerk, 'PUT', `/transactions/lot-operations/${mapQ1.id}`, { ...mapQ1d.header, operations: mapQ1d.operations });
check('rate set back', r.ok && Number((await steps('QA-L1'))[0].rate) === firstStepRate, msg(r));

r = await setRights('QA Worker C', { 'transactions.jobOrder': ['view', 'edit'] });
const l2now = (await call('GET', `/transactions/job-orders/${l2Id}`)).json;
r = await callAs(clerk, 'PUT', `/transactions/job-orders/${l2Id}`, { ...l2now, lotclosed: 'Yes' });
check('closing a lot refused without "Close / reopen lot"', r.status === 403 && /Close \/ reopen lot/.test(msg(r)), msg(r));
r = await callAs(clerk, 'PUT', `/transactions/job-orders/${l2Id}`, { ...l2now });
check('editing the lot without changing Closed is allowed', r.ok, msg(r));
r = await setRights('QA Worker C', { 'transactions.jobOrder': ['view', 'edit', 'closeLot'] });
r = await callAs(clerk, 'PUT', `/transactions/job-orders/${l2Id}`, { ...l2now, lotclosed: 'Yes' });
check('with "Close / reopen lot" closing is allowed', r.ok, msg(r));
r = await callAs(clerk, 'PUT', `/transactions/job-orders/${l2Id}`, { ...l2now, lotclosed: 'No' });
check('and reopening', r.ok, msg(r));

r = await setRights('QA Worker C', { 'utility.updateAttendance': ['view'] });
r = await callAs(clerk, 'GET', '/utility/attendance/records?month=October&year=2026');
check('Update Attendance view: records can be searched', r.ok, msg(r));
r = await callAs(clerk, 'POST', '/utility/attendance/update', { month: 'September', year: '2026' });
check('running Update Attendance refused without "Run Update Attendance"', r.status === 403, msg(r));

console.log('  Employees who have a login');
r = await call('POST', '/admin/logins', { empid: empId('QA Outside Work'), password: 'boss2', isadmin: true });
check('second admin login created (QA Outside Work)', r.ok, msg(r));
r = await setRights('QA Worker C', { 'masters.employee': ['view', 'edit', 'delete'] });
const outsideEmp = (await call('GET', `/masters/employees/${empId('QA Outside Work')}`)).json;
r = await callAs(clerk, 'PUT', `/masters/employees/${outsideEmp.id}`, { ...outsideEmp, operatorname: 'Hacked' });
check('clerk editing an employee who has a login refused', r.status === 403 && /has a login/.test(msg(r)), msg(r));
r = await callAs(clerk, 'DELETE', `/masters/employees/${outsideEmp.id}`);
check('clerk deleting an employee who has a login refused', !r.ok && /has a login/.test(msg(r)), msg(r));
const workerAEmp = (await call('GET', `/masters/employees/${W['QA Worker A']}`)).json;
r = await callAs(clerk, 'PUT', `/masters/employees/${workerAEmp.id}`, { ...workerAEmp });
check('clerk (Edit) can still edit an employee without a login', r.ok, msg(r));

r = await call('POST', '/masters/employees', { operatorname: 'QA Login Temp', empcode: 'QA-W8', empgrp: groupId, contactno: '9000008888' });
const tempEmpId = (await call('GET', '/masters/employees')).json.find((e) => e.operatorname === 'QA Login Temp')?.id;
r = await call('POST', '/admin/logins', { empid: tempEmpId, password: 'temp1' });
check('temporary employee given a login', r.ok, msg(r));
r = await call('DELETE', `/masters/employees/${tempEmpId}`);
check('admin deletes that employee (not in use): allowed', r.ok, msg(r));
check('their login is removed with them', !(await call('GET', '/admin/logins')).json.some((l) => l.empcode === 'QA-W8') && !(await loginAs('QA-W8', 'temp1')).ok);

console.log('  Admin safety rules');
const boss2 = (await loginAs(codeOf('QA Outside Work'), 'boss2')).cookie;
r = await callAs(boss2, 'GET', '/auth/me');
check('second admin logs in as an admin', r.json?.user?.isAdmin === true);
const boss2Login = await loginIdOf('QA Outside Work');
r = await callAs(boss2, 'PUT', `/admin/logins/${boss2Login}`, { password: 'boss2', isadmin: false, isactive: true, rights: {} });
check('an admin can\'t remove their own admin tick', !r.ok && /your own login/.test(msg(r)), msg(r));
r = await callAs(boss2, 'PUT', `/admin/logins/${boss2Login}`, { password: 'boss2', isadmin: true, isactive: false, rights: {} });
check('an admin can\'t deactivate themselves', !r.ok, msg(r));
r = await callAs(boss2, 'DELETE', `/admin/logins/${boss2Login}`);
check('an admin can\'t remove their own login', !r.ok, msg(r));
r = await callAs(boss2, 'DELETE', `/masters/employees/${empId('QA Outside Work')}`);
check('an admin can\'t delete their own employee record', !r.ok && /your own login/.test(msg(r)), msg(r));
r = await call('DELETE', '/admin/logins/1');
check('ADMIN can\'t remove its own login', !r.ok, msg(r));
r = await call('POST', '/admin/logins', { empid: W['QA Worker B'], password: 'boss3', isadmin: true });
const boss3Login = await loginIdOf('QA Worker B');
r = await callAs(boss2, 'PUT', `/admin/logins/${boss3Login}`, { password: 'boss3', isadmin: false, isactive: true, rights: {} });
check('one admin can take away another admin\'s admin tick', r.ok && (await call('GET', `/admin/logins/${boss3Login}`)).json.isadmin === 'NO', msg(r));
const boss3 = (await loginAs(codeOf('QA Worker B'), 'boss3')).cookie;
r = await callAs(boss3, 'GET', '/admin/logins');
check('...and that person loses Admin at once', r.status === 403);
r = await call('PUT', `/admin/logins/${boss2Login}`, { password: 'boss2', isadmin: false, isactive: true, rights: {} });
check('ADMIN takes away the second admin\'s admin tick', r.ok, msg(r));
r = await callAs(boss2, 'GET', '/admin/logins');
check('second admin is now a normal user', r.status === 403);

console.log('  Passwords, deactivating and removing logins');
const clerkLogin = await loginIdOf('QA Worker C');
r = await call('PUT', `/admin/logins/${clerkLogin}`, { password: 'clerk2', isadmin: false, isactive: true, rights: {} });
check('admin changes the clerk\'s password', r.ok);
check('old password no longer works, new one does', !(await loginAs(codeOf('QA Worker C'), 'clerk1')).ok && (await loginAs(codeOf('QA Worker C'), 'clerk2')).ok);
clerk = (await loginAs(codeOf('QA Worker C'), 'clerk2')).cookie;
r = await call('PUT', `/admin/logins/${clerkLogin}`, { password: 'clerk2', isadmin: false, isactive: false, rights: {} });
check('admin deactivates the clerk', r.ok, msg(r));
r = await callAs(clerk, 'GET', '/auth/me');
check('the clerk\'s open session stops working at once', r.status === 401, msg(r));
lr = await loginAs(codeOf('QA Worker C'), 'clerk2');
check('deactivated clerk can\'t log in', !lr.ok && /deactivated/.test(msg(lr)), msg(lr));
r = await call('DELETE', `/admin/logins/${clerkLogin}`);
check('admin removes the clerk\'s login', r.ok, msg(r));
check('employee QA Worker C and their work are still there', (await call('GET', '/masters/employees')).json.some((e) => e.operatorname === 'QA Worker C') && (await report('salary', qaFilter('October'))).some((x) => x.operatorname === 'QA Worker C'));
check('QA Worker C is back in "employees without a login"', (await call('GET', '/admin/employees-without-login')).json.some((e) => e.operatorname === 'QA Worker C'));
r = await call('GET', '/auth/me');
check('ADMIN is still an admin after all of this', r.json?.user?.isAdmin === true && r.json.user.username === 'ADMIN');

// ---------------------------------------------------------------------------
section('18. Trying to break the login rules');
const jwt = (await import(new URL('../server/node_modules/jsonwebtoken/index.js', import.meta.url))).default;
const outsideCode = codeOf('QA Outside Work');

console.log('  A normal user with every Master right tries to remove the only admin');
const onlyAdminCount = (await call('GET', '/admin/logins')).json.filter((l) => l.isadmin === 'YES' && l.isactive === 'YES').length;
check('right now ADMIN is the only active admin', onlyAdminCount === 1, String(onlyAdminCount));
// QA Outside Work already has a (non-admin) login from section 17: give it every Master right
r = await call('PUT', `/admin/logins/${await loginIdOf('QA Outside Work')}`, {
  password: 'p1', isadmin: false, isactive: true,
  rights: Object.fromEntries((await call('GET', '/admin/screens')).json.filter((x) => x.key.startsWith('masters.')).map((x) => [x.key, [...x.actions]])),
});
check('power user: every right on every Master screen, but not admin', r.ok, msg(r));
const power = (await loginAs(outsideCode, 'p1')).cookie;
const adminEmp = (await call('GET', '/masters/employees')).json.find((e) => e.empcode === 'ADMIN');
r = await callAs(power, 'PUT', `/masters/employees/${adminEmp.id}`, { ...adminEmp, empcode: 'GONE', operatorname: 'x' });
check('can\'t edit the ADMIN employee (e.g. change its code = its username)', r.status === 403, msg(r));
r = await callAs(power, 'DELETE', `/masters/employees/${adminEmp.id}`);
check('can\'t delete the ADMIN employee', !r.ok, msg(r));
const officeGroup = (await call('GET', '/masters/employee-groups')).json.find((g) => g.ledgrpname === 'Office Staff');
r = await callAs(power, 'DELETE', `/masters/employee-groups/${officeGroup.id}`);
check('can\'t delete ADMIN\'s group (Office Staff)', !r.ok, msg(r));
r = await callAs(power, 'POST', '/masters/employees', { operatorname: 'Fake Admin', empcode: 'admin', empgrp: groupId, contactno: '9000007777' });
check('can\'t create another employee with code "admin"', !r.ok, msg(r));
for (const [m, path, body] of [
  ['GET', '/admin/logins'], ['POST', '/admin/logins', { empid: empId('QA Outside Work'), password: 'x', isadmin: true }],
  ['PUT', '/admin/logins/1', { password: 'hacked', isadmin: false, isactive: false, rights: {} }], ['DELETE', '/admin/logins/1'],
]) {
  r = await callAs(power, m, path, body);
  check(`can't ${m} ${path} (admins only)`, r.status === 403, msg(r));
}
const myLogin = await loginIdOf('QA Outside Work');
r = await callAs(power, 'PUT', `/admin/logins/${myLogin}`, { password: 'p1', isadmin: true, isactive: true, rights: {} });
check('can\'t make themselves admin', r.status === 403 && !(await callAs(power, 'GET', '/auth/me')).json.user.isAdmin);
check('ADMIN still logs in with Admin and is still admin', (await loginAs('ADMIN', 'Admin')).json?.user?.isAdmin === true);

console.log('  The only admin tries to remove itself');
const adminSelf = (await call('GET', '/admin/logins/1')).json;
for (const [what, body] of [['un-admin', { isadmin: false, isactive: true }], ['deactivate', { isadmin: true, isactive: false }]]) {
  r = await call('PUT', '/admin/logins/1', { password: adminSelf.password, rights: {}, ...body });
  check(`ADMIN can't ${what} itself`, !r.ok, msg(r));
}
r = await call('DELETE', '/admin/logins/1');
check('ADMIN can\'t remove its own login', !r.ok, msg(r));
r = await call('DELETE', `/masters/employees/${adminEmp.id}`);
check('ADMIN can\'t delete its own employee record', !r.ok, msg(r));
r = await call('PUT', '/admin/logins/1', { password: adminSelf.password, isadmin: true, isactive: true, rights: {} });
check('ADMIN can still change its own password / rights (stays admin)', r.ok && (await call('GET', '/auth/me')).json.user.isAdmin);

console.log('  Reading data without the right (the "read" loophole)');
r = await setRights('QA Outside Work', { 'transactions.materialIssue': ['view'] });
for (const path of [
  '/transactions/daily-entry/list?year=2026', `/transactions/daily-entry/details-by-header/${await headerId('QA Worker A', 'October')}`,
  '/transactions/daily-entry/operation-quota/QA-L1/' + oid['QA Shirt Cut'], '/masters/employees', `/masters/employees/${W['QA Worker A']}`,
  '/masters/products', '/reports/groups', '/reports/salary?year=2026&month=October', '/transactions/job-orders',
  '/transactions/lot-operations', '/utility/spine-attendance?month=October&year=2026', '/masters/no-such-thing',
]) {
  r = await callAs(power, 'GET', path);
  check(`Material-Issue-only user can't read ${path.split('?')[0]}`, r.status === 403, `${r.status} ${msg(r)}`);
}
r = await callAs(power, 'GET', '/transactions/material-issue/lot-details/QA-L1');
check('...but can read Material Issue', r.ok);
r = await setRights('QA Outside Work', { 'transactions.jobOrder': ['view'] });
r = await callAs(power, 'GET', '/masters/products');
check('Job Order Booking view can read products (its form needs them)', r.ok);
r = await callAs(power, 'GET', '/masters/products/' + productId);
check('...and one product', r.ok);
r = await call('GET', '/masters/no-such-thing');
check('an admin reading an unknown address gets "not found", not a rights error', r.status === 404 || (r.status !== 403), String(r.status));

console.log('  Rate trick: remove a step and add it back to reset its rate');
const qa1 = (await call('GET', `/transactions/lot-operations/${mapQ1.id}`)).json;
const s1 = qa1.operations[0];
const defaultRate = opDefs.find((o) => o[0] === s1.opname)[2];
r = await call('PUT', `/transactions/lot-operations/${mapQ1.id}`, { ...qa1.header, operations: qa1.operations.map((o, i) => (i === 0 ? { ...o, rate: defaultRate + 3 } : o)) });
check(`ADMIN sets step 1's lot rate to ${defaultRate + 3} (default is ${defaultRate})`, r.ok, msg(r));
r = await setRights('QA Outside Work', { 'transactions.lotMap': ['view', 'edit'] });
const qa1b = (await call('GET', `/transactions/lot-operations/${mapQ1.id}`)).json;
const readded = qa1b.operations.map((o, i) => (i === 0 ? { stepno: o.stepno, processid: o.processid, operations: o.operations, rate: defaultRate } : o));
r = await callAs(power, 'PUT', `/transactions/lot-operations/${mapQ1.id}`, { ...qa1b.header, operations: readded });
check('re-adding the step as "new" with the default rate is refused without "Change rates"', r.status === 403 && /Change rates/.test(msg(r)), msg(r));
check('step 1 still has the lot rate', Number((await steps('QA-L1'))[0].rate) === defaultRate + 3);
r = await call('PUT', `/transactions/lot-operations/${mapQ1.id}`, { ...qa1b.header, operations: qa1b.operations.map((o, i) => (i === 0 ? { ...o, rate: Number(s1.rate) } : o)) });
check('ADMIN sets the rate back', r.ok && Number((await steps('QA-L1'))[0].rate) === Number(s1.rate), msg(r));

console.log('  Fake or old logins');
// the app's real secret, so a "valid" cookie for a missing login is really tested
const fsMod = await import('node:fs');
// (an installed copy has its own random secret: give it in GARMENTMFG_SESSION_SECRET)
const secret = process.env.GARMENTMFG_SESSION_SECRET || (fsMod.readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^SESSION_SECRET=(.*)$/m) || [])[1]?.trim();
check('test can read the app secret from .env', !!secret);
r = await callAs('garmentmfg_token=not-a-real-token', 'GET', '/auth/me');
check('made-up cookie refused', r.status === 401);
r = await callAs('garmentmfg_token=' + jwt.sign({ id: 1 }, 'wrong-secret'), 'GET', '/auth/me');
check('cookie signed with a wrong secret (pretending to be ADMIN) refused', r.status === 401);
r = await callAs('garmentmfg_token=' + jwt.sign({ id: 999999 }, secret), 'GET', '/auth/me');
check('correctly signed cookie for a login that doesn\'t exist refused', r.status === 401);
r = await callAs('garmentmfg_token=' + jwt.sign({ id: 1 }, secret), 'GET', '/auth/me');
check('(control) correctly signed cookie for ADMIN works, so the checks above are real', r.ok && r.json.user.username === 'ADMIN');
const oldPower = power;
r = await call('DELETE', `/admin/logins/${myLogin}`);
r = await call('POST', '/admin/logins', { empid: empId('QA Outside Work'), password: 'p2' });
check('login removed and given again', r.ok, msg(r));
r = await callAs(oldPower, 'GET', '/auth/me');
check('the old session of the removed login doesn\'t come back', r.status === 401);
for (const [what, body] of [
  ['empty login', {}], ['only spaces', { username: '  ', password: '  ' }],
  ['SQL trick in the code', { username: "' OR 1=1 --", password: "' OR 1=1 --" }], ['right code, empty password', { username: 'ADMIN', password: '' }],
  ['password in other case', { username: 'ADMIN', password: 'admin' }],
]) {
  const res = await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  check(`login refused: ${what}`, !res.ok);
}
const meUser = (await call('GET', '/auth/me')).json.user;
check('/auth/me never includes the password', !('password' in meUser), JSON.stringify(meUser));

console.log('  Odd rights sent to the server');
const pid4 = await loginIdOf('QA Outside Work');
for (const bad of ['view', 123, null, ['view'], { 'masters.unit': 'view' }, { 'masters.unit': [1, null, 'delete'] }]) {
  r = await call('PUT', `/admin/logins/${pid4}`, { password: 'p2', isadmin: false, isactive: true, rights: bad });
  const saved = (await call('GET', `/admin/logins/${pid4}`)).json.rights;
  const okShape = r.ok && Object.values(saved).every((v) => Array.isArray(v) && v.every((x) => typeof x === 'string'));
  check(`rights ${JSON.stringify(bad)} saved safely as ${JSON.stringify(saved)}`, okShape, msg(r));
}

// ---------------------------------------------------------------------------
section('19. Home page: Open Lots / Closed Lots counts');
// The Home page counts lots from the Job Order list (same list Job Order Booking shows);
// clicking a count opens Job Order Booking filtered to open (Closed Lot = No) or closed (Yes) lots.
const homeCounts = async (who = null) => {
  const res = who ? await callAs(who, 'GET', '/transactions/job-orders') : await call('GET', '/transactions/job-orders');
  if (!res.ok) return { status: res.status };
  const closed = res.json.filter((l) => String(l.lotclosed || 'No').toLowerCase() === 'yes');
  return { open: res.json.length - closed.length, closed: closed.length, openLots: res.json.filter((l) => !closed.includes(l)).map((l) => l.fabriclotno), closedLots: closed.map((l) => l.fabriclotno) };
};
const dbCounts = async () => {
  const all = (await call('GET', '/transactions/job-orders')).json;
  return all.length;
};
let hc = await homeCounts();
check('open + closed = every active lot', hc.open + hc.closed === (await dbCounts()) && hc.open > 0);
check('QA-L2 is counted as open', hc.openLots.includes('QA-L2') && !hc.closedLots.includes('QA-L2'));
const l2jo = (await call('GET', `/transactions/job-orders/${l2Id}`)).json;
r = await call('PUT', `/transactions/job-orders/${l2Id}`, { ...l2jo, lotclosed: 'Yes' });
const hc2 = await homeCounts();
check('closing QA-L2: Open goes down by 1, Closed up by 1, and it is in the closed list', r.ok && hc2.open === hc.open - 1 && hc2.closed === hc.closed + 1 && hc2.closedLots.includes('QA-L2'), JSON.stringify([hc, hc2].map((x) => [x.open, x.closed])));
r = await call('PUT', `/transactions/job-orders/${l2Id}`, { ...l2jo, lotclosed: 'No' });
const hc3 = await homeCounts();
check('reopening QA-L2: back to the original counts', r.ok && hc3.open === hc.open && hc3.closed === hc.closed);
check('deleted lots are not counted', !hc3.openLots.includes('QA-L0') && !hc3.closedLots.includes('QA-L0'));
const viewer = await loginIdOf('QA Outside Work');
await call('PUT', `/admin/logins/${viewer}`, { password: 'p2', isadmin: false, isactive: true, rights: { 'reports.salary': ['view'] } });
const vc = (await loginAs(outsideCode, 'p2')).cookie;
check('without Job Order Booking view: the lot list (and so the counts) is refused', (await homeCounts(vc)).status === 403);
await call('PUT', `/admin/logins/${viewer}`, { password: 'p2', isadmin: false, isactive: true, rights: { 'transactions.jobOrder': ['view'] } });
const hcv = await homeCounts(vc);
check('with Job Order Booking view: same counts as ADMIN sees', hcv.open === hc3.open && hcv.closed === hc3.closed);

// ---------------------------------------------------------------------------
section('20. A lot can be deleted only when nothing is left on it');
r = await call('POST', '/transactions/job-orders', jo({ joborderno: 'QA/JO/009', fabriclotno: 'QA-L9', cutqty: 20, totalqtypcs: 20 }));
check('new order QA/JO/009 lot QA-L9 cut 20', r.ok, msg(r));
const l9Id = r.json?.id;
r = await call('POST', '/transactions/lot-operations', { ...mapHeader, lotno: 'QA-L9', joborderno: 'QA/JO/009', orderqty: 20, operations: [row(1, 'QA Shirt Cut')] });
check('QA-L9 mapped', r.ok, msg(r));
const map9Id = r.json?.id;
r = await call('DELETE', `/transactions/job-orders/${l9Id}`);
check('deleting QA-L9 with its lot map is rejected', !r.ok && /Lot Operation Map/.test(msg(r)), msg(r));
r = await logRow('QA Worker C', 'QA Shirt Cut', { 5: 3 }, 'QA-L9');
check('Worker C logs 3 on QA-L9', r.ok, msg(r));
r = await call('DELETE', `/transactions/job-orders/${l9Id}`);
check('deleting QA-L9 with lot map + daily work is rejected (both named)', !r.ok && /Lot Operation Map, Daily Process Entry/.test(msg(r)), msg(r));
const c9 = await rowOf('QA Worker C', 'QA Shirt Cut', 'QA-L9');
r = await call('DELETE', `/transactions/daily-entry/detail/${c9?.id}`);
check('deleting that daily entry allowed', r.ok, msg(r));
r = await call('DELETE', `/transactions/lot-operations/${map9Id}`);
check('deleting the QA-L9 lot map allowed (no work left)', r.ok, msg(r));
let l9row = (await call('GET', `/transactions/job-orders/${l9Id}`)).json;
check('with nothing left on it, QA/JO/009 is editable again', l9row.order_in_use === null, l9row.order_in_use);
r = await call('PUT', `/transactions/job-orders/${l9Id}`, { ...l9row, style: 'QA-STYLE-L9' });
check('style of QA-L9 can be fixed again', r.ok, msg(r));
r = await call('DELETE', `/transactions/job-orders/${l9Id}`);
check('deleting QA-L9 with nothing on it is allowed', r.ok, msg(r));
check('QA-L9 is gone from Job Order Booking', !(await call('GET', '/transactions/job-orders')).json.some((j) => j.fabriclotno === 'QA-L9'));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (failures.length) console.log('Failed:\n - ' + failures.join('\n - '));
