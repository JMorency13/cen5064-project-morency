const path = require('path');
const express = require('express');
const open = require('open');
const eventsRouter = require('./src/routes/events');
const authRouter = require('./src/routes/auth');
const eventStore = require('./src/data/eventStore');
const eventStoreDb = require('./src/data/eventStoreDb');
const userStore = require('./src/data/userStore');
const userStoreDb = require('./src/data/userStoreDb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);

// Only listen if this file is run directly (not during tests)
if (require.main === module) {
  const useDatabase = process.env.USE_DATABASE === 'true';

  if (useDatabase) {
    console.log('Using SQLite database storage');
    eventStoreDb.init(true);
    userStoreDb.init(true);
  } else {
    console.log('Using JSON file storage');
    eventStore.init(process.env.EVENTS_FILE || path.join(__dirname, 'data', 'events.json'));
    userStore.init(process.env.USERS_FILE || path.join(__dirname, 'data', 'users.json'));
    userStoreDb.init(false);
  }

  app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`Server running on ${url}`);
    console.log('Opening browser...');
    open(url);
  });
}

module.exports = app;
