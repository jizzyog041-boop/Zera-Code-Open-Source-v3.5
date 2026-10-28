// One filter at a time. Selecting the active one again clears it.
const eq = g => g.map((gain, band) => ({ band, gain }));
const fm = p => p.filterManager;
const PRESETS = {
  'bassboost-low':    { label: 'Bass Boost (Low)',    fn: p => fm(p).setEQ(eq([0.08, 0.08, 0.05, 0.03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])) },
  'bassboost-medium': { label: 'Bass Boost (Medium)', fn: p => fm(p).setEQ(eq([0.15, 0.14, 0.1, 0.06, 0.02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])) },
  'bassboost':        { label: 'Bass Boost (High)',   fn: p => fm(p).setEQ(eq([0.25, 0.22, 0.16, 0.1, 0.04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])) },
  'bassboost-extreme':{ label: 'Bass Boost (Extreme)',fn: p => fm(p).setEQ(eq([0.4, 0.34, 0.25, 0.15, 0.06, 0, -0.02, -0.03, 0, 0, 0, 0, 0, 0, 0])) },
  nightcore:  { label: 'Nightcore',  fn: p => fm(p).toggleNightcore() },
  vaporwave:  { label: 'Vaporwave',  fn: p => fm(p).toggleVaporwave() },
  '8d':       { label: '8D Audio',   fn: p => fm(p).toggleRotation(0.2) },
  karaoke:    { label: 'Karaoke',    fn: p => fm(p).toggleKaraoke() },
  tremolo:    { label: 'Tremolo',    fn: p => fm(p).toggleTremolo() },
  vibrato:    { label: 'Vibrato',    fn: p => fm(p).toggleVibrato() },
  lowpass:    { label: 'Low Pass',   fn: p => fm(p).toggleLowPass() },
  slowed:     { label: 'Slowed',     fn: async p => { await fm(p).setSpeed(0.85); await fm(p).setPitch(0.92); } },
  speedup:    { label: 'Sped Up',    fn: async p => { await fm(p).setSpeed(1.2); await fm(p).setPitch(1.08); } },
  daycore:    { label: 'Daycore',    fn: async p => { await fm(p).setSpeed(0.8); await fm(p).setPitch(0.8); } },
  chipmunk:   { label: 'Chipmunk',   fn: p => fm(p).setPitch(1.5) },
  deepvoice:  { label: 'Deep Voice', fn: p => fm(p).setPitch(0.7) },
  soft:       { label: 'Soft',       fn: p => fm(p).setEQ(eq([0, 0, 0, 0, 0, 0, 0, 0, -0.05, -0.1, -0.15, -0.2, -0.25, -0.3, -0.3])) },
  pop:        { label: 'Pop',        fn: p => fm(p).setEQ(eq([-0.02, 0.05, 0.1, 0.12, 0.1, 0.02, -0.02, -0.02, 0, 0.03, 0.05, 0.08, 0.1, 0.1, 0.1])) },
  rock:       { label: 'Rock',       fn: p => fm(p).setEQ(eq([0.15, 0.12, 0.08, 0.02, -0.04, -0.06, 0, 0.05, 0.1, 0.13, 0.15, 0.15, 0.15, 0.12, 0.1])) },
  electronic: { label: 'Electronic', fn: p => fm(p).setEQ(eq([0.14, 0.12, 0.05, 0, -0.06, 0.04, 0, 0.05, 0.1, 0.12, 0.14, 0.12, 0.1, 0.08, 0.08])) },
  treble:     { label: 'Treble Boost', fn: p => fm(p).setEQ(eq([0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.25, 0.25])) },
  classical:  { label: 'Classical',  fn: p => fm(p).setEQ(eq([0.1, 0.08, 0.05, 0.03, 0, 0, 0, 0.02, 0.05, 0.08, 0.1, 0.1, 0.08, 0.06, 0.05])) },
  jazz:       { label: 'Jazz',       fn: p => fm(p).setEQ(eq([0.05, 0.05, 0.03, 0.06, 0.08, 0.06, 0, 0, 0.03, 0.05, 0.07, 0.08, 0.08, 0.06, 0.05])) },
  vocal:      { label: 'Vocal Boost',fn: p => fm(p).setEQ(eq([-0.1, -0.08, -0.05, 0, 0.08, 0.14, 0.18, 0.18, 0.14, 0.08, 0, -0.03, -0.05, -0.05, -0.05])) },
  party:      { label: 'Party',      fn: p => fm(p).setEQ(eq([0.2, 0.16, 0.1, 0, -0.04, -0.04, 0, 0.05, 0.1, 0.14, 0.16, 0.16, 0.14, 0.12, 0.1])) },
  dancefx:    { label: 'Dance',      fn: p => fm(p).setEQ(eq([0.22, 0.18, 0.12, 0.04, 0, -0.03, 0, 0.04, 0.08, 0.1, 0.12, 0.1, 0.08, 0.05, 0.05])) },
  hiphop:     { label: 'Hip-Hop',    fn: p => fm(p).setEQ(eq([0.25, 0.2, 0.12, 0.06, 0.02, 0, 0.04, 0.02, 0.05, 0.06, 0.08, 0.06, 0.04, 0.03, 0.03])) },
  acoustic:   { label: 'Acoustic',   fn: p => fm(p).setEQ(eq([0.1, 0.08, 0.06, 0.04, 0.02, 0, 0.02, 0.04, 0.06, 0.06, 0.08, 0.1, 0.1, 0.08, 0.06])) },
  metal:      { label: 'Metal',      fn: p => fm(p).setEQ(eq([0.2, 0.15, 0.1, 0, -0.06, -0.08, 0, 0.08, 0.14, 0.18, 0.2, 0.2, 0.18, 0.15, 0.12])) },
  loudness:   { label: 'Loudness',   fn: p => fm(p).setEQ(eq([0.18, 0.15, 0.08, 0, -0.03, -0.03, 0, 0, 0, 0.04, 0.08, 0.12, 0.15, 0.15, 0.15])) },
  radioeq:    { label: 'Radio EQ',      fn: p => fm(p).setEQ(eq([-0.1, -0.05, 0, 0.08, 0.14, 0.14, 0.1, 0.08, 0.08, 0.06, 0.02, 0, -0.04, -0.06, -0.1])) },
  telephone:  { label: 'Telephone',  fn: p => fm(p).setEQ(eq([-0.25, -0.25, -0.25, -0.2, -0.05, 0.1, 0.2, 0.2, 0.1, -0.05, -0.2, -0.25, -0.25, -0.25, -0.25])) },
};
const label = p => (p.get('filter') ? PRESETS[p.get('filter')]?.label : null);
async function apply(player, key) {
  await fm(player).resetFilters();
  if (key === 'clear' || player.get('filter') === key) { player.set('filter', null); return null; }
  await PRESETS[key].fn(player); player.set('filter', key); return PRESETS[key].label;
}
module.exports = { PRESETS, apply, label };
