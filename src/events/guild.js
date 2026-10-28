// bot add/kick, thanks-for-invite, welcome (V2), autorole, invites, boosters, join/leave
const { AuditLogEvent, ChannelType, PermissionFlagsBits: P, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cfg = require('../config'), L = require('../logger'), V = require('../v2'), { em } = require('../emojis');
const invCache = new Map();
const linkRow = (...b) => new ActionRowBuilder().addComponents(b.map(([label, url]) => new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url)));
const chUrl = (g, id) => `https://discord.com/channels/${g}/${id}`;

function thanks(guild, dm = false) {
  const text = dm
    ? `### ${em('heart')} Thank you for adding Zera!\n> You added me to **${guild.name}** — thank you so much! ${em('sparkle')}\n> Join a voice channel and run \`/play <song>\` • \`/help\` shows everything I can do.\n\n> ${em('headphones')} **Need help or have ideas?** Join our support server:\n> ${cfg.links.support}`
    : `### ${em('heart')} Thanks for inviting Zera!\n> Hey **${guild.name}**! I’m **Zera** — a music bot with a pro player, mood autoplay and filters.\n\n> ${em('note')} Join a voice channel and run \`/play <song>\`\n> ${em('sparkle')} \`/help\` — all commands  •  \`/mood\` — mood autoplay\n> ${em('headphones')} Support server: ${cfg.links.support}`;
  const c = V.box().addMediaGalleryComponents(V.gallery('attachment://zera-help-banner.gif')).addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(text)).addSeparatorComponents(V.sep())
    .addActionRowComponents(linkRow(['Support Server', cfg.links.support], ['Invite Zera', cfg.links.invite]))
    .addTextDisplayComponents(V.td('-# Zera Music • Your perfect music companion'));
  return V.msg(c, { files: [V.att('zera-help-banner.gif')], allowedMentions: { parse: [] } });
}
function welcome(m) {
  const g = m.guild, n = g.memberCount;
  const c = V.box().addMediaGalleryComponents(V.gallery('attachment://zera-welcome-banner.gif')).addSeparatorComponents(V.sep())
    .addSectionComponents(V.section(`### ${em('sparkle')} Hey There! ${m}\n> Welcome to **${g.name}** — you’re member **#${n}** ${em('heart')}\n> Account created <t:${Math.floor(m.user.createdTimestamp / 1000)}:R>`, m.displayAvatarURL({ size: 256 })))
    .addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(`> ✅ **Verify** in <#${cfg.channels.verify}>\n> 🛟 **Need help?** open a ticket in <#${cfg.channels.panels.support}>\n> 🐞 **Found a bug?** <#${cfg.channels.panels.bug}>`))
    .addSeparatorComponents(V.sep())
    .addActionRowComponents(linkRow(['Verify', chUrl(g.id, cfg.channels.verify)], ['Support', chUrl(g.id, cfg.channels.panels.support)], ['Report a bug', chUrl(g.id, cfg.channels.panels.bug)]))
    .addTextDisplayComponents(V.td('-# Zera Music • Your perfect music companion'));
  return V.msg(c, { files: [V.att('zera-welcome-banner.gif')], allowedMentions: { users: [m.id] } });
}
async function cacheInvites(guild) { const inv = await guild.invites.fetch().catch(() => null); if (inv) invCache.set(guild.id, new Map(inv.map(i => [i.code, { uses: i.uses, inviter: i.inviter }]))); }

function init(client) {
  client.on('inviteCreate', i => cacheInvites(i.guild));
  client.on('inviteDelete', i => cacheInvites(i.guild));
  client.on('guildCreate', async guild => {
    await new Promise(r => setTimeout(r, 2500));   // give the audit log time to record the bot add
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 }).catch(() => null);
    const inviter = logs?.entries.find(e => e.target?.id === client.user.id)?.executor || null;
    const owner = await guild.fetchOwner().catch(() => null);
    // 1) thank-you DM with the support server link (inviter first, owner as fallback)
    let dmTo = null;
    for (const u of [inviter, owner?.user].filter(Boolean)) { if (await u.send(thanks(guild, true)).then(() => true).catch(() => false)) { dmTo = u; break; } }
    L.log(client, 'botAdd', { embeds: [L.le('✅ Added to a server', `**${guild.name}** (\`${guild.id}\`)\n**Members:** ${guild.memberCount}\n**Owner:** ${owner?.user.tag} (\`${guild.ownerId}\`)\n**Invited by:** ${inviter ? `${inviter.tag} (\`${inviter.id}\`)` : 'unknown'}\n**Thank-you DM:** ${dmTo ? `sent to ${dmTo.tag}` : 'failed (DMs closed)'}\n**Total servers:** ${client.guilds.cache.size}`, 0x57F287)] });
    // 2) thank-you message inside the server
    const ok = c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles]);
    const ch = guild.systemChannel && ok(guild.systemChannel) ? guild.systemChannel : guild.channels.cache.find(ok);
    await ch?.send(thanks(guild)).catch(() => {});
    cacheInvites(guild);
  });
  client.on('guildDelete', guild => { if (!guild.name) return; L.log(client, 'botKick', { embeds: [L.le('❌ Removed from a server', `**${guild.name}** (\`${guild.id}\`)\n**Members:** ${guild.memberCount}\n**Total servers:** ${client.guilds.cache.size}`, 0xE5484D)] }); invCache.delete(guild.id); });

  client.on('guildMemberAdd', async m => {
    if (m.guild.id !== L.home.id) return;
    if (cfg.roles.auto) m.roles.add(cfg.roles.auto).catch(e => console.warn('[autorole]', e.message));
    L.post(client, cfg.channels.welcome, welcome(m));
    const before = invCache.get(m.guild.id), now = await m.guild.invites.fetch().catch(() => null);
    const used = before && now ? now.find(i => i.uses > (before.get(i.code)?.uses ?? 0)) : null;
    if (now) invCache.set(m.guild.id, new Map(now.map(i => [i.code, { uses: i.uses, inviter: i.inviter }])));
    require('../systems/event').onJoin(m, used?.inviter);   // event: credit the inviter
    const who = used?.inviter ? `${used.inviter} (\`${used.inviter.tag}\`)` : m.user.bot ? 'OAuth / bot add' : 'Vanity URL / unknown';
    L.post(client, cfg.channels.invite, V.msg(V.box().addSectionComponents(V.section(`### 📨 New member via invite\n> **${m.user.tag}** just joined!\n> **Invited by** ${who}\n> **Invite** ${used ? `\`${used.code}\` • ${used.uses} uses` : 'unknown'}\n> **Members** \`${m.guild.memberCount}\``, m.displayAvatarURL())).addTextDisplayComponents(V.td('-# Zera Music • invite tracker')), { allowedMentions: { parse: [] } }));
    L.hl(m.guild, 'joinleave', '📥 Member joined', `${m} • ${m.user.tag}\n**ID:** \`${m.id}\`\n**Created:** <t:${Math.floor(m.user.createdTimestamp / 1000)}:R>`, 0x57F287);
  });
  client.on('guildMemberRemove', m => L.hl(m.guild, 'joinleave', '📤 Member left', `${m.user?.tag} (\`${m.id}\`)\n**Joined:** ${m.joinedTimestamp ? `<t:${Math.floor(m.joinedTimestamp / 1000)}:R>` : 'unknown'}`, 0xE5484D));
  client.on('guildMemberUpdate', (o, n) => {
    if (n.guild.id !== L.home.id) return;
    if (!o.premiumSince && n.premiumSince) L.post(client, cfg.channels.boosters, V.msg(V.box(0xFF73FA).addSectionComponents(V.section(`### 💎 New Server Boost!\n> Thank you ${n} for boosting **${n.guild.name}** ${em('heart')}\n> **Boosts** \`${n.guild.premiumSubscriptionCount}\`  •  **Level** \`${n.guild.premiumTier}\``, n.displayAvatarURL())).addTextDisplayComponents(V.td('-# Zera Music • boosters')), { allowedMentions: { users: [n.id] } }));
    if (o.premiumSince && !n.premiumSince) L.post(client, cfg.channels.boosters, { embeds: [L.le('💔 Boost ended', `${n} stopped boosting.`, 0xE5484D)] });
    const a = o.communicationDisabledUntilTimestamp, b = n.communicationDisabledUntilTimestamp;
    if (a !== b) L.hl(n.guild, 'timeout', b && b > Date.now() ? '⏳ Member timed out' : '✅ Timeout removed', `${n} (\`${n.user.tag}\`)${b && b > Date.now() ? `\n**Until:** <t:${Math.floor(b / 1000)}:F>` : ''}`);
  });
  client.on('userUpdate', (o, n) => { const a = o.primaryGuild?.tag, b = n.primaryGuild?.tag; if (a !== b) L.log(client, 'tag', { embeds: [L.le('🏷️ Server tag changed', `${n.tag} (\`${n.id}\`)\n\`${a || 'none'}\` → \`${b || 'none'}\``)] }); });
}
module.exports = { init, cacheInvites, welcome, thanks };
