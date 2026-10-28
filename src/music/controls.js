const M = require('./manager'), ui = require('./ui'), F = require('./filters'), db = require('../db'), P = require('../premium');
const { E } = require('../utils');
const fail = (i, m) => i.reply({ embeds: [E.err(m)], flags: 64 });
const refresh = async (i, player) => { await i.deferUpdate(); return i.editReply(await ui.npPayload(player)); };
async function np(i) {
  const player = M.lm.getPlayer(i.guildId);
  if (!player || !player.queue.current) return fail(i, 'Nothing is playing.');
  if (i.member.voice.channelId !== player.voiceChannelId) return fail(i, 'Join my voice channel to use the controls.');
  const act = i.customId.split(':')[1];
  if (!['queue', 'like', 'lyrics'].includes(act)) { try { M.djCheck(i); } catch (e) { return fail(i, e.message); } }
  try {
    switch (act) {
      case 'pause': player.paused ? await player.resume() : await player.pause(); return refresh(i, player);
      case 'skip': await i.deferUpdate(); return M.skip(player);
      case 'stop': await i.deferUpdate(); return player.destroy('stopped', true);
      case 'prev': {
        const prev = player.queue.previous?.[0]; if (!prev) return fail(i, 'No previous track.');
        const cur = player.queue.current; player.queue.splice(0, 0, prev); if (cur) player.queue.splice(1, 0, cur);
        await i.deferUpdate(); return player.skip();
      }
      case 'rew': case 'fwd': {
        if (player.queue.current.info.isStream) return fail(i, 'Can’t seek in a live stream.');
        const to = Math.max(0, Math.min(player.queue.current.info.duration - 1000, player.position + (act === 'fwd' ? 10000 : -10000)));
        await player.seek(to); return refresh(i, player);
      }
      case 'loop': { const n = { off: 'track', track: 'queue', queue: 'off' }[player.repeatMode] || 'off'; await player.setRepeatMode(n); return refresh(i, player); }
      case 'vup': case 'vdown': {
        const v = Math.max(0, Math.min(P.plan(i.guildId, i.user.id).volume, player.volume + (act === 'vup' ? 10 : -10)));
        await player.setVolume(v); db.guild(i.guildId).volume = v; return refresh(i, player);
      }
      case 'shuffle': await player.queue.shuffle(); return refresh(i, player);
      case 'auto': { const on = !player.get('autoplay'); player.set('autoplay', on); if (on) player.set('mood', null); return refresh(i, player); }
      case 'queue': return i.reply(ui.queuePayload(player, 0, true));
      case 'lyrics': { const t = player.queue.current.info; return i.reply({ embeds: [E.info('📖 Lyrics', `[Search lyrics for **${t.title.slice(0, 80)}**](https://genius.com/search?q=${encodeURIComponent(`${t.title} ${t.author}`)})`)], flags: 64 }); }
      case 'like': {
        const t = player.queue.current.info;
        if (!db.addFav(i.user.id, { title: t.title, author: t.author, uri: t.uri, duration: t.duration })) return fail(i, 'Already in your favorites.');
        return i.reply({ embeds: [E.ok(`Saved **${t.title.slice(0, 80)}** to your favorites.`)], flags: 64 });
      }
      case 'filter': try { P.filterAllowed(i.values[0], i.guildId, i.user.id); } catch (e) { return fail(i, e.message); } await i.deferUpdate(); await F.apply(player, i.values[0]); return i.editReply(await ui.npPayload(player));
    }
  } catch (e) { console.error('[np]', e); if (!i.replied && !i.deferred) return fail(i, e.message || 'Something went wrong.'); }
}
async function queuePage(i) {
  const player = M.lm.getPlayer(i.guildId);
  if (!player) return i.update({ embeds: [E.err('Queue is gone.')], components: [] });
  return i.update(ui.queuePayload(player, Number(i.customId.split(':')[1])));
}
module.exports = { np, queuePage };
