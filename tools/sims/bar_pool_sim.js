/* BUILD 173: Nikki's Bar POOL — headless verification (jsdom).
   Drives the real page: scripted shots through __POOL.shoot/step.
   Asserts: zero page errors; rack = cue + 8; break moves balls and
   everything settles in-bounds with no NaN; pocket capture works at
   the lip; scratch re-spots the cue; clearing all 8 reaches the win
   overlay; re-rack resets. Run: node tools/sims/bar_pool_sim.js */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const PAGE = '/home/hatch/workspace/poker-push/assets/rooms/bar/pool.html';
const html = fs.readFileSync(PAGE, 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
function check(name, ok, extra) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); if (!ok) failures++; }

const vc = new VirtualConsole();
const errs = [];
vc.on('jsdomError', e => { const m = String((e.detail && e.detail.message) || e.message || e); if (!/Could not load|not implemented/i.test(m)) errs.push(m); });
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/assets/rooms/bar/pool.html?fast=1',
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc
});
const w = dom.window, d = w.document;
w.addEventListener('error', e => errs.push(String(e.message)));

function settle(P, maxSec) {
  let t = 0;
  while (P.state === 'rolling' && t < maxSec) { P.step(0.05); t += 0.05; }
  return P.state;
}
function inBounds(P) {
  return P.balls.every(b => {
    if (!b.active) return true;
    return isFinite(b.x) && isFinite(b.y) && b.x >= 56 + 12 && b.x <= 944 - 12 && b.y >= 56 + 12 && b.y <= 504 - 12;
  });
}

(async () => {
  await sleep(120);
  const P = w.__POOL;
  check('page loads, __POOL present', !!P);
  check('zero page errors', errs.length === 0, errs.join(' ; '));
  check('rack: 9 balls (cue + 8)', P.balls.length === 9 && P.balls.filter(b => b.active).length === 9);
  check('starts in aim state', P.state === 'aim');

  // break shot — balls must scatter and settle in bounds
  const before = P.balls.map(b => b.x + ',' + b.y).join('|');
  check('shoot() accepted', P.shoot(1, 0.06, 0.85) === true);
  settle(P, 40);
  const after = P.balls.map(b => b.x + ',' + b.y).join('|');
  check('break moved balls', before !== after);
  check('settled back to aim/over', P.state === 'aim' || P.state === 'over', P.state);
  check('all active balls in bounds, no NaN', inBounds(P));
  check('ball conservation: active + pocketed = 8 object balls',
    P.balls.filter(b => !b.cue && b.active).length + P.pocketed === 8);

  // a rack of random honest shots — invariants after every one
  let inv = true;
  for (let i = 0; i < 10 && P.state !== 'over'; i++) {
    const ang = (i * 0.77) % (Math.PI * 2);
    if (!P.shoot(Math.cos(ang), Math.sin(ang), 0.4 + (i % 5) * 0.13)) { inv = false; break; }
    settle(P, 40);
    if (!inBounds(P)) { inv = false; break; }
    if (P.balls.filter(b => !b.cue && b.active).length + P.pocketed !== 8) { inv = false; break; }
  }
  check('10 scripted shots: bounds + conservation invariants hold', inv);

  // pocket capture physics: object ball on the lip, rolling in
  P.rack();
  P.setBall(1, 60, 60, -140, -140);
  P.setState('rolling'); settle(P, 10);
  check('ball at pocket lip is captured', P.pocketed === 1, 'pocketed=' + P.pocketed);

  // scratch: cue into the pocket comes back spotted
  P.setBall(0, 940, 60, 200, -160);
  P.setState('rolling'); settle(P, 10);
  check('scratch re-spots the cue ball', P.balls[0].active === true && P.state === 'aim');

  // clear the table -> win state
  P.rack();
  for (let n = 1; n <= 8; n++) {
    P.setBall(n, 62, 62, -160, -160);
    P.setState('rolling'); settle(P, 10);
  }
  check('all 8 pocketed', P.pocketed === 8, 'pocketed=' + P.pocketed);
  check('win state reached', P.state === 'over', P.state);
  check('win overlay shown', d.getElementById('overlay').classList.contains('show'));

  // re-rack resets
  P.rack();
  check('re-rack resets', P.pocketed === 0 && P.shots === 0 && P.state === 'aim' &&
    P.balls.filter(b => b.active).length === 9);
  check('zero page errors at end', errs.length === 0, errs.join(' ; '));

  console.log(failures === 0 ? '\nBAR POOL SIM: ALL PASS' : '\nBAR POOL SIM: ' + failures + ' FAILURES');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('SIM CRASH', e); process.exit(2); });
