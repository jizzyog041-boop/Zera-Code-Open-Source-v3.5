const { AuditLogEvent } = require('discord.js');
const L = require('../logger'), snipe = require('../systems/snipe');
const { trunc } = require('../utils');
const G = 0x57F287, R = 0xE5484D;
function init(client) {
  const h = L.hl;
  client.on('messageDelete', m => { if (!m.guild || m.author?.bot) return; snipe.set(m.channelId, { content: m.content, tag: m.author?.tag || 'unknown', avatar: m.author?.displayAvatarURL(), at: Date.now() }); h(m.guild, 'message', '🗑️ Message deleted', `**Author:** ${m.author?.tag || 'unknown'}\n**Channel:** <#${m.channelId}>\n**Content:** ${trunc(m.content || '*not cached / attachment*', 1500)}`, R); });
  client.on('messageUpdate', (o, n) => { if (!n.guild || n.author?.bot || o.content === n.content) return; h(n.guild, 'message', '✏️ Message edited', `**Author:** ${n.author?.tag}\n**Channel:** <#${n.channelId}> • [jump](${n.url})\n**Before:** ${trunc(o.content || '*unknown*', 900)}\n**After:** ${trunc(n.content, 900)}`); });
  client.on('messageDeleteBulk', (ms, ch) => ch.guild && h(ch.guild, 'message', '🧹 Bulk delete', `**${ms.size}** messages in <#${ch.id}>`, R));
  client.on('channelCreate', c => c.guild && h(c.guild, 'channel', '📁 Channel created', `${c} (\`${c.name}\`)`, G));
  client.on('channelDelete', c => c.guild && h(c.guild, 'channel', '🗑️ Channel deleted', `\`#${c.name}\``, R));
  client.on('channelUpdate', (o, n) => { if (!n.guild) return; const d = []; if (o.name !== n.name) d.push(`Name: \`${o.name}\` → \`${n.name}\``); if (o.topic !== n.topic) d.push('Topic changed'); if (d.length) h(n.guild, 'channel', '🔧 Channel updated', `${n}\n${d.join('\n')}`); });
  client.on('roleCreate', r => h(r.guild, 'role', '🏷️ Role created', `${r} (\`${r.name}\`)`, G));
  client.on('roleDelete', r => h(r.guild, 'role', '🗑️ Role deleted', `\`${r.name}\``, R));
  client.on('roleUpdate', (o, n) => { const d = []; if (o.name !== n.name) d.push(`Name: \`${o.name}\` → \`${n.name}\``); if (o.color !== n.color) d.push(`Color: \`${o.hexColor}\` → \`${n.hexColor}\``); if (!o.permissions.equals(n.permissions)) d.push('Permissions changed'); if (d.length) h(n.guild, 'role', '🔧 Role updated', `${n}\n${d.join('\n')}`); });
  client.on('guildMemberUpdate', (o, n) => { const add = n.roles.cache.filter(r => !o.roles.cache.has(r.id)), rem = o.roles.cache.filter(r => !n.roles.cache.has(r.id)); if (add.size || rem.size) h(n.guild, 'role', '👥 Member roles changed', `${n}\n${add.size ? `➕ ${add.map(r => r).join(' ')}\n` : ''}${rem.size ? `➖ ${rem.map(r => r).join(' ')}` : ''}`); });
  client.on('voiceStateUpdate', (o, n) => {
    const g = n.guild, m = n.member; if (!m || m.user.bot) return;
    if (!o.channelId && n.channelId) h(g, 'voice', '🔊 Joined voice', `${m} → <#${n.channelId}>`, G);
    else if (o.channelId && !n.channelId) h(g, 'voice', '🔇 Left voice', `${m} ← <#${o.channelId}>`, R);
    else if (o.channelId !== n.channelId) h(g, 'voice', '🔁 Moved voice', `${m}: <#${o.channelId}> → <#${n.channelId}>`);
  });
  client.on('guildBanAdd', async b => { const e = (await b.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 }).catch(() => null))?.entries.first(); h(b.guild, 'ban', '🔨 Member banned', `**User:** ${b.user.tag} (\`${b.user.id}\`)\n**By:** ${e?.executor?.tag || 'unknown'}\n**Reason:** ${b.reason || e?.reason || 'No reason'}`, R); });
  client.on('guildBanRemove', b => h(b.guild, 'ban', '♻️ Member unbanned', `${b.user.tag} (\`${b.user.id}\`)`, G));
  client.on('guildMemberRemove', async m => { const e = (await m.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 }).catch(() => null))?.entries.first(); if (e && e.target?.id === m.id && Date.now() - e.createdTimestamp < 5000) h(m.guild, 'ban', '👢 Member kicked', `**User:** ${m.user.tag}\n**By:** ${e.executor?.tag}\n**Reason:** ${e.reason || 'No reason'}`, R); });
  client.on('emojiCreate', e => h(e.guild, 'emoji', '😀 Emoji created', `${e} \`:${e.name}:\``, G));
  client.on('emojiDelete', e => h(e.guild, 'emoji', '🗑️ Emoji deleted', `\`:${e.name}:\``, R));
  client.on('emojiUpdate', (o, n) => o.name !== n.name && h(n.guild, 'emoji', '🔧 Emoji renamed', `${n}: \`${o.name}\` → \`${n.name}\``));
  client.on('messageReactionAdd', (r, u) => { if (u.bot || !r.message.guild) return; h(r.message.guild, 'reaction', '➕ Reaction added', `${u} reacted ${r.emoji} in <#${r.message.channelId}> • [jump](${r.message.url})`); });
  client.on('messageReactionRemove', (r, u) => { if (u.bot || !r.message.guild) return; h(r.message.guild, 'reaction', '➖ Reaction removed', `${u} removed ${r.emoji} in <#${r.message.channelId}> • [jump](${r.message.url})`); });
}
module.exports = { init };
