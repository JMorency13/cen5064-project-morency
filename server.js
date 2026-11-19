const path = require('path');
const express = require('express');
const eventsRouter = require('./src/routes/events');
const authRouter = require('./src/routes/auth');
const eventStore = require('./src/data/eventStore');
const eventStoreDb = require('./src/data/eventStoreDb');
const userStore = require('./src/data/userStore');
const userStoreDb = require('./src/data/userStoreDb');
const { initializeDatabase } = require('./src/data/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);

// Only listen if this file is run directly (not during tests)
if (require.main === module) {
  console.log('Using SQLite database storage');
  eventStoreDb.init(true);
  userStoreDb.init(true);

  app.listen(PORT, async () => {
    const url = `http://localhost:${PORT}`;
    console.log(`Server running on ${url}`);
    
    try {
      await initializeDatabase();
      console.log('✓ Database initialized and ready');
    } catch (error) {
      console.error('✗ Database initialization error:', error.message);
    }

    console.log('Opening browser...');
    try {
      const open = await import('open');
      await open.default(url);
    } catch (error) {
      console.log('Could not open browser automatically. Please open manually: ' + url);
    }
  });
} else {
  // For tests, initialize stores in memory (not database)
  eventStore.init();
  userStore.init();
}

module.exports = app;
