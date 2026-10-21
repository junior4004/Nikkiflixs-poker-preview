/* BUILD 158: craps vertical-oval layout + engine-zone contract.
   Asserts: donor wordmark/felt present; every bet the engine settles has a printed,
   tappable zone; no zone advertises a bet the engine does not settle (odds/buy/lay);
   chips land ON the tapped zone; forced win settles back to the wallet; take-down
   refunds; a seeded real roll resolves through the full dice path; zero page errors. */
const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const file = process.argv[2] || '/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html';
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(w) {
    w.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
    w.navigator.vibrate = () => true;
    w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    w.localStorage.setItem('nikkiflixs_bankroll', '5000');
    w.__seedDice = false;
    const realRandom = w.Math.random;
    w.Math.random = function () { return w.__seedDice ? 0.999999 : realRandom(); };
  }
});
const w = dom.window, d = w.document;
const errors = [];
w.addEventListener('error', e => errors.push(String(e.message)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
function check(name, ok, extra) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); if (!ok) failures++; }

(async () => {
  await sleep(1000);
  const T = w.__casinoTest;
  check('casino test hooks present', !!T);
  T.openCraps();
  await sleep(500);
  check('craps room open', T.getState().game === 'craps' && !d.getElementById('crapsGame').hidden);

  // --- Donor layout: gold script across the top, red velvet portrait felt ---
  const wm = d.querySelector('#crapsLayout .craps-wordmark');
  check('wordmark across top of felt', !!wm && wm.textContent.trim() === 'Nikkiflixs');
  const cssText = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
  check('BUILD 158 vertical CSS present', cssText.includes('BUILD 158') && cssText.includes('.craps-wordmark'));
  const feltStyle = w.getComputedStyle(d.getElementById('crapsGame'));
  const bg = feltStyle.backgroundImage || '';
  check('felt uses velvet texture, not the old landscape photo', bg.includes('velvet-felt.jpg') && !bg.includes('table.png'), bg.slice(0, 90));

  // --- Zone inventory: exactly what resolveCraps settles ---
  const spots = [...d.querySelectorAll('#crapsLayout [data-craps-bet]')];
  check('all zones are tappable buttons', spots.length > 0 && spots.every(el => el.tagName === 'BUTTON'), spots.length + ' zones');
  const has = (type, number) => spots.some(el => el.getAttribute('data-craps-bet') === type && (number === undefined || Number(el.getAttribute('data-number')) === number));
  const singles = ['pass', 'dont', 'come', 'dont-come', 'field', 'any-seven', 'horn', 'any-craps', 'ce'];
  singles.forEach(t => check('zone printed: ' + t, has(t)));
  [4, 5, 6, 8, 9, 10].forEach(n => check('zone printed: place ' + n, has('place', n)));
  [4, 6, 8, 10].forEach(n => check('zone printed: hard ' + n, has('hard', n)));
  [2, 3, 11, 12].forEach(n => check('zone printed: exact ' + n, has('exact', n)));
  [6, 8].forEach(n => check('zone printed: big ' + n, has('big', n)));
  const types = [...new Set(spots.map(el => el.getAttribute('data-craps-bet')))].sort();
  const engineTypes = ['any-craps', 'any-seven', 'big', 'ce', 'come', 'dont', 'dont-come', 'exact', 'field', 'hard', 'horn', 'pass', 'place'].sort();
  check('zone types == engine bet types (nothing extra, nothing missing)', JSON.stringify(types) === JSON.stringify(engineTypes), types.join(','));
  check('no printed odds/buy/lay promises', !has('odds') && !has('buy') && !has('lay') && ![...d.querySelectorAll('.craps-number-cell span')].some(s => /BUY|LAY/.test(s.textContent)));

  // --- Behavior: chip lands on the tapped zone, forced win pays back to wallet ---
  const B0 = T.getState().balance;
  check('wallet loaded', B0 === 5000, 'balance ' + B0);
  T.selectCrapsChip(5);
  async function betAndWin(type, number, label) {
    const before = T.getState().balance;
    const selector = '#crapsLayout [data-craps-bet="' + type + '"]' + (number ? '[data-number="' + number + '"]' : '');
    const spot = d.querySelector(selector);
    T.tapCrapsSpot(type, number);
    await sleep(1800);
    let st = T.getState();
    const stackSpot = d.querySelector('#crapsLayout .craps-live-bet');
    check(label + ': wager placed', st.crapsWager === 5 && st.balance === before - 5, 'wager ' + st.crapsWager);
    check(label + ': chip stack sits on the tapped zone', !!stackSpot && stackSpot.parentElement === spot);
    T.forceCrapsOutcome('win');
    await sleep(2000);
    st = T.getState();
    check(label + ': forced win settles 2x back to wallet', st.crapsWager === 0 && st.balance === before + 5, 'balance ' + st.balance + ' (was ' + before + ')');
  }
  await betAndWin('place', 6, 'place 6');
  await betAndWin('hard', 8, 'hard 8');
  await betAndWin('exact', 11, 'exact 11 (yo)');
  await betAndWin('horn', undefined, 'horn');
  await betAndWin('big', 6, 'big 6');
  await betAndWin('come', undefined, 'come');
  await betAndWin('any-craps', undefined, 'any craps');

  // --- Take-down refunds the wager ---
  {
    const before = T.getState().balance;
    T.tapCrapsSpot('place', 4);
    await sleep(1800);
    check('place 4: wager placed for take-down', T.getState().crapsWager === 5);
    d.getElementById('crapsTakeDown').click();
    await sleep(1800);
    const st = T.getState();
    check('take-down refunds wager', st.crapsWager === 0 && st.balance === before, 'balance ' + st.balance);
  }

  // --- Seeded real roll through the full dice path: dice show 6+6=12 ---
  w.__seedDice = true;
  {
    const before = T.getState().balance;
    T.tapCrapsSpot('field');
    await sleep(1800);
    check('field: wager placed for roll', T.getState().crapsWager === 5);
    d.getElementById('crapsRoll').click();
    await sleep(6500);
    const st = T.getState();
    check('field on 12 pays double through real roll', st.crapsWager === 0 && st.balance === before + 10, 'balance ' + st.balance + ' (was ' + before + ')');
    check('point puck still off after one-roll bet', st.crapsPoint === 0);
  }
  {
    const before = T.getState().balance;
    T.tapCrapsSpot('pass');
    await sleep(1800);
    d.getElementById('crapsRoll').click();
    await sleep(6500);
    const st = T.getState();
    check('pass line loses on come-out 12 through real roll', st.crapsWager === 0 && st.balance === before - 5, 'balance ' + st.balance + ' (was ' + before + ')');
  }
  w.__seedDice = false;

  check('zero page errors', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  console.log(failures ? ('CRAPS SIM: ' + failures + ' FAILURES') : 'CRAPS SIM: ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
