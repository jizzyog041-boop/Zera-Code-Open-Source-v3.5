const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cfg = require('../config'), V = require('../v2');
const { E } = require('../utils');
async function ensurePanel(client) {
  const ch = await client.channels.fetch(cfg.channels.verify).catch(() => null); if (!ch) return;
  const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null);
  if (msgs?.some(m => m.author.id === client.user.id && JSON.stringify(m.components).includes('verify:go'))) return;
  await ch.send(V.msg(V.box().addTextDisplayComponents(V.td('### ✅ Verification\n> Welcome to **Zera Support**!\n> Press the button below to verify and unlock the server.\n> By verifying you agree to follow the server rules.')).addSeparatorComponents(V.sep())
    .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify:go').setLabel('Verify').setEmoji('✅').setStyle(ButtonStyle.Success)))
    .addTextDisplayComponents(V.td('-# Zera Music • zera-panel')))).catch(e => console.warn('[verify]', e.message));
}
async function handle(i) {
  if (!cfg.roles.verified) return i.reply({ embeds: [E.err('Verified role isn’t configured yet. Ask an admin to set `VERIFIED_ROLE_ID`.')], flags: 64 });
  if (i.member.roles.cache.has(cfg.roles.verified)) return i.reply({ embeds: [E.ok('You’re already verified 💚')], flags: 64 });
  await i.member.roles.add(cfg.roles.verified).catch(() => null);
  return i.reply({ embeds: [E.ok('Verified! Welcome aboard 💚')], flags: 64 });
}
module.exports = { ensurePanel, handle };
