const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
// 1) shop: buy the New Mexico state flag, check storage
const shopHtml = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/casino/gift-shop.html', 'utf8');
const shop = new JSDOM(shopHtml, { url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(w) { w.localStorage.setItem('nikkiflixs_bankroll', '5000'); } });
const sd = shop.window.document, sw = shop.window;
const shopErr = []; sw.addEventListener('error', e => shopErr.push(String(e.message)));
(async () => {
  await new Promise(r => setTimeout(r, 500));
  const cards = sd.querySelectorAll('#flagGrid .flagcard');
  console.log('flag cards rendered:', cards.length);
  const nm = [...cards].find(c => c.textContent.includes('New Mexico'));
  console.log('NM card found:', !!nm);
  nm.querySelector('button').click();
  await new Promise(r => setTimeout(r, 300));
  console.log('unlocks:', sw.localStorage.getItem('nikkiflixs_fun_unlocks'), '| active:', sw.localStorage.getItem('nikkiflixs_active_flag'), '| bank (5000-100):', sw.localStorage.getItem('nikkiflixs_bankroll'));
  console.log('shop errors:', shopErr.length ? shopErr : 'none');
  // carry storage to the table
  const store = { bankroll: sw.localStorage.getItem('nikkiflixs_bankroll'), unlocks: sw.localStorage.getItem('nikkiflixs_fun_unlocks'), active: sw.localStorage.getItem('nikkiflixs_active_flag') };
  const tHtml = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
  const t = new JSDOM(tHtml, { url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
      w.navigator.vibrate = () => true;
      w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
      w.localStorage.setItem('nikkiflixs_bankroll', store.bankroll);
      w.localStorage.setItem('nikkiflixs_fun_unlocks', store.unlocks);
      w.localStorage.setItem('nikkiflixs_active_flag', store.active);
    } });
  const td = t.window.document;
  const tErr = []; t.window.addEventListener('error', e => tErr.push(String(e.message)));
  await new Promise(r => setTimeout(r, 1200));
  const heroFlag = td.querySelectorAll('.seat')[0].querySelector('.seat-flag');
  console.log('hero seat flag at table:', heroFlag ? JSON.stringify(heroFlag.textContent) + ' display:' + heroFlag.style.display : 'none');
  console.log('table errors:', tErr.length ? tErr.slice(0, 2) : 'none');
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
