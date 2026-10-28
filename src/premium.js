const cfg = require('./config'), db = require('./db');
const { UserError } = require('./utils');
const RANK = { free: 0, plus: 1, pro: 2, nextgen: 3 };
const PLANS = cfg.premium.plans;
const PREMIUM_FILTERS = new Set(['bassboost-extreme', '8d', 'daycore', 'deepvoice', 'chipmunk', 'telephone', 'metal', 'loudness']);
let client = null;
const attach = c => { client = c; };
function entTier(guildId, userId) {      // optional: Discord App Subscriptions (entitlements)
  try {
    let best = 'free';
    for (const e of client?.application?.entitlements?.cache?.values() || []) {
      if (!e.isActive?.()) continue; const t = cfg.premium.skus[e.skuId]; if (!t) continue;
      if ((e.guildId && e.guildId === guildId) || (e.userId && e.userId === userId)) if (RANK[t] > RANK[best]) best = t;
    }
    return best;
  } catch { return 'free'; }
}
function tierOf(guildId, userId) {
  const g = (guildId && db.getPremium('guild', guildId)?.tier) || 'free', u = (userId && db.getPremium('user', userId)?.tier) || 'free';
  return [g, u, entTier(guildId, userId)].reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'free');
}
const plan = (g, u) => PLANS[tierOf(g, u)];
const rank = (g, u) => RANK[tierOf(g, u)];
const isPremium = (g, u) => rank(g, u) > 0;
function need(g, u, minTier, feature) {
  if (rank(g, u) < RANK[minTier]) throw new UserError(`**${feature}** needs **${PLANS[minTier].name}**. Run \`/premium\` to see the plans 💎`);
}
const filterAllowed = (key, g, u) => { if (PREMIUM_FILTERS.has(key)) need(g, u, 'plus', `The ${key} filter`); };
const fmtExp = r => (!r ? '—' : r.expires_at ? `<t:${Math.floor(r.expires_at / 1000)}:R>` : '**Lifetime**');
module.exports = { attach, tierOf, plan, rank, isPremium, need, filterAllowed, PLANS, PREMIUM_FILTERS, RANK, fmtExp };
