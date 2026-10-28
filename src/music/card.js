// Renders the Now Playing image card (green + dark). Falls back gracefully if canvas isn't installed.
const fs = require('fs'), path = require('path');
let C = null;
try { C = require('@napi-rs/canvas'); } catch { console.warn('[card] @napi-rs/canvas missing → text-only Now Playing'); }
const fmt = ms => { if (!ms || ms < 0) return '0:00'; const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(x).padStart(2, '0'); };
const FD = path.join(__dirname, '..', '..', 'assets', 'fonts');
const FAM = { 'Poppins-Bold.ttf': 'ZeraBold', 'Poppins-Medium.ttf': 'ZeraMed', 'FreeSans.ttf': 'ZeraFree', 'FreeSansBold.ttf': 'ZeraFreeBold' };
if (C) {
  try { for (const f of fs.readdirSync(FD)) if (/\.(ttf|otf)$/i.test(f)) C.GlobalFonts.registerFromPath(path.join(FD, f), FAM[f] || f.replace(/\.(ttf|otf)$/i, '')); } catch (e) { console.warn('[card] fonts:', e.message); }
}
const BOLD = s => `${s}px ZeraBold, ZeraFreeBold, "Noto Sans Malayalam", "Noto Sans Tamil", "Noto Sans Devanagari", sans-serif`;
const MED = s => `${s}px ZeraMed, ZeraFree, "Noto Sans Malayalam", "Noto Sans Tamil", "Noto Sans Devanagari", sans-serif`;
const Y = '#3CFF79', Y2 = '#7AFFAB', INK = '#111b16', CREAM = '#E6FFEE', MUTED = '#75a384';
const W = 960, H = 330;
const THEMES = {
  emerald: { y: '#3CFF79', y2: '#7AFFAB', y3: '#03FF50', glow: '60,255,121', accent: 0x3CFF79 },
  pink:    { y: '#FF5FA2', y2: '#FFB3D1', y3: '#E0357F', glow: '255,95,162', accent: 0xFF5FA2 },
  cyan:    { y: '#34D8F5', y2: '#A5F0FF', y3: '#12A8C9', glow: '52,216,245', accent: 0x34D8F5 },
  mint:    { y: '#4ADE80', y2: '#B7F7CF', y3: '#22A85A', glow: '74,222,128', accent: 0x4ADE80 },
  violet:  { y: '#A78BFA', y2: '#D9CCFF', y3: '#7C5CE0', glow: '167,139,250', accent: 0xA78BFA },
  crimson: { y: '#FF5A5F', y2: '#FFB0B2', y3: '#D62C32', glow: '255,90,95', accent: 0xFF5A5F },
};
Object.defineProperty(THEMES, 'gold', { value: THEMES.emerald, enumerable: false });   // old saved theme name still works

const artCache = new Map();
async function loadArt(url) {
  if (!url || !C) return null;
  if (artCache.has(url)) return artCache.get(url);
  let img = null;
  try {
    if (/^https?:/i.test(url)) { const r = await fetch(url, { signal: AbortSignal.timeout(3000) }); if (r.ok) img = await C.loadImage(Buffer.from(await r.arrayBuffer())); }
    else img = await C.loadImage(url);
  } catch {}
  artCache.set(url, img); if (artCache.size > 60) artCache.delete(artCache.keys().next().value);
  return img;
}
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
const clean = s => String(s || '').replace(/[\u{1F000}-\u{1FFFF}\u200d\ufe0f]/gu, '').replace(/\s+/g, ' ').trim();
function fit(c, text, maxW) { if (c.measureText(text).width <= maxW) return text; let t = text; while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1); return t.trimEnd() + '…'; }
function cover(c, img, x, y, w, h) { const s = Math.max(w / img.width, h / img.height), iw = img.width * s, ih = img.height * s; c.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); }
function spaced(c, text, x, y, sp) { for (const ch of text) { c.fillText(ch, x, y); x += c.measureText(ch).width + sp; } return x; }
const spacedW = (c, text, sp) => [...text].reduce((a, ch) => a + c.measureText(ch).width + sp, 0) - sp;

function note(c, x, y, s, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x + s * 0.28, y + s * 0.78, s * 0.24, s * 0.18, -0.35, 0, Math.PI * 2); c.fill(); c.fillRect(x + s * 0.44, y + s * 0.14, s * 0.1, s * 0.66); c.beginPath(); c.moveTo(x + s * 0.54, y + s * 0.14); c.quadraticCurveTo(x + s * 0.95, y + s * 0.3, x + s * 0.78, y + s * 0.6); c.quadraticCurveTo(x + s * 0.8, y + s * 0.4, x + s * 0.54, y + s * 0.36); c.fill(); }
function clock(c, x, y, r, col) { c.strokeStyle = col; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(x, y - r * 0.55); c.lineTo(x, y); c.lineTo(x + r * 0.45, y + r * 0.3); c.stroke(); }
function speaker(c, x, y, s, vol, col) {
  c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 3; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, y + s * 0.34); c.lineTo(x + s * 0.28, y + s * 0.34); c.lineTo(x + s * 0.62, y + s * 0.08); c.lineTo(x + s * 0.62, y + s * 0.92); c.lineTo(x + s * 0.28, y + s * 0.66); c.lineTo(x, y + s * 0.66); c.closePath(); c.fill();
  if (vol <= 0) { c.beginPath(); c.moveTo(x + s * 0.76, y + s * 0.36); c.lineTo(x + s * 1.02, y + s * 0.64); c.moveTo(x + s * 1.02, y + s * 0.36); c.lineTo(x + s * 0.76, y + s * 0.64); c.stroke(); return; }
  c.beginPath(); c.arc(x + s * 0.62, y + s * 0.5, s * 0.22, -0.9, 0.9); c.stroke();
  if (vol > 50) { c.beginPath(); c.arc(x + s * 0.62, y + s * 0.5, s * 0.42, -0.9, 0.9); c.stroke(); }
}
function placeholder(c, x, y, s, Y) {
  const g = c.createLinearGradient(x, y, x + s, y + s); g.addColorStop(0, '#22332a'); g.addColorStop(1, '#111b16'); c.fillStyle = g; c.fillRect(x, y, s, s);
  c.strokeStyle = Y; c.lineWidth = 4; c.beginPath(); c.arc(x + s / 2, y + s / 2, s * 0.32, 0, Math.PI * 2); c.stroke();
  c.fillStyle = Y; c.beginPath(); c.arc(x + s / 2, y + s / 2, s * 0.1, 0, Math.PI * 2); c.fill();
}

// d: { title, author, requester, pos, dur, volume, paused, live, artUrl }
async function render(d) {
  if (!C) return null;
  const cv = C.createCanvas(W, H), c = cv.getContext('2d');
  const art = await loadArt(d.artUrl);
  const T = THEMES[d.theme] || THEMES.emerald, Y = T.y, Y2 = T.y2, Y3 = T.y3;
  // --- background
  c.save(); rr(c, 0, 0, W, H, 38); c.clip();
  const bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#1d1727'); bg.addColorStop(1, '#0b090f'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
  if (art) { c.globalAlpha = 0.32; c.filter = 'blur(36px)'; cover(c, art, -40, -40, W + 80, H + 80); c.filter = 'none'; c.globalAlpha = 1; }
  const ov = c.createLinearGradient(0, 0, W, 0); ov.addColorStop(0, 'rgba(10,16,13,0.45)'); ov.addColorStop(1, 'rgba(10,16,13,0.82)'); c.fillStyle = ov; c.fillRect(0, 0, W, H);
  const gl = c.createRadialGradient(150, 40, 10, 150, 40, 420); gl.addColorStop(0, `rgba(${T.glow},0.22)`); gl.addColorStop(1, `rgba(${T.glow},0)`); c.fillStyle = gl; c.fillRect(0, 0, W, H);
  c.restore();
  c.save(); c.shadowColor = `rgba(${T.glow},0.55)`; c.shadowBlur = 16; c.strokeStyle = Y; c.lineWidth = 3; rr(c, 2, 2, W - 4, H - 4, 37); c.stroke(); c.restore();
  // --- artwork
  const ax = 36, ay = 36, as = 258;
  c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 22; c.fillStyle = '#000'; rr(c, ax, ay, as, as, 30); c.fill(); c.restore();
  c.save(); rr(c, ax, ay, as, as, 30); c.clip(); if (art) cover(c, art, ax, ay, as, as); else placeholder(c, ax, ay, as, Y); c.restore();
  c.strokeStyle = Y; c.lineWidth = 3; rr(c, ax, ay, as, as, 30); c.stroke();
  // --- status pill
  const X0 = 332, label = d.paused ? 'PAUSED' : 'NOW PLAYING';
  c.font = BOLD(21); const lw = spacedW(c, label, 3), pw = lw + 44;
  c.fillStyle = d.paused ? '#1f8a41' : Y; rr(c, X0, 38, pw, 42, 21); c.fill();
  c.fillStyle = INK; c.textBaseline = 'alphabetic'; spaced(c, label, X0 + 22, 67, 3);
  // --- time pill (top right)
  const tt = d.live ? 'LIVE' : `${fmt(d.pos)} / ${fmt(d.dur)}`;
  c.font = BOLD(24); const tw = c.measureText(tt).width, tpw = tw + 74, tx = W - 36 - tpw;
  c.fillStyle = 'rgba(17,27,22,0.85)'; rr(c, tx, 38, tpw, 42, 21); c.fill(); c.strokeStyle = Y; c.lineWidth = 3; rr(c, tx, 38, tpw, 42, 21); c.stroke();
  if (d.live) { c.fillStyle = Y; c.beginPath(); c.arc(tx + 28, 59, 8, 0, Math.PI * 2); c.fill(); } else clock(c, tx + 28, 59, 11, Y);
  c.fillStyle = CREAM; c.fillText(tt, tx + 50, 68);
  // --- title / artist / requester
  const maxW = W - 36 - X0;
  c.font = BOLD(54); c.fillStyle = CREAM; c.fillText(fit(c, clean(d.title) || 'Unknown title', maxW), X0, 150);
  c.fillStyle = Y; rr(c, X0, 172, 38, 38, 10); c.fill(); note(c, X0 + 6, 177, 26, INK);
  c.font = BOLD(32); c.fillStyle = Y; c.fillText(fit(c, clean(d.author) || 'Unknown artist', maxW - 54), X0 + 52, 202);
  // --- requester + volume
  const vx = W - 36 - 190;
  c.font = MED(23); c.fillStyle = MUTED; c.fillText(fit(c, `Requested by ${clean(d.requester) || 'Zera Autoplay'}`, vx - X0 - 20), X0, 244);
  const vol = Math.max(0, Math.min(150, d.volume ?? 80));
  speaker(c, vx, 222, 28, vol, Y);
  c.fillStyle = '#25362d'; rr(c, vx + 40, 232, 84, 9, 4.5); c.fill();
  const vg = c.createLinearGradient(vx + 40, 0, vx + 124, 0); vg.addColorStop(0, Y3); vg.addColorStop(1, vol > 100 ? '#ff7a3c' : Y2); c.fillStyle = vg; rr(c, vx + 40, 232, Math.max(9, 84 * Math.min(1, vol / 150)), 9, 4.5); c.fill();
  c.font = BOLD(21); c.fillStyle = CREAM; c.textAlign = 'right'; c.fillText(`${vol}%`, W - 36, 244); c.textAlign = 'left';
  // --- progress
  const bx = X0, bw = W - 36 - X0, by = 266, p = d.live || !d.dur ? 1 : Math.max(0, Math.min(1, d.pos / d.dur));
  c.fillStyle = '#25362d'; rr(c, bx, by, bw, 12, 6); c.fill();
  const pg = c.createLinearGradient(bx, 0, bx + bw, 0); pg.addColorStop(0, Y3); pg.addColorStop(1, Y2); c.fillStyle = pg; rr(c, bx, by, Math.max(12, bw * p), 12, 6); c.fill();
  if (!d.live) { c.save(); c.shadowColor = Y2; c.shadowBlur = 14; c.fillStyle = '#dbffd2'; c.beginPath(); c.arc(bx + Math.max(8, bw * p), by + 6, 10, 0, Math.PI * 2); c.fill(); c.restore(); }
  c.font = MED(20); c.fillStyle = MUTED; c.fillText(d.live ? 'LIVE' : fmt(d.pos), bx, 306); c.textAlign = 'right'; c.fillText(d.live ? '' : fmt(d.dur), bx + bw, 306); c.textAlign = 'left';
  return cv.encode('png');
}
module.exports = { render, THEMES, available: !!C };
