const fs = require('fs');
const path = require('path');

const constructorToken = Symbol('EventStore constructor');

class EventStore {
  static #instance = null;

  static getInstance() {
    if (!EventStore.#instance) {
      EventStore.#instance = new EventStore(constructorToken);
    }
    return EventStore.#instance;
  }

  constructor(token) {
    if (token !== constructorToken) {
      throw new Error('Use EventStore.getInstance()');
    }

    this.events = [];
    this.filePath = null;
  }

  // Enables JSON-file persistence. Without it the store is memory-only (used by tests).
  init(file) {
    this.filePath = file;
    this.events.length = 0;
    if (fs.existsSync(this.filePath)) {
      this.events.push(...JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
    }
  }

  persist() {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.events, null, 2));
  }

  async findAll() {
    return this.events;
  }

  async save(event) {
    this.events.push(event);
    this.persist();
    return event;
  }

  async update(event) {
    const index = this.events.findIndex((savedEvent) => savedEvent.id === event.id);
    if (index === -1) return null;

    this.events[index] = event;
    this.persist();
    return event;
  }

  async clear() {
    this.events.length = 0;
    this.persist();
  }
}

const eventStore = EventStore.getInstance();
eventStore.getInstance = EventStore.getInstance;

module.exports = eventStore;