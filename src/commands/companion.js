const { def } = require('./registry');
const cfg = require('../config'), K = require('../systems/companion');
def({ name: 'update', aliases: ['companion'], category: 'Utility', slash: true, description: `Update Zera to ${cfg.companion.current}`,
  opts: [{ name: 'action', desc: 'owner only: reset (go back to the legacy version for testing)' }],
  run: async c => {
    if (c.args[0] === 'reset' && cfg.owners.includes(c.user.id)) { K.setVersion(c.guildId, false); return c.reply({ content: `🔁 This server is back on **${cfg.companion.name} ${cfg.companion.legacy}**.` }); }
    return c.reply(K.isUpdated(c.guildId) ? K.alreadyPanel() : K.legacyPanel());
  } });
