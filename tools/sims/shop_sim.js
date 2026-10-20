const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const html = fs.readFileSync('/home/hatch/workspace/poker-push/assets/rooms/casino/gift-shop.html', 'utf8');
const dom = new JSDOM(html, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(window) { window.localStorage.setItem('nikkiflixs_bankroll', '5000'); }
});
const w = dom.window, d = w.document;
const errors = [];
w.addEventListener('error', e => errors.push(String(e.message)));
(async () => {
  await new Promise(r => setTimeout(r, 600));
  const cards = d.querySelectorAll('#ammoGrid .card');
  console.log('ammo cards:', cards.length, '| names:', [...cards].map(c => c.querySelector('.nm').textContent).join(' / '));
  console.log('starting ammo:', w.localStorage.getItem('nikkiflixs_ammo'));
  // buy one shotgun shell (card idx 1)
  [...cards[1].querySelectorAll('button')].find(b => b.textContent === 'BUY').click();
  await new Promise(r => setTimeout(r, 300));
  console.log('after buying 1 shell — ammo:', w.localStorage.getItem('nikkiflixs_ammo'), '| bankroll (5000-100):', w.localStorage.getItem('nikkiflixs_bankroll'));
  console.log('page errors:', errors.length ? errors.slice(0, 3) : 'none');
  process.exit(0);
})();
