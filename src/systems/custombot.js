// Next Gen "Custom Bot": a server with Zera Next Gen can give Zera its own nickname / avatar / banner / bio IN THAT SERVER ONLY
// (Discord per-server bot profile: PATCH /guilds/{id}/members/@me). When Next Gen ends, the sweep below resets everything to the original.
const { Routes } = require('discord.js');
const db = require('../db'), P = require('../premium');
const { UserError } = require('../utils');

const IMG_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']), MAX_IMG = 8 * 1048576;
const hasNextGen = gid => P.rank(gid, null) >= P.RANK.nextgen;   // SERVER-level premium only (guild code / server subscription)
const patch = (client, gid, body, reason) => client.rest.patch(Routes.guildMember(gid, '@me'), { body, reason });
const errText = e => String(e?.rawError?.message || e?.message || e).slice(0, 160);
const gone = e => [10004, 10007].includes(e?.code) || e?.status === 404;   // server / member no longer exists
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (client, title, text) => { try { const L = require('../logger'); L.log(client, 'security', { embeds: [L.le(title, text)] }); } catch {} };

async function toDataUri(att, label) {
  const type = (att.contentType || '').split(';')[0].toLowerCase();
  if (!IMG_TYPES.has(type)) throw new UserError(`${label} must be a PNG, JPG, GIF or WEBP image.`);
  if (att.size > MAX_IMG) throw new UserError(`${label} is too big (max 8 MB).`);
  const r = await fetch(att.url); if (!r.ok) throw new UserError(`Couldn’t download the ${label.toLowerCase()}.`);
  const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > MAX_IMG) throw new UserError(`${label} is too big (max 8 MB).`);
  return `data:${type};base64,${buf.toString('base64')}`;
}

// Applies every field separately so one failing field (e.g. missing permission) doesn't block the others.
async function apply(client, guild, f, by) {
  const lines = [], saved = {}, reason = `Zera /custombot by ${by}`;
  const one = async (label, key, make, keep) => {
    try { const v = await make(); await patch(client, guild.id, { [key]: v }, reason); saved[keep[0]] = keep[1]; lines.push(`✅ **${label}** updated`); }
    catch (e) { lines.push(`❌ **${label}** — ${errText(e)}`); }
  };
  if (f.nick != null) { if (f.nick.length > 32) lines.push('❌ **Nickname** — max 32 characters'); else await one('Nickname', 'nick', async () => f.nick, ['nick', f.nick]); }
  if (f.bio != null) { if (f.bio.length > 190) lines.push('❌ **Bio** — max 190 characters'); else await one('Bio', 'bio', async () => f.bio, ['bio', f.bio]); }
  if (f.avatar) await one('Avatar', 'avatar', () => toDataUri(f.avatar, 'Avatar'), ['avatar', true]);
  if (f.banner) await one('Banner', 'banner', () => toDataUri(f.banner, 'Banner'), ['banner', true]);
  if (Object.keys(saved).length) db.cbSet(guild.id, saved, by);
  return lines;
}

// Back to the original name / avatar / banner / bio. Returns true when the server is clean (record removed).
async function reset(client, gid, reason = 'Zera /custombot reset') {
  try { await patch(client, gid, { nick: null, avatar: null, banner: null, bio: null }, reason); db.cbDelete(gid); return true; }
  catch (e) {
    if (gone(e)) { db.cbDelete(gid); return true; }
    let all = true;   // maybe one field was rejected: try them one by one
    for (const k of ['nick', 'avatar', 'banner', 'bio']) { try { await patch(client, gid, { [k]: null }, reason); } catch (e2) { if (gone(e2)) { db.cbDelete(gid); return true; } all = false; console.warn(`[custombot] reset ${k} in ${gid}:`, errText(e2)); } }
    if (all) db.cbDelete(gid);
    return all;
  }
}

// Every few minutes: any server that has a custom profile but no longer has Next Gen gets reset to the original.
let sweeping = false;
async function sweep(client) {
  if (sweeping) return; sweeping = true;
  try {
    for (const r of db.cbList()) {
      if (hasNextGen(r.guild_id)) continue;
      if (!client.guilds.cache.has(r.guild_id)) { db.cbDelete(r.guild_id); continue; }   // bot left that server
      const ok = await reset(client, r.guild_id, 'Zera Next Gen ended');
      console.log(`[custombot] Next Gen ended in ${r.guild_id} → ${ok ? 'profile reset to original' : 'reset failed, will retry'}`);
      if (ok) log(client, '🚀 Next Gen ended', `Custom bot profile reset in \`${r.guild_id}\` (${client.guilds.cache.get(r.guild_id)?.name || 'unknown'}).`);
      await sleep(1500);   // be gentle with rate limits
    }
  } catch (e) { console.warn('[custombot] sweep:', e.message); } finally { sweeping = false; }
}
function start(client) { setTimeout(() => sweep(client), 30000); setInterval(() => sweep(client), 3 * 60 * 1000); }
module.exports = { apply, reset, sweep, start, hasNextGen };
