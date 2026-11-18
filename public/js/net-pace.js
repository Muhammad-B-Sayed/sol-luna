// Sol & Luna — the client side of the server's input rules, for online co-op and Dodgeball
// (main.js) and the harness models of them (tools/net-coop.js). No DOM. docs/netcode.md.
// The Runner modes do the same inside public/js/runner-sync.js.

export const MAX_TICKS_PER_FRAME = 8;
export const MAX_BACKLOG = 1000;   // ms of missed ticks a client catches up after a stall

// Pacing. The server reports the smallest length of your input queue over the last second
// (m.qm). Run 3% slower above 3 ticks and 3% faster below 1: a small cushion that jitter never
// empties, and no more delay than that.
export function paceRate(qm) { return qm == null ? 1 : qm > 3 ? 0.97 : qm < 1 ? 1.03 : 1; }

// The inputs a replay applies on a snapshot. While your inputs were late the server held your
// last keys (m.inp[me]) for m.d[me] ticks; when they arrive it skips that many of them that
// equal the held keys (the hold already applied them), so the replay skips them too.
export function unapplied(pending, m, me) {
  const held = m.d ? m.d[me] | 0 : 0, hv = m.inp[me] | 0;
  let k = 0;
  while (k < held && k < pending.length && pending[k][1] === hv) k++;
  return k ? pending.slice(k) : pending;
}
