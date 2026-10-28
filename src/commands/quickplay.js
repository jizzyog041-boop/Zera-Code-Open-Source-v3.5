// Data-driven quick-play commands: moods, languages, vibes (genres/activities), radios, artists.
const { def } = require('./registry');
const M = require('../music/manager'), mood = require('../music/mood');
const { slug } = require('../utils');

// --- moods (10) + mood x language (40) ---
for (const [k, m] of Object.entries(mood.MOODS)) {
  def({ name: `mood-${k}`, category: 'Mood', description: `${m.emoji} Autoplay ${m.label} songs (all languages)`, run: c => mood.start(c, k, 'all').then(() => c.reply({ embeds: [require('../utils').E.ok(`${m.emoji} **${m.label}** mood started — enjoy!`)] })) });
  for (const l of mood.REAL) def({ name: `mood-${k}-${l}`, category: 'Mood', description: `${m.emoji} ${m.label} + ${mood.LANGS[l].label} autoplay`, run: c => mood.start(c, k, l).then(() => c.reply({ embeds: [require('../utils').E.ok(`${m.emoji} **${m.label}** • ${mood.LANGS[l].emoji} **${mood.LANGS[l].label}** started!`)] })) });
}
// --- languages + trending (9) ---
for (const l of mood.REAL) {
  def({ name: `lang-${l}`, category: 'Mood', description: `Play popular ${mood.LANGS[l].label} songs`, run: c => M.play(c, `${mood.LANGS[l].tag} popular songs`, { many: 10, autoplay: true }) });
  def({ name: `trending-${l}`, category: 'Mood', description: `Trending ${mood.LANGS[l].label} songs`, run: c => M.play(c, `${mood.LANGS[l].tag} trending songs ${new Date().getFullYear()}`, { many: 10, autoplay: true }) });
}
def({ name: 'trending', category: 'Mood', description: 'Trending songs worldwide', run: c => M.play(c, `trending songs ${new Date().getFullYear()}`, { many: 10, autoplay: true }) });

// --- vibes: genres & activities ---
const VIBES = `pop rock hip-hop rap edm house techno trance dubstep drum-and-bass trap rnb soul jazz blues classical country folk metal punk indie alternative reggae reggaeton latin kpop jpop anime bollywood kollywood mollywood tollywood sufi ghazal qawwali carnatic devotional bhajan gospel acoustic instrumental piano guitar violin ambient chillhop synthwave phonk drill afrobeats disco funk 80s 90s 2000s 2010s oldies retro workout gym study sleep focus meditation yoga romantic wedding birthday roadtrip driving rain nature gaming cinematic soundtrack ost k-drama christmas nasheed onam-songs malayalam-folk tamil-gaana punjabi marathi bengali telugu kannada lofi-hiphop deep-house`.split(' ');
for (const v of VIBES) def({ name: `vibe-${v}`, category: 'Vibes', description: `Play ${v.replace(/-/g, ' ')} music`, run: c => M.play(c, `${v.replace(/-/g, ' ')} music playlist`, { many: 10, autoplay: true }) });

// --- radios ---
const RADIOS = `lofi chillhop jazz classical edm house pop rock hiphop kpop bollywood malayalam tamil hindi-retro english-hits 90s 80s country reggae ambient sleep study focus gaming workout party trending top40 acoustic piano synthwave techno trance dnb metal blues soul rnb latin anime devotional sufi carnatic`.split(' ');
for (const r of RADIOS) def({ name: `radio-${r}`, category: 'Radio', description: `24/7 ${r.replace(/-/g, ' ')} radio`, run: c => M.play(c, `${r.replace(/-/g, ' ')} radio 24/7 live`, { many: 3, autoplay: true }) });

// --- artists ---
const ARTISTS = [
  // Malayalam
  'Sushin Shyam', 'Vidyasagar', 'Gopi Sundar', 'Jakes Bejoy', 'Shaan Rahman', 'Sithara Krishnakumar', 'KS Chithra', 'KJ Yesudas', 'Vineeth Sreenivasan', 'Hesham Abdul Wahab', 'Bijibal', 'Ouseppachan', 'M Jayachandran', 'Rex Vijayan', 'Vishnu Vijay', 'Kailas Menon', 'Job Kurian', 'Haricharan', 'Najim Arshad', 'Vijay Yesudas',
  // Tamil
  'Anirudh Ravichander', 'AR Rahman', 'Yuvan Shankar Raja', 'Harris Jayaraj', 'Sid Sriram', 'Santhosh Narayanan', 'GV Prakash', 'Ilaiyaraaja', 'D Imman', 'Hiphop Tamizha', 'Sean Roldan', 'Vijay Antony', 'Sam CS', 'Dhee',
  // Hindi / Punjabi
  'Arijit Singh', 'Atif Aslam', 'Jubin Nautiyal', 'Badshah', 'Yo Yo Honey Singh', 'Neha Kakkar', 'Shreya Ghoshal', 'Sonu Nigam', 'KK', 'Kumar Sanu', 'Lata Mangeshkar', 'Kishore Kumar', 'Mohammed Rafi', 'Darshan Raval', 'B Praak', 'Pritam', 'Vishal Mishra', 'Armaan Malik', 'Diljit Dosanjh', 'Sidhu Moose Wala', 'AP Dhillon', 'Karan Aujla', 'Divine', 'Emiway Bantai', 'Raftaar',
  // English
  'Taylor Swift', 'The Weeknd', 'Ed Sheeran', 'Dua Lipa', 'Billie Eilish', 'Drake', 'Eminem', 'Post Malone', 'Justin Bieber', 'Ariana Grande', 'Bruno Mars', 'Coldplay', 'Imagine Dragons', 'Linkin Park', 'Maroon 5', 'Adele', 'Sia', 'Charlie Puth', 'Shawn Mendes', 'Harry Styles', 'Olivia Rodrigo', 'Travis Scott', 'Kendrick Lamar', 'Rihanna', 'Selena Gomez', 'Alan Walker', 'Martin Garrix', 'Marshmello', 'Calvin Harris', 'David Guetta', 'Kygo', 'Avicii', 'Queen', 'Michael Jackson', 'Arctic Monkeys', 'Sabrina Carpenter', 'Doja Cat', 'SZA', 'Lana Del Rey', 'Lewis Capaldi', 'Sam Smith',
  // K-pop
  'BTS', 'Blackpink', 'NewJeans', 'Stray Kids', 'IU',
];
for (const a of ARTISTS) def({ name: `artist-${slug(a)}`, category: 'Artists', description: `Play top songs by ${a}`, run: c => M.play(c, `${a} best songs`, { many: 10, autoplay: true }) });

// --- activity x language vibes (24) ---
for (const act of ['workout', 'study', 'sleep', 'romantic', 'party', 'devotional'])
  for (const l of mood.REAL) def({ name: `vibe-${act}-${l}`, category: 'Vibes', description: `${act} songs in ${mood.LANGS[l].label}`, run: c => M.play(c, `${mood.LANGS[l].tag} ${act} songs`, { many: 10, autoplay: true }) });
