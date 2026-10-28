const { AuditLogEvent: A } = require('discord.js');
const L = require('../logger');
const raid = new Set(), joins = [], hits = new Map();
const setRaid = (gid, on) => (on ? raid.add(gid) : raid.delete(gid));
const isRaid = gid => raid.has(gid);
async function watch(guild, type, label) {
  if (guild.id !== L.home.id) return;
  const logs = await guild.fetchAuditLogs({ type, limit: 1 }).catch(() => null), e = logs?.entries.first();
  if (!e || Date.now() - e.createdTimestamp > 5000 || !e.executor) return;
  const uid = e.executor.id; if (uid === guild.client.user.id || uid === guild.ownerId) return;
  const key = `${uid}:${label}`, now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < 15000); arr.push(now); hits.set(key, arr);
  if (arr.length >= 3) {
    hits.delete(key);
    const d = `**Executor:** ${e.executor.tag} (\`${uid}\`)\n**Action:** ${label} ×${arr.length} in 15s`;
    L.hl(guild, 'nuke', '☢️ Possible nuke attempt', d, 0xE5484D); L.hl(guild, 'security', '🚨 Anti-nuke alert', d, 0xE5484D);
  }
}
function init(client) {
  client.on('channelDelete', c => c.guild && watch(c.guild, A.ChannelDelete, 'channel deletes'));
  client.on('roleDelete', r => watch(r.guild, A.RoleDelete, 'role deletes'));
  client.on('guildBanAdd', b => watch(b.guild, A.MemberBanAdd, 'bans'));
  client.on('guildMemberAdd', m => {
    if (m.guild.id !== L.home.id) return;
    const now = Date.now(); joins.push(now); while (joins.length && now - joins[0] > 10000) joins.shift();
    if (joins.length >= 8 && !isRaid(m.guild.id)) { setRaid(m.guild.id, true); L.hl(m.guild, 'raid', '🚨 Possible raid detected', `**${joins.length}** joins in 10s. Raid mode enabled — new accounts (<7d) are kicked. Disable with \`raidmode off\`.`, 0xE5484D); }
    if (isRaid(m.guild.id) && now - m.user.createdTimestamp < 7 * 86400000) {
      m.send('🛡️ This server is in raid-protection mode. Please try again later.').catch(() => {});
      m.kick('raid mode').then(() => L.hl(m.guild, 'security', '🛡️ Raid kick', `${m.user.tag} (\`${m.id}\`) kicked — account too new`)).catch(() => {});
    }
  });
}
module.exports = { init, setRaid, isRaid };
