const { def } = require('./registry');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const cfg = require('../config'), db = require('../db'), V = require('../v2'), P = require('../premium'), L = require('../logger');
const { em } = require('../emojis');
const { E, UserError, idOf } = require('../utils');
const { THEMES } = require('../music/card');
const C = 'Premium', pl = cfg.premium.plans;

const planLine = (k, icon) => {
  const p = pl[k], top = k === 'pro' || k === 'nextgen';
  return `${icon} **${p.name}** — \`${p.price}\`\n> • Queue up to **${p.queue}** songs  • Volume up to **${p.volume}%**\n> • **${p.playlists}** playlists × **${p.plTracks}** songs` + (k === 'free' ? '' : `\n> • **24/7 mode** • premium filters (8D, bass extreme…) • **Now Playing card themes**`) + (top ? `\n> • **24/7 auto-rejoin** after restarts • custom **15-band EQ** • priority support` : '') + (k === 'nextgen' ? `\n> • **Everything in Pro** + **/custombot** — give Zera your own **name, avatar, banner & bio** in your server\n> • Back to normal automatically when Next Gen ends` : '');
};
function panel(guildId, userId) {
  const g = db.getPremium('guild', guildId), u = db.getPremium('user', userId), t = P.tierOf(guildId, userId);
  const status = t === 'free' ? '`Free`' : `**${pl[t].name}**`;
  const buttons = [new ButtonBuilder().setLabel('Buy Premium').setEmoji('💎').setStyle(ButtonStyle.Link).setURL(cfg.premium.buyUrl), new ButtonBuilder().setCustomId('premium:redeem').setLabel('Redeem Code').setEmoji('🎁').setStyle(ButtonStyle.Success)];
  const sku = Object.keys(cfg.premium.skus).find(k => /^\d{15,}$/.test(k)); if (sku) buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(sku));
  const c = V.box(0x3CFF79).addMediaGalleryComponents(V.gallery('attachment://zera-premium-banner.gif')).addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(`### 💎 Zera Premium\n> Unlock the full Zera experience for your server — 24/7 music, themes, premium filters and much more.`)).addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(planLine('free', '🆓'))).addTextDisplayComponents(V.td(planLine('plus', '💎'))).addTextDisplayComponents(V.td(planLine('pro', '👑'))).addTextDisplayComponents(V.td(planLine('nextgen', '🚀'))).addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(`> 📡 **Your status:** ${status}\n> 🏠 **This server:** ${g ? `${pl[g.tier].name} • expires ${P.fmtExp(g)}` : 'Free'}\n> 👤 **You:** ${u ? `${pl[u.tier].name} • expires ${P.fmtExp(u)}` : 'Free'}`)).addSeparatorComponents(V.sep())
    .addActionRowComponents(new ActionRowBuilder().addComponents(buttons)).addTextDisplayComponents(V.td('-# Buy a code in our support server, then press **Redeem Code** • Zera Music'));
  return V.msg(c, { files: [V.att('zera-premium-banner.gif')], attachments: [], allowedMentions: { parse: [] } });
}
// ---- redeem flow (shared by /redeem and the modal) ----
const REDEEM_CD = (cfg.premium.redeemCooldownHours ?? 24) * 3600000;   // 1 successful redeem per user per 24h
function redeem(client, { guild, user, member }, code) {
  code = String(code ?? '').trim();
  if (!code) throw new UserError('Please enter a code.');
  if (!cfg.owners.includes(user.id)) {            // owners are exempt so they can test codes
    const last = db.lastRedeemAt(user.id), next = last + REDEEM_CD;
    if (last && Date.now() < next) throw new UserError(`You can redeem only **one code per day**. You can redeem again <t:${Math.floor(next / 1000)}:R> (<t:${Math.floor(next / 1000)}:f>).`);
  }
  const row = db.peekCode(code);
  if (!row) throw new UserError('That code is invalid. Double-check and try again.');
  if (row.redeemed_by) throw new UserError('That code was already used.');
  let target = user.id;
  if (row.scope === 'guild') { if (!guild) throw new UserError('Redeem this code inside a server.'); if (!member.permissions.has('ManageGuild')) throw new UserError('You need **Manage Server** to redeem a server code.'); target = guild.id; }
  // burn the code and grant premium together: if anything fails the code is NOT lost, and a used code can never be burned twice
  const exp = db.tx(() => {
    if (!db.useCode(code, user.id, target)) throw new UserError('That code was already used.');
    return db.setPremium(row.scope, target, row.tier, row.days, user.id, 'code');
  });
  L.log(client, 'security', { embeds: [L.le('💎 Premium redeemed', `**${pl[row.tier].name}** (${row.scope}) for \`${target}\` by ${user.tag}\n**Code:** \`${row.code}\` • **Days:** ${row.days || 'lifetime'}`)] });
  return E.base().setTitle('🎉 Premium activated!').setDescription(`**${pl[row.tier].name}** is now active for ${row.scope === 'guild' ? `**${guild.name}**` : 'your account'}.\nExpires: ${exp ? `<t:${Math.floor(exp / 1000)}:R>` : '**Never (lifetime)**'}\n\nTry \`/theme\`, \`/247\` and the premium filters${row.tier === 'nextgen' && row.scope === 'guild' ? ' — and \`/custombot\` to give Zera your own look in this server' : ''} 💚`);
}
async function handle(i) {
  const [, act] = i.customId.split(':');
  if (i.isButton() && act === 'redeem') {
    return i.showModal(new ModalBuilder().setCustomId('premium:modal').setTitle('Redeem Premium Code').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Your code').setPlaceholder('ZERA-XXXX-XXXX-XXXX').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40))));
  }
  if (i.isModalSubmit() && act === 'modal') {
    try { const e = redeem(i.client, { guild: i.guild, user: i.user, member: i.member }, i.fields.getTextInputValue('code')); return i.reply({ embeds: [e], flags: MessageFlags.Ephemeral }); }
    catch (e) { return i.reply({ embeds: [E.err(e.message)], flags: MessageFlags.Ephemeral }); }
  }
}
def({ name: 'premium', aliases: ['plans', 'perks', 'plus', 'pro', 'nextgen', 'upgrade'], category: C, slash: true, description: 'View Zera Premium plans & your status', run: async c => { await c.defer(); return c.reply(panel(c.guildId, c.user.id)); } });   // defer first: the banner upload can take >3s on slow hosts
def({ name: 'redeem', aliases: ['activate'], category: C, slash: true, description: 'Redeem a premium code', opts: [{ name: 'code', desc: 'Your premium code', required: true }], run: c => c.reply({ embeds: [redeem(c.client, c, c.args[0])], ephemeral: true }) });
const THEME_NAMES = Object.keys(THEMES);
def({ name: 'theme', aliases: ['themes'], category: C, slash: true, description: 'Change the Now Playing card theme (Premium)', opts: [{ name: 'name', desc: THEME_NAMES.join(' / '), choices: THEME_NAMES }], run: c => {
  const g = db.guild(c.guildId), n = c.args[0]?.toLowerCase();
  if (!n) return c.reply({ embeds: [E.info('🎨 Card themes', `Current: **${g.theme || 'emerald'}**\nAvailable: ${THEME_NAMES.map(x => `\`${x}\``).join(' ')}\n\nChange with \`/theme <name>\` — **Zera Plus** or higher.`)] });
  P.need(c.guildId, c.user.id, 'plus', 'Card themes');
  if (!c.member.permissions.has('ManageGuild')) throw new UserError('You need **Manage Server** to change the theme.');
  if (!THEMES[n]) throw new UserError(`Pick one of: ${THEME_NAMES.join(', ')}`);
  g.theme = n; return c.reply({ embeds: [E.ok(`Card theme set to **${n}** — it applies from the next song 🎨`)] });
} });
def({ name: 'eq', category: C, slash: true, description: 'Custom 15-band equalizer (Pro) e.g. eq 0.2 0.15 0.1 0 0 …', opts: [{ name: 'gains', desc: 'Up to 15 numbers between -0.25 and 1', required: true, rest: true }], run: async c => {
  P.need(c.guildId, c.user.id, 'pro', 'The custom equalizer');
  const M = require('../music/manager'), p = M.need(c, true), g = c.args[0].split(/[\s,]+/).map(Number).slice(0, 15);
  if (!g.length || g.some(x => Number.isNaN(x) || x < -0.25 || x > 1)) throw new UserError('Give up to 15 numbers between **-0.25** and **1**.');
  await p.filterManager.resetFilters(); await p.filterManager.setEQ(g.map((gain, band) => ({ band, gain }))); p.set('filter', null);
  return c.reply({ embeds: [E.ok(`Custom EQ applied (${g.length} bands) 🎛️`)] });
} });
// ---- owner tools ----
const OWN = { owner: true };
const tierArg = t => { t = String(t || '').toLowerCase(); if (!['plus', 'pro', 'nextgen'].includes(t)) throw new UserError('Tier must be `plus`, `pro` or `nextgen`.'); return t; };
const scopeArg = s => (String(s || 'guild').toLowerCase() === 'user' ? 'user' : 'guild');
def({ name: 'premium-grant', category: C, slash: true, ...OWN, description: 'Owner: grant premium (id tier days scope)', opts: [{ name: 'id', desc: 'Server or user ID', required: true }, { name: 'tier', desc: 'plus / pro / nextgen', required: true, choices: ['plus', 'pro', 'nextgen'] }, { name: 'days', type: 'integer', desc: '0 = lifetime' }, { name: 'scope', desc: 'guild / user', choices: ['guild', 'user'] }], run: c => {
  const id = idOf(c.args[0]), tier = tierArg(c.args[1]), days = Number(c.args[2] || 30), scope = scopeArg(c.args[3]);
  const exp = db.setPremium(scope, id, tier, days, c.user.id, 'grant');
  L.log(c.client, 'security', { embeds: [L.le('💎 Premium granted', `**${pl[tier].name}** → ${scope} \`${id}\` by ${c.user.tag} (${days || 'lifetime'})`)] });
  return c.reply({ embeds: [E.ok(`Granted **${pl[tier].name}** to ${scope} \`${id}\` — ${exp ? `expires <t:${Math.floor(exp / 1000)}:R>` : 'lifetime'}`)] });
} });
def({ name: 'premium-revoke', category: C, slash: true, ...OWN, description: 'Owner: revoke premium', opts: [{ name: 'id', desc: 'Server or user ID', required: true }, { name: 'scope', desc: 'guild / user', choices: ['guild', 'user'] }], run: c => { const ok = db.revokePremium(scopeArg(c.args[1]), idOf(c.args[0])); if (ok) require('../systems/custombot').sweep(c.client).catch(() => {}); return c.reply({ embeds: [ok ? E.ok('Premium revoked.') : E.err('No active premium for that ID.')] }); } });
def({ name: 'premium-gen', category: C, slash: true, ...OWN, description: 'Owner: generate redeem codes (tier days count scope)', opts: [{ name: 'tier', desc: 'plus / pro / nextgen', required: true, choices: ['plus', 'pro', 'nextgen'] }, { name: 'days', type: 'integer', desc: '0 = lifetime', required: true }, { name: 'count', type: 'integer', desc: '1-20' }, { name: 'scope', desc: 'guild / user', choices: ['guild', 'user'] }], run: async c => {
  const codes = db.genCodes(tierArg(c.args[0]), scopeArg(c.args[3]), Number(c.args[1]), Math.min(20, Math.max(1, Number(c.args[2] || 1))), c.user.id);
  const text = `**${codes.length}** code(s) • ${pl[tierArg(c.args[0])].name} • ${scopeArg(c.args[3])} • ${Number(c.args[1]) || 'lifetime'} days\n\`\`\`\n${codes.join('\n')}\n\`\`\``;
  if (c.isSlash) return c.reply({ embeds: [E.info('🔑 Codes generated', text)], ephemeral: true });
  await c.user.send({ embeds: [E.info('🔑 Codes generated', text)] }).catch(() => { throw new UserError('Open your DMs so I can send the codes.'); }); return c.reply({ embeds: [E.ok('Codes sent to your DMs 📩')] });
} });
def({ name: 'premium-codes', category: C, slash: true, ...OWN, description: 'Owner: list unused codes', run: async c => { const r = db.unusedCodes(20); const e = E.info('🔑 Unused codes', r.map(x => `\`${x.code}\` • ${x.tier} • ${x.scope} • ${x.days || '∞'}d`).join('\n') || 'None'); if (c.isSlash) return c.reply({ embeds: [e], ephemeral: true }); await c.user.send({ embeds: [e] }).catch(() => { throw new UserError('Open your DMs.'); }); return c.reply({ embeds: [E.ok('Sent to your DMs 📩')] }); } });
def({ name: 'premium-list', category: C, slash: true, ...OWN, description: 'Owner: list active premium', run: c => c.reply({ embeds: [E.info('💎 Active premium', db.listPremium(25).map(r => `\`${r.target_id}\` • ${r.scope} • ${r.tier} • ${r.expires_at ? `<t:${Math.floor(r.expires_at / 1000)}:R>` : 'lifetime'}`).join('\n') || 'None')] }) });
module.exports = { handle, panel };
