const { def } = require('./registry');
const M = require('../music/manager'), F = require('../music/filters'), ui = require('../music/ui');
const { E, UserError } = require('../utils'), P = require('../premium');
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const C = 'Filters';
for (const [key, f] of Object.entries(F.PRESETS)) {
  def({
    name: key, category: C, description: `Toggle the ${f.label} filter`,
    run: async c => { const p = M.need(c, true); P.filterAllowed(key, c.guildId, c.user.id); const r = await F.apply(p, key); M.updateNP(p); return c.reply({ embeds: [E.ok(r ? `**${r}** filter enabled 🎛️` : `**${f.label}** filter disabled`)] }); },
  });
}
def({ name: 'filters', aliases: ['filter', 'fx'], category: C, slash: true, description: 'Pick an audio filter', run: c => {
  const p = M.need(c, true);
  const menu = new StringSelectMenuBuilder().setCustomId('np:filter').setPlaceholder('🎛️ Choose a filter').addOptions({ label: 'Clear all filters', value: 'clear', emoji: '❌' }, ...Object.entries(F.PRESETS).slice(0, 24).map(([k, v]) => ({ label: v.label, value: k })));
  return c.reply({ embeds: [E.info('🎛️ Audio Filters', `Current: **${F.label(p) || 'None'}**\nOne filter at a time. Pick again to turn it off.`)], components: [new ActionRowBuilder().addComponents(menu)] });
} });
def({ name: 'clearfilters', aliases: ['resetfilters', 'cf'], category: C, slash: true, description: 'Remove all filters', run: async c => { const p = M.need(c, true); await F.apply(p, 'clear'); M.updateNP(p); return c.reply({ embeds: [E.ok('All filters cleared.')] }); } });
const num = (n, d, min, max) => ({ name: n, type: 'number', desc: d, required: true, min, max });
def({ name: 'speed', category: C, slash: true, description: 'Set playback speed (0.5 - 2)', opts: [num('value', 'Speed 0.5-2', 0.5, 2)], run: async c => { const p = M.need(c, true), v = Number(c.args[0]); if (!(v >= 0.5 && v <= 2)) throw new UserError('Speed must be 0.5 - 2.'); await p.filterManager.setSpeed(v); return c.reply({ embeds: [E.ok(`Speed: **${v}x**`)] }); } });
def({ name: 'pitch', category: C, slash: true, description: 'Set pitch (0.5 - 2)', opts: [num('value', 'Pitch 0.5-2', 0.5, 2)], run: async c => { const p = M.need(c, true), v = Number(c.args[0]); if (!(v >= 0.5 && v <= 2)) throw new UserError('Pitch must be 0.5 - 2.'); await p.filterManager.setPitch(v); return c.reply({ embeds: [E.ok(`Pitch: **${v}x**`)] }); } });
def({ name: 'playbackrate', category: C, description: 'Set playback rate (0.5 - 2)', opts: [num('value', 'Rate 0.5-2', 0.5, 2)], run: async c => { const p = M.need(c, true), v = Number(c.args[0]); if (!(v >= 0.5 && v <= 2)) throw new UserError('Rate must be 0.5 - 2.'); await p.filterManager.setRate(v); return c.reply({ embeds: [E.ok(`Rate: **${v}x**`)] }); } });
