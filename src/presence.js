// Bot profile presence:
//  • "Playing" line with LIVE numbers:  {servers} Servers • {users} Users • {vc} In VC • Powered By Zera and AMC
//  • VR headset icon next to the bot (sent in the gateway IDENTIFY properties — an UNDOCUMENTED Discord trick)
const path = require('path');
const { ActivityType } = require('discord.js');
const cfg = require('./config');

// Rotating "Playing" texts. Placeholders: {servers} {users} {vc}.  Override with PLAYING_TEXTS in .env (separate texts with |)
const TEXTS = (process.env.PLAYING_TEXTS || '{servers} Servers | {users} Users | {vc} Voice Channels Joined | Powered By Zera and AMC').split('|').map(t => t.trim()).filter(Boolean);
const ROTATE_MS = Math.max(10, Number(process.env.PRESENCE_ROTATE_SECONDS || 15)) * 1000;   // Discord limits presence updates -> never below 10s

function applyVrIcon() {   // MUST run before client.login()
  if ((process.env.BOT_VR_ICON ?? 'true') === 'false') return;
  try {
    const ws = require(require.resolve('@discordjs/ws', { paths: [path.dirname(require.resolve('discord.js')), __dirname] }));
    Object.assign(ws.DefaultWebSocketManagerOptions.identifyProperties, { os: 'android', browser: 'Discord VR', device: 'Discord VR' });
    console.log('[presence] VR icon properties applied');
  } catch (e) { console.warn('[presence] could not apply the VR icon:', e.message); }
}

function stats(client) {
  const guilds = [...client.guilds.cache.values()];
  return {
    servers: guilds.length,
    users: guilds.reduce((a, g) => a + (g.memberCount || 0), 0),
    vc: guilds.filter(g => g.members.me?.voice?.channelId).length,   // voice channels the bot is joined in (same as the status panel)
  };
}
const render = (client, tpl) => {
  const st = stats(client), n = x => x.toLocaleString('en-US');
  return tpl.replace(/\{servers\}/gi, n(st.servers)).replace(/\{users\}/gi, n(st.users)).replace(/\{vc\}/gi, n(st.vc)).slice(0, 128);
};
let idx = 0;
const playingText = (client, i = idx) => render(client, TEXTS[i % TEXTS.length]);
let lastLogged = '';
function set(client) {
  if (!client.user) return;
  const text = playingText(client, idx++);   // next text in the rotation, numbers are read live
  // ONLY the Playing activity: Discord shows a Custom Status in front of it (member list / profile), which hid the Playing line.
  const activities = [{ name: text, type: ActivityType.Playing }];
  if (process.env.KEEP_CUSTOM_STATUS === 'true') activities.push({ name: 'Custom Status', type: ActivityType.Custom, state: cfg.statusText });
  client.user.setPresence({ status: 'online', activities });
  if (text !== lastLogged) { lastLogged = text; console.log(`[presence] Playing: ${text}`); }
}
function start(client) { set(client); setInterval(() => set(client), ROTATE_MS); }
module.exports = { start, applyVrIcon, playingText };
