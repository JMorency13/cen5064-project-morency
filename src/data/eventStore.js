const fs = require('fs');
const path = require('path');

const events = [];
let filePath = null;

// Enables JSON-file persistence. Without it the store is memory-only (used by tests).
function init(file) {
  filePath = file;
  events.length = 0;
  if (fs.existsSync(filePath)) {
    events.push(...JSON.parse(fs.readFileSync(filePath, 'utf8')));
  }
}

function persist() {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(events, null, 2));
}

async function findAll() {
  return events;
}

async function save(event) {
  events.push(event);
  persist();
  return event;
}

async function clear() {
  events.length = 0;
  persist();
}

module.exports = {
  init,
  findAll,
  save,
  clear
};
