const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync(process.argv[2] || '/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html', 'utf8');
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(w) {
    w.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } get currentTime() { return 0; } };
    w.navigator.vibrate = () => true;
    w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    w.localStorage.setItem('nikkiflixs_bankroll', '5000');
  }
});
const w = dom.window, d = w.document;
const errors = [];
w.addEventListener('error', e => errors.push(String(e.message)));
setInterval(() => { d.querySelectorAll('.flying-card,.fold-card,.flying-chip,.pot-flight,.bj-flying-card').forEach(el => el.dispatchEvent(new w.Event('animationend', { bubbles: true }))); }, 20);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await sleep(1000);
  // enter the casino blackjack room the way the picker does
  const bjBtn = [...d.querySelectorAll('[data-casino-game="blackjack"]')][0];
  if (bjBtn) bjBtn.click();
  await sleep(600);
  const chip = d.querySelector('.bj-chip[data-value="50"]');
  console.log('bj room open:', !!chip);
  if (!chip) { console.log('errors:', errors.slice(0, 3)); process.exit(1); }
  chip.click();
  d.getElementById('blackjackBetCircle').click();
  await sleep(300);
  d.getElementById('blackjackDeal').click();
  const t0 = Date.now();
  const iv = setInterval(() => {
    const msg = d.getElementById('blackjackMessage').textContent;
    if (msg.includes('Hit, stand') || Date.now() - t0 > 15000) {
      clearInterval(iv);
      (async () => {
        const dbl = d.getElementById('blackjackDouble');
        console.log('msg:', msg, '| DOUBLE disabled:', dbl.disabled, '| score:', d.getElementById('playerScore').textContent);
        const cards = [...d.getElementById('playerHand').children];
        console.log('card structure:', cards.map(c => c.children.length).join(','), '(expect 3,3 corners+mid)');
        if (!dbl.disabled) {
          dbl.click();
          await sleep(3500);
          console.log('after DOUBLE: msg:', d.getElementById('blackjackMessage').textContent, '| cards:', d.getElementById('playerHand').children.length);
        }
        console.log('page errors:', errors.length ? errors.slice(0, 3) : 'none');
        process.exit(0);
      })();
    }
  }, 200);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
