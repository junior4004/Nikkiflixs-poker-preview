// Nikkiflix Poker — multi-variant poker engine (browser + future server shared source).
// Every game uses one crypto-shuffled 52-card deck. Bots receive only their own
// cards plus public cards; no player-specific weighting or action dealing exists.
import { newDeck, shuffle, evaluate7, eval5, rankOf, suitOf, CATEGORY } from './cards.js';

export const VARIANTS = {
  holdem: { name: "Texas Hold’em", family: 'community', hole: 2, streets: [['flop',3],['turn',1],['river',1]] },
  omaha: { name: 'Omaha', family: 'community', hole: 4, streets: [['flop',3],['turn',1],['river',1]], omaha: true },
  omaha8: { name: 'Omaha Hi-Lo 8 or Better', family: 'community', hole: 4, streets: [['flop',3],['turn',1],['river',1]], omaha: true, hiLo: true },
  pineapple: { name: 'Pineapple', family: 'community', hole: 3, streets: [['flop',3],['turn',1],['river',1]], pineapple: true },
  draw5: { name: 'Five Card Draw', family: 'draw', hole: 5, streets: [['draw',0]], draw: true },
  lowball: { name: '2–7 Lowball', family: 'draw', hole: 5, streets: [['draw',0]], draw: true, lowball: true },
  stud5: { name: 'Five Card Stud', family: 'stud', hole: 2, streets: [['fourth',1],['fifth',1],['river',1]], up: [1,2,3,4] },
  stud7: { name: 'Seven Card Stud', family: 'stud', hole: 3, streets: [['fourth',1],['fifth',1],['sixth',1],['river',1]], up: [2,3,4,5] }
};

const choose = (arr, n) => {
  const out=[];
  const walk=(start,pick)=>{ if(pick.length===n){out.push(pick.slice());return;} for(let i=start;i<=arr.length-(n-pick.length);i++){pick.push(arr[i]);walk(i+1,pick);pick.pop();} };
  walk(0,[]); return out;
};
const lowRanks = cards => cards.map(c => rankOf(c) + 2).map(r => r === 14 ? 1 : r);
function omahaScores(hole, board) {
  let high=-1, low=null;
  for(const h of choose(hole,2)) for(const b of choose(board,3)) {
    const five=[...h,...b], score=eval5(five); if(score>high) high=score;
    const ranks=[...new Set(lowRanks(five))].sort((a,b)=>b-a);
    if(ranks.length===5 && ranks[0]<=8) {
      const key=ranks.reduce((s,r)=>s*15+r,0);
      if(low===null || key<low) low=key;
    }
  }
  return { high, low };
}
function bestOf(cards) {
  if(cards.length===5) return eval5(cards);
  if(cards.length===6) { let best=-1; for(const five of choose(cards,5)) best=Math.max(best,eval5(five)); return best; }
  return evaluate7(cards).score;
}
function deuceLowScore(cards) {
  let best=-Infinity;
  for(const five of choose(cards,5)) {
    const normal=eval5(five), cat=Math.floor(normal/1e12);
    const ranks=five.map(rankOf).sort((a,b)=>b-a);
    const counts={}; ranks.forEach(r=>counts[r]=(counts[r]||0)+1);
    const groups=Object.entries(counts).map(([r,n])=>[n,+r]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]);
    const flush=five.every(c=>suitOf(c)===suitOf(five[0]));
    const uniq=[...new Set(ranks)]; const straight=uniq.length===5 && uniq[0]-uniq[4]===4;
    let bad=0, tie=[];
    if(straight&&flush) {bad=8;tie=[uniq[0]];} else if(groups[0][0]===4){bad=7;tie=groups.map(g=>g[1]);}
    else if(groups[0][0]===3&&groups[1]?.[0]===2){bad=6;tie=groups.map(g=>g[1]);}
    else if(flush){bad=5;tie=ranks;} else if(straight){bad=4;tie=[uniq[0]];}
    else if(groups[0][0]===3){bad=3;tie=groups.map(g=>g[1]);}
    else if(groups[0][0]===2&&groups[1]?.[0]===2){bad=2;tie=groups.map(g=>g[1]);}
    else if(groups[0][0]===2){bad=1;tie=groups.map(g=>g[1]);} else {bad=0;tie=ranks;}
    const key=bad*1e10+tie.reduce((s,r)=>s*15+(r+2),0);
    best=Math.max(best,-key);
  }
  return best;
}

export class PokerGame {
  constructor({ smallBlind=10, bigBlind=20, variant='holdem' }={}) { this.sb=smallBlind;this.bb=bigBlind;this.players=[];this.button=-1;this.handNo=0;this.setVariant(variant); }
  setVariant(id='holdem'){this.variantId=VARIANTS[id]?id:'holdem';this.rules=VARIANTS[this.variantId];}
  addPlayer({name,isBot=false,stack=1000}){const seat=this.players.length;this.players.push({seat,name,isBot,stack,hole:[],folded:false,allIn:false,betStreet:0,betHand:0,acted:false,inHand:false,sittingOut:false});return seat;}
  _active(){return this.players.filter(p=>p.stack>0&&!p.sittingOut)}
  _next(s){const n=this.players.length;for(let k=1;k<=n;k++){const c=(s+k+n)%n;if(this.players[c].inHand)return c;}}
  _post(seat,amt){const p=this.players[seat],a=Math.min(amt,p.stack);p.stack-=a;p.betStreet+=a;p.betHand+=a;if(!p.stack)p.allIn=true;return {seat,amount:a};}
  beginHand(){
    const active=this._active();if(active.length<2)return{error:'not enough players with chips'};
    this.handNo++;this.deck=shuffle(newDeck());this.board=[];this.pot=0;this.currentBet=0;this.minRaise=this.bb;this._turn=null;this._cursor=undefined;this._handOver=false;this._streetIndex=-1;
    for(const p of this.players){p.hole=[];p.folded=false;p.allIn=false;p.betStreet=0;p.betHand=0;p.acted=false;p.inHand=p.stack>0&&!p.sittingOut;}
    const n=this.players.length;for(let k=1;k<=n;k++){const c=(this.button+k+n)%n;if(this.players[c].inHand){this.button=c;break;}}
    const posts=[];
    if(this.rules.family==='stud'){
      this.street='third';const ante=Math.max(1,Math.floor(this.sb/2));
      active.forEach(p=>posts.push(this._post(p.seat,ante)));
    }else{
      this.street=this.rules.family==='draw'?'pre-draw':'preflop';
      const headsUp=active.length===2,sbSeat=headsUp?this.button:this._next(this.button),bbSeat=headsUp?this._next(this.button):this._next(sbSeat);
      posts.push(this._post(sbSeat,this.sb),this._post(bbSeat,this.bb));this.currentBet=this.bb;this._firstToAct=this._next(bbSeat);
    }
    let d=this._next(this.button);for(let r=0;r<this.rules.hole;r++)for(let k=0;k<n;k++){const p=this.players[(d+k)%n];if(p.inHand)p.hole.push(this.deck.pop());}
    if(this.rules.family==='stud'){
      const upIndex=(this.rules.up||[])[0]??this.rules.hole-1;
      const suitOrder=s=>3-suitOf(s); // clubs, diamonds, hearts, spades for bring-in ties
      const starter=active.reduce((best,p)=>{const c=p.hole[upIndex],key=rankOf(c)*4+suitOrder(c);return !best||key<best.key?{seat:p.seat,key}:best;},null).seat;
      posts.push(this._post(starter,this.bb));this.currentBet=this.players[starter].betStreet;this._firstToAct=this._next(starter);
    }
    return {button:this.button,posts,sbSeat:posts[0]?.seat,bbSeat:posts[1]?.seat};
  }
  faceUpIndexes(){return this.rules.family==='stud'?(this.rules.up||[]):[];}
  _live(){return this.players.filter(p=>p.inHand&&!p.folded&&!p.allIn)}
  _orderFrom(s){const n=this.players.length,out=[];for(let k=0;k<n;k++)out.push(this.players[(s+k)%n]);return out;}
  nextAction(){if(this._turn!==null&&this._turn!==undefined)return this._turnInfo();const live=this._live();if(live.length<=1){this._turn=null;return null;}const start=this._cursor!==undefined?this._cursor:this._firstToAct;for(const p of this._orderFrom(start)){if(!p.inHand||p.folded||p.allIn)continue;if(!p.acted||p.betStreet<this.currentBet){this._turn=p.seat;return this._turnInfo();}}this._turn=null;return null;}
  _turnInfo(){if(this._turn===null||this._turn===undefined)return null;const p=this.players[this._turn],toCall=Math.min(this.currentBet-p.betStreet,p.stack);return{seat:p.seat,name:p.name,toCall,canCheck:p.betStreet===this.currentBet,minRaiseTo:this.currentBet+this.minRaise,maxTo:p.betStreet+p.stack,pot:this.pot+this.players.reduce((s,q)=>s+q.betStreet,0)};}
  applyAction(seat,{type,amount=0}){if(this._turn===null||this._turn===undefined)this.nextAction();if(seat!==this._turn)throw new Error(`not seat ${seat}'s turn`);const p=this.players[seat],n=this.players.length,commit=amt=>{const a=Math.min(amt,p.stack);p.stack-=a;p.betStreet+=a;p.betHand+=a;if(!p.stack)p.allIn=true;return a;};
    if(type==='fold')p.folded=true;else if(type==='check'){if(p.betStreet!==this.currentBet)throw new Error('cannot check facing a bet');}else if(type==='call')commit(this.currentBet-p.betStreet);else if(type==='bet'||type==='raise'){const target=Math.min(amount,p.betStreet+p.stack),inc=target-this.currentBet,allIn=target===p.betStreet+p.stack;if(!allIn){if(this.currentBet===0&&target<this.bb)throw new Error('bet below big blind');if(this.currentBet>0&&inc<this.minRaise)throw new Error('raise too small');}commit(target-p.betStreet);if(inc>=this.minRaise){this.minRaise=inc;this.currentBet=target;for(const q of this.players)if(q.seat!==seat&&q.inHand&&!q.folded&&!q.allIn)q.acted=false;}else if(target>this.currentBet)this.currentBet=target;}else throw new Error('unknown action '+type);p.acted=true;this._turn=null;this._cursor=(seat+1)%n;return true;}
  _collectBets(){for(const p of this.players){this.pot+=p.betStreet;p.betStreet=0;}}
  _studFirstToAct(){let best=null;for(const p of this.players){if(!p.inHand||p.folded||p.allIn)continue;const visible=(this.rules.up||[]).filter(i=>i<p.hole.length).map(i=>p.hole[i]);if(!visible.length)continue;const counts={};visible.forEach(c=>counts[rankOf(c)]=(counts[rankOf(c)]||0)+1);const groups=Object.entries(counts).map(([r,n])=>[n,+r]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]);let cat=groups[0][0]===4?4:groups[0][0]===3?3:groups[0][0]===2&&groups[1]?.[0]===2?2:groups[0][0]===2?1:0;let score=cat*1e8;for(const [,r] of groups)score=score*15+(r+2);score=score*4+Math.max(...visible.map(c=>3-suitOf(c)));if(!best||score>best.score)best={seat:p.seat,score};}return best?.seat;}
  _resetRound(){this.currentBet=0;this.minRaise=this.bb;for(const p of this.players){p.betStreet=0;p.acted=false;}if(this.rules.family==='stud')this._cursor=this._studFirstToAct();else{const n=this.players.length;for(let k=1;k<=n;k++){const p=this.players[(this.button+k)%n];if(p.inHand&&!p.folded&&!p.allIn){this._cursor=p.seat;break;}}}this._turn=null;}
  replaceCards(seat,indexes=[]){const p=this.players[seat];if(!p||!p.inHand||p.folded)return[];const safe=[...new Set(indexes)].filter(i=>i>=0&&i<p.hole.length).sort((a,b)=>a-b).slice(0,3);const drawn=safe.map(()=>this.deck.pop());safe.forEach((idx,k)=>p.hole[idx]=drawn[k]);return drawn;}
  discardPineapple(seat,index){const p=this.players[seat];if(!p||p.hole.length!==3)return null;return p.hole.splice(Math.max(0,Math.min(2,index)),1)[0];}
  _autoCompleteSpecials(){if(this.rules.pineapple)this.players.filter(p=>p.inHand&&!p.folded&&p.hole.length===3).forEach(p=>this.discardPineapple(p.seat,this.suggestDiscards(p.seat,1)[0]||0));if(this.rules.draw)this.players.filter(p=>p.inHand&&!p.folded).forEach(p=>this.replaceCards(p.seat,this.suggestDiscards(p.seat,3)));}
  advance(){
    if(this._handOver)return null;this._collectBets();const remaining=this.players.filter(p=>p.inHand&&!p.folded);if(remaining.length===1){const w=remaining[0];w.stack+=this.pot;const res={type:'win',seat:w.seat,name:w.name,amount:this.pot,uncontested:true};this.pot=0;this._handOver=true;return res;}
    const nextIndex=this._streetIndex+1;if(nextIndex>=this.rules.streets.length){return this._showdown();}
    const [street,count]=this.rules.streets[nextIndex];this._streetIndex=nextIndex;this.street=street;const cards=[];const privateCards={};
    if(this.rules.family==='community'){for(let k=0;k<count;k++){const c=this.deck.pop();this.board.push(c);cards.push(c);}}
    else if(this.rules.family==='stud'){for(const p of this.players)if(p.inHand&&!p.folded){const c=this.deck.pop();p.hole.push(c);privateCards[p.seat]=[c];}}
    this._resetRound();
    return {type:'street',street,cards,privateCards,special:this.rules.draw?'draw':this.rules.pineapple&&street==='flop'?'pineapple':null};
  }
  scoreFor(seat){const p=this.players[seat];if(!p)return{high:-Infinity,low:null};if(this.rules.omaha)return omahaScores(p.hole,this.board);if(this.rules.lowball)return{high:deuceLowScore(p.hole),low:null};return{high:bestOf([...p.hole,...this.board]),low:null};}
  suggestDiscards(seat,max=3){const p=this.players[seat];if(!p)return[];if(this.rules.pineapple){let best=-Infinity,bestIdx=0;for(let i=0;i<p.hole.length;i++){const kept=p.hole.filter((_,k)=>k!==i);const score=this.board.length>=3?bestOf([...kept,...this.board]):kept.reduce((s,c)=>s+rankOf(c),0);if(score>best){best=score;bestIdx=i;}}return[bestIdx];}
    const ranks=p.hole.map(rankOf),counts={};ranks.forEach(r=>counts[r]=(counts[r]||0)+1);const keep=new Set();p.hole.forEach((c,i)=>{if(counts[rankOf(c)]>1)keep.add(i);});if(this.rules.lowball){p.hole.forEach((c,i)=>{if(rankOf(c)<=5&&!keep.has(i))keep.add(i);});}else{const suits={};p.hole.forEach((c,i)=>(suits[suitOf(c)]||=[]).push(i));Object.values(suits).forEach(ix=>{if(ix.length>=4)ix.forEach(i=>keep.add(i));});p.hole.forEach((c,i)=>{if(rankOf(c)>=10)keep.add(i);});}return p.hole.map((_,i)=>i).filter(i=>!keep.has(i)).slice(0,max);}
  _showdown(){const contrib=this.players.filter(p=>p.inHand&&p.betHand>0),levels=[...new Set(contrib.map(p=>p.betHand))].sort((a,b)=>a-b),pots=[];let prev=0;for(const lv of levels){let amount=0;const eligible=[];for(const p of contrib){amount+=Math.max(0,Math.min(p.betHand,lv)-prev);if(p.betHand>=lv&&!p.folded)eligible.push(p.seat);}if(amount>0)pots.push({amount,eligible});prev=lv;}
    const results=[];const pay=(amount,winners)=>{const share=Math.floor(amount/winners.length);let rem=amount-share*winners.length;winners.forEach(s=>{this.players[s].stack+=share+(rem-->0?1:0);});};
    for(const pot of pots){let best=-Infinity,winners=[];for(const s of pot.eligible){const score=this.scoreFor(s).high;if(score>best){best=score;winners=[s];}else if(score===best)winners.push(s);}const lowEligible=this.rules.hiLo?pot.eligible.filter(s=>this.scoreFor(s).low!==null):[];
      if(lowEligible.length){let lowBest=Infinity,lowW=[];for(const s of lowEligible){const score=this.scoreFor(s).low;if(score<lowBest){lowBest=score;lowW=[s];}else if(score===lowBest)lowW.push(s);}const highAmt=Math.ceil(pot.amount/2),lowAmt=pot.amount-highAmt;pay(highAmt,winners);pay(lowAmt,lowW);results.push({amount:highAmt,winners,desc:handDesc(best)+' high'},{amount:lowAmt,winners:lowW,desc:'8-or-better low'});
      }else{pay(pot.amount,winners);results.push({amount:pot.amount,winners,desc:this.rules.lowball?lowDesc(best):handDesc(best)});}}
    const hands={};for(const p of this.players)if(p.inHand&&!p.folded)hands[p.seat]=[...p.hole];this.pot=0;this._handOver=true;return{type:'showdown',pots:results,hands,board:[...this.board]};}
  estimateStrength(seat,sims=80){const p=this.players[seat];if(!p)return 0;const score=this.scoreFor(seat).high;const cat=this.rules.lowball?Math.max(0,Math.min(8,Math.floor((-score)/1e10))):Math.floor(score/1e12);let base=this.rules.lowball?(8-cat)/8:cat/8;if(this.rules.family==='community'&&this.board.length<3){const ranks=p.hole.map(rankOf),pairs=new Set(ranks).size<ranks.length;base=.24+(Math.max(...ranks)/12)*.30+(pairs ? .25 : 0);}if(this.rules.family==='draw'&&this.street==='pre-draw')base=Math.max(base,.25+(3-this.suggestDiscards(seat,3).length)*.2);return Math.max(.04,Math.min(.96,base));}
  snapshot(){return{street:this.street,button:this.button,pot:this.pot+this.players.reduce((s,p)=>s+p.betStreet,0),board:[...(this.board||[])],currentBet:this.currentBet,variant:this.variantId,players:this.players.map(p=>({seat:p.seat,name:p.name,isBot:p.isBot,stack:p.stack,bet:p.betStreet,folded:p.folded,allIn:p.allIn,inHand:p.inHand,sittingOut:p.sittingOut,holeCount:p.hole.length}))};}
}
export function handDesc(score){const cat=Math.floor(score/1e12);return CATEGORY[cat]||'high card';}
function lowDesc(score){const bad=Math.floor((-score)/1e10);return bad===0?'low hand':`${['low hand','one pair','two pair','trips','straight','flush','full house','quads','straight flush'][bad]||'low hand'} (low)`;}
export function handStrength(hole,board,sims=80){try{return Math.max(.05,Math.min(.95,Math.floor(evaluate7([...hole,...board]).score/1e12)/8));}catch{return .35;}}
