# Nikkiflixs Casino — MASTER BUILD
## Snapshot: 2026-10-09 11:40 MDT (v41 + fixes batch)

This is the complete, self-contained source of the Nikkiflixs casino as it stands.
Another AI can rebuild it exactly from this zip alone.

---

## What's in this zip (284 files, ~88MB)

```
index.html                  — Main entry: theater/casino showroom, lobby, PWA install
radio-index.html            — Radio station entry
manifest.json               — PWA manifest (install to home screen)
sw.js                       — Service worker (cache version: nikkiflixs-v42)
icon-192.png / icon-512.png / apple-touch-icon.png
assets/
  checkmate.png / checkmate-avatar.png    — Checkmate mascot (real picture)
  nikki-avatar.webp / promise-avatar.webp — Host avatars
  nikki-*.mp3 / promise-*.mp3             — Host voice lines
  walkout-stage.webp, stage-scene.jpg     — Walkout visuals
  casino-floor.webp, game-room.webp        — Room backgrounds
  rooms/
    casino/
      index.html            — Casino room (Promise host, machine list)
      sportsbook.html       — Sportsbook: Odds / Schedules / News / Fantasy / Checkmate
      app-store.html        — In-casino app store (6 apps)
      gift-shop.html        — Gift shop (cosmetics — expanding)
      coin-store.html       — Gold coin store
      assets/               — Poker, blackjack, craps, slots, roulette, etc.
    theater/                — Movie theater (Nikki host)
    game-room/              — Game room: poker, dominoes, chess, Yahtzee, etc.
```

## Key features in this build

- **Poker**: 6-player Texas Hold'em vs bots, red oval canon table, dealer/blind badges, tip dealer button, 5% rake (capped 500, lobby notice only)
- **Blackjack**: real cards, tip dealer button, soft card sounds (staticky swoosh removed)
- **Craps**: real tumbling dice, tip dealer button
- **Slots**: classic 3-reel machines (polish pending per Jerry)
- **Sportsbook**: 7 leagues real odds (The Odds API, key in sportsbook.html), full season schedules (ESPN API), news (24h freshness), fantasy hub (start/sit, sleepers, player comparison with 2,556-player index), Checkmate guide that learns from headlines
- **Checkmate**: mascot picture (not emoji) in sportsbook widget, app store, Grim's app; news-learning; install counter hooks (COUNTER_URL placeholder)
- **Throwables**: 20 free + 13 paid
- **Country flags**: ~90 countries + 50 US states, 100 coins
- **PWA**: installable, offline-capable, auto-updating via service worker
- **Hosts**: Nikki (poker/game room/theater), Promise (casino/radio)

## API keys in this build

- **The Odds API** (sportsbook odds): key is in `assets/rooms/casino/sportsbook.html` — Jerry's personal key, do not share publicly
- No other API keys (ESPN is free, no key needed)

## How to deploy

1. Unzip to any static host (Netlify Drop, etc.)
2. No build step, no server needed — pure HTML/CSS/JS
3. Upload the zip to Netlify Drop → instant live site

## Version history (what changed to get here)

- v36: Poker badge/button positions, win-by-fold
- v37: Throwables expansion (20 free, 13 paid)
- v38: Country flag badges
- v39: Sportsbook with real odds
- v40: PWA install
- v41: App store, sportsbook in lobby, schedules/news/fantasy, Checkmate guide
- v41+fixes: Blackjack sound fix, tip buttons, poker rake, Checkmate picture, fantasy expansion (start/sit, sleepers, player compare), Habla 82 languages (separate app)

## Production vs preview

- **Production** (nikkiflixs.com): v16 — DO NOT TOUCH without Jerry's explicit yes + phone tap-test
- **Preview**: this build — Jerry's tap-test environment

## Jerry's standing rules for this codebase

1. Approved = canon. Rejected = purged (deleted, not hidden).
2. "Fix" = rebuild from scratch, never patch.
3. Change ONLY what he asks for, nothing else.
4. Nothing to production without his explicit yes AND phone tap-test.
5. Every game 100% random and fair. Nothing favoring nothing.
6. Humans must NEVER know they're playing bots.
7. Disconnect: game never stops, auto-fold on turn, 3-min seat hold.
8. Zero spend until revenue.
