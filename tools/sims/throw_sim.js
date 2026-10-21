/* BUILD 156 throwables sim: every item behaves as ITSELF.
   - BOOM (grenade): SMALL explosion variant — tiles stay close (<170px), .small boom+flash, no pop bubble.
   - SPLAT (tomato): colored .splat-decal with the item's size + rendered art, lingers.
   - FALL (shoe): lands, then DROPS off the portrait (class 'dropping'), unlike stick items.
   - STICK (sock): stays on the portrait (no drop), still there after the shoe would be gone.
   - STICKIN (dart): embedded in the portrait with the stickin class + art.
   - BIGSPLAT (poop): the huge face-covering badge. */
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
async function throwAt(label, seatIdx) {
  d.getElementById('throwBtn').click(); await sleep(300);
  const it = giftItem(label); if (!it) return false;
  it.click(); await sleep(200);
  d.querySelectorAll('.seat')[seatIdx].querySelector('.pod').dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  return true;
}
function wrap(i) { return d.querySelectorAll('.seat')[i].querySelector('.portrait-wrap'); }

(async () => {
  await sleep(1200);
  w.__pokerTest.setSpeed(0.03);

  /* ---- GRENADE: small explosion, NOT the mega-pop ---- */
  check('grenade thrown', await throwAt('Grenade', 2));
  await sleep(350);
  const w2 = wrap(2);
  const tiles = w2.querySelectorAll('.pop-tile');
  let maxTx = 0, someMove = 0;
  tiles.forEach(t => { const v = Math.abs(parseFloat(t.style.getPropertyValue('--tx')) || 0); maxTx = Math.max(maxTx, v); if (v >= 40) someMove++; });
  check('grenade makes explosion tiles', tiles.length === 9, 'tiles=' + tiles.length);
  check('grenade spread is SMALL (max |tx| < 170px, mega is >=305px)', maxTx > 0 && maxTx < 170, 'maxTx=' + maxTx.toFixed(0) + 'px');
  check('grenade tiles still burst outward (some |tx| >= 40px)', someMove >= 2, 'moved=' + someMove);
  const boom2 = w2.querySelector('.pop-boom');
  check('grenade boom uses the .small variant', !!boom2 && boom2.classList.contains('small'));
  check('grenade has NO pop bubble', !w2.querySelector('.pop-bubble'));
  await sleep(3000);
  check('grenade portrait reassembled after small boom', wrap(2).querySelector('.portrait').style.visibility !== 'hidden' && !wrap(2).querySelector('.pop-tile'));

  /* ---- TOMATO: spreading splat decal, sized, with art ---- */
  check('tomato thrown', await throwAt('Tomato', 3));
  await sleep(350);
  const decal = wrap(3).querySelector('.splat-decal');
  check('tomato leaves a splat decal', !!decal);
  check('tomato decal sized for the item (--ss 66px)', !!decal && decal.style.getPropertyValue('--ss') === '66px', decal ? decal.style.getPropertyValue('--ss') : 'none');
  check('tomato decal carries rendered art', !!decal && !!decal.querySelector('img'));
  check('tomato decal splatted in (.on)', !!decal && decal.classList.contains('on'));

  /* ---- SHOE: hits, then FALLS ---- */
  check('shoe thrown', await throwAt('Shoe', 4));
  await sleep(300);
  const shoe = wrap(4).querySelector('.splat-badge.fall');
  check('shoe lands on the portrait (.fall)', !!shoe);
  await sleep(650);
  check('shoe then DROPS off (class dropping)', !!wrap(4).querySelector('.splat-badge.fall.dropping') || !wrap(4).querySelector('.splat-badge.fall'));
  await sleep(800);
  check('shoe is gone after the fall', !wrap(4).querySelector('.splat-badge.fall'));

  /* ---- SOCK: sticks and STAYS ---- */
  check('sock thrown', await throwAt('Sock', 5));
  await sleep(300);
  const sock = wrap(5).querySelector('.splat-badge.stick');
  check('sock sticks on the portrait', !!sock);
  check('sock carries rendered art', !!sock && !!sock.querySelector('img.fx-art'));
  await sleep(1500);
  check('sock still stuck ~2s later (no drop)', !!wrap(5).querySelector('.splat-badge.stick') && !wrap(5).querySelector('.dropping'));

  /* ---- DART: sticks IN with a quiver ---- */
  check('dart thrown', await throwAt('Dart', 6));
  await sleep(300);
  const dart = wrap(6).querySelector('.splat-badge.stickin');
  check('dart embeds in the portrait (.stickin)', !!dart);
  check('dart carries rendered art', !!dart && !!dart.querySelector('img.fx-art'));

  /* ---- POOP: huge face-covering bigsplat ---- */
  check('poop thrown', await throwAt('Poop', 7));
  await sleep(300);
  check('poop bigsplat covers the face', !!wrap(7).querySelector('.splat-badge.big'));

  /* ---- PIE decal is bigger than EGG decal (sized to the item) ---- */
  check('pie thrown', await throwAt('Cream Pie', 2));
  await sleep(300);
  const pieDecal = wrap(2).querySelector('.splat-decal');
  check('pie decal is the big one (--ss 74px)', !!pieDecal && pieDecal.style.getPropertyValue('--ss') === '74px', pieDecal ? pieDecal.style.getPropertyValue('--ss') : 'none');

  console.log('page errors:', errors.length ? errors.slice(0, 3) : 'none');
  check('zero page errors', errors.length === 0);
  console.log(fails ? ('THROW SIM: ' + fails + ' FAILURES') : 'THROW SIM: ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('SIM FAIL', e); process.exit(1); });
