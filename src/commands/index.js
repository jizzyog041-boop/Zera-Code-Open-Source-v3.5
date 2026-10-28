['music', 'mood-cmd', 'filters', 'quickplay', 'playlists', 'settings', 'utility', 'moderation', 'fun', 'premium', 'custombot', 'event', 'companion', 'help'].forEach(f => require('./' + f));
module.exports = require('./registry');
