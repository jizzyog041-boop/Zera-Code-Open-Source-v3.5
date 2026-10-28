// Zera Companion update system (per server).
// Every server starts on the legacy version (V1). While on V1, commands show an "Update" panel instead of running.
// A member with Manage Server presses the button -> the server becomes V3.5 (stored in the kv table) and everything works.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const cfg = require('../config'), db = require('../db'), V = require('../v2');
const C = cfg.companion, KEY = id => `companion:${id}`, recent = new Map();

const isUpdated = gid => !!gid && db.kvGet(KEY(gid)) === C.current;
const label = gid => `${C.name} ${isUpdated(gid) ? C.current : C.legacy}`;
const setVersion = (gid, on) => (on ? db.kvSet(KEY(gid), C.current) : db.raw.prepare('DELETE FROM kv WHERE k=?').run(KEY(gid)));
const canUpdate = (i) => cfg.owners.includes(i.user.id) || i.guild?.ownerId === i.user.id || !!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

const links = () => new ButtonBuilder().setLabel('Support').setStyle(ButtonStyle.Link).setURL(cfg.links.support);
const news = () => `**What’s new in ${C.current}**\n${C.whatsNew.map(x => `> 💚 ${x}`).join('\n')}`;

function legacyPanel({ updating = false } = {}) {
  const b = new ButtonBuilder().setCustomId('companion:update').setStyle(ButtonStyle.Success).setEmoji('🦋').setLabel(updating ? 'Updating…' : `Update to ${C.current}`).setDisabled(updating);
  return V.msg(V.box()
    .addTextDisplayComponents(V.td(`### 🦋 ${C.name} ${C.legacy}  →  ${C.current}\n> ${updating ? '⏳ Updating this server, please wait…' : `A new version is ready for this server. Commands are paused until you update.`}`))
    .addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(news()))
    .addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(`-# Currently running **${C.name} ${C.legacy}** • Only members with **Manage Server** can press Update.`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(b, links())));
}
function donePanel(by) {
  return V.msg(V.box()
    .addTextDisplayComponents(V.td(`### 🦋 ${C.name} ${C.current}\n> ✅ This server is now on **${C.name} ${C.current}**${by ? ` — updated by <@${by}>` : ''}. Enjoy! 💚`))
    .addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(news() + `\n\n-# Try \`/play <song>\`, \`/mood\` or \`/help\``))
    .addActionRowComponents(new ActionRowBuilder().addComponents(links())));
}
const alreadyPanel = () => V.msg(V.box().addTextDisplayComponents(V.td(`### 🦋 ${C.name} ${C.current}\n> ✅ This server is already up to date.`)));

// ---- gate for commands (called from registry.execute). returns true if the command was blocked ----
async function gate(ctx) {
  const c = ctx.cmd;
  if (c.owner || C.allow.includes(c.name) || !ctx.guildId || isUpdated(ctx.guildId)) return false;
  const now = Date.now();
  if (now - (recent.get(ctx.guildId) || 0) < 15000) {   // don't spam the channel with panels
    if (ctx.isSlash) await ctx.interaction.reply({ ...legacyPanel(), flags: V.V2 | V.EPH }).catch(() => {});
    return true;
  }
  recent.set(ctx.guildId, now);
  await ctx.reply(legacyPanel()).catch(() => {});
  return true;
}
// ---- gate for old command-like buttons/menus (now playing, queue, mood, search) ----
async function gateInteraction(i) {
  if (isUpdated(i.guildId)) return false;
  await i.reply({ ...legacyPanel(), flags: V.V2 | V.EPH }).catch(() => {});
  return true;
}

async function handle(i, client) {
  if (i.customId !== 'companion:update') return;
  if (isUpdated(i.guildId)) return i.reply({ ...alreadyPanel(), flags: V.V2 | V.EPH });
  if (!canUpdate(i)) return i.reply({ ...V.note('❌ Only members with **Manage Server** can update Zera for this server. Ask an admin to press **Update**.', 0xE5484D), flags: V.V2 | V.EPH });
  await i.update(legacyPanel({ updating: true }));
  await new Promise(r => setTimeout(r, 1800));
  setVersion(i.guildId, true);
  await i.editReply(donePanel(i.user.id)).catch(() => {});
  try { require('../logger').log(client, 'commands', { embeds: [require('../logger').le('🦋 Server Updated', `**${C.name} ${C.current}**\n**Server:** ${i.guild?.name} (\`${i.guildId}\`)\n**By:** ${i.user.tag} (\`${i.user.id}\`)`)] }); } catch {}
}

module.exports = { isUpdated, label, setVersion, gate, gateInteraction, handle, legacyPanel, donePanel, alreadyPanel };
