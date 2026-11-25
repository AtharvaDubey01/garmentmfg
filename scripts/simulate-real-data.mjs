// Simulated factory data (May - October 2026) to see how the reports look with real-looking work.
// Everything goes through the app's own API, so every rule is checked like on the screens.
// Marked for easy removal:  job orders "SIM/...", lots 201-208, workers "SIM01..", operations code "SIM..".
// Run:     node scripts/simulate-real-data.mjs          (app must be running)
// Preview: node scripts/simulate-real-data.mjs dry      (prints the plan, saves nothing)
// Remove:  psql -d garmentmfg -f scripts/simulate-real-data-cleanup.sql
const DRY = process.argv[2] === 'dry';
const API = 'http://127.0.0.1:6061/api'; // 127.0.0.1: "localhost" lookups are slow on some Macs
let cookie = '';
const SLOW = []; // calls slower than 1 s (to spot problems)
async function call(method, path, body) {
  const started = Date.now();
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  if (Date.now() - started > 1000) SLOW.push(`${method} ${path} ${Date.now() - started} ms`);
  return { ok: res.ok, status: res.status, json };
}
async function must(promise, what) {
  const r = await promise;
  if (!r.ok) { console.log(`STOPPED at: ${what}\n  ${r.status} ${JSON.stringify(r.json)}`); process.exit(1); }
  return r;
}

// Repeatable "random" numbers (same data every run)
let seed = 20261028;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const between = (a, b) => Math.round(a + rnd() * (b - a));

// ------------------------------------------------------------------ the factory
const MONTHS = ['May', 'June', 'July', 'August', 'September', 'October'];
const MONTH_NO = { May: 5, June: 6, July: 7, August: 8, September: 9, October: 10 };

// Operations in step order, with the department (Process Master) and the rate per piece
const OPS = [
  ['FULL SHIRT CUTTING', 'SIM01', 3.5, 'Cutting'],
  ['COLLAR FUSING', 'SIM02', 0.45, 'FUSING'],
  ['CUFF FUSING', 'SIM03', 0.45, 'FUSING'],
  ['FRONT PATTI FUSING', 'SIM04', 0.5, 'FUSING'],
  ['COLLAR MAKING', 'SIM05', 6, 'Stiching'],
  ['SLEEVE ATTACH', 'SIM06', 4.5, 'Stiching'],
  ['SIDE SEAM', 'SIM07', 5, 'Stiching'],
  ['BOTTOM HEM', 'SIM08', 3, 'Stiching'],
  ['KAJ', 'SIM09', 0.84, 'kaj button'],
  ['BUTTON', 'SIM10', 0.78, 'kaj button'],
  ['THREAD CUTTING', 'SIM11', 1.5, 'Thread cutting'],
  ['FLAT PACK', 'SIM12', 2.7, 'Pressing'],
];

// Workers: [name, code, group, department]
const WORKERS = [
  ['RAJESH YADAV', 'SIM01', 'Group A', 'Cutting'],
  ['MANOJ SHARMA', 'SIM02', 'Group A', 'Cutting'],
  ['SUNITA PATEL', 'SIM03', 'Group A', 'FUSING'],
  ['GEETA RATHOD', 'SIM04', 'Group A', 'FUSING'],
  ['VIKAS GUPTA', 'SIM05', 'Group B', 'Stiching'],
  ['ANIL MISHRA', 'SIM06', 'Group B', 'Stiching'],
  ['POOJA SINGH', 'SIM07', 'Group C', 'Stiching'],
  ['RAKESH TIWARI', 'SIM08', 'Group C', 'Stiching'],
  ['KAVITA DESAI', 'SIM09', 'Group D', 'kaj button'],
  ['MEENA SOLANKI', 'SIM10', 'Group D', 'kaj button'],
  ['ASHA PARMAR', 'SIM11', 'Group E', 'Thread cutting'],
  ['REKHA HALPATI', 'SIM12', 'Group E', 'Thread cutting'],
  ['DINESH PRAJAPATI', 'SIM13', 'Group E', 'Pressing'],
];

// Lots: [lot no, buyer # style # item, product (made if missing), order qty, cut qty, first month, speed, story]
// speed = how many pieces a step can do per month on this lot
const LOTS = [
  ['201', 'NORTHWIND # NW-2501 # MENS L/S SHIRT', 'Mens Formal Shirt', 1250, 1200, 'May', 1300, 'finished in October, then closed'],
  ['202', 'BLUE HARBOR # BH-1102 # MENS S/S SHIRT', 'Polo Shirt', 820, 800, 'May', 600, 'finished in October (left open)'],
  ['203', 'LITTLE OAK # LO-3304 # BOYS L/S SHIRT', 'Mens Formal Shirt', 1550, 1500, 'June', 900, 'last pieces in finishing'],
  ['204', 'URBAN THREAD # UT-4410 # MENS L/S SHIRT', 'Mens Formal Shirt', 2100, 2000, 'July', 750, 'in progress, many pieces between steps'],
  ['205', 'SUNRISE WEAR # SW-0565 # MENS S/S SHIRT', 'Polo Shirt', 1050, 1000, 'August', 550, 'about half finished'],
  ['206', 'TINY STEPS # TS-0707 # BABY SHIRT', 'Baby Shirt', 1850, 1800, 'September', 450, 'early: stitching just started'],
  ['207', 'RIVERSIDE # RV-0912 # BOYS SHIRT', 'Mens Formal Shirt', 950, 900, 'October', 500, 'just started: cutting + fusing only'],
  ['208', 'MAPLE & CO # MC-2610 # MENS L/S SHIRT', 'Mens Formal Shirt', 620, 600, 'June', 300, 'stuck: stitching stopped after August'],
  ['209', 'HILLTOP # HT-1003 # MENS L/S SHIRT', 'Mens Formal Shirt', 1450, 1400, 'August', 420, 'busy in stitching'],
  ['210', 'BLUE HARBOR # BH-2707 # BOYS L/S SHIRT', 'Polo Shirt', 1550, 1500, 'October', 700, 'cut this month, cutting still going'],
];

// October is a part month (work up to the 27th) and busier with new lots: less done per step
const MONTH_SPEED = { October: 0.75 };

// A new department only gets part of what the department before it sent this same month
const HANDOVER = 0.8;

// Working days (Mon-Sat) of a month in 2026; October only up to the 27th (today is the 28th)
function workDays(month) {
  const m = MONTH_NO[month];
  const last = month === 'October' ? 27 : new Date(2026, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= last; d++) if (new Date(2026, m - 1, d).getDay() !== 0) out.push(d);
  return out;
}

// Spread `pcs` over some working days -> { d5: 40, d6: 55, ... }
function spread(pcs, month) {
  const days = workDays(month);
  const start = between(0, Math.floor(days.length / 3));
  const used = days.slice(start, start + between(4, Math.max(5, days.length - start)));
  const out = {};
  for (let d = 1; d <= 31; d++) out[`d${d}`] = 0;
  let left = pcs;
  used.forEach((d, i) => {
    const share = i === used.length - 1 ? left : Math.min(left, Math.round((pcs / used.length) * (0.6 + rnd() * 0.8)));
    out[`d${d}`] += share;
    left -= share;
  });
  return out;
}

// ------------------------------------------------------------------ plan the months (no saving yet)
const state = {}; // lot -> step -> { received, done, sent }
for (const [lot, , , , cut] of LOTS) state[lot] = OPS.map((_, i) => ({ received: i === 0 ? cut : 0, done: 0, sent: 0 }));
const plan = []; // in save order: { month, kind: 'work' | 'send', lot, step, qty, worker }

for (const month of MONTHS) {
  for (const [lot, , , , cut, firstMonth, speed] of LOTS) {
    if (MONTHS.indexOf(month) < MONTHS.indexOf(firstMonth)) continue;
    const steps = state[lot];
    const receivedAtStart = steps.map((s) => s.received);
    for (let i = 0; i < OPS.length; i++) {
      // lot 208: stitching and after stop from September
      if (lot === '208' && i >= 4 && MONTHS.indexOf(month) >= MONTHS.indexOf('September')) break;
      // lot 207: started this month, only cutting and fusing so far
      if (lot === '207' && i >= 4) break;
      // lot 210: cut this month, cutting and collar fusing only
      if (lot === '210' && i >= 2) break;
      const s = steps[i];
      const newDept = i > 0 && OPS[i][3] !== OPS[i - 1][3];
      // what this step may work on this month
      const arrived = s.received - receivedAtStart[i]; // sent to this step during this month
      const reachable = newDept && arrived > 25 ? receivedAtStart[i] + Math.floor(arrived * HANDOVER) : s.received;
      const todo = Math.max(0, reachable - s.done);
      const cap = Math.round(speed * (MONTH_SPEED[month] || 1) * (0.85 + rnd() * 0.3));
      const qty = todo - cap <= 25 ? todo : Math.min(todo, cap); // a few pieces left: finish them now
      if (qty > 0) {
      // split between 1 or 2 workers of the department
      const team = WORKERS.filter((w) => w[3] === OPS[i][3]);
      const first = team[between(0, team.length - 1)];
      const parts = team.length > 1 && qty > 150 ? [[first, Math.round(qty * (0.4 + rnd() * 0.3))]] : [[first, qty]];
      if (parts[0][1] < qty) parts.push([team.find((w) => w !== first), qty - parts[0][1]]);
      for (const [worker, pcs] of parts) plan.push({ month, kind: 'work', lot, step: i, qty: pcs, worker });
      s.done += qty;
      }
      // send ahead what's done (the last step's slips = finished garments). Not always everything:
      // some done pieces wait for the next slip; in October (month still running) more of them wait.
      const unsent = s.done - s.sent;
      if (unsent <= 0) continue;
      let send = unsent;
      if (unsent > 15) {
        // (a small leftover of 15 pieces or fewer always goes with the slip)
        if (month === 'October') send = Math.floor(unsent * (0.55 + rnd() * 0.3));
        else if (rnd() < 0.35) send = Math.floor(unsent * (0.85 + rnd() * 0.1));
      }
      if (send <= 0) continue;
      plan.push({ month, kind: 'send', lot, step: i, qty: send });
      s.sent += send;
      if (i + 1 < OPS.length) steps[i + 1].received += send;
    }
  }
}

// Summary of the plan: finished garments per lot after each month
console.log('Finished garments (sent ahead by FLAT PACK) at the end of each month:');
console.log('lot  cut   ' + MONTHS.map((m) => m.slice(0, 3).padStart(6)).join(''));
for (const [lot, , , , cut] of LOTS) {
  let total = 0;
  const cols = MONTHS.map((m) => {
    total += plan.filter((p) => p.lot === lot && p.kind === 'send' && p.step === OPS.length - 1 && p.month === m).reduce((a, p) => a + p.qty, 0);
    return String(total).padStart(6);
  });
  console.log(`${lot}  ${String(cut).padEnd(5)} ${cols.join('')}   ${LOTS.find((l) => l[0] === lot)[7]}`);
}
console.log('\nEnd of October per lot: cut | done by first step | finished | done but not sent yet (all steps)');
for (const [lot, , , , cut] of LOTS) {
  const st = state[lot];
  console.log(`  ${lot}: ${cut} | ${st[0].done} | ${st[OPS.length - 1].sent} | ${st.reduce((a, x) => a + x.done - x.sent, 0)}`);
}
console.log(`\n${plan.filter((p) => p.kind === 'work').length} work rows, ${plan.filter((p) => p.kind === 'send').length} material issue slips`);
if (DRY) process.exit(0);

// ------------------------------------------------------------------ save it through the API
const login = await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'ADMIN', password: 'Admin' }) });
cookie = login.headers.get('set-cookie').split(';')[0];

// Masters this data needs, made here if they don't exist yet, so it also works on an empty database.
// (They stay after simulate-real-data-cleanup.sql, which removes only the SIM records.)
const names = async (path, field) => (await call('GET', path)).json.map((x) => x[field]);
const haveGroups = await names('/masters/employee-groups', 'ledgrpname');
for (const g of [...new Set(WORKERS.map((w) => w[2]))]) {
  if (!haveGroups.includes(g)) await must(call('POST', '/masters/employee-groups', { ledgrpname: g }), `group ${g}`);
}
const haveProcs = await names('/masters/process-masters', 'stkcategoryname');
for (const p of [...new Set(OPS.map((o) => o[3]))]) {
  if (!haveProcs.includes(p)) await must(call('POST', '/masters/process-masters', { stkcategoryname: p }), `process ${p}`);
}
if (!(await names('/masters/units', 'unitname')).includes('PCS')) {
  await must(call('POST', '/masters/units', { unitname: 'PCS', unittype: 'Simple', decimalplaces: 0 }), 'unit PCS');
}
if (!(await names('/masters/product-groups', 'stkgrpname')).includes('Shirts')) {
  await must(call('POST', '/masters/product-groups', { stkgrpname: 'Shirts' }), 'product group Shirts');
}
const pcsId = (await call('GET', '/masters/units')).json.find((u) => u.unitname === 'PCS').id;
const shirtsId = (await call('GET', '/masters/product-groups')).json.find((g) => g.stkgrpname === 'Shirts').id;
const haveProducts = await names('/masters/products', 'stockitemname');
for (const [i, pname] of [...new Set(LOTS.map((l) => l[2]))].entries()) {
  if (!haveProducts.includes(pname)) {
    await must(call('POST', '/masters/products', { stockitemname: pname, stockgroup: shirtsId, unit: pcsId, stkcode: `SIM-P${i + 1}` }), `product ${pname}`);
  }
}
const products = Object.fromEntries((await call('GET', '/masters/products')).json.map((p) => [p.stockitemname, p.id]));

const groups = Object.fromEntries((await call('GET', '/masters/employee-groups')).json.map((g) => [g.ledgrpname, g.id]));
const procs = Object.fromEntries((await call('GET', '/masters/process-masters')).json.map((p) => [p.stkcategoryname, p.id]));

for (const [operations, opcode, oprate, proc] of OPS) {
  await must(call('POST', '/masters/operations', { operations, opcode, oprate, processid: procs[proc] }), `operation ${operations}`);
}
const allOps = (await call('GET', '/masters/operations')).json;
const opId = OPS.map(([name, code]) => allOps.find((o) => o.opcode === code && o.operations === name).id);

for (const [name, code, group] of WORKERS) {
  await must(call('POST', '/masters/employees', { operatorname: name, empcode: code, empgrp: groups[group], contactno: `98250${code.slice(3).padStart(5, '0')}` }), `worker ${name}`);
}
const emps = (await call('GET', '/masters/employees')).json;
const empId = Object.fromEntries(WORKERS.map(([, code]) => [code, emps.find((e) => e.empcode === code).id]));
console.log('masters: 12 operations, 13 workers');

for (const [lot, desc, productName, orderQty, cut, firstMonth] of LOTS) {
  const [buyer, style] = desc.split(' # ');
  const date = `2026-${String(MONTH_NO[firstMonth]).padStart(2, '0')}-02`;
  const jo = await must(call('POST', '/transactions/job-orders', {
    joborderno: `SIM/${lot}`, joborderdate: date, customerid: products[productName], style, custdtl: buyer, custorderno: `PO-${lot}`,
    custorderdate: date, totalqtypcs: orderQty, fabriclotno: lot, cutqty: cut, fabricdtls: `[${lot}] ${desc}`,
  }), `job order ${lot}`);
  const d = (await call('GET', `/transactions/lot-operations/lot-details/${jo.json.id}`)).json;
  await must(call('POST', '/transactions/lot-operations', {
    lotno: lot, custdtl: d.custdtl, joborderno: d.joborderno, joborderdate: d.joborderdate, style: d.style, orderqty: d.totalqtypcs,
    custorderno: d.custorderno, custorderdt: d.custorderdate, prodname: d.stockitemname, proddtl: d.fabricdtls,
    operations: OPS.map(([, , rate, proc], i) => ({ stepno: i + 1, processid: procs[proc], operations: opId[i], rate })),
  }), `lot operation map ${lot}`);
}
console.log(`lots: ${LOTS.length} job orders, each mapped with 12 steps`);

let saved = 0;
for (const p of plan) {
  if (p.kind === 'work') {
    const [, code, group] = p.worker;
    await must(call('POST', '/transactions/daily-entry/save', {
      monthName: p.month, yearName: 2026, empId: empId[code], ledGrpId: groups[group],
      lotNo: p.lot, processId: opId[p.step], processName: OPS[p.step][0], ...spread(p.qty, p.month),
    }), `daily entry ${p.month} lot ${p.lot} ${OPS[p.step][0]} ${p.qty}`);
  } else {
    const day = Math.min(workDays(p.month).slice(-1)[0], 28);
    await must(call('POST', '/transactions/material-issue/save', {
      lotNo: p.lot, operationId: opId[p.step], qty: p.qty,
      issueDate: `2026-${String(MONTH_NO[p.month]).padStart(2, '0')}-${String(day).padStart(2, '0')}`, remark: 'simulated',
    }), `material issue ${p.month} lot ${p.lot} ${OPS[p.step][0]} ${p.qty}`);
  }
  if (++saved % 100 === 0) console.log(`  saved ${saved} / ${plan.length}`);
}

// Lot 201 is finished: close it (like the factory would)
const jo201 = (await call('GET', '/transactions/job-orders')).json.find((j) => j.joborderno === 'SIM/201');
const full = (await call('GET', `/transactions/job-orders/${jo201.id}`)).json;
await must(call('PUT', `/transactions/job-orders/${jo201.id}`, { ...full, lotclosed: 'Yes' }), 'close lot 201');
console.log(`done: ${plan.length} entries and slips saved, lot 201 closed`);
