const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits: P, ChannelType, AttachmentBuilder } = require('discord.js');
const cfg = require('../config'), L = require('../logger'), V = require('../v2');
const { E, trunc } = require('../utils');
const S = TextInputStyle;
const TYPES = {
  staff: { channel: cfg.channels.panels.staff, emoji: '📝', name: 'Staff Application', color: 0x3CFF79, desc: 'Want to join the Zera team? Press the button, fill the form and a private ticket will open for you.', fields: [['age', 'Your age', S.Short], ['exp', 'Moderation / staff experience', S.Paragraph], ['why', 'Why should we pick you?', S.Paragraph], ['time', 'Timezone & daily active hours', S.Short]] },
  support: { channel: cfg.channels.panels.support, emoji: '🛟', name: 'Support Ticket', color: 0x3CFF79, desc: 'Need help with Zera? Open a ticket and our team will assist you.', fields: [['issue', 'Describe your issue', S.Paragraph], ['server', 'Server ID (optional)', S.Short, false]] },
  bug: { channel: cfg.channels.panels.bug, emoji: '🐞', name: 'Bug Report', color: 0x3CFF79, desc: 'Found a bug? Tell us what happened so we can fix it quickly.', fields: [['title', 'Bug title', S.Short], ['steps', 'Steps to reproduce', S.Paragraph], ['expected', 'What should have happened?', S.Paragraph]] },
};
async function ensurePanels(client) {
  for (const [k, t] of Object.entries(TYPES)) {
    const ch = await client.channels.fetch(t.channel).catch(() => null); if (!ch) { console.warn('[tickets] panel channel missing:', k); continue; }
    const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null);
    if (msgs?.some(m => m.author.id === client.user.id && JSON.stringify(m.components).includes(`ticket:open:${k}`))) continue;
    await ch.send(V.msg(V.box(t.color).addTextDisplayComponents(V.td(`### ${t.emoji} ${t.name}\n> ${t.desc}\n> Press **Open** below to get started.`)).addSeparatorComponents(V.sep())
      .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket:open:${k}`).setLabel(`Open ${t.name}`).setEmoji(t.emoji).setStyle(ButtonStyle.Primary)))
      .addTextDisplayComponents(V.td('-# Zera Music • zera-panel')))).catch(e => console.warn('[tickets]', k, e.message));
  }
}
const staffOk = m => m.permissions.has(P.ManageChannels) || (cfg.roles.staff && m.roles.cache.has(cfg.roles.staff));
async function handle(i) {
  const [, act, type] = i.customId.split(':');
  if (i.isButton() && act === 'open') {
    const t = TYPES[type];
    const existing = i.guild.channels.cache.find(c => c.topic === `ticket:${type}:${i.user.id}`);
    if (existing) return i.reply({ embeds: [E.err(`You already have an open ticket: ${existing}`)], flags: 64 });
    const modal = new ModalBuilder().setCustomId(`ticket:modal:${type}`).setTitle(t.name);
    modal.addComponents(...t.fields.map(([id, label, style, req]) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(req !== false).setMaxLength(style === S.Short ? 100 : 1000))));
    return i.showModal(modal);
  }
  if (i.isModalSubmit() && act === 'modal') {
    const t = TYPES[type]; await i.deferReply({ flags: 64 });
    const panel = await i.client.channels.fetch(t.channel).catch(() => null);
    const overwrites = [{ id: i.guild.roles.everyone.id, deny: [P.ViewChannel] }, { id: i.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles] }, { id: i.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels, P.ReadMessageHistory, P.EmbedLinks] }];
    if (cfg.roles.staff) overwrites.push({ id: cfg.roles.staff, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages] });
    const ch = await i.guild.channels.create({ name: `${type}-${i.user.username}`.slice(0, 90), type: ChannelType.GuildText, parent: panel?.parentId || null, topic: `ticket:${type}:${i.user.id}`, permissionOverwrites: overwrites }).catch(e => { console.error('[ticket]', e); return null; });
    if (!ch) return i.editReply({ embeds: [E.err('I couldn’t create the ticket channel (check my permissions).')] });
    const answers = t.fields.map(([id, label]) => `**${label}**\n${trunc(i.fields.getTextInputValue(id) || '—', 900)}`).join('\n\n');
    await ch.send({ ...V.msg(V.box(t.color).addTextDisplayComponents(V.td(`### ${t.emoji} ${t.name}\n**Opened by** ${i.user} • <t:${Math.floor(Date.now() / 1000)}:R>${cfg.roles.staff ? `\n<@&${cfg.roles.staff}>` : ''}`)).addSeparatorComponents(V.sep())
      .addTextDisplayComponents(V.td(answers)).addSeparatorComponents(V.sep())
      .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:claim').setLabel('Claim').setEmoji('🙋').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('ticket:close').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger)))), allowedMentions: { users: [i.user.id], roles: cfg.roles.staff ? [cfg.roles.staff] : [] } });
    return i.editReply({ embeds: [E.ok(`Your ticket is ready: ${ch}`)] });
  }
  if (i.isButton() && act === 'claim') {
    if (!staffOk(i.member)) return i.reply({ embeds: [E.err('Only staff can claim tickets.')], flags: 64 });
    return i.reply({ embeds: [E.ok(`${i.user} claimed this ticket.`)] });
  }
  if (i.isButton() && act === 'close') {
    const [, tp, owner] = (i.channel.topic || '').split(':');
    if (i.user.id !== owner && !staffOk(i.member)) return i.reply({ embeds: [E.err('Only the ticket owner or staff can close this.')], flags: 64 });
    await i.reply({ embeds: [E.base().setDescription('🔒 Closing ticket & saving transcript…')] });
    let all = [], before;
    for (let n = 0; n < 5; n++) { const b = await i.channel.messages.fetch({ limit: 100, before }).catch(() => null); if (!b?.size) break; all.push(...b.values()); before = b.last().id; }
    const txt = all.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}${m.embeds.length ? ' [embed]' : ''}${m.attachments.size ? ' ' + m.attachments.map(a => a.url).join(' ') : ''}`).join('\n') || 'No messages.';
    const file = () => new AttachmentBuilder(Buffer.from(txt, 'utf8'), { name: `${i.channel.name}-transcript.txt` });
    await L.post(i.client, cfg.logs.transcript, { embeds: [L.le('📄 Ticket Transcript', `**Ticket:** ${i.channel.name}\n**Type:** ${tp}\n**Owner:** <@${owner}>\n**Closed by:** ${i.user.tag}\n**Messages:** ${all.length}`)], files: [file()] });
    i.client.users.fetch(owner).then(u => u.send({ embeds: [E.info('🔒 Your ticket was closed', `**${i.channel.name}** in ${i.guild.name}`)], files: [file()] })).catch(() => {});
    setTimeout(() => i.channel.delete('ticket closed').catch(() => {}), 4000);
  }
}
module.exports = { ensurePanels, handle };
