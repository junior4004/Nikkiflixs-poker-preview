/* BUILD 173: Nikki's Bar DARTS 301 — headless verification (jsdom).
   Asserts: zero page errors; scoreFor is a real board (bull 50,
   outer 25, treble/double rings, correct segments, miss = 0);
   3-dart turns alternate; bust voids the turn and hands over;
   exact-zero finish wins; a full solver-driven leg vs the House
   bot reaches a winner. Run: node tools/sims/bar_darts_sim.js */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const PAGE = '/home/hatch/workspace/poker-push/assets/rooms/bar/darts.html';
const html = fs.readFileSync(PAGE, 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
function check(name, ok, extra) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); if (!ok) failures++; }

const vc = new VirtualConsole();
const errs = [];
vc.on('jsdomError', e => { const m = String((e.detail && e.detail.message) || e.message || e); if (!/Could not load|not implemented/i.test(m)) errs.push(m); });
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/assets/rooms/bar/darts.html?fast=1',
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc
});
const w = dom.window;
w.addEventListener('error', e => errs.push(String(e.message)));
const CX = 280, CY = 272;

async function waitFor(fn, what, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (timeoutMs || 25000)) {
    if (fn()) return true;
    await sleep(60);
  }
  console.log('  (timeout waiting for: ' + what + ')');
  return false;
}

(async () => {
  await sleep(120);
  const D = w.__DARTS;
  check('page loads, __DARTS present', !!D);
  check('zero page errors', errs.length === 0, errs.join(' ; '));

  // --- the board scores like a real board ---
  check('bull = 50', D.scoreFor(CX, CY).pts === 50);
  check('outer bull = 25', D.scoreFor(CX + 28, CY).pts === 25);
  const t20 = D.segPoint(20, 'T'), d20 = D.segPoint(20, 'D'), s20 = D.segPoint(20, 'S');
  check('treble 20 = 60', D.scoreFor(t20.x, t20.y).pts === 60, D.scoreFor(t20.x, t20.y).label);
  check('double 20 = 40', D.scoreFor(d20.x, d20.y).pts === 40, D.scoreFor(d20.x, d20.y).label);
  check('single 20 = 20', D.scoreFor(s20.x, s20.y).pts === 20);
  const t19 = D.segPoint(19, 'T'), s5 = D.segPoint(5, 'S'), s1 = D.segPoint(1, 'S');
  check('treble 19 = 57', D.scoreFor(t19.x, t19.y).pts === 57);
  check('segments land right (5 and 1)', D.scoreFor(s5.x, s5.y).pts === 5 && D.scoreFor(s1.x, s1.y).pts === 1);
  check('off the board = 0', D.scoreFor(24, 24).pts === 0);

  // --- a normal 3-dart turn passes over ---
  D.newLeg();
  D.throwAt(s20.x, s20.y); D.throwAt(s20.x, s20.y); D.throwAt(s20.x, s20.y);
  check('3 darts of 20 take 301 -> 241', D.scores.you === 241, 'you=' + D.scores.you);
  check('turn passes to the house', D.turn === 'house' && D.state === 'botwait');
  check('house plays its turn', await waitFor(() => D.turn === 'you' || D.state === 'over', 'house turn', 25000));
  check('house score moved honestly (121..301)', D.scores.house <= 301 && D.scores.house >= 121, 'house=' + D.scores.house);

  // --- bust: overthrowing voids the whole turn ---
  D.newLeg(); D.setScores(30, 301);
  const bustRes = D.throwAt(t20.x, t20.y);   // 60 > 30 -> bust
  check('overthrow busts', bustRes === 'bust' && D.scores.you === 30 && D.turn === 'house',
    'res=' + bustRes + ' you=' + D.scores.you);
  await waitFor(() => D.turn === 'you' || D.state === 'over', 'house turn after bust', 25000);

  // --- leaving exactly 1 is also a bust ---
  D.newLeg(); D.setScores(21, 301);
  const b2 = D.throwAt(s20.x, s20.y);        // 21 - 20 = 1 -> bust
  check('leaving 1 busts', b2 === 'bust' && D.scores.you === 21, 'res=' + b2 + ' you=' + D.scores.you);
  await waitFor(() => D.turn === 'you' || D.state === 'over', 'house turn after bust 2', 25000);

  // --- exact finish wins ---
  D.newLeg(); D.setScores(40, 301);
  const winRes = D.throwAt(d20.x, d20.y);    // double 20 = exactly 40
  check('exact zero wins the leg', winRes === 'win' && D.scores.you === 0 && D.state === 'over');
  check('win overlay shown', w.document.getElementById('overlay').classList.contains('show'));

  // --- full leg: greedy solver for you, real bot for the house ---
  D.newLeg();
  const targets = [];
  targets.push({ pts: 50, x: CX, y: CY }, { pts: 25, x: CX + 28, y: CY });
  for (let n = 1; n <= 20; n++) {
    const S = D.segPoint(n, 'S'), Db = D.segPoint(n, 'D'), T = D.segPoint(n, 'T');
    targets.push({ pts: n, x: S.x, y: S.y }, { pts: 2 * n, x: Db.x, y: Db.y }, { pts: 3 * n, x: T.x, y: T.y });
  }
  targets.sort((a, b) => b.pts - a.pts);
  let turns = 0;
  while (D.state !== 'over' && turns++ < 120) {
    if (D.turn !== 'you') { await sleep(80); continue; }
    // throw up to 3 solver darts (throwAt routes through the real turn logic)
    let guard = 0;
    while (D.turn === 'you' && D.state !== 'over' && guard++ < 3) {
      const rem = D.scores.you;
      const pick = targets.find(t => t.pts <= rem && rem - t.pts !== 1) || targets[targets.length - 1];
      D.throwAt(pick.x, pick.y);
      await sleep(10);
    }
    await waitFor(() => D.turn === 'you' || D.state === 'over', 'next turn', 25000);
  }
  check('full leg reaches a winner', D.state === 'over', 'state=' + D.state + ' turns=' + turns);
  check('someone checked out on exactly 0', D.scores.you === 0 || D.scores.house === 0,
    'you=' + D.scores.you + ' house=' + D.scores.house);
  check('zero page errors at end', errs.length === 0, errs.join(' ; '));

  console.log(failures === 0 ? '\nBAR DARTS SIM: ALL PASS' : '\nBAR DARTS SIM: ' + failures + ' FAILURES');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('SIM CRASH', e); process.exit(2); });
