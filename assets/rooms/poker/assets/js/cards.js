// Nikkiflix Poker - card engine
// Fairness: Fisher-Yates shuffle driven by crypto.getRandomValues.
// The deck is shuffled once per hand; bots receive cards from the same
// deck and NEVER see hole cards. Nothing is rigged, weighted, or "action" dealing.
'use strict';

// Crypto-secure uniform random int in [0, n). Works in browser + Node
// via Web Crypto (no node:crypto import, so the browser can use it too).
function randomInt(n) {
  const arr = new Uint32Array(1);
  const range = 0x100000000;
  const limit = range - (range % n);
  let x;
  do { globalThis.crypto.getRandomValues(arr); x = arr[0]; } while (x >= limit);
  return x % n;
}

const RANKS = '23456789TJQKA';
const SUITS = 'shdc'; // spades hearts diamonds clubs

// card: 0..51. rank 0=Deuce..12=Ace, suit 0..3
const rankOf = c => c % 13;
const suitOf = c => (c / 13) | 0;
const cardStr = c => RANKS[rankOf(c)] + SUITS[suitOf(c)];

function newDeck() {
  const d = [];
  for (let i = 0; i < 52; i++) d.push(i);
  return d;
}

// Crypto-secure Fisher-Yates. Unbiased: every permutation equally likely.
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ---- 7-card Texas Hold'em evaluator ----
// score: higher wins. category * 1e12 + tiebreak ranks base-15 encoded.
function eval5(cards) {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every(c => suitOf(c) === suitOf(cards[0]));
  const counts = {};
  ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  const groups = Object.entries(counts)
    .map(([r, n]) => [n, +r])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]); // by count, then rank

  // straight detection (unique ranks desc)
  const uniq = [...new Set(ranks)];
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 12 && uniq[1] === 3) straightHigh = 3; // wheel A-5
  }

  const tb = rs => rs.reduce((s, r) => s * 15 + (r + 2), 0); // rank values 2..14
  let cat, tie;
  if (flush && straightHigh >= 0)      { cat = 8; tie = tb([straightHigh]); }
  else if (groups[0][0] === 4)        { cat = 7; tie = tb([groups[0][1], groups[1][1]]); }
  else if (groups[0][0] === 3 && groups[1][0] === 2) { cat = 6; tie = tb([groups[0][1], groups[1][1]]); }
  else if (flush)                     { cat = 5; tie = tb(ranks); }
  else if (straightHigh >= 0)         { cat = 4; tie = tb([straightHigh]); }
  else if (groups[0][0] === 3)        { cat = 3; tie = tb([groups[0][1], ...groups.slice(1).map(g => g[1]).sort((a,b)=>b-a)]); }
  else if (groups[0][0] === 2 && groups[1][0] === 2) {
    const prs = [groups[0][1], groups[1][1]].sort((a, b) => b - a);
    cat = 2; tie = tb([...prs, groups[2][1]]);
  }
  else if (groups[0][0] === 2)        { cat = 1; tie = tb([groups[0][1], ...groups.slice(1).map(g => g[1]).sort((a,b)=>b-a)]); }
  else                                { cat = 0; tie = tb(ranks); }
  return cat * 1e12 + tie;
}

const C = s => RANKS.indexOf(s[0]) + SUITS.indexOf(s[1]) * 13;

function evaluate7(seven) {
  let best = -1, bestHand = null;
  for (let a = 0; a < 3; a++) for (let b = a+1; b < 4; b++)
  for (let c = b+1; c < 5; c++) for (let d = c+1; d < 6; d++)
  for (let e = d+1; e < 7; e++) {
    const hand = [seven[a], seven[b], seven[c], seven[d], seven[e]];
    const s = eval5(hand);
    if (s > best) { best = s; bestHand = hand; }
  }
  return { score: best, hand: bestHand };
}

const CATEGORY = ['high card','pair','two pair','trips','straight','flush','full house','quads','straight flush'];

export { newDeck, shuffle, rankOf, suitOf, cardStr, evaluate7, eval5, C, CATEGORY, RANKS, SUITS };
