const events = [];

async function findAll() {
  return events;
}

async function save(event) {
  events.push(event);
  return event;
}

async function clear() {
  events.length = 0;
}

module.exports = {
  findAll,
  save,
  clear
};
