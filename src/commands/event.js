const { def } = require('./registry');
const EV = require('../systems/event');
const { UserError } = require('../utils');

def({
  name: 'event', aliases: ['events'], category: 'Events', slash: true,
  description: 'Zera event — complete the tasks & win Zera Pro',
  subs: [{ name: 'start', desc: 'Admin: start the event' }, { name: 'stop', desc: 'Admin: stop the event' }, { name: 'progress', desc: 'See your event task progress' }],
  opts: [{ name: 'action', desc: 'start / stop / progress' }],
  run: async c => {
    const act = String(c.args[0] || 'progress').toLowerCase();
    if (act === 'progress') return c.reply({ embeds: [EV.progress(c.user.id)], ephemeral: true });
    if (act !== 'start' && act !== 'stop') throw new UserError('Use `/event start`, `/event stop` or `/event progress`.');
    if (!c.member.permissions.has('ManageGuild')) throw new UserError('Only admins (**Manage Server**) can start or stop the event.');
    return c.reply({ embeds: [act === 'start' ? await EV.start(c.client, c.guild, c.user) : await EV.stop(c.client, c.user)], ephemeral: true });
  },
});
