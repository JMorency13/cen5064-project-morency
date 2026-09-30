const express = require('express');
const eventsRouter = require('./src/routes/events');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api/events', eventsRouter);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;