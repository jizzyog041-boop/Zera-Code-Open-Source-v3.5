// Database Collector: ONE big panel in the collector channel. Owner presses "Collect All Database" and gets
// a fresh, consistent snapshot of every database file (ephemeral reply = only the owner sees / downloads it).
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const cfg = require('../config'), db = require('../db'), V = require('../v2');
const { E } = require('../utils');

const ID = 'dbcollect:go', KV = 'dbcollect_msg';
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const isOwner = id => cfg.owners.includes(String(id));
let busy = false, ensuring = false;

// ---------- panel (posted once, survives restarts, never duplicates) ----------
const hasButton = m => { try { return JSON.stringify(m.components).includes(ID); } catch { return false; } };
const panelPayload = () => V.msg(V.box().addTextDisplayComponents(V.td(
  '### 🗄️ Database Collector\n> Press the button below to collect **all current Zera databases** as downloadable file(s).\n> 🔒 **Owner only** — everyone else is blocked.\n> The file is sent privately (only you can see it).'))
  .addSeparatorComponents(V.sep(true))
  .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(ID).setLabel('Collect All Database').setEmoji('💾').setStyle(ButtonStyle.Success)))
  .addTextDisplayComponents(V.td('-# Zera Music • db-collector')));

async function ensurePanel(client) {
  if (ensuring) return; ensuring = true;   // never run two checks at the same time
  try {
    const id = cfg.channels.dbCollect;
    const ch = await client.channels.fetch(id).catch(e => { console.warn(`[dbcollect] cannot fetch channel ${id}: ${e.message} (is the bot in that server with View Channel permission?)`); return null; });
    if (!ch) return;
    if (!ch.isTextBased?.() || !ch.guild) return console.warn(`[dbcollect] channel ${id} is not a server text channel`);
    const perms = ch.permissionsFor(client.user);
    const need = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles'].filter(p => !perms?.has(p));
    if (need.length) return console.warn(`[dbcollect] bot is missing permissions in #${ch.name}: ${need.join(', ')}`);
    // 1) the message we remember from last start
    const savedId = db.kvGet(KV);
    let keep = savedId ? await ch.messages.fetch(savedId).catch(() => null) : null;
    if (keep && !(keep.author.id === client.user.id && hasButton(keep))) keep = null;
    // 2) kv lost (data reset)? adopt the newest existing panel and delete extra copies
    const mine = [...((await ch.messages.fetch({ limit: 50 }).catch(() => null))?.values() || [])]
      .filter(m => m.author.id === client.user.id && hasButton(m)).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    if (!keep) keep = mine[0] || null;
    for (const m of mine) if (!keep || m.id !== keep.id) m.delete().catch(() => {});
    // 3) nothing there -> post it once
    if (keep) { console.log(`[dbcollect] panel already exists in #${ch.name} (${keep.id}), not re-posting`); }
    else { keep = await ch.send(panelPayload()).catch(e => { console.warn('[dbcollect] posting the panel failed:', e.message); return null; }); if (keep) console.log(`[dbcollect] panel posted in #${ch.name} (${keep.id})`); }
    if (keep) db.kvSet(KV, keep.id);
  } catch (e) { console.warn('[dbcollect] ensurePanel error:', e); } finally { ensuring = false; }
}

// ---------- snapshot ----------
// VACUUM INTO writes a consistent copy (includes WAL contents) and works with better-sqlite3 and node:sqlite.
function snapshotSqlite() {
  const tmp = path.join(DATA_DIR, `.snapshot-${Date.now()}.sqlite`);
  try { db.raw.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`); return fs.readFileSync(tmp); }
  finally { try { fs.unlinkSync(tmp); } catch {} }
}
function collect() {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19), files = [];
  files.push({ name: `zera-${stamp}.sqlite`, buf: snapshotSqlite() });
  // any other database-like files in /data (legacy db.json, etc.). Skips sqlite/wal/shm/temp files.
  try {
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (f.startsWith('.') || /\.(sqlite|sqlite3|db)(-wal|-shm|-journal)?$/i.test(f) || f === path.basename(process.env.DB_FILE || '')) continue;
      const p = path.join(DATA_DIR, f); if (fs.statSync(p).isFile() && /\.(json|db|sqlite|csv)$/i.test(f)) files.push({ name: f, buf: fs.readFileSync(p) });
    }
  } catch {}
  return files;
}
const mb = n => (n / 1048576).toFixed(2) + ' MB';

async function handle(i) {
  if (!isOwner(i.user.id)) return i.reply({ embeds: [E.err('This button is **owner only**.')], flags: 64 });
  if (busy) return i.reply({ embeds: [E.err('A collection is already running, wait a few seconds.')], flags: 64 });
  busy = true;
  try {
    await i.deferReply({ flags: 64 });
    let files = collect(), note = '';
    const limit = i.guild?.maximumUploadLimit || 10 * 1048576;   // upload limit of this server (boost level)
    if (files.reduce((a, f) => a + f.buf.length, 0) > limit * 0.95) {   // too big → gzip each file
      files = files.map(f => ({ name: f.name + '.gz', buf: zlib.gzipSync(f.buf, { level: 9 }) })); note = '\n> 📦 Files were compressed (`.gz`) because of the upload limit. Unzip with 7-Zip / `gunzip`.';
    }
    const total = files.reduce((a, f) => a + f.buf.length, 0);
    if (total > limit) return i.editReply({ embeds: [E.err(`Database is **${mb(total)}** even compressed, over this server's **${mb(limit)}** upload limit. Copy \`data/\` from the host instead.`)] });
    const list = files.map(f => `• \`${f.name}\` — ${mb(f.buf.length)}`).join('\n');
    await i.editReply({ embeds: [E.ok(`Database collected **${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}** (IST)\n${list}${note}`)], files: files.map(f => new AttachmentBuilder(f.buf, { name: f.name })) });
  } catch (e) {
    console.error('[dbcollect]', e);
    const m = { embeds: [E.err(`Could not collect the database: \`${String(e.message || e).slice(0, 200)}\``)] };
    if (i.deferred || i.replied) await i.editReply(m).catch(() => {}); else await i.reply({ ...m, flags: 64 }).catch(() => {});
  } finally { busy = false; }
}
module.exports = { ensurePanel, handle, collect };
