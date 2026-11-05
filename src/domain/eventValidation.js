/**
 * Event validation and business rules enforcement.
 * Handles venue conflict detection and other domain-level constraints.
 */

/**
 * Converts time string (HH:MM) to minutes since midnight for comparison.
 * @param {string} time - Time in HH:MM format
 * @returns {number} Minutes since midnight
 */
function timeToMinutes(time) {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Calculates end time based on start time and duration.
 * Assumes all events are 1 hour long by default.
 * @param {string} time - Start time in HH:MM format
 * @param {number} durationMinutes - Event duration in minutes (default: 60)
 * @returns {number} End time in minutes since midnight
 */
function getEndTimeInMinutes(time, durationMinutes = 60) {
  return timeToMinutes(time) + durationMinutes;
}

/**
 * Checks if two time ranges overlap.
 * Events overlap if: event1.start < event2.end AND event2.start < event1.end
 * @param {number} start1 - Start time of event 1 (minutes since midnight)
 * @param {number} end1 - End time of event 1 (minutes since midnight)
 * @param {number} start2 - Start time of event 2 (minutes since midnight)
 * @param {number} end2 - End time of event 2 (minutes since midnight)
 * @returns {boolean} True if times overlap
 */
function timesOverlap(start1, end1, start2, end2) {
  return start1 < end2 && start2 < end1;
}

/**
 * Detects if a proposed event conflicts with existing events at the same venue.
 * Checks for overlapping time ranges, not just exact time matches.
 * Ignores cancelled events (they don't block the venue).
 *
 * @param {Object} proposedEvent - The event being created or updated
 * @param {Array<Object>} existingEvents - All other events currently in the store
 * @returns {Object} Conflict detection result
 */
function detectVenueConflict(proposedEvent, existingEvents) {
  const {
    date: proposedDate,
    time: proposedTime,
    venue: proposedVenue
  } = proposedEvent;

  if (!proposedDate || !proposedTime || !proposedVenue) {
    return { hasConflict: false };
  }

  const proposedStartTime = timeToMinutes(proposedTime);
  const proposedEndTime = getEndTimeInMinutes(proposedTime);

  const conflictingEvents = existingEvents.filter((event) => {
    if (event.status === 'cancelled') {
      return false;
    }
    return event.date === proposedDate && event.venue === proposedVenue;
  });

  for (const existingEvent of conflictingEvents) {
    const existingStartTime = timeToMinutes(existingEvent.time);
    const existingEndTime = getEndTimeInMinutes(existingEvent.time);

    if (timesOverlap(
      proposedStartTime,
      proposedEndTime,
      existingStartTime,
      existingEndTime
    )) {
      return {
        hasConflict: true,
        conflictingEvent: existingEvent,
        message: `Venue '${proposedVenue}' is already booked on ${proposedDate} from ${existingEvent.time} (conflicting with: "${existingEvent.title}"). Cannot schedule new event at ${proposedTime}.`
      };
    }
  }

  return { hasConflict: false };
}

/**
 * Validates all required event fields.
 * @param {Object} eventData - Event data to validate
 * @returns {Object} Validation result
 */
function validateEventFields(eventData) {
  const data = eventData || {};
  const errors = [];

  if (!data.title || typeof data.title !== 'string' || data.title.trim() === '') {
    errors.push('Title is required and must be a non-empty string');
  }

  if (!data.date || typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    errors.push('Date is required and must be in YYYY-MM-DD format');
  }

  if (!data.time || typeof data.time !== 'string' || !/^\d{2}:\d{2}$/.test(data.time)) {
    errors.push('Time is required and must be in HH:MM format');
  }

  if (!data.venue || typeof data.venue !== 'string' || data.venue.trim() === '') {
    errors.push('Venue is required and must be a non-empty string');
  }

  if (!Number.isInteger(data.capacity) || data.capacity <= 0) {
    errors.push('Capacity is required and must be a positive integer');
  }

  if (data.description !== undefined && typeof data.description !== 'string') {
    errors.push('Description must be a string');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

function validateRsvp(event, memberId) {
  const rsvps = Array.isArray(event.rsvps) ? event.rsvps : [];

  if (rsvps.includes(memberId)) {
    return {
      isValid: true,
      alreadyRsvpd: true,
      rsvps,
      status: event.status
    };
  }

  if (event.status !== 'open') {
    return {
      isValid: false,
      error: 'This event is not open for RSVP'
    };
  }

  if (rsvps.length >= event.capacity) {
    return {
      isValid: false,
      error: 'This event is at capacity'
    };
  }

  const updatedRsvps = [...rsvps, memberId];
  return {
    isValid: true,
    alreadyRsvpd: false,
    rsvps: updatedRsvps,
    status: updatedRsvps.length >= event.capacity ? 'full' : 'open'
  };
}

module.exports = {
  detectVenueConflict,
  validateEventFields,
  validateRsvp,
  timeToMinutes,
  getEndTimeInMinutes,
  timesOverlap
};