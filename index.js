const { Client, GatewayIntentBits: I, Partials: P } = require('discord.js');
const cfg = require('./src/config');
require('./src/decorate');   // animated-emoji patch for every embed / V2 text
if (!cfg.token) { console.error('Missing DISCORD_TOKEN in .env'); process.exit(1); }
require('./src/presence').applyVrIcon();   // VR headset icon (must be set before login)
const client = new Client({
  intents: [I.Guilds, I.GuildMembers, I.GuildMessages, I.MessageContent, I.GuildVoiceStates, I.GuildModeration, I.GuildInvites, I.GuildEmojisAndStickers, I.GuildMessageReactions],
  partials: [P.Message, P.Channel, P.Reaction, P.GuildMember, P.User],
  allowedMentions: { parse: ['users'], repliedUser: false },
});
require('./src/music/manager').init(client);
require('./src/events/core').init(client);
require('./src/events/guild').init(client);
require('./src/events/logs').init(client);
require('./src/systems/security').init(client);
require('./src/systems/event').init(client);   // /event giveaway
client.login(cfg.token);
