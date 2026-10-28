// All Zera emojis (animated GIFs + button icons) are uploaded once as *application emojis* (usable in every server).
// assets/emojis/manifest.json maps each plain unicode emoji → its animated version (zx_*).
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'assets', 'emojis');
const FALLBACK = { eq: '🎶', vinyl: '💿', sparkle: '✨', note: '🎵', heart: '💚', live: '🔴', wave: '🌊', check: '✅', cross: '❌', warn: '⚠️', loading: '⏳', headphones: '🎧', fire: '🔥', crown: '👑', bell: '🔔', star: '⭐', mic: '🎤' };
let manifest = {}; try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch {}
// Green Butterfly pack -> Zera keys. Edit the right-hand side to re-map (any file name from assets/emojis_pack works with EMOJI_FULL=true).
const PACK = { eq: 'eq_bars_neon', vinyl: 'disc_vinyl_neon', note: 'note_float_neon', heart: 'heart_neon', sparkle: 'spark_star_neon', star: 'spark_twinkle_neon', wave: 'wave_neon', live: 'rings_neon', loading: 'leaf_spin_neon', leaf: 'leaf_sway_neon', butterfly: 'bf_classic_neon_flapslow', butterfly2: 'bf_swallow_neon_hover', butterfly3: 'bf_fancy_neon_figure8', butterfly4: 'bf_moth_neon_glow' };
const map = {}, objs = {};
let ready = false;
async function sync(client) {
  try {
    let existing = await client.application.emojis.fetch();
    if (process.env.EMOJI_RESYNC === 'true') {   // delete old zx_/zera_ emojis so the new green ones get uploaded
      console.log('[emoji] EMOJI_RESYNC=true -> removing old emojis…');
      for (const e of existing.values()) if (/^(zx_|zera_)/.test(e.name)) await client.application.emojis.delete(e.id).catch(() => {});
      existing = await client.application.emojis.fetch();
    }
    const files = fs.readdirSync(dir).filter(x => /\.(gif|png)$/i.test(x));
    if (process.env.EMOJI_FULL === 'true') {      // optional: upload the whole 504-emoji butterfly pack
      const extra = path.join(__dirname, '..', 'assets', 'emojis_pack');
      try { for (const x of fs.readdirSync(extra)) if (/\.gif$/i.test(x) && !files.includes(x)) files.push(path.join('..', 'emojis_pack', x)); } catch {}
    }
    const missing = files.filter(f => !existing.some(e => e.name === path.parse(f).name)).length;
    if (missing) console.log(`[emoji] uploading ${missing} new emojis (first start can take a few minutes)…`);
    for (const e of existing.values()) { const key = e.name.replace(/^zera_/, ''); map[key] = e.toString(); objs[key] = { id: e.id, name: e.name, animated: !!e.animated }; }
    for (const f of files) {
      const name = path.parse(f).name; if (existing.some(e => e.name === name)) continue;
      await new Promise(r => setTimeout(r, 1200));   // stay under Discord's rate limit
      const e = await client.application.emojis.create({ attachment: path.join(dir, f), name }).catch(err => { console.warn('[emoji]', name, err.message); return null; });
      if (e) { const key = name.replace(/^zera_/, ''); map[key] = e.toString(); objs[key] = { id: e.id, name: e.name, animated: !!e.animated }; }
    }
    if (process.env.EMOJI_PACK !== 'false') for (const [k, t] of Object.entries(PACK)) if (objs[t]) { map[k] = map[t]; objs[k] = objs[t]; }
    ready = true; console.log(`[emoji] ${Object.keys(map).length} emojis ready`);
  } catch (e) { console.warn('[emoji] sync failed → unicode fallbacks:', e.message); }
}
const em = (k, strict = false) => map[k] || (strict ? '' : FALLBACK[k] || '');
const btn = (k, fallback) => objs[k] || fallback;      // for ButtonBuilder.setEmoji
const obj = k => objs[k] || null;
module.exports = { sync, em, btn, obj, manifest, isReady: () => ready };
