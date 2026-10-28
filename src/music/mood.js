const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const cfg = require('../config');
const { E, rand, shuffle } = require('../utils');
const M = require('./manager');

const MOODS = {
  happy:      { emoji: '😊', label: 'Happy',      q: ['happy feel good songs', 'upbeat happy hits'],          near: ['party', 'energetic'] },
  sad:        { emoji: '😢', label: 'Sad',        q: ['sad songs', 'emotional sad hits'],                     near: ['heartbreak', 'love'] },
  love:       { emoji: '💖', label: 'Love',       q: ['love songs', 'romantic hits'],                         near: ['chill', 'happy'] },
  chill:      { emoji: '😌', label: 'Chill',      q: ['chill songs', 'relaxing chill music'],                 near: ['lofi', 'night'] },
  energetic:  { emoji: '⚡', label: 'Energetic',  q: ['energetic songs', 'high energy hits'],                 near: ['party', 'motivation'] },
  night:      { emoji: '🌙', label: 'Night Vibes',q: ['night drive songs', 'late night vibes'],               near: ['chill', 'lofi'] },
  heartbreak: { emoji: '💔', label: 'Heartbreak', q: ['heartbreak songs', 'breakup songs'],                   near: ['sad', 'love'] },
  party:      { emoji: '🎉', label: 'Party',      q: ['party songs', 'dance party hits'],                     near: ['energetic', 'happy'] },
  lofi:       { emoji: '🎧', label: 'Lo-Fi',      q: ['lofi songs', 'lofi chill beats'],                      near: ['chill', 'night'] },
  motivation: { emoji: '🔥', label: 'Motivation', q: ['motivational songs', 'workout motivation hits'],       near: ['energetic'] },
};
const LANGS = {
  all:       { emoji: '🌍', label: 'All Languages', tag: '' },
  malayalam: { emoji: '🌴', label: 'Malayalam', tag: 'Malayalam' },
  tamil:     { emoji: '🎭', label: 'Tamil',     tag: 'Tamil' },
  hindi:     { emoji: '🎬', label: 'Hindi',     tag: 'Hindi' },
  english:   { emoji: '🎤', label: 'English',   tag: 'English' },
};
const REAL = ['malayalam', 'tamil', 'hindi', 'english'];
const prefs = new Map(); // guildId -> panel selections
const trendCache = {};   // lang -> { at, tracks }
const year = () => new Date().getFullYear();
const P = gid => { if (!prefs.has(gid)) prefs.set(gid, { mood: null, lang: 'all', trending: true, lock: false }); return prefs.get(gid); };

async function trending(player, lang) {
  const c = trendCache[lang];
  if (c && Date.now() - c.at < 60 * 60 * 1000) return c.tracks;   // refresh hourly
  const qs = [`${LANGS[lang].tag} trending songs ${year()}`, `${LANGS[lang].tag} top hits ${year()}`, `${LANGS[lang].tag} new songs ${year()}`];
  let tracks = [];
  for (const q of qs) { const r = await M.search(player, q, M.BOT_REQ); tracks.push(...r.tracks.slice(0, 8)); }
  trendCache[lang] = { at: Date.now(), tracks };
  return tracks;
}
const okTrack = (t, hist, queued) => !t.info.isStream && t.info.duration > 60000 && t.info.duration < 600000 && !hist.has(t.info.identifier) && !queued.has(t.info.identifier);

// add 3 fresh tracks to the queue (does not call play)
async function refill(player) {
  const st = player.get('mood'); if (!st) return false;
  const lang = st.lang === 'all' ? rand(REAL) : st.lang;
  const hist = player.get('hist') || new Set(), queued = new Set(player.queue.tracks.map(t => t.info.identifier));
  let pool = [];
  if (st.trending && Math.random() < 0.5) pool = (await trending(player, lang)).filter(t => okTrack(t, hist, queued));
  if (pool.length < 3) {
    const mk = !st.lock && Math.random() < 0.2 ? rand(MOODS[st.mood].near) : st.mood;
    const q = `${LANGS[lang].tag} ${rand(MOODS[mk].q)}`.trim();
    const r = await M.search(player, q, M.BOT_REQ);
    pool = r.tracks.filter(t => okTrack(t, hist, queued));
  }
  if (!pool.length) return false;
  player.queue.add(shuffle(pool).slice(0, 3).map(t => ({ ...t, requester: M.BOT_REQ })));
  return true;
}
async function start(ctx, mood, lang = 'all') {
  await ctx.defer();
  const player = await M.ensurePlayer(ctx);
  const st = P(ctx.guildId); st.mood = mood; st.lang = lang;
  player.set('mood', { mood, lang, trending: st.trending, lock: st.lock });
  player.set('autoplay', false);
  player.queue.splice(0, player.queue.tracks.length);
  if (!(await refill(player))) throw new (require('../utils').UserError)('Couldn’t find songs for that mood right now. Try another one.');
  if (player.playing || player.paused) await player.skip(); else await player.play();
}
function sync(player) { const st = prefs.get(player.guildId), m = player.get('mood'); if (st && m) { m.lang = st.lang; m.trending = st.trending; m.lock = st.lock; m.mood = st.mood; } }

function panel(guildId) {
  const V = require('../v2'), { em } = require('../emojis');
  const st = P(guildId), player = M.lm?.getPlayer(guildId), active = !!player?.get('mood');
  const mood = new StringSelectMenuBuilder().setCustomId('mood:select').setPlaceholder('🎭 Change Mood').addOptions(Object.entries(MOODS).map(([k, v]) => ({ label: v.label, value: k, emoji: v.emoji, default: st.mood === k })));
  const lang = new StringSelectMenuBuilder().setCustomId('mood:lang').setPlaceholder('🌍 Change Language').addOptions(Object.entries(LANGS).map(([k, v]) => ({ label: v.label, value: k, emoji: v.emoji, default: st.lang === k })));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mood:trend').setLabel('Trending Priority').setEmoji('🔥').setStyle(st.trending ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mood:lock').setLabel('Mood Lock').setEmoji('🔒').setStyle(st.lock ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mood:reset').setLabel('Reset').setEmoji('♻️').setStyle(ButtonStyle.Danger));
  const c = V.box().addTextDisplayComponents(V.td(`### ${em('wave')} Zera Mood Autoplay\n> Pick a **mood** and a **language**. Zera plays matching songs and keeps going with fresh tracks (plus trending ones) until you stop.`))
    .addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(`> 🎭 **Mood** ${st.mood ? `${MOODS[st.mood].emoji} ${MOODS[st.mood].label}` : '`Not selected`'}\n> 🌍 **Language** ${LANGS[st.lang].emoji} ${LANGS[st.lang].label}\n> 📡 **Status** ${active ? `${em('live')} Autoplaying` : '⚪ Idle'}\n> 🔥 **Trending Priority** \`${st.trending ? 'ON' : 'OFF'}\`  •  🔒 **Mood Lock** \`${st.lock ? 'ON' : 'OFF'}\``))
    .addSeparatorComponents(V.sep()).addActionRowComponents(new ActionRowBuilder().addComponents(mood)).addActionRowComponents(new ActionRowBuilder().addComponents(lang)).addActionRowComponents(row)
    .addTextDisplayComponents(V.td('-# Join a voice channel, then pick a mood • Zera Music'));
  return V.msg(c);
}
// component handler (ctxFactory builds a ctx for starting playback)
async function handle(i, ctxFactory) {
  const [, act] = i.customId.split(':'), st = P(i.guildId), player = M.lm?.getPlayer(i.guildId);
  if (act === 'trend') st.trending = !st.trending;
  if (act === 'lock') st.lock = !st.lock;
  if (act === 'lang') st.lang = i.values[0];
  if (act === 'reset') { prefs.delete(i.guildId); player?.set('mood', null); }
  if (act === 'select') {
    st.mood = i.values[0];
    await i.deferUpdate();
    try { await start(ctxFactory(), st.mood, st.lang); }
    catch (e) { await i.followUp({ embeds: [E.err(e.message || 'Failed to start mood.')], flags: 64 }); }
    return i.editReply(panel(i.guildId));
  }
  if (player) sync(player);
  if (act === 'lang' && player?.get('mood')) { /* language switch keeps mood; next refills use new language */ }
  return i.update(panel(i.guildId));
}
module.exports = { MOODS, LANGS, REAL, start, refill, panel, handle };
