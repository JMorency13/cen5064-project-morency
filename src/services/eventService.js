const { v4: uuidv4 } = require('uuid');
const eventStore = require('../data/eventStore');

const requiredFields = ['title', 'date', 'time', 'venue', 'capacity'];

async function createEvent(eventData, organizerId) {
  const missingField = requiredFields.find((field) => {
    const value = eventData && eventData[field];
    return value === undefined || value === null || value === '';
  });

  if (missingField) {
    return {
      success: false,
      data: null,
      error: `Missing required field: ${missingField}`,
      statusCode: 400
    };
  }

  const existingEvents = await eventStore.findAll();
  const hasConflict = existingEvents.some((event) => (
    event.venue === eventData.venue &&
    event.date === eventData.date &&
    event.time === eventData.time
  ));

  if (hasConflict) {
    return {
      success: false,
      data: null,
      error: 'Venue is already booked for this date and time',
      statusCode: 409
    };
  }

  const event = {
    id: uuidv4(),
    title: eventData.title,
    date: eventData.date,
    time: eventData.time,
    venue: eventData.venue,
    capacity: eventData.capacity,
    createdBy: organizerId,
    createdAt: new Date().toISOString(),
    rsvps: [],
    status: 'open'
  };

  await eventStore.save(event);

  return {
    success: true,
    data: event,
    error: null,
    statusCode: 201
  };
}

module.exports = { createEvent };