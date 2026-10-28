const { ActivityType, InteractionType } = require('discord.js');
const cfg = require('../config'), db = require('../db'), L = require('../logger');
const R = require('../commands'), M = require('../music/manager'), controls = require('../music/controls'), mood = require('../music/mood');
const help = require('../commands/help'), tickets = require('../systems/tickets'), verify = require('../systems/verify'), snipe = require('../systems/snipe'), dbcollect = require('../systems/dbcollect');
const guildEvents = require('./guild'), emojis = require('../emojis'), V = require('../v2'), premiumCmd = require('../commands/premium'), P = require('../premium');
const { E } = require('../utils');

function ctxFrom(client, i) { return new R.Ctx(client, { interaction: i, args: [], cmd: { name: i.customId || i.commandName, opts: [] } }); }

function greeting(m, p) {
  const c = V.box().addTextDisplayComponents(V.td(`### 👋 Hello, How are you machachee? 💚\n> I’m **Zera** — your music buddy! (\`${require('../systems/companion').label(m.guildId)}\`) My prefix here is \`${p}\`\n> 🎵 \`/play <song>\`  •  🎭 \`/mood\`  •  🎧 \`/help\``));
  return V.msg(c, { allowedMentions: { repliedUser: false } });
}
function startStatus(client) { require('../presence').start(client); }   // live "Playing" line (servers/users/VC) + custom status, refreshed every minute

function init(client) {
  client.once('ready', async () => {
    console.log(`[zera] logged in as ${client.user.tag}`);
    await M.lm.init({ id: client.user.id, username: client.user.username });
    P.attach(client); client.application.entitlements?.fetch().catch(() => {});
    const emojiReady = emojis.sync(client);   // uploads happen in the background on first start
    const slash = R.slashPayloads(false);
    if (slash.length > 100) console.warn(`[zera] ${slash.length} slash commands > 100 limit! trim some.`);
    await client.application.commands.set(slash.slice(0, 100)).then(() => console.log(`[zera] registered ${Math.min(100, slash.length)} slash commands • ${R.commands.size} total commands`)).catch(e => console.error('[slash]', e.message));
    await client.application.commands.set(R.slashPayloads(true), cfg.supportGuild).then(() => console.log(`[zera] registered owner commands in support server ${cfg.supportGuild}`)).catch(e => console.warn('[slash] owner commands (is the bot in the support server?):', e.message));
    const wc = await client.channels.fetch(cfg.channels.welcome).catch(() => null);
    if (wc) { L.home.id = wc.guildId; await guildEvents.cacheInvites(wc.guild); emojiReady.finally(async () => { await tickets.ensurePanels(client); await verify.ensurePanel(client); }); }
    else console.warn('[zera] home server channels not reachable — is the bot in the support server?');
    // owner-only DB collector panel: posted once (no duplicates). Waits for emoji upload but never longer than 30s.
    Promise.race([emojiReady, new Promise(r => setTimeout(r, 30000))]).finally(() => { dbcollect.ensurePanel(client); require('../systems/premiumtickets').ensurePanel(client); });
    startStatus(client);
    require('../systems/custombot').start(client);   // Next Gen: reset custom bot profile in servers whose premium ended
    require('../statuspanel').start(client);   // live status panel (edits one message, never duplicates)
    require('../systems/restartpanel').ensurePanel(client).catch(e => console.warn('[restart panel]', e.message));
    require('../systems/hostinfopanel').ensurePanel(client).catch(e => console.warn('[host info panel]', e.message));
  });

  client.on('interactionCreate', async i => {
    try {
      if (i.isChatInputCommand()) {
        if (!i.guild) return i.reply({ embeds: [E.err('Use me inside a server.')], flags: 64 });
        const cmd = R.get(i.commandName); if (!cmd) return;
        return R.execute(new R.Ctx(client, { interaction: i, args: R.fromSlashArgs(cmd, i), cmd }));
      }
      if (!i.guild) return;
      const id = i.customId || '', pre = id.split(':')[0];
      const companion = require('../systems/companion');
      if (pre === 'companion') return companion.handle(i, client);
      if (['np', 'q', 'mood', 'search'].includes(pre) && await companion.gateInteraction(i)) return;
      if (pre === 'np') return controls.np(i);
      if (pre === 'q') return controls.queuePage(i);
      if (pre === 'help') return help.handle(i);
      if (pre === 'ticket') return tickets.handle(i);
      if (pre === 'verify') return verify.handle(i);
      if (pre === 'dbcollect') return dbcollect.handle(i);
      if (pre === 'zerarestart') return require('../systems/restartpanel').handle(i, client);
      if (pre === 'pbuy') return require('../systems/premiumtickets').handle(i);
      if (pre === 'hostinfo') return require('../systems/hostinfopanel').handle(i);
      if (pre === 'premium') return premiumCmd.handle(i);
      if (pre === 'mood') return mood.handle(i, () => ctxFrom(client, i));
      if (pre === 'search') {
        if (id.split(':')[1] !== i.user.id) return i.reply({ embeds: [E.err('This menu isn’t yours.')], flags: 64 });
        await i.deferUpdate(); await i.editReply({ components: [] });
        const c = ctxFrom(client, i); c.cmd = R.get('play');
        return R.execute(Object.assign(c, { args: [i.values[0]] }));
      }
    } catch (e) {
      console.error('[interaction]', e);
      L.log(client, 'error', { embeds: [L.le('❌ Interaction error', `\`\`\`${String(e.stack || e).slice(0, 1500)}\`\`\``, 0xE5484D)] });
      if (i.isRepliable() && !i.replied && !i.deferred) i.reply({ embeds: [E.err('Something went wrong.')], flags: 64 }).catch(() => {});
    }
  });

  client.on('messageCreate', async m => {
    if (m.author.bot || !m.guild) return;
    // AFK
    if (snipe.afk.has(m.author.id)) { snipe.afk.delete(m.author.id); m.reply({ content: `Welcome back ${m.author}, I removed your AFK.`, allowedMentions: { repliedUser: false } }).catch(() => {}); }
    for (const u of m.mentions.users.values()) if (snipe.afk.has(u.id)) m.reply({ content: `💤 **${u.username}** is AFK: ${snipe.afk.get(u.id)}`, allowedMentions: { repliedUser: false } }).catch(() => {});
    const p = db.guild(m.guildId).prefix || cfg.prefix, mention = new RegExp(`^<@!?${client.user.id}>\\s*`);
    let body;
    if (m.content.toLowerCase().startsWith(p.toLowerCase())) body = m.content.slice(p.length);
    else if (mention.test(m.content)) body = m.content.replace(mention, '');
    else return;
    const tokens = body.trim().split(/\s+/), name = tokens.shift()?.toLowerCase();
    const cmd = name && R.get(name);
    if (!cmd) { if (mention.test(m.content)) return m.reply(greeting(m, p)).catch(() => {}); return; }
    R.execute(new R.Ctx(client, { message: m, args: R.parseArgs(cmd, tokens), cmd }));
  });

  process.on('unhandledRejection', e => { console.error('[unhandled]', e); L.log(client, 'error', { embeds: [L.le('⚠️ Unhandled rejection', `\`\`\`${String(e?.stack || e).slice(0, 1500)}\`\`\``, 0xE5484D)] }); });
  process.on('uncaughtException', e => console.error('[uncaught]', e));
}
module.exports = { init };
