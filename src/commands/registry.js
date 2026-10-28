const { ApplicationCommandOptionType: T, PermissionsBitField } = require('discord.js');
const cfg = require('../config'), db = require('../db'), L = require('../logger');
const { E, UserError, idOf, trunc } = require('../utils');
const { deco } = require('../decorate');

const commands = new Map(), aliases = new Map();
function def(c) {
  c.aliases ??= []; c.opts ??= []; c.category ??= 'Utility';
  if (commands.has(c.name)) throw new Error('duplicate command: ' + c.name);
  commands.set(c.name, c);
  for (const a of c.aliases) { if (aliases.has(a) || commands.has(a)) throw new Error('duplicate alias: ' + a); aliases.set(a, c.name); }
  return c;
}
const get = n => commands.get(n) || commands.get(aliases.get(n));
const TYPES = { string: T.String, integer: T.Integer, number: T.Number, boolean: T.Boolean, user: T.User, channel: T.Channel, role: T.Role, attachment: T.Attachment };

function slashPayloads(ownerOnly = false) {   // ownerOnly=true -> only owner commands (registered in the support server only)
  return [...commands.values()].filter(c => c.slash && !!c.owner === ownerOnly).map(c => ({
    name: c.name, description: trunc(c.description || c.name, 100),
    options: c.subs ? c.subs.map(x => ({ name: x.name, description: trunc(x.desc || x.name, 100), type: 1 })) : c.opts.map(o => ({ name: o.name, description: trunc(o.desc || o.name, 100), type: TYPES[o.type || 'string'], required: !!o.required, ...(o.choices ? { choices: o.choices.map(x => ({ name: x, value: x })) } : {}), ...(o.maxLen ? { max_length: o.maxLen } : {}), ...(o.min != null ? { min_value: o.min } : {}), ...(o.max != null ? { max_value: o.max } : {}) })),
  }));
}

class Ctx {
  constructor(client, { interaction, message, args, cmd }) {
    this.client = client; this.interaction = interaction; this.message = message; this.cmd = cmd;
    const s = interaction || message;
    this.guild = s.guild; this.guildId = s.guildId; this.channel = s.channel; this.member = s.member; this.user = interaction ? interaction.user : message.author;
    this.args = args || []; this._sent = false;
  }
  get isSlash() { return !!this.interaction; }
  arg(i) { return this.args[i]; }
  async defer() { if (this.interaction && !this.interaction.deferred && !this.interaction.replied) { await this.interaction.deferReply(); } else if (this.message && !this._typing) { this._typing = true; this.channel.sendTyping?.().catch(() => {}); } }
  async reply(p) {
    p = typeof p === 'string' ? { content: p } : { ...p };
    if (p.content) p.content = deco(p.content);
    const i = this.interaction;
    if (!i) { delete p.ephemeral; return this.message.reply({ allowedMentions: { repliedUser: false }, ...p }); }
    if (p.ephemeral) { p.flags = (p.flags || 0) | 64; delete p.ephemeral; }
    if (i.deferred && !this._sent) { this._sent = true; p.flags = (p.flags || 0) & 32768; if (!p.flags) delete p.flags; return i.editReply(p); }
    if (i.replied || this._sent) return i.followUp(p);
    this._sent = true; return i.reply(p);
  }
  async member_(i) { const id = idOf(this.args[i]); if (!id) return null; return this.guild.members.fetch(id).catch(() => null); }
  async target(i, fallbackSelf = true) { const m = await this.member_(i); if (m) return m; if (this.args[i]) throw new UserError('I couldn’t find that member.'); return fallbackSelf ? this.member : null; }
  async user_(i) { const id = idOf(this.args[i]); if (!id) return null; return this.client.users.fetch(id).catch(() => null); }
}
function parseArgs(cmd, tokens) {
  const out = [];
  cmd.opts.forEach((o, n) => {
    if (o.rest) out[n] = tokens.splice(0).join(' ') || undefined;
    else out[n] = tokens.shift();
  });
  return out;
}
function fromSlashArgs(cmd, i) { if (cmd.subs) return [i.options.getSubcommand(false) || undefined]; return cmd.opts.map(o => { if (o.type === 'attachment') return i.options.getAttachment(o.name) ?? undefined; const v = i.options.get(o.name)?.value; return v == null ? undefined : String(v); }); }

async function execute(ctx) {
  const c = ctx.cmd;
  try {
    if (await require('../systems/companion').gate(ctx)) return;   // server not updated yet -> show the Update panel
    if (c.owner && ctx.guildId !== cfg.supportGuild) throw new UserError('This command can only be used in the **Zera Support** server.');
    if (c.owner && !cfg.owners.includes(ctx.user.id)) throw new UserError('This command is only for the bot owner.');
    if (c.perm && !ctx.member.permissions.has(c.perm)) throw new UserError(`You need the **${new PermissionsBitField(c.perm).toArray().join(', ')}** permission.`);
    const need = c.opts.filter(o => o.required).length;
    if (ctx.args.filter(a => a != null).length < need) {
      const usage = c.opts.map(o => (o.required ? `<${o.name}>` : `[${o.name}]`)).join(' ');
      throw new UserError(`Usage: \`${db.guild(ctx.guildId).prefix || cfg.prefix}${c.name} ${usage}\``);
    }
    await c.run(ctx);
    L.log(ctx.client, 'commands', { embeds: [L.le('⌨️ Command Used', `**/${c.name}** by ${ctx.user.tag} (\`${ctx.user.id}\`)\n**Server:** ${ctx.guild?.name} (\`${ctx.guildId}\`)\n**Via:** ${ctx.isSlash ? 'slash' : 'prefix'}`)] });
  } catch (e) {
    if (e instanceof UserError) return ctx.reply({ embeds: [E.err(e.message)], ephemeral: true }).catch(() => {});
    console.error(`[cmd:${c.name}]`, e);
    L.log(ctx.client, 'error', { embeds: [L.le('❌ Command Error', `**/${c.name}** in ${ctx.guild?.name}\n\`\`\`${trunc(String(e.stack || e), 1500)}\`\`\``, 0xE5484D)] });
    ctx.reply({ embeds: [E.err('Something went wrong. The error was logged — please try again.')], ephemeral: true }).catch(() => {});
  }
}
module.exports = { def, get, commands, slashPayloads, Ctx, parseArgs, fromSlashArgs, execute };
