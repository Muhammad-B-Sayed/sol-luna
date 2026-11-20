// Online co-op with two browser pages against a local server, real key and mouse events.
//   node tools/playtest/online-browser.mjs            (starts its own servers on 3456 and, LAG_MS=80, 3457)
//   -> docs/img/playtest/online/, tools/playtest/out/online.json
//   PORT=3460 LAGS=80,150 ONLY=lag node tools/playtest/online-browser.mjs
//     PORT is the first port (the lag runs use PORT+1, PORT+2, ...), LAGS the LAG_MS values to
//     play level 1 at, ONLY=lag skips the lobby and no-lag section.
//
// Lobby: host, join by typed code, join by /<CODE> link, a third client is turned away, swap by
// clicking a character and by the swap button, chat both ways (and typing WASD in chat moves
// nobody), mid-level swap from the pause menu, leaving in the lobby and mid-level (peer-left).
//
// Play: each client presses only its own character's keys (the bot's winning inputs, Sol's on the
// Sol client's arrows and Luna's on the Luna client's WASD). The driver runs both clients' frames
// in lockstep at real 60 Hz (clock control from cdp.mjs) and keeps each client a few inputs ahead
// of the server, so the server pairs input k of Sol with input k of Luna, as the bot did. The
// server is not touched. While playing it records, every frame, the local player's visual
// correction offset (app.off) after each snapshot and the drawn position, to find backward
// corrections and snaps.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { launch, startServer, setBits, sleep } from './cdp.mjs';

const IMG = 'docs/img/playtest/online';
mkdirSync(IMG, { recursive: true }); mkdirSync('tools/playtest/out', { recursive: true });
const out = { checks: [], plays: [] };
const check = (name, ok, info = '') => { out.checks.push({ name, ok, info }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' · ' + info : ''}`); };
const B = await launch({ name: 'online' });
const PORT = +(process.env.PORT || 3456);
const LAGS = (process.env.LAGS || '80').split(',').map(Number);
const scr = (P) => P.eval('document.body.dataset.screen');
const waitFor = async (P, expr, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await P.eval(expr).catch(() => false)) return true; await sleep(50); } return false; };

async function room(port, tag) {
  const H = await B.page(`http://localhost:${port}/?unlock`, { clock: true });
  await H.click('#btnHost');
  await waitFor(H, `!!window.__app.room?.code`);
  const code = await H.eval('window.__app.room.code');
  const G = await B.page(`http://localhost:${port}/`, { clock: true });
  await G.click('#joinCode');
  await G.type(code.toLowerCase());
  await G.key('Enter', 'keyDown'); await G.key('Enter', 'keyUp');
  const joined = await waitFor(G, `document.body.dataset.screen === 'lobby' && window.__app.room?.players.length === 2`);
  await waitFor(H, `window.__app.room?.players.length === 2`);
  check(`${tag}: host made room ${code}; guest joined by typing the code (lower case)`, joined, `guest url ${await G.eval('location.pathname')}`);
  return { H, G, code };
}

// lockstep driver: both clients' frames at real 60 Hz, keys for each client's own character
async function play(H, G, level, tag, { lag = false } = {}) {
  const rec = JSON.parse(readFileSync(`tools/playtest/inputs/level-${level}.json`, 'utf8'));
  // expand inputs per tick
  const bits = [];
  for (const [a, b, k] of rec.rle) for (let i = 0; i < k; i++) bits.push([a, b]);
  for (let i = 0; i < 300; i++) bits.push([0, 0]);
  const me = await Promise.all([H, G].map(P => P.eval('window.__app.me')));
  const C = [H, G];
  const pick = me[0] === 0 ? [0, 1] : [1, 0];   // which client index plays Sol / Luna
  // install recorders and start clock control, then start the level from the host
  // The driver paces the clients itself (one tick per frame, the queue kept near a target), so
  // the game's own pacing from the server's queue report is pinned off on these pages: with it a
  // frame now and then runs 0 or 2 ticks and the recorded plan slips (main.js, net-pace.js).
  for (const P of C) await P.eval(`(() => {
    window.__pt.start();
    const A = window.__app;
    Object.defineProperty(A, 'qm', { configurable: true, get: () => null, set() {} });
    window.__rec = { maxBack: 0, maxOff: 0, snaps: [], frames: 0, prevDraw: null, resets: 0 };
  })()`);
  await H.eval(`document.querySelector('#lobbyPick').click()`);
  await H.frames(2);
  await H.click(`#levelGrid .lvl:nth-child(${level})`);
  for (const P of C) await waitFor(P, `window.__app.inGame && window.__app.level === ${level - 1}`, 4000);
  const shotAt = new Set([90, Math.round(rec.wonTick * 0.5)]);
  let k = 0, held = [[0, 0], [0, 0]], t0 = Date.now(), frame = 0;
  const pend = () => Promise.all(C.map(P => P.eval(`[window.__app.pending.length, Math.round(window.__app?.S?.tick || 0), document.body.dataset.screen]`)));
  const sample = (P) => P.eval(`(() => {
    const A = window.__app, R = window.__rec, i = A.me, p = A.S.p[i], o = A.off.p[i];
    // what the renderer drew this frame (app.drawn), else state plus correction offset
    const V = A.drawn && A.drawn.p.length === A.S.p.length ? A.drawn : null;
    const draw = V ? { x: V.p[i].x, y: V.p[i].y } : { x: p.x + o.x, y: p.y + o.y };
    // a death resets the level and teleports both players: that is not a correction
    if (R.tries !== A.S.tries || A.S.tick < (R.tick || 0)) { R.prevDraw = null; R.prevRemote = null; R.tries = A.S.tries; if (R.tick) R.resets++; }
    R.tick = A.S.tick;
    const mag = Math.hypot(o.x, o.y);
    R.maxOff = Math.max(R.maxOff, mag);
    // backward: correction pulls the drawn player against its own direction of motion
    if (Math.abs(p.vx) > 0.5 && Math.sign(o.x) === Math.sign(p.vx) && Math.abs(o.x) > R.maxBack) R.maxBack = Math.abs(o.x);
    if (R.prevDraw) { const d = Math.hypot(draw.x - R.prevDraw.x, draw.y - R.prevDraw.y); R.maxStep = Math.max(R.maxStep || 0, d); if (d > 14) R.snaps.push([A.S.tick, +d.toFixed(1)]); }
    R.prevDraw = draw; R.frames++;
    // the partner, as this client draws it (predicted from their last known keys, then corrected)
    const q = A.S.p[1 - i], oq = A.off.p[1 - i], dq = V ? { x: V.p[1 - i].x, y: V.p[1 - i].y } : { x: q.x + oq.x, y: q.y + oq.y };
    R.maxOffRemote = Math.max(R.maxOffRemote || 0, Math.hypot(oq.x, oq.y));
    if (R.prevRemote) { const d = Math.hypot(dq.x - R.prevRemote.x, dq.y - R.prevRemote.y); R.maxStepRemote = Math.max(R.maxStepRemote || 0, d); if (d > 14) (R.snapsRemote ||= []).push([A.S.tick, +d.toFixed(1)]); }
    R.prevRemote = dq;
  })()`);
  let ended = false;
  while (k < bits.length && !ended) {
    // regulate: keep a few unacked inputs (in flight + queued on the server)
    const [p0, p1] = await pend();
    (out.pend ||= []).push([k, p0[0], p1[0], p0[1], p1[1]]);
    const rttTicks = lag === true ? 10 : lag || 1;
    const target = rttTicks + 8;
    let n = 1;
    if (Math.min(p0[0], p1[0]) < target - 2) n = 2;
    if (Math.max(p0[0], p1[0]) > target + 4) n = 0;
    if (p0[2] === 'results' && p1[2] === 'results') { ended = true; break; }
    for (let j = 0; j < n && k < bits.length; j++, k++) {
      const [sb, lb] = bits[k];
      const want = [0, 0]; want[pick[0]] = sb; want[pick[1]] = lb;
      for (let c = 0; c < 2; c++) {
        // each client presses its own character's keys: arrows on the Sol client, WASD on the Luna client
        const who = me[c];
        if (held[c][0] !== want[c]) { await setBits(C[c], who, held[c][0], want[c]); held[c][0] = want[c]; }
      }
      await Promise.all(C.map(P => P.frames(1)));
      await Promise.all(C.map(sample));
      frame++;
      if (shotAt.has(k)) { await H.shot(`${IMG}/${tag}-host-t${k}.jpg`); await G.shot(`${IMG}/${tag}-guest-t${k}.jpg`); }
    }
    // real-time pacing: frame f is due at t0 + f * 16.67 ms
    const due = t0 + frame * (1000 / 60) - Date.now();
    if (due > 0) await sleep(due);
  }
  for (let c = 0; c < 2; c++) await setBits(C[c], me[c], held[c][0], 0);
  // keep running frames until both show results
  for (let i = 0; i < 400; i++) {
    await Promise.all(C.map(P => P.frames(1)));
    await sleep(16);
    const s = await Promise.all(C.map(scr));
    if (s.every(x => x === 'results')) break;
  }
  const fin = await Promise.all(C.map(P => P.eval(`(() => { const A = window.__app, S = A.S; return { screen: document.body.dataset.screen, me: A.me, tick: S.tick, phase: S.phase, gems: S.gm.reduce((a, b) => a + b, 0), p: S.p.map(p => [+p.x.toFixed(2), +p.y.toFixed(2)]), card: document.body.dataset.screen === 'results' ? { time: resTime.textContent, gems: resGems.textContent, rank: resRank.textContent, next: !resNext.hidden, wait: !resWait.hidden } : null, rec: { maxBack: +window.__rec.maxBack.toFixed(1), maxOff: +window.__rec.maxOff.toFixed(1), maxOffRemote: +(window.__rec.maxOffRemote || 0).toFixed(1), snapsRemote: (window.__rec.snapsRemote || []).slice(0, 10), nSnapsRemote: (window.__rec.snapsRemote || []).length, maxStep: +(window.__rec.maxStep || 0).toFixed(1), maxStepRemote: +(window.__rec.maxStepRemote || 0).toFixed(1), drawn: !!window.__app.drawn, resets: window.__rec.resets, snaps: window.__rec.snaps.slice(0, 10), nSnaps: window.__rec.snaps.length, frames: window.__rec.frames } }; })()`)));
  await H.shot(`${IMG}/${tag}-host-results.jpg`); await G.shot(`${IMG}/${tag}-guest-results.jpg`);
  const same = JSON.stringify([fin[0].gems, fin[0].p]) === JSON.stringify([fin[1].gems, fin[1].p]) && Math.abs(fin[0].tick - fin[1].tick) <= 2;
  const res = { tag, level, bot: { wonTick: rec.wonTick, gems: rec.gems }, wall: ((Date.now() - t0) / 1000).toFixed(1), frames: frame, fin, same };
  out.plays.push(res);
  check(`${tag}: level ${level} played to the results card on both clients`, fin.every(f => f.screen === 'results'), `host ${JSON.stringify(fin[0].card)} guest ${JSON.stringify(fin[1].card)}; bot won at tick ${rec.wonTick}, server state at results tick ${fin[0].tick}`);
  check(`${tag}: both clients' final state is identical`, same, `host ${JSON.stringify([fin[0].tick, fin[0].gems, fin[0].p])} guest ${JSON.stringify([fin[1].tick, fin[1].gems, fin[1].p])}`);
  check(`${tag}: host can drive the results card, guest waits`, fin[0].card?.next !== undefined && (fin[0].card?.wait === false) && (fin[1].card?.wait === true), '');
  console.log(`    largest per-frame step of the drawn player: host sees itself ${fin[0].rec.maxStep}px, partner ${fin[0].rec.maxStepRemote}px (${fin[0].rec.nSnapsRemote} steps over 14px); guest sees itself ${fin[1].rec.maxStep}px, partner ${fin[1].rec.maxStepRemote}px (${fin[1].rec.nSnapsRemote} over 14px); measured from ${fin[0].rec.drawn ? 'the drawn view' : 'state + offset'}; level resets ${fin[0].rec.resets}/${fin[1].rec.resets}`);
  console.log(`    corrections: host max offset ${fin[0].rec.maxOff}px, largest backward ${fin[0].rec.maxBack}px, snaps>14px ${fin[0].rec.nSnaps}; guest max offset ${fin[1].rec.maxOff}px, backward ${fin[1].rec.maxBack}px, snaps ${fin[1].rec.nSnaps} ${JSON.stringify(fin[1].rec.snaps)}; partner as drawn: host max offset ${fin[0].rec.maxOffRemote}px snaps ${JSON.stringify(fin[0].rec.snapsRemote)}, guest max offset ${fin[1].rec.maxOffRemote}px snaps ${JSON.stringify(fin[1].rec.snapsRemote)}`);
  for (const P of C) await P.eval('window.__pt.stop(); delete window.__app.qm; window.__app.qm = null;');
  return res;
}

if (process.env.QUICK) {
  const srv = await startServer(PORT);
  const { H, G } = await room(PORT, 'quick');
  for (let i = 0; i < +(process.env.QUICK); i++) {
    out.pend = [];
    const r = await play(H, G, 1, 'quick-l1-' + i);
    const pe = out.pend;
    console.log('    pending min/max host', Math.min(...pe.map(v => v[1])), Math.max(...pe.map(v => v[1])), 'guest', Math.min(...pe.map(v => v[2])), Math.max(...pe.map(v => v[2])), 'first', JSON.stringify(pe.slice(0, 6)));
    if (r.fin[0].screen === 'results') await H.click('#resLevels');
    else { await H.key('Escape', 'keyDown'); await H.key('Escape', 'keyUp'); await sleep(200); await H.click('#pLevels'); }
    await waitFor(H, `document.body.dataset.screen === 'lobby'`); await waitFor(G, `document.body.dataset.screen === 'lobby'`);
  }
  writeFileSync('tools/playtest/out/online-quick.json', JSON.stringify(out, null, 1));
  B.close(); srv.stop(); process.exit(0);
}
// ------------------------------------------------------------------ no added latency
if (process.env.ONLY !== 'lag') {
  const srv = await startServer(PORT);
  const { H, G, code } = await room(PORT, 'lobby');
  await H.shot(`${IMG}/lobby-host.jpg`); await G.shot(`${IMG}/lobby-guest.jpg`);
  let r = await Promise.all([H, G].map(P => P.eval('[window.__app.me, window.__app.host]')));
  check('lobby: host is Sol, guest is Luna', r[0][0] === 0 && r[1][0] === 1 && r[0][1] && !r[1][1], JSON.stringify(r));
  // join by link, a third client in a full room
  const T = await B.page(`http://localhost:${PORT}/${code}`);
  await sleep(800);
  const third = await T.eval(`[document.body.dataset.screen, document.querySelector('#toast').textContent]`);
  check('a third client opening the /<CODE> link of a full room is turned away with a message', third[0] === 'menu', JSON.stringify(third));
  await T.shot(`${IMG}/third-client-full-room.jpg`);
  await T.close();
  // swap by clicking a character slot (guest picks Sol)
  await G.click('#slotSol');
  await waitFor(G, 'window.__app.me === 0');
  r = await Promise.all([H, G].map(P => P.eval('window.__app.me')));
  check('lobby: guest clicks Sol, roles swap on both', r[0] === 1 && r[1] === 0, JSON.stringify(r));
  await H.shot(`${IMG}/lobby-after-swap-host.jpg`);
  await H.click('#lobbySwap');
  await waitFor(H, 'window.__app.me === 0');
  r = await Promise.all([H, G].map(P => P.eval('window.__app.me')));
  check('lobby: Swap characters button swaps back', r[0] === 0 && r[1] === 1, JSON.stringify(r));
  // chat in the lobby: host sends with the form, guest sees a toast and badge
  await H.click('#chatToggle');
  await H.type('hello from Sol');
  await H.key('Enter', 'keyDown'); await H.key('Enter', 'keyUp');
  await waitFor(G, `document.querySelector('#chatLog').textContent.includes('hello from Sol')`);
  const gChat = await G.eval(`({ log: document.querySelector('#chatLog').textContent, badge: document.querySelector('#chatBadge').textContent, badgeShown: !document.querySelector('#chatBadge').hidden, toast: document.querySelector('#toast').textContent })`);
  check('chat: host message reaches guest (log, badge, toast)', gChat.log.includes('hello from Sol') && gChat.badgeShown, JSON.stringify(gChat));
  await G.shot(`${IMG}/chat-guest-toast.jpg`);
  await H.key('Escape', 'keyDown'); await H.key('Escape', 'keyUp');
  check('chat: Esc closes the panel', await H.eval(`document.querySelector('#chatPanel').hidden`));

  // ---- level 1 online
  await play(H, G, 1, 'online-l1');
  // results: host presses Next level, guest follows; then the host goes back to the lobby
  // chat mid-level: open with Enter, type wasd, send; nobody moves
  // This check needs the results card. When the lockstep play above did not reach it (the driver
  // falls behind on a loaded machine; that is reported above), it is not run, and both go to
  // level 2 through the lobby instead, so the checks after it still test what they say.
  if ((await scr(H)) === 'results') {
    const under = await H.eval(`(() => { const e = document.querySelector('#resNext'), b = e.getBoundingClientRect(), t = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return { hidden: e.hidden, top: t ? (t.id || t.className || t.tagName) : null, rect: [b.x, b.y, b.width, b.height].map(Math.round), screen: document.body.dataset.screen }; })()`);
    console.log(`    Next level button: ${JSON.stringify(under)}`);
    await H.click('#resNext');
    await waitFor(G, `window.__app.inGame && window.__app.level === 1`);
    check('results: host Next level takes both clients to level 2', (await G.eval('window.__app.level')) === 1 && (await H.eval('window.__app.level')) === 1,
      JSON.stringify(await Promise.all([H, G].map(P => P.eval('[window.__app.level, window.__app.inGame, document.body.dataset.screen, window.__app.room?.players.length]')))));
  } else {
    console.log('skip results: host Next level takes both clients to level 2 · not run: level 1 did not reach the results card');
    out.checks.push({ name: 'results: host Next level takes both clients to level 2', ok: null, info: 'not run: no results card' });
    await H.key('Escape', 'keyDown'); await H.key('Escape', 'keyUp'); await sleep(200);
    await H.click('#pLevels');
    await waitFor(H, `document.body.dataset.screen === 'lobby'`); await waitFor(G, `document.body.dataset.screen === 'lobby'`);
    await H.click('#lobbyPick'); await sleep(200);
    await H.click('#levelGrid .lvl:nth-child(2)');
    await waitFor(G, `window.__app.inGame && window.__app.level === 1`);
  }
  await sleep(500);
  const before = await H.eval('window.__app.S.p[window.__app.me].x');
  await H.key('Enter', 'keyDown'); await H.key('Enter', 'keyUp');
  await sleep(100);
  const open = await H.eval(`[!document.querySelector('#chatPanel').hidden, document.activeElement?.id]`);
  await H.type('wasd dddd');
  await H.key('Enter', 'keyDown'); await H.key('Enter', 'keyUp');
  await sleep(600);
  const after = await H.eval(`[window.__app.S.p[window.__app.me].x, document.activeElement?.id || document.activeElement?.tagName]`);
  const gotIt = await waitFor(G, `document.querySelector('#chatLog').textContent.includes('wasd dddd')`, 2000);
  check('chat mid-level: Enter opens chat, typed WASD moves nobody, Enter sends and hands keys back', open[0] && open[1] === 'chatInput' && Math.abs(after[0] - before) < 0.01 && gotIt && after[1] !== 'chatInput', `${JSON.stringify(open)} x ${before}->${after[0]} focus after send ${after[1]}`);
  await H.shot(`${IMG}/chat-mid-level-host.jpg`); await G.shot(`${IMG}/chat-mid-level-guest.jpg`);
  // pause: Esc on the host pauses the room for both; the guest's card says who paused; the
  // ticks stop on both; the guest resumes, both count down, both run again
  const PZ = `(() => { const c = document.querySelector('#resumeCount'); return { screen: document.body.dataset.screen, tick: window.__app.S.tick,
    note: document.querySelector('#pauseOnline').hidden ? '' : document.querySelector('#pauseOnline').textContent, count: c.hidden ? '' : c.textContent } })()`;
  const hostName = (await H.eval('window.__app.me')) ? 'Luna' : 'Sol';
  await H.key('Escape', 'keyDown'); await H.key('Escape', 'keyUp');
  await sleep(500);
  const z1 = await Promise.all([H, G].map(P => P.eval(PZ)));
  check('pause online: Esc on one page shows the pause card on both, and the other page says who paused', z1.every(z => z.screen === 'pause') && z1[1].note === `${hostName} paused the game.` && /^You paused/.test(z1[0].note), JSON.stringify(z1));
  await sleep(1200);
  const z2 = await Promise.all([H, G].map(P => P.eval(PZ)));
  check('pause online: the ticks stop on both', z2.every((z, i) => z.tick === z1[i].tick), z2.map((z, i) => `${z1[i].tick}→${z.tick}`).join(', '));
  await G.click('#pResume');
  await sleep(250);
  const z3 = await Promise.all([H, G].map(P => P.eval(PZ)));
  await G.shot(`${IMG}/pause-online-countdown-guest.jpg`);
  check('pause online: Resume on the other page shows the countdown on both, still frozen', z3.every((z, i) => z.screen === 'game' && /^[123]/.test(z.count) && z.tick === z1[i].tick), JSON.stringify(z3));
  const counted = await Promise.all([H, G].map(P => waitFor(P, `document.querySelector('#resumeCount').hidden`, 4000)));
  await sleep(500);
  const z4 = await Promise.all([H, G].map(P => P.eval(PZ)));
  check('pause online: after the countdown both run again', counted.every(Boolean) && z4.every((z, i) => z.tick > z1[i].tick + 10), z4.map((z, i) => `${z1[i].tick}→${z.tick}`).join(', '));
  // mid-level swap from the pause menu
  await G.key('Escape', 'keyDown'); await G.key('Escape', 'keyUp');
  await sleep(200);
  await G.shot(`${IMG}/pause-online-guest.jpg`);
  await G.click('#pSwap');
  await waitFor(G, 'window.__app.me === 0', 3000);
  r = await Promise.all([H, G].map(P => P.eval('[window.__app.me, window.__app.S.tick, window.__app.level, document.body.dataset.screen]')));
  check('pause > Swap characters mid-level: roles swap and the level restarts for both', r[0][0] === 1 && r[1][0] === 0 && r[0][1] < 60 && r[0][2] === 1, JSON.stringify(r));
  // play level 10 with swapped roles (host is Luna now)
  await H.key('Escape', 'keyDown'); await H.key('Escape', 'keyUp'); await sleep(200);
  await H.click('#pLevels');
  await waitFor(H, `document.body.dataset.screen === 'lobby'`);
  await waitFor(G, `document.body.dataset.screen === 'lobby'`);
  check('pause > Level select (online) returns both to the lobby', (await scr(H)) === 'lobby' && (await scr(G)) === 'lobby');
  await play(H, G, 10, 'online-l10-swapped');
  // leaving: guest leaves from the results card's level select / lobby
  await H.click('#resLevels');
  await waitFor(G, `document.body.dataset.screen === 'lobby'`);
  await G.click('#lobbyLeave');
  await waitFor(H, `window.__app.room?.players.length === 1`);
  const left = await H.eval(`({ status: document.querySelector('#lobbyStatus').textContent, slots: [slotSol.textContent, slotLuna.textContent], toast: document.querySelector('#toast').textContent, chat: document.querySelector('#chatLog').textContent })`);
  check('guest leaves the lobby: host sees the empty slot', left.slots.includes('Waiting…'), JSON.stringify(left));
  await H.shot(`${IMG}/host-after-guest-left-lobby.jpg`);
  // rejoin by link, start a level, guest quits mid-level -> host gets peer-left
  await G.send('Page.navigate', { url: `http://localhost:${PORT}/${code}` });
  await waitFor(G, `window.__app.room?.players.length === 2`, 5000);
  check('guest rejoins by /<CODE> link', (await G.eval('window.__app.room?.players.length')) === 2, await G.eval('location.pathname'));
  await H.click('#lobbyPick'); await sleep(200);
  await H.click('#levelGrid .lvl:nth-child(2)');
  await waitFor(G, `window.__app.inGame`);
  await sleep(500);
  await G.key('Escape', 'keyDown'); await G.key('Escape', 'keyUp'); await sleep(150);
  await G.click('#pQuit');
  await waitFor(H, `document.body.dataset.screen === 'lobby'`, 4000);
  const pl = await H.eval(`({ screen: document.body.dataset.screen, toast: document.querySelector('#toast').textContent, chat: document.querySelector('#chatLog').textContent.slice(-60) })`);
  check('guest quits mid-level: host returns to the lobby with "partner left"', pl.screen === 'lobby' && /left/.test(pl.toast + pl.chat), JSON.stringify(pl));
  await H.shot(`${IMG}/host-peer-left-mid-level.jpg`);
  await G.shot(`${IMG}/guest-after-quit.jpg`);
  await H.close(); await G.close();
  srv.stop();
}

// ------------------------------------------------------------------ LAG_MS=80 (160 ms round trip) and others
for (const [j, lag] of LAGS.entries()) {
  const srv = await startServer(PORT + 1 + j, { LAG_MS: String(lag) });
  const { H, G } = await room(PORT + 1 + j, `lag${lag}`);
  await play(H, G, 1, `lag${lag}-l1`, { lag: Math.ceil(lag / 8) });
  await H.close(); await G.close();
  srv.stop();
}

writeFileSync(process.env.ONLY === 'lag' ? 'tools/playtest/out/online-lag.json' : 'tools/playtest/out/online.json', JSON.stringify(out, null, 1));
if (B.pageErrors.length) console.log('page errors:', B.pageErrors.slice(0, 5));
B.close();
process.exit(0);
