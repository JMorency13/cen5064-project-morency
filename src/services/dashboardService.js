const eventStore = require('../data/eventStore');

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

/**
 * Retrieves and filters upcoming events based on user role and context.
 *
 * @param {string} userId - UUID of the requesting user.
 * @param {"member" | "organizer"} userRole - Role of the requesting user.
 * @param {Object} [options]
 * @param {string} [options.filterApplied=null] - Optional label of query filter applied.
 * @param {string} [options.referenceDate] - Override date for testing (YYYY-MM-DD).
 * @returns {Promise<{
 *   success: boolean,
 *   data?: {
 *     events: Array<Object>,
 *     totalCount: number,
 *     userRole: string,
 *     filterApplied: string | null
 *   },
 *   error?: string | null
 * }>}
 */
async function getUpcomingEvents(userId, userRole, options = {}) {
  try {
    const today = options.referenceDate || getTodayDateString();
    const allEvents = await eventStore.findAll();

    // 1. Date Filtering: keep only upcoming events (date >= today)
    const upcomingEvents = allEvents.filter((event) => event.date >= today);

    // 2. Role-based filtering
    let filteredEvents = [];

    if (userRole === 'organizer') {
      // Organizers see all events they created/manage
      filteredEvents = upcomingEvents.filter((event) => event.createdBy === userId);
    } else {
      // Default: Member view
      // Members see events they have RSVP'd to + all public upcoming events
      // (An event is public if it has not been cancelled)
      filteredEvents = upcomingEvents.filter((event) => {
        const isRsvpd = Array.isArray(event.rsvps) && event.rsvps.includes(userId);
        const isPublicUpcoming = event.status !== 'cancelled';
        return isRsvpd || isPublicUpcoming;
      });
    }

    // 3. Chronological sorting (earliest first: compare date, then start time)
    filteredEvents.sort((a, b) => {
      const dateComparison = a.date.localeCompare(b.date);
      if (dateComparison !== 0) {
        return dateComparison;
      }
      return (a.time || '').localeCompare(b.time || '');
    });

    // 4. Sanitize event shape (guarantee contract fields only)
    const sanitizedEvents = filteredEvents.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      time: e.time,
      venue: e.venue,
      capacity: e.capacity,
      createdBy: e.createdBy,
      createdAt: e.createdAt,
      rsvps: e.rsvps,
      status: e.status
    }));

    return {
      success: true,
      data: {
        events: sanitizedEvents,
        totalCount: sanitizedEvents.length,
        userRole: userRole || 'member',
        filterApplied: options.filterApplied || null
      },
      error: null
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err.message || 'Failed to retrieve events'
    };
  }
}

module.exports = {
  getUpcomingEvents,
  getTodayDateString
};
