// /custombot — Zera Next Gen: custom bot name, avatar, banner & bio in THIS server only.
const { def } = require('./registry');
const db = require('../db'), P = require('../premium'), cb = require('../systems/custombot');
const { E, UserError } = require('../utils');
const C = 'Premium';

def({ name: 'custombot', category: C, slash: true, perm: 'ManageGuild', description: 'Next Gen: give Zera your own name, avatar, banner & bio in this server',
  opts: [
    { name: 'nickname', desc: 'Bot name in this server (max 32)', maxLen: 32 },
    { name: 'bio', desc: 'Bot bio in this server (max 190)', maxLen: 190 },
    { name: 'avatar', type: 'attachment', desc: 'Bot avatar image (PNG/JPG/GIF/WEBP)' },
    { name: 'banner', type: 'attachment', desc: 'Bot banner image (PNG/JPG/GIF/WEBP)' },
  ],
  run: async c => {
    if (!c.isSlash) throw new UserError('Use the slash command **/custombot** (you need it to upload images).');
    if (!cb.hasNextGen(c.guildId)) throw new UserError('**/custombot** needs **Zera Next Gen** on **this server** 🚀\nRedeem a **server** Next Gen code here (or run `/premium` to see the plans).');
    const [nick, bio, avatar, banner] = c.args;
    if (nick == null && bio == null && !avatar && !banner) {   // no options → show current state + help
      const r = db.cbGet(c.guildId), exp = db.getPremium('guild', c.guildId);
      return c.reply({ ephemeral: true, embeds: [E.info('🚀 Custom Bot', `**Next Gen is active** ${exp?.expires_at ? `• ends <t:${Math.floor(exp.expires_at / 1000)}:R>` : ''}\n\n**Current custom profile**\n> Name: ${r?.nick ? `**${r.nick}**` : '`original`'}\n> Bio: ${r?.bio ? `**${r.bio}**` : '`original`'}\n> Avatar: ${r?.has_avatar ? '**custom**' : '`original`'}\n> Banner: ${r?.has_banner ? '**custom**' : '`original`'}\n\nUse \`/custombot nickname:… bio:… avatar:… banner:…\` (any of them).\nUse \`/custombot-reset\` to go back to the original.\n-# When Next Gen ends, Zera automatically returns to its original look.`)] });
    }
    await c.interaction.deferReply({ flags: 64 });
    const lines = await cb.apply(c.client, c.guild, { nick, bio, avatar, banner }, c.user.id);
    return c.reply({ embeds: [E.info('🤖 Custom Bot', `${lines.join('\n')}\n\n-# Name/avatar show instantly; bio & banner can take a moment (or need a client restart) to appear in Discord.`)] });
  } });

def({ name: 'custombot-reset', category: C, slash: true, perm: 'ManageGuild', description: 'Reset Zera’s name, avatar, banner & bio in this server to the original',
  run: async c => {
    await c.interaction?.deferReply({ flags: 64 });
    const ok = await cb.reset(c.client, c.guildId, `Zera /custombot-reset by ${c.user.id}`);
    return c.reply({ ephemeral: true, embeds: [ok ? E.ok('Zera is back to its **original** name, avatar, banner & bio in this server.') : E.err('Couldn’t reset everything (check my **Change Nickname** permission) — try again.')] });
  } });
