const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const cfg = require('../config'), V = require('../v2'), { em, btn: eb } = require('../emojis'), card = require('./card');
const { fmt, trunc, chunk, bar } = require('../utils');
const F = require('./filters'), P = require('../premium'), db = require('../db');
const LOOP = { off: 'Off', track: '🔂 Track', queue: '🔁 Queue' };
const link = (t, u) => (u ? `[${trunc(t, 200)}](${u})` : `**${trunc(t, 200)}**`);

const B = (id, key, fb, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setEmoji(eb(key, fb)).setStyle(style).setDisabled(disabled);
function npRows(player) {
  const menu = new StringSelectMenuBuilder().setCustomId('np:filter').setPlaceholder('🎛️ Audio filters').addOptions(
    { label: 'Clear all filters', value: 'clear', emoji: '❌' },
    ...['bassboost', 'nightcore', 'vaporwave', '8d', 'karaoke', 'tremolo', 'vibrato', 'lowpass', 'slowed', 'speedup', 'soft', 'pop', 'electronic', 'treble'].map(k => ({ label: F.PRESETS[k].label, value: k, default: player.get('filter') === k })));
  const loop = player.repeatMode;
  return [
    new ActionRowBuilder().addComponents(B('np:prev', 'b_prev', '⏮️'), B('np:rew', 'b_rew', '⏪'), B('np:pause', player.paused ? 'b_play' : 'b_pause', player.paused ? '▶️' : '⏸️', ButtonStyle.Primary), B('np:fwd', 'b_fwd', '⏩'), B('np:skip', 'b_next', '⏭️')),
    new ActionRowBuilder().addComponents(B('np:loop', loop === 'track' ? 'b_loop1' : 'b_loop', '🔁', loop !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary), B('np:shuffle', 'b_shuffle', '🔀'), B('np:stop', 'b_stop', '⏹️', ButtonStyle.Danger), B('np:lyrics', 'b_lyrics', '📖'), B('np:like', 'b_save', '❤️')),
    new ActionRowBuilder().addComponents(B('np:vdown', 'b_voldown', '🔉'), B('np:vup', 'b_volup', '🔊'), B('np:queue', 'b_queue', '📜'), B('np:auto', 'b_auto', '♾️', player.get('autoplay') ? ButtonStyle.Success : ButtonStyle.Secondary)),
    new ActionRowBuilder().addComponents(menu),
  ];
}
async function npPayload(player) {
  const t = player.queue.current, i = t.info, mood = player.get('mood');
  const pos = Math.min(player.position || 0, i.duration || 0);
  const req = t.requester?.username ? trunc(t.requester.username, 30) : 'Zera Autoplay';
  const prem = P.isPremium(player.guildId, t.requester?.id), themeKey = prem ? db.guild(player.guildId).theme || 'emerald' : 'emerald', TH = card.THEMES[themeKey] || card.THEMES.emerald;
  let png = null;
  try { png = await card.render({ theme: themeKey, title: i.title, author: i.author, requester: req, pos, dur: i.duration, volume: player.volume, paused: player.paused, live: i.isStream, artUrl: i.artworkUrl }); } catch (e) { console.warn('[card]', e.message); }
  const c = V.box(player.paused ? 0x1F8A41 : TH.accent), files = [];
  if (png) { files.push(new AttachmentBuilder(png, { name: 'np.png' })); c.addMediaGalleryComponents(V.gallery('attachment://np.png')); }
  else {
    const line = i.isStream ? `${em('live')} \`LIVE\`` : `\`${fmt(pos)}\` ${bar(pos, i.duration)} \`${fmt(i.duration)}\``;
    const head = `## ${link(i.title, i.uri)}\n**${trunc(i.author, 100)}**\n${line}`;
    if (i.artworkUrl) c.addSectionComponents(V.section(head, i.artworkUrl)); else c.addTextDisplayComponents(V.td(head));
  }
  c.addSeparatorComponents(V.sep());
  const next = player.queue.tracks[0];
  c.addTextDisplayComponents(V.td(
    `### ${player.paused ? '⏸️ Paused' : `${em('eq')} Now Playing`}\n` +
    `> **Song:** ${link(i.title, i.uri)} by \`${trunc(i.author, 60)}\`\n` +
    `> **Duration:** \`${i.isStream ? 'LIVE' : fmt(i.duration)}\`\n` +
    `> **Requester:** ${req}\n` +
    `> **Volume:** \`${player.volume}%\`  •  **Loop:** ${LOOP[player.repeatMode] || 'Off'}  •  **Filter:** ${F.label(player) || '`None`'}\n` +
    `> **Up next:** \`${player.queue.tracks.length}\`${next ? ` — ${trunc(`${next.info.title}`, 60)}` : ''}`));
  c.addSeparatorComponents(V.sep());
  for (const r of npRows(player)) c.addActionRowComponents(r);
  c.addSeparatorComponents(V.sep());
  c.addTextDisplayComponents(V.td(mood ? `-# 🎭 Mood: ${mood.mood} • ${mood.lang}${mood.trending ? ' • trending' : ''} • Zera Music${prem ? ' • 💎 Premium' : ''}` : player.get('autoplay') ? `-# ♾️ Autoplay on • Zera Music${prem ? ' • 💎 Premium' : ''}` : `-# Zera Music • Your perfect music companion${prem ? ' • 💎 Premium' : ''}`));
  return V.msg(c, { files, attachments: [], allowedMentions: { parse: [] } });
}
const npEnded = track => V.msg(V.box(cfg.dark).addTextDisplayComponents(V.td(`### ⏹️ Session ended\n${track ? `Last played: ${link(track.info.title, track.info.uri)}\n` : ''}Thanks for listening 💚`)), { attachments: [] });
function queuePayload(player, page = 0, eph = false) {
  const pages = chunk(player.queue.tracks, 10), tot = Math.max(1, pages.length);
  page = Math.min(Math.max(page, 0), tot - 1);
  const cur = player.queue.current;
  const list = (pages[page] || []).map((t, n) => `\`${page * 10 + n + 1}.\` ${link(trunc(t.info.title, 55), t.info.uri)} • \`${fmt(t.info.duration)}\``).join('\n') || '*Queue is empty*';
  const total = player.queue.tracks.reduce((a, t) => a + (t.info.duration || 0), 0);
  const nav = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`q:${page - 1}`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0), new ButtonBuilder().setCustomId(`q:${page + 1}`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= tot - 1));
  const c = V.box().addTextDisplayComponents(V.td('### 📜 Zera Queue'))
    .addTextDisplayComponents(V.td(cur ? `${em('eq')} **Now:** ${link(trunc(cur.info.title, 70), cur.info.uri)}` : '*Nothing playing*'))
    .addSeparatorComponents(V.sep()).addTextDisplayComponents(V.td(list)).addSeparatorComponents(V.sep()).addActionRowComponents(nav)
    .addTextDisplayComponents(V.td(`-# Page ${page + 1}/${tot} • ${player.queue.tracks.length} tracks • ${fmt(total)} total`));
  return V.msg(c, { eph, allowedMentions: { parse: [] } });
}
module.exports = { npPayload, npEnded, queuePayload };
