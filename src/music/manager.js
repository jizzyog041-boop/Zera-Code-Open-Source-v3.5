const { LavalinkManager } = require('lavalink-client');
const cfg = require('../config'), db = require('../db'), L = require('../logger'), ui = require('./ui'), { em } = require('../emojis');
const { UserError, shuffle, E, trunc } = require('../utils'), P = require('../premium');
let client;
const BOT_REQ = { id: null, username: 'Zera Autoplay' };
const requester = u => ({ id: u.id, username: u.username, avatar: u.displayAvatarURL?.() });
const online = () => [...M.lm.nodeManager.nodes.values()].some(n => n.connected);

const STATUS_EMOJI = (process.env.VC_STATUS_EMOJI ?? 'true') !== 'false';
// Idle VC status (shown while Zera sits in a VC with nothing playing): animated butterfly + hint to use /play
const IDLE_ON = (process.env.VC_IDLE_STATUS ?? 'true') !== 'false';
const IDLE_TEXT = process.env.VC_IDLE_TEXT || 'Use /play and play music';
const BUTTERFLIES = ['butterfly', 'butterfly2', 'butterfly3', 'butterfly4'];
// text = '' clears the status. key/uni = animated emoji key + unicode fallback. Calls are queued per player so they can never arrive out of order.
function setStatus(player, text, key = 'eq', uni = '🎵') {
  const ch = text ? player.voiceChannelId : (player.get('vcStatusCh') || player.voiceChannelId);
  if (!ch) return Promise.resolve();
  player.set('vcStatusCh', text ? ch : null);   // remember the channel so the status can still be cleared after the player is destroyed
  const put = status => client.rest.put(`/channels/${ch}/voice-status`, { body: { status: String(status).slice(0, 490) } });
  const e = text ? (STATUS_EMOJI && em(key, true)) || uni : '';
  const run = async () => {
    try { await put(e ? `${e} ${text}` : ''); }
    catch { if (e && e !== uni) { try { await put(`${uni} ${text}`); } catch {} } }   // fallback if custom emoji is rejected
  };
  const next = (player.get('vcStatusQ') || Promise.resolve()).then(run, run);
  player.set('vcStatusQ', next);
  return next;
}
// Zera is in the VC but nothing is playing -> "🦋 Use /play and play music"
function idleStatus(player) {
  if (!IDLE_ON) return setStatus(player, '');
  return setStatus(player, IDLE_TEXT, BUTTERFLIES[Math.floor(Math.random() * BUTTERFLIES.length)], '🦋');
}
async function updateNP(player) {
  const msg = player.get('np');
  if (!msg || !player.queue.current || player.get('npBusy')) return;
  player.set('npBusy', true);
  try { await msg.edit(await ui.npPayload(player)); } catch {} finally { player.set('npBusy', false); }
}
function stopTimers(player) { clearInterval(player.get('npTimer')); clearTimeout(player.get('idle')); }

function djCheck(x) {
  const g = db.guild(x.guildId);
  if (!g.djRole || x.member.roles.cache.has(g.djRole) || x.member.permissions.has('ManageGuild')) return;
  const vc = x.member.voice.channel;
  if (vc && vc.members.filter(m => !m.user.bot).size <= 1) return;
  throw new UserError(`You need the <@&${g.djRole}> (DJ) role for this.`);
}
function need(ctx, dj = false) {
  const p = M.lm.getPlayer(ctx.guildId);
  if (!p || (!p.queue.current && !p.playing)) throw new UserError('Nothing is playing right now.');
  if (ctx.member.voice.channelId !== p.voiceChannelId) throw new UserError('Join my voice channel to use this.');
  if (dj) djCheck(ctx);
  return p;
}
// like need(), but works while the bot is idle in the VC (nothing playing) — used by /leave
function needPlayer(ctx, dj = false) {
  const p = M.lm.getPlayer(ctx.guildId);
  if (!p) throw new UserError('I’m not in a voice channel.');
  if (ctx.member.voice.channelId !== p.voiceChannelId) throw new UserError('Join my voice channel to use this.');
  if (dj) djCheck(ctx);
  return p;
}
// ---- HQ audio: Discord caps audio quality by the voice channel bitrate (default 64 kbps) -> raise it to the server's maximum (needs Manage Channels; only ever raises) ----
const HQ_BITRATE = (process.env.HQ_BITRATE ?? 'true') !== 'false';
const DEFAULT_VOLUME = Number(process.env.DEFAULT_VOLUME || 100);   // 100 = no gain change (cleanest signal)
function hqBitrate(vc, guild) {
  try {
    if (!HQ_BITRATE || typeof vc?.setBitrate !== 'function') return;
    const max = guild.maximumBitrate || 96000;
    if ((vc.bitrate || 0) >= max) return;
    if (!vc.permissionsFor(guild.members.me)?.has('ManageChannels')) return;
    vc.setBitrate(max, 'Zera HQ audio').catch(() => {});
  } catch {}
}
// Checks + player creation are synchronous; the (slow) voice connect is returned as a promise so /play can search while it connects.
async function preparePlayer(ctx) {
  const vc = ctx.member.voice.channel;
  if (!vc) throw new UserError('Join a voice channel first.');
  if (!online()) throw new UserError('Music server is offline right now. Try again in a moment.');
  const perms = vc.permissionsFor(ctx.guild.members.me);
  if (!perms?.has(['Connect', 'Speak'])) throw new UserError('I need **Connect** and **Speak** permissions in that voice channel.');
  let p = M.lm.getPlayer(ctx.guildId);
  if (p && p.voiceChannelId !== vc.id && p.connected) {
    if (p.playing || p.paused || p.queue.tracks.length) throw new UserError(`I'm already playing in <#${p.voiceChannelId}>.`);
    await p.destroy('moved', true).catch(() => {}); p = null;   // idle in another channel -> follow the user instead of refusing
  }
  if (!p) p = M.lm.createPlayer({ guildId: ctx.guildId, voiceChannelId: vc.id, textChannelId: ctx.channel.id, selfDeaf: true, selfMute: false, volume: db.guild(ctx.guildId).volume || DEFAULT_VOLUME });
  p.textChannelId = ctx.channel.id;
  let connecting = null;
  if (!p.connected) { hqBitrate(vc, ctx.guild); connecting = p.connect(); connecting.catch(() => {}); }
  return { player: p, connecting };
}
async function ensurePlayer(ctx) {
  const { player, connecting } = await preparePlayer(ctx);
  if (connecting) await connecting;
  return player;
}

// ---- search: cache (instant repeats) + hedged sources (a slow/failed source never blocks the next one) ----
const SEARCH_TTL = 15 * 60 * 1000, HEDGE_MS = Number(process.env.SEARCH_HEDGE_MS || 1200), cache = new Map();
const cloneRes = (r, req) => ({ ...r, tracks: r.tracks.map(t => ({ ...t, info: { ...t.info }, requester: req })) });   // fresh copies: every server/requester gets its own track objects
function firstResult(tasks, hedgeMs) {
  return new Promise(resolve => {
    let next = 0, running = 0, done = false, timer = null;
    const launch = () => {
      if (done || next >= tasks.length) return;
      clearTimeout(timer);
      const i = next++; running++;
      tasks[i]().then(r => { if (!done) { done = true; clearTimeout(timer); resolve(r); } }, () => {})
        .finally(() => { running--; if (!done) { if (next < tasks.length) launch(); else if (!running) resolve(null); } });
      if (next < tasks.length) timer = setTimeout(launch, hedgeMs);
    };
    launch();
  });
}
async function search(player, query, req, source) {
  const isUrl = /^https?:\/\//i.test(query), key = `${isUrl ? 'url' : source || 'any'}|${query.trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_TTL) return cloneRes(hit.res, req);
  const sources = isUrl ? [null] : source ? [source] : ['ytmsearch', 'ytsearch', 'scsearch'];
  const tasks = sources.map(s => async () => {
    const r = await player.search(s ? { query, source: s } : { query }, req);
    if (!r?.tracks?.length) throw new Error('empty');
    return r;
  });
  const res = await firstResult(tasks, HEDGE_MS);
  if (!res) return { tracks: [], loadType: 'empty' };
  if (res.tracks.length <= 100) { cache.set(key, { at: Date.now(), res: cloneRes(res, null) }); if (cache.size > 300) cache.delete(cache.keys().next().value); }
  return res;
}
// main entry used by play commands
async function play(ctx, query, o = {}) {
  if (!query) throw new UserError('Give me a song name or link.');
  const deferred = ctx.defer().catch(() => {});   // ack Discord while the real work runs (not awaited -> no added delay)
  try {
    const { player, connecting } = await preparePlayer(ctx);
    // voice connect and track search run AT THE SAME TIME
    const [res] = await Promise.all([search(player, query, requester(ctx.user), o.source), connecting]);
    if (!res.tracks.length) throw new UserError('No results found. Try a different search.');
    const isPl = res.loadType === 'playlist';
    let tracks = isPl ? res.tracks : res.tracks.slice(0, o.many || 1);
    if (o.shuffle) tracks = shuffle(tracks);
    const lim = P.plan(ctx.guildId, ctx.user.id).queue, room = lim - player.queue.tracks.length; let trimmed = false;
    if (room <= 0) throw new UserError(`Queue limit reached (**${lim}**). Upgrade with \`/premium\` 💎`);
    if (tracks.length > room) { tracks = tracks.slice(0, room); trimmed = true; }
    const idle = !player.playing && !player.paused;
    if (o.next && !idle) player.queue.splice(0, 0, ...tracks); else player.queue.add(tracks);
    if (o.autoplay) player.set('autoplay', true);
    const t = tracks[0];
    const e = E.base().setThumbnail(t.info.artworkUrl || null);
    if (isPl || tracks.length > 1) e.setTitle(isPl ? '📃 Playlist queued' : '🎶 Tracks queued').setDescription(`**${trunc(res.playlist?.title || res.playlist?.name || query, 100)}**\n\`${tracks.length}\` tracks added${idle ? ' • starting now' : ''}`);
    else e.setTitle(idle ? '▶️ Starting' : '➕ Added to queue').setDescription(`**[${trunc(t.info.title, 100)}](${t.info.uri})**\n${t.info.author} • \`${t.info.isStream ? 'LIVE' : require('../utils').fmt(t.info.duration)}\`${idle ? '' : `\nPosition: \`#${o.next ? 1 : player.queue.tracks.length}\``}`);
    if (trimmed) e.setFooter({ text: `Queue limit ${lim} reached — extra songs skipped • /premium for more` });
    // audio starts and the confirmation is sent in parallel (the reply no longer waits for Lavalink)
    const replied = deferred.then(() => ctx.reply({ embeds: [e] }));
    if (idle) { try { await player.play(); } catch (err) { await replied.catch(() => {}); throw err; } }
    return await replied;
  } catch (err) { await deferred; throw err; }   // errors must be sent AFTER the defer finished
}
async function refill(player, track) {
  if (player.get('mood')) return require('./mood').refill(player);
  if (player.get('autoplay') && track) {
    const res = await search(player, `${track.info.author} songs`, BOT_REQ);
    const hist = player.get('hist') || new Set();
    const pool = res.tracks.filter(t => !hist.has(t.info.identifier) && !t.info.isStream && t.info.duration < 720000);
    if (!pool.length) return false;
    player.queue.add(shuffle(pool).slice(0, 3));
    return true;
  }
  return false;
}
async function skip(player) {
  if (!player.queue.tracks.length) {
    if (await refill(player, player.queue.current)) return player.skip();
    if (db.guild(player.guildId).twentyFourSeven) return player.skip(0, false);   // 24/7: stop the song but STAY in the VC (queueEnd shows the idle status)
    return player.destroy('skipped-last', true);
  }
  return player.skip();
}
async function onQueueEnd(player, track) {
  if (await refill(player, track).catch(() => false)) { await player.play().catch(() => {}); return; }
  idleStatus(player);   // bot stays in the VC -> show the butterfly hint instead of an empty status
  stopTimers(player);
  player.get('np')?.edit(ui.npEnded(track)).catch(() => {});
  if (!db.guild(player.guildId).twentyFourSeven) {
    player.set('idle', setTimeout(() => { if (!player.playing && !player.paused && !player.queue.tracks.length) player.destroy('idle', true).catch(() => {}); }, 120000));
  }
}
async function rejoin247(c, lm) {   // Zera Pro: auto-rejoin 24/7 voice channels after a restart
  for (const r of db.list247()) {
    try {
      const g = c.guilds.cache.get(r.guild_id); if (!g || P.rank(g.id, null) < 2 || lm.getPlayer(g.id)) continue;
      const vc = g.channels.cache.get(r.vc247); if (!vc) continue;
      const p = lm.createPlayer({ guildId: g.id, voiceChannelId: vc.id, textChannelId: r.text247 || vc.id, selfDeaf: true, volume: db.guild(g.id).volume || DEFAULT_VOLUME });
      await p.connect(); idleStatus(p); console.log(`[247] rejoined ${g.name}`);
    } catch (e) { console.warn('[247]', r.guild_id, e.message); }
  }
}
function init(c) {
  client = c; BOT_REQ.id = cfg.clientId;
  const lm = new LavalinkManager({
    nodes: cfg.lavalink,
    sendToShard: (gid, payload) => client.guilds.cache.get(gid)?.shard?.send(payload),
    client: { id: cfg.clientId, username: 'Zera' },
    autoSkip: true, autoSkipOnResolveError: true,
    playerOptions: { defaultSearchPlatform: 'ytmsearch', clientBasedPositionUpdateInterval: 500, onDisconnect: { autoReconnect: true, destroyPlayer: false } },
    queueOptions: { maxPreviousTracks: 25 },
  });
  M.lm = lm;
  client.on('raw', d => lm.sendRawData(d));
  lm.nodeManager.on('connect', n => console.log(`[lavalink] ✅ ${n.id} connected`));
  lm.nodeManager.on('disconnect', (n, r) => console.log(`[lavalink] ⚠️ ${n.id} disconnected`, r?.reason || ''));
  lm.nodeManager.on('error', (n, e) => console.error(`[lavalink] ❌ ${n.id}`, e?.message || e));

  lm.on('trackStart', async (player, track) => {
    if (!player.queue.current) return;   // stopped/skipped before the handler ran
    stopTimers(player);
    const hist = player.get('hist') || new Set(); hist.add(track.info.identifier);
    if (hist.size > 80) hist.delete(hist.values().next().value);
    player.set('hist', hist);
    setStatus(player, `${track.info.title} — ${track.info.author}`);
    try { db.logPlay(player.guildId, track.requester?.id, { title: track.info.title, author: track.info.author, uri: track.info.uri }); } catch (e) { console.warn('[db]', e.message); }
    const g = client.guilds.cache.get(player.guildId);
    L.log(client, 'play', { embeds: [L.le('🎵 Track Started', `**${trunc(track.info.title, 150)}**\n**Server:** ${g?.name} (\`${player.guildId}\`)\n**Requested by:** ${track.requester?.username || 'autoplay'}`)] });
    const ch = client.channels.cache.get(player.textChannelId);
    if (ch && player.queue.current && db.guild(player.guildId).announce !== false) {
      player.get('np')?.delete().catch(() => {});
      const msg = await ch.send(await ui.npPayload(player)).catch(e => { console.warn('[np]', e.message); return null; });
      player.set('np', msg);
      player.set('npTimer', setInterval(() => updateNP(player), 12000));
    }
  });
  lm.nodeManager.once('connect', () => setTimeout(() => rejoin247(client, lm).catch(e => console.warn('[247]', e.message)), 4000));
  lm.on('queueEnd', (player, track) => onQueueEnd(player, track).catch(e => console.error('[queueEnd]', e)));
  lm.on('trackError', (player, track, payload) => {
    client.channels.cache.get(player.textChannelId)?.send({ embeds: [E.err(`Couldn't play **${trunc(track?.info?.title || 'track', 80)}** — skipping.`)] }).catch(() => {});
    L.log(client, 'error', { embeds: [L.le('⚠️ Track Error', `\`\`\`${trunc(String(payload?.exception?.message || payload?.error || 'unknown'), 800)}\`\`\``, 0xE5484D)] });
  });
  lm.on('trackStuck', player => client.channels.cache.get(player.textChannelId)?.send({ embeds: [E.err('Track got stuck — skipping.')] }).catch(() => {}));
  lm.on('playerDestroy', player => {
    stopTimers(player); setStatus(player, '');
    player.get('np')?.edit(ui.npEnded(player.queue.current)).catch(() => {});
  });
  return lm;
}
const M = { init, lm: null, need, needPlayer, djCheck, ensurePlayer, preparePlayer, search, play, skip, refill, setStatus, idleStatus, updateNP, requester, online, BOT_REQ };
module.exports = M;
