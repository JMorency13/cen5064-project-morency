const { v4: uuidv4 } = require('uuid');
const {
  detectVenueConflict,
  validateEventFields,
  validateRsvp
} = require('../domain/eventValidation');

function buildValidationError(eventData, validation) {
  const missingField = ['title', 'date', 'time', 'venue', 'capacity'].find((field) => (
    eventData == null
    || eventData[field] === undefined
    || eventData[field] === null
    || eventData[field] === ''
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

function buildErrorResponse(error, statusCode) {
  return {
    success: false,
    data: null,
    error,
    statusCode
  };
}

function buildEventPayload(eventData, organizerId) {
  return {
    id: uuidv4(),
    title: eventData.title,
    date: eventData.date,
    time: eventData.time,
    venue: eventData.venue,
    description: eventData.description || '',
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

function toPublicEvent(event) {
  const { notifications, ...publicEvent } = event;
  return publicEvent;
}

function buildRsvpSuccessResponse(event, statusCode) {
  return {
    success: true,
    data: toPublicEvent(event),
    error: null,
    statusCode
  };
}

function createEventService({ eventStore }) {
  if (
    !eventStore
    || typeof eventStore.findAll !== 'function'
    || typeof eventStore.save !== 'function'
    || typeof eventStore.update !== 'function'
  ) {
    throw new Error(
      'createEventService requires an eventStore with findAll(), save(), and update()'
    );
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

  async function updateEvent(eventId, updates, organizerId) {
    if (!organizerId) {
      return buildErrorResponse('Organizer ID is required', 401);
    }

    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return buildErrorResponse('Event updates must be a JSON object', 400);
    }

    const editableFields = [
      'title',
      'date',
      'time',
      'venue',
      'capacity',
      'description'
    ];
    const updateFields = Object.keys(updates);

    if (
      updateFields.length === 0
      || updateFields.some((field) => !editableFields.includes(field))
    ) {
      return buildErrorResponse(
        'Provide at least one valid event detail to update',
        400
      );
    }

    const events = await eventStore.findAll();
    const event = events.find((savedEvent) => savedEvent.id === eventId);

    if (!event) {
      return buildErrorResponse('Event not found', 404);
    }

    if (event.createdBy !== organizerId) {
      return buildErrorResponse(
        'Only the event organizer can update this event',
        403
      );
    }

    const updatedEvent = { ...event, ...updates };
    const validation = validateEventFields(updatedEvent);

    if (!validation.isValid) {
      return buildValidationError(updatedEvent, validation);
    }

    const rsvpCount = Array.isArray(event.rsvps) ? event.rsvps.length : 0;
    if (updatedEvent.capacity < rsvpCount) {
      return buildErrorResponse(
        'Capacity cannot be lower than the current RSVP count',
        409
      );
    }

    if (updatedEvent.status !== 'cancelled') {
      updatedEvent.status = rsvpCount >= updatedEvent.capacity ? 'full' : 'open';
    }

    const otherEvents = events.filter((savedEvent) => savedEvent.id !== eventId);
    const conflict = detectVenueConflict(updatedEvent, otherEvents);

    if (conflict.hasConflict) {
      return buildConflictError(conflict);
    }

    const changedFields = editableFields.filter(
      (field) => event[field] !== updatedEvent[field]
    );
    updatedEvent.updatedAt = new Date().toISOString();
    updatedEvent.notifications = [...(event.notifications || [])];

    if (changedFields.length > 0) {
      for (const recipientId of event.rsvps || []) {
        updatedEvent.notifications.push({
          id: uuidv4(),
          type: 'event_updated',
          eventId,
          recipientId,
          message: `"${updatedEvent.title}" details changed: ${changedFields.join(', ')}.`,
          changedFields: [...changedFields],
          createdAt: updatedEvent.updatedAt
        });
      }
    }

    const savedEvent = await eventStore.update(updatedEvent);

    return {
      success: true,
      data: toPublicEvent(savedEvent),
      error: null,
      statusCode: 200
    };
  }

  async function rsvpForEvent(eventId, memberId) {
    if (!memberId) {
      return buildErrorResponse('Member ID is required', 401);
    }

    const events = await eventStore.findAll();
    const event = events.find((savedEvent) => savedEvent.id === eventId);

    if (!event) {
      return buildErrorResponse('Event not found', 404);
    }

    const rsvp = validateRsvp(event, memberId);
    if (!rsvp.isValid) {
      return buildErrorResponse(rsvp.error, 409);
    }

    if (rsvp.alreadyRsvpd) {
      return buildRsvpSuccessResponse(event, 200);
    }

    const updatedEvent = {
      ...event,
      rsvps: rsvp.rsvps,
      status: rsvp.status
    };
    const savedEvent = await eventStore.update(updatedEvent);

    if (!savedEvent) {
      return buildErrorResponse('Event not found', 404);
    }

    return buildRsvpSuccessResponse(savedEvent, 201);
  }

  async function getNotificationsForUser(userId) {
    if (!userId) {
      return buildErrorResponse('User ID is required', 400);
    }

    const events = await eventStore.findAll();
    const notifications = events.flatMap((event) => (
      (event.notifications || []).filter(
        (notification) => notification.recipientId === userId
      )
    ));

    return {
      success: true,
      data: notifications,
      error: null,
      statusCode: 200
    };
  }

  return {
    createEvent,
    updateEvent,
    rsvpForEvent,
    getNotificationsForUser,
    validateAndCheckConflicts
  };
}

module.exports = {
  createEventService,
  buildValidationError,
  buildConflictError,
  buildEventPayload,
  buildSuccessResponse,
  buildErrorResponse,
  buildRsvpSuccessResponse,
  toPublicEvent
};