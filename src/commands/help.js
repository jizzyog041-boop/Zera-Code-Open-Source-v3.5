const { def, commands, get } = require('./registry');
const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cfg = require('../config'), db = require('../db'), V = require('../v2'), { em } = require('../emojis');
const { chunk, trunc } = require('../utils');
const banner = () => V.att('zera-help-banner.gif');
const CATS = [
  ['Music', '🎵', 'Play, queue and control music'], ['Filters', '🎛️', 'Bassboost, nightcore, 8D and more'], ['Mood', '🎭', 'Mood-based autoplay & trending'],
  ['Vibes', '🌈', 'Genres, decades & activities'], ['Radio', '📻', '24/7 radio streams'], ['Artists', '🎤', 'Quick-play top artists'],
  ['Playlists', '📚', 'Favorites, playlists & stats'], ['Moderation', '🛡️', 'Keep your server safe'], ['Utility', '🧰', 'Info & handy tools'],
  ['Fun', '🎉', 'Games & interactions'], ['Settings', '⚙️', 'Prefix, DJ role, 24/7 and more'], ['Premium', '💎', 'Plans, themes & perks'], ['Events', '🎁', 'Zera event — win Zera Pro'],
];
const by = cat => [...commands.values()].filter(c => c.category === cat);
const prefixOf = gid => (gid && db.guild(gid).prefix) || cfg.prefix;
const menu = sel => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('help:menu').setPlaceholder('Select a category...').addOptions(
  { label: 'Home', value: 'home', emoji: '🏠', description: 'Back to the overview', default: sel === 'home' },
  ...CATS.map(([n, e, d]) => ({ label: `${n} (${by(n).length})`, value: n, emoji: e, description: d, default: sel === n }))));
const linkText = () => ['[Support Server](' + cfg.links.support + ')', '[Invite Bot](' + cfg.links.invite + ')', '[Premium](' + cfg.premium.buyUrl + ')', cfg.premium.voteUrl ? '[Vote](' + cfg.premium.voteUrl + ')' : null].filter(Boolean).join(' • ');
function home(gid) {
  const c = V.box().addMediaGalleryComponents(V.gallery('attachment://zera-help-banner.gif')).addSeparatorComponents(V.sep())
    .addSectionComponents(V.section(
      `## 🎧 Zera Help Menu\nZera is a high-quality music bot for Discord that lets you stream from **YouTube**, **SoundCloud** and more. With fast responses, crystal-clear audio, mood autoplay and **24/7 mode**, Zera keeps your server’s music flowing nonstop.\n\n` +
      `• *You can start listening to music by just joining a voice channel and typing* \`/play [song name or link]\`\n• *To get more help on a specific command, run* \`/help <command>\``, 'attachment://zera-logo.png'))
    .addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(`**Command Categories:**\n${CATS.map(([n, e]) => `${e} **${n}** • \`${by(n).length}\``).join('\n')}`))
    .addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(`**Links**\n${linkText()}`))
    .addSeparatorComponents(V.sep()).addActionRowComponents(menu('home'))
    .addTextDisplayComponents(V.td(`-# Zera Music • Prefix \`${prefixOf(gid)}\` • ${commands.size}+ commands`));
  return V.msg(c, { files: [banner(), V.att('zera-logo.png')], attachments: [], allowedMentions: { parse: [] } });
}
function category(cat, page = 0, gid) {
  const list = by(cat), meta = CATS.find(x => x[0] === cat), p = prefixOf(gid);
  const detailed = list.length <= 30, pages = detailed ? chunk(list, 15) : chunk(list, 90), tot = Math.max(1, pages.length);
  page = Math.min(Math.max(page, 0), tot - 1);
  const body = detailed ? (pages[page] || []).map(x => `**\`${x.name}\`**${x.slash ? ' 🔹' : ''} — ${trunc(x.description, 80)}`).join('\n') : (pages[page] || []).map(x => `\`${x.name}\``).join('  ');
  const c = V.box().addTextDisplayComponents(V.td(`## ${meta[1]} ${cat} — ${list.length} commands\n${meta[2]}`)).addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(body || 'No commands.')).addSeparatorComponents(V.sep());
  if (tot > 1) c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`help:pg:${cat}:${page - 1}`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`help:pg:${cat}:${page + 1}`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= tot - 1)));
  c.addActionRowComponents(menu(cat)).addTextDisplayComponents(V.td(`${linkText()}\n-# ${detailed ? '🔹 = slash command too • ' : ''}Use ${p}<command> • Page ${page + 1}/${tot}`));
  return V.msg(c, { attachments: [] });
}
function detail(cmd, gid) {
  const p = prefixOf(gid), usage = cmd.opts.map(o => (o.required ? `<${o.name}>` : `[${o.name}]`)).join(' ');
  const c = V.box().addTextDisplayComponents(V.td(`## 🔎 ${p}${cmd.name}\n${cmd.description}`)).addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(`> **Usage:** \`${p}${cmd.name}${usage ? ' ' + usage : ''}\`${cmd.slash ? `  •  \`/${cmd.name}\`` : ''}\n> **Category:** ${cmd.category}\n> **Aliases:** ${cmd.aliases.length ? cmd.aliases.map(a => `\`${a}\``).join(' ') : '`none`'}\n> **Needs:** ${cmd.owner ? 'Bot owner' : cmd.perm ? `\`${String(cmd.perm).replace(/Permission/, '')}\`` : 'Nobody special'}\n${cmd.opts.length ? `> **Options:** ${cmd.opts.map(o => `\`${o.name}\` — ${o.desc || ''}`).join(' • ')}` : ''}`));
  return V.msg(c);
}
async function handle(i) {
  const [, kind, cat, pg] = i.customId.split(':');
  if (kind === 'menu') { const v = i.values[0]; return i.update(v === 'home' ? home(i.guildId) : category(v, 0, i.guildId)); }
  if (kind === 'pg') return i.update(category(cat, Number(pg), i.guildId));
}
def({ name: 'help', aliases: ['h', 'menu'], category: 'Utility', slash: true, description: 'Open the Zera help menu', opts: [{ name: 'command', desc: 'Get help for one command', rest: true }], run: c => {
  const q = c.args[0]?.toLowerCase().replace(/^[\/]|^z!/, '').trim();
  if (q) { const cmd = get(q); if (!cmd) return c.reply({ embeds: [require('../utils').E.err(`No command named \`${q}\`. Try \`/commands ${q}\` to search.`)], ephemeral: true }); return c.reply(detail(cmd, c.guildId)); }
  return c.reply(home(c.guildId));
} });
module.exports = { handle, home, banner };
