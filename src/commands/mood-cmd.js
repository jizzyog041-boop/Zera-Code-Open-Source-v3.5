const { def } = require('./registry');
const mood = require('../music/mood');
def({ name: 'mood', aliases: ['vibe'], category: 'Mood', slash: true, description: 'Open the Mood-Based Autoplay panel', run: c => c.reply(mood.panel(c.guildId)) });
