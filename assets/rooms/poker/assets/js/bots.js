// Nikkiflix Poker — bot personalities + decision making.
// Bots play a straightforward tight-aggressive-ish game with per-bot
// personality noise, occasional bluffs, and human-like table chatter.
// They NEVER see other players' hole cards: decisions use only their own
// hole cards, the board, and public betting info (same as a human sees).
import { handStrength } from './game.js';

export const BOT_DEFS = [
  { name: 'Nicole',  tight: 0.65, aggro: 0.45, skin: 0xe8b88a, shirt: 0x274b73, hair: 0x4a2a0a, style: 3 },
  { name: 'Promise', tight: 0.45, aggro: 0.60, skin: 0x8d5a3b, shirt: 0x2b7a3f, hair: 0x111111, style: 0 },
  { name: 'Marcus',  tight: 0.55, aggro: 0.50, skin: 0x6b4226, shirt: 0x5b2b7a, hair: 0x000000, style: 1 },
  { name: 'BigAl',   tight: 0.25, aggro: 0.80, skin: 0xc98d64, shirt: 0x7a1f2b, hair: 0x2a1a0e, style: 1 },
  { name: 'Sofia',   tight: 0.80, aggro: 0.35, skin: 0xf0c8a0, shirt: 0xb06a1f, hair: 0xd8d0c0, style: 3 },
  { name: 'Dre',     tight: 0.50, aggro: 0.55, skin: 0x7a4e2e, shirt: 0x1f7a7a, hair: 0x332211, style: 0 },
  { name: 'Tanya',   tight: 0.60, aggro: 0.65, skin: 0xdb9d6e, shirt: 0x8a8a2b, hair: 0x6b4a1f, style: 2 },
];

const BETWEEN_HAND_LINES = [
  'Good hit.',
  'Nice win.',
  "I'm on a heater.",
  'Well played.',
  'Good hand.',
  'That was a close one.',
  'I like playing here.',
  'Beautiful table design.',
  'Comfortable playing here.',
];

export function botLine() {
  return BETWEEN_HAND_LINES[(Math.random() * BETWEEN_HAND_LINES.length) | 0];
}

function clampBet(info, p, want) {
  // bet sizing when currentBet === 0: at least BB unless all-in for less
  const maxTo = p.betStreet + p.stack;
  if (maxTo < info.minRaiseTo && maxTo <= 0) return null;
  if (maxTo <= 20) return { type: 'bet', amount: maxTo }; // short all-in
  const amt = Math.max(20, Math.min(maxTo, Math.round(want)));
  return { type: 'bet', amount: amt };
}

export function decideBot(game, seat) {
  const info = game.nextAction();
  if (!info || info.seat !== seat) return { type: 'fold' };
  const p = game.players[seat];
  const def = BOT_DEFS[(seat - 1 + BOT_DEFS.length) % BOT_DEFS.length];
  const strength = typeof game.estimateStrength === 'function'
    ? game.estimateStrength(seat, 160)
    : handStrength(p.hole, game.board, 160);
  const noise = (Math.random() - 0.5) * 0.12;
  const s = Math.max(0, Math.min(1, strength + noise - (def.tight - 0.5) * 0.12));
  const heroIsOut = Boolean(game.players[0]?.folded || game.players[0]?.sittingOut);
  const liveBots = game.players.filter(player => player.isBot && player.inHand && !player.folded).length;
  const hero = game.players[0];
  const facingHeroRaise = Boolean(hero && !hero.folded && hero.inHand && hero.acted && info.toCall > 0 && hero.betStreet === game.currentBet);

  if (info.canCheck) {
    const bluff = Math.random() < def.aggro * 0.14 && s > 0.30;
    if (s > 0.60 || bluff) {
      const want = info.pot * (0.45 + Math.random() * 0.45);
      return clampBet(info, p, want) || { type: 'check' };
    }
    return { type: 'check' };
  }

  const toCall = info.toCall;
  const potOdds = toCall / (info.pot + toCall);
  // raise with monsters
  if (s > 0.82 && Math.random() < 0.35 + def.aggro * 0.5) {
    const maxTo = p.betStreet + p.stack;
    if (maxTo > info.minRaiseTo) {
      const want = info.minRaiseTo + Math.round(info.pot * (0.3 + Math.random() * 0.5));
      return { type: 'raise', amount: Math.min(maxTo, Math.max(info.minRaiseTo, want)) };
    }
    return { type: 'call' }; // can only shove-call
  }
  // bluff raise sometimes
  if (s < 0.35 && Math.random() < def.aggro * 0.06 && toCall < p.stack * 0.15) {
    const maxTo = p.betStreet + p.stack;
    if (maxTo > info.minRaiseTo) {
      return { type: 'raise', amount: Math.min(maxTo, info.minRaiseTo + Math.round(info.pot * 0.5)) };
    }
  }
  // Keep a raised pot alive. If earlier bots have folded to the human's wager,
  // the final two defenders play on instead of creating a string of walkovers.
  // They still use only their cards, public action and normal pot odds.
  if ((heroIsOut || facingHeroRaise) && liveBots <= 2) return { type: 'call' };
  const threshold = potOdds * (heroIsOut ? 0.88 : facingHeroRaise ? 0.82 : 0.98) + (0.5 - def.tight) * 0.07;
  if (s > threshold) return { type: 'call' };
  // Distinct personalities still fold weak hands, but all of them defend
  // affordable raises often enough that betting does not clear the table.
  const defendChance = heroIsOut ? 0.46 + (1 - def.tight) * 0.24 : facingHeroRaise ? 0.44 + (1 - def.tight) * 0.32 : 0.20 + (1 - def.tight) * 0.18;
  if (Math.random() < defendChance && toCall <= p.stack * (heroIsOut ? 0.24 : facingHeroRaise ? 0.22 : 0.12)) return { type: 'call' };
  return { type: 'fold' };
}
