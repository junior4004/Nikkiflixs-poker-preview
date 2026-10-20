const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(window) {
    window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
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
function toastText() { const t = d.querySelector('.toast, #toast, [role="status"]'); return t ? t.textContent : ''; }
(async () => {
  await sleep(1200);
  w.__pokerTest.setSpeed(0.03);
  // open throw picker
  d.getElementById('throwBtn').click(); await sleep(300);
  const items = d.querySelectorAll('.gift-item');
  console.log('picker items:', items.length, '| has Poop:', !!giftItem('Poop'), '| has Machine Gun:', !!giftItem('Machine Gun'), '| has Grenade:', !!giftItem('Grenade'), '| has Missile:', !!giftItem('Missile'));
  console.log('MG sub-label:', giftItem('Machine Gun') ? giftItem('Machine Gun').textContent.replace(/\s+/g, ' ') : 'n/a');
  // FIRST tap on machine gun = notice only
  giftItem('Machine Gun').click(); await sleep(300);
  console.log('notice flag set:', !!w.localStorage.getItem('nikkiflixs_gun_notice_mgun'), '| armed after notice (should be false):', d.body.classList.contains('targeting'));
  // SECOND pick arms it
  d.getElementById('throwBtn').click(); await sleep(300);
  giftItem('Machine Gun').click(); await sleep(300);
  console.log('armed after 2nd pick:', d.body.classList.contains('targeting'));
  // pointerdown on seat 3 pod fires
  const seat3 = d.querySelectorAll('.seat')[3];
  seat3.querySelector('.pod').dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  await sleep(1200);
  const holes = seat3.querySelectorAll('.bullet-hole').length;
  const ammo = JSON.parse(w.localStorage.getItem('nikkiflixs_ammo') || '{}');
  console.log('bullet holes on seat 3:', holes, '| ammo mg (2->1):', ammo.mg, 'sg:', ammo.sg, 'pt:', ammo.pt);
  // poop big splat via click on seat 2
  d.getElementById('throwBtn').click(); await sleep(300);
  giftItem('Poop').click(); await sleep(200);
  d.querySelectorAll('.seat')[2].querySelector('.pod').click(); await sleep(700);
  console.log('poop big splat on seat 2:', !!d.querySelectorAll('.seat')[2].querySelector('.splat-badge.big'));
  // grenade explosion tiles on seat 4 (16 tiles, 4x4)
  d.getElementById('throwBtn').click(); await sleep(300);
  giftItem('Grenade').click(); await sleep(200);
  d.querySelectorAll('.seat')[4].querySelector('.pod').click(); await sleep(700);
  console.log('grenade boom tiles on seat 4:', d.querySelectorAll('.seat')[4].querySelectorAll('.pop-tile').length);
  console.log('page errors:', errors.length ? errors.slice(0, 3) : 'none');
  process.exit(0);
})().catch(e => { console.error('SIM FAIL', e); process.exit(1); });
