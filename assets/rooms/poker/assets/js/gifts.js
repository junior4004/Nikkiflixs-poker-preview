(() => {
  const $ = id => document.getElementById(id);
  if (typeof table === 'undefined' || typeof game === 'undefined') return;

  const COUNTRY_CODES = [
    'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ','BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM','HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','YE','YT','ZA','ZM','ZW'
  ];
  const displayNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
  const flagFor = code => code.replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)));
  const countries = COUNTRY_CODES.map(code => ({ code, name: displayNames ? displayNames.of(code) : code, glyph: flagFor(code) })).sort((a, b) => a.name.localeCompare(b.name));
  const personalItems = [
    { id: 'beer', name: 'Beer', glyph: '🍺' },
    { id: 'cigarette', name: 'Cigarette', glyph: '🚬' },
    { id: 'cigar', name: 'Cigar', glyph: '▰' },
    { id: 'soda', name: 'Soda', glyph: '🥤' },
    { id: 'horseshoe', name: 'Horseshoe', glyph: 'Ω' },
    { id: 'clover', name: 'Lucky clover', glyph: '🍀' },
    { id: 'dice', name: 'Lucky dice', glyph: '🎲' },
    { id: 'star', name: 'Lucky star', glyph: '★' }
  ];
  const gifts = [
    ['rose','Rose','🌹',4000],['heart','Heart','♥',3000],['champagne','Champagne','🍾',7000],['teddy','Teddy bear','🧸',5000],
    ['diamond','Diamond','💎',10000],['crown','Gold crown','👑',8000],['cake','Cake','🎂',4500],['present','Present','🎁',4500],
    ['clover','Lucky clover','🍀',2500],['star','Gold star','★',2000],['trophy','Trophy','🏆',7000],['medal','Gold medal','🥇',6000],
    ['flowers','Flowers','💐',6000],['chocolate','Chocolate','🍫',3000],['coffee','Coffee','☕',2000],['cocktail','Cocktail','🍸',4000],
    ['pizza','Pizza','🍕',3000],['shades','Sunglasses','🕶',2500],['watch','Gold watch','⌚',8000],['car','Sports car','🏎',10000],
    ['yacht','Yacht','⛵',10000],['ring','Diamond ring','💍',9000],['music','Music','♫',2000],['fireworks','Fireworks','🎆',5000]
  ].map(([id,name,glyph,price]) => ({ id,name,glyph,price }));

  table.seats.forEach(seat => {
    seat.personalFlag = null;
    seat.personalItem = null;
    seat.gifts = [];
  });
  table.clearSeatItems = function() {
    this.seats.forEach(seat => {
      seat.personalFlag = null;
      seat.personalItem = null;
      seat.gifts = [];
    });
  };
  table.setPersonalFlag = function(seatIndex, item) {
    if (this.seats[seatIndex]) this.seats[seatIndex].personalFlag = item || null;
  };
  table.setPersonalItem = function(seatIndex, item) {
    if (this.seats[seatIndex]) this.seats[seatIndex].personalItem = item || null;
  };
  table.addSeatGift = function(seatIndex, gift) {
    if (!this.seats[seatIndex]) return;
    this.seats[seatIndex].gifts ||= [];
    this.seats[seatIndex].gifts.push({ ...gift });
  };

  const originalSeatDraw = table._seat;
  table._seat = function(c, seat, index) {
    originalSeatDraw.call(this, c, seat, index);
    const items = [];
    if (seat.personalFlag) items.push({ ...seat.personalFlag, kind: 'personal' });
    if (seat.personalItem) items.push({ ...seat.personalItem, kind: 'personal' });
    (seat.gifts || []).forEach(gift => items.push({ ...gift, kind: 'gift' }));
    if (!items.length) return;
    const anchor = this._xy(index);
    const side = anchor.x < 500 ? -1 : 1;
    const visible = items.slice(0, 5);
    if (items.length > 5) visible[4] = { glyph: `+${items.length - 4}`, name: `${items.length - 4} more gifts`, kind: 'more' };
    c.save();
    visible.forEach((item, itemIndex) => {
      const column = Math.floor(itemIndex / 2);
      const row = itemIndex % 2;
      const x = anchor.x + side * (72 + column * 33);
      const y = anchor.y + (row ? 18 : -18);
      this._round(c, x - 14, y - 14, 28, 28, 8);
      c.fillStyle = item.kind === 'gift' ? 'rgba(74,36,25,.98)' : 'rgba(11,12,13,.96)';
      c.fill();
      c.strokeStyle = item.kind === 'gift' ? '#f4c95f' : '#e1b75c';
      c.lineWidth = item.kind === 'gift' ? 2 : 1.3;
      c.stroke();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = item.id === 'heart' ? '#ff536d' : '#fff3c4';
      const compactText = item.glyph.length > 4 || item.kind === 'more';
      c.font = compactText ? '900 9px "Avenir Next",sans-serif' : '20px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      c.fillText(item.glyph, x, y + 1, 23);
    });
    c.restore();
  };

  const originalConfigure = window.__configurePokerTable;
  window.__configurePokerTable = config => {
    table.clearSeatItems();
    return originalConfigure(config);
  };
  window.addEventListener('nikkiflix:leave-poker', () => {
    table.clearSeatItems();
    closeAll();
  });

  const countryGrid = $('country-grid');
  const personalGrid = $('personal-item-grid');
  const giftCatalog = $('gift-catalog');
  let selectedCountry = null;
  let selectedPersonal = null;
  let selectedGift = null;
  let selectedGiftSeat = 1;
  let giftTargetMode = 'one';

  function renderCountries(query = '') {
    const normalized = query.trim().toLowerCase();
    const list = normalized ? countries.filter(country => country.name.toLowerCase().includes(normalized) || country.code.toLowerCase().includes(normalized)) : countries;
    const fragment = document.createDocumentFragment();
    list.forEach(country => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.code = country.code;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(selectedCountry?.code === country.code));
      button.classList.toggle('selected', selectedCountry?.code === country.code);
      const flag = document.createElement('b');
      flag.textContent = country.glyph;
      const name = document.createElement('span');
      name.textContent = country.name;
      button.append(flag, name);
      button.addEventListener('click', () => {
        selectedCountry = country;
        table.setPersonalFlag(HERO, country);
        $('selected-country-label').textContent = country.name;
        renderCountries($('country-search').value);
      });
      fragment.appendChild(button);
    });
    countryGrid.replaceChildren(fragment);
  }

  personalItems.forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.personalItem = item.id;
    button.innerHTML = `<b aria-hidden="true">${item.glyph}</b><span>${item.name}</span>`;
    button.addEventListener('click', () => {
      selectedPersonal = item;
      table.setPersonalItem(HERO, item);
      $('selected-personal-label').textContent = item.name;
      personalGrid.querySelectorAll('button').forEach(candidate => candidate.classList.toggle('selected', candidate === button));
    });
    personalGrid.appendChild(button);
  });

  gifts.forEach(gift => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.gift = gift.id;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.innerHTML = `<span class="gift-glyph" aria-hidden="true">${gift.glyph}</span><strong>${gift.name}</strong><small>${gift.price.toLocaleString()} GC</small>`;
    button.addEventListener('click', () => {
      selectedGift = gift;
      giftCatalog.querySelectorAll('button').forEach(candidate => {
        const isSelected = candidate === button;
        candidate.classList.toggle('selected', isSelected);
        candidate.setAttribute('aria-selected', String(isSelected));
      });
      refreshGiftCheckout();
    });
    giftCatalog.appendChild(button);
  });

  function activeRecipientSeats() {
    const seats = [];
    for (let i = 0; i < table.activeSeatCount; i++) if (i !== HERO && game.players[i]) seats.push(i);
    return seats;
  }
  function currentBalance() {
    return Math.max(0, Number(window.NikkiflixBank?.get?.()) || 0);
  }
  function giftRecipients() {
    return giftTargetMode === 'table' ? activeRecipientSeats() : [selectedGiftSeat];
  }
  function refreshGiftCheckout() {
    const target = game.players[selectedGiftSeat];
    const recipients = giftRecipients();
    const total = selectedGift ? selectedGift.price * recipients.length : 0;
    const balance = currentBalance();
    $('gift-balance').textContent = balance.toLocaleString();
    $('gift-target-copy').textContent = giftTargetMode === 'table' ? `Send to all ${recipients.length} other players · price applies to each seat` : `Send to ${target?.name || 'this player'}`;
    $('gift-total').textContent = selectedGift ? `${total.toLocaleString()} GC` : 'Choose a gift';
    $('gift-send').disabled = !selectedGift;
    $('gift-send').textContent = !selectedGift ? 'Select a gift' : balance >= total ? `Send ${selectedGift.name}` : 'Not enough gold coins';
    const short = selectedGift && balance < total;
    $('gift-purchase').classList.toggle('hidden', !short);
    $('gift-shop-status').textContent = short ? `You need ${(total - balance).toLocaleString()} more gold coins. Purchase packs become available when Stripe launches with online play.` : '';
  }
  function openPersonalItems() {
    $('player-stats').classList.add('hidden');
    $('personal-items-overlay').classList.remove('hidden');
    $('country-search').value = '';
    renderCountries();
    window.setTimeout(() => $('country-search').focus(), 30);
  }
  function openGiftShop(seat) {
    selectedGiftSeat = Number.isInteger(seat) && seat !== HERO ? seat : activeRecipientSeats()[0];
    giftTargetMode = 'one';
    selectedGift = null;
    giftCatalog.querySelectorAll('button').forEach(button => { button.classList.remove('selected'); button.setAttribute('aria-selected', 'false'); });
    $('gift-target-one').classList.add('selected');
    $('gift-target-table').classList.remove('selected');
    $('player-stats').classList.add('hidden');
    $('gift-shop-overlay').classList.remove('hidden');
    refreshGiftCheckout();
  }
  function closeAll() {
    $('personal-items-overlay').classList.add('hidden');
    $('gift-shop-overlay').classList.add('hidden');
    $('coin-purchase-overlay').classList.add('hidden');
  }
  function syncCashBalanceAfterPurchase() {
    if (typeof currentTable !== 'undefined' && currentTable.mode === 'cash') {
      game.players[HERO].stack = currentBalance();
      table.setStack(HERO, game.players[HERO].stack);
      if (typeof updateHUD === 'function') updateHUD();
    }
  }

  $('stats-personal').addEventListener('click', openPersonalItems);
  $('stats-gift').addEventListener('click', () => openGiftShop(Number($('player-stats').dataset.seat)));
  $('country-search').addEventListener('input', event => renderCountries(event.target.value));
  $('clear-country').addEventListener('click', () => {
    selectedCountry = null;
    table.setPersonalFlag(HERO, null);
    $('selected-country-label').textContent = 'No flag selected';
    renderCountries($('country-search').value);
  });
  $('clear-personal-item').addEventListener('click', () => {
    selectedPersonal = null;
    table.setPersonalItem(HERO, null);
    $('selected-personal-label').textContent = 'No item selected';
    personalGrid.querySelectorAll('button').forEach(button => button.classList.remove('selected'));
  });
  $('gift-target-one').addEventListener('click', () => {
    giftTargetMode = 'one';
    $('gift-target-one').classList.add('selected');
    $('gift-target-table').classList.remove('selected');
    refreshGiftCheckout();
  });
  $('gift-target-table').addEventListener('click', () => {
    giftTargetMode = 'table';
    $('gift-target-one').classList.remove('selected');
    $('gift-target-table').classList.add('selected');
    refreshGiftCheckout();
  });
  $('gift-send').addEventListener('click', () => {
    if (!selectedGift) return;
    const recipients = giftRecipients();
    const total = selectedGift.price * recipients.length;
    if (currentBalance() < total) {
      $('gift-shop-overlay').classList.add('hidden');
      $('coin-purchase-overlay').classList.remove('hidden');
      return;
    }
    if (!window.NikkiflixBank?.debit?.(total)) {
      refreshGiftCheckout();
      return;
    }
    recipients.forEach(seat => table.addSeatGift(seat, selectedGift));
    syncCashBalanceAfterPurchase();
    const recipientLabel = giftTargetMode === 'table' ? 'the whole table' : game.players[selectedGiftSeat].name;
    if (typeof chat === 'function') chat(null, `You sent ${selectedGift.name} to ${recipientLabel} for ${total.toLocaleString()} gold coins.`, true);
    if (typeof toast === 'function') toast(`${selectedGift.name} sent to ${recipientLabel}`);
    $('gift-shop-overlay').classList.add('hidden');
  });
  $('gift-purchase').addEventListener('click', () => {
    $('gift-shop-overlay').classList.add('hidden');
    $('coin-purchase-overlay').classList.remove('hidden');
  });
  $('coin-purchase-back').addEventListener('click', () => {
    $('coin-purchase-overlay').classList.add('hidden');
    $('gift-shop-overlay').classList.remove('hidden');
    refreshGiftCheckout();
  });
  $('personal-items-close').addEventListener('click', () => $('personal-items-overlay').classList.add('hidden'));
  $('gift-shop-close').addEventListener('click', () => $('gift-shop-overlay').classList.add('hidden'));
  $('coin-purchase-close').addEventListener('click', () => $('coin-purchase-overlay').classList.add('hidden'));
  ['personal-items-overlay','gift-shop-overlay','coin-purchase-overlay'].forEach(id => $(id).addEventListener('click', event => {
    if (event.target === $(id)) $(id).classList.add('hidden');
  }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeAll(); });

  renderCountries();
  refreshGiftCheckout();
})();
