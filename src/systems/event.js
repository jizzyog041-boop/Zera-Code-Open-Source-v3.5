// Zera Event — first member to finish ALL tasks wins a Zera Pro redeem code (sent by DM) and the event ends.
// Tasks: invite 5 friends • say "hai" in a channel • send feedback in a channel • stay 3 min in a voice channel.
const cfg = require('../config'), db = require('../db');
const L = require('../logger');
const { E, UserError, trunc } = require('../utils');

const EV = cfg.event, CH = EV.channels, D = db.raw;
const q = (sql, ...p) => D.prepare(sql).all(...p), one = (sql, ...p) => D.prepare(sql).get(...p), run = (sql, ...p) => D.prepare(sql).run(...p);
D.exec(`
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, started_by TEXT, started_at INTEGER, ended_at INTEGER, status TEXT, winner_id TEXT, winner_code TEXT, dm_ok INTEGER);
CREATE TABLE IF NOT EXISTS event_progress(event_id INTEGER, user_id TEXT, hai_at INTEGER, hai_url TEXT, fb_at INTEGER, fb_url TEXT, fb_text TEXT, vc_ms INTEGER DEFAULT 0, vc_since INTEGER, vc_at INTEGER, PRIMARY KEY(event_id, user_id));
CREATE TABLE IF NOT EXISTS event_invites(event_id INTEGER, inviter_id TEXT, invitee_id TEXT, at INTEGER, left INTEGER DEFAULT 0, PRIMARY KEY(event_id, invitee_id));
CREATE INDEX IF NOT EXISTS idx_evinv ON event_invites(event_id, inviter_id);
`);

let C = null;                       // discord client
const timers = new Map();           // userId -> voice timer
const active = () => one("SELECT * FROM events WHERE status='active' ORDER BY id DESC LIMIT 1");
const prog = (ev, uid) => { run('INSERT OR IGNORE INTO event_progress(event_id,user_id) VALUES(?,?)', ev.id, uid); return one('SELECT * FROM event_progress WHERE event_id=? AND user_id=?', ev.id, uid); };
const invList = (ev, uid) => q('SELECT invitee_id, at FROM event_invites WHERE event_id=? AND inviter_id=? AND left=0 ORDER BY at', ev.id, uid);
const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ts = (ms, f = 'f') => `<t:${Math.floor(ms / 1000)}:${f}>`;
const dur = ms => { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`; };

function status(ev, uid) {
  const p = prog(ev, uid), inv = invList(ev, uid).length, vc = p.vc_ms + (p.vc_since ? Date.now() - p.vc_since : 0);
  const s = { p, inv, vc, invOk: inv >= EV.invitesNeeded, haiOk: !!p.hai_at, fbOk: !!p.fb_at, vcOk: !!p.vc_at || vc >= EV.vcMs };
  s.done = s.invOk && s.haiOk && s.fbOk && !!p.vc_at;   // vc_at is only set once the 3 minutes were really completed
  return s;
}
async function check(uid) { const ev = active(); if (ev && status(ev, uid).done) await finish(ev, uid); }

// ---------- tracking ----------
async function onMessage(m) {
  if (m.author.bot || !m.guild || (m.channelId !== CH.hai && m.channelId !== CH.feedback)) return;
  const ev = active(); if (!ev || m.guildId !== ev.guild_id) return;
  const p = prog(ev, m.author.id);
  if (m.channelId === CH.hai) {
    if (!/^\s*hai+\b/i.test(m.content) || p.hai_at) return;
    run('UPDATE event_progress SET hai_at=?, hai_url=? WHERE event_id=? AND user_id=?', Date.now(), m.url, ev.id, m.author.id);
    m.react('👋').catch(() => {});
  } else {
    if (p.fb_at) return;
    const text = m.content.trim();
    if (text.length < EV.feedbackMinChars) { const r = await m.reply(`✍️ Please write at least **${EV.feedbackMinChars} characters** of feedback for it to count.`).catch(() => null); if (r) setTimeout(() => r.delete().catch(() => {}), 8000); return; }
    run('UPDATE event_progress SET fb_at=?, fb_url=?, fb_text=? WHERE event_id=? AND user_id=?', Date.now(), m.url, trunc(text, 300), ev.id, m.author.id);
    m.react('💚').catch(() => {});
  }
  await check(m.author.id);
}
async function onJoin(member, inviter) {   // called by events/guild.js with the detected inviter
  try {
    const ev = active();
    if (!ev || member.guild.id !== ev.guild_id || member.user.bot || !inviter || inviter.bot || inviter.id === member.id) return;
    const r = run('INSERT OR IGNORE INTO event_invites(event_id,inviter_id,invitee_id,at) VALUES(?,?,?,?)', ev.id, inviter.id, member.id, Date.now());
    if (r.changes) await check(inviter.id);
  } catch (e) { console.error('[event:join]', e.message); }
}
function onLeave(member) { const ev = active(); if (ev && member.guild.id === ev.guild_id) run('UPDATE event_invites SET left=1 WHERE event_id=? AND invitee_id=?', ev.id, member.id); }

// voice: cumulative minutes inside the event VC
function schedule(evId, uid, ms) { clearTimeout(timers.get(uid)); timers.set(uid, setTimeout(() => tick(evId, uid).catch(e => console.error('[event:vc]', e.message)), Math.max(1000, ms) + 300)); }
function startVc(ev, uid) {
  const p = prog(ev, uid); if (p.vc_at || timers.has(uid)) return;
  run('UPDATE event_progress SET vc_since=? WHERE event_id=? AND user_id=?', Date.now(), ev.id, uid);
  schedule(ev.id, uid, EV.vcMs - p.vc_ms);
}
async function stopVc(ev, uid) {
  clearTimeout(timers.get(uid)); timers.delete(uid);
  const p = prog(ev, uid); if (!p.vc_since) return;
  const total = p.vc_ms + (Date.now() - p.vc_since), done = total >= EV.vcMs;
  run('UPDATE event_progress SET vc_ms=?, vc_since=NULL, vc_at=? WHERE event_id=? AND user_id=?', total, done ? Date.now() : null, ev.id, uid);
  if (done) await check(uid);
}
async function tick(evId, uid) {
  timers.delete(uid);
  const ev = active(); if (!ev || ev.id !== evId) return;
  const p = prog(ev, uid); if (!p.vc_since) return;
  const inVc = C.guilds.cache.get(ev.guild_id)?.voiceStates.cache.get(uid)?.channelId === CH.vc;
  if (!inVc) return stopVc(ev, uid);
  const total = p.vc_ms + (Date.now() - p.vc_since);
  if (total >= EV.vcMs) { run('UPDATE event_progress SET vc_ms=?, vc_since=NULL, vc_at=? WHERE event_id=? AND user_id=?', total, Date.now(), ev.id, uid); return check(uid); }
  schedule(ev.id, uid, EV.vcMs - total);
}
function onVoice(o, n) {
  if (o.channelId !== CH.vc && n.channelId !== CH.vc) return;
  const ev = active(); if (!ev || n.guild.id !== ev.guild_id || n.member?.user.bot) return;
  const was = o.channelId === CH.vc, is = n.channelId === CH.vc;
  if (!was && is) startVc(ev, n.id); else if (was && !is) stopVc(ev, n.id).catch(e => console.error('[event:vc]', e.message));
}
function scanVc(ev) {   // people already sitting in the VC when the event starts / bot restarts
  C.guilds.cache.get(ev.guild_id)?.voiceStates.cache.filter(v => v.channelId === CH.vc && !v.member?.user.bot).forEach(v => startVc(ev, v.id));
}

// ---------- winner ----------
async function finish(ev, uid) {
  const r = run("UPDATE events SET status='ended', ended_at=?, winner_id=? WHERE id=? AND status='active'", Date.now(), uid, ev.id);
  if (!r.changes) return;   // someone else finished a split second earlier
  timers.forEach(t => clearTimeout(t)); timers.clear();
  const s = status({ ...ev }, uid), user = await C.users.fetch(uid).catch(() => null);
  const code = db.genCodes(EV.rewardTier, 'user', EV.rewardDays, 1, 'event')[0];
  run('UPDATE events SET winner_code=? WHERE id=?', code, ev.id);
  const days = EV.rewardDays, plan = cfg.premium.plans[EV.rewardTier].name;
  const dmOk = user ? await user.send({ embeds: [E.base().setTitle('🏆 You won the Zera Event!').setDescription(`Congratulations — you finished every task first! 🎉\nHere is your **${plan}** code (${days} days):\n\n\`\`\`\n${code}\n\`\`\`\n**How to use:** run \`/redeem code:${code}\` in any server.\n> • The code works **once** and cannot be reused.\n> • Each user can redeem **one code per 24 hours**.`).setFooter({ text: 'Zera Music • Event reward' })] }).then(() => true).catch(() => false) : false;
  run('UPDATE events SET dm_ok=? WHERE id=?', dmOk ? 1 : 0, ev.id);
  const p = s.p, invs = invList(ev, uid);
  const e = E.base().setTitle('🏆 Zera Event — We have a winner!').setThumbnail(user?.displayAvatarURL() ?? null)
    .setDescription(`${user ? `<@${uid}>` : `\`${uid}\``} was the **first** to complete every task and wins **${plan}** (${days} days)! 🎉\n⏱️ Finished **${dur(Date.now() - ev.started_at)}** after the event started.`)
    .addFields(
      { name: `✅ Invited ${EV.invitesNeeded} friends`, value: trunc(invs.slice(0, 10).map(i => `<@${i.invitee_id}> • ${ts(i.at, 'R')}`).join('\n'), 1024) || '—' },
      { name: '✅ Said hai', value: `<#${CH.hai}> • [message](${p.hai_url}) • ${ts(p.hai_at)}` },
      { name: '✅ Sent feedback', value: trunc(`<#${CH.feedback}> • [message](${p.fb_url}) • ${ts(p.fb_at)}\n> ${String(p.fb_text || '').replace(/\n+/g, ' ')}`, 1024) },
      { name: `✅ Joined voice for ${mmss(EV.vcMs)} min`, value: `<#${CH.vc}> • completed ${ts(p.vc_at)}` },
      { name: '🎁 Reward', value: dmOk ? `${plan} code sent to the winner’s DM ✅` : `Couldn’t DM the winner (DMs closed) ❌ — winner: run \`/event progress\` to get the code.` })
    .setFooter({ text: 'Event ended • Zera Music' }).setTimestamp();
  await L.post(C, CH.announce, { content: user ? `🎉 <@${uid}>` : undefined, embeds: [e], allowedMentions: { users: [uid] } });
  L.log(C, 'security', { embeds: [L.le('🏆 Event winner', `<@${uid}> (\`${uid}\`) completed the event • code \`${code}\` • DM ${dmOk ? 'sent' : '**failed**'}`)] });
}

// ---------- commands ----------
const taskLines = () => [`📨 Invite **${EV.invitesNeeded} friends** to the server`, `👋 Say **hai** in <#${CH.hai}>`, `💬 Send your **feedback** in <#${CH.feedback}> (min ${EV.feedbackMinChars} characters)`, `🎧 Join <#${CH.vc}> for **${mmss(EV.vcMs)} minutes**`].join('\n');

async function start(client, guild, user) {
  const ch = await client.channels.fetch(CH.announce).catch(() => null);
  if (!ch || ch.guildId !== guild.id) throw new UserError('Run `/event start` inside the server that has the event channels.');
  if (active()) throw new UserError('An event is already running. Use `/event stop` first.');
  const id = run("INSERT INTO events(guild_id,started_by,started_at,status) VALUES(?,?,?,'active')", guild.id, user.id, Date.now()).lastInsertRowid;
  scanVc(active());
  await L.post(client, CH.announce, { embeds: [E.base().setTitle('🎁 Zera Event has started!').setDescription(`Be the **first** to complete **all** the tasks and win **${cfg.premium.plans[EV.rewardTier].name}** (${EV.rewardDays} days)!\n\n${taskLines()}\n\n> Check your progress anytime with \`/event progress\`.\n> The reward code is sent to your **DM** — keep your DMs open!`).setFooter({ text: 'Zera Music • Event' }).setTimestamp()] });
  return E.ok(`Event **#${id}** started. Announcement posted in <#${CH.announce}>.`);
}
async function stop(client, user) {
  const ev = active(); if (!ev) throw new UserError('No event is running right now.');
  run("UPDATE events SET status='stopped', ended_at=? WHERE id=?", Date.now(), ev.id);
  timers.forEach(t => clearTimeout(t)); timers.clear();
  await L.post(client, CH.announce, { embeds: [E.base().setTitle('🛑 Zera Event ended').setDescription('The event was stopped by an admin. Thanks for joining! 💚').setTimestamp()] });
  return E.ok('Event stopped.');
}
function progress(uid) {
  const ev = active();
  if (!ev) {   // winner whose DMs were closed can still collect the code
    const w = one("SELECT winner_code FROM events WHERE winner_id=? AND status='ended' AND dm_ok=0 ORDER BY id DESC LIMIT 1", uid);
    if (w?.winner_code && !db.peekCode(w.winner_code)?.redeemed_by) return E.info('🏆 You won the event!', `Here is your **${cfg.premium.plans[EV.rewardTier].name}** code:\n\`\`\`\n${w.winner_code}\n\`\`\`\nRedeem it with \`/redeem code:${w.winner_code}\``);
    return E.info('🎁 Zera Event', 'No event is running right now. Stay tuned! 💚');
  }
  const s = status(ev, uid), c = ok => (ok ? '✅' : '⬜');
  return E.info('🎁 Your event progress', [
    `${c(s.invOk)} Invite **${EV.invitesNeeded} friends** — \`${Math.min(s.inv, EV.invitesNeeded)}/${EV.invitesNeeded}\``,
    `${c(s.haiOk)} Say **hai** in <#${CH.hai}>`,
    `${c(s.fbOk)} Send **feedback** in <#${CH.feedback}>`,
    `${c(!!s.p.vc_at)} Join <#${CH.vc}> for **${mmss(EV.vcMs)}** — \`${mmss(Math.min(s.vc, EV.vcMs))}/${mmss(EV.vcMs)}\``,
  ].join('\n') + '\n\n-# First to finish everything wins • reward code arrives in your DM');
}

function init(client) {
  C = client;
  client.on('messageCreate', m => onMessage(m).catch(e => console.error('[event:msg]', e.message)));
  client.on('voiceStateUpdate', onVoice);
  client.on('guildMemberRemove', onLeave);
  client.once('ready', () => { const ev = active(); if (!ev) return; run('UPDATE event_progress SET vc_since=NULL WHERE event_id=?', ev.id); scanVc(ev); });   // resume after a restart
}
module.exports = { init, start, stop, progress, onJoin };
