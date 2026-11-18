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

function notificationsForRsvps(event, type, message, createdAt, details = {}) {
  return (event.rsvps || []).map((recipientId) => ({
    id: uuidv4(),
    type,
    eventId: event.id,
    recipientId,
    message,
    ...details,
    createdAt
  }));
}

function createEventService({ eventStore, userStore }) {
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
      updatedEvent.notifications.push(...notificationsForRsvps(
        event,
        'event_updated',
        `"${updatedEvent.title}" details changed: ${changedFields.join(', ')}.`,
        updatedEvent.updatedAt,
        { changedFields: [...changedFields] }
      ));
    }

    const savedEvent = await eventStore.update(updatedEvent);

    return {
      success: true,
      data: toPublicEvent(savedEvent),
      error: null,
      statusCode: 200
    };
  }

  async function cancelEvent(eventId, organizerId) {
    if (!organizerId) {
      return buildErrorResponse('Organizer ID is required', 401);
    }

    const events = await eventStore.findAll();
    const event = events.find((savedEvent) => savedEvent.id === eventId);
    if (!event) {
      return buildErrorResponse('Event not found', 404);
    }
    if (event.createdBy !== organizerId) {
      return buildErrorResponse('Only the event organizer can cancel this event', 403);
    }
    if (event.status === 'cancelled') {
      return { success: true, data: toPublicEvent(event), error: null, statusCode: 200 };
    }

    const updatedAt = new Date().toISOString();
    const updatedEvent = {
      ...event,
      status: 'cancelled',
      updatedAt,
      notifications: [
        ...(event.notifications || []),
        ...notificationsForRsvps(
          event,
          'event_cancelled',
          `"${event.title}" has been cancelled.`,
          updatedAt
        )
      ]
    };
    const savedEvent = await eventStore.update(updatedEvent);
    if (!savedEvent) {
      return buildErrorResponse('Event not found', 404);
    }
    return { success: true, data: toPublicEvent(savedEvent), error: null, statusCode: 200 };
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

  async function unRsvpForEvent(eventId, memberId) {
    if (!memberId) {
      return buildErrorResponse('Member ID is required', 401);
    }

    const events = await eventStore.findAll();
    const event = events.find((savedEvent) => savedEvent.id === eventId);

    if (!event) {
      return buildErrorResponse('Event not found', 404);
    }

    const rsvps = Array.isArray(event.rsvps) ? event.rsvps : [];
    if (!rsvps.includes(memberId)) {
      return buildErrorResponse('You have not RSVP\'d to this event', 400);
    }

    const updatedRsvps = rsvps.filter((id) => id !== memberId);
    const updatedEvent = {
      ...event,
      rsvps: updatedRsvps,
      status: updatedRsvps.length >= event.capacity ? 'full' : 'open'
    };
    const savedEvent = await eventStore.update(updatedEvent);

    if (!savedEvent) {
      return buildErrorResponse('Event not found', 404);
    }

    return buildRsvpSuccessResponse(savedEvent, 200);
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

  async function getEventAttendees(eventId, organizerId) {
    if (!organizerId) {
      return buildErrorResponse('Organizer ID is required', 401);
    }

    if (!eventId) {
      return buildErrorResponse('Event ID is required', 400);
    }

    const events = await eventStore.findAll();
    const event = events.find((savedEvent) => savedEvent.id === eventId);

    if (!event) {
      return buildErrorResponse('Event not found', 404);
    }

    if (event.createdBy !== organizerId) {
      return buildErrorResponse(
        'Only the event organizer can view attendees',
        403
      );
    }

    const attendeeIds = Array.isArray(event.rsvps) ? event.rsvps : [];
    
    // Resolve attendee IDs to names using userStore
    let attendees = [];
    if (userStore && typeof userStore.findByIdAsync === 'function') {
      // Use async method for database support
      attendees = await Promise.all(attendeeIds.map(async (id) => {
        const user = await userStore.findByIdAsync(id);
        return {
          id,
          name: user ? user.name : 'Unknown User'
        };
      }));
    } else if (userStore && typeof userStore.findById === 'function') {
      // Fallback to sync method for JSON store
      attendees = attendeeIds.map((id) => {
        const user = userStore.findById(id);
        return {
          id,
          name: user ? user.name : 'Unknown User'
        };
      });
    } else {
      attendees = attendeeIds.map((id) => ({
        id,
        name: 'Member'
      }));
    }

    // Sort by name
    attendees.sort((a, b) => a.name.localeCompare(b.name));

    return {
      success: true,
      data: {
        eventId: event.id,
        eventTitle: event.title,
        attendeeCount: attendees.length,
        capacity: event.capacity,
        attendees
      },
      error: null,
      statusCode: 200
    };
  }

  return {
    createEvent,
    updateEvent,
    cancelEvent,
    rsvpForEvent,
    unRsvpForEvent,
    getNotificationsForUser,
    getEventAttendees,
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