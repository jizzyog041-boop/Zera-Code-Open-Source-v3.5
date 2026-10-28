const { EmbedBuilder } = require('discord.js');
const cfg = require('./config');
class UserError extends Error {}
const fmt = ms => {
  if (!ms || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(x).padStart(2, '0');
};
const bar = (p, d, n = 14) => { const i = d ? Math.min(n - 1, Math.floor((p / d) * n)) : 0; return '▰'.repeat(i) + '🟢' + '▱'.repeat(n - i - 1); };
const E = {
  base: () => new EmbedBuilder().setColor(cfg.color),
  ok: t => E.base().setDescription(`✅ ${t}`),
  err: t => new EmbedBuilder().setColor(0xE5484D).setDescription(`❌ ${t}`),
  info: (t, d) => E.base().setTitle(t).setDescription(d),
};
const rand = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const chunk = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };
const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// "1:30" | "90" | "1m30s" | "2h" -> ms
const parseTime = s => {
  if (!s) return null; s = String(s).trim().toLowerCase();
  if (/^\d+:\d+(:\d+)?$/.test(s)) return s.split(':').reduce((a, v) => a * 60 + Number(v), 0) * 1000;
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  let t = 0, ok = false; for (const [, n, u] of s.matchAll(/(\d+)\s*(d|h|m|s)/g)) { ok = true; t += Number(n) * { d: 86400, h: 3600, m: 60, s: 1 }[u] * 1000; }
  return ok ? t : null;
};
const idOf = s => (s || '').replace(/[<@!&#>]/g, '').trim();
module.exports = { UserError, fmt, bar, E, rand, shuffle, chunk, trunc, slug, parseTime, idOf };
