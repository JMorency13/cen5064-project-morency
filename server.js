const express = require('express');
const eventsRouter = require('./src/routes/events');

const app = express();
app.use(express.json());
app.use('/api/events', eventsRouter);

module.exports = app;
