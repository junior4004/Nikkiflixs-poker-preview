/* BUILD 160 (brief: BUILD 159 — number taken by the parlay commit) table polish.
   (a) craps zone spacing: effective gap cascade BEFORE (git HEAD) vs AFTER —
       one rhythm after: 5px desktop / 4px mobile for every zone family;
       wing row shares measured; dice texture wired, 12 whole faces, tumble intact.
   (b) chip reskin: geometry declarations for every chip selector are byte-identical
       HEAD vs AFTER; only paint changed (photo faces referenced + on disk).
   (c) audio: chip-clack.mp3 + wood-knock.mp3 exist and are real MP3s; the check
       resolve branch calls sfx('knock'); 'knock' kind routes to wood-knock.mp3.
   (d) turn alert: jsdom runtime — vibrate fires on HERO turn-start with the new
       pattern, NEVER on a bot turn; shell iframe delegates `vibrate`. */
const fs = require('fs');
const { execSync } = require('child_process');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const RED = '/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html';
const ASSETS = '/home/hatch/workspace/poker-push/assets/rooms/poker/assets';
const after = fs.readFileSync(RED, 'utf8');
const before = execSync('git -C /home/hatch/workspace/poker-push show HEAD:assets/rooms/poker/table-red-3d-v2.html', { encoding: 'utf8', maxBuffer: 4e6 });
const shell = fs.readFileSync('/home/hatch/workspace/poker-push/index.html', 'utf8');
let failures = 0;
function check(name, ok, extra) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); if (!ok) failures++; }

/* ---------- tiny CSS rule parser (handles one @media level, skips @keyframes) ---------- */
function parseRules(html) {
  const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = []; let order = 0;
  function walk(text, media) {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i); if (open < 0) break;
      const prelude = text.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
      const body = text.slice(open + 1, j - 1);
      if (/^@media/.test(prelude)) walk(body, /max-width:720px/.test(prelude) ? 'mobile' : 'other');
      else if (/^@/.test(prelude)) { /* keyframes etc: skip */ }
      else if (prelude) {
        const decls = {};
        body.split(';').forEach(d => { const c = d.indexOf(':'); if (c > 0) decls[d.slice(0, c).trim()] = d.slice(c + 1).trim(); });
        rules.push({ selectors: prelude.split(',').map(s => s.trim()), decls, media, order: order++ });
      }
      i = j;
    }
  }
  walk(css, null);
  return rules;
}
function spec(sel) {
  const a = (sel.match(/#/g) || []).length;
  const b = (sel.match(/\./g) || []).length + (sel.match(/\[/g) || []).length + (sel.match(/:(nth-child|last-child|first-child|hover|active)/g) || []).length;
  const c = (sel.match(/::?(before|after)/g) || []).length + sel.split(/[\s>+~]+/).filter(t => /^[a-z]/i.test(t)).length;
  return [a, b, c];
}
function effective(rules, matchSelectors, prop, mobile) {
  let best = null;
  for (const r of rules) {
    if (r.media && !(mobile && r.media === 'mobile')) continue;
    if (!mobile && r.media) continue;
    for (const s of r.selectors) {
      if (!matchSelectors.includes(s) || !(prop in r.decls)) continue;
      const sp = spec(s), key = [...sp, r.order];
      const wins = !best || key.some((v, i) => v !== best.key[i] && key.slice(0, i).every((u, j) => u === best.key[j]) && v > best.key[i]);
      if (wins) best = { key, value: r.decls[prop], sel: s };
    }
  }
  return best ? best.value : null;
}

/* ---------- (a) craps spacing ---------- */
const rb = parseRules(before), ra = parseRules(after);
const PROBES = [
  ['perspective column', ['.craps-perspective']],
  ['lower layout', ['.craps-lower-layout', '.craps-perspective .craps-lower-layout']],
  ['wing zones', ['.craps-wing', '.craps-perspective .craps-wing']],
  ['center props', ['.craps-center-props', '.craps-perspective .craps-center-props']],
  ['number bank', ['.craps-number-bank', '.craps-perspective .craps-number-bank']],
  ['hardway grid', ['.hardway-grid', '.craps-perspective .hardway-grid']],
  ['horn grid', ['.horn-grid', '.craps-perspective .horn-grid']],
  ['big 6/8 pair', ['.craps-big-pair', '.craps-perspective .craps-big-pair']],
  ['mode panel', ['.craps-mode-panel', '.craps-perspective .craps-mode-panel']],
];
console.log('--- craps inter-zone gaps (px) ---');
for (const [name, sels] of PROBES) {
  const bd = effective(rb, sels, 'gap', false), ad = effective(ra, sels, 'gap', false);
  const bm = effective(rb, sels, 'gap', true), am = effective(ra, sels, 'gap', true);
  console.log(`  ${name.padEnd(18)} desktop ${bd} -> ${ad} | mobile ${bm} -> ${am}`);
  check(`gap evened: ${name} desktop`, ad === '5px', `${bd} -> ${ad}`);
  check(`gap evened: ${name} mobile`, am === '4px', `${bm} -> ${am}`);
}
function flexGrow(rules, sels) { const v = effective(rules, sels, 'flex', false); return v ? parseFloat(v.split(/\s+/)[0]) : null; }
const comeB = flexGrow(rb, ['.craps-wing .craps-come']), comeA = flexGrow(ra, ['.craps-wing .craps-come', '.craps-perspective .craps-wing .craps-come']);
const rowB = flexGrow(rb, ['.craps-wing .craps-layout-button']);
const share = g => (g / (4 + g) * 100);
console.log(`  wing rows: plain ${(100 / (4 + comeB)).toFixed(1)}% each, COME ${share(comeB).toFixed(1)}%  ->  plain ${(100 / (4 + comeA)).toFixed(1)}% each, COME ${share(comeA).toFixed(1)}%`);
check('wing COME share tightened toward even', comeA === 1.25 && share(comeA) - 100 / (4 + comeA) < share(comeB) - 100 / (4 + comeB), `${share(comeB).toFixed(1)}% -> ${share(comeA).toFixed(1)}%`);
check('wing fills the felt (flex-grow on wing)', (effective(ra, ['.craps-perspective .craps-wing'], 'flex', false) || '').startsWith('1'), effective(ra, ['.craps-perspective .craps-wing'], 'flex', false));

/* ---------- (a2) dice ---------- */
check('dice material texture wired', after.includes('.die-face::before') && after.includes('assets/dice-face-texture.webp'));
check('dice texture on disk', fs.existsSync(ASSETS + '/dice-face-texture.webp') && fs.statSync(ASSETS + '/dice-face-texture.webp').size > 10000);
const faceCount = (after.match(/class="die-face/g) || []).length;
check('12 whole die faces (2 dice x 6)', faceCount === 12, String(faceCount));
check('tumble keyframes untouched', after.includes('@keyframes cubeTumbleA') && after.includes('@keyframes cubeTumbleB') && after.includes('.craps-stick'));
check('drilled-pip shading on all 6 values', [1, 2, 3, 4, 5, 6].every(v => after.includes(`.die-face[data-value="${v}"]{--pips:`) && after.split(`.die-face[data-value="${v}"]{--pips:`).length >= 3));

/* ---------- (b) chip geometry identical ---------- */
const GEO = ['width', 'height', 'left', 'right', 'top', 'bottom', 'inset', 'transform', 'position', 'flex', 'flex-basis', 'flex-grow', 'flex-shrink', 'margin', 'margin-top', 'margin-left', 'margin-right', 'margin-bottom', 'padding', 'border-width', 'min-width', 'min-height', 'max-width', 'max-height'];
const CHIP_SELS = ['.seat-chips', '.seat-chips i', '.seat-chips i:nth-child(2)', '.seat-chips i:nth-child(3)', '.seat-chips i:last-child', '.seat-chips i:before', '.seat-chips i:last-child:after',
  '.pot-chips', '.pot-chips i', '.pot-chips i:nth-child(2)', '.pot-chips i:nth-child(3)', '.pot-chips i:nth-child(4)', '.pot-chips i:nth-child(5)', '.pot-chips i:before', '.pot-chips i:last-child:after',
  '.pot-flight', '.pot-flight i', '.pot-flight i:nth-child(4)', '.pot-flight .bet-stack', '.bet-stack', '.bet-stack i', '.bet-stack i:nth-child(2)', '.bet-stack i:nth-child(3)', '.bet-stack i:before',
  '.flying-chip', '.flying-chip.blue', '.flying-chip.gold', '.round-bet'];
function geoMap(rules) {
  const m = {};
  for (const sel of CHIP_SELS) {
    m[sel] = {};
    for (const r of rules) {
      if (r.media) continue;
      if (!r.selectors.includes(sel)) continue;
      for (const p of GEO) if (p in r.decls) m[sel][p] = r.decls[p];
    }
  }
  return m;
}
const gb = geoMap(rb), ga = geoMap(ra);
let geoDiffs = [];
for (const sel of CHIP_SELS) if (JSON.stringify(gb[sel]) !== JSON.stringify(ga[sel])) geoDiffs.push(sel + ': ' + JSON.stringify(gb[sel]) + ' != ' + JSON.stringify(ga[sel]));
check('chip geometry byte-identical HEAD vs AFTER (all ' + CHIP_SELS.length + ' chip selectors)', geoDiffs.length === 0, geoDiffs.slice(0, 3).join(' ;; ') || 'anchors untouched');
for (const c of ['red', 'blue', 'gold']) {
  check(`chip face art wired + on disk: ${c}`, after.includes(`assets/chip-face-${c}.webp`) && fs.existsSync(`${ASSETS}/chip-face-${c}.webp`) && fs.statSync(`${ASSETS}/chip-face-${c}.webp`).size > 5000);
}

/* ---------- (c) audio ---------- */
for (const f of ['chip-clack.mp3', 'wood-knock.mp3']) {
  const p = ASSETS + '/sfx/' + f, buf = fs.existsSync(p) ? fs.readFileSync(p) : Buffer.alloc(0);
  const isMp3 = buf.length > 5000 && (buf.slice(0, 3).toString() === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
  check(`audio asset real: ${f}`, isMp3, buf.length + ' bytes');
}
check("check action wired to knock (shared hero+bot resolve branch)", /setActionPlate\(index,'CHECK',false\);sfx\('knock'\)/.test(after));
check("'knock' kind routes to wood-knock.mp3", after.includes("kind==='knock'") && after.includes("sfxFile('wood-knock',.95)"));
check("'chips' kind routes to chip-clack.mp3", after.includes("sfxFile('chip-clack',.85)"));
check('file player respects the alertsUnlocked gate', /function sfxFile\(name,vol\)\{try\{if\(!alertsUnlocked\)return false/.test(after));

/* ---------- (f) wordmark: one clean three-line diagonal print ---------- */
check('exactly ONE poker wordmark element', (after.match(/class="brand"/g) || []).length === 1);
const brandHtml = (after.match(/<div class="brand">([\s\S]*?)<\/div>/) || [])[1] || '';
check('wordmark line 1: Nikkiflixs script', /<span class="brand-name">Nikkiflixs<\/span>/.test(brandHtml));
check('wordmark line 2: Theater and Poker Room', /<span class="brand-sub">Theater and Poker Room<\/span>/.test(brandHtml));
check('wordmark line 3: Established 2026', /<span class="brand-est">Established 2026<\/span>/.test(brandHtml));
check('old combined sub-line gone', !after.includes('Theater and Poker Room · Est. 2026'));
const brandTransform = effective(ra, ['.brand'], 'transform', false) || '';
const angle = Number((brandTransform.match(/rotate\((-?[\d.]+)deg\)/) || [])[1]);
check('wordmark diagonal rises bottom-left -> top-right', angle <= -20 && angle >= -35, brandTransform);
const nameSize = parseFloat(effective(ra, ['.brand-name'], 'font-size', false) || '0');
check('wordmark script grander than the 151 stamp (132px)', nameSize >= 140, nameSize + 'px');
check('craps keeps its own separate top wordmark (untouched)', (after.match(/class="craps-wordmark"/g) || []).length === 1 && !/\.craps-wordmark\{[^}]*rotate/.test(after));

/* ---------- (d) turn alert runtime ---------- */
check('shell iframe delegates vibrate to the room frame', /id="roomFrame"[^>]*allow="[^"]*vibrate/.test(shell));
const vibrateCalls = [];
const audioSrcs = [];
const dom = new JSDOM(after, {
  url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(w) {
    w.AudioContext = class { constructor() { this.state = 'running'; } resume() { return Promise.resolve(); } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } createBuffer() { return { getChannelData() { return new Float32Array(4410); } }; } get currentTime() { return 0; } };
    w.navigator.vibrate = p => { vibrateCalls.push(JSON.stringify(p)); return true; };
    w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    const RealAudio = w.Audio;
    w.Audio = function (src) { audioSrcs.push(String(src)); return new RealAudio(src); };
    w.__forceHalf = false;
    const realRandom = w.Math.random;
    w.Math.random = function () { return w.__forceHalf ? 0.5 : realRandom(); };
    w.localStorage.setItem('nikkiflixs_bankroll', '5000');
  }
});
const w = dom.window;
const errors = [];
w.addEventListener('error', e => errors.push(String(e.message)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await sleep(600);
  const T = w.__pokerTest;
  check('poker test hooks present', !!T);
  w.document.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  w.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  await sleep(100);
  check('alerts unlocked by first tap', T.getState().alertsUnlocked === true);
  w.document.querySelector('#tableGrid .join-table[data-free-table="true"]').click(); /* spectate a live table so bot hands (and CHECKs) flow */
  await sleep(300);
  w.__forceHalf = true;
  T.setSpeed(0.02);
  let checksSeen = 0;
  for (let s = 0; s < 30 && !checksSeen; s++) {
    await sleep(1000);
    checksSeen = T.getLog().filter(i => i.type === 'action' && i.detail && i.detail.action === 'check').length;
  }
  check('live hands produced CHECK actions (knock path exercised)', checksSeen >= 1, checksSeen + ' checks in log');
  check('CHECK played wood-knock.mp3', audioSrcs.includes('assets/sfx/wood-knock.mp3'), JSON.stringify([...new Set(audioSrcs)]));
  check('bets/calls played chip-clack.mp3', audioSrcs.includes('assets/sfx/chip-clack.mp3'));
  const beforeBot = vibrateCalls.length;
  const botEntry = T.previewOpponentTurn();
  check('BOT turn: alert suppressed', !!botEntry && botEntry.detail && botEntry.detail.suppressed === true, JSON.stringify(botEntry));
  check('BOT turn: no beep, no buzz', !!botEntry && !!botEntry.detail && botEntry.detail.beeped === false && botEntry.detail.buzzed === false);
  check('BOT turn: navigator.vibrate never called', vibrateCalls.length === beforeBot, vibrateCalls.length + ' calls');
  const beforeHero = vibrateCalls.length;
  T.showRaiseSelector();
  const heroCalls = vibrateCalls.slice(beforeHero);
  const log = T.getLog().filter(i => i.type === 'turn-alert');
  const heroEntry = log[log.length - 1];
  check('HERO turn: alert entry fired for local seat', !!heroEntry && !!heroEntry.detail && heroEntry.detail.suppressed === false && heroEntry.detail.buzzed === true, JSON.stringify(heroEntry));
  check('HERO turn: vibrate pattern [280,70,280,70,380]', heroCalls.includes('[280,70,280,70,380]'), heroCalls.join(' '));
  check('HERO turn: beep fired', !!heroEntry && !!heroEntry.detail && heroEntry.detail.beeped === true);
  check('zero page errors', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  /* ---------- (e) lobby: NO auto-join, ever ---------- */
  const dom2 = new JSDOM(after, {
    url: 'https://nikkiflixs.com/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w2) {
      w2.AudioContext = w.AudioContext;
      w2.navigator.vibrate = () => true;
      w2.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
      w2.localStorage.setItem('nikkiflixs_bankroll', '5000');
    }
  });
  const w2 = dom2.window, d2 = w2.document, errors2 = [];
  w2.addEventListener('error', e => errors2.push(String(e.message)));
  await sleep(4000); /* the killed auto-start fired at 2.5s */
  const T2 = w2.__pokerTest;
  const opened0 = T2.getLog().some(i => i.type === 'table-opened');
  check('LOBBY idle 4s: no table auto-opened', !opened0 && !d2.getElementById('roomLobby').classList.contains('hidden') && d2.getElementById('tableRoom').classList.contains('is-hidden'));
  check('LOBBY idle 4s: hero not queued to join', T2.getState().pendingJoinNextHand === false);
  d2.querySelector('#tableGrid .join-table[data-free-table="true"]').click(); /* VIEW TABLE tap */
  await sleep(300);
  check('VIEW tap opens the table to spectate', T2.getLog().some(i => i.type === 'table-opened') && T2.getState().sittingOut.includes('0'));
  check('VIEW tap does NOT queue a deal-in', T2.getState().pendingJoinNextHand === false);
  T2.setSpeed(0.02);
  for (let s = 0; s < 45 && T2.getState().handNumber < 2; s++) await sleep(1000);
  const log2 = T2.getLog();
  check('two hands ran at the viewed table', T2.getState().handNumber >= 2, 'handNumber=' + T2.getState().handNumber);
  check('spectating NEVER auto-seats across hand boundaries', !log2.some(i => i.type === 'seat-activated-next-hand') && !log2.some(i => i.type === 'seat-spectates-first-hand') && T2.getState().sittingOut.includes('0') && T2.getState().pendingJoinNextHand === false);
  d2.getElementById('sitIn').click(); /* the explicit tap */
  for (let s = 0; s < 10 && !T2.getState().pendingJoinNextHand; s++) await sleep(500);
  check('SIT IN tap registers join-next-hand', T2.getState().pendingJoinNextHand === true);
  for (let s = 0; s < 45 && !T2.getLog().some(i => i.type === 'seat-activated-next-hand'); s++) await sleep(1000);
  check('SIT IN seats the hero on the next hand', T2.getLog().some(i => i.type === 'seat-activated-next-hand') && !T2.getState().sittingOut.includes('0'));
  check('lobby phase: zero page errors', errors2.length === 0, errors2.slice(0, 3).join(' ;; '));
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log('FAIL | sim crashed: ' + e.message); process.exit(1); });
