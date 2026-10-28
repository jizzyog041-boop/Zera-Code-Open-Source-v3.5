// Live bot status panel: ONE image message in the status channel that is edited every ~45s (never re-posted).
const os = require('os'), fs = require('fs'), path = require('path');
const cfg = require('./config'), db = require('./db'), P = require('./premium'), M = require('./music/manager');
let C = null; try { C = require('@napi-rs/canvas'); } catch { console.warn('[status] @napi-rs/canvas missing → text-only status'); }
try { require('./music/card'); } catch {}   // registers the Poppins fonts
const W = 1200, PAD = 40, Y = '#3CFF79', Y2 = '#7AFFAB', Y3 = '#03FF50', CARD = '#1C2E25', LINE = '#30453a', CREAM = '#E6FFEE', MUTED = '#75a384', WARN = '#FF5A5F';
const B = s => `${s}px ZeraBold, ZeraFreeBold, sans-serif`, Mx = s => `${s}px ZeraMed, ZeraFree, sans-serif`;

// ---------- metrics ----------
const rd = f => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return null; } };
const bytes = n => { const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < 4) { n /= 1024; i++; } return `${n >= 100 || i === 0 ? n.toFixed(0) : n.toFixed(1)} ${u[i]}`; };
const dur = ms => { let s = Math.floor(ms / 1000); const d = Math.floor(s / 86400); s %= 86400; const h = Math.floor(s / 3600); s %= 3600; return { big: d ? `${d}d ${String(h).padStart(2, '0')}h` : `${h}h ${String(Math.floor(s / 60)).padStart(2, '0')}m`, small: d ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s % 60}s` }; };
let lastCpu = process.cpuUsage(), lastT = process.hrtime.bigint();
function cpu() {
  const u = process.cpuUsage(lastCpu), now = process.hrtime.bigint(), dt = Number(now - lastT) / 1000; lastCpu = process.cpuUsage(); lastT = now;
  let cores = 1; const q = rd('/sys/fs/cgroup/cpu.max'); if (q && !q.startsWith('max')) { const [a, b] = q.split(' ').map(Number); if (a && b) cores = a / b; }
  return { pct: Math.max(0, (u.user + u.system) / dt / cores * 100), cores };
}
function mem() {
  let limit = os.totalmem(); const v = rd('/sys/fs/cgroup/memory.max') || rd('/sys/fs/cgroup/memory/memory.limit_in_bytes');
  if (v && v !== 'max' && Number(v) > 0 && Number(v) < limit) limit = Number(v);
  const used = process.memoryUsage().rss; return { used, limit, pct: used / limit * 100 };
}
function disk() { try { const s = fs.statfsSync(process.cwd()), total = s.bsize * s.blocks, used = total - s.bsize * s.bavail; return { used, total, pct: used / total * 100 }; } catch { return null; } }
const net = { last: null, first: null, inH: [], outH: [], inRate: 0, outRate: 0, total: { rx: 0, tx: 0 } };
function netBytes() {
  const t = rd('/proc/net/dev'); if (!t) return null; let rx = 0, tx = 0;
  for (const l of t.split('\n').slice(2)) { const [n, rest] = l.split(':'); if (!rest || n.trim() === 'lo') continue; const f = rest.trim().split(/\s+/).map(Number); rx += f[0] || 0; tx += f[8] || 0; }
  return { rx, tx };
}
function sampleNet() {
  const c = netBytes(), now = Date.now(); if (!c) return; net.first ??= c;
  if (net.last) { const dt = (now - net.last.t) / 1000 || 1; net.inRate = Math.max(0, (c.rx - net.last.rx) / dt); net.outRate = Math.max(0, (c.tx - net.last.tx) / dt); net.inH.push(net.inRate); net.outH.push(net.outRate); if (net.inH.length > 40) { net.inH.shift(); net.outH.shift(); } }
  net.last = { ...c, t: now }; net.total = { rx: c.rx - net.first.rx, tx: c.tx - net.first.tx };
}
function gather(client) {
  const guilds = [...client.guilds.cache.values()], players = M.lm?.players;
  const voice = guilds.filter(g => g.members.me?.voice?.channelId).map(g => {
    const ch = g.channels.cache.get(g.members.me.voice.channelId), p = players?.get?.(g.id), cur = p?.queue?.current?.info;
    return { guild: g.name, vc: ch?.name || 'voice', n: ch?.members?.filter(m => !m.user.bot).size || 0, playing: !!(p?.playing && !p?.paused), track: cur?.title || null };
  }).sort((a, b) => b.n - a.n);
  const tiers = guilds.map(g => P.tierOf(g.id, null));
  return { ping: client.ws.ping, up: client.uptime || 0, cpu: cpu(), mem: mem(), disk: disk(), net: netBytes() ? net : null, servers: guilds.length, users: guilds.reduce((a, g) => a + g.memberCount, 0), voice, pro: tiers.filter(t => t === 'pro' || t === 'nextgen').length, plus: tiers.filter(t => t === 'plus').length, commands: require('./commands').commands.size };
}

// ---------- drawing ----------
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
const txt = (c, s, x, y, font, color, align = 'left') => { c.font = font; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillText(s, x, y); };
const fit = (c, s, font, max) => { c.font = font; if (c.measureText(s).width <= max) return s; while (s.length > 1 && c.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; };
function card(c, x, y, w, h) {
  rr(c, x, y, w, h, 22); c.fillStyle = CARD; c.fill(); c.lineWidth = 2; c.strokeStyle = LINE; c.stroke();
  c.save(); rr(c, x, y, w, h, 22); c.clip(); const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, Y); g.addColorStop(1, Y3); c.fillStyle = g; c.fillRect(x, y, w, 5); c.restore();
}
function gauge(c, cx, cy, r, pct) {
  c.lineCap = 'round'; c.lineWidth = 15; c.strokeStyle = '#293f34'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
  const p = Math.max(0, Math.min(1, pct / 100)), hot = pct >= 85;
  if (p > 0.005) { const g = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r); g.addColorStop(0, hot ? '#FF9A9D' : Y2); g.addColorStop(1, hot ? WARN : Y3); c.strokeStyle = g; c.beginPath(); c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); c.stroke(); }
  txt(c, `${pct.toFixed(pct < 10 ? 1 : 0)}%`, cx, cy + 12, B(34), CREAM, 'center');
}
function spark(c, x, y, w, h, arr) {
  const max = Math.max(...arr, 1), n = Math.max(arr.length, 2), pts = (arr.length ? arr : [0, 0]).map((v, i) => [x + i * (w / (n - 1)), y + h - (v / max) * h]);
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(60,255,121,0.35)'); g.addColorStop(1, 'rgba(60,255,121,0)');
  c.beginPath(); c.moveTo(pts[0][0], y + h); pts.forEach(p => c.lineTo(p[0], p[1])); c.lineTo(pts[pts.length - 1][0], y + h); c.closePath(); c.fillStyle = g; c.fill();
  c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.lineWidth = 3; c.lineJoin = 'round'; c.strokeStyle = Y; c.stroke();
}
function render(d) {
  const rows = Math.min(6, d.voice.length), H = 700 + 56 + Math.max(1, rows) * 52 + 70;
  const cv = C.createCanvas(W, H), c = cv.getContext('2d');
  const bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#121D17'); bg.addColorStop(1, '#1f1829'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
  for (const [gx, gy] of [[0, 0], [W, H * 0.45]]) { const g = c.createRadialGradient(gx, gy, 0, gx, gy, 520); g.addColorStop(0, 'rgba(60,255,121,0.16)'); g.addColorStop(1, 'rgba(60,255,121,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  rr(c, 8, 8, W - 16, H - 16, 28); c.lineWidth = 3; c.strokeStyle = Y; c.stroke();
  // header
  txt(c, 'ZERA STATUS', PAD + 8, 78, B(46), Y);
  txt(c, 'Live bot statistics • refreshes every minute', PAD + 10, 108, Mx(20), MUTED);
  rr(c, W - PAD - 250, 48, 250, 56, 28); c.fillStyle = 'rgba(60,255,121,0.12)'; c.fill(); c.lineWidth = 2; c.strokeStyle = Y; c.stroke();
  c.beginPath(); c.arc(W - PAD - 215, 76, 9, 0, Math.PI * 2); c.fillStyle = Y; c.fill();
  txt(c, 'ONLINE', W - PAD - 190, 86, B(24), Y); txt(c, `${Math.max(0, Math.round(d.ping))}ms`, W - PAD - 24, 86, Mx(22), CREAM, 'right');
  // row A
  const cw = (W - PAD * 2 - 60) / 4, ya = 140, ha = 240;
  const gauges = [['CPU USAGE', d.cpu.pct, `${d.cpu.pct.toFixed(1)}% of ${d.cpu.cores % 1 ? d.cpu.cores.toFixed(1) : d.cpu.cores} vCore`], ['MEMORY', d.mem.pct, `${bytes(d.mem.used)} / ${bytes(d.mem.limit)}`], ['DISK', d.disk?.pct ?? 0, d.disk ? `${bytes(d.disk.used)} / ${bytes(d.disk.total)}` : 'N/A']];
  gauges.forEach(([l, p, sub], i) => { const x = PAD + i * (cw + 20); card(c, x, ya, cw, ha); txt(c, l, x + 24, ya + 42, B(18), MUTED); gauge(c, x + cw / 2, ya + 125, 62, Math.min(100, p)); txt(c, sub, x + cw / 2, ya + 220, Mx(18), CREAM, 'center'); });
  { const x = PAD + 3 * (cw + 20), u = dur(d.up); card(c, x, ya, cw, ha); txt(c, 'UPTIME', x + 24, ya + 42, B(18), MUTED); txt(c, u.big, x + cw / 2, ya + 125, B(46), Y, 'center'); txt(c, u.small, x + cw / 2, ya + 162, Mx(26), CREAM, 'center');
    txt(c, `Since ${new Date(Date.now() - d.up).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`, x + cw / 2, ya + 220, Mx(17), MUTED, 'center'); }
  // row B (network)
  const yb = 400, hb = 160, nw = (W - PAD * 2 - 20) / 2;
  [['NETWORK (INBOUND)', d.net?.inRate, d.net?.inH, d.net?.total.rx, '▼'], ['NETWORK (OUTBOUND)', d.net?.outRate, d.net?.outH, d.net?.total.tx, '▲']].forEach(([l, rate, h, tot, ar], i) => {
    const x = PAD + i * (nw + 20); card(c, x, yb, nw, hb); txt(c, l, x + 24, yb + 42, B(18), MUTED);
    txt(c, d.net ? `${bytes(rate)}/s` : 'N/A', x + 24, yb + 100, B(40), Y); txt(c, d.net ? `Total ${bytes(tot)} since start` : 'Not available on this host', x + 24, yb + 135, Mx(17), CREAM);
    if (d.net) spark(c, x + nw * 0.5, yb + 40, nw * 0.5 - 28, 90, h);
  });
  // row C (tiles)
  const yc = 580, hc = 120, tiles = [['SERVERS', d.servers, `${d.users.toLocaleString('en-US')} users`], ['VOICE CHANNELS', d.voice.length, `${d.voice.reduce((a, v) => a + v.n, 0)} listening`], ['PREMIUM SERVERS', d.pro + d.plus, `${d.pro} Pro • ${d.plus} Plus`], ['COMMANDS', d.commands, 'prefix + slash']];
  tiles.forEach(([l, v, sub], i) => { const x = PAD + i * (cw + 20); card(c, x, yc, cw, hc); txt(c, l, x + 24, yc + 38, B(16), MUTED); txt(c, String(v), x + 24, yc + 84, B(40), Y); txt(c, sub, x + cw - 22, yc + 84, Mx(17), CREAM, 'right'); });
  // row D (voice list)
  const yd = 730; txt(c, 'ACTIVE VOICE CHANNELS', PAD + 6, yd + 6, B(22), Y); txt(c, `${d.voice.length} joined`, W - PAD - 6, yd + 6, Mx(20), MUTED, 'right');
  if (!rows) { card(c, PAD, yd + 26, W - PAD * 2, 56); txt(c, 'Not connected to any voice channel right now', W / 2, yd + 62, Mx(20), MUTED, 'center'); }
  d.voice.slice(0, 6).forEach((v, i) => {
    const y = yd + 26 + i * 52; rr(c, PAD, y, W - PAD * 2, 44, 14); c.fillStyle = i % 2 ? '#1c1626' : CARD; c.fill();
    c.beginPath(); c.arc(PAD + 24, y + 22, 7, 0, Math.PI * 2); c.fillStyle = v.playing ? Y : '#456b4f'; c.fill();
    txt(c, fit(c, v.guild, B(19), 330), PAD + 46, y + 29, B(19), CREAM); txt(c, fit(c, v.vc, Mx(18), 230), PAD + 400, y + 29, Mx(18), Y2);
    txt(c, fit(c, v.track ? `♪ ${v.track}` : 'idle', Mx(17), 300), PAD + 650, y + 29, Mx(17), MUTED); txt(c, `${v.n} listening`, W - PAD - 20, y + 29, Mx(17), CREAM, 'right');
  });
  if (d.voice.length > 6) txt(c, `+${d.voice.length - 6} more`, W - PAD - 6, yd + 26 + 6 * 52 + 14, Mx(17), MUTED, 'right');
  txt(c, cfg.statusText, W / 2, H - 34, Mx(18), MUTED, 'center');
  return cv.toBuffer('image/png');
}

// ---------- the panel message (one message, edited; survives restarts) ----------
let busy = false;
async function update(client) {
  if (busy) return; busy = true;
  try {
    const ch = await client.channels.fetch(cfg.channels.status).catch(() => null); if (!ch) return console.warn('[status] channel not found / no access');
    const d = gather(client), ts = Math.floor(Date.now() / 1000), content = `-# zera-status • updated <t:${ts}:R>`;
    const payload = C ? { content, files: [{ attachment: render(d), name: 'zera-status.png' }], attachments: [] }
      : { content: `${content}\n**Servers** ${d.servers} • **VC** ${d.voice.length} • **Premium** ${d.pro + d.plus} • **CPU** ${d.cpu.pct.toFixed(1)}% • **RAM** ${bytes(d.mem.used)} • **Uptime** ${dur(d.up).big}` };
    let msg = null, id = db.kvGet('status_msg');
    if (id) msg = await ch.messages.fetch(id).catch(() => null);
    if (!msg) {   // adopt an existing panel (e.g. data folder was reset) and remove any duplicates
      const mine = [...((await ch.messages.fetch({ limit: 50 }).catch(() => null))?.values() || [])].filter(m => m.author.id === client.user.id && m.content.includes('zera-status')).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
      msg = mine[0] || null; for (const x of mine.slice(1)) x.delete().catch(() => {});
    }
    if (msg) msg = await msg.edit(payload).catch(() => null);
    if (!msg) { const { attachments, ...send } = payload; msg = await ch.send(send); }
    db.kvSet('status_msg', msg.id);
  } catch (e) { console.warn('[status]', e.message); } finally { busy = false; }
}
function start(client) {
  sampleNet(); setInterval(sampleNet, 15000);
  setTimeout(() => update(client), 8000); setInterval(() => update(client), 45000);
}
module.exports = { start, update, render, gather };
