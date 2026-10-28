const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const cfg = require('../config');
const db = require('../db');
const C = { bg:'#121b16', card:'#1b2a22', gold:'#3cff79', gold2:'#8affb5', text:'#eaffef', muted:'#aecabc', green:'#61e6a7', red:'#ff7777' };
function state() { try { return JSON.parse(db.kvGet('restart_panel_state') || '{}'); } catch { return {}; } }
function save(s) { db.kvSet('restart_panel_state', JSON.stringify(s)); }
function image(s) {
  const c = createCanvas(1200, 620), x = c.getContext('2d');
  const g = x.createLinearGradient(0,0,1200,620); g.addColorStop(0,C.bg); g.addColorStop(1,'#20352a'); x.fillStyle=g; x.fillRect(0,0,1200,620);
  x.strokeStyle=C.gold; x.lineWidth=4; x.strokeRect(10,10,1180,600);
  x.fillStyle=C.gold; x.font='bold 48px sans-serif'; x.fillText('ZERA • CONTROL CENTER',52,82);
  x.fillStyle=C.muted; x.font='24px sans-serif'; x.fillText('Owner-only restart panel • database stays in place',54,122);
  x.fillStyle=C.card; x.beginPath(); x.roundRect(48,160,1104,130,20); x.fill();
  x.fillStyle=s.status==='restarting'?C.red:(s.status==='starting'?C.gold:C.green); x.beginPath(); x.arc(88,207,12,0,Math.PI*2); x.fill();
  x.fillStyle=C.text; x.font='bold 30px sans-serif'; x.fillText(`STATUS: ${(s.status||'online').toUpperCase()}`,116,218);
  x.fillStyle=C.muted; x.font='21px sans-serif'; x.fillText(`Last update: ${s.updated || 'Waiting for first startup'}`,78,258);
  x.fillStyle=C.gold2; x.font='bold 27px sans-serif'; x.fillText('RESTART LOG',54,345);
  const logs=(s.logs||['Bot started successfully.']).slice(-5);
  x.fillStyle=C.card; x.beginPath(); x.roundRect(48,370,1104,170,18); x.fill();
  x.font='22px sans-serif'; logs.forEach((line,i)=>{ x.fillStyle=i===logs.length-1?C.text:C.muted; x.fillText('› '+String(line).slice(0,100),76,410+i*27); });
  x.fillStyle=C.muted; x.font='18px sans-serif'; x.fillText('Zera Music Bot  •  persistent SQLite database  •  restart history saved',54,575);
  return c.toBuffer('image/png');
}
function payload(s) {
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('zerarestart:run').setLabel(s.status==='restarting'?'Restarting…':'Restart Bot').setEmoji('🔄').setStyle(ButtonStyle.Danger).setDisabled(s.status==='restarting'));
  return { content:'💚 **Zera Restart Panel** — only configured bot owners can restart Zera.', files:[new AttachmentBuilder(image(s),{name:'zera-restart-panel.png'})], components:[row], allowedMentions:{parse:[]} };
}
let lock=false;
async function ensurePanel(client) {
  const ch=await client.channels.fetch(cfg.channels.restart).catch(()=>null);
  if(!ch || !ch.isTextBased() || !ch.messages) { console.warn('[restart] restart panel channel unavailable:',cfg.channels.restart); return; }
  let s=state(); s.status='online'; s.updated=new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}); s.logs=[...(s.logs||[]),`Bot online: ${s.updated}`].slice(-5); save(s);
  let msg=null, id=db.kvGet('restart_panel_message'); if(id) msg=await ch.messages.fetch(id).catch(()=>null);
  if(!msg) {
    const recent=await ch.messages.fetch({limit:50}).catch(()=>null);
    const found=[...(recent?.values()||[])].filter(m=>m.author.id===client.user.id && m.content.includes('Zera Restart Panel')).sort((a,b)=>b.createdTimestamp-a.createdTimestamp);
    msg=found[0]||null; for(const extra of found.slice(1)) extra.delete().catch(()=>{});
  }
  if(msg) msg=await msg.edit(payload(s)).catch(()=>null);
  if(!msg) msg=await ch.send(payload(s));
  db.kvSet('restart_panel_message',msg.id);
}
async function handle(i,client) {
  if(!i.isButton() || i.customId!=='zerarestart:run') return false;
  if(!cfg.owners.includes(i.user.id)) { await i.reply({content:'⛔ This restart button is for configured bot owners only.',ephemeral:true}); return true; }
  if(lock) { await i.reply({content:'A restart is already in progress.',ephemeral:true}); return true; }
  lock=true;
  const now=new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
  const s=state(); s.status='restarting'; s.updated=now; s.logs=[...(s.logs||[]),`Restart requested by ${i.user.tag} (${now})`,'Saving restart state to SQLite…','Process will exit; hosting supervisor must start it again.'].slice(-5); save(s);
  await i.deferUpdate().catch(()=>{});
  const msg=await i.channel.messages.fetch(db.kvGet('restart_panel_message')).catch(()=>null);
  if(msg) await msg.edit(payload(s)).catch(()=>{});
  console.log(`[restart] owner ${i.user.tag} requested restart at ${now}`);
  setTimeout(()=>{ console.log('[restart] exiting cleanly; persistent DB path is unchanged'); process.exit(0); },1800);
  return true;
}
module.exports={ensurePanel,handle};
