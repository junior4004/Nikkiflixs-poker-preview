/* BUILD 156 guns sim: three DISTINCT gun signatures.
   - Machine gun: burst of holes across the NAMEPLATE (portrait untouched), plate torn.
   - Shotgun: ONE huge .shotgun-hole in the portrait, NO explosion tiles.
   - Six-shooter: BIG holes in the portrait, one per bullet loaded (up to 6), sequential.
   Ammo economy unchanged: mg 2->1 per cartridge, sg 2->1 per shell, pt consumed per bullet fired. */
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
function fireAt(seatIdx) { d.querySelectorAll('.seat')[seatIdx].querySelector('.pod').dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true })); }
async function pick(label) { d.getElementById('throwBtn').click(); await sleep(300); const it = giftItem(label); if (!it) return false; it.click(); await sleep(250); return true; }

(async () => {
  await sleep(1200);
  w.__pokerTest.setSpeed(0.03);

  /* ---- picker: 29 throwables + 3 guns, rendered art wired ---- */
  d.getElementById('throwBtn').click(); await sleep(300);
  const items = d.querySelectorAll('.gift-item');
  check('picker has 32 items (29 throws + 3 guns)', items.length === 32, 'count=' + items.length);
  check('picker has Arrow and Dart', !!giftItem('Arrow') && !!giftItem('Dart'));
  const mgItem = giftItem('Machine Gun');
  check('machine gun picker uses rendered art (no emoji)', !!mgItem && !!mgItem.querySelector('img.item-art'));
  const sgItem = giftItem('Shotgun');
  check('shotgun picker uses rendered art (no emoji)', !!sgItem && !!sgItem.querySelector('img.item-art'));
  const pieItem = giftItem('Cream Pie');
  check('pie picker uses rendered art (no emoji)', !!pieItem && !!pieItem.querySelector('img.item-art'));
  d.getElementById('giftClose').click(); await sleep(150);

  /* ---- machine gun: notice first, then nameplate shredding ---- */
  check('mgun pick found', await pick('Machine Gun'));
  check('first mgun tap = notice only (not armed)', !!w.localStorage.getItem('nikkiflixs_gun_notice_mgun') && !d.body.classList.contains('targeting'));
  check('mgun second pick arms', await pick('Machine Gun') && d.body.classList.contains('targeting'));
  fireAt(3); await sleep(1500);
  const seat3 = d.querySelectorAll('.seat')[3];
  const np3 = seat3.querySelector('.nameplate'), wrap3 = seat3.querySelector('.portrait-wrap');
  const npHoles = np3.querySelectorAll('.bullet-hole.np').length;
  check('machine gun riddles the NAMEPLATE (>=10 holes)', npHoles >= 10, 'np holes=' + npHoles);
  check('machine gun leaves the portrait untouched (0 holes)', wrap3.querySelectorAll('.bullet-hole').length === 0, 'portrait holes=' + wrap3.querySelectorAll('.bullet-hole').length);
  check('nameplate is torn', np3.classList.contains('name-torn'));
  let ammo = JSON.parse(w.localStorage.getItem('nikkiflixs_ammo') || '{}');
  check('mg ammo 2 -> 1', ammo.mg === 1, JSON.stringify(ammo));

  /* ---- shotgun: one huge hole, no explosion ---- */
  w.localStorage.setItem('nikkiflixs_gun_notice_sgun', '1');
  w.localStorage.setItem('nikkiflixs_gun_notice_pistol', '1');
  check('shotgun pick arms', await pick('Shotgun') && d.body.classList.contains('targeting'));
  fireAt(4); await sleep(700);
  const wrap4 = d.querySelectorAll('.seat')[4].querySelector('.portrait-wrap');
  check('shotgun = exactly ONE huge hole', wrap4.querySelectorAll('.shotgun-hole').length === 1, 'holes=' + wrap4.querySelectorAll('.shotgun-hole').length);
  check('shotgun hole punched in (.on)', !!wrap4.querySelector('.shotgun-hole.on'));
  check('shotgun makes NO explosion tiles', wrap4.querySelectorAll('.pop-tile').length === 0, 'tiles=' + wrap4.querySelectorAll('.pop-tile').length);
  check('shotgun leaves portrait img visible (frame intact)', wrap4.querySelector('.portrait').style.visibility !== 'hidden');
  ammo = JSON.parse(w.localStorage.getItem('nikkiflixs_ammo') || '{}');
  check('sg ammo 2 -> 1', ammo.sg === 1, JSON.stringify(ammo));

  /* ---- six-shooter: full cylinder = 6 BIG holes, sequential ---- */
  w.localStorage.setItem('nikkiflixs_ammo', JSON.stringify({ mg: 1, sg: 1, pt: 6 }));
  check('six-shooter pick arms', await pick('Six-Shooter') && d.body.classList.contains('targeting'));
  fireAt(5); await sleep(300);
  const wrap5 = d.querySelectorAll('.seat')[5].querySelector('.portrait-wrap');
  const midHoles = wrap5.querySelectorAll('.bullet-hole.big').length;
  check('six-shooter holes land sequentially (1-5 mid-burst)', midHoles >= 1 && midHoles <= 5, 'mid=' + midHoles);
  await sleep(1100);
  const bigHoles = wrap5.querySelectorAll('.bullet-hole.big');
  check('six-shooter = 6 BIG holes for a full cylinder', bigHoles.length === 6, 'holes=' + bigHoles.length);
  let bigW = 0;
  if (bigHoles.length) { const cs = w.getComputedStyle(bigHoles[0]); bigW = parseFloat(cs.width) || 0; }
  check('six-shooter holes are BIG (>=14px)', bigW >= 14, 'computed width=' + bigW + 'px');
  check('six-shooter holes are on the portrait (not nameplate)', d.querySelectorAll('.seat')[5].querySelector('.nameplate').querySelectorAll('.bullet-hole').length === 0);
  ammo = JSON.parse(w.localStorage.getItem('nikkiflixs_ammo') || '{}');
  check('pt ammo 6 -> 0 (one per bullet fired)', ammo.pt === 0, JSON.stringify(ammo));

  /* ---- six-shooter dry: will not arm ---- */
  await pick('Six-Shooter');
  check('dry six-shooter does NOT arm', !d.body.classList.contains('targeting'));

  console.log('page errors:', errors.length ? errors.slice(0, 3) : 'none');
  check('zero page errors', errors.length === 0);
  console.log(fails ? ('GUNS SIM: ' + fails + ' FAILURES') : 'GUNS SIM: ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('SIM FAIL', e); process.exit(1); });
