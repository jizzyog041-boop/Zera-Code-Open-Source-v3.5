const store = new Map(), afk = new Map();
module.exports = { set: (id, v) => store.set(id, v), get: id => store.get(id), afk };
