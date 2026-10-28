require('dotenv').config();
const [host, port] = (process.env.LAVALINK_URL || 'lavalink.nazha.online:443').split(':');
module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID || '1561599586190237796',
  prefix: process.env.PREFIX || 'z!',
  color: 0x3CFF79, dark: 0x121D17,
  companion: {   // per-server update system: every server starts on the legacy version until an admin presses Update
    name: 'Zera Companion', legacy: 'V1', current: 'V3.5',
    allow: ['update'],   // commands that still work while a server is on the legacy version
    whatsNew: [
      'Animated green butterfly emojis everywhere',
      'Live Now Playing image card + new icon buttons',
      'Mood-Based Autoplay (`/mood`) in 5 languages',
      'New Diva-style `/help` and Components V2 panels',
      'Premium: Plus / Pro / Next Gen with `/custombot`',
    ],
  },
  statusText: process.env.STATUS_TEXT || 'Zera Powered By Zera Support Team and AMC Hosting',   // bot profile status
  supportGuild: process.env.SUPPORT_GUILD_ID || '1538233552985133177',   // owner-only commands work ONLY in this server
  owners: (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
  links: {
    support: 'https://discord.gg/tXeDz3Q3',
    invite: 'https://discord.com/oauth2/authorize?client_id=1561599586190237796&permissions=8&integration_type=0&scope=bot',
  },
  premium: {   // edit prices/text freely — shown in /premium
    buyUrl: process.env.PREMIUM_URL || 'https://discord.gg/tXeDz3Q3',
    voteUrl: process.env.VOTE_URL || null,
    upiId: process.env.PREMIUM_UPI_ID || null,       // optional: shown inside premium buy tickets
    upiName: process.env.PREMIUM_UPI_NAME || null,   // optional: name on that UPI id
    skus: { [process.env.PREMIUM_SKU_PLUS || 'none1']: 'plus', [process.env.PREMIUM_SKU_PRO || 'none2']: 'pro', [process.env.PREMIUM_SKU_NEXTGEN || 'none3']: 'nextgen' },   // optional Discord App Subscriptions
    plans: {
      free: { name: 'Free',       price: '₹0',          queue: 100,  volume: 100, playlists: 5,  plTracks: 50 },
      plus: { name: 'Zera Plus',  price: '₹99 / month',  queue: 500,  volume: 150, playlists: 15, plTracks: 200 },
      pro:  { name: 'Zera Pro',   price: '₹199 / month', queue: 2000, volume: 150, playlists: 40, plTracks: 500 },
      nextgen: { name: 'Zera Next Gen', price: '₹399 / month', queue: 5000, volume: 200, playlists: 100, plTracks: 1000 },   // everything in Pro + /custombot (own bot name, avatar, banner & bio per server)
    },
  },
  event: {   // /event start|stop — finish every task first and win a Zera Pro code (DM)
    channels: { hai: '1561597390732136508', feedback: '1561597396641644637', vc: '1561597421228920912', announce: '1561597370217664512' },
    invitesNeeded: 5, vcMs: 3 * 60 * 1000, feedbackMinChars: 10,
    rewardTier: 'pro', rewardDays: Number(process.env.EVENT_REWARD_DAYS || 30),
  },
  lavalink: [{
    id: 'CrypteN', host, port: Number(port || 443),
    authorization: process.env.LAVALINK_PASSWORD || 'nazhafreelava',
    secure: (process.env.LAVALINK_SECURE ?? 'true') === 'true',
    retryAmount: 20, retryDelay: 5000,
  }],
  channels: {
    status: process.env.STATUS_CHANNEL_ID || '1561967886044762192',   // live bot status panel (one message, edited)
    dbCollect: process.env.DB_COLLECT_CHANNEL_ID || '1562018538787704883',   // owner-only "Collect All Database" panel
    restart: process.env.RESTART_PANEL_CHANNEL_ID || '1562081864909459516', // owner-only restart panel
    hostInfo: process.env.HOSTINFO_PANEL_CHANNEL_ID || '1562106847274602627', // owner-only host info panel
    premiumBuy: process.env.PREMIUM_BUY_CHANNEL_ID || '1562379011114410075', // premium buy panel + private purchase tickets
    welcome: '1561597367982104637', invite: '1561597372126199878', boosters: '1561597374139342938',
    verify: '1561597403256193064',
    panels: { staff: '1561597389389693029', support: '1561597401742188608', bug: '1561597399154171934' },
  },
  roles: { auto: '1561597336361115672', verified: process.env.VERIFIED_ROLE_ID || null, staff: process.env.STAFF_ROLE_ID || null },
  logs: {
    security: '1561597435003019264', nuke: '1561597436097462292', raid: '1561597437628645407',
    punish: '1561597439604170804', botAdd: '1561597425397796947', botKick: '1561597426773790782',
    play: '1561597428031819856', error: '1561597429235580931', prefix: '1561597431169421322',
    commands: '1561597433690198158', transcript: '1561597441969758341', joinleave: '1561597443970179142',
    channel: '1561597445451022457', role: '1561597446977618012', message: '1561597448877772821',
    voice: '1561597450253369385', moderation: '1561597453050839040', emoji: '1561597454963572806',
    timeout: '1561597456259616858', ban: '1561597457580822549', reaction: '1561597458684055595',
    tag: '1561597464157360208',
  },
};
