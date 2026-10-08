const path = require('path');
const express = require('express');
const eventsRouter = require('./src/routes/events');
const eventStore = require('./src/data/eventStore');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/events', eventsRouter);

// Only listen if this file is run directly (not during tests)
if (require.main === module) {
  eventStore.init(process.env.EVENTS_FILE || path.join(__dirname, 'data', 'events.json'));
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
