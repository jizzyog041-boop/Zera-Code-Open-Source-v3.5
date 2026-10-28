const { def } = require('./registry');
const db = require('../db'), cfg = require('../config'), L = require('../logger');
const { E, UserError, idOf } = require('../utils'), P = require('../premium'), M = require('../music/manager');
const C = 'Settings', MG = 'ManageGuild';
def({ name: 'prefix', category: C, slash: true, perm: MG, description: 'View or change the prefix', opts: [{ name: 'new', desc: 'New prefix (max 5 chars)' }], run: c => {
  const g = db.guild(c.guildId);
  if (!c.args[0]) return c.reply({ embeds: [E.ok(`Prefix: \`${g.prefix || cfg.prefix}\` (or @mention me). Slash commands always work.`)] });
  if (!c.member.permissions.has(MG)) throw new UserError('You need **Manage Server**.');
  const old = g.prefix || cfg.prefix; g.prefix = c.args[0].slice(0, 5); db.save();
  L.log(c.client, 'prefix', { embeds: [L.le('🔧 Prefix Changed', `**Server:** ${c.guild.name} (\`${c.guildId}\`)\n**By:** ${c.user.tag}\n\`${old}\` → \`${g.prefix}\``)] });
  return c.reply({ embeds: [E.ok(`Prefix changed to \`${g.prefix}\``)] });
} });
def({ name: '247', aliases: ['stay', 'twentyfourseven'], category: C, slash: true, perm: MG, description: 'Toggle 24/7 mode (stay in voice)', run: c => { const g = db.guild(c.guildId); if (!g.twentyFourSeven) P.need(c.guildId, c.user.id, 'plus', '24/7 mode'); g.twentyFourSeven = !g.twentyFourSeven; if (g.twentyFourSeven) { g.vc247 = c.member.voice.channelId || M.lm?.getPlayer(c.guildId)?.voiceChannelId || null; g.text247 = c.channel.id; } return c.reply({ embeds: [E.ok(`24/7 mode: **${g.twentyFourSeven ? 'ON' : 'OFF'}**${g.twentyFourSeven && P.rank(c.guildId, c.user.id) >= 2 ? '\nZera Pro: I’ll auto-rejoin after restarts 👑' : ''}`)] }); } });
def({ name: 'announce', category: C, perm: MG, description: 'Toggle Now Playing messages', run: c => { const g = db.guild(c.guildId); g.announce = g.announce === false; db.save(); return c.reply({ embeds: [E.ok(`Now Playing messages: **${g.announce ? 'ON' : 'OFF'}**`)] }); } });
def({ name: 'dj', category: C, slash: true, perm: MG, description: 'Set the DJ role (leave empty to disable)', opts: [{ name: 'role', type: 'role', desc: 'DJ role' }], run: c => { const g = db.guild(c.guildId); g.djRole = c.args[0] ? idOf(c.args[0]) : null; db.save(); return c.reply({ embeds: [E.ok(g.djRole ? `DJ role: <@&${g.djRole}>` : 'DJ role disabled.')] }); } });
def({ name: 'setvolume', aliases: ['defaultvolume'], category: C, perm: MG, description: 'Default volume for new sessions', opts: [{ name: 'level', type: 'integer', desc: '0-150', required: true, min: 0, max: 150 }], run: c => { const v = Number(c.args[0]); if (!(v >= 0 && v <= 150)) throw new UserError('0 - 150 only.'); db.guild(c.guildId).volume = v; db.save(); return c.reply({ embeds: [E.ok(`Default volume: **${v}%**`)] }); } });
def({ name: 'settings', aliases: ['config'], category: C, slash: true, description: 'Show this server’s Zera settings', run: c => { const g = db.guild(c.guildId); return c.reply({ embeds: [E.info('⚙️ Zera settings', `**Prefix:** \`${g.prefix || cfg.prefix}\`\n**24/7:** ${g.twentyFourSeven ? 'ON' : 'OFF'}\n**DJ role:** ${g.djRole ? `<@&${g.djRole}>` : 'none'}\n**Default volume:** ${g.volume}%\n**Now Playing msgs:** ${g.announce === false ? 'OFF' : 'ON'}`)] }); } });
def({ name: 'resetsettings', category: C, perm: MG, description: 'Reset all Zera settings', run: c => { db.resetGuild(c.guildId); return c.reply({ embeds: [E.ok('Settings reset.')] }); } });
