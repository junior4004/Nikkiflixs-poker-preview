/* BUILD 173: Nikki's Bar SHUFFLEBOARD — headless verification (jsdom).
   Asserts: zero page errors; zone math (scoreAt) exact incl. the
   fully-across-the-foul-line rule; a real flick travels and settles;
   pucks score only at rest; a full 4-round match vs the House bot
   completes through the real state machine (rAF-driven bot turns in
   FAST mode), round scores accumulate exactly into the totals, and
   the end overlay shows. Run: node tools/sims/bar_shuffle_sim.js */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const PAGE = '/home/hatch/workspace/poker-push/assets/rooms/bar/shuffleboard.html';
const html = fs.readFileSync(PAGE, 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
function check(name, ok, extra) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); if (!ok) failures++; }

const vc = new VirtualConsole();
const errs = [];
vc.on('jsdomError', e => { const m = String((e.detail && e.detail.message) || e.message || e); if (!/Could not load|not implemented/i.test(m)) errs.push(m); });
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/assets/rooms/bar/shuffleboard.html?fast=1',
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc
});
const w = dom.window;
w.addEventListener('error', e => errs.push(String(e.message)));

async function waitFor(fn, what, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (timeoutMs || 20000)) {
    if (fn()) return true;
    await sleep(60);
  }
  console.log('  (timeout waiting for: ' + what + ')');
  return false;
}

(async () => {
  await sleep(120);
  const S = w.__SHUF;
  check('page loads, __SHUF present', !!S);
  check('zero page errors', errs.length === 0, errs.join(' ; '));

  // zone math — independent expectations
  check('scoreAt: 10 zone', S.scoreAt(60) === 10);
  check('scoreAt: 8 zone', S.scoreAt(150) === 8);
  check('scoreAt: 7 zone', S.scoreAt(230) === 7);
  check('scoreAt: short of the 7 pays 0', S.scoreAt(282) === 0);
  check('scoreAt: not fully across foul line pays 0', S.scoreAt(290) === 0 && S.scoreAt(500) === 0);
  check('scoreAt: fully across in the gap pays 0, in the 7 pays 7', S.scoreAt(283) === 0 && S.scoreAt(275) === 7);

  // one honest flick: must travel the table and come to rest legally
  check('starts on your turn, aim state', S.turn === 'you' && S.state === 'aim');
  check('shoot accepted', S.shoot(6, -880) === true);
  const slid = await waitFor(() => S.state !== 'sliding', 'first puck settles', 15000);
  check('puck settles', slid);
  const p0 = S.pucks[0];
  check('puck travelled up-table', p0.y < 500, 'rest y=' + Math.round(p0.y));
  check('puck inside the walls', p0.x >= 30 && p0.x <= 410 && p0.y >= 34);

  // finish round 1 for the player (3 more pucks)
  for (let i = 0; i < 3; i++) {
    const okAim = await waitFor(() => S.state === 'aim' && S.turn === 'you', 'aim puck ' + (i + 2));
    if (!okAim) break;
    S.shoot((i - 1) * 22, -(760 + i * 60));
    await waitFor(() => S.state !== 'sliding', 'puck ' + (i + 2) + ' settles', 15000);
  }
  check('house takes its turn', await waitFor(() => S.turn === 'house' || S.round > 1, 'house turn', 20000));
  check('round 1 completes', await waitFor(() => S.roundScores.length >= 1, 'round 1 scored', 30000));
  const r1 = S.roundScores[0];
  check('round 1 scores sane (0..40 each)', r1 && r1.you >= 0 && r1.you <= 40 && r1.house >= 0 && r1.house <= 40,
    r1 ? r1.you + '-' + r1.house : 'none');

  // play out the match with fixed player shots; bot runs itself.
  // Slides are fast-forwarded through the page's own step(); bot
  // turns still advance on the page's real rAF timers (FAST mode).
  let guard = 0;
  while (S.state !== 'over' && guard++ < 400) {
    if (S.state === 'sliding') {
      for (let k = 0; k < 60 && S.state === 'sliding'; k++) S.step(0.05);
    } else if (S.state === 'aim' && S.turn === 'you') {
      S.shoot((guard % 3 - 1) * 18, -(800 + (guard % 4) * 45));
    }
    await sleep(50);
  }
  check('match reaches the end (state over)', S.state === 'over', 'state=' + S.state + ' round=' + S.round);
  check('all 4 rounds scored', S.roundScores.length === 4, 'rounds=' + S.roundScores.length);
  const sumY = S.roundScores.reduce((a, r) => a + r.you, 0);
  const sumH = S.roundScores.reduce((a, r) => a + r.house, 0);
  check('totals accumulate exactly', S.totals.you === sumY && S.totals.house === sumH,
    'you ' + S.totals.you + '=' + sumY + ', house ' + S.totals.house + '=' + sumH);
  check('end overlay shown', w.document.getElementById('overlay').classList.contains('show'));

  // new match resets
  S.newMatch();
  check('new match resets', S.round === 1 && S.totals.you === 0 && S.totals.house === 0 && S.state === 'aim');
  check('zero page errors at end', errs.length === 0, errs.join(' ; '));

  console.log(failures === 0 ? '\nBAR SHUFFLE SIM: ALL PASS' : '\nBAR SHUFFLE SIM: ' + failures + ' FAILURES');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('SIM CRASH', e); process.exit(2); });
