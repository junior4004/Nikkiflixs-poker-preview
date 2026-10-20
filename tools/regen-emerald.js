/* Regenerate the Emerald (green) table from the canonical red table.
   Swaps: title, felt base color, felt texture photo, lobby thumb gradient. */
const fs = require('fs');
const RED = '/home/hatch/workspace/poker-push/assets/rooms/poker/table-red-3d-v2.html';
const GREEN = '/home/hatch/workspace/poker-push/assets/rooms/poker/table-emerald-FINAL.html';
let h = fs.readFileSync(RED, 'utf8');
const swaps = [
  ['<title>Nikkiflixs Poker Room</title>', '<title>Emerald Room — Nikkiflixs Poker</title>'],
  ['#801225', '#0e5b2c'],
  ['red-velvet-felt.jpg', 'green-velvet-felt.jpg'],
  ['#8e2434,#5c1220', '#1d8a46,#0e5b2c'],
];
for (const [a, b] of swaps) {
  if (!h.includes(a)) throw new Error('emerald swap source missing: ' + a);
  h = h.split(a).join(b);
}
fs.writeFileSync(GREEN, h);
console.log('emerald regenerated, bytes:', h.length);
