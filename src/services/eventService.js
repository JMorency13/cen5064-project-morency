const { v4: uuidv4 } = require('uuid');
const eventStore = require('../data/eventStore');
const { detectVenueConflict, validateEventFields } = require('../domain/eventValidation');

async function createEvent(eventData, organizerId) {
  const validation = validateEventFields(eventData);
  if (!validation.isValid) {
    const missingField = ['title', 'date', 'time', 'venue', 'capacity'].find((field) => (
      eventData == null || eventData[field] === undefined || eventData[field] === null || eventData[field] === ''
    ));
    return {
      success: false,
      data: null,
      error: missingField
        ? `Missing required field: ${missingField}`
        : validation.errors.join('; '),
      statusCode: 400
    };
  }

  const existingEvents = await eventStore.findAll();
  const conflict = detectVenueConflict(eventData, existingEvents);
  if (conflict.hasConflict) {
    return {
      success: false,
      data: null,
      error: conflict.message,
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