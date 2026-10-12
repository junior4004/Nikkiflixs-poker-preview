// assets/js/table3d.js
var TAU = Math.PI * 2;
var now = () => performance.now();
var clamp = (n) => Math.max(0, Math.min(1, n));
var ease = (t) => 1 - Math.pow(1 - clamp(t), 3);
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var SUITS = ["♠", "♥", "♦", "♣"];
var RANKS = "23456789TJQKA";

class PokerTable3D {
  constructor(mount) {
    this.mount = mount;
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-label", "Poker table in a dim lounge");
    mount.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.seats = Array.from({ length: 8 }, (_, i) => ({ name: `Seat ${i + 1}`, stack: 0, betAmount: 0, level: "Rookie", status: "", cards: [], photo: null, look: i, active: false, folded: false, gesture: null, bubble: null }));
    this.activeSeatCount = 8;
    this.boardCards = [];
    this.animations = [];
    this.potChips = [];
    this.tipTotal = 0;
    this.dealerSeat = -1;
    this.design = { w: 1000, h: 760 };
    this.nameplatesVisible = 1;
    this.nameplatesTarget = 1;
    this.handStrength = "";
    this.turnTimer = { active: false, remaining: 30, total: 30, warning: false };
    this.variantId = "holdem";
    this.viewerSeat = 0;
    // Evenly distributed around the existing locked camera: the hero starts the
    // counterclockwise shift toward the lower-right seat, closing that empty gap.
    this.seatPoints8 = [[640, 674], [307, 658], [115, 512], [115, 328], [307, 160], [693, 160], [885, 328], [885, 512]];
    this.seatPoints6 = [[500, 674], [231, 519], [231, 208], [500, 52], [769, 208], [769, 519]];
    this.seatPoints = this.seatPoints8;
    this.cardShiftX = 24;
    this.boardPoints = Array.from({ length: 5 }, (_, i) => ({ x: 310 + this.cardShiftX + i * 95, y: 392 }));
    this.boardShift = 0;
    this.tableArt = this._image("./assets/poker-real/table.png");
    this.dealerIcon = this._image("./assets/ui/dealer.png");
    this.dealerPortrait = this._image("./assets/poker-real/nikki-avatar.webp");
    this.dogSidekick = this._image("./assets/poker-real/dog-sidekick-table.png");
    this.cardSymbol = this._image("./assets/poker-real/nikkiflix-symbol.png");
    this.portraits = Array.from({ length: 16 }, (_, i) => this._image(`./assets/poker-real/avatar-${i + 1}.png`));
    this._resize = () => {
      const r = mount.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
      this.canvas.width = Math.max(1, r.width * d);
      this.canvas.height = Math.max(1, r.height * d);
      this.canvas.style.width = `${r.width}px`;
      this.canvas.style.height = `${r.height}px`;
      this.dpr = d;
      this.isPhone = r.width < 700;
      const widthFit = this.canvas.width / this.design.w, heightFit = this.canvas.height / this.design.h;
      this.s = this.isPhone ? Math.min(widthFit, heightFit) : Math.min(widthFit, heightFit) * 1.02;
      this.ox = (this.canvas.width - this.design.w * this.s) / 2;
      this.oy = (this.canvas.height - this.design.h * this.s) / 2;
    };
    addEventListener("resize", this._resize, { passive: true });
    this._resize();
    this.canvas.addEventListener("pointerup", (e) => this._pick(e));
    const tick = () => {
      this._update();
      this._draw();
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }
  _image(src) {
    const img = new Image;
    img.src = src;
    return img;
  }
  _pick(e) {
    const r = this.canvas.getBoundingClientRect(), x = ((e.clientX - r.left) * this.dpr - this.ox) / this.s, y = ((e.clientY - r.top) * this.dpr - this.oy) / this.s;
    let best = -1, dist = Infinity;
    this.seats.forEach((_, i) => {
      if (i >= this.activeSeatCount)
        return;
      const p = this._xy(i), d = Math.hypot(x - p.x, y - p.y);
      if (d < 72 && d < dist) {
        best = i;
        dist = d;
      }
    });
    if (best >= 0)
      window.dispatchEvent(new CustomEvent("nikkiflix:seat-tap", { detail: { seat: best } }));
  }
  _update() {
    const t = now();
    this.nameplatesVisible += Math.sign(this.nameplatesTarget - this.nameplatesVisible) * Math.min(Math.abs(this.nameplatesTarget - this.nameplatesVisible), 0.075);
    for (let i = this.animations.length - 1;i >= 0; i--) {
      const a = this.animations[i], p = clamp((t - a.start) / a.duration), chipMotion = ["bet", "allin", "win", "tip"].includes(a.kind);
      a.p = a.kind === "reaction" ? p : chipMotion ? p * p * (3 - 2 * p) : ease(p);
      if (a.kind === "boardShift")
        this.boardShift = a.from.x + (a.to.x - a.from.x) * a.p;
      if (p >= 1) {
        a.data?.onComplete?.();
        this.animations.splice(i, 1);
        a.done?.();
      }
    }
  }
  _anim(kind, from, to, duration = 520, data = {}) {
    const chipMotion = ["bet", "allin", "win", "tip"].includes(kind), calmDuration = this.isPhone && chipMotion ? Math.max(duration, kind === "win" ? 1400 : 1100) : this.isPhone && (kind === "deal" || kind === "fold") ? Math.max(duration, 300) : duration;
    return new Promise((resolve) => this.animations.push({ kind, from: { ...from }, to: { ...to }, duration: calmDuration, start: now(), p: 0, data, done: resolve }));
  }
  _xy(i) {
    const [x, y] = this.seatPoints[i] || this.seatPoints[0];
    return { x, y };
  }
  _usesWidePrivateLayout() {
    return this.variantId === "draw5" || this.variantId === "lowball" || this.variantId === "stud5" || this.variantId === "stud7";
  }
  _cardAnchor(i, k = 0, revealed = false, count = 2) {
    const sixCenters = [[500, 555], [335, 520], [285, 340], [610, 245], [715, 340], [665, 520]];
    const centers = this.activeSeatCount === 6 ? sixCenters : this._usesWidePrivateLayout() ? [[625, 565], [410, 570], [250, 470], [235, 345], [330, 245], [670, 245], [765, 345], [790, 470]] : [[625, 560], [410, 565], [250, 470], [235, 345], [330, 245], [670, 245], [765, 345], [790, 470]];
    const [cx, cy] = centers[i] || centers[0];
    // Keep the viewer's hand fully spread. Every opponent hand is one compact
    // overlapping fan whose outer cards sit lower, forming a clear arch.
    const isViewer = i === this.viewerSeat;
    const spacingScale = isViewer ? count <= 3 ? this.isPhone ? 1.28 : 1.08 : count <= 5 ? this.isPhone ? 0.91 : 0.82 : this.isPhone ? 0.72 : 0.68 : 1;
    const gap = isViewer ? 74 * spacingScale + 8 : count <= 2 ? 16 : count <= 4 ? 12 : count <= 5 ? 10 : 8;
    const offset = k - (count - 1) / 2;
    const radius = Math.max(1, (count - 1) / 2);
    const arch = isViewer ? 0 : Math.pow(offset / radius, 2) * (count <= 2 ? 2 : 9);
    return { x: cx + offset * gap, y: cy + arch };
  }
  _boardOffsetForCount(count) {
    const shown = Math.max(0, Math.min(5, count));
    return (5 - shown) * 44;
  }
  _boardAnchor(i, shift = this.boardShift) {
    // 88 design-pixel centers with 0.98-scale cards leaves a clear 15px gap.
    return { x: 324 + i * 88 + shift, y: this.activeSeatCount === 6 ? 420 : 392 };
  }
  _chipAnchor(i) {
    // Bet stacks live by their player on the inner rail, outside the card lane.
    const points = this.activeSeatCount === 6 ? [[850, 610], [330, 565], [270, 390], [675, 275], [730, 390], [670, 565]] : this._usesWidePrivateLayout() ? [[880, 630], [440, 625], [290, 535], [120, 360], [210, 190], [790, 190], [880, 360], [710, 535]] : [[880, 630], [440, 625], [290, 535], [120, 360], [210, 190], [790, 190], [880, 360], [710, 535]], [x, y] = points[i] || points[0];
    return { x, y };
  }
  _stackAnchor(i) {
    const points = this.activeSeatCount === 6 ? [[635, 650], [280, 585], [190, 350], [650, 175], [810, 350], [720, 585]] : this._usesWidePrivateLayout() ? [[850, 625], [420, 650], [165, 600], [150, 300], [260, 160], [740, 160], [850, 300], [835, 600]] : [[850, 625], [420, 650], [165, 600], [150, 300], [260, 160], [740, 160], [850, 300], [835, 600]], [x, y] = points[i] || points[0];
    return { x, y };
  }
  _dealerVisual() {
    return { x: 500, y: this.activeSeatCount === 6 ? 185 : 116 };
  }
  _dealer() {
    return { x: 500, y: 230 };
  }
  _deck() {
    return { x: 500, y: 248 };
  }
  _pot() {
    // Keep the pot just below the dealer-side gap so every thrown stack stays
    // visible without drifting into the community-card lane.
    return { x: 500, y: this.activeSeatCount === 6 ? 330 : 287 };
  }
  _draw() {
    const c = this.ctx, s = this.s;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._ambient(c);
    c.setTransform(s, 0, 0, s, this.ox, this.oy);
    this._paintedScene(c);
    this._seatChipStacks(c);
    this._cards(c);
    this._handStrength(c);
    this._chips(c);
    this._betAmounts(c);
    this._potReadout(c);
    this.seats.forEach((seat, i) => {
      if (i < this.activeSeatCount)
        this._seat(c, seat, i);
    });
    this._effects(c);
  }
  _ambient(c) {
    /* Keep the canvas transparent so the self-hosted painterly room remains visible while its decoded image is composited. */
  }
  _paintedScene(c) {
    const w = 1000, h = 760, img = this.tableArt;
    if (img?.complete && img.naturalWidth) {
      c.save();
      c.shadowColor = "rgba(0,0,0,.9)";
      c.shadowBlur = 32;
      c.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 54, 1000, 667);
      const vignette = c.createRadialGradient(500, 390, 115, 500, 390, 610);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(0.7, "rgba(0,0,0,.05)");
      vignette.addColorStop(1, "rgba(0,0,0,.72)");
      c.fillStyle = vignette;
      c.fillRect(0, 40, w, 700);
      c.restore();
    }
    this._drawTableEmblem(c);
    this._drawDealerDip(c);
    this._drawDealer(c);
  }
  _drawTableEmblem(c) {
    c.save();
    c.translate(500, 398);
    c.rotate(-0.19);
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    c.shadowColor = "rgba(23,3,8,.84)";
    c.shadowBlur = 10;
    c.shadowOffsetY = 3;
    const gold = c.createLinearGradient(0, -70, 0, 88);
    gold.addColorStop(0, "#fff4bd");
    gold.addColorStop(0.48, "#e4b64f");
    gold.addColorStop(1, "#925010");
    c.fillStyle = gold;
    c.strokeStyle = "rgba(255,246,204,.76)";
    c.lineWidth = 0.85;
    c.font = '400 132px "Nikkiflixs Spencerian"';
    c.strokeText("Nikkiflixs", 0, 22);
    c.fillText("Nikkiflixs", 0, 22);
    c.shadowBlur = 2;
    c.shadowOffsetY = 1;
    c.strokeStyle = "rgba(244,205,112,.9)";
    c.lineWidth = 1.8;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(-218, 18);
    c.bezierCurveTo(-293, 72, -322, 8, -260, -16);
    c.bezierCurveTo(-300, -45, -280, -75, -231, -48);
    c.moveTo(207, 33);
    c.bezierCurveTo(274, 12, 310, 43, 254, 61);
    c.stroke();
    c.fillStyle = "#f0cf7d";
    c.shadowColor = "rgba(28,5,10,.95)";
    c.shadowBlur = 4;
    c.font = '400 17px "Nikkiflixs Spencerian"';
    c.fillText("THEATER AND CASINO", 102, 56);
    c.font = '400 16px "Nikkiflixs Spencerian"';
    c.fillText("EST. 2026", 102, 75);
    c.restore();
  }
  _flatTableScene(c) {
    const w = 1000, h = 760, cx = 500, cy = 405;
    c.fillStyle = "#090809";
    c.fillRect(0, 0, w, h);
    const room = c.createRadialGradient(cx, cy, 80, cx, cy, 650);
    room.addColorStop(0, "#382414");
    room.addColorStop(0.58, "#17100d");
    room.addColorStop(1, "#050506");
    c.fillStyle = room;
    c.fillRect(0, 0, w, h);
    c.save();
    c.shadowColor = "rgba(0,0,0,.9)";
    c.shadowBlur = 34;
    c.beginPath();
    c.ellipse(cx, cy, 485, 292, 0, 0, TAU);
    c.fillStyle = "#1e0f09";
    c.fill();
    c.shadowBlur = 0;
    c.lineWidth = 22;
    c.strokeStyle = "#633016";
    c.stroke();
    c.lineWidth = 9;
    c.strokeStyle = "#c78132";
    c.stroke();
    c.beginPath();
    c.ellipse(cx, cy, 442, 248, 0, 0, TAU);
    const felt = c.createRadialGradient(cx, 360, 20, cx, cy, 450);
    felt.addColorStop(0, "#a52b3c");
    felt.addColorStop(0.72, "#691624");
    felt.addColorStop(1, "#3d0a14");
    c.fillStyle = felt;
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = "rgba(255,211,112,.65)";
    c.stroke();
    c.globalAlpha = 0.32;
    c.fillStyle = "#f2cd73";
    c.textAlign = "center";
    c.font = '400 74px "Great Vibes Regular","Brush Script MT","Segoe Script",cursive';
    c.fillText("Nikkiflixs", 500, 526);
    c.font = "700 10px Georgia";
    c.fillText("theater and casino", 500, 541);
    c.font = "700 22px Georgia";
    c.fillText("EST. 2026", 500, 555);
    c.globalAlpha = 1;
    c.restore();
    this._drawDealerDip(c);
    this._drawDogSidekick(c);
    this._drawDealer(c);
  }
  _drawDealerDip(c) {
    c.save();
    c.beginPath();
    c.ellipse(500, 198, 112, 68, 0, 0, TAU);
    const g = c.createRadialGradient(500, 176, 8, 500, 198, 118);
    g.addColorStop(0, "#080707");
    g.addColorStop(1, "#271309");
    c.fillStyle = g;
    c.fill();
    c.beginPath();
    c.ellipse(500, 201, 118, 72, 0, 0.06 * Math.PI, 0.94 * Math.PI);
    c.strokeStyle = "#e0a84b";
    c.lineWidth = 9;
    c.shadowColor = "rgba(0,0,0,.9)";
    c.shadowBlur = 12;
    c.stroke();
    c.restore();
  }
  _drawDogSidekick(c) {
    if (!this.dogSidekick?.complete || !this.dogSidekick.naturalWidth)
      return;
    const w = 72, h = 78, x = 590, y = 82, img = this.dogSidekick;
    c.save();
    c.shadowColor = "rgba(0,0,0,.72)";
    c.shadowBlur = 15;
    c.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, x, y, w, h);
    c.shadowBlur = 0;
    this._round(c, x, y, w, h, 20);
    c.strokeStyle = "rgba(224,168,66,.82)";
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  }
  _potReadout(c) {
    if (!this.potChips.length)
      return;
    const amount = this.seats.reduce((sum, s) => sum + (s.betAmount || 0), 0), p = this._pot();
    c.save();
    const label = `POT ${amount.toLocaleString()}`;
    c.font = '900 16px "Avenir Next",sans-serif';
    const w = Math.max(102, c.measureText(label).width + 24);
    this._round(c, p.x - w / 2, p.y - 27, w, 28, 10);
    c.fillStyle = "rgba(8,8,9,.96)";
    c.fill();
    c.strokeStyle = "#e1ad4e";
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = "#fff7df";
    c.textAlign = "center";
    c.fillText(label, p.x, p.y - 8);
    c.restore();
  }
  _drawDealer(c) {
    const { x, y } = this._dealerVisual(), r = 76, img = this.dealerPortrait;
    c.save();
    c.shadowColor = "rgba(0,0,0,.82)";
    c.shadowBlur = 22;
    c.beginPath();
    c.arc(x, y - 3, r + 4, 0, TAU);
    c.fillStyle = "#140c0b";
    c.fill();
    c.shadowBlur = 0;
    c.beginPath();
    c.arc(x, y - 3, r, 0, TAU);
    c.clip();
    if (img?.complete && img.naturalWidth) {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      c.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, x - r, y - 3 - r, r * 2, r * 2);
    } else {
      c.fillStyle = "#29221d";
      c.fillRect(x - r, y - 3 - r, r * 2, r * 2);
    }
    c.restore();
    c.save();
    c.beginPath();
    c.arc(x, y - 3, r + 2, 0, TAU);
    c.strokeStyle = "#f1c35e";
    c.lineWidth = 4;
    c.stroke();
    const labelY = y + 74;
    this._round(c, x - 67, labelY, 134, 29, 9);
    c.fillStyle = "rgba(9,8,8,.97)";
    c.fill();
    c.strokeStyle = "#e0a842";
    c.lineWidth = 1.5;
    c.stroke();
    c.fillStyle = "#fff6df";
    c.textAlign = "center";
    c.font = '900 15px "Avenir Next",sans-serif';
    c.fillText("NIKKI · DEALER", x, labelY + 20);
    c.restore();
  }
  _round(c, x, y, w, h, r) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
  }
  _plateAnchor(i) {
    // Keep every plate close to its player without covering the portrait.
    // The six-max arrangement deliberately leaves a clear outside pocket beside
    // every portrait for the future table-talk control.
    const sixPoints = [[620, 650], [0, 588], [0, 202], [180, 24], [744, 202], [744, 588]];
    const phonePoints = [[512, 726], [179, 710], [0, 564], [0, 192], [120, 24], [624, 24], [744, 192], [744, 564]];
    const desktopPoints = [[744, 650], [-6, 642], [0, 564], [0, 192], [120, 24], [624, 24], [744, 192], [744, 564]];
    const points = this.activeSeatCount === 6 ? sixPoints : this.isPhone ? phonePoints : desktopPoints;
    const [oldX, oldY] = points[i] || points[0], w = 210, h = 68;
    // Keep the locked placard centers unchanged while reducing their footprint.
    return { x: oldX + (256 - w) / 2, y: oldY + (84 - h) / 2, w, h };
  }
  _actionAnchor(i) {
    const points = this.activeSeatCount === 6 ? [[620, 610], [315, 525], [245, 300], [620, 130], [755, 300], [685, 525]] : [[800, 610], [440, 610], [145, 485], [145, 375], [260, 180], [740, 180], [855, 375], [855, 485]], [x, y] = points[i] || points[0];
    return { x, y };
  }
  _seat(c, seat, i) {
    let { x, y } = this._xy(i), scale = 1, rot = 0;
    if (seat.gesture) {
      const t = clamp((now() - seat.gesture.start) / seat.gesture.duration), env = Math.sin(Math.PI * t), n = seat.gesture.name;
      if (n === "laugh") {
        y -= Math.abs(Math.sin(t * Math.PI * 7)) * 5 * env;
        x += Math.sin(t * Math.PI * 14) * 2.5 * env;
        scale = 1 + env * 0.04;
      } else if (n === "angry")
        x += Math.sin(t * Math.PI * 18) * 4 * env;
      else if (n === "cry")
        scale = 1 - env * 0.025;
      else if (n === "surprised") {
        scale = 1 + Math.sin(Math.min(1, t * 2.8) * Math.PI) * 0.075;
        rot = Math.sin(t * Math.PI * 7) * 0.025 * env;
      } else if (n === "doze") {
        y += Math.max(0, Math.sin(t * Math.PI * 4)) * 7 * env;
        rot = 0.055 * env;
      } else if (n === "knock") {
        const p = this._pot(), vx = p.x - x, vy = p.y - y, l = Math.hypot(vx, vy);
        x += vx / l * 13 * env;
        y += vy / l * 13 * env;
      }
      if (t >= 1)
        seat.gesture = null;
    }
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.scale(scale, scale);
    const halo = c.createRadialGradient(0, 0, 18, 0, 0, 76);
    halo.addColorStop(0, "rgba(255,205,126,.26)");
    halo.addColorStop(0.62, "rgba(255,169,75,.10)");
    halo.addColorStop(1, "rgba(255,145,48,0)");
    c.fillStyle = halo;
    c.beginPath();
    c.arc(0, 0, 76, 0, TAU);
    c.fill();
    if (seat.active) {
      c.shadowColor = "#ffd56c";
      c.shadowBlur = 22;
      c.strokeStyle = "rgba(255,229,157,.45)";
      c.lineWidth = 5;
      c.beginPath();
      c.arc(0, 0, 59, 0, TAU);
      c.stroke();
      if (this.turnTimer.active) {
        const warning = Boolean(this.turnTimer.warning), phaseTotal = warning ? 10 : 20, phaseRemaining = warning ? this.turnTimer.remaining : Math.max(0, this.turnTimer.remaining - 10), progress = clamp(1 - phaseRemaining / phaseTotal);
        c.shadowBlur = 9;
        c.shadowColor = warning ? "#ff344e" : "#4ef08b";
        c.strokeStyle = warning ? "#ef304a" : "#42df7d";
        c.lineWidth = 8;
        c.lineCap = "round";
        c.beginPath();
        c.arc(0, 0, 61, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
        c.stroke();
        c.lineCap = "butt";
      }
    }
    this._portrait(c, seat, i);
    c.restore();
    const plate = this._plateAnchor(i), plateX = plate.x, plateY = plate.y, plateCx = plateX + plate.w / 2;
    c.save();
    c.globalAlpha = this.nameplatesVisible;
    c.textAlign = "center";
    c.shadowColor = "rgba(0,0,0,.82)";
    c.shadowBlur = 14;
    this._round(c, plateX, plateY, plate.w, plate.h, 10);
    const pg = c.createLinearGradient(0, plateY, 0, plateY + plate.h);
    pg.addColorStop(0, "rgba(34,31,30,.99)");
    pg.addColorStop(1, "rgba(8,8,9,.99)");
    c.fillStyle = pg;
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = seat.active ? "#ffe29a" : "rgba(222,169,77,.95)";
    c.lineWidth = 1.5;
    c.stroke();
    const compactPlate = this.activeSeatCount === 6;
    c.fillStyle = "#fffdf4";
    c.font = `900 ${compactPlate ? this.isPhone ? 34 : 30 : this.isPhone ? 32 : 27}px "Avenir Next",sans-serif`;
    c.fillText(String(seat.name || "Player").slice(0, 10), plateCx, plateY + 29);
    c.fillStyle = "#ffd36f";
    c.font = `900 ${compactPlate ? this.isPhone ? 19 : 17 : this.isPhone ? 18 : 16}px "Avenir Next",sans-serif`;
    c.fillText(`${Number(seat.stack).toLocaleString()} GC`, plateCx, plateY + 55, plate.w - 16);
    if (i === this.dealerSeat) {
      const dx = plateX + plate.w - 20, g = c.createRadialGradient(dx, plateY + 3, 2, dx, plateY + 3, 12);
      g.addColorStop(0, "#fff9d0");
      g.addColorStop(1, "#d39b31");
      c.fillStyle = g;
      c.beginPath();
      c.arc(dx, plateY + 3, 12, 0, TAU);
      c.fill();
      c.strokeStyle = "#fff1b5";
      c.stroke();
      if (this.dealerIcon?.complete && this.dealerIcon.naturalWidth)
        c.drawImage(this.dealerIcon, dx - 8, plateY - 5, 16, 16);
      c.fillStyle = "#251507";
      c.font = "900 9px Georgia";
      c.fillText("D", dx, plateY + 7);
    }
    c.restore();
    if (seat.actionBadge) {
      c.save();
      c.font = '900 15px "Avenir Next",sans-serif';
      const label = seat.actionBadge, w = Math.max(68, c.measureText(label).width + 26), badge = this._actionAnchor(i);
      this._round(c, badge.x - w / 2, badge.y - 15, w, 30, 10);
      c.fillStyle = label === "FOLD" ? "#731a27" : label === "ALL-IN" ? "#b51f30" : "#9a6511";
      c.fill();
      c.strokeStyle = "#ffe08a";
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = "#fff";
      c.textAlign = "center";
      c.font = '900 15px "Avenir Next",sans-serif';
      c.fillText(label, badge.x, badge.y + 5);
      c.restore();
    }
    if (seat.bubble && now() < seat.bubble.until) {
      c.save();
      this._round(c, x - 70, y - 94, 140, 34, 11);
      c.fillStyle = "rgba(15,13,13,.95)";
      c.fill();
      c.strokeStyle = "#d8a94c";
      c.stroke();
      c.fillStyle = "#fff8ea";
      c.textAlign = "center";
      c.font = "700 11px sans-serif";
      c.fillText(seat.bubble.text.slice(0, 24), x, y - 72);
      c.restore();
    }
    if (seat.gesture && seat.gesture.name !== "knock")
      this._drawGestureReaction(c, seat.gesture, i);
  }
  _drawGestureReaction(c, gesture, i) {
    const t = clamp((now() - gesture.start) / gesture.duration), type = gesture.name, anchor = this._xy(i), fade = t < 0.73 ? 1 : Math.max(0, (1 - t) / 0.27), enter = Math.min(1, t / 0.13);
    const glyphs = { laugh: "😂", angry: "😡", cry: "😭", surprised: "😲", doze: "😴" };
    let dx = 0, dy = 0, scale = 0.32 + 0.68 * (1 - Math.pow(1 - enter, 3)), rotation = 0;
    if (type === "laugh") {
      dx = Math.sin(t * Math.PI * 16) * 5 * fade;
      dy = -Math.abs(Math.sin(t * Math.PI * 7)) * 12;
      scale *= 1 + Math.abs(Math.sin(t * Math.PI * 7)) * 0.08;
    } else if (type === "angry") {
      dx = Math.sin(t * Math.PI * 22) * 7 * fade;
      scale *= 1 + Math.sin(t * Math.PI * 6) * 0.045;
    } else if (type === "cry") {
      dy = Math.sin(t * Math.PI * 3) * 3;
    } else if (type === "surprised") {
      rotation = Math.sin(t * Math.PI * 9) * 0.09 * fade;
      scale *= 1 + Math.sin(Math.min(1, t / 0.24) * Math.PI) * 0.28;
    } else if (type === "doze") {
      dy = Math.sin(t * Math.PI * 3) * 5;
      rotation = -0.08;
    }
    c.save();
    c.globalAlpha = fade;
    c.translate(anchor.x + dx, anchor.y - 116 + dy);
    c.rotate(rotation);
    c.scale(scale, scale);
    const glow = c.createRadialGradient(0, 0, 8, 0, 0, 62);
    glow.addColorStop(0, type === "angry" ? "rgba(255,72,67,.58)" : "rgba(255,224,131,.42)");
    glow.addColorStop(1, "rgba(255,180,80,0)");
    c.fillStyle = glow;
    c.beginPath();
    c.arc(0, 0, 62, 0, TAU);
    c.fill();
    if (type === "angry") {
      c.strokeStyle = `rgba(255,65,64,${0.65 * fade})`;
      c.lineWidth = 7;
      c.beginPath();
      c.arc(0, 0, 57 + Math.sin(t * Math.PI * 8) * 7, 0, TAU);
      c.stroke();
    }
    c.shadowColor = "rgba(0,0,0,.82)";
    c.shadowBlur = 18;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = '156px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    c.fillText(glyphs[type] || "🙂", 0, 2);
    c.shadowBlur = 0;
    if (type === "cry") {
      for (let n = 0; n < 5; n++) {
        const fall = (t * 2.25 + n * 0.19) % 1, tx = (n % 2 ? 1 : -1) * (22 + n * 4), ty = 28 + fall * 82;
        c.globalAlpha = fade * (1 - fall * 0.55);
        c.fillStyle = "#62c8ff";
        c.beginPath();
        c.ellipse(tx, ty, 7, 13, 0, 0, TAU);
        c.fill();
      }
    }
    c.restore();
  }
  _portrait(c, seat, i) {
    c.save();
    c.shadowColor = "rgba(0,0,0,.82)";
    c.shadowBlur = 18;
    c.beginPath();
    c.arc(0, 0, 52, 0, TAU);
    c.fillStyle = "#0d0d0e";
    c.fill();
    c.shadowBlur = 0;
    c.beginPath();
    c.arc(0, 0, 49, 0, TAU);
    c.clip();
    const portrait = this.portraits[Math.max(0, Math.min(this.portraits.length - 1, Number(seat.look) || 0))];
    const img = seat.photo?.complete ? seat.photo : portrait;
    if (img?.complete && img.naturalWidth) {
      const { naturalWidth: sw, naturalHeight: sh } = img, side = Math.min(sw, sh);
      c.drawImage(img, (sw - side) / 2, (sh - side) / 2, side, side, -49, -49, 98, 98);
    } else {
      c.fillStyle = "#29221d";
      c.fillRect(-49, -49, 98, 98);
    }
    c.restore();
    c.strokeStyle = seat.folded ? "rgba(131,124,120,.8)" : "#e2b65d";
    c.lineWidth = 4;
    c.beginPath();
    c.arc(0, 0, 52, 0, TAU);
    c.stroke();
    c.strokeStyle = "rgba(255,240,193,.72)";
    c.lineWidth = 1;
    c.beginPath();
    c.arc(0, 0, 48, 0, TAU);
    c.stroke();
    if (seat.folded) {
      c.fillStyle = "rgba(8,8,9,.58)";
      c.beginPath();
      c.arc(0, 0, 49, 0, TAU);
      c.fill();
    }
  }
  _holeScale(i, revealed = false, count = 2) {
    if (i === this.viewerSeat)
      return count <= 3 ? this.isPhone ? 1.28 : 1.08 : count <= 5 ? this.isPhone ? 0.91 : 0.82 : this.isPhone ? 0.72 : 0.68;
    return count <= 3 ? 0.58 : count <= 5 ? 0.48 : 0.38;
  }
  _boardScale() {
    // Clear gaps at every street: 74 × .98 = 72.5 within 88px centers.
    return 0.98;
  }
  _cards(c) {
    this.boardCards.forEach((card, i) => {
      const p = this._boardAnchor(i);
      this._drawCard(c, p.x, p.y, card, false, this._boardScale());
    });
    this.seats.forEach((s, i) => s.cards.forEach((card, k) => {
      if (i >= this.activeSeatCount || !card)
        return;
      const revealed = Boolean(card.revealed), count = s.cards.length || 2, p = this._cardAnchor(i, k, revealed, count), offset = k - (count - 1) / 2, fanRotation = count <= 2 ? 0.16 : count <= 5 ? 0.11 : 0.085, drawCard = i === this.viewerSeat ? card : { ...card, rot: offset * fanRotation };
      this._drawCard(c, p.x, p.y, drawCard, card.faceDown, this._holeScale(i, revealed, count));
    }));
  }
  _handStrength(c) {
    if (!this.handStrength)
      return;
    const p = this._usesWidePrivateLayout() ? { x: 500, y: 500 } : { x: 500, y: 646 };
    c.save();
    const w = Math.max(98, c.measureText(this.handStrength).width + 30);
    this._round(c, p.x - w / 2, p.y, w, 30, 10);
    c.fillStyle = "rgba(8,8,9,.96)";
    c.fill();
    c.strokeStyle = "#e7b74e";
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = "#fff8e5";
    c.textAlign = "center";
    c.font = '900 15px "Avenir Next",sans-serif';
    c.fillText(this.handStrength, p.x, p.y + 21);
    c.restore();
  }
  _drawCard(c, x, y, card, back = false, scale = 1) {
    const w = 74 * scale, h = 104 * scale;
    c.save();
    c.translate(x, y);
    c.rotate(card.rot || 0);
    c.shadowColor = "rgba(0,0,0,.52)";
    c.shadowBlur = 7;
    c.shadowOffsetY = 3;
    this._round(c, -w / 2, -h / 2, w, h, 5 * scale);
    if (back) {
      const g = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      g.addColorStop(0, "#bc1634");
      g.addColorStop(0.5, "#15080d");
      g.addColorStop(1, "#e8e3dc");
      c.fillStyle = g;
      c.fill();
      c.shadowBlur = 0;
      c.strokeStyle = "#fff9ef";
      c.lineWidth = 2;
      c.stroke();
      c.strokeStyle = "rgba(255,255,255,.35)";
      c.lineWidth = 0.8;
      c.strokeRect(-w / 2 + 4 * scale, -h / 2 + 4 * scale, w - 8 * scale, h - 8 * scale);
      if (this.cardSymbol?.complete && this.cardSymbol.naturalWidth) {
        c.save();
        c.globalAlpha = 0.18;
        c.drawImage(this.cardSymbol, 0, 390, this.cardSymbol.naturalWidth, 950, -w / 2 + 5 * scale, -h / 2 + 6 * scale, w - 10 * scale, h - 12 * scale);
        c.restore();
        const veil = c.createLinearGradient(0, -h * 0.18, 0, h * 0.3);
        veil.addColorStop(0, "rgba(12,6,9,.15)");
        veil.addColorStop(0.55, "rgba(12,6,9,.72)");
        veil.addColorStop(1, "rgba(12,6,9,.24)");
        c.fillStyle = veil;
        c.fillRect(-w / 2 + 5 * scale, -h * 0.18, w - 10 * scale, h * 0.48);
      }
      c.fillStyle = "#fff";
      c.textAlign = "center";
      c.font = `900 ${18 * scale}px Georgia`;
      c.fillText("NF", 0, -4 * scale);
      c.fillStyle = "#f1c86f";
      c.font = `italic ${7.2 * scale}px cursive`;
      c.fillText("Nikkiflixs", 0, 10 * scale);
      c.fillStyle = "#fff7e7";
      c.font = `700 ${5.2 * scale}px sans-serif`;
      c.fillText("EST. 2026", 0, 19 * scale);
    } else {
      c.shadowColor = "rgba(255,248,216,.95)";
      c.shadowBlur = 16;
      c.fillStyle = "#ffffff";
      c.fill();
      c.shadowBlur = 0;
      c.shadowOffsetY = 0;
      c.strokeStyle = "#d8d0c5";
      c.lineWidth = 1;
      c.stroke();
      this._pips(c, card.rank, card.suit, w, h, scale);
    }
    c.restore();
  }
  _pips(c, rank, suit, w, h, s) {
    const red = suit === 1 || suit === 2, sym = SUITS[suit] || "♠", r = rank === 8 ? "10" : RANKS[rank] || "A";
    c.fillStyle = red ? "#bd1f36" : "#151419";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `900 ${r === "10" ? 24 * s : 29 * s}px Georgia`;
    c.fillText(r, -w * 0.27, -h * 0.31);
    c.font = `${50 * s}px Georgia`;
    c.fillText(sym, 0, h * 0.08);
    c.textBaseline = "alphabetic";
  }
  _chip(c, x, y, color, index = 0, scale = 1, denomination = "") {
    const yy = y - index * 4.2 * scale;
    c.save();
    c.shadowColor = "rgba(0,0,0,.58)";
    c.shadowBlur = 3 * scale;
    c.shadowOffsetY = 2 * scale;
    const edge = c.createLinearGradient(x, yy - 6 * scale, x, yy + 6 * scale);
    edge.addColorStop(0, "#fff2c4");
    edge.addColorStop(0.18, color);
    edge.addColorStop(0.7, color);
    edge.addColorStop(1, "#171313");
    c.fillStyle = edge;
    c.beginPath();
    c.ellipse(x, yy, 13 * scale, 6.3 * scale, 0, 0, TAU);
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = "rgba(255,255,255,.9)";
    c.lineWidth = 1.2 * scale;
    c.setLineDash([3.2 * scale, 2.2 * scale]);
    c.stroke();
    c.setLineDash([]);
    c.beginPath();
    c.ellipse(x, yy, 7.2 * scale, 3.5 * scale, 0, 0, TAU);
    c.fillStyle = "rgba(245,222,168,.9)";
    c.fill();
    c.strokeStyle = "rgba(63,32,18,.66)";
    c.lineWidth = 0.8 * scale;
    c.stroke();
    if (denomination && index === 0 && scale >= 0.62) {
      c.fillStyle = "#271509";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = `900 ${5.8 * scale}px Georgia,serif`;
      c.fillText(denomination, x, yy + 0.4 * scale);
      c.textBaseline = "alphabetic";
    }
    c.restore();
  }
  _paintedChipStack(c, x, y, color, denomination, layers = 5, scale = 1) {
    for (let k = 0;k < layers; k++)
      this._chip(c, x, y, color, layers - 1 - k, scale, k === layers - 1 ? denomination : "");
  }
  _seatChipStacks(c) {
    const colors = ["#b92337", "#266fab", "#24252b", "#d6a52b"], labels = ["25", "100", "500", "1K"];
    this.seats.forEach((seat, i) => {
      if (i >= this.activeSeatCount)
        return;
      const p = this._stackAnchor(i), base = Math.max(3, Math.min(7, Math.ceil(Math.log10(Math.max(10, Number(seat.stack) || 10)))));
      c.save();
      c.globalAlpha = seat.folded ? 0.52 : 0.98;
      for (let col = 0;col < 3; col++) {
        const spread = (col - 1) * 18;
        this._paintedChipStack(c, p.x + spread, p.y + Math.abs(col - 1) * 2, colors[(i + col) % colors.length], labels[(i + col) % labels.length], Math.max(3, base - Math.abs(col - 1)), 0.72);
      }
      c.restore();
    });
  }
  _chips(c) {
    if (!this.potChips.length)
      return;
    const win = this.animations.find((a) => a.kind === "win"), p = this._pot(), count = Math.max(4, Math.min(9, this.potChips.length));
    c.save();
    c.globalAlpha = win ? Math.max(0, 1 - win.p) : 1;
    this._paintedChipStack(c, p.x - 24, p.y + 16, "#b92337", "25", Math.max(4, count - 2), 0.72);
    this._paintedChipStack(c, p.x, p.y + 12, "#256fa9", "100", count, 0.72);
    this._paintedChipStack(c, p.x + 24, p.y + 16, "#202127", "500", Math.max(4, count - 1), 0.72);
    c.restore();
  }
  _betAmounts(c) {
    this.seats.forEach((seat, i) => {
      if (i >= this.activeSeatCount || !seat.betAmount)
        return;
      const p = this._chipAnchor(i), colors = ["#b92337", "#256fa9", "#202127"], labels = ["25", "100", "500"], amount = Number(seat.betAmount), remaining = Math.max(0, Number(seat.stack) || 0), allIn = remaining === 0, fraction = amount / Math.max(1, amount + remaining);
      let stacks;
      if (allIn)
        stacks = [{ x: -22, layers: 6 }, { x: 0, layers: 9 }, { x: 22, layers: 6 }];
      else if (fraction <= 0.08)
        stacks = [{ x: 0, layers: 3 }];
      else
        stacks = [{ x: -10, layers: 4 }, { x: 10, layers: 6 }];
      stacks.forEach((stack, k) => this._paintedChipStack(c, p.x + stack.x, p.y - 5 + Math.abs(stack.x) * 0.08, colors[k % colors.length], labels[k % labels.length], stack.layers, 0.78));
      c.font = '900 18px "Avenir Next",sans-serif';
      const label = amount.toLocaleString(), w = Math.max(66, c.measureText(label).width + 26);
      c.save();
      this._round(c, p.x - w / 2, p.y + 9, w, 31, 10);
      c.fillStyle = "rgba(8,8,9,.96)";
      c.fill();
      c.strokeStyle = "#f1c45f";
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = "#fff8df";
      c.textAlign = "center";
      c.font = '900 18px "Avenir Next",sans-serif';
      c.fillText(label, p.x, p.y + 31);
      c.restore();
    });
  }
  _drawThrowableIcon(c, type, size, impact = false) {
    const emoji = { smile: "🙂", heart: "♥", laugh: "😂", down: "👎", fish: "🐟", chicken: "🐔", beer: "🍻", fire: "🔥", target: "🎯", crown: "👑", moneybag: "💰" };
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.shadowColor = "rgba(0,0,0,.88)";
    c.shadowBlur = 14;
    if (type === "tomato") {
      const g = c.createRadialGradient(-size * 0.2, -size * 0.23, 2, 0, 0, size * 0.48);
      g.addColorStop(0, "#ff9c72");
      g.addColorStop(0.38, "#ed413b");
      g.addColorStop(1, "#88141d");
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(0, impact ? size * 0.06 : 0, size * 0.46, impact ? size * 0.27 : size * 0.43, 0, 0, TAU);
      c.fill();
      c.shadowBlur = 0;
      c.fillStyle = "#4d9b43";
      c.beginPath();
      for (let n = 0; n < 10; n++) {
        const a = -Math.PI / 2 + n * Math.PI / 5, r = n % 2 ? size * 0.11 : size * 0.29;
        const px = Math.cos(a) * r, py = -size * 0.34 + Math.sin(a) * r * 0.48;
        n ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.closePath();
      c.fill();
    } else if (type === "poop") {
      c.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      c.fillStyle = "#fff";
      c.fillText("\u{1F4A9}", 0, 2);
    } else if (type === "money") {
      c.shadowColor = "rgba(35,255,117,.52)";
      c.shadowBlur = 18;
      c.fillStyle = "#77f09b";
      c.strokeStyle = "#103c20";
      c.lineWidth = 4;
      c.font = `950 ${size * 0.72}px "Avenir Next",sans-serif`;
      c.strokeText("$$$", 0, 0);
      c.fillText("$$$", 0, 0);
    } else if (type === "justfold") {
      this._round(c, -size * 0.62, -size * 0.34, size * 1.24, size * 0.68, 10);
      c.fillStyle = "#241021";
      c.fill();
      c.strokeStyle = "#fff36c";
      c.lineWidth = 4;
      c.stroke();
      c.shadowColor = "#ff2de3";
      c.shadowBlur = 15;
      c.fillStyle = "#fff9a1";
      c.font = `950 ${size * 0.31}px sans-serif`;
      c.fillText("JUST FOLD", 0, 1);
    } else if (["crossbow", "handgun", "machinegun", "cannon"].includes(type)) {
      const label = { crossbow: "CROSSBOW", handgun: "BANG!", machinegun: "RAT-A-TAT", cannon: "BOOM!" }[type];
      const hue = type === "cannon" ? "#ff9b45" : type === "machinegun" ? "#ffcf62" : "#f3ddb0";
      c.shadowColor = "rgba(255,97,39,.72)";
      c.shadowBlur = 20;
      c.fillStyle = hue;
      c.strokeStyle = "#47160d";
      c.lineWidth = 5;
      c.font = `950 ${size * (type === "machinegun" || type === "crossbow" ? 0.3 : 0.42)}px sans-serif`;
      c.strokeText(label, 0, 0);
      c.fillText(label, 0, 0);
    } else {
      c.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      c.fillStyle = type === "heart" ? "#ff4f69" : "#fff";
      c.fillText(emoji[type] || "!", 0, 2);
    }
    c.restore();
  }
  _drawThrownReaction(c, a) {
    const p = a.p, flightEnd = 0.43, type = a.data.type || "smile", baseSize = this.isPhone ? 156 : 128;
    if (p < flightEnd) {
      const ft = p / flightEnd, travel = ft * ft * (3 - 2 * ft), x = a.from.x + (a.to.x - a.from.x) * travel, y = a.from.y + (a.to.y - a.from.y) * travel - Math.sin(Math.PI * ft) * 155;
      c.save();
      c.translate(x, y - 24);
      c.rotate(Math.sin(ft * Math.PI * 2) * 0.16);
      c.globalAlpha = Math.min(1, ft * 5);
      c.strokeStyle = "rgba(255,224,146,.42)";
      c.lineWidth = 7;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(-baseSize * 0.74, 18);
      c.lineTo(-baseSize * 0.48, 9);
      c.stroke();
      this._drawThrowableIcon(c, type, baseSize, false);
      c.restore();
      return;
    }
    const hit = (p - flightEnd) / (1 - flightEnd), burst = Math.min(1, hit / 0.16), fade = hit < 0.7 ? 1 : Math.max(0, (1 - hit) / 0.3), hardImpact = ["target", "crown", "justfold", "crossbow", "handgun", "machinegun", "cannon"].includes(type);
    c.save();
    c.translate(a.to.x, a.to.y - 20);
    if (!hardImpact) {
      const splatPalette = {
        smile: ["#f2c84b", "#9a6815", "rgba(255,245,158,.72)"],
        heart: ["#e52f53", "#881329", "rgba(255,133,158,.72)"],
        tomato: ["#d92332", "#8d101d", "rgba(255,121,91,.72)"],
        down: ["#3f75bb", "#1d3968", "rgba(142,197,255,.68)"],
        poop: ["#5a2c1d", "#2d130d", "rgba(180,105,67,.58)"],
        fish: ["#4ea6af", "#1c5360", "rgba(160,239,239,.68)"],
        chicken: ["#e9a43a", "#8d4b17", "rgba(255,222,142,.7)"],
        beer: ["#d89422", "#77410d", "rgba(255,234,158,.76)"],
        fire: ["#ef6f28", "#74260f", "rgba(255,211,78,.72)"],
        money: ["#4fbf72", "#176238", "rgba(166,255,190,.7)"],
        moneybag: ["#d4a62f", "#6f4a10", "rgba(255,231,139,.72)"]
      };
      const palette = splatPalette[type] || ["#d19a43", "#684015", "rgba(255,229,153,.68)"], mainColor = palette[0], edgeColor = palette[1], shineColor = palette[2], spread = 0.16 + 0.84 * (1 - Math.pow(1 - burst, 3));
      c.globalAlpha = fade;
      c.save();
      c.scale(spread * 1.18, spread * 0.78);
      c.beginPath();
      for (let n = 0; n < 32; n++) {
        const angle = n / 32 * TAU, spoke = n % 4 === 0, radius = baseSize * (spoke ? 0.58 + n % 7 * 0.018 : 0.34 + n % 3 * 0.028), x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
        n ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.closePath();
      c.fillStyle = mainColor;
      c.shadowColor = "rgba(0,0,0,.62)";
      c.shadowBlur = 13;
      c.fill();
      c.shadowBlur = 0;
      c.strokeStyle = edgeColor;
      c.lineWidth = 4;
      c.stroke();
      const wet = c.createRadialGradient(-baseSize * 0.12, -baseSize * 0.1, 2, 0, 0, baseSize * 0.43);
      wet.addColorStop(0, shineColor);
      wet.addColorStop(0.5, "rgba(255,255,255,.08)");
      wet.addColorStop(1, "rgba(0,0,0,.18)");
      c.fillStyle = wet;
      c.beginPath();
      c.ellipse(0, 0, baseSize * 0.35, baseSize * 0.27, -0.12, 0, TAU);
      c.fill();
      c.restore();
      const particleTravel = 1 - Math.pow(1 - Math.min(1, hit / 0.38), 3);
      for (let n = 0; n < 22; n++) {
        const angle = n * 2.399 + type.length * 0.31, maxDistance = baseSize * (0.46 + n % 5 * 0.115), distance = baseSize * 0.08 + maxDistance * particleTravel, radius = baseSize * (0.027 + n % 3 * 0.012) * (1 - particleTravel * 0.42), px = Math.cos(angle) * distance, py = Math.sin(angle) * distance * 0.72;
        c.globalAlpha = fade * (1 - particleTravel * 0.34);
        c.fillStyle = n % 4 === 0 ? edgeColor : mainColor;
        c.beginPath();
        c.ellipse(px, py, radius * 1.35, radius, angle, 0, TAU);
        c.fill();
      }
      if (hit < 0.13) {
        const squash = hit / 0.13;
        c.globalAlpha = 1 - squash;
        c.scale(1 + squash * 0.42, Math.max(0.16, 1 - squash * 0.84));
        this._drawThrowableIcon(c, type, baseSize * 1.08, true);
      }
    } else {
      const breakProgress = 1 - Math.pow(1 - Math.min(1, hit / 0.42), 3), weapon = ["crossbow", "handgun", "machinegun", "cannon"].includes(type), fragmentColors = weapon ? ["#f8d47a", "#b75a2b", "#3a241b"] : type === "crown" ? ["#ffe57a", "#c79620", "#784d0d"] : type === "target" ? ["#f4f1e8", "#d9343e", "#1c2731"] : ["#fff36c", "#ff2de3", "#3b1938"];
      c.globalAlpha = fade;
      c.strokeStyle = `rgba(255,218,126,${0.82 * (1 - breakProgress)})`;
      c.lineWidth = 8;
      c.beginPath();
      c.arc(0, 0, 26 + breakProgress * 116, 0, TAU);
      c.stroke();
      if (hit < 0.075) {
        const impactScale = 0.68 + hit / 0.075 * 0.42;
        c.save();
        c.scale(impactScale * 1.12, impactScale * 0.74);
        this._drawThrowableIcon(c, type, baseSize * 1.08, true);
        c.restore();
      }
      for (let n = 0; n < 18; n++) {
        const angle = n * 2.399 + type.length * 0.37, distance = baseSize * (0.1 + (0.32 + n % 5 * 0.075) * breakProgress), shard = baseSize * (0.055 + n % 4 * 0.012) * (1 - breakProgress * 0.36), px = Math.cos(angle) * distance, py = Math.sin(angle) * distance * 0.72;
        c.save();
        c.translate(px, py);
        c.rotate(angle + breakProgress * (n % 2 ? 4.8 : -4.2));
        c.fillStyle = fragmentColors[n % fragmentColors.length];
        c.beginPath();
        c.moveTo(-shard, -shard * 0.42);
        c.lineTo(shard * 0.9, -shard * 0.18);
        c.lineTo(shard * 0.28, shard * 0.78);
        c.closePath();
        c.fill();
        c.restore();
      }
    }
    c.restore();
  }
  _drawDeckStack(c, x, y, scale = 0.62, alpha = 1, rotation = 0) {
    c.save();
    c.globalAlpha = alpha;
    for (let k = 0; k < 5; k++)
      this._drawCard(c, x + k * 1.8, y - k * 2.1, { rot: rotation }, true, scale);
    c.restore();
  }
  _drawShuffle(c, animation) {
    const p = animation.p, deck = this._deck();
    const spread = p < 0.5 ? ease(p * 2) : 1 - ease((p - 0.5) * 2);
    const interlace = Math.sin(p * Math.PI * 8) * 7 * spread;
    const lift = Math.sin(Math.PI * p) * 13;
    this._drawDeckStack(c, deck.x - spread * 42, deck.y - lift + interlace, 0.62, 1, -0.12 * spread);
    this._drawDeckStack(c, deck.x + spread * 42, deck.y - lift - interlace, 0.62, 1, 0.12 * spread);
  }
  _effects(c) {
    this.animations.forEach((a) => {
      if (a.kind === "boardShift")
        return;
      const p = a.p;
      if (a.kind === "reaction") {
        this._drawThrownReaction(c, a);
        return;
      }
      if (a.kind === "shuffle") {
        this._drawShuffle(c, a);
        return;
      }
      const x = a.from.x + (a.to.x - a.from.x) * p, isDeal = a.kind === "deal", isFlatGlide = ["fold", "bet", "allin", "win"].includes(a.kind), y = a.from.y + (a.to.y - a.from.y) * p - (isDeal ? Math.sin(Math.PI * p) * 18 : isFlatGlide ? 0 : Math.sin(Math.PI * p) * 10);
      if (a.kind === "flip") {
        c.save();
        c.translate(x, y);
        c.scale(Math.max(0.06, Math.abs(Math.cos(Math.PI * p))), 1);
        this._drawCard(c, 0, 0, p < 0.5 ? a.data.backCard : a.data.card, p < 0.5, a.data.scale || 0.92);
        c.restore();
      } else if (a.kind === "deal" || a.kind === "fold") {
        c.save();
        if (a.kind === "deal")
          this._drawDeckStack(c, a.from.x, a.from.y, 0.56, 1);
        c.globalAlpha = a.kind === "fold" ? p < 0.58 ? 1 : Math.max(0, (1 - p) / 0.42) : 1;
        this._drawCard(c, x, y, a.data.card, a.kind === "fold" || a.data.faceDown, a.data.scale || 0.92);
        c.restore();
      } else {
        const amount = Math.max(1, Number(a.data.amount) || 1), count = a.kind === "allin" ? 18 : Math.max(1, Number(a.data.count) || 2), motionScale = this.isPhone ? 1.36 : 1, label = amount >= 1000 ? `${Math.round(amount / 100) / 10}K` : String(amount), colors = ["#b92337", "#256fa9", "#202127", "#d6a52b"];
        c.save();
        c.globalAlpha = 1;
        c.translate(0, Math.sin(p * Math.PI * 6) * (this.isPhone ? 2.5 : 1.5));
        if (a.kind === "allin" || a.kind === "win") {
          this._paintedChipStack(c, x - 22 * motionScale, y + 4, colors[0], "25", 6, motionScale);
          this._paintedChipStack(c, x, y - 3, colors[1], label, 9, motionScale);
          this._paintedChipStack(c, x + 22 * motionScale, y + 4, colors[2], "500", 6, motionScale);
        } else {
          const cols = Math.min(5, count);
          for (let n = 0;n < count; n++) {
            const row = Math.floor(n / cols), col = n % cols, offsetX = (col - (Math.min(cols, count - row * cols) - 1) / 2) * 13 * motionScale, offsetY = row * 7 * motionScale;
            this._chip(c, x + offsetX, y + offsetY, colors[n % colors.length], 0, motionScale, n === Math.floor(count / 2) ? label : "");
          }
        }
        c.restore();
      }
    });
  }
  setPlayerCount(count = 8) {
    this.activeSeatCount = Number(count) === 6 ? 6 : 8;
    this.seatPoints = this.activeSeatCount === 6 ? this.seatPoints6 : this.seatPoints8;
    this.canvas.setAttribute("aria-label", `${this.activeSeatCount === 6 ? "Six" : "Eight"}-player poker table in a dim lounge`);
    if (this.dealerSeat >= this.activeSeatCount)
      this.dealerSeat = -1;
  }
  setVariant(id = "holdem") {
    this.variantId = String(id || "holdem");
    this.nameplatesTarget = this.variantId === "holdem" ? this.nameplatesTarget : 1;
  }
  seatPlayer(i, { name, stack = 1000, avatarId = i } = {}) {
    Object.assign(this.seats[i], { name: name || `Seat ${i + 1}`, stack, look: Number.isFinite(Number(avatarId)) ? Number(avatarId) : i, folded: false });
  }
  setSeatPhoto(i, dataUrl) {
    const s = this.seats[i];
    s.photo = null;
    if (!dataUrl)
      return;
    const img = new Image;
    img.onload = () => s.photo = img;
    img.src = dataUrl;
  }
  setStack(i, amount) {
    if (this.seats[i])
      this.seats[i].stack = amount;
  }
  setBetAmount(i, amount) {
    if (this.seats[i])
      this.seats[i].betAmount = Math.max(0, Number(amount) || 0);
  }
  setTurnTimer(state = {}) {
    Object.assign(this.turnTimer, state);
  }
  setHandStrength(label = "") {
    this.handStrength = String(label);
  }
  setActionBadge(i, label = "") {
    if (this.seats[i])
      this.seats[i].actionBadge = String(label);
  }
  setSeatLevel(i, level = "Rookie") {
    if (this.seats[i])
      this.seats[i].level = level;
  }
  setSeatStatus(i, status = "") {
    if (this.seats[i])
      this.seats[i].status = status;
  }
  setActiveSeat(i) {
    this.seats.forEach((s, k) => s.active = k === i);
  }
  setDealerButton(i) {
    this.dealerSeat = i;
  }
  unfurlSeat(i) {
    if (this.seats[i])
      this.seats[i].folded = false;
  }
  say(i, text) {
    const s = this.seats[i];
    if (s)
      s.bubble = { text, until: now() + 3100 };
  }
  clearHand() {
    this.seats.forEach((s) => {
      s.cards = [];
      s.folded = false;
      s.betAmount = 0;
      s.actionBadge = "";
    });
    this.boardCards = [];
    this.boardShift = 0;
    this.potChips = [];
    this.handStrength = "";
    this.nameplatesTarget = 1;
  }
  endHand() {
    this.nameplatesTarget = 1;
  }
  async shuffleDeck() {
    await this._anim("shuffle", this._deck(), this._deck(), 1050);
  }
  async dealHoleCards(holeBySeat, heroSeat, upIndexes = []) {
    this.viewerSeat = Number.isInteger(heroSeat) ? heroSeat : 0;
    this.nameplatesTarget = 1;
    // Guard the Hold’em hero display even if upstream state is malformed.
    if (this.variantId === "holdem" && Array.isArray(holeBySeat?.[heroSeat])) holeBySeat[heroSeat] = holeBySeat[heroSeat].slice(0, 2);
    const rounds = Math.max(0, ...holeBySeat.filter(Boolean).map((h) => h.length));
    for (let round = 0;round < rounds; round++)
      for (let i = 0;i < 8; i++)
        if (holeBySeat[i] && holeBySeat[i][round] !== undefined) {
          const [rank, suit] = holeBySeat[i][round], count = holeBySeat[i].length, shown = i === heroSeat || upIndexes.includes(round), to = this._cardAnchor(i, round, shown, count), card = { rank, suit, faceDown: !shown, revealed: shown && i !== heroSeat, rot: (round - (count - 1) / 2) * 0.035 };
          await this._anim("deal", this._deck(), to, Math.max(210, 300 - rounds * 16), { card, faceDown: !shown, scale: this._holeScale(i, shown, count), onComplete: () => this.seats[i].cards.push(card) });
        }
  }
  async dealPrivateCards(cardsBySeat, heroSeat, upIndexes = []) {
    this.viewerSeat = Number.isInteger(heroSeat) ? heroSeat : 0;
    const entries = Object.entries(cardsBySeat || {});
    for (const [seatText, cards] of entries) {
      const i = Number(seatText);
      for (const [rank, suit] of cards) {
        const k = this.seats[i].cards.length, count = k + 1, shown = i === heroSeat || upIndexes.includes(k), to = this._cardAnchor(i, k, shown, count), card = { rank, suit, faceDown: !shown, revealed: shown && i !== heroSeat };
        await this._anim("deal", this._deck(), to, 260, { card, faceDown: !shown, scale: this._holeScale(i, shown, count), onComplete: () => this.seats[i].cards.push(card) });
      }
    }
  }
  async replaceHoleCards(seat, indexes, newCards, heroSeat, upIndexes = []) {
    this.viewerSeat = Number.isInteger(heroSeat) ? heroSeat : 0;
    const s = this.seats[seat], count = s.cards.length;
    for (let n = 0;n < indexes.length; n++) {
      const k = indexes[n], old = s.cards[k], from = this._cardAnchor(seat, k, Boolean(old?.revealed), count);
      if (old) {
        s.cards[k] = null;
        await this._anim("fold", from, { x: 492 + n * 8, y: 332 }, 230, { card: old, faceDown: true, scale: this._holeScale(seat, Boolean(old.revealed), count) });
      }
      const [rank, suit] = newCards[n], shown = seat === heroSeat || upIndexes.includes(k), to = this._cardAnchor(seat, k, shown, count), card = { rank, suit, faceDown: !shown, revealed: shown && seat !== heroSeat };
      await this._anim("deal", this._deck(), to, 270, { card, faceDown: !shown, scale: this._holeScale(seat, shown, count), onComplete: () => s.cards[k] = card });
    }
  }
  removeHoleCard(seat, index) {
    if (this.seats[seat])
      this.seats[seat].cards.splice(index, 1);
  }
  async dealBoard(cards, startIdx = 0) {
    const targetShift = this._boardOffsetForCount(this.boardCards.length + cards.length);
    let slide = null;
    if (this.boardCards.length && targetShift !== this.boardShift)
      slide = this._anim("boardShift", { x: this.boardShift, y: 0 }, { x: targetShift, y: 0 }, 320);
    else
      this.boardShift = targetShift;
    for (let k = 0;k < cards.length; k++) {
      const [rank, suit] = cards[k], idx = startIdx + k, to = this._boardAnchor(idx, targetShift), card = { rank, suit, faceDown: false };
      await this._anim("deal", this._deck(), to, 360, { card, faceDown: false, scale: this._boardScale(), onComplete: () => this.boardCards.push(card) });
    }
    if (slide)
      await slide;
    this.boardShift = targetShift;
  }
  async revealSeat(i, hole) {
    const s = this.seats[i], count = s.cards.length;
    for (let k = 0; k < hole.length; k++) {
      if (!s.cards[k])
        continue;
      const [rank, suit] = hole[k], backCard = { ...s.cards[k], faceDown: true }, card = { ...s.cards[k], rank, suit, faceDown: false, revealed: true };
      const from = this._cardAnchor(i, k, false, count), to = this._cardAnchor(i, k, true, count), scale = this._holeScale(i, true, count);
      s.cards[k] = null;
      await this._anim("flip", from, to, 300, { backCard, card, scale, onComplete: () => s.cards[k] = card });
    }
  }
  async foldSeat(i) {
    const s = this.seats[i], cards = s.cards.splice(0), count = cards.length;
    for (let k = 0;k < cards.length; k++) {
      const from = this._cardAnchor(i, k, false, count);
      await this._anim("fold", from, { x: 500 + k * 8, y: 332 }, 260, { card: cards[k], faceDown: true, scale: this._holeScale(i, false, count) });
    }
    s.folded = true;
  }
  async betChips(i, amount) {
    const beforeStack = Math.max(1, Number(this.seats[i].stack) || 1), kind = amount >= beforeStack ? "allin" : "bet", fraction = amount / beforeStack, count = kind === "allin" ? 18 : fraction <= 0.08 ? 2 : 6;
    const landed = Math.min(12, Math.max(1, count));
    await this._anim(kind, this._chipAnchor(i), this._pot(), kind === "allin" ? 760 : 620, { amount, count, onComplete: () => {
      for (let k = 0;k < landed; k++)
        this.potChips.push({});
    } });
  }
  async awardPot(i) {
    await this._anim("win", this._pot(), this._chipAnchor(i), 720, { count: this.potChips.length, onComplete: () => this.potChips = [] });
  }
  async tipDealer(i, amount = 25) {
    await this._anim("tip", this._chipAnchor(i), { x: 500, y: 242 }, 430, { amount });
    this.tipTotal += amount;
    return this.tipTotal;
  }
  playAnimation(i, name) {
    if (!["knock", "laugh", "angry", "cry", "surprised", "doze"].includes(name) || !this.seats[i])
      return Promise.resolve();
    const duration = name === "knock" ? 750 : 2350;
    this.seats[i].gesture = { name, start: now(), duration };
    return sleep(duration);
  }
  animateCheck(i) {
    return this.playAnimation(i, "knock");
  }
  animateGesture(i, name) {
    return this.playAnimation(i, name);
  }
  animateWin() {
    return Promise.resolve();
  }
  animateThink() {
    return Promise.resolve();
  }
  throwReaction(from, to, item = {}) {
    return this._anim("reaction", this._xy(from), this._xy(to), 3400, { type: item.type, glyph: item.glyph || "!" });
  }
}

// assets/js/cards.js
function randomInt(n) {
  const arr = new Uint32Array(1);
  const range = 4294967296;
  const limit = range - range % n;
  let x;
  do {
    globalThis.crypto.getRandomValues(arr);
    x = arr[0];
  } while (x >= limit);
  return x % n;
}
var rankOf = (c) => c % 13;
var suitOf = (c) => c / 13 | 0;
function newDeck() {
  const d = [];
  for (let i = 0;i < 52; i++)
    d.push(i);
  return d;
}
function shuffle(deck) {
  for (let i = deck.length - 1;i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function eval5(cards) {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const counts = {};
  ranks.forEach((r) => counts[r] = (counts[r] || 0) + 1);
  const groups = Object.entries(counts).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const uniq = [...new Set(ranks)];
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4)
      straightHigh = uniq[0];
    else if (uniq[0] === 12 && uniq[1] === 3)
      straightHigh = 3;
  }
  const tb = (rs) => rs.reduce((s, r) => s * 15 + (r + 2), 0);
  let cat, tie;
  if (flush && straightHigh >= 0) {
    cat = 8;
    tie = tb([straightHigh]);
  } else if (groups[0][0] === 4) {
    cat = 7;
    tie = tb([groups[0][1], groups[1][1]]);
  } else if (groups[0][0] === 3 && groups[1][0] === 2) {
    cat = 6;
    tie = tb([groups[0][1], groups[1][1]]);
  } else if (flush) {
    cat = 5;
    tie = tb(ranks);
  } else if (straightHigh >= 0) {
    cat = 4;
    tie = tb([straightHigh]);
  } else if (groups[0][0] === 3) {
    cat = 3;
    tie = tb([groups[0][1], ...groups.slice(1).map((g) => g[1]).sort((a, b) => b - a)]);
  } else if (groups[0][0] === 2 && groups[1][0] === 2) {
    const prs = [groups[0][1], groups[1][1]].sort((a, b) => b - a);
    cat = 2;
    tie = tb([...prs, groups[2][1]]);
  } else if (groups[0][0] === 2) {
    cat = 1;
    tie = tb([groups[0][1], ...groups.slice(1).map((g) => g[1]).sort((a, b) => b - a)]);
  } else {
    cat = 0;
    tie = tb(ranks);
  }
  return cat * 1000000000000 + tie;
}
function evaluate7(seven) {
  let best = -1, bestHand = null;
  for (let a = 0;a < 3; a++)
    for (let b = a + 1;b < 4; b++)
      for (let c = b + 1;c < 5; c++)
        for (let d = c + 1;d < 6; d++)
          for (let e = d + 1;e < 7; e++) {
            const hand = [seven[a], seven[b], seven[c], seven[d], seven[e]];
            const s = eval5(hand);
            if (s > best) {
              best = s;
              bestHand = hand;
            }
          }
  return { score: best, hand: bestHand };
}
var CATEGORY = ["high card", "pair", "two pair", "trips", "straight", "flush", "full house", "quads", "straight flush"];

// assets/js/game.js
var VARIANTS = {
  holdem: { name: "Texas Hold’em", family: "community", hole: 2, streets: [["flop", 3], ["turn", 1], ["river", 1]] },
  omaha: { name: "Omaha", family: "community", hole: 4, streets: [["flop", 3], ["turn", 1], ["river", 1]], omaha: true },
  omaha8: { name: "Omaha Hi-Lo 8 or Better", family: "community", hole: 4, streets: [["flop", 3], ["turn", 1], ["river", 1]], omaha: true, hiLo: true },
  pineapple: { name: "Pineapple", family: "community", hole: 3, streets: [["flop", 3], ["turn", 1], ["river", 1]], pineapple: true },
  draw5: { name: "Five Card Draw", family: "draw", hole: 5, streets: [["draw", 0]], draw: true },
  lowball: { name: "2–7 Lowball", family: "draw", hole: 5, streets: [["draw", 0]], draw: true, lowball: true },
  stud5: { name: "Five Card Stud", family: "stud", hole: 2, streets: [["fourth", 1], ["fifth", 1], ["river", 1]], up: [1, 2, 3, 4] },
  stud7: { name: "Seven Card Stud", family: "stud", hole: 3, streets: [["fourth", 1], ["fifth", 1], ["sixth", 1], ["river", 1]], up: [2, 3, 4, 5] }
};
var choose = (arr, n) => {
  const out = [];
  const walk = (start, pick) => {
    if (pick.length === n) {
      out.push(pick.slice());
      return;
    }
    for (let i = start;i <= arr.length - (n - pick.length); i++) {
      pick.push(arr[i]);
      walk(i + 1, pick);
      pick.pop();
    }
  };
  walk(0, []);
  return out;
};
var lowRanks = (cards) => cards.map((c) => rankOf(c) + 2).map((r) => r === 14 ? 1 : r);
function omahaScores(hole, board) {
  let high = -1, low = null;
  for (const h of choose(hole, 2))
    for (const b of choose(board, 3)) {
      const five = [...h, ...b], score = eval5(five);
      if (score > high)
        high = score;
      const ranks = [...new Set(lowRanks(five))].sort((a, b2) => b2 - a);
      if (ranks.length === 5 && ranks[0] <= 8) {
        const key = ranks.reduce((s, r) => s * 15 + r, 0);
        if (low === null || key < low)
          low = key;
      }
    }
  return { high, low };
}
function bestOf(cards) {
  if (cards.length === 5)
    return eval5(cards);
  if (cards.length === 6) {
    let best = -1;
    for (const five of choose(cards, 5))
      best = Math.max(best, eval5(five));
    return best;
  }
  return evaluate7(cards).score;
}
function deuceLowScore(cards) {
  let best = -Infinity;
  for (const five of choose(cards, 5)) {
    const normal = eval5(five), cat = Math.floor(normal / 1000000000000);
    const ranks = five.map(rankOf).sort((a, b) => b - a);
    const counts = {};
    ranks.forEach((r) => counts[r] = (counts[r] || 0) + 1);
    const groups = Object.entries(counts).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    const flush = five.every((c) => suitOf(c) === suitOf(five[0]));
    const uniq = [...new Set(ranks)];
    const straight = uniq.length === 5 && uniq[0] - uniq[4] === 4;
    let bad = 0, tie = [];
    if (straight && flush) {
      bad = 8;
      tie = [uniq[0]];
    } else if (groups[0][0] === 4) {
      bad = 7;
      tie = groups.map((g) => g[1]);
    } else if (groups[0][0] === 3 && groups[1]?.[0] === 2) {
      bad = 6;
      tie = groups.map((g) => g[1]);
    } else if (flush) {
      bad = 5;
      tie = ranks;
    } else if (straight) {
      bad = 4;
      tie = [uniq[0]];
    } else if (groups[0][0] === 3) {
      bad = 3;
      tie = groups.map((g) => g[1]);
    } else if (groups[0][0] === 2 && groups[1]?.[0] === 2) {
      bad = 2;
      tie = groups.map((g) => g[1]);
    } else if (groups[0][0] === 2) {
      bad = 1;
      tie = groups.map((g) => g[1]);
    } else {
      bad = 0;
      tie = ranks;
    }
    const key = bad * 10000000000 + tie.reduce((s, r) => s * 15 + (r + 2), 0);
    best = Math.max(best, -key);
  }
  return best;
}

class PokerGame {
  constructor({ smallBlind = 10, bigBlind = 20, variant = "holdem" } = {}) {
    this.sb = smallBlind;
    this.bb = bigBlind;
    this.players = [];
    this.button = -1;
    this.handNo = 0;
    this.setVariant(variant);
  }
  setVariant(id = "holdem") {
    this.variantId = VARIANTS[id] ? id : "holdem";
    this.rules = VARIANTS[this.variantId];
  }
  addPlayer({ name, isBot = false, stack = 1000 }) {
    const seat = this.players.length;
    this.players.push({ seat, name, isBot, stack, hole: [], folded: false, allIn: false, betStreet: 0, betHand: 0, acted: false, inHand: false, sittingOut: false });
    return seat;
  }
  _active() {
    return this.players.filter((p) => p.stack > 0 && !p.sittingOut);
  }
  _next(s) {
    const n = this.players.length;
    for (let k = 1;k <= n; k++) {
      const c = (s + k + n) % n;
      if (this.players[c].inHand)
        return c;
    }
  }
  _post(seat, amt) {
    const p = this.players[seat], a = Math.min(amt, p.stack);
    p.stack -= a;
    p.betStreet += a;
    p.betHand += a;
    if (!p.stack)
      p.allIn = true;
    return { seat, amount: a };
  }
  beginHand() {
    const active = this._active();
    if (active.length < 2)
      return { error: "not enough players with chips" };
    this.handNo++;
    this.deck = shuffle(newDeck());
    this.board = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = this.bb;
    this._turn = null;
    this._cursor = undefined;
    this._handOver = false;
    this._streetIndex = -1;
    for (const p of this.players) {
      p.hole = [];
      p.folded = false;
      p.allIn = false;
      p.betStreet = 0;
      p.betHand = 0;
      p.acted = false;
      p.inHand = p.stack > 0 && !p.sittingOut;
    }
    const n = this.players.length;
    for (let k = 1;k <= n; k++) {
      const c = (this.button + k + n) % n;
      if (this.players[c].inHand) {
        this.button = c;
        break;
      }
    }
    const posts = [];
    if (this.rules.family === "stud") {
      this.street = "third";
      const ante = Math.max(1, Math.floor(this.sb / 2));
      active.forEach((p) => posts.push(this._post(p.seat, ante)));
    } else {
      this.street = this.rules.family === "draw" ? "pre-draw" : "preflop";
      const headsUp = active.length === 2, sbSeat = headsUp ? this.button : this._next(this.button), bbSeat = headsUp ? this._next(this.button) : this._next(sbSeat);
      posts.push(this._post(sbSeat, this.sb), this._post(bbSeat, this.bb));
      this.currentBet = this.bb;
      this._firstToAct = this._next(bbSeat);
    }
    let d = this._next(this.button);
    for (let r = 0;r < this.rules.hole; r++)
      for (let k = 0;k < n; k++) {
        const p = this.players[(d + k) % n];
        if (p.inHand)
          p.hole.push(this.deck.pop());
      }
    if (this.rules.family === "stud") {
      const upIndex = (this.rules.up || [])[0] ?? this.rules.hole - 1;
      const suitOrder = (s) => 3 - suitOf(s);
      const starter = active.reduce((best, p) => {
        const c = p.hole[upIndex], key = rankOf(c) * 4 + suitOrder(c);
        return !best || key < best.key ? { seat: p.seat, key } : best;
      }, null).seat;
      posts.push(this._post(starter, this.bb));
      this.currentBet = this.players[starter].betStreet;
      this._firstToAct = this._next(starter);
    }
    return { button: this.button, posts, sbSeat: posts[0]?.seat, bbSeat: posts[1]?.seat };
  }
  faceUpIndexes() {
    return this.rules.family === "stud" ? this.rules.up || [] : [];
  }
  _live() {
    return this.players.filter((p) => p.inHand && !p.folded && !p.allIn);
  }
  _orderFrom(s) {
    const n = this.players.length, out = [];
    for (let k = 0;k < n; k++)
      out.push(this.players[(s + k) % n]);
    return out;
  }
  nextAction() {
    if (this._turn !== null && this._turn !== undefined)
      return this._turnInfo();
    const live = this._live();
    if (live.length <= 1) {
      this._turn = null;
      return null;
    }
    const start = this._cursor !== undefined ? this._cursor : this._firstToAct;
    for (const p of this._orderFrom(start)) {
      if (!p.inHand || p.folded || p.allIn)
        continue;
      if (!p.acted || p.betStreet < this.currentBet) {
        this._turn = p.seat;
        return this._turnInfo();
      }
    }
    this._turn = null;
    return null;
  }
  _turnInfo() {
    if (this._turn === null || this._turn === undefined)
      return null;
    const p = this.players[this._turn], toCall = Math.min(this.currentBet - p.betStreet, p.stack);
    return { seat: p.seat, name: p.name, toCall, canCheck: p.betStreet === this.currentBet, minRaiseTo: this.currentBet + this.minRaise, maxTo: p.betStreet + p.stack, pot: this.pot + this.players.reduce((s, q) => s + q.betStreet, 0) };
  }
  applyAction(seat, { type, amount = 0 }) {
    if (this._turn === null || this._turn === undefined)
      this.nextAction();
    if (seat !== this._turn)
      throw new Error(`not seat ${seat}'s turn`);
    const p = this.players[seat], n = this.players.length, commit = (amt) => {
      const a = Math.min(amt, p.stack);
      p.stack -= a;
      p.betStreet += a;
      p.betHand += a;
      if (!p.stack)
        p.allIn = true;
      return a;
    };
    if (type === "fold")
      p.folded = true;
    else if (type === "check") {
      if (p.betStreet !== this.currentBet)
        throw new Error("cannot check facing a bet");
    } else if (type === "call")
      commit(this.currentBet - p.betStreet);
    else if (type === "bet" || type === "raise") {
      const stackTarget = Math.min(amount, p.betStreet + p.stack);
      const toCall = Math.max(0, this.currentBet - p.betStreet);
      const livePot = this.pot + this.players.reduce((sum, player) => sum + player.betStreet, 0);
      const potLimitTarget = p.betStreet + toCall + livePot + toCall;
      const target = currentTable?.bettingLimit === "pot" ? Math.min(stackTarget, potLimitTarget) : stackTarget;
      const inc = target - this.currentBet, allIn = target === p.betStreet + p.stack;
      if (!allIn) {
        if (this.currentBet === 0 && target < this.bb)
          throw new Error("bet below big blind");
        if (this.currentBet > 0 && inc < this.minRaise)
          throw new Error("raise too small");
      }
      commit(target - p.betStreet);
      if (inc >= this.minRaise) {
        this.minRaise = inc;
        this.currentBet = target;
        for (const q of this.players)
          if (q.seat !== seat && q.inHand && !q.folded && !q.allIn)
            q.acted = false;
      } else if (target > this.currentBet)
        this.currentBet = target;
    } else
      throw new Error("unknown action " + type);
    p.acted = true;
    this._turn = null;
    this._cursor = (seat + 1) % n;
    return true;
  }
  _collectBets() {
    for (const p of this.players) {
      this.pot += p.betStreet;
      p.betStreet = 0;
    }
  }
  _studFirstToAct() {
    let best = null;
    for (const p of this.players) {
      if (!p.inHand || p.folded || p.allIn)
        continue;
      const visible = (this.rules.up || []).filter((i) => i < p.hole.length).map((i) => p.hole[i]);
      if (!visible.length)
        continue;
      const counts = {};
      visible.forEach((c) => counts[rankOf(c)] = (counts[rankOf(c)] || 0) + 1);
      const groups = Object.entries(counts).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
      let cat = groups[0][0] === 4 ? 4 : groups[0][0] === 3 ? 3 : groups[0][0] === 2 && groups[1]?.[0] === 2 ? 2 : groups[0][0] === 2 ? 1 : 0;
      let score = cat * 1e8;
      for (const [, r] of groups)
        score = score * 15 + (r + 2);
      score = score * 4 + Math.max(...visible.map((c) => 3 - suitOf(c)));
      if (!best || score > best.score)
        best = { seat: p.seat, score };
    }
    return best?.seat;
  }
  _resetRound() {
    this.currentBet = 0;
    this.minRaise = this.bb;
    for (const p of this.players) {
      p.betStreet = 0;
      p.acted = false;
    }
    if (this.rules.family === "stud")
      this._cursor = this._studFirstToAct();
    else {
      const n = this.players.length;
      for (let k = 1;k <= n; k++) {
        const p = this.players[(this.button + k) % n];
        if (p.inHand && !p.folded && !p.allIn) {
          this._cursor = p.seat;
          break;
        }
      }
    }
    this._turn = null;
  }
  replaceCards(seat, indexes = []) {
    const p = this.players[seat];
    if (!p || !p.inHand || p.folded)
      return [];
    const safe = [...new Set(indexes)].filter((i) => i >= 0 && i < p.hole.length).sort((a, b) => a - b).slice(0, 3);
    const drawn = safe.map(() => this.deck.pop());
    safe.forEach((idx, k) => p.hole[idx] = drawn[k]);
    return drawn;
  }
  discardPineapple(seat, index) {
    const p = this.players[seat];
    if (!p || p.hole.length !== 3)
      return null;
    return p.hole.splice(Math.max(0, Math.min(2, index)), 1)[0];
  }
  _autoCompleteSpecials() {
    if (this.rules.pineapple)
      this.players.filter((p) => p.inHand && !p.folded && p.hole.length === 3).forEach((p) => this.discardPineapple(p.seat, this.suggestDiscards(p.seat, 1)[0] || 0));
    if (this.rules.draw)
      this.players.filter((p) => p.inHand && !p.folded).forEach((p) => this.replaceCards(p.seat, this.suggestDiscards(p.seat, 3)));
  }
  advance() {
    if (this._handOver)
      return null;
    this._collectBets();
    const remaining = this.players.filter((p) => p.inHand && !p.folded);
    if (remaining.length === 1) {
      const w = remaining[0];
      w.stack += this.pot;
      const res = { type: "win", seat: w.seat, name: w.name, amount: this.pot, uncontested: true };
      this.pot = 0;
      this._handOver = true;
      return res;
    }
    const nextIndex = this._streetIndex + 1;
    if (nextIndex >= this.rules.streets.length) {
      return this._showdown();
    }
    const [street, count] = this.rules.streets[nextIndex];
    this._streetIndex = nextIndex;
    this.street = street;
    const cards = [];
    const privateCards = {};
    if (this.rules.family === "community") {
      for (let k = 0;k < count; k++) {
        const c = this.deck.pop();
        this.board.push(c);
        cards.push(c);
      }
    } else if (this.rules.family === "stud") {
      for (const p of this.players)
        if (p.inHand && !p.folded) {
          const c = this.deck.pop();
          p.hole.push(c);
          privateCards[p.seat] = [c];
        }
    }
    this._resetRound();
    return { type: "street", street, cards, privateCards, special: this.rules.draw ? "draw" : this.rules.pineapple && street === "flop" ? "pineapple" : null };
  }
  scoreFor(seat) {
    const p = this.players[seat];
    if (!p)
      return { high: -Infinity, low: null };
    if (this.rules.omaha)
      return omahaScores(p.hole, this.board);
    if (this.rules.lowball)
      return { high: deuceLowScore(p.hole), low: null };
    return { high: bestOf([...p.hole, ...this.board]), low: null };
  }
  suggestDiscards(seat, max = 3) {
    const p = this.players[seat];
    if (!p)
      return [];
    if (this.rules.pineapple) {
      let best = -Infinity, bestIdx = 0;
      for (let i = 0;i < p.hole.length; i++) {
        const kept = p.hole.filter((_, k) => k !== i);
        const score = this.board.length >= 3 ? bestOf([...kept, ...this.board]) : kept.reduce((s, c) => s + rankOf(c), 0);
        if (score > best) {
          best = score;
          bestIdx = i;
        }
      }
      return [bestIdx];
    }
    const ranks = p.hole.map(rankOf), counts = {};
    ranks.forEach((r) => counts[r] = (counts[r] || 0) + 1);
    const keep = new Set;
    p.hole.forEach((c, i) => {
      if (counts[rankOf(c)] > 1)
        keep.add(i);
    });
    if (this.rules.lowball) {
      p.hole.forEach((c, i) => {
        if (rankOf(c) <= 5 && !keep.has(i))
          keep.add(i);
      });
    } else {
      const suits = {};
      p.hole.forEach((c, i) => (suits[suitOf(c)] ||= []).push(i));
      Object.values(suits).forEach((ix) => {
        if (ix.length >= 4)
          ix.forEach((i) => keep.add(i));
      });
      p.hole.forEach((c, i) => {
        if (rankOf(c) >= 10)
          keep.add(i);
      });
    }
    return p.hole.map((_, i) => i).filter((i) => !keep.has(i)).slice(0, max);
  }
  _showdown() {
    const contrib = this.players.filter((p) => p.inHand && p.betHand > 0), levels = [...new Set(contrib.map((p) => p.betHand))].sort((a, b) => a - b), pots = [];
    let prev = 0;
    for (const lv of levels) {
      let amount = 0;
      const eligible = [];
      for (const p of contrib) {
        amount += Math.max(0, Math.min(p.betHand, lv) - prev);
        if (p.betHand >= lv && !p.folded)
          eligible.push(p.seat);
      }
      if (amount > 0)
        pots.push({ amount, eligible });
      prev = lv;
    }
    const results = [];
    const pay = (amount, winners) => {
      const share = Math.floor(amount / winners.length);
      let rem = amount - share * winners.length;
      winners.forEach((s) => {
        this.players[s].stack += share + (rem-- > 0 ? 1 : 0);
      });
    };
    for (const pot of pots) {
      let best = -Infinity, winners = [];
      for (const s of pot.eligible) {
        const score = this.scoreFor(s).high;
        if (score > best) {
          best = score;
          winners = [s];
        } else if (score === best)
          winners.push(s);
      }
      const lowEligible = this.rules.hiLo ? pot.eligible.filter((s) => this.scoreFor(s).low !== null) : [];
      if (lowEligible.length) {
        let lowBest = Infinity, lowW = [];
        for (const s of lowEligible) {
          const score = this.scoreFor(s).low;
          if (score < lowBest) {
            lowBest = score;
            lowW = [s];
          } else if (score === lowBest)
            lowW.push(s);
        }
        const highAmt = Math.ceil(pot.amount / 2), lowAmt = pot.amount - highAmt;
        pay(highAmt, winners);
        pay(lowAmt, lowW);
        results.push({ amount: highAmt, winners, desc: handDesc(best) + " high" }, { amount: lowAmt, winners: lowW, desc: "8-or-better low" });
      } else {
        pay(pot.amount, winners);
        results.push({ amount: pot.amount, winners, desc: this.rules.lowball ? lowDesc(best) : handDesc(best) });
      }
    }
    const hands = {};
    for (const p of this.players)
      if (p.inHand && !p.folded)
        hands[p.seat] = [...p.hole];
    this.pot = 0;
    this._handOver = true;
    return { type: "showdown", pots: results, hands, board: [...this.board] };
  }
  estimateStrength(seat, sims = 80) {
    const p = this.players[seat];
    if (!p)
      return 0;
    const score = this.scoreFor(seat).high;
    const cat = this.rules.lowball ? Math.max(0, Math.min(8, Math.floor(-score / 10000000000))) : Math.floor(score / 1000000000000);
    let base = this.rules.lowball ? (8 - cat) / 8 : cat / 8;
    if (this.rules.family === "community" && this.board.length < 3) {
      const ranks = p.hole.map(rankOf), pairs = new Set(ranks).size < ranks.length;
      base = 0.24 + Math.max(...ranks) / 12 * 0.3 + (pairs ? 0.25 : 0);
    }
    if (this.rules.family === "draw" && this.street === "pre-draw")
      base = Math.max(base, 0.25 + (3 - this.suggestDiscards(seat, 3).length) * 0.2);
    return Math.max(0.04, Math.min(0.96, base));
  }
  snapshot() {
    return { street: this.street, button: this.button, pot: this.pot + this.players.reduce((s, p) => s + p.betStreet, 0), board: [...this.board || []], currentBet: this.currentBet, variant: this.variantId, players: this.players.map((p) => ({ seat: p.seat, name: p.name, isBot: p.isBot, stack: p.stack, bet: p.betStreet, folded: p.folded, allIn: p.allIn, inHand: p.inHand, sittingOut: p.sittingOut, holeCount: p.hole.length })) };
  }
}
function handDesc(score) {
  const cat = Math.floor(score / 1000000000000);
  return CATEGORY[cat] || "high card";
}
function lowDesc(score) {
  const bad = Math.floor(-score / 10000000000);
  return bad === 0 ? "low hand" : `${["low hand", "one pair", "two pair", "trips", "straight", "flush", "full house", "quads", "straight flush"][bad] || "low hand"} (low)`;
}
function handStrength(hole, board, sims = 80) {
  try {
    return Math.max(0.05, Math.min(0.95, Math.floor(evaluate7([...hole, ...board]).score / 1000000000000) / 8));
  } catch {
    return 0.35;
  }
}

// assets/js/bots.js
var BOT_DEFS = [
  { name: "Nicole", tight: 0.65, aggro: 0.45, skin: 15251594, shirt: 2575219, hair: 4860426, style: 3 },
  { name: "Promise", tight: 0.45, aggro: 0.6, skin: 9263675, shirt: 2849343, hair: 1118481, style: 0 },
  { name: "Marcus", tight: 0.55, aggro: 0.5, skin: 7029286, shirt: 5974906, hair: 0, style: 1 },
  { name: "BigAl", tight: 0.25, aggro: 0.8, skin: 13208932, shirt: 8003371, hair: 2759182, style: 1 },
  { name: "Sofia", tight: 0.8, aggro: 0.35, skin: 15780000, shirt: 11561503, hair: 14209216, style: 3 },
  { name: "Dre", tight: 0.5, aggro: 0.55, skin: 8015406, shirt: 2062970, hair: 3351057, style: 0 },
  { name: "Tanya", tight: 0.6, aggro: 0.65, skin: 14392686, shirt: 9079339, hair: 7031327, style: 2 }
];
var BETWEEN_HAND_LINES = [
  "Good hit.",
  "Nice win.",
  "I'm on a heater.",
  "Well played.",
  "Good hand.",
  "That was a close one.",
  "I like playing here.",
  "Beautiful table design.",
  "Comfortable playing here."
];
function botLine() {
  return BETWEEN_HAND_LINES[Math.random() * BETWEEN_HAND_LINES.length | 0];
}
function clampBet(info, p, want) {
  const maxTo = p.betStreet + p.stack;
  if (maxTo < info.minRaiseTo && maxTo <= 0)
    return null;
  if (maxTo <= 20)
    return { type: "bet", amount: maxTo };
  const amt = Math.max(20, Math.min(maxTo, Math.round(want)));
  return { type: "bet", amount: amt };
}
function decideBot(game, seat) {
  const info = game.nextAction();
  if (!info || info.seat !== seat)
    return { type: "fold" };
  const p = game.players[seat];
  const def = BOT_DEFS[(seat - 1 + BOT_DEFS.length) % BOT_DEFS.length];
  const strength = typeof game.estimateStrength === "function" ? game.estimateStrength(seat, 160) : handStrength(p.hole, game.board, 160);
  const noise = (Math.random() - 0.5) * 0.12;
  const s = Math.max(0, Math.min(1, strength + noise - (def.tight - 0.5) * 0.12));
  const heroIsOut = Boolean(game.players[0]?.folded || game.players[0]?.sittingOut);
  const liveBots = game.players.filter((player) => player.isBot && player.inHand && !player.folded).length;
  const hero = game.players[0];
  const facingHeroRaise = Boolean(hero && !hero.folded && hero.inHand && hero.acted && info.toCall > 0 && hero.betStreet === game.currentBet);
  if (info.canCheck) {
    const bluff = Math.random() < def.aggro * 0.14 && s > 0.3;
    if (s > 0.6 || bluff) {
      const want = info.pot * (0.45 + Math.random() * 0.45);
      return clampBet(info, p, want) || { type: "check" };
    }
    return { type: "check" };
  }
  const toCall = info.toCall;
  const potOdds = toCall / (info.pot + toCall);
  if (s > 0.82 && Math.random() < 0.35 + def.aggro * 0.5) {
    const maxTo = p.betStreet + p.stack;
    if (maxTo > info.minRaiseTo) {
      const want = info.minRaiseTo + Math.round(info.pot * (0.3 + Math.random() * 0.5));
      return { type: "raise", amount: Math.min(maxTo, Math.max(info.minRaiseTo, want)) };
    }
    return { type: "call" };
  }
  if (s < 0.35 && Math.random() < def.aggro * 0.06 && toCall < p.stack * 0.15) {
    const maxTo = p.betStreet + p.stack;
    if (maxTo > info.minRaiseTo) {
      return { type: "raise", amount: Math.min(maxTo, info.minRaiseTo + Math.round(info.pot * 0.5)) };
    }
  }
  if ((heroIsOut || facingHeroRaise) && liveBots <= 2)
    return { type: "call" };
  const threshold = potOdds * (heroIsOut ? 0.88 : facingHeroRaise ? 0.82 : 0.98) + (0.5 - def.tight) * 0.07;
  if (s > threshold)
    return { type: "call" };
  const defendChance = heroIsOut ? 0.46 + (1 - def.tight) * 0.24 : facingHeroRaise ? 0.44 + (1 - def.tight) * 0.32 : 0.2 + (1 - def.tight) * 0.18;
  if (Math.random() < defendChance && toCall <= p.stack * (heroIsOut ? 0.24 : facingHeroRaise ? 0.22 : 0.12))
    return { type: "call" };
  return { type: "fold" };
}

// assets/js/client.js
var HERO = 0;
var $ = (id) => document.getElementById(id);
var delay = (ms) => new Promise((r) => setTimeout(r, ms));
var toRS = (cards) => cards.map((c) => [rankOf(c), suitOf(c)]);
var table = new PokerTable3D($("stage"));
var game = new PokerGame({ smallBlind: 25, bigBlind: 50 });
window.__table = table;
window.__game = game;
window.__heroTurn = false;
var currentTable = { id: "low", name: "Low Stakes Cash Game", mode: "cash", variant: "holdem", bettingLimit: "no-limit", smallBlind: 25, bigBlind: 50, buyIn: 5000, entryFee: 0, prizePool: 0, playerCount: 8 };
var tableSession = 0;
var tableActive = false;
var cancelHeroTurn = null;
var cancelBrokeWait = null;
var startingStacks = [];
var resultRecorded = false;
var tournamentFinished = false;
var heroSittingOut = false;
var selectedThrow = null;
var throwPickerTarget = HERO;
var throwPickerMode = "arm";
var heroAudioContext = null;
var soundEnabled = true;
var audioMaster = null;
var ambientSource = null;
var audioUnlocked = false;
var initAudio = () => {
  if (!soundEnabled)
    return null;
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C)
      return null;
    heroAudioContext ||= new C;
    if (heroAudioContext.state === "suspended")
      heroAudioContext.resume().catch(() => {});
    if (!audioMaster) {
      audioMaster = heroAudioContext.createGain();
      audioMaster.gain.value = 0.72;
      audioMaster.connect(heroAudioContext.destination);
    }
    return heroAudioContext;
  } catch (_) {
    return null;
  }
};
var unlockAudio = () => {
  if (audioUnlocked || !soundEnabled)
    return;
  const ctx = initAudio();
  if (!ctx)
    return;
  const finish = () => {
    if (audioUnlocked)
      return;
    audioUnlocked = true;
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(audioMaster);
    source.start(0);
  };
  if (ctx.state === "running")
    finish();
  else
    ctx.resume().then(finish).catch(() => {});
};
document.addEventListener("pointerdown", unlockAudio, { capture: true, passive: true });
document.addEventListener("touchend", unlockAudio, { capture: true, passive: true });
document.addEventListener("keydown", unlockAudio, { capture: true });
var tone = (frequency, duration = 0.12, volume = 0.05, type = "sine", delaySeconds = 0) => {
  const ctx = initAudio();
  if (!ctx || !audioMaster)
    return;
  const start = ctx.currentTime + delaySeconds, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(frequency, start);
  g.gain.setValueAtTime(0.001, start);
  g.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, start + duration);
  o.connect(g).connect(audioMaster);
  o.start(start);
  o.stop(start + duration + 0.02);
};
var noiseBurst = (duration = 0.2, volume = 0.025, filterFreq = 2400, delaySeconds = 0) => {
  const ctx = initAudio();
  if (!ctx || !audioMaster)
    return;
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration)), buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0;i < length; i++)
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain(), start = ctx.currentTime + delaySeconds;
  src.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = 0.7;
  gain.gain.value = volume;
  src.connect(filter).connect(gain).connect(audioMaster);
  src.start(start);
};
var sfxShuffle = () => {
  noiseBurst(0.48, 0.05, 1850);
  noiseBurst(0.34, 0.035, 2900, 0.14);
};
var sfxDeal = () => noiseBurst(0.07, 0.035, 3250);
var sfxChips = () => {
  tone(1120, 0.055, 0.045, "triangle");
  tone(1460, 0.06, 0.04, "triangle", 0.055);
  tone(910, 0.08, 0.035, "triangle", 0.11);
};
var sfxWin = () => {
  tone(523, 0.18, 0.055, "triangle");
  tone(659, 0.18, 0.055, "triangle", 0.14);
  tone(784, 0.28, 0.06, "triangle", 0.28);
};
var startAmbience = () => {
  const ctx = initAudio();
  if (!ctx || ambientSource || !audioMaster)
    return;
  const length = ctx.sampleRate * 3, buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
  let smooth = 0;
  for (let i = 0;i < length; i++) {
    smooth = smooth * 0.97 + (Math.random() * 2 - 1) * 0.03;
    data[i] = smooth;
  }
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = buffer;
  src.loop = true;
  filter.type = "lowpass";
  filter.frequency.value = 420;
  gain.gain.value = 0.028;
  src.connect(filter).connect(gain).connect(audioMaster);
  src.start();
  ambientSource = src;
};
var stopAmbience = () => {
  try {
    ambientSource?.stop();
  } catch (_) {}
  ambientSource = null;
};
var TOURNAMENT_LEVELS = [[25, 50], [50, 100], [100, 200], [200, 400], [400, 800], [800, 1600]];
var TOURNAMENT_PAYOUTS = [4000, 2400, 1600];
game.addPlayer({ name: "You", isBot: false, stack: 1e4 });
BOT_DEFS.forEach((d) => game.addPlayer({ name: d.name, isBot: true, stack: 1e4 }));
var LOOKS = [
  { name: "You", skin: 13208932, shirt: 11542560, hair: 2759182, style: 0 },
  ...BOT_DEFS.map((d, index) => ({ name: d.name, skin: d.skin, shirt: d.shirt, hair: d.hair, style: d.style, avatarId: index + 1 }))
];
LOOKS.forEach((l, i) => table.seatPlayer(i, { ...l, stack: 1e4 }));
var RANKS2 = ["Rookie", "Intermediate", "Professional"];
var BOT_STAT_SEEDS = [
  { hands: 84, wins: 12, folds: 91, calls: 48, decisions: 206 },
  { hands: 142, wins: 23, folds: 126, calls: 99, decisions: 342 },
  { hands: 57, wins: 7, folds: 64, calls: 42, decisions: 151 },
  { hands: 236, wins: 45, folds: 128, calls: 192, decisions: 603 },
  { hands: 103, wins: 15, folds: 139, calls: 55, decisions: 271 },
  { hands: 188, wins: 31, folds: 174, calls: 121, decisions: 449 },
  { hands: 262, wins: 50, folds: 205, calls: 190, decisions: 648 }
];
var playerStats = game.players.map((player, index) => index === HERO ? { hands: 0, wins: 0, folds: 0, calls: 0, decisions: 0, level: "Rookie" } : { ...BOT_STAT_SEEDS[index - 1], level: "Rookie" });
window.__playerStats = playerStats;
var pct = (n, d) => d ? Math.round(n / d * 100) : 0;
var rankFor = (stats) => stats.hands >= 200 && pct(stats.wins, stats.hands) >= 18 ? "Professional" : stats.hands >= 50 && pct(stats.wins, stats.hands) >= 12 ? "Intermediate" : "Rookie";
var rankIndex = (level) => Math.max(0, RANKS2.indexOf(level));
var weaponForRank = (level) => level === "Professional" ? "Machine gun" : level === "Intermediate" ? "Handgun" : "Crossbow";
function updateWeaponLocks() {
  const heroRank = rankFor(playerStats[HERO]), heroRankIndex = rankIndex(heroRank);
  document.querySelectorAll("[data-unlock-level]").forEach((button) => {
    const needed = button.dataset.unlockLevel, locked = heroRankIndex < rankIndex(needed);
    button.disabled = locked;
    button.classList.toggle("locked", locked);
    button.title = locked ? `Unlocks at ${needed}` : `Unlocked · ${needed}`;
  });
}
function showLevelUp(seat, from, to) {
  table.setSeatLevel(seat, to);
  if (seat !== HERO) {
    table.say(seat, `${to}! ${weaponForRank(to)} unlocked.`);
    return;
  }
  $("level-up-rank").textContent = to.toUpperCase();
  $("level-up-unlock").textContent = `${weaponForRank(to)} unlocked · free to throw`;
  const panel = $("level-up");
  panel.classList.add("hidden");
  panel.offsetWidth;
  panel.classList.remove("hidden");
  setTimeout(() => panel.classList.add("hidden"), 2700);
  updateWeaponLocks();
}
function refreshRank(seat, celebrate = true) {
  const stats = playerStats[seat], previous = stats.level, next = rankFor(stats);
  stats.level = next;
  table.setSeatLevel(seat, next);
  if (celebrate && rankIndex(next) > rankIndex(previous))
    showLevelUp(seat, previous, next);
}
playerStats.forEach((stats, seat) => {
  stats.level = rankFor(stats);
  table.setSeatLevel(seat, stats.level);
});
updateWeaponLocks();
var originalApplyAction = game.applyAction.bind(game);
game.applyAction = (seat, action) => {
  const result = originalApplyAction(seat, action);
  const stats = playerStats[seat];
  stats.decisions++;
  if (action.type === "fold")
    stats.folds++;
  if (action.type === "call")
    stats.calls++;
  return result;
};
function recordHandStart() {
  game.players.forEach((p) => {
    if (p.inHand)
      playerStats[p.seat].hands++;
  });
}
function recordWinners(seats) {
  new Set(seats).forEach((seat) => {
    playerStats[seat].wins++;
  });
  playerStats.forEach((_, seat) => refreshRank(seat, true));
}
function openPlayerStats(seat) {
  const player = game.players[seat], stats = playerStats[seat], level = rankFor(stats), panel = $("player-stats");
  panel.dataset.seat = String(seat);
  $("stats-name").textContent = seat === HERO ? `${player.name} · You` : player.name;
  $("stats-level").textContent = level.toUpperCase();
  $("stats-level").className = `rank-badge ${level.toLowerCase()}`;
  $("stats-hands").textContent = stats.hands.toLocaleString();
  $("stats-win").textContent = `${pct(stats.wins, stats.hands)}%`;
  $("stats-fold").textContent = `${pct(stats.folds, stats.decisions)}%`;
  $("stats-call").textContent = `${pct(stats.calls, stats.decisions)}%`;
  $("stats-own-actions").classList.toggle("hidden", seat !== HERO);
  $("stats-personal").classList.toggle("hidden", seat !== HERO);
  $("stats-gift").classList.toggle("hidden", seat === HERO);
  $("stats-throw").textContent = seat === HERO ? "Choose a throwable · then tap a player" : `Throw something at ${player.name}`;
  $("stats-throw").classList.remove("hidden");
  panel.classList.remove("hidden");
  $("emoji-bar").classList.add("hidden");
}
window.__setHeroIdentity = ({ avatarId = 0, photoDataUrl = "", name = "You" } = {}) => {
  const cleanName = String(name || "You").trim().slice(0, 10) || "You";
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
var toastTimer = null;
function toast(msg, ms = 2600) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}
function chat(who, text, sys = false) {
  const log = $("chatlog");
  const div = document.createElement("div");
  div.innerHTML = sys ? `<span class="sys">${text}</span>` : `<span class="who">${who}:</span> ${text}`;
  log.appendChild(div);
  while (log.children.length > 50)
    log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}
function updateHUD() {
  const s = game.snapshot();
  $("pot").textContent = s.pot.toLocaleString();
  $("street").textContent = s.street ? s.street.replace("preflop", "PRE-FLOP").toUpperCase() : "LOBBY";
  $("herostack").textContent = game.players[HERO].stack.toLocaleString();
}
function syncStacks() {
  game.players.forEach((p) => table.setStack(p.seat, p.stack));
}
function syncBetAmounts() {
  game.players.forEach((p) => table.setBetAmount(p.seat, p.betHand));
}
function syncHeroHandStrength() {
  const p = game.players[HERO], cards = [...p?.hole || [], ...game.board || []];
  if (cards.length < 5) {
    table.setHandStrength("");
    return;
  }
  if (game.rules.lowball) {
    table.setHandStrength("2–7 LOW");
    return;
  }
  const score = game.scoreFor(HERO).high;
  table.setHandStrength((CATEGORY[Math.floor(score / 1000000000000)] || "HIGH CARD").toUpperCase());
}
window.__configurePokerTable = (config) => {
  const smallBlind = Math.max(1, Number(config?.smallBlind) || 25);
  const bigBlind = Math.max(smallBlind, Number(config?.bigBlind) || 50);
  const buyIn = Math.max(bigBlind, Number(config?.buyIn) || bigBlind * 100);
  const mode = config?.mode === "tournament" ? "tournament" : "cash";
  const entryFee = mode === "tournament" ? Math.max(0, Number(config?.entryFee) || 1000) : 0;
  const prizePool = mode === "tournament" ? Math.max(entryFee, Number(config?.prizePool) || entryFee * 8) : 0;
  const playerCount = Number(config?.playerCount) === 6 ? 6 : 8;
  const sharedBalance = Number(window.NikkiflixBank?.get?.());
  if (mode === "tournament" && !window.NikkiflixBank?.debit?.(entryFee)) {
    toast(`You need ${entryFee.toLocaleString()} gold coins to enter.`);
    return false;
  }
  const variant = String(config?.variant || "holdem");
  const bettingLimit = config?.bettingLimit === "pot" ? "pot" : "no-limit";
  currentTable = {
    id: String(config?.id || "low"),
    name: String(config?.name || "Low Stakes Cash Game"),
    mode,
    variant,
    bettingLimit,
    smallBlind,
    bigBlind,
    buyIn,
    entryFee,
    prizePool,
    playerCount
  };
  window.__pokerUsesSeparateStack = mode === "tournament";
  game.setVariant(variant);
  table.setVariant(variant);
  table.setPlayerCount(playerCount);
  game.sb = smallBlind;
  game.bb = bigBlind;
  game.button = -1;
  game.handNo = 0;
  resultRecorded = false;
  tournamentFinished = false;
  game.players.forEach((player, index) => {
    player.stack = mode === "tournament" ? buyIn : index === HERO && Number.isFinite(sharedBalance) ? sharedBalance : buyIn;
    player.hole = [];
    player.folded = false;
    player.allIn = false;
    player.betStreet = 0;
    player.betHand = 0;
    player.acted = false;
    player.inHand = false;
    player.sittingOut = index >= playerCount;
  });
  heroSittingOut = false;
  $("sit-back-in").classList.add("hidden");
  table.setSeatStatus(HERO, "");
  startingStacks = game.players.map((player) => player.stack);
  table.clearHand();
  syncStacks();
  $("stakesbox").querySelector("span").textContent = mode === "tournament" ? "TOURNAMENT · L1" : game.rules.family === "stud" ? `${game.rules.name.toUpperCase()} · ANTE` : bettingLimit === "pot" ? "POT LIMIT" : game.variantId === "holdem" ? "NO LIMIT" : game.rules.name.toUpperCase();
  $("stakesbox").querySelector("strong").textContent = `${smallBlind.toLocaleString()} / ${bigBlind.toLocaleString()}`;
  $("street").textContent = currentTable.name.toUpperCase();
  $("stack-unit").textContent = mode === "tournament" ? "tournament chips" : "gold coins";
  const tableGameName = bettingLimit === "pot" ? `Pot-Limit ${game.rules.name}` : game.rules.name;
  $("start-description").textContent = mode === "tournament" ? `8-player tournament · ${entryFee.toLocaleString()} gold coin entry · ${prizePool.toLocaleString()} prize pool` : `${playerCount === 6 ? "Six-handed" : "Eight-handed"} ${tableGameName} · Gold coins`;
  $("broke-title").textContent = "Out of gold coins!";
  $("broke-message").textContent = "Your free gold coin refill is ready.";
  $("btn-rebuy").textContent = `Free refill · ${buyIn.toLocaleString()}`;
  $("leave-table-broke").textContent = "Choose another table";
  $("brokeoverlay").classList.add("hidden");
  $("actionbar").classList.add("hidden");
  $("betpanel").classList.add("hidden");
  updateHUD();
  return true;
};
var recordCashResult = () => {
  if (resultRecorded || currentTable.mode !== "cash" || game.handNo === 0)
    return;
  resultRecorded = true;
  window.NikkiflixLeaderboard?.recordCash(game.players, startingStacks);
};
var updateTournamentBlinds = () => {
  if (currentTable.mode !== "tournament")
    return;
  const levelIndex = Math.min(TOURNAMENT_LEVELS.length - 1, Math.floor(game.handNo / 3));
  const [smallBlind, bigBlind] = TOURNAMENT_LEVELS[levelIndex];
  game.sb = smallBlind;
  game.bb = bigBlind;
  $("stakesbox").querySelector("span").textContent = `TOURNAMENT · L${levelIndex + 1}`;
  $("stakesbox").querySelector("strong").textContent = `${smallBlind.toLocaleString()} / ${bigBlind.toLocaleString()}`;
  if (game.handNo > 0 && game.handNo % 3 === 0)
    toast(`Blinds up · ${smallBlind.toLocaleString()} / ${bigBlind.toLocaleString()}`, 2200);
};
var finishTournament = (place) => {
  if (tournamentFinished)
    return;
  tournamentFinished = true;
  const payout = TOURNAMENT_PAYOUTS[place - 1] || 0;
  if (payout)
    window.NikkiflixBank?.credit?.(payout);
  if (place === 1)
    window.NikkiflixLeaderboard?.recordTournament(game.players[HERO].name);
  $("actionbar").classList.add("hidden");
  $("betpanel").classList.add("hidden");
  $("broke-title").textContent = place === 1 ? "Tournament champion!" : `Finished ${place}${place === 2 ? "nd" : place === 3 ? "rd" : "th"}`;
  $("broke-message").textContent = payout ? `You earned ${payout.toLocaleString()} gold coins from the ${currentTable.prizePool.toLocaleString()} prize pool.` : "Only the top three finishers earn gold coins in this event.";
  $("btn-rebuy").textContent = "Return to poker room";
  $("leave-table-broke").textContent = "View leaderboard";
  $("brokeoverlay").classList.remove("hidden");
  const done = () => leavePokerTable();
  $("btn-rebuy").onclick = done;
  $("leave-table-broke").onclick = done;
};
var leavePokerTable = () => {
  if (!tableActive)
    return;
  recordCashResult();
  tableActive = false;
  tableSession++;
  cancelHeroTurn?.();
  cancelBrokeWait?.();
  cancelHeroTurn = null;
  cancelBrokeWait = null;
  $("actionbar").classList.add("hidden");
  $("betpanel").classList.add("hidden");
  $("sit-back-in").classList.add("hidden");
  $("brokeoverlay").classList.add("hidden");
  $("chatpanel").classList.add("hidden");
  table.setTurnTimer({ active: false, remaining: 0, warning: false });
  stopAmbience();
  table.setActiveSeat(-1);
  if (currentTable.mode === "cash")
    window.NikkiflixBank?.set?.(game.players[HERO].stack);
  window.dispatchEvent(new CustomEvent("nikkiflix:leave-poker"));
  window.__pokerUsesSeparateStack = false;
};
$("leave-table").onclick = leavePokerTable;
$("leave-table-broke").onclick = leavePokerTable;
$("chatbtn").onclick = () => $("chatpanel").classList.toggle("hidden");
$("sound-toggle").onclick = () => {
  soundEnabled = !soundEnabled;
  const button = $("sound-toggle");
  button.setAttribute("aria-pressed", String(soundEnabled));
  button.textContent = soundEnabled ? "Sound on" : "Sound off";
  button.setAttribute("aria-label", soundEnabled ? "Turn table sound off" : "Turn table sound on");
  if (soundEnabled) {
    initAudio();
    if (audioMaster)
      audioMaster.gain.value = 0.72;
    startAmbience();
    tone(660, 0.12, 0.08, "sine");
  } else {
    if (audioMaster)
      audioMaster.gain.value = 0;
    stopAmbience();
    window.speechSynthesis?.cancel?.();
  }
};
function alertTurn(warning = false) {
  if (navigator.vibrate)
    navigator.vibrate(warning ? [160, 70, 160] : [90, 45, 120]);
  if (warning) {
    tone(180, 0.24, 0.15, "sawtooth");
    noiseBurst(0.24, 0.065, 560, 0.02);
  } else {
    tone(784, 0.14, 0.16, "sine");
    tone(1046, 0.18, 0.14, "triangle", 0.12);
  }
}
function heroTurn(act) {
  return new Promise((resolve) => {
    window.__heroTurn = true;
    let over = false, remaining = 30, warned = false;
    const bar = $("actionbar");
    const cf = $("btn-checkfold"), cc = $("btn-checkcall"), br = $("btn-betraise");
    bar.classList.remove("hidden");
    table.setTurnTimer({ active: true, remaining: 30, total: 30, warning: false });
    alertTurn(false);
    if (act.canCheck)
      cc.textContent = "Check";
    else
      cc.textContent = `Call ${act.toCall}`;
    br.textContent = act.toCall > 0 ? "Raise" : "Bet";
    const timer = setInterval(() => {
      if (over)
        return;
      remaining--;
      if (remaining === 10) {
        warned = true;
        alertTurn(true);
      }
      table.setTurnTimer({ active: true, remaining, total: 30, warning: warned });
      if (remaining <= 0) {
        over = true;
        window.__heroTurn = false;
        game.applyAction(HERO, { type: "fold" });
        game.players[HERO].sittingOut = true;
        heroSittingOut = true;
        table.foldSeat(HERO);
        table.setSeatStatus(HERO, "SITTING OUT");
        chat(null, "Time expired — your hand folded. You are sitting out.", true);
        toast("Sitting out · Tap to return", 3200);
        finish(true);
      }
    }, 1000);
    const finish = (timedOut = false) => {
      clearInterval(timer);
      bar.classList.add("hidden");
      table.setTurnTimer({ active: false, remaining: 0, warning: false });
      $("betpanel").classList.add("hidden");
      cancelHeroTurn = null;
      if (timedOut)
        $("sit-back-in").classList.remove("hidden");
      resolve();
    };
    cancelHeroTurn = () => {
      if (over)
        return;
      over = true;
      window.__heroTurn = false;
      finish();
    };
    const once = (fn) => () => {
      if (over)
        return;
      over = true;
      window.__heroTurn = false;
      fn();
    };
    $("btn-fold").onclick = once(() => {
      game.applyAction(HERO, { type: "fold" });
      table.setActionBadge(HERO, "FOLD");
      table.foldSeat(HERO);
      chat(null, "You fold.", true);
      finish();
    });
    cf.onclick = once(async () => {
      if (act.canCheck) {
        game.applyAction(HERO, { type: "check" });
        table.setActionBadge(HERO, "CHECK");
        await table.playAnimation(HERO, "knock");
        chat(null, "You check.", true);
      } else {
        game.applyAction(HERO, { type: "fold" });
        table.setActionBadge(HERO, "FOLD");
        table.foldSeat(HERO);
        chat(null, "You fold.", true);
      }
      finish();
    });
    cc.onclick = once(async () => {
      const p = game.players[HERO], before = p.betStreet;
      game.applyAction(HERO, act.canCheck ? { type: "check" } : { type: "call" });
      const committed = p.betStreet - before;
      table.setBetAmount(HERO, p.betHand);
      table.setActionBadge(HERO, act.canCheck ? "CHECK" : "CALL");
      if (act.canCheck)
        await table.playAnimation(HERO, "knock");
      else if (committed > 0) {
        sfxChips();
        await table.betChips(HERO, committed);
      }
      table.setStack(HERO, p.stack);
      finish();
    });
    br.onclick = () => {
      if (!over)
        openBetPanel(act, () => {
          over = true;
          window.__heroTurn = false;
          finish();
        });
    };
  });
}
$("sit-back-in").onclick = () => {
  heroSittingOut = false;
  game.players[HERO].sittingOut = false;
  $("sit-back-in").classList.add("hidden");
  table.setSeatStatus(HERO, "");
  table.unfurlSeat(HERO);
  toast("You’re back in for the next hand");
};
function openBetPanel(act, done) {
  const p = game.players[HERO];
  const mode = act.toCall > 0 ? "raise" : "bet";
  const stackMaxTo = p.betStreet + p.stack;
  const potMaxTo = p.betStreet + act.toCall + act.pot + act.toCall;
  const maxTo = currentTable.bettingLimit === "pot" ? Math.min(stackMaxTo, potMaxTo) : stackMaxTo;
  const slider = $("betslider");
  let min;
  if (mode === "bet")
    min = Math.min(game.bb, maxTo);
  else
    min = Math.min(act.minRaiseTo, maxTo);
  slider.min = min;
  slider.max = maxTo;
  slider.step = Math.max(1, game.sb);
  slider.value = min;
  $("betamt").textContent = Number(slider.value).toLocaleString();
  $("betpanel").classList.remove("hidden");
  slider.oninput = () => {
    $("betamt").textContent = Number(slider.value).toLocaleString();
  };
  document.querySelectorAll("#betpresets button[data-mult]").forEach((b) => {
    b.onclick = () => {
      const s = game.snapshot();
      const v = Math.min(maxTo, Math.max(min, Math.round(s.pot * Number(b.dataset.mult))));
      slider.value = v;
      $("betamt").textContent = v.toLocaleString();
    };
  });
  $("preset-max").textContent = currentTable.bettingLimit === "pot" ? "Pot Max" : "All-In";
  $("preset-max").onclick = () => {
    slider.value = maxTo;
    $("betamt").textContent = maxTo.toLocaleString();
  };
  $("bet-cancel").onclick = () => {
    $("betpanel").classList.add("hidden");
  };
  let confirmed = false;
  $("bet-ok").onclick = async () => {
    if (confirmed)
      return;
    const amount = Number(slider.value);
    const before = p.betStreet;
    try {
      game.applyAction(HERO, { type: mode, amount });
    } catch (e) {
      toast("Invalid bet");
      return;
    }
    confirmed = true;
    const committed = p.betStreet - before;
    table.setBetAmount(HERO, p.betHand);
    table.setActionBadge(HERO, p.allIn ? "ALL-IN" : mode.toUpperCase());
    if (committed > 0) {
      sfxChips();
      await table.betChips(HERO, committed);
    }
    table.setStack(HERO, p.stack);
    chat(null, `You ${mode} to ${p.betStreet}.`, true);
    done();
  };
}
async function botTurn(act, session) {
  const p = game.players[act.seat];
  let remaining = 30, warned = false;
  table.setTurnTimer({ active: true, remaining, total: 30, warning: false });
  const timer = setInterval(() => {
    if (!sessionIsActive(session))
      return;
    remaining = Math.max(0, remaining - 1);
    if (remaining === 10)
      warned = true;
    table.setTurnTimer({ active: true, remaining, total: 30, warning: warned });
  }, 1000);
  try {
    await delay(650 + Math.random() * 850);
    if (!sessionIsActive(session))
      return;
    const d = decideBot(game, act.seat);
    const before = p.betStreet;
    game.applyAction(act.seat, d);
    const committed = p.betStreet - before;
    table.setBetAmount(act.seat, p.betHand);
    table.setActionBadge(act.seat, p.allIn ? "ALL-IN" : d.type.toUpperCase());
    if (d.type === "fold") {
      table.foldSeat(act.seat);
    } else if (d.type === "check") {
      await table.playAnimation(act.seat, "knock");
    } else if (committed > 0) {
      sfxChips();
      await table.betChips(act.seat, committed);
    }
    table.setStack(act.seat, p.stack);
    updateHUD();
  } finally {
    clearInterval(timer);
    table.setTurnTimer({ active: false, remaining: 0, warning: false });
  }
}
var sessionIsActive = (session) => tableActive && session === tableSession;
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
      if (choice === "muck")
        table.foldSeat(HERO);
      else {
        await table.revealSeat(HERO, toRS(p.hole));
        const line = botLine("win");
        chat("You", line);
      }
    }
    toast(`You win ${res.amount.toLocaleString()}!`);
    chat(null, `You win ${res.amount.toLocaleString()}.`, true);
  } else {
    if (res.uncontested && Math.random() < 0.18) {
      await table.revealSeat(res.seat, toRS(p.hole));
    }
    toast(`${p.name} wins ${res.amount.toLocaleString()}`);
    chat(null, `${p.name} wins ${res.amount.toLocaleString()}.`, true);
  }
}
async function handleShowdown(res) {
  recordWinners(res.pots.flatMap((pot) => pot.winners));
  for (const seat of Object.keys(res.hands).map(Number)) {
    await table.revealSeat(seat, toRS(res.hands[seat]));
    if (seat !== HERO)
      await delay(250);
  }
  for (const pot of res.pots) {
    for (const w of pot.winners) {
      await table.awardPot(w);
      table.setStack(w, game.players[w].stack);
    }
    const names = pot.winners.map((s) => s === HERO ? "You" : game.players[s].name).join(" & ");
    const msg = pot.winners.length > 1 ? `Split pot: ${names} — ${pot.desc} (${pot.amount.toLocaleString()})` : `${names} wins ${pot.amount.toLocaleString()} with ${pot.desc}`;
    toast(msg, 3200);
    chat(null, msg + ".", true);
    await delay(900);
  }
  updateHUD();
}
function showMuckChoice() {
  return new Promise((resolve) => {
    $("showmuck").classList.remove("hidden");
    $("btn-show").onclick = () => {
      $("showmuck").classList.add("hidden");
      resolve("show");
    };
    $("btn-muck").onclick = () => {
      $("showmuck").classList.add("hidden");
      resolve("muck");
    };
  });
}
var cardLabel = (card) => {
  const ranks = "23456789TJQKA", suits = ["♠", "♥", "♦", "♣"];
  return `${ranks[rankOf(card)]}${suits[suitOf(card)]}`;
};
function chooseCards(kind) {
  const hero = game.players[HERO], overlay = $("card-choice"), grid = $("card-choice-grid"), selected = new Set, limit = kind === "pineapple" ? 1 : 3;
  $("card-choice-title").textContent = kind === "pineapple" ? "Discard one card" : "Choose cards to draw";
  $("card-choice-copy").textContent = kind === "pineapple" ? "Pineapple keeps two hole cards after the flop. Pick the one card you want to release." : "Select up to three cards to replace, or stand pat.";
  grid.replaceChildren(...hero.hole.map((card, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.cardIndex = String(index);
    button.className = suitOf(card) === 1 || suitOf(card) === 2 ? "red" : "";
    button.innerHTML = `<strong>${cardLabel(card)}</strong><small>Keep</small>`;
    button.onclick = () => {
      if (selected.has(index))
        selected.delete(index);
      else {
        if (selected.size >= limit) {
          if (kind === "pineapple")
            selected.clear();
          else
            return;
        }
        selected.add(index);
      }
      button.classList.toggle("selected", selected.has(index));
      button.querySelector("small").textContent = selected.has(index) ? "Discard" : "Keep";
      $("card-choice-confirm").disabled = kind === "pineapple" && selected.size !== 1;
      $("card-choice-confirm").textContent = kind === "pineapple" ? "Discard selected" : selected.size ? `Draw ${selected.size}` : "Stand pat";
    };
    return button;
  }));
  $("card-choice-confirm").disabled = kind === "pineapple";
  $("card-choice-confirm").textContent = kind === "pineapple" ? "Choose one card" : "Stand pat";
  overlay.classList.remove("hidden");
  return new Promise((resolve) => {
    $("card-choice-confirm").onclick = () => {
      if (kind === "pineapple" && selected.size !== 1)
        return;
      overlay.classList.add("hidden");
      resolve([...selected].sort((a, b) => a - b));
    };
  });
}
async function handleSpecial(kind, session) {
  if (!sessionIsActive(session))
    return;
  const active = game.players.filter((p) => p.inHand && !p.folded);
  if (kind === "pineapple") {
    for (const p of active.filter((p2) => p2.isBot)) {
      const index = game.suggestDiscards(p.seat, 1)[0] || 0;
      game.discardPineapple(p.seat, index);
      table.removeHoleCard(p.seat, index);
    }
    if (!game.players[HERO].folded) {
      const [index] = await chooseCards("pineapple");
      game.discardPineapple(HERO, index);
      table.removeHoleCard(HERO, index);
      chat(null, "You discarded one card for Pineapple.", true);
    }
    return;
  }
  if (kind === "draw") {
    for (const p of active.filter((p2) => p2.isBot)) {
      const indexes = game.suggestDiscards(p.seat, 3), drawn = game.replaceCards(p.seat, indexes);
      await table.replaceHoleCards(p.seat, indexes, toRS(drawn), HERO, game.faceUpIndexes());
      table.setActionBadge(p.seat, indexes.length ? `DRAW ${indexes.length}` : "PAT");
    }
    if (!game.players[HERO].folded) {
      const indexes = await chooseCards("draw"), drawn = game.replaceCards(HERO, indexes);
      await table.replaceHoleCards(HERO, indexes, toRS(drawn), HERO, []);
      table.setActionBadge(HERO, indexes.length ? `DRAW ${indexes.length}` : "PAT");
      chat(null, indexes.length ? `You draw ${indexes.length}.` : "You stand pat.", true);
      syncHeroHandStrength();
    }
  }
}
async function playHand(session) {
  if (!sessionIsActive(session))
    return;
  updateTournamentBlinds();
  const info = game.beginHand();
  if (info.error)
    return;
  recordHandStart();
  table.clearHand();
  syncBetAmounts();
  syncStacks();
  updateHUD();
  table.setDealerButton(info.button);if(typeof table.setBlindButtons==='function')table.setBlindButtons(info.sbSeat,info.bbSeat);
  chat(null, `— ${currentTable.name} · Hand #${game.handNo} —`, true);
  for (const post of info.posts || []) {
    if (post.amount > 0)
      await table.betChips(post.seat, post.amount);
    if (!sessionIsActive(session))
      return;
  }
  syncStacks();
  updateHUD();
  sfxShuffle();
  await table.shuffleDeck();
  const hole = game.players.map((p) => p.inHand ? toRS(p.hole) : null);
  const dealSounds = setInterval(sfxDeal, 235);
  await table.dealHoleCards(hole, HERO, game.faceUpIndexes());
  clearInterval(dealSounds);
  if (!sessionIsActive(session))
    return;
  for (;; ) {
    let act;
    while (sessionIsActive(session) && (act = game.nextAction())) {
      table.setActiveSeat(act.seat);
      if (act.seat === HERO)
        await heroTurn(act);
      else
        await botTurn(act, session);
      if (!sessionIsActive(session))
        return;
      updateHUD();
    }
    if (!sessionIsActive(session))
      return;
    table.setActiveSeat(-1);
    const res = game.advance();
    if (!res)
      break;
    if (res.type === "street") {
      if (res.cards?.length) {
        const startIdx = res.street === "flop" ? 0 : res.street === "turn" ? 3 : 4;
        await table.dealBoard(toRS(res.cards), startIdx);
      }
      if (res.privateCards && Object.keys(res.privateCards).length) {
        const converted = Object.fromEntries(Object.entries(res.privateCards).map(([seat, cards]) => [seat, toRS(cards)]));
        await table.dealPrivateCards(converted, HERO, game.faceUpIndexes());
      }
      if (!sessionIsActive(session))
        return;
      if (res.special)
        await handleSpecial(res.special, session);
      if (!sessionIsActive(session))
        return;
      syncHeroHandStrength();
      toast(res.street.toUpperCase(), 1400);
      chat(null, `— ${res.street} —`, true);
      updateHUD();
    } else if (res.type === "win") {
      await handleWin(res);
      break;
    } else if (res.type === "showdown") {
      await handleShowdown(res);
      break;
    }
  }
  table.endHand();
  if (sessionIsActive(session) && Math.random() < 0.12) {
    const seated = game.players.filter((p2) => p2.isBot && p2.stack > 0);
    const p = seated[Math.random() * seated.length | 0];
    const line = botLine();
    table.say(p.seat, line);
    chat(p.name, line);
  }
  if (sessionIsActive(session))
    await delay(3200);
}
$("tip-dealer").onclick = async () => {
  const tip = 25, p = game.players[HERO];
  if (p.stack < tip) {
    toast("You need 25 gold coins to tip");
    return;
  }
  p.stack -= tip;
  if (currentTable.mode === "cash")
    window.NikkiflixBank?.debit?.(tip);
  table.setStack(HERO, p.stack);
  updateHUD();
  sfxChips();
  const total = await table.tipDealer(HERO, tip);
  toast(`Dealer tipped 25 · Table tips ${total.toLocaleString()}`);
};
function clearThrowSelection() {
  selectedThrow = null;
  $("throw-hint").classList.add("hidden");
  document.querySelectorAll("[data-throw]").forEach((button) => button.classList.remove("selected"));
}
function openThrowPicker(targetSeat = HERO) {
  throwPickerTarget = Number.isInteger(targetSeat) ? targetSeat : HERO;
  throwPickerMode = throwPickerTarget === HERO ? "arm" : "instant";
  clearThrowSelection();
  const target = game.players[throwPickerTarget];
  $("throw-picker-instruction").textContent = throwPickerMode === "arm" ? "Pick one, then tap a player" : `Tap one to throw now at ${target?.name || "this player"}`;
  $("player-stats").classList.add("hidden");
  $("emoji-bar").classList.remove("hidden");
  $("emoji-toggle").setAttribute("aria-expanded", "true");
}
function throwAtSeat(seat, item) {
  const target = game.players[seat];
  if (!target)
    return false;
  const price = item.price;
  if (price > 0 && !window.NikkiflixBank?.debit?.(price)) {
    toast(`You need ${price.toLocaleString()} gold coins`);
    return false;
  }
  if (price > 0 && currentTable.mode === "cash") {
    game.players[HERO].stack = Math.max(0, Number(window.NikkiflixBank?.get?.()) || 0);
    table.setStack(HERO, game.players[HERO].stack);
    updateHUD();
  }
  table.throwReaction(HERO, seat, item);
  chat(null, `You threw ${item.type} at ${target.name}${price ? ` for ${price} gold coins` : ""}.`, true);
  return true;
}
$("emoji-toggle").onclick = () => {
  const bar = $("emoji-bar"), opening = bar.classList.contains("hidden");
  if (opening)
    openThrowPicker(HERO);
  else {
    bar.classList.add("hidden");
    $("emoji-toggle").setAttribute("aria-expanded", "false");
  }
  $("player-stats").classList.add("hidden");
};
$("stats-close").onclick = () => $("player-stats").classList.add("hidden");
$("stats-throw").onclick = () => openThrowPicker(Number($("player-stats").dataset.seat));
document.querySelectorAll("[data-throw]").forEach((button) => button.onclick = () => {
  if (button.disabled)
    return;
  const needed = button.dataset.unlockLevel;
  if (needed && rankIndex(rankFor(playerStats[HERO])) < rankIndex(needed)) {
    toast(`${needed} rank required`);
    return;
  }
  const item = { type: button.dataset.throw, glyph: button.dataset.glyph, price: Number(button.dataset.price) || 0 };
  if (throwPickerMode === "instant") {
    if (throwAtSeat(throwPickerTarget, item)) {
      $("emoji-bar").classList.add("hidden");
      $("emoji-toggle").setAttribute("aria-expanded", "false");
      clearThrowSelection();
    }
    return;
  }
  selectedThrow = item;
  document.querySelectorAll("[data-throw]").forEach((b) => b.classList.toggle("selected", b === button));
  $("emoji-bar").classList.add("hidden");
  $("emoji-toggle").setAttribute("aria-expanded", "false");
  $("throw-hint").classList.remove("hidden");
});
document.querySelectorAll("[data-gesture]").forEach((button) => button.onclick = () => {
  clearThrowSelection();
  table.playAnimation(HERO, button.dataset.gesture);
  $("player-stats").classList.add("hidden");
  $("emoji-bar").classList.add("hidden");
  $("emoji-toggle").setAttribute("aria-expanded", "false");
});
window.addEventListener("nikkiflix:seat-tap", (event) => {
  const seat = event.detail.seat;
  if (selectedThrow) {
    if (throwAtSeat(seat, selectedThrow))
      clearThrowSelection();
    return;
  }
  openPlayerStats(seat);
});
async function main(session) {
  while (sessionIsActive(session)) {
    const active = game.players.filter((p) => p.stack > 0);
    if (currentTable.mode === "tournament") {
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
        game.players.filter((p) => p.isBot).forEach((p) => {
          p.stack = currentTable.buyIn;
        });
        syncStacks();
        toast("The cash table has been restacked");
        await delay(1500);
        if (!sessionIsActive(session))
          return;
      }
      if (game.players[HERO].stack <= 0) {
        await new Promise((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled)
              return;
            settled = true;
            cancelBrokeWait = null;
            resolve();
          };
          cancelBrokeWait = finish;
          $("broke-title").textContent = "Out of gold coins!";
          $("broke-message").textContent = "Your free gold coin refill is ready.";
          $("btn-rebuy").textContent = `Free refill · ${currentTable.buyIn.toLocaleString()}`;
          $("brokeoverlay").classList.remove("hidden");
          $("btn-rebuy").onclick = () => {
            game.players[HERO].stack = currentTable.buyIn;
            window.NikkiflixBank?.set?.(currentTable.buyIn);
            $("brokeoverlay").classList.add("hidden");
            syncStacks();
            updateHUD();
            finish();
          };
        });
        if (!sessionIsActive(session))
          return;
      }
    }
    await playHand(session);
    if (sessionIsActive(session) && currentTable.mode === "cash")
      window.NikkiflixBank?.set?.(game.players[HERO].stack);
  }
}
$("btn-start").onclick = () => {
  if (tableActive)
    return;
  $("startoverlay").classList.add("hidden");
  tableActive = true;
  const session = ++tableSession;
  const welcomeGameName = currentTable.bettingLimit === "pot" ? `Pot-Limit ${game.rules.name}` : game.rules.name;
  const welcomeLine = currentTable.mode === "tournament" ? `Welcome to ${currentTable.name}. ${currentTable.entryFee.toLocaleString()} gold coin entry · ${currentTable.prizePool.toLocaleString()} prize pool · blinds rise every 3 hands.` : `Welcome to ${currentTable.name}. ${welcomeGameName} · ${game.rules.family === "stud" ? "ante / bring-in" : "blinds"} ${currentTable.smallBlind.toLocaleString()} / ${currentTable.bigBlind.toLocaleString()} · gold coins only.`;
  initAudio();
  startAmbience();
  sfxShuffle();
  chat(null, welcomeLine, true);
  main(session);
};
