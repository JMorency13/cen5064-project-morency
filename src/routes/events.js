const express = require('express');
const router = express.Router();

const eventStore = require('../data/eventStore');
const eventStoreDb = require('../data/eventStoreDb');
const userStore = require('../data/userStore');
const userStoreDb = require('../data/userStoreDb');
const { createDashboardService } = require('../services/dashboardService');
const { createEventService } = require('../services/eventService');
const { authenticate, authorize } = require('../middleware/auth');

// Use database in production, JSON stores in tests
const isTest = process.env.NODE_ENV === 'test' || require.main !== module;
const activeEventStore = isTest ? eventStore : eventStoreDb;
const activeUserStore = isTest ? userStore : userStoreDb;

if (!isTest) {
  eventStoreDb.init(true);
  userStoreDb.init(true);
}

const dashboardService = createDashboardService({ eventStore: activeEventStore });
const eventService = createEventService({ eventStore: activeEventStore, userStore: activeUserStore });

// GET /api/events/notifications (Notifications for the signed-in member)
router.get('/notifications', authenticate, async (req, res) => {
  const userId = req.user.id;
  const result = await eventService.getNotificationsForUser(userId);
  return res.status(result.statusCode).json(result);
});

// GET /api/events/:id/attendees (Organizer views attendees by name)
router.get('/:id/attendees', authenticate, authorize('organizer'), async (req, res) => {
  const organizerId = req.user.id;
  const result = await eventService.getEventAttendees(req.params.id, organizerId);
  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    error: result.error
  });
});

// GET /api/events (Dashboard listing with role & upcoming filtering)
router.get('/', authenticate, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  const result = await dashboardService.getUpcomingEvents(userId, userRole, {
    filterApplied: null
  });

  if (!result.success) {
    return res.status(500).json(result);
  }

  return res.status(200).json(result);
});

// POST /api/events (Create event)
router.post('/', authenticate, authorize('organizer'), async (req, res) => {
  const organizerId = req.user.id;
  const result = await eventService.createEvent(req.body, organizerId);

  const responsePayload = {
    success: result.success,
    data: result.data,
    error: result.error
  };

  return res.status(result.statusCode).json(responsePayload);
});

// PUT /api/events/:id (Organizer updates event details)
router.put('/:id', authenticate, authorize('organizer'), async (req, res) => {
  const organizerId = req.user.id;
  const result = await eventService.updateEvent(
    req.params.id,
    req.body,
    organizerId
  );

  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    error: result.error
  });
});

router.post('/:id/cancel', authenticate, authorize('organizer'), async (req, res) => {
  try {
    const result = await eventService.cancelEvent(req.params.id, req.user.id);
    return res.status(result.statusCode).json({
      success: result.success,
      data: result.data,
      error: result.error
    });
  } catch (error) {
    console.error('Unable to cancel event:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Unable to cancel event. Please try again.'
    });
  }
});

router.post('/:id/rsvp', authenticate, authorize('member'), async (req, res) => {
  const result = await eventService.rsvpForEvent(req.params.id, req.user.id);
  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    error: result.error
  });
});

module.exports = router;