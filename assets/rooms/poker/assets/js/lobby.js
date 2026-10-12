(() => {
  const $ = id => document.getElementById(id);
  const flow = $('lobbyflow');
  const signin = $('signin');
  const welcome = $('hostwelcome');
  const picker = $('tablepicker');
  const spinWait = $('spinwait');
  const avatarPicker = $('avatarpicker');
  // Player identity is sticky for this browser visit. A future account service can
  // hydrate the same object through NikkiflixPlayerProfile without changing the flow.
  const identity = { avatarID: 0, photoDataUrl: '', name: 'You', authMethod: '', ready: false };
  let editingOnly = false;
  const spinTiers = {
    500: { buyIn: 500, prizes: [1000, 1000, 1000, 1000, 1500, 1500, 3000, 5000] },
    1000: { buyIn: 1000, prizes: [2000, 2000, 2000, 2000, 3000, 3000, 6000, 10000] }
  };
  let selectedSpinTier = 500;
  let spinPlayerCount = 1;
  let selectedTable = { id: 'low', name: 'Low Stakes Cash Game', mode: 'cash', variant: 'holdem', smallBlind: 25, bigBlind: 50, buyIn: 5000, entryFee: 0, prizePool: 0 };

  // Speak Nikki's welcome with the most natural feminine English voice the device offers.
  // Mobile webviews often block autoplay, so the first touch retries the greeting.
  let greetingStarted = false;
  let greetingPending = false;
  const voiceScore = voice => {
    const name = voice.name.toLowerCase();
    let score = /^en-us/i.test(voice.lang) ? 40 : /^en/i.test(voice.lang) ? 15 : 0;
    if (/samantha|ava|aria|jenny|joanna|salli|karen|moira|tessa|victoria|zira|female/.test(name)) score += 80;
    if (/natural|neural|premium|enhanced|google|microsoft/.test(name)) score += 35;
    if (/compact|novelty|whisper|robot/.test(name)) score -= 40;
    if (voice.localService) score += 5;
    return score;
  };
  const speakGreeting = (force = false) => {
    if (!('speechSynthesis' in window) || greetingStarted || (!force && greetingPending)) return;
    greetingPending = true;
    const line = new SpeechSynthesisUtterance("Hi, I'm Nikki. I'm your host for the night.");
    const voices = window.speechSynthesis.getVoices();
    line.voice = [...voices].filter(v => /^en/i.test(v.lang)).sort((a, b) => voiceScore(b) - voiceScore(a))[0] || null;
    line.rate = 0.92;
    line.pitch = 1;
    line.volume = 1;
    line.onstart = () => { greetingStarted = true; greetingPending = false; };
    line.onerror = () => { greetingPending = false; };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(line);
  };
  if (window.speechSynthesis && typeof window.speechSynthesis.addEventListener === 'function') {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      if (!welcome.classList.contains('hidden')) speakGreeting();
    }, { once: true });
  }
  document.addEventListener('pointerdown', () => {
    if (!greetingStarted && !welcome.classList.contains('hidden')) speakGreeting(true);
  }, { once: true, capture: true });

  const showScreen = screen => {
    document.querySelectorAll('#lobbyflow > .lobby-screen').forEach(el => el.classList.toggle('hidden', el !== screen));
  };

  const setAdminPreviewMode = enabled => {
    document.body.classList.toggle('admin-preview-mode', enabled);
    $('admin-preview-badge').classList.toggle('hidden', !enabled);
    document.querySelectorAll('.picker-bank small, .casino-bank small').forEach(label => {
      if (!label.dataset.defaultLabel) label.dataset.defaultLabel = label.textContent;
      label.textContent = enabled ? 'ADMIN PREVIEW · TEST GOLD COINS' : label.dataset.defaultLabel;
    });
  };

  const finishSignIn = method => {
    identity.authMethod = method;
    setAdminPreviewMode(method === 'admin');
    $('player-name').value = identity.name;
    $('signed-in-status').textContent = method === 'admin'
      ? 'Admin Preview · 10,000 test GC'
      : `Email · ${identity.name}`;
    showScreen(welcome);
    welcome.scrollTop = 0;
    window.setTimeout(() => speakGreeting(true), 220);
    $('choose-poker').focus();
  };

  const adminPreviewButton = $('admin-preview');
  const adminEntryWasQueued = Boolean(window.__nikkiflixAdminEntryQueued);
  if (typeof window.__nikkiflixAdminEntryQueueTap === 'function') {
    adminPreviewButton.removeEventListener('pointerup', window.__nikkiflixAdminEntryQueueTap);
    adminPreviewButton.removeEventListener('click', window.__nikkiflixAdminEntryQueueTap);
  }
  let lastAdminEntryAt = -Infinity;
  const enterAdminPreview = event => {
    if (event && event.type === 'click' && performance.now() - lastAdminEntryAt < 800) return;
    lastAdminEntryAt = performance.now();
    const previousName = identity.name || 'You';
    identity.name = 'Admin Preview';
    identity.avatarID = 0;
    $('signin-note').textContent = 'Opening admin preview…';
    adminPreviewButton.setAttribute('aria-busy', 'true');

    // Move to the lobby first so optional preview services can never turn a tap
    // into a silent failure. The balance, leaderboard and photo reset are best-effort.
    finishSignIn('admin');
    try { setPhoto(''); } catch (_) {}
    try {
      if (window.NikkiflixBank && typeof window.NikkiflixBank.set === 'function') window.NikkiflixBank.set(10000);
    } catch (_) {}
    try {
      if (window.NikkiflixLeaderboard && typeof window.NikkiflixLeaderboard.rename === 'function') window.NikkiflixLeaderboard.rename(previousName, identity.name);
    } catch (_) {}
    adminPreviewButton.removeAttribute('aria-busy');
    $('signin-note').textContent = '';
  };
  adminPreviewButton.addEventListener('pointerup', enterAdminPreview);
  adminPreviewButton.addEventListener('click', enterAdminPreview);
  if (adminEntryWasQueued) window.requestAnimationFrame(() => enterAdminPreview());

  $('email-signin-form').addEventListener('submit', event => {
    event.preventDefault();
    const emailInput = $('signin-email');
    const nameInput = $('signin-name');
    const email = emailInput.value.trim();
    const name = nameInput.value.trim().slice(0, 10);
    if (!emailInput.checkValidity()) {
      $('signin-note').textContent = 'Enter a valid email address to continue.';
      emailInput.focus();
      return;
    }
    if (!name) {
      $('signin-note').textContent = 'Enter the name you want shown at the table.';
      nameInput.focus();
      return;
    }
    identity.name = name;
    $('signin-note').textContent = '';
    finishSignIn('email');
  });

  $('sign-out').addEventListener('click', () => {
    identity.authMethod = '';
    identity.ready = false;
    editingOnly = false;
    $('edit-player').classList.add('hidden');
    setAdminPreviewMode(false);
    identity.name = 'You';
    setPhoto('');
    $('player-name').value = 'You';
    $('signin-name').value = '';
    $('signin-email').value = '';
    $('signin-note').textContent = '';
    showScreen(signin);
    signin.scrollTop = 0;
    $('signin-email').focus();
  });

  const tableButtons = [...document.querySelectorAll('[data-table-id]')];

  $('choose-poker').addEventListener('click', () => {
    showScreen(picker);
    if (window.NikkiflixBank && typeof window.NikkiflixBank.set === 'function' && typeof window.NikkiflixBank.get === 'function') window.NikkiflixBank.set(window.NikkiflixBank.get());
    if (tableButtons[0]) tableButtons[0].focus();
  });

  $('picker-back').addEventListener('click', () => {
    showScreen(welcome);
    $('choose-poker').focus();
  });

  const formatCoins = value => Number(value).toLocaleString();
  const renderSpinTier = tier => {
    selectedSpinTier = tier;
    spinPlayerCount = 1;
    $('spin-tier-label').textContent = `${formatCoins(tier)} gold coin buy-in`;
    $('spin-player-name').textContent = identity.name || 'You';
    $('spin-seats-title').textContent = '1 of 3 players';
    $('spinwait-status').textContent = 'Waiting for 2 more players';
  };

  document.querySelectorAll('[data-spin-tier]').forEach(button => button.addEventListener('click', () => {
    renderSpinTier(Number(button.dataset.spinTier));
    showScreen(spinWait);
    spinWait.scrollTop = 0;
    $('spinwait-back').focus();
    window.dispatchEvent(new CustomEvent('nikkiflix:sitngo-waiting-room', {
      detail: { buyIn: selectedSpinTier, seats: 3, rebuysAllowed: false }
    }));
  }));

  $('spinwait-back').addEventListener('click', () => {
    showScreen(picker);
    const selectedSpinButton = document.querySelector(`[data-spin-tier="${selectedSpinTier}"]`);
    if (selectedSpinButton) selectedSpinButton.focus();
  });

  window.NikkiflixSitAndGo = {
    sync({ players = [] } = {}) {
      const safePlayers = Array.isArray(players) ? players.slice(0, 3) : [];
      spinPlayerCount = Math.max(1, safePlayers.length);
      const seats = [...document.querySelectorAll('.spin-seat')];
      seats.forEach((seat, index) => {
        const player = safePlayers[index];
        const name = seat.querySelector('strong');
        const detail = seat.querySelector('small');
        seat.classList.toggle('occupied', Boolean(player) || index === 0);
        seat.classList.toggle('empty', !player && index !== 0);
        if (player) {
          name.textContent = String(player.name || `Player ${index + 1}`).slice(0, 18);
          detail.textContent = 'Ready';
        } else if (index === 0) {
          name.textContent = identity.name || 'You';
          detail.textContent = 'Ready';
        } else {
          name.textContent = 'Open seat';
          detail.textContent = 'Waiting for a player';
        }
      });
      $('spin-seats-title').textContent = `${spinPlayerCount} of 3 players`;
      $('spinwait-status').textContent = spinPlayerCount === 3 ? 'Table full · ready to begin' : `Waiting for ${3 - spinPlayerCount} more ${3 - spinPlayerCount === 1 ? 'player' : 'players'}`;
    },
    reset() { renderSpinTier(selectedSpinTier); }
  };

  const applyIdentityToTable = () => {
    if (typeof window.__setHeroIdentity === 'function') window.__setHeroIdentity({
      avatarId: identity.avatarID,
      photoDataUrl: identity.photoDataUrl,
      name: identity.name
    });
  };

  const enterSelectedTable = () => {
    applyIdentityToTable();
    const configured = typeof window.__configurePokerTable === 'function' ? window.__configurePokerTable(selectedTable) : undefined;
    if (configured === false) return false;
    flow.classList.add('leaving');
    window.setTimeout(() => {
      flow.classList.add('hidden');
      showBonusTrigger();
      $('btn-start').click();
    }, 260);
    return true;
  };

  tableButtons.forEach(button => button.addEventListener('click', () => {
    selectedTable = {
      id: button.dataset.tableId,
      name: (button.querySelector('.table-details strong') && button.querySelector('.table-details strong').textContent) || 'Poker Table',
      mode: button.dataset.mode || 'cash',
      variant: button.dataset.variant || 'holdem',
      bettingLimit: button.dataset.bettingLimit || 'no-limit',
      smallBlind: Number(button.dataset.smallBlind),
      bigBlind: Number(button.dataset.bigBlind),
      buyIn: Number(button.dataset.buyIn),
      entryFee: Number(button.dataset.entryFee || 0),
      prizePool: Number(button.dataset.prizePool || 0),
      playerCount: Number(button.dataset.playerCount || 8) === 6 ? 6 : 8
    };
    if (identity.ready) {
      enterSelectedTable();
      return;
    }
    editingOnly = false;
    $('enter-table').textContent = `Take my seat · ${selectedTable.name}`;
    showScreen(avatarPicker);
    avatarPicker.scrollTop = 0;
    const selectedAvatar = document.querySelector('.avatar-option.selected');
    if (selectedAvatar) selectedAvatar.focus();
  }));

  $('edit-player').addEventListener('click', () => {
    editingOnly = true;
    $('enter-table').textContent = 'Save player';
    showScreen(avatarPicker);
    avatarPicker.scrollTop = 0;
    const selectedAvatar = document.querySelector('.avatar-option.selected');
    if (selectedAvatar) selectedAvatar.focus();
  });

  $('avatar-back').addEventListener('click', () => {
    editingOnly = false;
    showScreen(picker);
    $('edit-player').focus();
  });

  document.querySelectorAll('.avatar-option').forEach(option => {
    option.addEventListener('click', () => {
      identity.avatarID = Number(option.dataset.avatarId);
      setPhoto('');
      document.querySelectorAll('.avatar-option').forEach(candidate => {
        const selected = candidate === option;
        candidate.classList.toggle('selected', selected);
        candidate.setAttribute('aria-pressed', String(selected));
      });
      $('identity-note').textContent = `${option.getAttribute('aria-label')} selected.`;
    });
  });

  const setPhoto = dataUrl => {
    identity.photoDataUrl = dataUrl || '';
    const thumb = $('photo-thumb');
    thumb.classList.toggle('has-photo', Boolean(dataUrl));
    thumb.style.backgroundImage = dataUrl ? `url("${dataUrl}")` : '';
    $('remove-photo').classList.toggle('hidden', !dataUrl);
  };

  $('photo-button').addEventListener('click', () => $('photo-input').click());
  $('photo-input').addEventListener('change', event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      $('identity-note').textContent = 'Please choose an image from your phone.';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      $('identity-note').textContent = 'That photo is over 10 MB. Please choose a smaller one.';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(String(reader.result));
      $('identity-note').textContent = 'Photo ready — it’ll appear at your seat.';
    };
    reader.onerror = () => { $('identity-note').textContent = 'That photo could not be read. Please try another.'; };
    reader.readAsDataURL(file);
  });

  $('remove-photo').addEventListener('click', () => {
    setPhoto('');
    $('photo-input').value = '';
    $('identity-note').textContent = 'Photo removed. Your selected portrait will represent you.';
  });



  $('enter-table').addEventListener('click', () => {
    const previousName = identity.name || 'You';
    identity.name = $('player-name').value.trim().slice(0, 10) || 'You';
    identity.ready = true;
    if (window.NikkiflixLeaderboard && typeof window.NikkiflixLeaderboard.rename === 'function') window.NikkiflixLeaderboard.rename(previousName, identity.name);
    $('edit-player').classList.remove('hidden');
    applyIdentityToTable();
    if (editingOnly) {
      editingOnly = false;
      showScreen(picker);
      $('edit-player').focus();
      return;
    }
    if (!enterSelectedTable()) {
      $('identity-note').textContent = `You need ${selectedTable.entryFee.toLocaleString()} gold coins to enter this tournament.`;
    }
  });

  // Server accounts can supply a saved player here later. Until then this stays
  // deliberately in memory, so returning from a table skips the picker without
  // putting a name or personal photo into browser storage.
  window.NikkiflixPlayerProfile = {
    hydrate(profile = {}) {
      identity.avatarID = Math.max(0, Math.min(15, Number(profile.avatarId) || 0));
      identity.name = String(profile.name || 'You').trim().slice(0, 10) || 'You';
      identity.authMethod = String(profile.authMethod || identity.authMethod || 'account');
      identity.ready = true;
      setPhoto(String(profile.photoDataUrl || ''));
      $('player-name').value = identity.name;
      document.querySelectorAll('.avatar-option').forEach(option => {
        const selected = Number(option.dataset.avatarId) === identity.avatarID;
        option.classList.toggle('selected', selected);
        option.setAttribute('aria-pressed', String(selected));
      });
      $('edit-player').classList.remove('hidden');
      applyIdentityToTable();
    },
    current() {
      return { avatarId: identity.avatarID, name: identity.name, authMethod: identity.authMethod, ready: identity.ready };
    }
  };

  window.addEventListener('nikkiflix:leave-poker', () => {
    flow.classList.remove('hidden', 'leaving');
    showBonusTrigger();
    showScreen(picker);
    if (window.NikkiflixBank && typeof window.NikkiflixBank.set === 'function' && typeof window.NikkiflixBank.get === 'function') window.NikkiflixBank.set(window.NikkiflixBank.get());
    window.setTimeout(() => {
      const selectedTableButton = document.querySelector(`[data-table-id="${selectedTable.id}"]`);
      if (selectedTableButton) selectedTableButton.focus();
    }, 30);
  });

  // Individual bonus wheel. This static preview keeps the claim for this visit only.
  const bonusPrizes = [25, 50, 100, 250, 500, 2000];
  let dailyBonusClaimed = false;
  let bonusSpinCount = 0;
  let bonusSpinning = false;
  const bonusTrigger = $('daily-bonus-trigger');
  const bonusOverlay = $('daily-bonus-overlay');
  const bonusWheel = $('daily-prize-wheel');
  const bonusSpin = $('daily-bonus-spin');
  const bonusStatus = $('daily-bonus-status');
  const showBonusTrigger = () => {
    const tableIsOpen = flow.classList.contains('hidden');
    bonusTrigger.classList.toggle('hidden', !tableIsOpen);
    bonusTrigger.classList.toggle('claimed', dailyBonusClaimed);
    bonusTrigger.querySelector('strong').textContent = dailyBonusClaimed ? '$1 SPIN' : 'FREE SPIN';
    bonusTrigger.setAttribute('aria-label', dailyBonusClaimed ? 'Bonus wheel, next spin $1' : 'Daily bonus, free spin available');
  };
  const showPaymentToast = () => {
    const toast = $('toast');
    toast.textContent = 'Payments aren’t connected yet.';
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 2600);
  };
  const updateSpinOffer = () => {
    if (bonusSpinCount === 0) {
      bonusSpin.textContent = 'Spin the wheel';
      bonusSpin.dataset.price = 'free';
    } else {
      const price = bonusSpinCount === 1 ? '$1' : '$3.99';
      bonusSpin.textContent = `Another spin ${price}`;
      bonusSpin.dataset.price = price;
    }
  };
  bonusTrigger.addEventListener('click', () => {
    bonusOverlay.classList.remove('hidden');
    bonusSpin.focus();
  });
  $('daily-bonus-close').addEventListener('click', () => {
    bonusOverlay.classList.add('hidden');
    bonusTrigger.focus();
  });
  bonusOverlay.addEventListener('click', event => {
    if (event.target === bonusOverlay) bonusOverlay.classList.add('hidden');
  });
  bonusSpin.addEventListener('click', () => {
    if (bonusSpinning) return;
    if (bonusSpinCount > 0) {
      window.dispatchEvent(new CustomEvent('nikkiflix:purchase-spin', { detail: { price: bonusSpinCount === 1 ? 1 : 3.99 } }));
      showPaymentToast();
      return;
    }
    bonusSpinning = true;
    bonusSpin.disabled = true;
    const prizeIndex = Math.floor(Math.random() * bonusPrizes.length);
    const prize = bonusPrizes[prizeIndex];
    bonusWheel.classList.remove('spinning');
    bonusWheel.style.setProperty('--landing-turn', `${1440 - prizeIndex * 60 - 30}deg`);
    void bonusWheel.offsetWidth;
    bonusWheel.classList.add('spinning');
    bonusStatus.textContent = 'Spinning…';
    window.setTimeout(() => {
      window.NikkiflixBank?.credit?.(prize);
      bonusSpinCount = 1;
      dailyBonusClaimed = true;
      bonusSpinning = false;
      bonusSpin.disabled = false;
      bonusStatus.textContent = `You won ${formatCoins(prize)} gold coins`;
      bonusWheel.querySelector('.daily-wheel-hub').textContent = formatCoins(prize);
      updateSpinOffer();
      showBonusTrigger();
    }, 2850);
  });
  updateSpinOffer();
  showBonusTrigger();

})();
