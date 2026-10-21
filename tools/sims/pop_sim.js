/* BUILD 155 pop sim: mega-pop effect params + bubble/reassembly sequence + pricing.
   Drives the real UI: POP button -> pick Taunt -> tap a seat. Then the shotgun (shared explodePortrait path). */
const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(window) {
    window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } createBuffer() { return { getChannelData() { return new Float32Array(8); } }; } createBufferSource() { return { connect() {}, start() {}, stop() {} }; } createBiquadFilter() { return { connect() {}, frequency: { value: 0 } }; } get currentTime() { return 0; } };
    window.navigator.vibrate = () => true;
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    window.localStorage.setItem('nikkiflixs_bankroll', '5000');
    window.localStorage.setItem('nikkiflixs_pops_taunt', '5');
    window.localStorage.setItem('nikkiflixs_pops_mad', '5');
  }
});
const w = dom.window, d = w.document;
const errors = [];
w.addEventListener('error', e => errors.push(String(e.message)));
setInterval(() => { d.querySelectorAll('.flying-card,.fold-card,.flying-chip,.pot-flight').forEach(el => el.dispatchEvent(new w.Event('animationend', { bubbles: true }))); }, 20);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function giftItem(label) { return [...d.querySelectorAll('.gift-item')].find(b => b.textContent.includes(label)); }
let fails = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); if (!ok) fails++; }

(async () => {
  await sleep(1200);
  if (w.__pokerTest) w.__pokerTest.setSpeed(0.03);

  /* ---- POP on seat 3 with full sequence recording ---- */
  d.getElementById('popBtn').click(); await sleep(300);
  const tauntBtn = giftItem('Loser-Taunt Pop');
  check('pop picker opens with both flavors', !!tauntBtn && !!giftItem('Mad Pop'), tauntBtn ? tauntBtn.textContent.replace(/\s+/g, ' ') : 'none');
  tauntBtn.click(); await sleep(250);
  check('pop armed (targeting)', d.body.classList.contains('targeting'));
  const seat3 = d.querySelectorAll('.seat')[3];
  const wrap3 = seat3.querySelector('.portrait-wrap');
  const img3 = seat3.querySelector('.portrait');
  const rec = { tiles: 0, maxTx: 0, maxTy: 0, maxRot: 0, flash: false, flashW: 0, tShow: 0, tGone: 0, tBack: 0, fontPx: 0, bubText: '' };
  /* Instrument setTimeout AFTER page load: doPop/explodePortrait resolve the
     window's setTimeout at call time, so the pop's scheduled delays can be
     asserted exactly (jsdom wall-clock deltas jitter under the game's timers). */
  const delays = [];
  const origST = w.setTimeout.bind(w);
  w.setTimeout = function (fn, ms) { delays.push(ms); return origST(fn, ms); };
  const t0 = Date.now();
  const mark = delays.length;
  seat3.querySelector('.pod').dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  await sleep(150);
  const burst = delays.slice(mark);
  let shownAt = 0;
  while (Date.now() - t0 < 6000) {
    const now = Date.now() - t0;
    const tiles = wrap3.querySelectorAll('.pop-tile');
    if (tiles.length && !rec.tiles) {
      rec.tiles = tiles.length;
      tiles.forEach(t => {
        rec.maxTx = Math.max(rec.maxTx, Math.abs(parseFloat(t.style.getPropertyValue('--tx')) || 0));
        rec.maxTy = Math.max(rec.maxTy, Math.abs(parseFloat(t.style.getPropertyValue('--ty')) || 0));
        rec.maxRot = Math.max(rec.maxRot, Math.abs(parseFloat(t.style.getPropertyValue('--rot')) || 0));
      });
    }
    const fl = wrap3.querySelector('.pop-flash');
    if (fl) { rec.flash = true; rec.flashW = parseFloat(w.getComputedStyle(fl).width) || 0; }
    const bub = wrap3.querySelector('.pop-bubble');
    if (bub && bub.classList.contains('show') && !shownAt) { shownAt = now; rec.fontPx = parseFloat(w.getComputedStyle(bub).fontSize) || 0; rec.bubText = bub.textContent; }
    if (shownAt && !bub && !rec.tGone) rec.tGone = now;
    if (shownAt && !rec.tShow) rec.tShow = shownAt;
    const boom = wrap3.querySelector('.pop-boom');
    if (boom && boom.classList.contains('back') && !rec.tBack) rec.tBack = now;
    if (rec.tBack && img3.style.visibility === '') break;
    await sleep(25);
  }
  check('chunk count is 3x3 = 9 bigger chunks', rec.tiles === 9, 'tiles=' + rec.tiles);
  check('table-wide spread: max |tx| >= 300px', rec.maxTx >= 300, 'maxTx=' + Math.round(rec.maxTx) + 'px maxTy=' + Math.round(rec.maxTy) + 'px');
  check('pieces tumble: max |rot| >= 260deg', rec.maxRot >= 260, 'maxRot=' + Math.round(rec.maxRot) + 'deg');
  check('big flash fired (>=2.5x portrait ~185px)', rec.flash && rec.flashW >= 185, 'flashW=' + rec.flashW + 'px');
  check('bubble font >= 20px', rec.fontPx >= 20, 'font=' + rec.fontPx + 'px text="' + rec.bubText + '"');
  check('bubble schedule: shows 200ms, holds to 2350ms (>=2s fully visible), removed 2750ms', burst.includes(200) && burst.includes(2350) && burst.includes(2750), 'pop-burst delays: ' + burst.join(','));
  check('reassembly scheduled (2900ms) after bubble removal (2750ms)', burst.includes(2900) && burst.includes(2750), 'pop-burst delays: ' + burst.join(','));
  check('reassembly starts only AFTER bubble is gone', rec.tBack > 0 && rec.tGone > 0 && rec.tBack >= rec.tGone - 40, 'bubbleGone=' + rec.tGone + 'ms backStart=' + rec.tBack + 'ms');
  check('hero pop count spent (5 -> 4)', w.localStorage.getItem('nikkiflixs_pops_taunt') === '4', 'taunt=' + w.localStorage.getItem('nikkiflixs_pops_taunt'));
  check('total event ~3.5-4.5s (back start ~2.9s nominal; jsdom timer lag tolerated)', rec.tBack >= 2700 && rec.tBack <= 3600, 'backStart=' + rec.tBack + 'ms');

  /* ---- Shotgun shares the upgraded explodePortrait ---- */
  await sleep(600);
  d.getElementById('throwBtn').click(); await sleep(300);
  giftItem('Shotgun').click(); await sleep(250);           // first pick = one-time notice
  d.getElementById('throwBtn').click(); await sleep(300);
  giftItem('Shotgun').click(); await sleep(250);           // second pick arms
  const seat4 = d.querySelectorAll('.seat')[4];
  seat4.querySelector('.pod').dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  await sleep(500);
  const sgTiles = seat4.querySelectorAll('.pop-tile').length;
  const sgFlash = !!seat4.querySelector('.pop-flash');
  check('shotgun uses upgraded explosion (9 chunks + flash)', sgTiles === 9 && sgFlash, 'tiles=' + sgTiles + ' flash=' + sgFlash);
  await sleep(2600);

  check('zero page errors', errors.length === 0, errors.slice(0, 3).join(' ; '));
  console.log(fails ? ('POP SIM: ' + fails + ' FAILURES') : 'POP SIM: ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('SIM FAIL', e); process.exit(1); });
