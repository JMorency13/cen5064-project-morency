/**
 * Returns today's date formatted as YYYY-MM-DD in local time.
 */
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function filterUpcomingEvents(events, today) {
  return events.filter((event) => event.date >= today);
}

/**
 * Role strategies (OCP): add a new role by adding a new strategy here,
 * without changing filterEventsByRole control flow.
 */
function organizerRoleStrategy(events, userId) {
  return events.filter((event) => event.createdBy === userId);
}

function memberRoleStrategy(events, userId) {
  return events.filter((event) => {
    const isRsvpd = Array.isArray(event.rsvps) && event.rsvps.includes(userId);
    const isPublicUpcoming = event.status !== 'cancelled';
    return isRsvpd || isPublicUpcoming;
  });
}

const roleStrategies = {
  organizer: organizerRoleStrategy,
  member: memberRoleStrategy
};

function filterEventsByRole(events, userId, userRole) {
  const normalizedRole = (userRole || 'member').toLowerCase();
  const strategy = roleStrategies[normalizedRole] || roleStrategies.member;
  return strategy(events, userId);
}

function sortEventsChronologically(events) {
  return [...events].sort((a, b) => {
    const dateComparison = a.date.localeCompare(b.date);
    if (dateComparison !== 0) return dateComparison;
    return (a.time || '').localeCompare(b.time || '');
  });
}

function sanitizeEvents(events) {
  return events.map((event) => ({
    id: event.id,
    title: event.title,
    date: event.date,
    time: event.time,
    venue: event.venue,
    description: event.description || '',
    capacity: event.capacity,
    createdBy: event.createdBy,
    createdAt: event.createdAt,
    rsvps: event.rsvps,
    status: event.status
  }));
}

function buildSuccessResponse(events, userRole, filterApplied) {
  return {
    success: true,
    data: {
      events,
      totalCount: events.length,
      userRole: userRole || 'member',
      filterApplied: filterApplied || null
    },
    error: null
  };
}

function buildErrorResponse(err) {
  return {
    success: false,
    data: null,
    error: err.message || 'Failed to retrieve events'
  };
}

function createDashboardService({ eventStore }) {
  if (!eventStore || typeof eventStore.findAll !== 'function') {
    throw new Error('createDashboardService requires an eventStore with findAll()');
  }

  async function getUpcomingEvents(userId, userRole, options = {}) {
    try {
      const today = options.referenceDate || getTodayDateString();
      const allEvents = await eventStore.findAll();

      const upcomingEvents = filterUpcomingEvents(allEvents, today);
      const roleFilteredEvents = filterEventsByRole(
        upcomingEvents,
        userId,
        userRole
      );
      const sortedEvents = sortEventsChronologically(roleFilteredEvents);
      const sanitizedEvents = sanitizeEvents(sortedEvents);

      return buildSuccessResponse(
        sanitizedEvents,
        userRole,
        options.filterApplied
      );
    } catch (err) {
      return buildErrorResponse(err);
    }
  }

  return {
    getUpcomingEvents
  };
}

module.exports = {
  createDashboardService,
  getTodayDateString,
  filterUpcomingEvents,
  filterEventsByRole,
  sortEventsChronologically,
  sanitizeEvents,
  buildSuccessResponse,
  buildErrorResponse,
  roleStrategies,
  organizerRoleStrategy,
  memberRoleStrategy
};