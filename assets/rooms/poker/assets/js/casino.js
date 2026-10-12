(() => {
  const $ = id => document.getElementById(id);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const formatChips = amount => Number(amount).toLocaleString(undefined, { maximumFractionDigits: 1 });

  let balance = 10000;
  const bank = {
    get() { return balance; },
    set(amount) {
      balance = Math.max(0, Math.round(Number(amount) * 2) / 2);
      if (!window.__pokerUsesSeparateStack && window.__game?.players?.[0]) window.__game.players[0].stack = balance;
      if (!window.__pokerUsesSeparateStack) window.__table?.setStack?.(0, balance);
      document.querySelectorAll('[data-bankroll]').forEach(el => { el.textContent = formatChips(balance); });
      const heroStack = $('herostack');
      if (heroStack) heroStack.textContent = formatChips(balance);
      window.dispatchEvent(new CustomEvent('nikkiflix:bankroll', { detail: { balance } }));
      return balance;
    },
    debit(amount) {
      if (amount > balance) return false;
      this.set(balance - amount);
      return true;
    },
    credit(amount) { this.set(balance + amount); }
  };
  window.NikkiflixBank = bank;
  // Poker remains authoritative while a table is running; mirror its hero stack
  // so the same in-memory balance is waiting if casino navigation is added later.
  window.setInterval(() => {
    const pokerStack = window.__game?.players?.[0]?.stack;
    if (!window.__pokerUsesSeparateStack && $('lobbyflow')?.classList.contains('hidden') && Number.isFinite(pokerStack) && pokerStack !== balance) {
      balance = pokerStack;
    }
  }, 500);

  const screens = ['hostwelcome', 'tablepicker', 'avatarpicker', 'casinofloor', 'slotgame', 'blackjackgame'];
  const show = id => {
    screens.forEach(screenId => $(screenId)?.classList.toggle('hidden', screenId !== id));
    $(id)?.scrollTo?.(0, 0);
    bank.set(bank.get());
  };

  $('choose-casino').addEventListener('click', () => { show('casinofloor'); $('open-slots').focus(); });
  $('casino-back').addEventListener('click', () => { show('hostwelcome'); $('choose-casino').focus(); });
  $('open-slots').addEventListener('click', () => { show('slotgame'); $('slot-spin').focus(); });
  $('slots-back').addEventListener('click', () => { show('casinofloor'); $('open-slots').focus(); });
  $('open-blackjack').addEventListener('click', () => { show('blackjackgame'); $('blackjack-deal').focus(); });
  $('blackjack-back').addEventListener('click', () => { show('casinofloor'); $('open-blackjack').focus(); });
  document.querySelectorAll('.poker-lobby-button').forEach(button => button.addEventListener('click', () => {
    show('tablepicker');
    document.querySelector('[data-table-id]')?.focus();
  }));
  $('enter-table').addEventListener('click', () => bank.set(balance));

  // ----- classic three-reel slots -----
  const symbols = ['7', '★', 'BAR', '♣', '♦', 'CHERRY'];
  const symbolLabels = { '7': 'Seven', '★': 'Star', BAR: 'Bar', '♣': 'Club', '♦': 'Diamond', CHERRY: 'Cherries' };
  const symbolMarkup = symbol => {
    const art = {
      '7': '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="symbol-seven" d="M15 15H87L82 31 47 88H20L58 36H15Z"/><path fill="#ff8290" d="M24 21h48l-5 7H24z" opacity=".72"/></svg>',
      '★': '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="symbol-star" d="M50 7 61 36 92 38 68 58 76 89 50 72 24 89 32 58 8 38 39 36Z"/><path fill="#fff2a6" d="m50 18 7 20-9 9-8-9z" opacity=".72"/></svg>',
      BAR: '<svg viewBox="0 0 100 100" aria-hidden="true"><rect class="symbol-bar-edge" x="9" y="25" width="82" height="50" rx="8"/><rect class="symbol-bar-main" x="13" y="31" width="74" height="38" rx="5"/><text class="symbol-bar-text" x="50" y="58" text-anchor="middle">BAR</text></svg>',
      '♣': '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="symbol-club" d="M49 12c-13 0-20 10-18 22-13-4-25 5-25 19 0 15 14 24 29 17-2 10-7 16-16 20h62c-9-4-14-10-16-20 15 7 29-2 29-17 0-14-12-23-25-19 2-12-7-22-20-22Z"/></svg>',
      '♦': '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="symbol-diamond" d="M50 7 88 50 50 93 12 50Z"/><path fill="#ff8c9b" d="M50 18 73 49 50 39 27 49Z" opacity=".72"/></svg>',
      CHERRY: '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="cherry-stem" d="M35 61C37 31 52 25 65 18M67 18C61 35 65 49 74 58"/><path class="cherry-leaf" d="M63 20C69 6 87 8 91 16 81 24 70 25 63 20Z"/><circle class="cherry-fruit" cx="31" cy="68" r="20"/><circle class="cherry-fruit" cx="72" cy="68" r="20"/><circle class="cherry-shine" cx="24" cy="60" r="6"/><circle class="cherry-shine" cx="65" cy="60" r="6"/></svg>'
    };
    return `<span class="reel-symbol" data-symbol="${symbol}">${art[symbol]}</span>`;
  };
  const paintReel = (reel, symbol) => {
    reel.innerHTML = symbolMarkup(symbol);
    reel.setAttribute('aria-label', symbolLabels[symbol]);
  };
  let slotBet = 10;
  let spinning = false;
  const reels = [...document.querySelectorAll('.slot-reel')];
  [['7', '★', 'BAR']].flat().forEach((symbol, index) => paintReel(reels[index], symbol));
  const randomSymbol = () => symbols[crypto.getRandomValues(new Uint32Array(1))[0] % symbols.length];
  const setSlotBet = next => {
    const choices = [10, 25, 50, 100];
    const affordable = choices.filter(value => value <= Math.max(10, balance));
    slotBet = affordable.reduce((best, value) => Math.abs(value - next) < Math.abs(best - next) ? value : best, affordable[0] || 10);
    $('slot-bet').textContent = formatChips(slotBet);
  };
  $('slot-bet-down').addEventListener('click', () => {
    const choices = [10, 25, 50, 100];
    setSlotBet(choices[Math.max(0, choices.indexOf(slotBet) - 1)]);
  });
  $('slot-bet-up').addEventListener('click', () => {
    const choices = [10, 25, 50, 100];
    setSlotBet(choices[Math.min(choices.length - 1, choices.indexOf(slotBet) + 1)]);
  });
  $('slot-spin').addEventListener('click', async () => {
    if (spinning) return;
    if (!bank.debit(slotBet)) {
      $('slot-message').textContent = `You need ${formatChips(slotBet)} gold coins for that spin.`;
      return;
    }
    spinning = true;
    $('slot-spin').disabled = true;
    $('slot-reels').classList.remove('win');
    $('slot-message').textContent = 'Reels spinning…';
    reels.forEach(reel => reel.classList.add('spinning'));
    const timers = reels.map(reel => setInterval(() => paintReel(reel, randomSymbol()), 75));
    const result = [randomSymbol(), randomSymbol(), randomSymbol()];
    for (let i = 0; i < reels.length; i++) {
      await pause(430 + i * 210);
      clearInterval(timers[i]);
      reels[i].classList.remove('spinning');
      paintReel(reels[i], result[i]);
    }
    const counts = result.reduce((map, item) => ((map[item] = (map[item] || 0) + 1), map), {});
    const maxSame = Math.max(...Object.values(counts));
    let multiplier = 0;
    if (maxSame === 3) multiplier = result[0] === '7' ? 20 : result[0] === '★' ? 10 : result[0] === 'BAR' ? 6 : 4;
    else if (maxSame === 2) multiplier = 2;
    if (multiplier) {
      const payout = slotBet * multiplier;
      bank.credit(payout);
      $('slot-reels').classList.add('win');
      $('slot-message').textContent = `Winner! ${formatChips(payout)} gold coins · ${multiplier}× pay`;
    } else {
      $('slot-message').textContent = 'No match. Try another spin.';
    }
    spinning = false;
    $('slot-spin').disabled = false;
  });

  // ----- single-player blackjack -----
  const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const suits = ['♠','♥','♦','♣'];
  let deck = [], player = [], dealer = [], bjBet = 25, wager = 25, roundActive = false, holeHidden = true;
  const makeDeck = () => suits.flatMap(suit => ranks.map(rank => ({ rank, suit })));
  const shuffle = cards => {
    const values = new Uint32Array(cards.length);
    crypto.getRandomValues(values);
    for (let i = cards.length - 1; i > 0; i--) {
      const j = values[i] % (i + 1);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  };
  const score = hand => {
    let total = 0, aces = 0;
    hand.forEach(card => {
      if (card.rank === 'A') { total += 11; aces++; }
      else total += ['J','Q','K'].includes(card.rank) ? 10 : Number(card.rank);
    });
    while (total > 21 && aces) { total -= 10; aces--; }
    return total;
  };
  const isBlackjack = hand => hand.length === 2 && score(hand) === 21;
  const cardNode = (card, hidden = false) => {
    const el = document.createElement('span');
    el.className = `playing-card${hidden ? ' card-back' : ['♥','♦'].includes(card.suit) ? ' red' : ''}`;
    el.textContent = hidden ? '' : `${card.rank}${card.suit}`;
    el.setAttribute('aria-label', hidden ? 'Face-down card' : `${card.rank} of ${card.suit}`);
    return el;
  };
  const renderHands = () => {
    const dealerEl = $('dealer-hand'), playerEl = $('player-hand');
    dealerEl.replaceChildren(...dealer.map((card, index) => cardNode(card, holeHidden && index === 1)));
    playerEl.replaceChildren(...player.map(card => cardNode(card)));
    $('player-score').textContent = player.length ? score(player) : '';
    $('dealer-score').textContent = dealer.length ? (holeHidden ? score([dealer[0]]) : score(dealer)) : '';
  };
  const draw = () => {
    if (deck.length < 15) deck = shuffle(makeDeck());
    return deck.pop();
  };
  const setBlackjackMessage = text => { $('blackjack-message').textContent = text; };
  const setActions = active => {
    $('blackjack-actions').classList.toggle('hidden', !active);
    $('blackjack-betting').classList.toggle('hidden', active);
    roundActive = active;
  };
  const finishRound = async result => {
    holeHidden = false;
    renderHands();
    if (result === 'blackjack') {
      const payout = wager * 2.5;
      bank.credit(payout);
      setBlackjackMessage(`Blackjack! You win ${formatChips(wager * 1.5)}.`);
    } else if (result === 'win') {
      bank.credit(wager * 2);
      setBlackjackMessage(`You win ${formatChips(wager)} gold coins.`);
    } else if (result === 'push') {
      bank.credit(wager);
      setBlackjackMessage('Push. Your bet is returned.');
    } else {
      setBlackjackMessage(result === 'bust' ? 'Bust. Dealer wins.' : 'Dealer wins.');
    }
    await pause(500);
    setActions(false);
    $('blackjack-deal').textContent = `DEAL · ${formatChips(bjBet)}`;
  };
  const dealerPlay = async () => {
    holeHidden = false;
    renderHands();
    await pause(400);
    while (score(dealer) < 17) {
      dealer.push(draw());
      renderHands();
      await pause(440);
    }
    const dealerTotal = score(dealer), playerTotal = score(player);
    if (dealerTotal > 21 || playerTotal > dealerTotal) await finishRound('win');
    else if (playerTotal === dealerTotal) await finishRound('push');
    else await finishRound('lose');
  };
  document.querySelectorAll('[data-bj-bet]').forEach(button => button.addEventListener('click', () => {
    if (roundActive) return;
    bjBet = Number(button.dataset.bjBet);
    document.querySelectorAll('[data-bj-bet]').forEach(item => item.classList.toggle('selected', item === button));
    $('blackjack-deal').textContent = `DEAL · ${formatChips(bjBet)}`;
  }));
  $('blackjack-deal').addEventListener('click', async () => {
    if (roundActive) return;
    if (!bank.debit(bjBet)) { setBlackjackMessage(`You need ${formatChips(bjBet)} gold coins for that bet.`); return; }
    wager = bjBet;
    if (deck.length < 15) deck = shuffle(makeDeck());
    player = [draw(), draw()]; dealer = [draw(), draw()]; holeHidden = true;
    renderHands();
    setActions(true);
    setBlackjackMessage('Your move.');
    await pause(350);
    if (isBlackjack(player) || isBlackjack(dealer)) {
      holeHidden = false; renderHands();
      if (isBlackjack(player) && isBlackjack(dealer)) await finishRound('push');
      else if (isBlackjack(player)) await finishRound('blackjack');
      else await finishRound('lose');
    }
  });
  $('blackjack-hit').addEventListener('click', async () => {
    if (!roundActive) return;
    player.push(draw()); renderHands();
    if (score(player) > 21) await finishRound('bust');
    else if (score(player) === 21) await dealerPlay();
  });
  $('blackjack-stand').addEventListener('click', () => { if (roundActive) dealerPlay(); });
  $('blackjack-double').addEventListener('click', async () => {
    if (!roundActive || player.length !== 2) return;
    if (!bank.debit(wager)) { setBlackjackMessage('Not enough gold coins to double.'); return; }
    wager *= 2;
    player.push(draw()); renderHands();
    $('blackjack-actions').classList.add('hidden');
    if (score(player) > 21) await finishRound('bust');
    else await dealerPlay();
  });

  bank.set(10000);
})();
