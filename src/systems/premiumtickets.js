// Premium Buy Tickets
// ONE big panel in the "Premium Buy Ticket" channel: full premium explanation + 3 buttons (Zera Plus / Pro / Next Gen).
// Clicking a button opens a PRIVATE ticket that only the customer + the bot owners (+ optional staff role) can see.
// Inside the ticket: Close • Add • Email • Phone Number • UPI Name • Transaction ID • Payment Proof.
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits: P, ChannelType, AttachmentBuilder } = require('discord.js');
const cfg = require('../config'), db = require('../db'), V = require('../v2'), L = require('../logger');
const { E, trunc, slug, idOf } = require('../utils');

const KV_PANEL = 'pbuy_panel_msg', KV_HASH = 'pbuy_panel_hash';
const PL = cfg.premium.plans;
const TIERS = {
  plus:    { emoji: '💎', style: ButtonStyle.Primary },
  pro:     { emoji: '👑', style: ButtonStyle.Primary },
  nextgen: { emoji: '🚀', style: ButtonStyle.Success },
};
const FIELDS = {   // the 4 "details" buttons inside a ticket
  email: { label: 'Email', icon: '📧', modal: 'Your email address', ph: 'name@example.com', max: 100, ok: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), err: 'That doesn’t look like a valid email address.' },
  phone: { label: 'Phone Number', icon: '📱', modal: 'Your phone number', ph: '+91 98765 43210', max: 20, ok: v => /^\+?[0-9][0-9 \-]{6,18}$/.test(v), err: 'That doesn’t look like a valid phone number (digits, spaces, `+` and `-` only).' },
  upi: { label: 'UPI Name', icon: '🏦', modal: 'Name / UPI ID you paid from', ph: 'yourname@upi', max: 60, ok: v => v.length >= 2, err: 'Please enter the name or UPI ID you paid from.' },
  txn: { label: 'Transaction ID', icon: '🧾', modal: 'UPI Transaction ID / UTR', ph: '412345678901', max: 40, ok: v => /^[A-Za-z0-9_-]{6,40}$/.test(v), err: 'Transaction ID must be 6–40 letters/numbers (no spaces).' },
};
const clean = s => String(s || '').replace(/[`<>\r\n]/g, '').trim();
const isImg = a => a.contentType?.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic)$/i.test(a.name || '');
const isOwner = id => cfg.owners.includes(String(id));
const isStaff = m => isOwner(m.id) || !!(cfg.roles.staff && m.roles.cache.has(cfg.roles.staff));   // owners + optional staff role
const snow = a => [...new Set(a.map(String))].filter(id => /^\d{15,22}$/.test(id));   // Discord rejects duplicate / invalid ids in allowedMentions
const waiting = new Set();   // channels where we're waiting for a payment screenshot

// ---------------------------------------------------------------- panel
function planBlock(k, icon) {
  const p = PL[k];
  const lines = {
    plus: [`Queue up to **${p.queue}** songs • Volume up to **${p.volume}%**`, '**24/7 mode** • premium filters (8D, Bass Extreme, Daycore, Deep Voice, Chipmunk, Telephone, Metal, Loudness)', 'Animated **Now Playing card themes** (`/theme`)', `**${p.playlists}** playlists × **${p.plTracks}** songs`],
    pro: ['Everything in **Zera Plus**', `Queue up to **${p.queue}** songs • **${p.playlists}** playlists × **${p.plTracks}** songs`, '**24/7 auto-rejoin** after bot restarts', 'Custom **15-band equalizer** (`/eq`) • **Priority support**'],
    nextgen: ['Everything in **Zera Pro**', `Queue up to **${p.queue}** songs • Volume up to **${p.volume}%** • **${p.playlists}** playlists × **${p.plTracks}** songs`, '**/custombot** — your own bot **name, avatar, banner & bio** in your server', 'Goes back to normal automatically when Next Gen ends'],
  }[k];
  return `${icon} **${p.name}** — \`${p.price}\`\n${lines.map(l => `> • ${l}`).join('\n')}`;
}
function panelPayload() {
  const row = new ActionRowBuilder().addComponents(...Object.entries(TIERS).map(([k, t]) => new ButtonBuilder().setCustomId(`pbuy:open:${k}`).setLabel(PL[k].name).setEmoji(t.emoji).setStyle(t.style)));
  const c = V.box(0x3CFF79).addMediaGalleryComponents(V.gallery('attachment://zera-premium-banner.gif')).addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td('### 💎 Zera Premium — Buy Now\n> Unlock the **full Zera experience**: 24/7 music, animated card themes, premium filters, bigger queues & playlists — and with **Next Gen** your very own custom bot in your server.'))
    .addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(planBlock('plus', '💎'))).addTextDisplayComponents(V.td(planBlock('pro', '👑'))).addTextDisplayComponents(V.td(planBlock('nextgen', '🚀')))
    .addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td('### 🛒 How to buy\n> **1.** Press the button of the plan you want — a **private ticket** opens (only you & the owners can see it)\n> **2.** Pay by UPI, then fill **Email • Phone Number • UPI Name • Transaction ID** and upload your **Payment Proof**\n> **3.** An owner verifies the payment and activates your plan 💚'))
    .addSeparatorComponents(V.sep(true))
    .addActionRowComponents(row)
    .addTextDisplayComponents(V.td('-# Zera Music • premium-buy'));
  return V.msg(c, { files: [V.att('zera-premium-banner.gif')], allowedMentions: { parse: [] } });
}
const hasBtn = m => { try { return JSON.stringify(m.components).includes('pbuy:open:'); } catch { return false; } };
let ensuring = false;
async function ensurePanel(client) {
  if (ensuring) return; ensuring = true;
  try {
    const id = cfg.channels.premiumBuy;
    const ch = await client.channels.fetch(id).catch(e => { console.warn(`[premiumbuy] cannot fetch channel ${id}: ${e.message}`); return null; });
    if (!ch?.isTextBased?.() || !ch.guild) return console.warn(`[premiumbuy] channel ${id} is not a server text channel`);
    const perms = ch.permissionsFor(client.user);
    const need = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles'].filter(p => !perms?.has(p));
    if (need.length) return console.warn(`[premiumbuy] bot is missing permissions in #${ch.name}: ${need.join(', ')}`);
    if (!ch.guild.members.me?.permissions.has(P.ManageChannels)) console.warn('[premiumbuy] bot lacks Manage Channels — tickets cannot be created!');
    if (!cfg.owners.length) console.warn('[premiumbuy] OWNER_IDS is empty — nobody will be able to see the tickets except the customer');

    const payload = panelPayload();
    let bannerSig = ''; try { const st = fs.statSync(path.join(__dirname, '..', '..', 'assets', 'zera-premium-banner.gif')); bannerSig = `${st.size}:${st.mtimeMs}`; } catch {}
    const hash = crypto.createHash('md5').update(JSON.stringify(payload.components.map(c => c.toJSON())) + bannerSig).digest('hex');   // new banner / text / prices -> panel is refreshed
    const savedId = db.kvGet(KV_PANEL);
    let keep = savedId ? await ch.messages.fetch(savedId).catch(() => null) : null;
    if (keep && !(keep.author.id === client.user.id && hasBtn(keep))) keep = null;
    const mine = [...((await ch.messages.fetch({ limit: 50 }).catch(() => null))?.values() || [])].filter(m => m.author.id === client.user.id && hasBtn(m)).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    if (!keep) keep = mine[0] || null;
    for (const m of mine) if (!keep || m.id !== keep.id) m.delete().catch(() => {});   // never keep duplicates

    if (keep && db.kvGet(KV_HASH) !== hash) {   // prices/text changed -> update in place
      const edited = await keep.edit({ ...payload, attachments: [] }).catch(e => { console.warn('[premiumbuy] edit failed, re-posting:', e.message); return null; });
      if (!edited) { keep.delete().catch(() => {}); keep = null; }
    }
    if (!keep) { keep = await ch.send(payload).catch(e => { console.warn('[premiumbuy] posting the panel failed:', e.message); return null; }); if (keep) console.log(`[premiumbuy] panel posted in #${ch.name} (${keep.id})`); }
    if (keep) { db.kvSet(KV_PANEL, keep.id); db.kvSet(KV_HASH, hash); }
  } catch (e) { console.warn('[premiumbuy] ensurePanel error:', e); } finally { ensuring = false; }
}

// ---------------------------------------------------------------- ticket state (stored in sqlite kv)
const kvKey = id => `pbuy:${id}`;
function load(channel) {
  try { const s = JSON.parse(db.kvGet(kvKey(channel.id)) || 'null'); if (s) return s; } catch {}
  const [, tier, owner] = (channel.topic || '').split(':');   // rebuild if the db was reset
  return TIERS[tier] && owner && (channel.topic || '').startsWith('pbuy:') ? { tier, owner, at: Date.now() } : null;
}
const save = (channelId, st) => db.kvSet(kvKey(channelId), JSON.stringify(st));
const complete = st => st.email && st.phone && st.upi && st.txn && st.proof;

// ---------------------------------------------------------------- ticket message
function ticketMsg(st) {
  const p = PL[st.tier], t = TIERS[st.tier];
  const v = x => (x ? `\`${trunc(x, 80)}\`` : '`— not added —`');
  const upi = cfg.premium.upiId ? `**UPI ID:** \`${cfg.premium.upiId}\`${cfg.premium.upiName ? ` (${cfg.premium.upiName})` : ''}` : 'An owner will share the **UPI ID** here in this ticket.';
  const ids = snow(cfg.owners), ping = [...ids.map(id => `<@${id}>`), ...(cfg.roles.staff ? [`<@&${cfg.roles.staff}>`] : [])].join(' ');
  const btn = (k, filled) => new ButtonBuilder().setCustomId(`pbuy:field:${k}`).setLabel(FIELDS[k].label).setEmoji(FIELDS[k].icon).setStyle(filled ? ButtonStyle.Success : ButtonStyle.Secondary);
  const top = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pbuy:close').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('pbuy:add').setLabel('Add').setEmoji('➕').setStyle(ButtonStyle.Primary));
  const mid = new ActionRowBuilder().addComponents(btn('email', st.email), btn('phone', st.phone), btn('upi', st.upi), btn('txn', st.txn),
    new ButtonBuilder().setCustomId('pbuy:proof').setLabel('Payment Proof').setEmoji('🖼️').setStyle(st.proof ? ButtonStyle.Success : ButtonStyle.Secondary));
  const c = V.box(0x3CFF79)
    .addTextDisplayComponents(V.td(`### ${t.emoji} ${p.name} — Purchase Ticket\n**Customer:** <@${st.owner}> • opened <t:${Math.floor(st.at / 1000)}:R>\n**Plan:** ${p.name} • \`${p.price}\`${ping ? `\n${ping}` : ''}`))
    .addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(`### 🛒 Complete your purchase\n> **1.** Pay \`${p.price}\` by UPI — ${upi}\n> **2.** Press **Email**, **Phone Number**, **UPI Name** and **Transaction ID** and fill them in\n> **3.** Press **Payment Proof** and upload your payment screenshot\n> **4.** An owner verifies it and activates **${p.name}** for you (you may get a code to use with \`/redeem\`)`))
    .addSeparatorComponents(V.sep())
    .addTextDisplayComponents(V.td(`### 📋 Your details\n${FIELDS.email.icon} **Email:** ${v(st.email)}\n${FIELDS.phone.icon} **Phone:** ${v(st.phone)}\n${FIELDS.upi.icon} **UPI Name:** ${v(st.upi)}\n${FIELDS.txn.icon} **Transaction ID:** ${v(st.txn)}\n🖼️ **Payment Proof:** ${st.proof ? `✅ [View screenshot](${st.proof})` : '`— not uploaded —`'}`))
    .addSeparatorComponents(V.sep())
    .addActionRowComponents(top, mid)
    .addTextDisplayComponents(V.td('-# Zera Music • premium-ticket • only you & the owners can see this channel'));
  return V.msg(c);
}
const summary = st => `Plan: ${PL[st.tier].name} (${PL[st.tier].price})\nCustomer: ${st.owner}\nEmail: ${st.email || '-'}\nPhone: ${st.phone || '-'}\nUPI Name: ${st.upi || '-'}\nTransaction ID: ${st.txn || '-'}\nPayment Proof: ${st.proof || '-'}`;
async function refresh(channel, st) {   // re-render the main ticket message
  const m = st.msgId ? await channel.messages.fetch(st.msgId).catch(() => null) : null;
  if (m) await m.edit({ ...ticketMsg(st), allowedMentions: { parse: [] } }).catch(() => {});
}
async function maybeNotify(channel, st) {   // all 5 things done -> ping the owners once
  if (!complete(st) || st.notified) return;
  st.notified = true; save(channel.id, st);
  const ids = snow(cfg.owners);
  await channel.send({ content: `${ids.map(id => `<@${id}>`).join(' ')} ✅ **All payment details + proof submitted** — please verify and activate **${PL[st.tier].name}** for <@${st.owner}>.`, allowedMentions: { users: ids } }).catch(() => {});
}

// ---------------------------------------------------------------- handlers
const deny = (i, t) => i.reply({ embeds: [E.err(t)], flags: 64 });
async function openTicket(i, tier) {
  if (!TIERS[tier]) return;
  const existing = i.guild.channels.cache.find(c => c.type === ChannelType.GuildText && (c.topic || '').startsWith('pbuy:') && c.topic.endsWith(`:${i.user.id}`));
  if (existing) return deny(i, `You already have an open premium ticket: ${existing}`);
  await i.deferReply({ flags: 64 });
  const owners = (await Promise.all([...new Set(cfg.owners)].filter(id => id !== i.user.id).map(id => i.guild.members.fetch(id).catch(() => null)))).filter(Boolean);
  const base = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];
  const overwrites = [
    { id: i.guild.roles.everyone.id, deny: [P.ViewChannel] },
    { id: i.user.id, allow: base },
    ...owners.map(m => ({ id: m.id, allow: [...base, P.ManageMessages] })),
    { id: i.client.user.id, allow: [...base, P.ManageChannels, P.AddReactions, P.ManageMessages] },
  ];
  if (cfg.roles.staff) overwrites.push({ id: cfg.roles.staff, allow: [...base, P.ManageMessages] });
  const ch = await i.guild.channels.create({ name: `${tier}-${slug(i.user.username) || i.user.id}`.slice(0, 90), type: ChannelType.GuildText, parent: i.channel?.parentId || null, topic: `pbuy:${tier}:${i.user.id}`, permissionOverwrites: overwrites })
    .catch(e => { console.error('[premiumbuy]', e); return null; });
  if (!ch) return i.editReply({ embeds: [E.err('I couldn’t create the ticket channel (I need **Manage Channels**).')] });
  const st = { tier, owner: i.user.id, at: Date.now() };
  const mentions = { users: snow([i.user.id, ...cfg.owners]), roles: cfg.roles.staff ? [cfg.roles.staff] : [] };
  let msg = await ch.send({ ...ticketMsg(st), allowedMentions: mentions }).catch(e => { console.error('[premiumbuy] ticket message failed:', e.message, JSON.stringify(e.rawError || {}).slice(0, 500)); return null; });
  if (!msg) msg = await ch.send({ ...ticketMsg(st), allowedMentions: { parse: [] } }).catch(e => { console.error('[premiumbuy] retry failed:', e.message, JSON.stringify(e.rawError || {}).slice(0, 500)); L.log(i.client, 'error', { embeds: [L.le('❌ Premium ticket message failed', `\`\`\`${String(e.message).slice(0, 800)}\n${JSON.stringify(e.rawError || {}).slice(0, 700)}\`\`\``, 0xE5484D)] }); return null; });
  if (!msg) { ch.delete('ticket message failed').catch(() => {}); return i.editReply({ embeds: [E.err('Ticket panel couldn’t be posted, so I removed the empty channel. An owner can check the error log.')] }); }
  st.msgId = msg.id;
  save(ch.id, st);
  L.log(i.client, 'security', { embeds: [L.le('🎫 Premium ticket opened', `**${PL[tier].name}** • ${i.user.tag} (\`${i.user.id}\`) • ${ch}`)] });
  return i.editReply({ embeds: [E.ok(`Your premium ticket is ready: ${ch}`)] });
}

async function closeTicket(i, st) {
  await i.reply({ embeds: [E.base().setDescription('🔒 Closing ticket & saving transcript…')] });
  let all = [], before;
  for (let n = 0; n < 5; n++) { const b = await i.channel.messages.fetch({ limit: 100, before }).catch(() => null); if (!b?.size) break; all.push(...b.values()); before = b.last().id; }
  const body = all.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}${m.attachments.size ? ' ' + m.attachments.map(a => a.url).join(' ') : ''}`).join('\n') || 'No messages.';
  const txt = `=== PAYMENT DETAILS ===\n${summary(st)}\n\n=== MESSAGES ===\n${body}`;
  const file = () => new AttachmentBuilder(Buffer.from(txt, 'utf8'), { name: `${i.channel.name}-transcript.txt` });
  await L.post(i.client, cfg.logs.transcript, { embeds: [L.le('📄 Premium Ticket Transcript', `**Ticket:** ${i.channel.name}\n**Plan:** ${PL[st.tier].name}\n**Customer:** <@${st.owner}>\n**Closed by:** ${i.user.tag}\n**Messages:** ${all.length}`)], files: [file()] });
  i.client.users.fetch(st.owner).then(u => u.send({ embeds: [E.info('🔒 Your premium ticket was closed', `**${i.channel.name}** in ${i.guild.name}`)], files: [file()] })).catch(() => {});
  db.kvSet(kvKey(i.channel.id), '');
  setTimeout(() => i.channel.delete('premium ticket closed').catch(() => {}), 4000);
}

async function handle(i) {
  const [, act, arg] = i.customId.split(':');
  if (i.isButton() && act === 'open') return openTicket(i, arg);
  const st = load(i.channel);
  if (!st) return deny(i, 'This isn’t a premium ticket channel.');
  const mine = i.user.id === st.owner || isStaff(i.member);

  if (i.isButton() && act === 'close') { if (!mine) return deny(i, 'Only the ticket owner or the owners can close this.'); return closeTicket(i, st); }

  if (i.isButton() && act === 'add') {
    if (!isStaff(i.member)) return deny(i, 'Only the owners can add people to this ticket.');
    return i.showModal(new ModalBuilder().setCustomId('pbuy:madd').setTitle('Add user to ticket').addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('user').setLabel('User ID or @mention').setPlaceholder('123456789012345678').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40))));
  }
  if (i.isModalSubmit() && act === 'madd') {
    if (!isStaff(i.member)) return deny(i, 'Only the owners can add people to this ticket.');
    const id = idOf(i.fields.getTextInputValue('user'));
    const m = /^\d{15,22}$/.test(id) ? await i.guild.members.fetch(id).catch(() => null) : null;
    if (!m) return deny(i, 'I couldn’t find that member in this server.');
    await i.channel.permissionOverwrites.edit(m.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true }).catch(() => null);
    return i.reply({ content: `${m}`, embeds: [E.ok(`${m} was added to this ticket by ${i.user}.`)], allowedMentions: { users: [m.id] } });
  }

  if (i.isButton() && act === 'field') {
    const f = FIELDS[arg]; if (!f) return;
    if (!mine) return deny(i, 'Only the ticket owner can fill these details.');
    const input = new TextInputBuilder().setCustomId('v').setLabel(f.modal).setPlaceholder(f.ph).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(f.max);
    if (st[arg]) input.setValue(st[arg]);
    return i.showModal(new ModalBuilder().setCustomId(`pbuy:mfield:${arg}`).setTitle(f.label).addComponents(new ActionRowBuilder().addComponents(input)));
  }
  if (i.isModalSubmit() && act === 'mfield') {
    const f = FIELDS[arg]; if (!f) return;
    if (!mine) return deny(i, 'Only the ticket owner can fill these details.');
    const val = clean(i.fields.getTextInputValue('v'));
    if (!f.ok(val)) return deny(i, f.err);
    if (arg === 'txn') {   // the same transaction id can't be reused in another ticket
      const k = `pbuy:txn:${val.toUpperCase()}`, used = db.kvGet(k);
      if (used && used !== i.channel.id) return deny(i, 'This Transaction ID was already submitted in another ticket. Please contact an owner.');
      db.kvSet(k, i.channel.id);
    }
    st[arg] = val; save(i.channel.id, st);
    if (i.isFromMessage?.()) await i.update({ ...ticketMsg(st), allowedMentions: { parse: [] } });
    else { await i.reply({ embeds: [E.ok(`${f.label} saved`)], flags: 64 }); await refresh(i.channel, st); }
    return maybeNotify(i.channel, st);
  }

  if (i.isButton() && act === 'proof') {
    if (!mine) return deny(i, 'Only the ticket owner can upload the payment proof.');
    if (waiting.has(i.channel.id)) return deny(i, 'I’m already waiting for your screenshot — just send it in this channel.');
    waiting.add(i.channel.id);
    await i.reply({ embeds: [E.info('🖼️ Payment Proof', 'Send your **payment screenshot** (an image) in this channel now.\nI’ll wait **5 minutes**.')], flags: 64 });
    try {
      const got = await i.channel.awaitMessages({ filter: m => m.author.id === i.user.id && m.attachments.some(isImg), max: 1, time: 5 * 60 * 1000, errors: ['time'] });
      const m = got.first();
      st.proof = m.url; save(i.channel.id, st);
      m.react('✅').catch(() => {});
      await refresh(i.channel, st);
      i.followUp({ embeds: [E.ok('Payment proof received 🧾')], flags: 64 }).catch(() => {});
      await maybeNotify(i.channel, st);
    } catch { i.followUp({ embeds: [E.err('Time’s up — press **Payment Proof** again and upload the screenshot.')], flags: 64 }).catch(() => {}); }
    finally { waiting.delete(i.channel.id); }
  }
}
module.exports = { ensurePanel, handle };
