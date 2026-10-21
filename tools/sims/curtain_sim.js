/* BUILD 156 fold-in check: homepage + casino showroom after curtain fix + link repoint.
   Asserts: zero JS errors; first-visit intro intact; return visits settle instantly;
   showroom room choices are internal (no muse.ai, no target=_blank). */
const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); if (!ok) fails++; }

function load(file, seed) {
  const html = fs.readFileSync(file, 'utf8');
  const errors = [];
  const dom = new JSDOM(html, {
    url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      window.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } createBuffer() { return { getChannelData() { return new Float32Array(8); } }; } createBufferSource() { return { connect() {}, start() {}, stop() {} }; } createBiquadFilter() { return { connect() {}, frequency: { value: 0 } }; } get currentTime() { return 0; } };
      window.navigator.vibrate = () => true;
      window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
      window.scrollTo = () => {};
      if (seed) Object.keys(seed).forEach(k => { try { window.sessionStorage.setItem(k, seed[k]); } catch (e) {} });
      window.addEventListener('error', e => errors.push(String(e.message)));
    }
  });
  return { dom, errors };
}

(async () => {
  const HOME = '/home/hatch/workspace/poker-push/index.html';
  const CASINO = '/home/hatch/workspace/poker-push/assets/rooms/casino/index.html';

  /* homepage — fresh visit: intro preserved, no errors */
  let h1 = load(HOME, null);
  await sleep(900);
  check('homepage fresh: zero JS errors', h1.errors.length === 0, h1.errors.slice(0, 2).join('; '));
  check('homepage fresh: stage NOT pre-settled (intro intact)', !h1.dom.window.document.querySelector('.stage').classList.contains('ready'));
  h1.dom.window.close();

  /* homepage — return visit: settles instantly, warp gone */
  let h2 = load(HOME, { nikkiflixs_entered: '1' });
  await sleep(900);
  const st2 = h2.dom.window.document.querySelector('.stage');
  check('homepage return: zero JS errors', h2.errors.length === 0, h2.errors.slice(0, 2).join('; '));
  check('homepage return: stage ready instantly', !!st2 && st2.classList.contains('ready'));
  check('homepage return: stage has no zoom transform', (h2.dom.window.getComputedStyle(st2).transform || 'none') === 'none', h2.dom.window.getComputedStyle(st2).transform);
  h2.dom.window.close();

  /* casino showroom — links repointed internal */
  let c1 = load(CASINO, null);
  await sleep(900);
  check('casino fresh: zero JS errors', c1.errors.length === 0, c1.errors.slice(0, 2).join('; '));
  const choices = [...c1.dom.window.document.querySelectorAll('a.room-choice')];
  check('casino has 3 room choices', choices.length === 3, 'count=' + choices.length);
  const hrefs = choices.map(a => a.getAttribute('href'));
  check('room choices point at internal rooms', hrefs.includes('../poker/index.html') && hrefs.includes('../games/index.html') && hrefs.includes('../theater/index.html'), hrefs.join(', '));
  check('no room choice leaves the site (no muse.ai)', hrefs.every(h => !/muse\.ai/.test(h || '')));
  check('no room choice opens a new tab', choices.every(a => a.getAttribute('target') !== '_blank'));
  c1.dom.window.close();

  /* casino showroom — return visit settles (intro-done) */
  let c2 = load(CASINO, { nikkiflixs_casino_entered: '1' });
  await sleep(900);
  check('casino return: zero JS errors', c2.errors.length === 0, c2.errors.slice(0, 2).join('; '));
  check('casino return: body intro-done (curtains pinned open)', c2.dom.window.document.body.classList.contains('intro-done'));
  check('casino return: no scroll-lock (no intro-active)', !c2.dom.window.document.body.classList.contains('intro-active'));
  c2.dom.window.close();

  console.log(fails ? ('CURTAIN SIM: ' + fails + ' FAILURES') : 'CURTAIN SIM: ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CHECK FAIL', e); process.exit(1); });
