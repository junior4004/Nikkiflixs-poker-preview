// Nikkiflix Poker — local game client (single player vs bots).
// Drives the 3D table from the authoritative engine in src/game.js.
// Multiplayer (server + voice) will replace the bot driver, same table.
import { PokerTable3D } from './table3d.js';
import { PokerGame } from './game.js';
import { BOT_DEFS, decideBot, botLine } from './bots.js';
import { rankOf, suitOf, evaluate7, CATEGORY } from './cards.js';

const HERO = 0;
const $ = id => document.getElementById(id);
const delay = ms => new Promise(r => setTimeout(r, ms));
const toRS = cards => cards.map(c => [rankOf(c), suitOf(c)]);
const dummyCards = () => [[(Math.random() * 13) | 0, (Math.random() * 4) | 0],
                          [(Math.random() * 13) | 0, (Math.random() * 4) | 0]];

const table = new PokerTable3D($('stage'));
const game = new PokerGame({ smallBlind: 25, bigBlind: 50 });
window.__table = table; window.__game = game; window.__heroTurn = false;
let currentTable = { id: 'low', name: 'Low Stakes Cash Game', mode: 'cash', variant: 'holdem', smallBlind: 25, bigBlind: 50, buyIn: 5000, entryFee: 0, prizePool: 0 };
let tableSession = 0;
let tableActive = false;
let cancelHeroTurn = null;
let cancelBrokeWait = null;
let startingStacks = [];
let resultRecorded = false;
let tournamentFinished = false;
let heroSittingOut = false;
let selectedThrow = null;
let throwPickerTarget = HERO;
let heroAudioContext = null;
let soundEnabled = true;
let audioMaster = null;
let ambientSource = null;
let audioUnlocked = false;
const initAudio = () => {
  if (!soundEnabled) return null;
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    heroAudioContext ||= new C();
    if (heroAudioContext.state === 'suspended') heroAudioContext.resume().catch(()=>{});
    if (!audioMaster) {
      audioMaster = heroAudioContext.createGain();
      audioMaster.gain.value = .72;
      audioMaster.connect(heroAudioContext.destination);
    }
    return heroAudioContext;
  } catch (_) { return null; }
};
const unlockAudio = () => {
  if (audioUnlocked || !soundEnabled) return;
  const ctx=initAudio();if(!ctx)return;
  const finish=()=>{
    if(audioUnlocked)return;
    audioUnlocked=true;
    const source=ctx.createBufferSource();
    source.buffer=ctx.createBuffer(1,1,ctx.sampleRate);
    source.connect(audioMaster);source.start(0);
  };
  if(ctx.state==='running')finish();else ctx.resume().then(finish).catch(()=>{});
};
document.addEventListener('pointerdown',unlockAudio,{capture:true,passive:true});
document.addEventListener('touchend',unlockAudio,{capture:true,passive:true});
document.addEventListener('keydown',unlockAudio,{capture:true});
const tone = (frequency, duration=.12, volume=.05, type='sine', delaySeconds=0) => {
  const ctx=initAudio(); if(!ctx||!audioMaster)return;
  const start=ctx.currentTime+delaySeconds,o=ctx.createOscillator(),g=ctx.createGain();
  o.type=type;o.frequency.setValueAtTime(frequency,start);g.gain.setValueAtTime(.001,start);g.gain.exponentialRampToValueAtTime(volume,start+.012);g.gain.exponentialRampToValueAtTime(.001,start+duration);o.connect(g).connect(audioMaster);o.start(start);o.stop(start+duration+.02);
};
const noiseBurst = (duration=.2, volume=.025, filterFreq=2400, delaySeconds=0) => {
  const ctx=initAudio(); if(!ctx||!audioMaster)return;
  const length=Math.max(1,Math.floor(ctx.sampleRate*duration)),buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length);
  const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),start=ctx.currentTime+delaySeconds;
  src.buffer=buffer;filter.type='bandpass';filter.frequency.value=filterFreq;filter.Q.value=.7;gain.gain.value=volume;src.connect(filter).connect(gain).connect(audioMaster);src.start(start);
};
const sfxShuffle=()=>{noiseBurst(.48,.05,1850);noiseBurst(.34,.035,2900,.14);};
const sfxDeal=()=>noiseBurst(.07,.035,3250);
const sfxChips=()=>{tone(1120,.055,.045,'triangle');tone(1460,.06,.04,'triangle',.055);tone(910,.08,.035,'triangle',.11);};
const sfxWin=()=>{tone(523,.18,.055,'triangle');tone(659,.18,.055,'triangle',.14);tone(784,.28,.06,'triangle',.28);};
const startAmbience=()=>{
  const ctx=initAudio();if(!ctx||ambientSource||!audioMaster)return;
  const length=ctx.sampleRate*3,buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);let smooth=0;
  for(let i=0;i<length;i++){smooth=smooth*.97+(Math.random()*2-1)*.03;data[i]=smooth;}
  const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();src.buffer=buffer;src.loop=true;filter.type='lowpass';filter.frequency.value=420;gain.gain.value=.028;src.connect(filter).connect(gain).connect(audioMaster);src.start();ambientSource=src;
};
const stopAmbience=()=>{try{ambientSource?.stop();}catch(_){}ambientSource=null;};

const TOURNAMENT_LEVELS = [[25, 50], [50, 100], [100, 200], [200, 400], [400, 800], [800, 1600]];
const TOURNAMENT_PAYOUTS = [4000, 2400, 1600];

// ---------- seats ----------
game.addPlayer({ name: 'You', isBot: false, stack: 10000 });
BOT_DEFS.forEach(d => game.addPlayer({ name: d.name, isBot: true, stack: 10000 }));
const LOOKS = [{ name: 'You', skin: 0xc98d64, shirt: 0xb02020, hair: 0x2a1a0e, style: 0 },
  ...BOT_DEFS.map((d,index) => ({ name: d.name, skin: d.skin, shirt: d.shirt, hair: d.hair, style: d.style, avatarId: index + 1 }))];
LOOKS.forEach((l, i) => table.seatPlayer(i, { ...l, stack: 10000 }));

// ---------- session player stats, ranks, and weapon unlocks ----------
// Deliberately kept in memory for this visit only. No browser storage is used.
const RANKS = ['Rookie', 'Intermediate', 'Professional'];
const BOT_STAT_SEEDS = [
  { hands:84,wins:12,folds:91,calls:48,decisions:206 },
  { hands:142,wins:23,folds:126,calls:99,decisions:342 },
  { hands:57,wins:7,folds:64,calls:42,decisions:151 },
  { hands:236,wins:45,folds:128,calls:192,decisions:603 },
  { hands:103,wins:15,folds:139,calls:55,decisions:271 },
  { hands:188,wins:31,folds:174,calls:121,decisions:449 },
  { hands:262,wins:50,folds:205,calls:190,decisions:648 }
];
const playerStats = game.players.map((player,index)=>index===HERO
  ? { hands:0,wins:0,folds:0,calls:0,decisions:0,level:'Rookie' }
  : { ...BOT_STAT_SEEDS[index-1],level:'Rookie' });
window.__playerStats=playerStats;
const pct=(n,d)=>d?Math.round(n/d*100):0;
const rankFor=stats=>stats.hands>=200&&pct(stats.wins,stats.hands)>=18?'Professional':stats.hands>=50&&pct(stats.wins,stats.hands)>=12?'Intermediate':'Rookie';
const rankIndex=level=>Math.max(0,RANKS.indexOf(level));
const weaponForRank=level=>level==='Professional'?'Machine gun':level==='Intermediate'?'Handgun':'Crossbow';
function updateWeaponLocks(){
  const heroRank=rankFor(playerStats[HERO]),heroRankIndex=rankIndex(heroRank);
  document.querySelectorAll('[data-unlock-level]').forEach(button=>{
    const needed=button.dataset.unlockLevel,locked=heroRankIndex<rankIndex(needed);
    button.disabled=locked;button.classList.toggle('locked',locked);
    button.title=locked?`Unlocks at ${needed}`:`Unlocked · ${needed}`;
  });
}
function showLevelUp(seat,from,to){
  table.setSeatLevel(seat,to);
  if(seat!==HERO){table.say(seat,`${to}! ${weaponForRank(to)} unlocked.`);return;}
  $('level-up-rank').textContent=to.toUpperCase();$('level-up-unlock').textContent=`${weaponForRank(to)} unlocked · free to throw`;
  const panel=$('level-up');panel.classList.add('hidden');void panel.offsetWidth;panel.classList.remove('hidden');setTimeout(()=>panel.classList.add('hidden'),2700);
  updateWeaponLocks();
}
function refreshRank(seat,celebrate=true){
  const stats=playerStats[seat],previous=stats.level,next=rankFor(stats);stats.level=next;table.setSeatLevel(seat,next);
  if(celebrate&&rankIndex(next)>rankIndex(previous))showLevelUp(seat,previous,next);
}
playerStats.forEach((stats,seat)=>{stats.level=rankFor(stats);table.setSeatLevel(seat,stats.level);});
updateWeaponLocks();
const originalApplyAction=game.applyAction.bind(game);
game.applyAction=(seat,action)=>{const result=originalApplyAction(seat,action);const stats=playerStats[seat];stats.decisions++;if(action.type==='fold')stats.folds++;if(action.type==='call')stats.calls++;return result;};
function recordHandStart(){game.players.forEach(p=>{if(p.inHand)playerStats[p.seat].hands++;});}
function recordWinners(seats){new Set(seats).forEach(seat=>{playerStats[seat].wins++;});playerStats.forEach((_,seat)=>refreshRank(seat,true));}
function openPlayerStats(seat){
  const player=game.players[seat],stats=playerStats[seat],level=rankFor(stats),panel=$('player-stats');
  panel.dataset.seat=String(seat);$('stats-name').textContent=seat===HERO?`${player.name} · You`:player.name;$('stats-level').textContent=level.toUpperCase();
  $('stats-level').className=`rank-badge ${level.toLowerCase()}`;$('stats-hands').textContent=stats.hands.toLocaleString();$('stats-win').textContent=`${pct(stats.wins,stats.hands)}%`;$('stats-fold').textContent=`${pct(stats.folds,stats.decisions)}%`;$('stats-call').textContent=`${pct(stats.calls,stats.decisions)}%`;
  $('stats-own-actions').classList.toggle('hidden',seat!==HERO);$('stats-throw').classList.remove('hidden');panel.classList.remove('hidden');$('emoji-bar').classList.add('hidden');
}

// The pre-game lobby owns this in-memory identity for the current visit. It is
// intentionally applied before the first hand without storing a personal photo.
window.__setHeroIdentity = ({ avatarId = 0, photoDataUrl = '', name = 'You' } = {}) => {
  const cleanName = String(name || 'You').trim().slice(0, 18) || 'You';
  const selectedAvatar = Math.max(0, Math.min(15, Number(avatarId) || 0));
  window.NikkiflixLeaderboard?.rename(game.players[HERO].name, cleanName);
  game.players[HERO].name = cleanName;
  LOOKS[HERO].name = cleanName;
  table.seatPlayer(HERO, {
    ...LOOKS[HERO],
    name: cleanName,
    stack: game.players[HERO].stack,
    avatarId: selectedAvatar
  });
  table.setSeatPhoto(HERO, photoDataUrl);
};

// ---------- UI helpers ----------
let toastTimer = null;
function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
function chat(who, text, sys = false) {
  const log = $('chatlog');
  const div = document.createElement('div');
  div.innerHTML = sys ? `<span class="sys">${text}</span>` : `<span class="who">${who}:</span> ${text}`;
  log.appendChild(div);
  while (log.children.length > 50) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}
function updateHUD() {
  const s = game.snapshot();
  $('pot').textContent = s.pot.toLocaleString();
  $('street').textContent = s.street ? s.street.replace('preflop', 'PRE-FLOP').toUpperCase() : 'LOBBY';
  $('herostack').textContent = game.players[HERO].stack.toLocaleString();
}
function syncStacks() {
  game.players.forEach(p => table.setStack(p.seat, p.stack));
}
function syncBetAmounts() {
  game.players.forEach(p => table.setBetAmount(p.seat, p.betHand));
}
function syncHeroHandStrength() {
  const p=game.players[HERO],cards=[...(p?.hole||[]),...(game.board||[])];
  if(cards.length<5){table.setHandStrength('');return;}
  if(game.rules.lowball){table.setHandStrength('2–7 LOW');return;}
  const score=game.scoreFor(HERO).high;
  table.setHandStrength((CATEGORY[Math.floor(score/1e12)]||'HIGH CARD').toUpperCase());
}

window.__configurePokerTable = config => {
  const smallBlind = Math.max(1, Number(config?.smallBlind) || 25);
  const bigBlind = Math.max(smallBlind, Number(config?.bigBlind) || 50);
  const buyIn = Math.max(bigBlind, Number(config?.buyIn) || bigBlind * 100);
  const mode = config?.mode === 'tournament' ? 'tournament' : 'cash';
  const entryFee = mode === 'tournament' ? Math.max(0, Number(config?.entryFee) || 1000) : 0;
  const prizePool = mode === 'tournament' ? Math.max(entryFee, Number(config?.prizePool) || entryFee * 8) : 0;
  const sharedBalance = Number(window.NikkiflixBank?.get?.());
  if (mode === 'tournament' && !window.NikkiflixBank?.debit?.(entryFee)) {
    toast(`You need ${entryFee.toLocaleString()} gold coins to enter.`);
    return false;
  }
  const variant = String(config?.variant || 'holdem');
  currentTable = {
    id: String(config?.id || 'low'),
    name: String(config?.name || 'Low Stakes Cash Game'),
    mode,
    variant,
    smallBlind,
    bigBlind,
    buyIn,
    entryFee,
    prizePool
  };
  window.__pokerUsesSeparateStack = mode === 'tournament';
  game.setVariant(variant);
  table.setVariant(variant);
  game.sb = smallBlind;
  game.bb = bigBlind;
  game.button = -1;
  game.handNo = 0;
  resultRecorded = false;
  tournamentFinished = false;
  game.players.forEach((player, index) => {
    player.stack = mode === 'tournament' ? buyIn : index === HERO && Number.isFinite(sharedBalance) ? sharedBalance : buyIn;
    player.hole = [];
    player.folded = false;
    player.allIn = false;
    player.betStreet = 0;
    player.betHand = 0;
    player.acted = false;
    player.inHand = false;
    player.sittingOut = false;
  });
  heroSittingOut = false;
  $('sit-back-in').classList.add('hidden');
  table.setSeatStatus(HERO, '');
  startingStacks = game.players.map(player => player.stack);
  table.clearHand();
  syncStacks();
  $('stakesbox').querySelector('span').textContent = mode === 'tournament' ? 'TOURNAMENT · L1' : game.rules.family === 'stud' ? `${game.rules.name.toUpperCase()} · ANTE` : game.variantId === 'holdem' ? 'NO LIMIT' : game.rules.name.toUpperCase();
  $('stakesbox').querySelector('strong').textContent = `${smallBlind.toLocaleString()} / ${bigBlind.toLocaleString()}`;
  $('street').textContent = currentTable.name.toUpperCase();
  $('stack-unit').textContent = mode === 'tournament' ? 'tournament chips' : 'gold coins';
  $('start-description').textContent = mode === 'tournament'
    ? `8-player tournament · ${entryFee.toLocaleString()} gold coin entry · ${prizePool.toLocaleString()} prize pool`
    : `Eight-handed ${game.rules.name} · Gold coins`;
  $('broke-title').textContent = 'Out of gold coins!';
  $('broke-message').textContent = 'Your free gold coin refill is ready.';
  $('btn-rebuy').textContent = `Free refill · ${buyIn.toLocaleString()}`;
  $('leave-table-broke').textContent = 'Choose another table';
  $('brokeoverlay').classList.add('hidden');
  $('actionbar').classList.add('hidden');
  $('betpanel').classList.add('hidden');
  updateHUD();
  return true;
};

const recordCashResult = () => {
  if (resultRecorded || currentTable.mode !== 'cash' || game.handNo === 0) return;
  resultRecorded = true;
  window.NikkiflixLeaderboard?.recordCash(game.players, startingStacks);
};

const updateTournamentBlinds = () => {
  if (currentTable.mode !== 'tournament') return;
  const levelIndex = Math.min(TOURNAMENT_LEVELS.length - 1, Math.floor(game.handNo / 3));
  const [smallBlind, bigBlind] = TOURNAMENT_LEVELS[levelIndex];
  game.sb = smallBlind;
  game.bb = bigBlind;
  $('stakesbox').querySelector('span').textContent = `TOURNAMENT · L${levelIndex + 1}`;
  $('stakesbox').querySelector('strong').textContent = `${smallBlind.toLocaleString()} / ${bigBlind.toLocaleString()}`;
  if (game.handNo > 0 && game.handNo % 3 === 0) toast(`Blinds up · ${smallBlind.toLocaleString()} / ${bigBlind.toLocaleString()}`, 2200);
};

const finishTournament = place => {
  if (tournamentFinished) return;
  tournamentFinished = true;
  const payout = TOURNAMENT_PAYOUTS[place - 1] || 0;
  if (payout) window.NikkiflixBank?.credit?.(payout);
  if (place === 1) window.NikkiflixLeaderboard?.recordTournament(game.players[HERO].name);
  $('actionbar').classList.add('hidden');
  $('betpanel').classList.add('hidden');
  $('broke-title').textContent = place === 1 ? 'Tournament champion!' : `Finished ${place}${place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'}`;
  $('broke-message').textContent = payout
    ? `You earned ${payout.toLocaleString()} gold coins from the ${currentTable.prizePool.toLocaleString()} prize pool.`
    : 'Only the top three finishers earn gold coins in this event.';
  $('btn-rebuy').textContent = 'Return to poker room';
  $('leave-table-broke').textContent = 'View leaderboard';
  $('brokeoverlay').classList.remove('hidden');
  const done = () => leavePokerTable();
  $('btn-rebuy').onclick = done;
  $('leave-table-broke').onclick = done;
};

const leavePokerTable = () => {
  if (!tableActive) return;
  recordCashResult();
  tableActive = false;
  tableSession++;
  cancelHeroTurn?.();
  cancelBrokeWait?.();
  cancelHeroTurn = null;
  cancelBrokeWait = null;
  $('actionbar').classList.add('hidden');
  $('betpanel').classList.add('hidden');
  $('sit-back-in').classList.add('hidden');
  $('brokeoverlay').classList.add('hidden');
  $('chatpanel').classList.add('hidden');
  table.setTurnTimer({active:false,remaining:0,warning:false});
  stopAmbience();
  table.setActiveSeat(-1);
  if (currentTable.mode === 'cash') window.NikkiflixBank?.set?.(game.players[HERO].stack);
  window.dispatchEvent(new CustomEvent('nikkiflix:leave-poker'));
  window.__pokerUsesSeparateStack = false;
};

$('leave-table').onclick = leavePokerTable;
$('leave-table-broke').onclick = leavePokerTable;
$('chatbtn').onclick = () => $('chatpanel').classList.toggle('hidden');
$('sound-toggle').onclick=()=>{
  soundEnabled=!soundEnabled;
  const button=$('sound-toggle');button.setAttribute('aria-pressed',String(soundEnabled));button.textContent=soundEnabled?'Sound on':'Sound off';button.setAttribute('aria-label',soundEnabled?'Turn table sound off':'Turn table sound on');
  if(soundEnabled){initAudio();if(audioMaster)audioMaster.gain.value=.72;startAmbience();tone(660,.12,.08,'sine');}
  else{if(audioMaster)audioMaster.gain.value=0;stopAmbience();window.speechSynthesis?.cancel?.();}
};

// ---------- hero turn ----------
function alertTurn(warning = false) {
  if (navigator.vibrate) navigator.vibrate(warning ? [160, 70, 160] : [90, 45, 120]);
  if(warning){tone(180,.24,.15,'sawtooth');noiseBurst(.24,.065,560,.02);}else{tone(784,.14,.16,'sine');tone(1046,.18,.14,'triangle',.12);}
}

function heroTurn(act) {
  return new Promise(resolve => {
    window.__heroTurn = true;
    let over = false, remaining = 30, warned = false;
    const bar = $('actionbar');
    const cc = $('btn-checkcall'), br = $('btn-betraise');
    bar.classList.remove('hidden');table.setTurnTimer({active:true,remaining:30,total:30,warning:false});
    alertTurn(false);
    if (act.canCheck) cc.textContent = 'Check'; else cc.textContent = `Call ${act.toCall}`;
    br.textContent = act.toCall > 0 ? 'Raise' : 'Bet';
    const timer=setInterval(()=>{
      if(over)return;remaining--;
      if(remaining===10){warned=true;alertTurn(true);}
      table.setTurnTimer({active:true,remaining,total:30,warning:warned});
      if(remaining<=0){
        over=true;window.__heroTurn=false;game.applyAction(HERO,{type:'fold'});game.players[HERO].sittingOut=true;heroSittingOut=true;
        table.foldSeat(HERO);table.setSeatStatus(HERO,'SITTING OUT');chat(null,'Time expired — your hand folded. You are sitting out.',true);toast('Sitting out · Tap to return',3200);finish(true);
      }
    },1000);
    const finish = (timedOut=false) => {
      clearInterval(timer);bar.classList.add('hidden');table.setTurnTimer({active:false,remaining:0,warning:false});$('betpanel').classList.add('hidden');cancelHeroTurn=null;
      if(timedOut)$('sit-back-in').classList.remove('hidden');resolve();
    };
    cancelHeroTurn=()=>{if(over)return;over=true;window.__heroTurn=false;finish();};
    const once=fn=>()=>{if(over)return;over=true;window.__heroTurn=false;fn();};
    $('btn-fold').onclick=once(()=>{game.applyAction(HERO,{type:'fold'});table.setActionBadge(HERO,'FOLD');table.foldSeat(HERO);chat(null,'You fold.',true);finish();});
    cc.onclick=once(async()=>{const p=game.players[HERO],before=p.betStreet;game.applyAction(HERO,act.canCheck?{type:'check'}:{type:'call'});const committed=p.betStreet-before;table.setBetAmount(HERO,p.betHand);table.setActionBadge(HERO,act.canCheck?'CHECK':'CALL');if(act.canCheck)await table.playAnimation(HERO,'knock');else if(committed>0){sfxChips();await table.betChips(HERO,committed);}table.setStack(HERO,p.stack);finish();});
    br.onclick=()=>{if(!over)openBetPanel(act,()=>{over=true;window.__heroTurn=false;finish();});};
  });
}

$('sit-back-in').onclick=()=>{
  heroSittingOut=false;game.players[HERO].sittingOut=false;$('sit-back-in').classList.add('hidden');table.setSeatStatus(HERO,'');table.unfurlSeat(HERO);toast('You’re back in for the next hand');
};

function openBetPanel(act, done) {
  const p = game.players[HERO];
  const mode = act.toCall > 0 ? 'raise' : 'bet';
  const maxTo = p.betStreet + p.stack;
  const slider = $('betslider');
  let min;
  if (mode === 'bet') min = Math.min(game.bb, maxTo);
  else min = Math.min(act.minRaiseTo, maxTo);
  slider.min = min; slider.max = maxTo;
  slider.step = Math.max(1, game.sb); slider.value = min;
  $('betamt').textContent = Number(slider.value).toLocaleString();
  $('betpanel').classList.remove('hidden');
  slider.oninput = () => { $('betamt').textContent = Number(slider.value).toLocaleString(); };
  document.querySelectorAll('#betpresets button[data-mult]').forEach(b => {
    b.onclick = () => {
      const s = game.snapshot();
      const v = Math.min(maxTo, Math.max(min, Math.round(s.pot * Number(b.dataset.mult))));
      slider.value = v; $('betamt').textContent = v.toLocaleString();
    };
  });
  $('preset-max').onclick = () => { slider.value = maxTo; $('betamt').textContent = maxTo.toLocaleString(); };
  $('bet-cancel').onclick = () => { $('betpanel').classList.add('hidden'); };
  let confirmed = false;
  $('bet-ok').onclick = async () => {
    if (confirmed) return;
    const amount = Number(slider.value);
    const before = p.betStreet;
    try {
      game.applyAction(HERO, { type: mode, amount });
    } catch (e) { toast('Invalid bet'); return; }
    confirmed = true;
    const committed = p.betStreet - before;
    table.setBetAmount(HERO, p.betHand);
    table.setActionBadge(HERO, p.allIn?'ALL-IN':mode.toUpperCase());
    if (committed > 0) { sfxChips(); await table.betChips(HERO, committed); }
    table.setStack(HERO, p.stack);
    chat(null, `You ${mode} to ${p.betStreet}.`, true);
    done();
  };
}

// ---------- bot turn ----------
async function botTurn(act, session) {
  const p = game.players[act.seat];
  await delay(650 + Math.random() * 850);
  if (!sessionIsActive(session)) return;
  const d = decideBot(game, act.seat);
  const before = p.betStreet;
  game.applyAction(act.seat, d);
  const committed = p.betStreet - before;
  table.setBetAmount(act.seat, p.betHand);
  table.setActionBadge(act.seat,p.allIn?'ALL-IN':d.type.toUpperCase());
  if (d.type === 'fold') {
    table.foldSeat(act.seat);
  } else if (d.type === 'check') {
    await table.playAnimation(act.seat,'knock');
  } else if (committed > 0) {
    sfxChips();
    await table.betChips(act.seat, committed);
  }
  table.setStack(act.seat, p.stack);
  updateHUD();
}

// ---------- hand flow ----------
const sessionIsActive = session => tableActive && session === tableSession;

async function handleWin(res) {
  recordWinners([res.seat]);
  const p = game.players[res.seat];
  sfxWin();
  await table.awardPot(res.seat);
  table.setStack(res.seat, p.stack);
  updateHUD();
  if (res.seat === HERO) {
    if (res.uncontested) {
      const choice = await showMuckChoice();
      if (choice === 'muck') table.foldSeat(HERO);
      else { await table.revealSeat(HERO,toRS(p.hole)); const line = botLine('win'); chat('You', line); }
    }
    toast(`You win ${res.amount.toLocaleString()}!`);
    chat(null, `You win ${res.amount.toLocaleString()}.`, true);
  } else {
    // bots usually muck uncontested wins; sometimes show
    if (res.uncontested && Math.random() < 0.18) {
      await table.revealSeat(res.seat, toRS(p.hole));
    }
    toast(`${p.name} wins ${res.amount.toLocaleString()}`);
    chat(null, `${p.name} wins ${res.amount.toLocaleString()}.`, true);
  }
}

async function handleShowdown(res) {
  recordWinners(res.pots.flatMap(pot=>pot.winners));
  // reveal
  for (const seat of Object.keys(res.hands).map(Number)) {
    await table.revealSeat(seat, toRS(res.hands[seat]));
    if (seat !== HERO) await delay(250);
  }
  // award each pot
  for (const pot of res.pots) {
    for (const w of pot.winners) {
      await table.awardPot(w);
      table.setStack(w, game.players[w].stack);
    }
    const names = pot.winners.map(s => s === HERO ? 'You' : game.players[s].name).join(' & ');
    const msg = pot.winners.length > 1
      ? `Split pot: ${names} — ${pot.desc} (${pot.amount.toLocaleString()})`
      : `${names} wins ${pot.amount.toLocaleString()} with ${pot.desc}`;
    toast(msg, 3200);
    chat(null, msg + '.', true);
    await delay(900);
  }
  updateHUD();
}

function showMuckChoice() {
  return new Promise(resolve => {
    $('showmuck').classList.remove('hidden');
    $('btn-show').onclick = () => { $('showmuck').classList.add('hidden'); resolve('show'); };
    $('btn-muck').onclick = () => { $('showmuck').classList.add('hidden'); resolve('muck'); };
  });
}

const cardLabel = card => {
  const ranks='23456789TJQKA', suits=['♠','♥','♦','♣'];
  return `${ranks[rankOf(card)]}${suits[suitOf(card)]}`;
};
function chooseCards(kind) {
  const hero=game.players[HERO],overlay=$('card-choice'),grid=$('card-choice-grid'),selected=new Set(),limit=kind==='pineapple'?1:3;
  $('card-choice-title').textContent=kind==='pineapple'?'Discard one card':'Choose cards to draw';
  $('card-choice-copy').textContent=kind==='pineapple'?'Pineapple keeps two hole cards after the flop. Pick the one card you want to release.':'Select up to three cards to replace, or stand pat.';
  grid.replaceChildren(...hero.hole.map((card,index)=>{const button=document.createElement('button');button.type='button';button.dataset.cardIndex=String(index);button.className=(suitOf(card)===1||suitOf(card)===2)?'red':'';button.innerHTML=`<strong>${cardLabel(card)}</strong><small>Keep</small>`;button.onclick=()=>{if(selected.has(index))selected.delete(index);else{if(selected.size>=limit){if(kind==='pineapple')selected.clear();else return;}selected.add(index);}button.classList.toggle('selected',selected.has(index));button.querySelector('small').textContent=selected.has(index)?'Discard':'Keep';$('card-choice-confirm').disabled=kind==='pineapple'&&selected.size!==1;$('card-choice-confirm').textContent=kind==='pineapple'?'Discard selected':selected.size?`Draw ${selected.size}`:'Stand pat';};return button;}));
  $('card-choice-confirm').disabled=kind==='pineapple';$('card-choice-confirm').textContent=kind==='pineapple'?'Choose one card':'Stand pat';overlay.classList.remove('hidden');
  return new Promise(resolve=>{$('card-choice-confirm').onclick=()=>{if(kind==='pineapple'&&selected.size!==1)return;overlay.classList.add('hidden');resolve([...selected].sort((a,b)=>a-b));};});
}
async function handleSpecial(kind,session){
  if(!sessionIsActive(session))return;
  const active=game.players.filter(p=>p.inHand&&!p.folded);
  if(kind==='pineapple'){
    for(const p of active.filter(p=>p.isBot)){const index=game.suggestDiscards(p.seat,1)[0]||0;game.discardPineapple(p.seat,index);table.removeHoleCard(p.seat,index);}
    if(!game.players[HERO].folded){const [index]=await chooseCards('pineapple');game.discardPineapple(HERO,index);table.removeHoleCard(HERO,index);chat(null,'You discarded one card for Pineapple.',true);}return;
  }
  if(kind==='draw'){
    for(const p of active.filter(p=>p.isBot)){const indexes=game.suggestDiscards(p.seat,3),drawn=game.replaceCards(p.seat,indexes);await table.replaceHoleCards(p.seat,indexes,toRS(drawn),HERO,game.faceUpIndexes());table.setActionBadge(p.seat,indexes.length?`DRAW ${indexes.length}`:'PAT');}
    if(!game.players[HERO].folded){const indexes=await chooseCards('draw'),drawn=game.replaceCards(HERO,indexes);await table.replaceHoleCards(HERO,indexes,toRS(drawn),HERO,[]);table.setActionBadge(HERO,indexes.length?`DRAW ${indexes.length}`:'PAT');chat(null,indexes.length?`You draw ${indexes.length}.`:'You stand pat.',true);syncHeroHandStrength();}
  }
}

async function playHand(session) {
  if (!sessionIsActive(session)) return;
  updateTournamentBlinds();
  const info = game.beginHand();
  if (info.error) return;
  recordHandStart();
  table.clearHand();
  syncStacks();
  updateHUD();
  table.setDealerButton(info.button);
  if (typeof table.setBlindButtons === 'function') table.setBlindButtons(info.sbSeat, info.bbSeat);
  chat(null, `— ${currentTable.name} · Hand #${game.handNo} —`, true);
  // Blinds, or antes plus the stud bring-in.
  for (const post of (info.posts || [])) {
    if (post.amount > 0) await table.betChips(post.seat, post.amount);
    if (!sessionIsActive(session)) return;
  }
  syncBetAmounts();
  syncStacks(); updateHUD();
  // Shuffle and deal from the one authoritative crypto-shuffled deck.
  sfxShuffle();
  await delay(360);
  const hole = game.players.map(p => p.inHand ? toRS(p.hole) : null);
  const dealSounds=setInterval(sfxDeal,235);
  await table.dealHoleCards(hole, HERO, game.faceUpIndexes());
  clearInterval(dealSounds);
  if (!sessionIsActive(session)) return;
  // betting streets
  for (;;) {
    let act;
    while (sessionIsActive(session) && (act = game.nextAction())) {
      table.setActiveSeat(act.seat);
      if (act.seat === HERO) await heroTurn(act);
      else await botTurn(act, session);
      if (!sessionIsActive(session)) return;
      updateHUD();
    }
    if (!sessionIsActive(session)) return;
    table.setActiveSeat(-1);
    const res = game.advance();
    if (!res) break;
    if (res.type === 'street') {
      if (res.cards?.length) {
        const startIdx = res.street === 'flop' ? 0 : res.street === 'turn' ? 3 : 4;
        await table.dealBoard(toRS(res.cards), startIdx);
      }
      if (res.privateCards && Object.keys(res.privateCards).length) {
        const converted=Object.fromEntries(Object.entries(res.privateCards).map(([seat,cards])=>[seat,toRS(cards)]));
        await table.dealPrivateCards(converted,HERO,game.faceUpIndexes());
      }
      if (!sessionIsActive(session)) return;
      if (res.special) await handleSpecial(res.special,session);
      if (!sessionIsActive(session)) return;
      syncHeroHandStrength();
      toast(res.street.toUpperCase(), 1400);
      chat(null, `— ${res.street} —`, true);
      updateHUD();
    } else if (res.type === 'win') {
      await handleWin(res);
      break;
    } else if (res.type === 'showdown') {
      await handleShowdown(res);
      break;
    }
  }
  table.endHand();
  // Rare table talk belongs only in the pause after a completed hand. It is
  // shown as text; no synthetic bot voices play during or between hands.
  if (sessionIsActive(session) && Math.random() < 0.12) {
    const seated = game.players.filter(p => p.isBot && p.stack > 0);
    const p = seated[(Math.random() * seated.length) | 0];
    const line = botLine();
    table.say(p.seat, line);
    chat(p.name, line);
  }
  if (sessionIsActive(session)) await delay(3200);
}

// ---------- player-triggered gestures, dealer tips, stats, and throwable reactions ----------
$('tip-dealer').onclick=async()=>{
  const tip=25,p=game.players[HERO];
  if(p.stack<tip){toast('You need 25 gold coins to tip');return;}
  p.stack-=tip;
  if(currentTable.mode==='cash')window.NikkiflixBank?.debit?.(tip);
  table.setStack(HERO,p.stack);updateHUD();
  sfxChips();
  const total=await table.tipDealer(HERO,tip);
  toast(`Dealer tipped 25 · Table tips ${total.toLocaleString()}`);
};
function clearThrowSelection(){
  selectedThrow=null;
  $('throw-hint').classList.add('hidden');
  document.querySelectorAll('[data-throw]').forEach(button=>button.classList.remove('selected'));
}
function openThrowPicker(targetSeat=HERO){
  throwPickerTarget=Number.isInteger(targetSeat)?targetSeat:HERO;
  clearThrowSelection();
  const target=game.players[throwPickerTarget];
  $('throw-picker-instruction').textContent=throwPickerTarget===HERO?'Pick one, then tap a player':`Pick one — throws at ${target?.name||'this player'}`;
  $('player-stats').classList.add('hidden');
  $('emoji-bar').classList.remove('hidden');
  $('emoji-toggle').setAttribute('aria-expanded','true');
}
function throwAtSeat(seat,item){
  const target=game.players[seat];
  if(!target)return false;
  const price=item.price;
  if(price>0&&!window.NikkiflixBank?.debit?.(price)){toast(`You need ${price.toLocaleString()} gold coins`);return false;}
  if(price>0&&currentTable.mode==='cash'){game.players[HERO].stack=Math.max(0,Number(window.NikkiflixBank?.get?.())||0);table.setStack(HERO,game.players[HERO].stack);updateHUD();}
  table.throwReaction(HERO,seat,item);
  chat(null,`You threw ${item.type} at ${target.name}${price?` for ${price} gold coins`:''}.`,true);
  return true;
}
$('emoji-toggle').onclick=()=>{
  const bar=$('emoji-bar'),opening=bar.classList.contains('hidden');
  if(opening)openThrowPicker(HERO);else{bar.classList.add('hidden');$('emoji-toggle').setAttribute('aria-expanded','false');}
  $('player-stats').classList.add('hidden');
};
$('stats-close').onclick=()=>$('player-stats').classList.add('hidden');
$('stats-throw').onclick=()=>openThrowPicker(Number($('player-stats').dataset.seat));
document.querySelectorAll('[data-throw]').forEach(button=>button.onclick=()=>{
  if(button.disabled)return;
  const needed=button.dataset.unlockLevel;if(needed&&rankIndex(rankFor(playerStats[HERO]))<rankIndex(needed)){toast(`${needed} rank required`);return;}
  const item={type:button.dataset.throw,glyph:button.dataset.glyph,price:Number(button.dataset.price)||0};
  if(throwPickerTarget!==HERO){
    if(throwAtSeat(throwPickerTarget,item)){$('emoji-bar').classList.add('hidden');$('emoji-toggle').setAttribute('aria-expanded','false');clearThrowSelection();}
    return;
  }
  selectedThrow=item;
  document.querySelectorAll('[data-throw]').forEach(b=>b.classList.toggle('selected',b===button));
  $('emoji-bar').classList.add('hidden');$('emoji-toggle').setAttribute('aria-expanded','false');$('throw-hint').classList.remove('hidden');
});
document.querySelectorAll('[data-gesture]').forEach(button=>button.onclick=()=>{
  clearThrowSelection();
  table.playAnimation(HERO,button.dataset.gesture);
  $('player-stats').classList.add('hidden');$('emoji-bar').classList.add('hidden');$('emoji-toggle').setAttribute('aria-expanded','false');
});
window.addEventListener('nikkiflix:seat-tap',event=>{
  const seat=event.detail.seat;
  if(selectedThrow){
    if(throwAtSeat(seat,selectedThrow))clearThrowSelection();
    return;
  }
  openPlayerStats(seat);
});

// ---------- main loop ----------
async function main(session) {
  while (sessionIsActive(session)) {
    const active = game.players.filter(p => p.stack > 0);
    if (currentTable.mode === 'tournament') {
      if (game.players[HERO].stack <= 0) {
        finishTournament(Math.min(8, active.length + 1));
        return;
      }
      if (active.length === 1) {
        finishTournament(active[0].seat === HERO ? 1 : 2);
        return;
      }
    } else {
      if (active.length < 2 && game.players[HERO].stack > 0) {
        game.players.filter(p => p.isBot).forEach(p => { p.stack = currentTable.buyIn; });
        syncStacks();
        toast('The cash table has been restacked');
        await delay(1500);
        if (!sessionIsActive(session)) return;
      }
      if (game.players[HERO].stack <= 0) {
        await new Promise(resolve => {
          let settled = false;
          const finish = () => { if (settled) return; settled = true; cancelBrokeWait = null; resolve(); };
          cancelBrokeWait = finish;
          $('broke-title').textContent = 'Out of gold coins!';
          $('broke-message').textContent = 'Your free gold coin refill is ready.';
          $('btn-rebuy').textContent = `Free refill · ${currentTable.buyIn.toLocaleString()}`;
          $('brokeoverlay').classList.remove('hidden');
          $('btn-rebuy').onclick = () => {
            game.players[HERO].stack = currentTable.buyIn;
            window.NikkiflixBank?.set?.(currentTable.buyIn);
            $('brokeoverlay').classList.add('hidden');
            syncStacks(); updateHUD();
            finish();
          };
        });
        if (!sessionIsActive(session)) return;
      }
    }
    await playHand(session);
    if (sessionIsActive(session) && currentTable.mode === 'cash') window.NikkiflixBank?.set?.(game.players[HERO].stack);
  }
}

$('btn-start').onclick = () => {
  if (tableActive) return;
  $('startoverlay').classList.add('hidden');
  tableActive = true;
  const session = ++tableSession;
  const welcomeLine = currentTable.mode === 'tournament'
    ? `Welcome to ${currentTable.name}. ${currentTable.entryFee.toLocaleString()} gold coin entry · ${currentTable.prizePool.toLocaleString()} prize pool · blinds rise every 3 hands.`
    : `Welcome to ${currentTable.name}. ${game.rules.name} · ${game.rules.family==='stud'?'ante / bring-in':'blinds'} ${currentTable.smallBlind.toLocaleString()} / ${currentTable.bigBlind.toLocaleString()} · gold coins only.`;
  initAudio();startAmbience();sfxShuffle();
  chat(null, welcomeLine, true);
  main(session);
};
