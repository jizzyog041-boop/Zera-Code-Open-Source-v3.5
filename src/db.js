// SQLite storage. Uses better-sqlite3 (npm install) and falls back to Node's built-in node:sqlite (Node 22.5+).
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'data'); fs.mkdirSync(dir, { recursive: true });
const file = process.env.DB_FILE || path.join(dir, 'zera.sqlite');
let D;
try { const B = require('better-sqlite3'); D = new B(file); D.pragma('journal_mode = WAL'); }
catch {
  try { const { DatabaseSync } = require('node:sqlite'); D = new DatabaseSync(file); D.exec('PRAGMA journal_mode = WAL'); console.warn('[db] better-sqlite3 missing → using node:sqlite'); }
  catch { throw new Error('SQLite unavailable: run `npm install` (better-sqlite3) or use Node 22.5+'); }
}
D.exec(`
CREATE TABLE IF NOT EXISTS guilds(guild_id TEXT PRIMARY KEY, prefix TEXT, twenty_four_seven INTEGER DEFAULT 0, dj_role TEXT, volume INTEGER DEFAULT 100, announce INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS warns(id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, user_id TEXT, by_id TEXT, reason TEXT, at INTEGER);
CREATE INDEX IF NOT EXISTS idx_warns ON warns(guild_id, user_id);
CREATE TABLE IF NOT EXISTS favorites(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, title TEXT, author TEXT, uri TEXT, duration INTEGER, UNIQUE(user_id, uri));
CREATE TABLE IF NOT EXISTS playlists(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, name TEXT, UNIQUE(user_id, name));
CREATE TABLE IF NOT EXISTS playlist_tracks(id INTEGER PRIMARY KEY AUTOINCREMENT, playlist_id INTEGER, title TEXT, author TEXT, uri TEXT, duration INTEGER);
CREATE INDEX IF NOT EXISTS idx_pt ON playlist_tracks(playlist_id);
CREATE TABLE IF NOT EXISTS play_history(id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, user_id TEXT, title TEXT, author TEXT, uri TEXT, at INTEGER);
CREATE INDEX IF NOT EXISTS idx_hg ON play_history(guild_id);
CREATE INDEX IF NOT EXISTS idx_hu ON play_history(user_id);
`);
for (const col of ["theme TEXT DEFAULT 'gold'", 'vc247 TEXT', 'text247 TEXT']) { try { D.exec(`ALTER TABLE guilds ADD COLUMN ${col}`); } catch {} }
D.exec(`
CREATE TABLE IF NOT EXISTS premium(id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT, target_id TEXT, tier TEXT, expires_at INTEGER, granted_by TEXT, source TEXT, created_at INTEGER, UNIQUE(scope, target_id));
CREATE TABLE IF NOT EXISTS premium_codes(code TEXT PRIMARY KEY, tier TEXT, scope TEXT, days INTEGER, created_by TEXT, created_at INTEGER, redeemed_by TEXT, redeemed_at INTEGER, redeemed_target TEXT);
`);
D.exec('CREATE INDEX IF NOT EXISTS idx_codes_user ON premium_codes(redeemed_by)');
D.exec('CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT)');
D.exec('CREATE TABLE IF NOT EXISTS custombot(guild_id TEXT PRIMARY KEY, nick TEXT, bio TEXT, has_avatar INTEGER DEFAULT 0, has_banner INTEGER DEFAULT 0, set_by TEXT, updated_at INTEGER)');
const q = (sql, ...p) => D.prepare(sql).all(...p), one = (sql, ...p) => D.prepare(sql).get(...p), run = (sql, ...p) => D.prepare(sql).run(...p);
const s = v => (v === undefined ? null : v);
const kvGet = k => one('SELECT v FROM kv WHERE k=?', k)?.v ?? null;
const kvSet = (k, v) => run('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, String(v));

// ---- guild settings: db.guild(id).prefix = 'x' writes straight to SQLite ----
const COLS = { prefix: ['prefix', v => s(v)], twentyFourSeven: ['twenty_four_seven', v => (v ? 1 : 0)], djRole: ['dj_role', v => v || null], volume: ['volume', v => Number(v)], announce: ['announce', v => (v === false ? 0 : 1)], theme: ['theme', v => v || 'gold'], vc247: ['vc247', v => v || null], text247: ['text247', v => v || null] };
const row = id => { let r = one('SELECT * FROM guilds WHERE guild_id=?', id); if (!r) { run('INSERT INTO guilds(guild_id) VALUES(?)', id); r = one('SELECT * FROM guilds WHERE guild_id=?', id); } return r; };
const guild = id => new Proxy({}, {
  get: (_, k) => { const c = COLS[k]; if (!c) return undefined; const v = row(id)[c[0]]; return k === 'twentyFourSeven' || k === 'announce' ? !!v : v; },
  set: (_, k, v) => { const c = COLS[k]; if (!c) return false; row(id); run(`UPDATE guilds SET ${c[0]}=? WHERE guild_id=?`, c[1](v), id); return true; },
});
// one-time: servers still on the old factory default (80) move to 100 (full-level, unattenuated audio)
try { if (!one("SELECT 1 FROM kv WHERE k='mig:vol100'")) { run('UPDATE guilds SET volume=100 WHERE volume=80'); run("INSERT INTO kv(k,v) VALUES('mig:vol100','1')"); } } catch {}
const resetGuild = id => run('DELETE FROM guilds WHERE guild_id=?', id);

// ---- warns ----
const addWarn = (g, u, by, reason) => { run('INSERT INTO warns(guild_id,user_id,by_id,reason,at) VALUES(?,?,?,?,?)', g, u, by, reason, Date.now()); return one('SELECT COUNT(*) n FROM warns WHERE guild_id=? AND user_id=?', g, u).n; };
const getWarns = (g, u) => q('SELECT by_id AS by, reason, at FROM warns WHERE guild_id=? AND user_id=? ORDER BY id', g, u);
const clearWarns = (g, u) => run('DELETE FROM warns WHERE guild_id=? AND user_id=?', g, u);

// ---- favorites ----
const favs = u => q('SELECT title,author,uri,duration FROM favorites WHERE user_id=? ORDER BY id', u);
const addFav = (u, t) => run('INSERT OR IGNORE INTO favorites(user_id,title,author,uri,duration) VALUES(?,?,?,?,?)', u, t.title, t.author, t.uri, t.duration).changes > 0;
const removeFav = (u, idx) => { const r = q('SELECT id,title FROM favorites WHERE user_id=? ORDER BY id', u)[idx]; if (!r) return null; run('DELETE FROM favorites WHERE id=?', r.id); return r; };
const clearFavs = u => run('DELETE FROM favorites WHERE user_id=?', u);

// ---- playlists ----
const plId = (u, n) => one('SELECT id FROM playlists WHERE user_id=? AND name=?', u, n)?.id;
const plList = u => q('SELECT p.name, (SELECT COUNT(*) FROM playlist_tracks t WHERE t.playlist_id=p.id) n FROM playlists p WHERE p.user_id=? ORDER BY p.id', u);
const plCreate = (u, n) => run('INSERT OR IGNORE INTO playlists(user_id,name) VALUES(?,?)', u, n).changes > 0;
const plTracks = (u, n) => { const id = plId(u, n); return id ? q('SELECT title,author,uri,duration FROM playlist_tracks WHERE playlist_id=? ORDER BY id', id) : null; };
const plAdd = (u, n, items) => { const id = plId(u, n); if (!id) return null; for (const t of items) run('INSERT INTO playlist_tracks(playlist_id,title,author,uri,duration) VALUES(?,?,?,?,?)', id, t.title, t.author, t.uri, t.duration); return one('SELECT COUNT(*) n FROM playlist_tracks WHERE playlist_id=?', id).n; };
const plRemove = (u, n, idx) => { const id = plId(u, n); const r = id && q('SELECT id,title FROM playlist_tracks WHERE playlist_id=? ORDER BY id', id)[idx]; if (!r) return null; run('DELETE FROM playlist_tracks WHERE id=?', r.id); return r; };
const plDelete = (u, n) => { const id = plId(u, n); if (!id) return false; run('DELETE FROM playlist_tracks WHERE playlist_id=?', id); run('DELETE FROM playlists WHERE id=?', id); return true; };

// ---- play history / stats ----
const logPlay = (g, u, t) => { run('INSERT INTO play_history(guild_id,user_id,title,author,uri,at) VALUES(?,?,?,?,?,?)', g, s(u), t.title, t.author, t.uri, Date.now()); };
const topSongs = (g, n = 10) => q('SELECT title,author,uri,COUNT(*) plays FROM play_history WHERE guild_id=? GROUP BY uri ORDER BY plays DESC LIMIT ?', g, n);
const userTop = (u, n = 10) => q('SELECT title,author,uri,COUNT(*) plays FROM play_history WHERE user_id=? GROUP BY uri ORDER BY plays DESC LIMIT ?', u, n);
const guildPlays = g => one('SELECT COUNT(*) n FROM play_history WHERE guild_id=?', g).n;

// ---- premium ----
const getPremium = (scope, id) => { const r = one('SELECT * FROM premium WHERE scope=? AND target_id=?', scope, id); return r && (!r.expires_at || r.expires_at > Date.now()) ? r : null; };
const setPremium = (scope, id, tier, days, by, source = 'grant') => {
  const cur = getPremium(scope, id); let exp = null;
  if (days) { const base = cur?.tier === tier && cur.expires_at ? cur.expires_at : Date.now(); exp = base + days * 86400000; }
  if (cur?.tier === tier && cur.expires_at === null) exp = null;           // lifetime stays lifetime
  run('INSERT INTO premium(scope,target_id,tier,expires_at,granted_by,source,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(scope,target_id) DO UPDATE SET tier=excluded.tier, expires_at=excluded.expires_at, granted_by=excluded.granted_by, source=excluded.source', scope, id, tier, exp, by, source, Date.now());
  return exp;
};
const revokePremium = (scope, id) => run('DELETE FROM premium WHERE scope=? AND target_id=?', scope, id).changes > 0;
const listPremium = (n = 25) => q('SELECT scope,target_id,tier,expires_at,source FROM premium ORDER BY id DESC LIMIT ?', n).filter(r => !r.expires_at || r.expires_at > Date.now());
const genCodes = (tier, scope, days, count, by) => { const out = []; for (let i = 0; i < count; i++) { const c = 'ZERA-' + require('crypto').randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g).join('-'); run('INSERT INTO premium_codes(code,tier,scope,days,created_by,created_at) VALUES(?,?,?,?,?,?)', c, tier, scope, days, by, Date.now()); out.push(c); } return out; };
const peekCode = c => one('SELECT * FROM premium_codes WHERE code=?', String(c).trim().toUpperCase());
const useCode = (c, by, target) => run('UPDATE premium_codes SET redeemed_by=?, redeemed_at=?, redeemed_target=? WHERE code=? AND redeemed_by IS NULL', by, Date.now(), target, String(c).trim().toUpperCase()).changes > 0;
const lastRedeemAt = u => one('SELECT MAX(redeemed_at) t FROM premium_codes WHERE redeemed_by=?', String(u))?.t || 0;   // last successful /redeem by this user (persists across restarts)
const tx = fn => { D.exec('BEGIN IMMEDIATE'); try { const r = fn(); D.exec('COMMIT'); return r; } catch (e) { try { D.exec('ROLLBACK'); } catch {} throw e; } };   // all-or-nothing
const unusedCodes = (n = 20) => q('SELECT code,tier,scope,days FROM premium_codes WHERE redeemed_by IS NULL ORDER BY created_at DESC LIMIT ?', n);
const list247 = () => q("SELECT guild_id, vc247, text247 FROM guilds WHERE twenty_four_seven=1 AND vc247 IS NOT NULL");

// ---- custombot (Next Gen): which servers currently have a custom bot profile applied (so it can be reset when premium ends) ----
const cbGet = g => one('SELECT * FROM custombot WHERE guild_id=?', g) || null;
const cbList = () => q('SELECT * FROM custombot');
const cbDelete = g => run('DELETE FROM custombot WHERE guild_id=?', g);
const cbSet = (g, f, by) => {   // f: any of { nick, bio, avatar:boolean, banner:boolean } — only the given fields change
  const c = cbGet(g) || {}, has = k => Object.prototype.hasOwnProperty.call(f, k);
  const n = { nick: has('nick') ? f.nick : c.nick ?? null, bio: has('bio') ? f.bio : c.bio ?? null, a: has('avatar') ? (f.avatar ? 1 : 0) : c.has_avatar || 0, b: has('banner') ? (f.banner ? 1 : 0) : c.has_banner || 0 };
  run('INSERT INTO custombot(guild_id,nick,bio,has_avatar,has_banner,set_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET nick=excluded.nick, bio=excluded.bio, has_avatar=excluded.has_avatar, has_banner=excluded.has_banner, set_by=excluded.set_by, updated_at=excluded.updated_at', g, s(n.nick), s(n.bio), n.a, n.b, s(by), Date.now());
};

module.exports = { cbGet, cbList, cbSet, cbDelete, kvGet, kvSet, getPremium, setPremium, revokePremium, listPremium, genCodes, peekCode, useCode, lastRedeemAt, tx, unusedCodes, list247, guild, resetGuild, addWarn, getWarns, clearWarns, favs, addFav, removeFav, clearFavs, plList, plCreate, plTracks, plAdd, plRemove, plDelete, logPlay, topSongs, userTop, guildPlays, save: () => {}, raw: D };
