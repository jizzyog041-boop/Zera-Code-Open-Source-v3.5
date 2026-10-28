// Makes EVERY emoji in the bot animated: embeds, V2 text, replies, buttons and select-menu options.
const { EmbedBuilder, TextDisplayBuilder, ButtonBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const E = require('./emojis');
const MANUAL = { '✅': 'check', '❌': 'cross', '⚠': 'warn', '🎵': 'note', '🎶': 'eq', '💚': 'heart', '✨': 'sparkle', '🎧': 'headphones', '🔥': 'fire', '👑': 'crown', '🔔': 'bell', '⭐': 'star', '🔴': 'live', '🌊': 'wave', '💿': 'vinyl', '⏳': 'loading', '🎤': 'mic', '▶': 'b_play', '◀': 'b_prev', '🟢': 'green_dot', '🦋': 'butterfly', '🍃': 'leaf', '🌟': 'star' };
const clean = s => String(s).replace(/\uFE0F/g, '');
const keyFor = u => { u = clean(u); return MANUAL[u] || E.manifest[u] || null; };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ALL = [...new Set([...Object.keys(MANUAL), ...Object.keys(E.manifest)])].sort((a, b) => b.length - a.length);
const RX = new RegExp(`(${ALL.map(esc).join('|')})\\uFE0F?`, 'gu');
const deco = s => (typeof s === 'string' ? s.replace(RX, (m, k) => { const key = keyFor(k); return (key && E.em(key, true)) || m; }) : s);
const iconify = e => { if (typeof e !== 'string') return e; const key = keyFor(e); return (key && E.btn(key, null)) || e; };
const strip = s => (typeof s === 'string' ? s.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '').replace(/\s+/g, ' ').trim() : s);   // placeholders can't show custom emojis
const wrap = (proto, name, fn) => { const o = proto?.[name]; if (!o) return; proto[name] = function (...a) { return o.apply(this, fn(a)); }; };
const field = f => (f && typeof f === 'object' ? { ...f, name: deco(f.name), value: deco(f.value) } : f);
const opt = x => (Array.isArray(x) ? x.map(opt) : x && typeof x === 'object' && !x.toJSON && typeof x.emoji === 'string' ? { ...x, emoji: iconify(x.emoji) } : x);

wrap(EmbedBuilder.prototype, 'setTitle', a => [deco(a[0])]);
wrap(EmbedBuilder.prototype, 'setDescription', a => [deco(a[0])]);
wrap(EmbedBuilder.prototype, 'addFields', a => a.map(x => (Array.isArray(x) ? x.map(field) : field(x))));
wrap(TextDisplayBuilder.prototype, 'setContent', a => [deco(a[0])]);
wrap(ButtonBuilder.prototype, 'setEmoji', a => [iconify(a[0])]);
wrap(StringSelectMenuOptionBuilder?.prototype, 'setEmoji', a => [iconify(a[0])]);
wrap(StringSelectMenuBuilder.prototype, 'addOptions', a => a.map(opt));
wrap(StringSelectMenuBuilder.prototype, 'setOptions', a => a.map(opt));
wrap(StringSelectMenuBuilder.prototype, 'setPlaceholder', a => [strip(a[0])]);
module.exports = { deco, iconify };
