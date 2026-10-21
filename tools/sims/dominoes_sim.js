/* BUILD 171: dominoes ROUND TABLE — full-game sim for 2P and 4P.
   Drives the real page in jsdom: mode buttons, hand-tile clicks, end picks,
   DRAW/PASS buttons, NEXT ROUND. Bots run on their real timers (FAST mode).
   Verifies on every poll:
     - tile conservation: hands + chain + boneyard === 28
     - chain adjacency invariant: chain[i].right === chain[i+1].left
     - open ends reported by the page match the chain ends
     - every double on the train is rendered SIDEWAYS (.dom.v)
   Verifies at every round end with INDEPENDENT pip math (from the page's
   recorded hand pips, recomputed here from first principles):
     - go-out: winner hand = 0 pips; points = SUM of all other hands' pips
     - blocked: unique low hand wins; points = (all other hands) - (own pips)
       = total - 2*min; tie for low = no winner, 0 points
     - match scores accumulate exactly by the awarded points
   A match must reach a winner (>= 100) in BOTH modes. */
const fs = require('fs');
const { JSDOM } = require('/home/hatch/workspace/poker-tables/nikkiflixs-server/node_modules/jsdom');
const file = process.argv[2] || '/home/hatch/workspace/poker-push/assets/rooms/tables/dominoes.html';
const html = fs.readFileSync(file, 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
  if (!ok) failures++;
}

function freshPage() {
  const dom = new JSDOM(html, {
    url: 'https://nikkiflixs.com/assets/rooms/tables/dominoes.html',
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) { w.navigator.vibrate = () => true; }
  });
  const errors = [];
  dom.window.addEventListener('error', e => errors.push(String(e.message)));
  return { w: dom.window, d: dom.window.document, errors };
}

function verifyScoring(rounds, P, label) {
  let cum = Array(P).fill(0), ok = true, detail = '';
  for (let r = 0; r < rounds.length; r++) {
    const rd = rounds[r], hp = rd.handPips;
    const total = hp.reduce((a, b) => a + b, 0);
    if (rd.how === 'domino') {
      if (!(hp[rd.winner] === 0)) { ok = false; detail = `round ${r}: go-out winner held ${hp[rd.winner]} pips`; break; }
      const exp = total - hp[rd.winner];
      if (rd.pts !== exp) { ok = false; detail = `round ${r}: pts ${rd.pts} != sum-of-others ${exp} (hands ${hp})`; break; }
    } else {
      const min = Math.min(...hp), lows = hp.filter(v => v === min).length;
      if (lows === 1) {
        const wIdx = hp.indexOf(min);
        const exp = total - 2 * min;
        if (rd.winner !== wIdx || rd.pts !== exp) { ok = false; detail = `round ${r}: blocked winner/pts ${rd.winner}/${rd.pts} != ${wIdx}/${exp} (hands ${hp})`; break; }
      } else if (!(rd.winner === -1 && rd.pts === 0)) {
        ok = false; detail = `round ${r}: blocked tie should be no-score, got winner ${rd.winner} pts ${rd.pts}`; break;
      }
    }
    if (rd.winner >= 0) cum[rd.winner] += rd.pts;
    if (JSON.stringify(cum) !== JSON.stringify(rd.scores)) {
      ok = false; detail = `round ${r}: cumulative ${cum} != page scores ${rd.scores}`; break;
    }
  }
  check(label + ': scoring independently verified (' + rounds.length + ' rounds)', ok, detail);
  return ok;
}

async function playMatch(P, label) {
  const { w, d, errors } = freshPage();
  await sleep(150);
  const T = w.__domtest;
  check(label + ': test hook present', !!T);
  T.setFast(true);
  d.getElementById(P === 2 ? 'mode2' : 'mode4').click();
  await sleep(60);
  let st = T.state();
  // NOTE: FAST bot timers (5ms) can fire the opening play before this sample —
  // the deal invariant is: nobody holds > 7 and hands+chain+boneyard === 28.
  check(label + ': match starts, ' + P + ' players dealt 7', st.P === P && st.handCounts.every(c => c <= 7) &&
    st.handCounts.reduce((a, b) => a + b, 0) + st.chain.length + st.boneyard === 28,
    'hands=' + st.handCounts.join(',') + ' boneyard=' + st.boneyard);
  check(label + ': boneyard correct', st.boneyard === 28 - 7 * P, 'boneyard=' + st.boneyard);

  let invariantBreaks = 0, sidewaysBreaks = 0, guard = 0, lastRounds = 0;
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    guard++;
    st = T.state();
    // conservation + adjacency + ends on every poll
    const total = st.handCounts.reduce((a, b) => a + b, 0) + st.chain.length + st.boneyard;
    if (st.phase !== 'menu' && total !== 28) { invariantBreaks++; console.log('  conservation break: total=' + total + ' phase=' + st.phase); break; }
    for (let i = 0; i + 1 < st.chain.length; i++) {
      if (st.chain[i].right !== st.chain[i + 1].left) { invariantBreaks++; console.log('  adjacency break at ' + i); break; }
    }
    if (st.chain.length) {
      const e = st.ends;
      if (!e || e.L !== st.chain[0].left || e.R !== st.chain[st.chain.length - 1].right) { invariantBreaks++; console.log('  ends mismatch'); break; }
      const dbls = st.chain.filter(c => c.left === c.right).length;
      const side = d.querySelectorAll('.ptile .dom.v').length;
      if (side !== dbls) { sidewaysBreaks++; console.log('  sideways break: chain doubles=' + dbls + ' rendered .dom.v=' + side); break; }
    }
    if (st.phase === 'matchover') break;
    if (st.phase === 'over') { d.getElementById('nextRoundBtn').click(); await sleep(30); continue; }
    // hero throw-in choice -> keep playing
    if (d.getElementById('throwinBox').style.display === 'block') { d.getElementById('throwNo').click(); await sleep(30); continue; }
    if (st.phase === 'play' && st.turn === 0) {
      if (st.heroPlayable.length) {
        const el = d.querySelector('.handtile[data-hi="' + st.heroPlayable[0] + '"]');
        if (!el) { invariantBreaks++; console.log('  hero playable tile element missing'); break; }
        el.click();
        await sleep(25);
        const clickEnd = d.querySelector('.ptile.clickable');
        if (clickEnd) clickEnd.click();
      } else if (d.getElementById('drawBtn').style.display !== 'none') {
        d.getElementById('drawBtn').click();
      } else if (d.getElementById('passBtn').style.display !== 'none') {
        d.getElementById('passBtn').click();
      } else { await sleep(40); }
    } else {
      await sleep(30);
    }
    if (T.rounds.length !== lastRounds) lastRounds = T.rounds.length;
  }
  st = T.state();
  check(label + ': invariants held all game (conservation/adjacency/ends)', invariantBreaks === 0);
  check(label + ': every double rendered sideways', sidewaysBreaks === 0);
  check(label + ': match completed with a winner >= 100', st.phase === 'matchover' && Math.max(...st.scores) >= 100,
    'phase=' + st.phase + ' scores=' + st.scores.join(',') + ' rounds=' + T.rounds.length);
  check(label + ': multiple rounds played', T.rounds.length >= 2, 'rounds=' + T.rounds.length);
  verifyScoring(T.rounds, P, label);
  check(label + ': zero page errors', errors.length === 0, errors.slice(0, 2).join(' ; '));
  return st;
}

(async () => {
  await playMatch(2, '2P');
  await playMatch(4, '4P');
  console.log(failures === 0 ? 'DOMINOES SIM: ALL PASS' : 'DOMINOES SIM: ' + failures + ' FAILURES');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('SIM CRASH', e); process.exit(2); });
