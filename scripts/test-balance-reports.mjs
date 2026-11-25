// Deep test of the Balance Reports (Lot Balance Sheet / Lot Summary) on whatever data is in the database.
// Every number is worked out a SECOND way, straight from the raw tables (not with the report's code),
// and compared with what the report returns, for every month, every process and every lot.
// It also checks the reports agree with Salary, Process Work, Daily Process, Lotwise and Material Issue,
// and that changing a rate shows up straight away (the rate is put back afterwards).
// Run: node scripts/test-balance-reports.mjs        (app must be running; prints PASS/FAIL)
import { createRequire } from 'node:module';
const pg = createRequire(new URL('../server/package.json', import.meta.url))('pg');

const API = process.env.GARMENTMFG_API || 'http://127.0.0.1:6061/api'; // 127.0.0.1: "localhost" lookups are slow on some Macs
const YEAR = 2026;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

let pass = 0, fail = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}   ${detail}`); }
};
const say = (name) => console.log(`  PASS  ${name}`);
const section = (t) => console.log(`\n=== ${t} ===`);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const same = (a, b) => Math.abs(Number(a) - Number(b)) < 0.011;

let cookie = '';
async function call(method, path, body) {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, ok: res.ok, json };
}
const login = await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'ADMIN', password: 'Admin' }) });
cookie = login.headers.get('set-cookie').split(';')[0];
const balance = async (month, extra = '') => (await call('GET', `/balance-reports/lot-balance?year=${YEAR}&month=${month}${extra}`)).json;

// ------------------------------------------------------------------ raw data, straight from the tables
// the database the app uses (PGPORT / PGDATABASE / PGUSER / PGPASSWORD to test another copy)
const db = new pg.Client({ host: '127.0.0.1', port: Number(process.env.PGPORT) || 5432, database: process.env.PGDATABASE || 'garmentmfg' });
await db.connect();
const q = async (sql) => (await db.query(sql)).rows;
const dayCols = Array.from({ length: 31 }, (_, i) => `d.d${i + 1}`).join(', ');
const rawRows = await q(`
  SELECT h.yearname::int AS year, TRIM(h.monthname) AS month, TRIM(lg.ledgrpname) AS groupname,
         TRIM(h.isdeleted) AS hdel, TRIM(d.isdeleted) AS ddel, TRIM(om.isdeleted) AS odel, TRIM(lg.isdeleted) AS gdel,
         LOWER(TRIM(d.lotno)) AS lotkey, d.processid::text AS opid, ${dayCols}
  FROM monthentryheader h
  JOIN monthentrydetail d ON d.headerid = h.id
  JOIN operatormaster om ON om.id = h.empid
  JOIN ledgergroup lg ON lg.id = h.ledgrpid`);
const steps = await q(`
  SELECT LOWER(TRIM(batchname)) AS lotkey, TRIM(batchname) AS lotno, operations::text AS opid, processid::text AS processid,
         stepno, rate::float AS rate
  FROM joborder_operations WHERE TRIM(isdeleted) = 'NO' ORDER BY stepno NULLS LAST, id`);
const jobs = await q(`
  SELECT DISTINCT ON (LOWER(TRIM(fabriclotno))) LOWER(TRIM(fabriclotno)) AS lotkey, cutqty::float AS cut,
         UPPER(TRIM(COALESCE(lotclosed, ''))) = 'YES' AS closed,
         COALESCE(NULLIF(TRIM(fabricdtls), ''), TRIM(style), '') AS details
  FROM joborderbooking WHERE TRIM(isdeleted) = 'NO' ORDER BY LOWER(TRIM(fabriclotno)), id DESC`);
const processes = await q(`SELECT id::text AS id, TRIM(stkcategoryname) AS name FROM stkcategory WHERE TRIM(isdeleted) = 'NO'`);

const stepOf = new Map(steps.map((s) => [`${s.lotkey}|${s.opid}`, s]));
const jobOf = new Map(jobs.map((j) => [j.lotkey, j]));
// usable work rows (same as the app: nothing deleted, lot + operation mapped in Lot Operation Map)
const work = rawRows
  .filter((r) => r.hdel === 'NO' && r.ddel === 'NO' && r.odel === 'NO' && r.gdel === 'NO' && stepOf.has(`${r.lotkey}|${r.opid}`))
  .map((r) => {
    const days = Array.from({ length: 31 }, (_, i) => Number(r[`d${i + 1}`]) || 0);
    const s = stepOf.get(`${r.lotkey}|${r.opid}`);
    return { ...r, days, pcs: days.reduce((a, b) => a + b, 0), period: r.year * 12 + MONTHS.indexOf(r.month) + 1, rate: s.rate, processid: s.processid };
  });

/** The balance report worked out by hand from `work` / `steps` / `jobs` */
function expected(monthIndex, processId = '', lotKey = '') {
  const period = YEAR * 12 + monthIndex + 1;
  const mine = work.filter((w) => w.period <= period && (!processId || w.processid === processId) && (!lotKey || w.lotkey === lotKey));
  const lots = [];
  for (const key of [...new Set(mine.map((w) => w.lotkey))]) {
    const job = jobOf.get(key) || { cut: 0, closed: false, details: '' };
    const lotSteps = steps.filter((s) => s.lotkey === key && (!processId || s.processid === processId)).map((s) => {
      const rows = mine.filter((w) => w.lotkey === key && w.opid === s.opid);
      const previous = rows.filter((w) => w.period < period).reduce((a, w) => a + w.pcs, 0);
      const current = rows.filter((w) => w.period === period).reduce((a, w) => a + w.pcs, 0);
      return { operation: s.opid, stepno: s.stepno, rate: s.rate, previous, current, balance: job.cut - previous - current, amount: r2((previous + current) * s.rate) };
    });
    const worked = lotSteps.some((s) => s.current > 0);
    const left = lotSteps.some((s) => s.balance > 0);
    if (!worked && (job.closed || !left)) continue;
    // lot total line = the lot's operation rows added up (Total Cut stays the lot's cut)
    const add = (f) => lotSteps.reduce((a, s) => a + s[f], 0);
    lots.push({ lotkey: key, cut: job.cut, steps: lotSteps, previous: add('previous'), current: add('current'), balance: add('balance'), rate: r2(add('rate')), amount: r2(add('amount')) });
  }
  // grand total = all lots' total lines added up
  const all = (f) => lots.reduce((a, l) => a + l[f], 0);
  return { lots, totals: { cutqty: all('cut'), previous: all('previous'), current: all('current'), rate: r2(all('rate')), amount: r2(all('amount')) } };
}

/** Compare one report answer with the hand-worked one; returns a short problem text or '' */
function compare(got, exp) {
  const gotKeys = got.lots.map((l) => l.lotno.toLowerCase()).sort().join(',');
  const expKeys = exp.lots.map((l) => l.lotkey).sort().join(',');
  if (gotKeys !== expKeys) return `lots shown: report [${gotKeys}] vs expected [${expKeys}]`;
  for (const e of exp.lots) {
    const g = got.lots.find((l) => l.lotno.toLowerCase() === e.lotkey);
    if (g.cutqty !== e.cut) return `lot ${g.lotno}: cut ${g.cutqty} vs ${e.cut}`;
    if (g.steps.length !== e.steps.length) return `lot ${g.lotno}: ${g.steps.length} steps vs ${e.steps.length}`;
    for (let i = 0; i < e.steps.length; i++) {
      const a = g.steps[i], b = e.steps[i];
      if (a.stepno !== b.stepno || a.previous !== b.previous || a.current !== b.current || a.balance !== b.balance || !same(a.rate, b.rate) || !same(a.amount, b.amount)) {
        return `lot ${g.lotno} step ${b.stepno}: report ${a.previous}/${a.current}/${a.balance}/${a.amount} vs expected ${b.previous}/${b.current}/${b.balance}/${b.amount}`;
      }
    }
    const t = g.total;
    if (t.previous !== e.previous || t.current !== e.current || t.balance !== e.balance || !same(t.rate, e.rate) || !same(t.amount, e.amount)) {
      return `lot ${g.lotno} total: report ${JSON.stringify(t)} vs expected ${e.previous}/${e.current}/${e.balance} rate ${e.rate} amount ${e.amount}`;
    }
  }
  const T = got.totals, E = exp.totals;
  if (T.cutqty !== E.cutqty || T.previous !== E.previous || T.current !== E.current || !same(T.rate, E.rate) || !same(T.amount, E.amount)) {
    return `grand total: report ${JSON.stringify(T)} vs expected ${JSON.stringify(E)}`;
  }
  return '';
}

// ------------------------------------------------------------------ 1. every month x every process
section('1. Every month x every process: report = numbers worked out from the raw tables');
const monthsWithWork = MONTHS.map((m, i) => i).filter((i) => work.some((w) => w.period <= YEAR * 12 + i + 1));
let combos = 0;
for (let i = 0; i < 12; i++) {
  for (const proc of [{ id: '', name: 'All' }, ...processes]) {
    const got = await balance(MONTHS[i], proc.id ? `&process=${proc.id}` : '');
    const problem = compare(got, expected(i, proc.id));
    check(`${MONTHS[i]} / ${proc.name}`, !problem, problem);
    combos++;
  }
}
say(`${combos} month x process reports compared step by step (${monthsWithWork.length} months have data)`);

// ------------------------------------------------------------------ 2. every lot on its own
section('2. Every lot on its own (Lot No. filter), any letter case');
let lotChecks = 0;
for (const i of monthsWithWork) {
  for (const key of [...new Set(work.filter((w) => w.period <= YEAR * 12 + i + 1).map((w) => w.lotkey))]) {
    const got = await balance(MONTHS[i], `&lot=${encodeURIComponent(key.toUpperCase())}`);
    const problem = compare(got, expected(i, '', key));
    check(`${MONTHS[i]} lot ${key}`, !problem, problem);
    lotChecks++;
  }
}
say(`${lotChecks} single-lot reports compared`);

// ------------------------------------------------------------------ 3. processes add up, months chain up
section('3. Processes add up; each month starts where the last one ended');
for (const i of monthsWithWork) {
  // This month's work adds up over the processes. (Amount = (Previous + This month) x Rate doesn't have to:
  // with one process picked, a lot whose pieces in that process are all done and not worked this month
  // isn't shown, while with All Processes it still is if other steps have pieces left.)
  const all = await balance(MONTHS[i]);
  const monthWork = (b) => b.lots.reduce((a, l) => a + l.steps.reduce((c, s) => c + s.current * s.rate, 0), 0);
  let sum = 0, pieces = 0;
  for (const p of processes) {
    const one = await balance(MONTHS[i], `&process=${p.id}`);
    sum += monthWork(one);
    pieces += one.totals.current;
  }
  check(`${MONTHS[i]}: this month's work of every process adds up to the whole factory (${r2(sum)} = ${r2(monthWork(all))})`, same(sum, monthWork(all)));
  check(`${MONTHS[i]}: This Month pieces of every process add up to the whole factory (${pieces} = ${all.totals.current})`, pieces === all.totals.current);
  check(`${MONTHS[i]}: no negative balance anywhere`, all.lots.every((l) => l.steps.every((s) => s.balance >= 0)));
}
for (let k = 1; k < monthsWithWork.length; k++) {
  const prev = await balance(MONTHS[monthsWithWork[k - 1]]);
  const cur = await balance(MONTHS[monthsWithWork[k]]);
  let bad = '';
  for (const l of cur.lots) {
    const p = prev.lots.find((x) => x.lotno === l.lotno);
    if (!p) continue;
    l.steps.forEach((s, j) => {
      const ps = p.steps[j];
      if (s.previous !== ps.previous + ps.current) bad ||= `lot ${l.lotno} step ${s.stepno}: ${MONTHS[monthsWithWork[k]]} previous ${s.previous} vs ${ps.previous}+${ps.current}`;
    });
  }
  check(`${MONTHS[monthsWithWork[k]]} "Previous" = ${MONTHS[monthsWithWork[k - 1]]} "Previous + This month" for every lot and step`, !bad, bad);
}
say('processes and month-to-month carry-over checked');

// ------------------------------------------------------------------ 4. agrees with the other reports
section('4. Same numbers as Salary, Process Work, Daily Process and Lotwise reports');
for (const i of monthsWithWork) {
  const m = MONTHS[i];
  const bal = await balance(m);
  const salary = (await call('GET', `/reports/salary?year=${YEAR}&month=${m}`)).json;
  const pw = (await call('GET', `/reports/process-work?year=${YEAR}&month=${m}`)).json;
  const dp = (await call('GET', `/reports/daily-process?year=${YEAR}&month=${m}`)).json;
  const lw = (await call('GET', `/reports/lot-group-qty?year=${YEAR}&month=${m}`)).json;
  const pcs = bal.lots.reduce((a, l) => a + l.steps.reduce((b, s) => b + s.current, 0), 0);
  // the balance Amount covers all months ((Previous + This month) x Rate), so compare this month's part:
  // This month x Rate on every step = what Salary and Process Work pay for the month
  const monthPay = r2(bal.lots.reduce((a, l) => a + l.steps.reduce((b, s) => b + s.current * s.rate, 0), 0));
  check(`${m}: Salary total ${r2(salary.reduce((a, r) => a + Number(r.totamt), 0))} = balance This month x Rate ${monthPay}`, same(salary.reduce((a, r) => a + Number(r.totamt), 0), monthPay));
  check(`${m}: Process Work amount = balance This month x Rate`, same(pw.reduce((a, r) => a + Number(r.totamt), 0), monthPay));
  check(`${m}: Process Work pieces = balance "This month" pieces (${pcs})`, pw.reduce((a, r) => a + Number(r.totalqty), 0) === pcs);
  const expectedDays = Array(31).fill(0);
  work.filter((w) => w.period === YEAR * 12 + i + 1).forEach((w) => w.days.forEach((v, d) => (expectedDays[d] += v)));
  const reportDays = Array.from({ length: 31 }, (_, d) => dp.reduce((a, r) => a + Number(r[`d${d + 1}`] || 0), 0));
  check(`${m}: Daily Process day totals D1..D31 = raw entries`, reportDays.join() === expectedDays.join(), `${reportDays} vs ${expectedDays}`);
  check(`${m}: Lotwise total qty = balance "This month" pieces`, lw.rows.reduce((a, r) => a + Number(r.totalqty), 0) === pcs);
}
say('cross-report agreement checked');

// ------------------------------------------------------------------ 5. Material Issue agrees
section('5. Material Issue: Done by Workers = all months of work; slips flow step to step');
// the month of the newest entry (any year): by then "Previous + This month" = everything ever done
// (an empty database has no entries: then there is nothing to compare in sections 5 and 6)
const newest = work.length ? Math.max(...work.map((w) => w.period)) : YEAR * 12 + 1;
const newestYear = Math.floor((newest - 1) / 12);
const newestMonth = MONTHS[(newest - 1) % 12];
const latest = (await call('GET', `/balance-reports/lot-balance?year=${newestYear}&month=${newestMonth}`)).json;
const allLotKeys = [...new Set(work.map((w) => w.lotkey))];
for (const key of allLotKeys) {
  const mi = (await call('GET', `/transactions/material-issue/lot-details/${encodeURIComponent(key)}`)).json;
  if (!mi?.steps?.length) continue;
  const cut = Number(mi.lot.cutqty);
  let bad = '';
  mi.steps.forEach((s, j) => {
    const done = work.filter((w) => w.lotkey === key && w.opid === String(s.operation_id)).reduce((a, w) => a + w.pcs, 0);
    if (s.done !== done) bad ||= `step ${s.stepno} done ${s.done} vs entries ${done}`;
    const shouldReceive = j === 0 ? cut : mi.steps[j - 1].sent;
    if (s.received !== shouldReceive) bad ||= `step ${s.stepno} received ${s.received} vs ${shouldReceive}`;
    if (!(s.sent <= s.done && s.done <= s.received)) bad ||= `step ${s.stepno}: sent ${s.sent} <= done ${s.done} <= received ${s.received} broken`;
    if (s.available !== s.done - s.sent) bad ||= `step ${s.stepno} can send ${s.available} vs ${s.done - s.sent}`;
  });
  check(`lot ${key}: every step consistent (${mi.steps.length} steps)`, !bad, bad);
  const shown = latest.lots.find((l) => l.lotno.toLowerCase() === key);
  if (shown) {
    const mismatch = shown.steps.find((s, j) => s.previous + s.current !== mi.steps[j]?.done);
    check(`lot ${key}: balance (${newestMonth} ${newestYear}) Previous + This month = Material Issue "Done"`, !mismatch, mismatch && `step ${mismatch.stepno}`);
  }
}
say(`${allLotKeys.length} lots checked against Material Issue`);

// ------------------------------------------------------------------ 6. changes show up straight away
section('6. A rate change shows up at once in Balance and Salary (then put back)');
const target = latest.lots.find((l) => l.steps.some((s) => s.current > 0 && s.rate > 0));
if (target) {
  const mapId = (await q(`SELECT id FROM operationmappingheader WHERE LOWER(TRIM(lotno)) = LOWER('${target.lotno.replace(/'/g, "''")}') AND TRIM(isdeleted) = 'NO' LIMIT 1`))[0]?.id;
  const map = (await call('GET', `/transactions/lot-operations/${mapId}`)).json;
  const step = target.steps.find((s) => s.current > 0 && s.rate > 0);
  const op = map.operations.find((o) => Number(o.stepno) === step.stepno);
  const salaryBefore = (await call('GET', `/reports/salary?year=${newestYear}&month=${newestMonth}`)).json.reduce((a, r) => a + Number(r.totamt), 0);
  const newRate = r2(Number(op.rate) + 1);
  const put = (rate) => call('PUT', `/transactions/lot-operations/${mapId}`, { ...map.header, operations: map.operations.map((o) => (o.id === op.id ? { ...o, rate } : o)) });
  let r = await put(newRate);
  check(`raise rate of lot ${target.lotno} step ${step.stepno} by 1`, r.ok, JSON.stringify(r.json));
  const after = (await call('GET', `/balance-reports/lot-balance?year=${newestYear}&month=${newestMonth}&lot=${encodeURIComponent(target.lotno)}`)).json;
  const s2 = after.lots[0].steps.find((s) => s.stepno === step.stepno);
  check(`amount goes up by exactly the pieces so far (${step.previous} + ${step.current}) x 1`, same(s2.amount - step.amount, step.previous + step.current), `${step.amount} -> ${s2.amount}`);
  const salaryAfter = (await call('GET', `/reports/salary?year=${newestYear}&month=${newestMonth}`)).json.reduce((a, x) => a + Number(x.totamt), 0);
  check('Salary Report goes up by the same amount', same(salaryAfter - salaryBefore, step.current), `${salaryBefore} -> ${salaryAfter}`);
  r = await put(op.rate);
  const back = (await call('GET', `/balance-reports/lot-balance?year=${newestYear}&month=${newestMonth}&lot=${encodeURIComponent(target.lotno)}`)).json;
  check('rate put back: amount back to what it was', r.ok && same(back.lots[0].steps.find((s) => s.stepno === step.stepno).amount, step.amount));
}

// ------------------------------------------------------------------ 6b. Lot No. dropdown
section('6b. Lot No. dropdown lists every lot');
const lotList = (await call('GET', '/balance-reports/lots')).json;
const listed = new Set(lotList.map((l) => l.lotno.toLowerCase()));
const mappedLots = [...new Set(steps.map((s) => s.lotkey))];
check(`dropdown has every lot in Lot Operation Map (${mappedLots.length})`, mappedLots.every((k) => listed.has(k)) && listed.size === mappedLots.length, `${listed.size} listed`);
check('no lot listed twice', lotList.length === listed.size);
const nums = lotList.map((l) => Number(l.lotno)).filter((n) => !Number.isNaN(n));
check('lots in number order', nums.every((n, i) => i === 0 || nums[i - 1] <= n));
check('each lot shows its details', lotList.every((l) => typeof l.details === 'string'));

// ------------------------------------------------------------------ 7. edge cases
section('7. Odd input and empty months');
let r = await call('GET', `/balance-reports/lot-balance?year=${YEAR}&month=Smarch`);
check('unknown month refused with a plain message', r.status === 400 && /Year and a Month/.test(r.json?.message), JSON.stringify(r.json));
r = await call('GET', '/balance-reports/lot-balance?year=&month=October');
check('missing year refused', r.status === 400);
r = await call('GET', '/balance-reports/lot-balance?year=2025&month=December');
check('a month before any work: empty report, total 0', r.ok && r.json.lots.length === 0 && r.json.totals.amount === 0);
r = await call('GET', `/balance-reports/lot-balance?year=${YEAR}&month=October&lot=NO-SUCH-LOT`);
check('unknown lot: empty report (not an error)', r.ok && r.json.lots.length === 0);
r = await call('GET', `/balance-reports/lot-balance?year=${YEAR}&month=october`);
check('month in small letters works', r.ok && r.json.month === 'October');
r = await call('GET', `/balance-reports/lot-balance?year=${YEAR}&month=October&process=999999`);
check('unknown process: empty report', r.ok && r.json.lots.length === 0);
r = await call('GET', `/balance-reports/lot-balance?year=${YEAR}&month=October&lot=${encodeURIComponent("1' OR '1'='1")}`);
check("odd lot text (quote trick) is treated as plain text", r.ok && r.json.lots.length === 0);
const noCookie = await fetch(API + `/balance-reports/lot-balance?year=${YEAR}&month=October`);
check('not logged in: refused', noCookie.status === 401);

await db.end();
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (failures.length) console.log('Failed:\n  ' + failures.join('\n  '));
process.exit(fail ? 1 : 0);
