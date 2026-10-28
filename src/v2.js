// Components V2 helpers (discord.js >= 14.19). A V2 message has NO content/embeds — only components.
const { ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { AttachmentBuilder } = require('discord.js');
const path = require('path');
const cfg = require('./config');
const att = name => new AttachmentBuilder(path.join(__dirname, '..', 'assets', name), { name });
const td = s => new TextDisplayBuilder().setContent(String(s).slice(0, 3900));
const sep = (big = false) => new SeparatorBuilder().setDivider(true).setSpacing(big ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
const gallery = (...urls) => new MediaGalleryBuilder().addItems(urls.map(u => new MediaGalleryItemBuilder().setURL(u)));
const section = (text, thumb) => new SectionBuilder().addTextDisplayComponents(td(text)).setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb));
const box = (accent = cfg.color) => new ContainerBuilder().setAccentColor(accent);
const V2 = MessageFlags.IsComponentsV2, EPH = MessageFlags.Ephemeral;
const msg = (container, extra = {}) => { const { eph, ...rest } = extra; return { components: [container], flags: V2 | (eph ? EPH : 0), ...rest }; };
// quick "status" card (replacement for simple embeds when we want V2)
const note = (text, accent = cfg.color, extra = {}) => msg(box(accent).addTextDisplayComponents(td(text)), extra);
module.exports = { att, td, sep, gallery, section, box, msg, note, V2, EPH };
