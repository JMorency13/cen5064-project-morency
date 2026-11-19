const path = require('path');
const express = require('express');

const eventStore = require('./src/data/eventStore');
const eventStoreDb = require('./src/data/eventStoreDb');
const userStore = require('./src/data/userStore');
const userStoreDb = require('./src/data/userStoreDb');
const { initializeDatabase } = require('./src/data/db');

// Set environment variable BEFORE requiring routes so they can check it
const isProduction = require.main === module;
if (isProduction) {
  process.env.USE_DATABASE = 'true';
  console.log('Using SQLite database storage');
  eventStoreDb.init(true);
  userStoreDb.init(true);
  console.log(`[Server] eventStoreDb.useDatabase set to: ${eventStoreDb.useDatabase}`);
}

// NOW require the routers AFTER stores are initialized
const eventsRouter = require('./src/routes/events');
const authRouter = require('./src/routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);

// Only listen if this file is run directly (not during tests)
if (require.main === module) {
  app.listen(PORT, async () => {
    const url = `http://localhost:${PORT}`;
    console.log(`Server running on ${url}`);
    
    try {
      await initializeDatabase();
      console.log('✓ Database initialized and ready');
      
      // Seed demo users after database is initialized
      const { seedDemoUsersAsync } = require('./src/data/userStoreDb');
      await seedDemoUsersAsync();
      console.log('✓ Demo users seeded');
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
