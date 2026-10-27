const { v4: uuidv4 } = require('uuid');
const { detectVenueConflict, validateEventFields } = require('../domain/eventValidation');

function buildValidationError(eventData, validation) {
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

function buildConflictError(conflict) {
  return {
    success: false,
    data: null,
    error: conflict.message,
    statusCode: 409
  };
}

function buildEventPayload(eventData, organizerId) {
  return {
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
}

function buildSuccessResponse(event) {
  return {
    success: true,
    data: event,
    error: null,
    statusCode: 201
  };
}

function createEventService({ eventStore }) {
  if (!eventStore || typeof eventStore.findAll !== 'function' || typeof eventStore.save !== 'function') {
    throw new Error('createEventService requires an eventStore with findAll() and save()');
  }

  async function validateAndCheckConflicts(eventData) {
    const validation = validateEventFields(eventData);
    if (!validation.isValid) {
      return buildValidationError(eventData, validation);
    }

    const existingEvents = await eventStore.findAll();
    const conflict = detectVenueConflict(eventData, existingEvents);
    if (conflict.hasConflict) {
      return buildConflictError(conflict);
    }

    return null;
  }

  async function createEvent(eventData, organizerId) {
    const precheckError = await validateAndCheckConflicts(eventData);
    if (precheckError) {
      return precheckError;
    }

    const event = buildEventPayload(eventData, organizerId);
    await eventStore.save(event);

    return buildSuccessResponse(event);
  }

  return {
    createEvent,
    validateAndCheckConflicts
  };
}

module.exports = {
  createEventService,
  buildValidationError,
  buildConflictError,
  buildEventPayload,
  buildSuccessResponse
};