/* Tables-room craps page (assets/rooms/tables/craps.html) — donor #1 rebuild verification.
   Asserts: zero page errors (the pre-fix page died on a SyntaxError in HARD_DICE and
   rendered nothing); every bet the engine settles has a printed, tappable zone and
   nothing extra is printed; dice render as real red-die faces (img, not blank boxes)
   at rest and after rolls; the YOU badge carries a real avatar (no emoji glyph);
   scripted bet flows per family settle to the displayed balance; wordmark + red
   velvet boat CSS present. Run: node tools/sims/craps_page_sim.js */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const PAGE = '/home/hatch/workspace/poker-push/assets/rooms/tables/craps.html';
const html = fs.readFileSync(PAGE, 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
function check(name, ok, extra) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); if (!ok) failures++; }

function makePage() {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => { const m = String((e.detail && e.detail.message) || e.message || e); if (!/Could not load|not implemented/i.test(m)) errs.push(m); });
  const dom = new JSDOM(html, {
    url: 'https://nikkiflixs.com/assets/rooms/tables/craps.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.AudioContext = class {
        constructor() { this.state = 'running'; this.destination = {}; }
        resume() { return Promise.resolve(); }
        createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, type: '' }; }
        createGain() { return { connect() {}, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
        createBiquadFilter() { return { connect() {}, frequency: { value: 0 }, Q: { value: 0 }, type: '' }; }
        get currentTime() { return 0; }
      };
      w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
      w.localStorage.setItem('nikkiflixs_bankroll', '5000');
      w.__rq = [];
      const realRandom = w.Math.random;
      w.Math.random = function () { return w.__rq.length ? w.__rq.shift() : realRandom(); };
    }
  });
  return { dom, w: dom.window, d: dom.window.document, errs };
}
/* Queue one scripted roll: 27 engine draws precede the two face draws
   (2x throwVec = 6, diceSound = 21), then 22 tick draws follow. */
function queueRoll(w, d1, d2) {
  const q = w.__rq; q.length = 0; /* drop prior roll's unused filler tail */
  const fv = d => (d - 0.5) / 6;
  for (let i = 0; i < 27; i++) q.push(0.42);
  q.push(fv(d1), fv(d2));
  for (let i = 0; i < 40; i++) q.push(0.42);
}
async function roll(w, d, d1, d2) {
  queueRoll(w, d1, d2);
  d.getElementById('rollBtn').click();
  await sleep(1900);
}
function bal(d) { return d.getElementById('balance').textContent; }
function pickChip(d, v) { d.querySelector('.chip[data-v="' + v + '"]').click(); }

(async () => {
  /* ---------- load-time structure ---------- */
  {
    const { w, d, errs } = makePage();
    await sleep(900);
    check('zero page errors on load', errs.length === 0, errs.join(' ; '));
    check('place grid built (6 boxes)', d.getElementById('placeGrid').childElementCount === 6);
    check('hardways grid built (4 boxes)', d.getElementById('hardGrid').childElementCount === 4);
    const spots = ['spot-pass', 'spot-dontpass', 'spot-come', 'spot-dontcome', 'spot-field',
      'spot-place-4', 'spot-place-5', 'spot-place-6', 'spot-place-8', 'spot-place-9', 'spot-place-10',
      'spot-hard-4', 'spot-hard-6', 'spot-hard-8', 'spot-hard-10'];
    check('zone set == engine bet set (15 spots)', spots.every(id => !!d.getElementById(id)), spots.filter(id => !d.getElementById(id)).join(','));
    check('every zone is a tappable button', spots.every(id => d.getElementById(id).tagName === 'BUTTON'));
    const wm = d.querySelector('.craps-wordmark');
    check('wordmark across top of felt', !!wm && wm.textContent.trim() === 'Nikkiflixs');
    const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
    check('red velvet boat CSS (50%/11% + velvet photo)', css.includes('red-velvet-felt.jpg') && css.includes('border-radius:50%/11%'));
    const i1 = d.querySelector('#die1 img.die-img'), i2 = d.querySelector('#die2 img.die-img');
    check('dice render as die faces at rest (not blank boxes)', !!i1 && !!i2 && /dice-red-1\.webp$/.test(i1.getAttribute('src')) && /dice-red-6\.webp$/.test(i2.getAttribute('src')), (i1 && i1.getAttribute('src')) + ' / ' + (i2 && i2.getAttribute('src')));
    check('all six die-face assets exist on disk', [1, 2, 3, 4, 5, 6].every(n => fs.existsSync(path.join(path.dirname(PAGE), '../../dice/dice-red-' + n + '.webp'))));
    const hw = d.querySelectorAll('#spot-hard-8 img.hw-die-img');
    check('hardway minis use the red dice art', hw.length === 2 && [...hw].every(im => /dice-red-4\.webp$/.test(im.getAttribute('src'))));
    const badgeImg = d.querySelector('#youBadge img');
    check('YOU badge = real avatar image', !!badgeImg && /avatars\/gallery\/avatar-03\.png$/.test(badgeImg.getAttribute('src')));
    check('no emoji person glyph anywhere on the page', !d.body.innerHTML.includes('\u{1F9D1}'));
    check('starting balance rendered', bal(d) === '10,000', bal(d));
    // chips land on the tapped zone (amount chip shows on the zone itself)
    d.getElementById('spot-place-6').click(); await sleep(60);
    const zone = d.getElementById('spot-place-6');
    check('bet lands ON the zone (amt + has-bet)', zone.querySelector('[data-amt]').textContent === '5' && zone.classList.contains('has-bet'));
    check('zero page errors after interaction', errs.length === 0, errs.join(' ; '));
  }

  /* ---------- flow A: pass line wins on come-out 7 ---------- */
  {
    const { w, d, errs } = makePage(); await sleep(700);
    pickChip(d, 25);
    d.getElementById('spot-pass').click(); await sleep(60);
    check('A: pass bet deducted', bal(d) === '9,975', bal(d));
    await roll(w, d, 4, 3);
    check('A: pass +50 on 7 (bal 10,025)', bal(d) === '10,025', bal(d) + ' | ' + d.getElementById('msg').textContent);
    check('A: msg names the Pass Line', /Pass Line/.test(d.getElementById('msg').textContent));
    check('A: dice show the rolled faces (4 and 3)', /dice-red-4\.webp/.test(d.querySelector('#die1 img').getAttribute('src')) && /dice-red-3\.webp/.test(d.querySelector('#die2 img').getAttribute('src')));
    check('A: zero errors', errs.length === 0, errs.join(' ; '));
  }

  /* ---------- flow B: field pays double on 2 ---------- */
  {
    const { w, d, errs } = makePage(); await sleep(700);
    pickChip(d, 25);
    d.getElementById('spot-field').click(); await sleep(60);
    await roll(w, d, 1, 1);
    check('B: field 2 pays double (bal 10,050)', bal(d) === '10,050', bal(d) + ' | ' + d.getElementById('msg').textContent);
    check('B: zero errors', errs.length === 0, errs.join(' ; '));
  }

  /* ---------- flow C: point set, then place 6 pays 7:6 ---------- */
  {
    const { w, d, errs } = makePage(); await sleep(700);
    pickChip(d, 25);
    d.getElementById('spot-pass').click(); await sleep(60);
    await roll(w, d, 2, 2);
    check('C: point is 4 (puck ON)', /POINT/.test(d.getElementById('puck').textContent) && bal(d) === '9,975', d.getElementById('msg').textContent);
    d.getElementById('spot-place-6').click(); await sleep(60);
    check('C: place-6 bet deducted', bal(d) === '9,950', bal(d));
    await roll(w, d, 3, 3);
    check('C: place 6 pays 25 + 29 (bal 10,004)', bal(d) === '10,004', bal(d) + ' | ' + d.getElementById('msg').textContent);
    check('C: zero errors', errs.length === 0, errs.join(' ; '));
  }

  /* ---------- flow D: hard 8 pays 9:1 ---------- */
  {
    const { w, d, errs } = makePage(); await sleep(700);
    pickChip(d, 25);
    d.getElementById('spot-hard-8').click(); await sleep(60);
    await roll(w, d, 4, 4);
    check('D: hard 8 pays 250 total (bal 10,225)', bal(d) === '10,225', bal(d) + ' | ' + d.getElementById('msg').textContent);
    check('D: zero errors', errs.length === 0, errs.join(' ; '));
  }

  /* ---------- flow E: don't pass pushes on 12 (bar 12) ---------- */
  {
    const { w, d, errs } = makePage(); await sleep(700);
    pickChip(d, 25);
    d.getElementById('spot-dontpass').click(); await sleep(60);
    await roll(w, d, 6, 6);
    check('E: bar-12 push refunds (bal 10,000)', bal(d) === '10,000', bal(d) + ' | ' + d.getElementById('msg').textContent);
    check('E: zero errors', errs.length === 0, errs.join(' ; '));
  }

  /* ---------- flow F: come bet travels, then wins ---------- */
  {
    const { w, d, errs } = makePage(); await sleep(700);
    pickChip(d, 25);
    d.getElementById('spot-pass').click(); await sleep(60);
    await roll(w, d, 2, 2); // point 4
    d.getElementById('spot-come').click(); await sleep(60);
    check('F: come bet deducted', bal(d) === '9,950', bal(d));
    await roll(w, d, 3, 2); // come travels to 5
    check('F: come traveled to 5', /Come bet to 5/.test(d.getElementById('msg').textContent), d.getElementById('msg').textContent);
    await roll(w, d, 2, 3); // come 5 wins even money
    check('F: come 5 pays (bal 10,000)', bal(d) === '10,000', bal(d) + ' | ' + d.getElementById('msg').textContent);
    check('F: zero errors', errs.length === 0, errs.join(' ; '));
  }

  console.log(failures === 0 ? '\nALL CHECKS PASS' : '\n' + failures + ' CHECK(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
