const { EmbedBuilder } = require('discord.js');
const cfg = require('./config');
const home = { id: null };
async function post(client, channelId, payload) {
  try {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (ch?.isTextBased()) return await ch.send({ allowedMentions: { parse: [] }, ...payload });
  } catch (e) { console.error('[log]', e.message); }
}
const le = (title, desc, color = cfg.color) => new EmbedBuilder().setColor(color).setTitle(title).setDescription(String(desc).slice(0, 4000)).setTimestamp();
const log = (client, key, payload) => post(client, cfg.logs[key], payload);               // global (all servers)
const hlog = (guild, key, payload) => (guild?.id === home.id ? post(guild.client, cfg.logs[key], payload) : null); // home server only
const hl = (guild, key, title, desc, color) => hlog(guild, key, { embeds: [le(title, desc, color)] });
module.exports = { home, post, le, log, hlog, hl };
