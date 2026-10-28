const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const cfg = require('../config');
const db = require('../db');

const C = { bg:'#121b16', card:'#1b2a22', gold:'#3cff79', text:'#eaffef', muted:'#aecabc', green:'#61e6a7' };
function image() {
  const c = createCanvas(1200, 520), x = c.getContext('2d');
  const g = x.createLinearGradient(0,0,1200,520); g.addColorStop(0,C.bg); g.addColorStop(1,'#20352a');
  x.fillStyle=g; x.fillRect(0,0,1200,520); x.strokeStyle=C.gold; x.lineWidth=4; x.strokeRect(10,10,1180,500);
  x.fillStyle=C.gold; x.font='bold 48px sans-serif'; x.fillText('ZERA • HOST INFO',52,86);
  x.fillStyle=C.muted; x.font='24px sans-serif'; x.fillText('Private owner-only host credential recovery',54,128);
  x.fillStyle=C.card; x.beginPath(); x.roundRect(48,165,1104,170,20); x.fill();
  x.fillStyle=C.green; x.beginPath(); x.arc(85,213,12,0,Math.PI*2); x.fill();
  x.fillStyle=C.text; x.font='bold 30px sans-serif'; x.fillText('HOSTING DETAILS',112,223);
  x.fillStyle=C.muted; x.font='24px sans-serif'; x.fillText('AMC Cloud • Node 2 Asia IN Free',78,270);
  x.fillText('Use “Forgot Hostinfo” to view details privately.',78,310);
  x.fillStyle=C.gold; x.font='bold 22px sans-serif'; x.fillText('Only configured bot owners can view these details.',54,405);
  x.fillStyle=C.muted; x.font='18px sans-serif'; x.fillText('Credentials are sent ephemerally and are not posted publicly.',54,450);
  return c.toBuffer('image/png');
}
function payload() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('hostinfo:forgot').setLabel('Forgot Hostinfo').setEmoji('🔐').setStyle(ButtonStyle.Primary)
  );
  return { content:'💚 **Zera Host Info Panel** — only configured bot owners can view hosting details.', files:[new AttachmentBuilder(image(),{name:'zera-host-info.png'})], components:[row], allowedMentions:{parse:[]} };
}
async function ensurePanel(client) {
  const ch = await client.channels.fetch(cfg.channels.hostInfo).catch(()=>null);
  if (!ch || !ch.isTextBased() || !ch.messages) { console.warn('[hostinfo] panel channel unavailable:',cfg.channels.hostInfo); return; }
  let msg = null, id = db.kvGet('hostinfo_panel_message');
  if (id) msg = await ch.messages.fetch(id).catch(()=>null);
  if (!msg) {
    const recent = await ch.messages.fetch({limit:50}).catch(()=>null);
    const found = [...(recent?.values()||[])].filter(m=>m.author.id===client.user.id && m.content.includes('Zera Host Info Panel')).sort((a,b)=>b.createdTimestamp-a.createdTimestamp);
    msg = found[0] || null;
    for (const extra of found.slice(1)) extra.delete().catch(()=>{});
  }
  if (msg) msg = await msg.edit(payload()).catch(()=>null);
  if (!msg) msg = await ch.send(payload());
  db.kvSet('hostinfo_panel_message',msg.id);
}
async function handle(i) {
  if (!i.isButton() || i.customId !== 'hostinfo:forgot') return false;
  if (!cfg.owners.includes(i.user.id)) {
    await i.reply({content:'⛔ This button is for configured bot owners only.',ephemeral:true});
    return true;
  }
  const url = process.env.HOSTINFO_URL;
  const email = process.env.HOSTINFO_EMAIL;
  const password = process.env.HOSTINFO_PASSWORD;
  if (!url || !email || !password || password === 'SET_A_NEW_PASSWORD_HERE') {
    await i.reply({content:'⚠️ Host info is not configured yet. Set HOSTINFO_URL, HOSTINFO_EMAIL, and HOSTINFO_PASSWORD in the hosting environment variables, then restart Zera.',ephemeral:true});
    return true;
  }
  await i.reply({
    content:`🔐 **Private Host Info**\n**Host panel:** ${url}\n**Email:** ${email}\n**Password:** ||${password}||\n\nKeep these details private. If this message is shared accidentally, change your hosting password immediately.`,
    ephemeral:true,
    allowedMentions:{parse:[]}
  });
  return true;
}
module.exports = { ensurePanel, handle };
